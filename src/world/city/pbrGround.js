// ФАЙЛЫ: src/world/city/pbrGround.js
// PBR грунт: асфальт, тротуар, песок, разметка. Воду не трогаем.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EPS = 0.05;
const ASPHALT_Y = 0.03;
const WALK_Y = 0.055;
const SAND_Y = 0.02;
const MARK_Y = 0.07;
const TILE_M = 8;
const COL_ASPHALT = 0x34343a;
const COL_WALK = 0xc9c4b8;
const COL_SAND = 0xf2deb0;
const COL_MARK = 0xeeeeee;
const DASH_LEN = 3;
const DASH_STEP = 7;
const DASH_W = 0.18;
const DASH_H = 0.03;
const STOP_GAP = 9;
const STOP_THICK = 0.45;
const CENTER_GAP = 0.28;

let cachedMats = { asphalt: null, walk: null, sand: null };
let asphaltMapsOk = false;
let asphaltMatLive = null;
let walkMatLive = null;

function hasValue(list, v) {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - v) < EPS) return true;
  }
  return false;
}

function widthForX(layout, x) {
  return hasValue(layout.grid.avenueXs, x) ? layout.grid.avenueWidth : layout.grid.streetWidth;
}

function widthForZ(layout, z) {
  return hasValue(layout.grid.avenueZs, z) ? layout.grid.avenueWidth : layout.grid.streetWidth;
}

function kindForX(layout, x) {
  return hasValue(layout.grid.avenueXs, x) ? 'avenue' : 'street';
}

function kindForZ(layout, z) {
  const promenadeZ = layout.ocean && layout.ocean.promenadeZ;
  if (typeof promenadeZ === 'number' && Math.abs(z - promenadeZ) < EPS) return 'promenade';
  return hasValue(layout.grid.avenueZs, z) ? 'avenue' : 'street';
}

function wrapMaps(tex) {
  if (!tex) return;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
}

function applyPbrMaps(mat, maps) {
  if (!maps) return false;
  let ok = false;
  if (maps.map) {
    wrapMaps(maps.map);
    maps.map.colorSpace = THREE.SRGBColorSpace;
    mat.map = maps.map;
    mat.color.setHex(0xffffff);
    ok = true;
  }
  if (maps.normalMap) {
    wrapMaps(maps.normalMap);
    mat.normalMap = maps.normalMap;
    ok = true;
  }
  const arm = maps.aoRoughnessMetalness;
  if (arm) {
    wrapMaps(arm);
    arm.colorSpace = THREE.NoColorSpace;
    mat.aoMap = arm;
    mat.roughnessMap = arm;
    mat.metalnessMap = arm;
    ok = true;
  }
  mat.needsUpdate = true;
  return ok;
}

function makeStd(color, roughness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    envMapIntensity: 0.15,
  });
}

async function tryLoadPBR(assets, name) {
  if (!assets || typeof assets.loadPBR !== 'function') return null;
  try {
    const maps = await assets.loadPBR(name);
    if (!maps) return null;
    return maps;
  } catch (_err) {
    return null;
  }
}

/**
 * Загружает PBR карт асфальта, тротуара и песка.
 * Нет assets / reject → процедурные цвета VISION, без throw.
 */
export async function loadGroundPBR(assets) {
  asphaltMapsOk = false;
  const asphalt = makeStd(COL_ASPHALT, 0.95);
  const walk = makeStd(COL_WALK, 0.9);
  const sand = makeStd(COL_SAND, 0.95);
  const [asphaltMaps, walkMaps, sandMaps] = await Promise.all([
    tryLoadPBR(assets, 'asphalt_02'),
    tryLoadPBR(assets, 'concrete_pavement'),
    tryLoadPBR(assets, 'coast_sand_01'),
  ]);
  asphaltMapsOk = applyPbrMaps(asphalt, asphaltMaps);
  applyPbrMaps(walk, walkMaps);
  applyPbrMaps(sand, sandMaps);
  cachedMats = { asphalt, walk, sand };
  return cachedMats;
}

/**
 * UV плоскости в метрах: повтор размер / tile, не растяжка 0..1.
 * Копирует uv → uv2 (aoMap).
 */
export function applyPlaneMeterUV(geometry, sx, sz, tile = 8) {
  const t = tile > 0 ? tile : TILE_M;
  const ru = Math.max(Number(sx) || 0, 0.001) / t;
  const rv = Math.max(Number(sz) || 0, 0.001) / t;
  const uv = geometry.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
    uv.needsUpdate = true;
    geometry.setAttribute('uv2', uv.clone());
  }
  return geometry;
}

function planePiece(x, y, z, sx, sz) {
  const geo = new THREE.PlaneGeometry(sx, sz);
  applyPlaneMeterUV(geo, sx, sz, TILE_M);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, y, z);
  return geo;
}

function mergeOrDummy(geos, y) {
  const list = geos.filter(Boolean);
  if (list.length === 0) {
    return planePiece(0, y, 0, 1, 1);
  }
  if (list.length === 1) return list[0];
  const merged = mergeGeometries(list, false);
  for (let i = 0; i < list.length; i++) list[i].dispose();
  return merged || planePiece(0, y, 0, 1, 1);
}

function addMesh(scene, geo, mat, yFallback) {
  const mesh = new THREE.Mesh(geo || planePiece(0, yFallback, 0, 1, 1), mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/**
 * Строит PBR-плоскости грунта и декали разметки. State не пишет.
 */
export function buildPbrGround(engine, layout) {
  const scene = engine.scene;
  const grid = (layout && layout.grid) || {};
  const xs = (grid.xs || []).slice().sort((a, b) => a - b);
  const zs = (grid.zs || []).slice().sort((a, b) => a - b);
  const xMin = xs.length ? xs[0] : -1;
  const xMax = xs.length ? xs[xs.length - 1] : 1;
  const zMin = zs.length ? zs[0] : -1;
  const zMax = zs.length ? zs[zs.length - 1] : 1;
  const sidewalkW = grid.sidewalk || 3.5;
  const spanX = Math.max(1, xMax - xMin);
  const spanZ = Math.max(1, zMax - zMin);

  const mats = {
    asphalt: cachedMats.asphalt || makeStd(COL_ASPHALT, 0.95),
    walk: cachedMats.walk || makeStd(COL_WALK, 0.9),
    sand: cachedMats.sand || makeStd(COL_SAND, 0.95),
  };
  asphaltMatLive = mats.asphalt;
  walkMatLive = mats.walk;

  const asphaltGeos = [];
  const walkGeos = [];
  const roads = [];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const width = widthForX(layout, x);
    const kind = kindForX(layout, x);
    roads.push({ x1: x, z1: zMin, x2: x, z2: zMax, width, kind });
  }
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const width = widthForZ(layout, z);
    const kind = kindForZ(layout, z);
    roads.push({ x1: xMin, z1: z, x2: xMax, z2: z, width, kind });
  }

  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    const ns = Math.abs(r.x2 - r.x1) < EPS;
    if (ns) {
      asphaltGeos.push(planePiece(r.x1, ASPHALT_Y, (r.z1 + r.z2) / 2, r.width, spanZ));
      const ox = r.width / 2 + sidewalkW / 2;
      walkGeos.push(planePiece(r.x1 - ox, WALK_Y, (r.z1 + r.z2) / 2, sidewalkW, spanZ));
      walkGeos.push(planePiece(r.x1 + ox, WALK_Y, (r.z1 + r.z2) / 2, sidewalkW, spanZ));
    } else {
      asphaltGeos.push(planePiece((r.x1 + r.x2) / 2, ASPHALT_Y, r.z1, spanX, r.width));
      const oz = r.width / 2 + sidewalkW / 2;
      walkGeos.push(planePiece((r.x1 + r.x2) / 2, WALK_Y, r.z1 - oz, spanX, sidewalkW));
      walkGeos.push(planePiece((r.x1 + r.x2) / 2, WALK_Y, r.z1 + oz, spanX, sidewalkW));
    }
  }

  const ocean = (layout && layout.ocean) || {};
  const beachZ0 = typeof ocean.beachZ0 === 'number' ? ocean.beachZ0 : 440;
  const beachZ1 = typeof ocean.beachZ1 === 'number' ? ocean.beachZ1 : 500;
  const half = layout && typeof layout.half === 'number' ? layout.half : 600;
  const sandWidth = Math.max(1400, half * 2 + 200);
  const sandDepth = Math.max(1, beachZ1 - beachZ0);
  const sandGeo = planePiece(0, SAND_Y, (beachZ0 + beachZ1) * 0.5, sandWidth, sandDepth);

  const asphaltMesh = addMesh(scene, mergeOrDummy(asphaltGeos, ASPHALT_Y), mats.asphalt, ASPHALT_Y);
  const walkMesh = addMesh(scene, mergeOrDummy(walkGeos, WALK_Y), mats.walk, WALK_Y);
  const sandMesh = addMesh(scene, sandGeo, mats.sand, SAND_Y);

  const dummy = new THREE.Object3D();
  const markMatrices = [];

  function pushBox(x, y, z, sx, sy, sz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    markMatrices.push(dummy.matrix.clone());
  }

  function dashesAlongZ(x, z0, z1, xOff) {
    const start = z0 + DASH_LEN * 0.5;
    const end = z1 - DASH_LEN * 0.5;
    for (let z = start; z <= end; z += DASH_STEP) {
      pushBox(x + xOff, MARK_Y, z, DASH_W, DASH_H, DASH_LEN);
    }
  }

  function dashesAlongX(z, x0, x1, zOff) {
    const start = x0 + DASH_LEN * 0.5;
    const end = x1 - DASH_LEN * 0.5;
    for (let x = start; x <= end; x += DASH_STEP) {
      pushBox(x, MARK_Y, z + zOff, DASH_LEN, DASH_H, DASH_W);
    }
  }

  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    const ns = Math.abs(r.x2 - r.x1) < EPS;
    const doubleLine = r.kind === 'avenue' || r.kind === 'promenade';
    if (ns) {
      if (doubleLine) {
        dashesAlongZ(r.x1, r.z1, r.z2, -CENTER_GAP);
        dashesAlongZ(r.x1, r.z1, r.z2, CENTER_GAP);
      } else {
        dashesAlongZ(r.x1, r.z1, r.z2, 0);
      }
    } else if (doubleLine) {
      dashesAlongX(r.z1, r.x1, r.x2, -CENTER_GAP);
      dashesAlongX(r.z1, r.x1, r.x2, CENTER_GAP);
    } else {
      dashesAlongX(r.z1, r.x1, r.x2, 0);
    }
  }

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (kindForX(layout, x) !== 'avenue') continue;
    const w = widthForX(layout, x);
    for (let j = 0; j < zs.length; j++) {
      const z = zs[j];
      const zA = z - STOP_GAP;
      const zB = z + STOP_GAP;
      if (zA > zMin + 1) pushBox(x, MARK_Y, zA, w - 1, DASH_H, STOP_THICK);
      if (zB < zMax - 1) pushBox(x, MARK_Y, zB, w - 1, DASH_H, STOP_THICK);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    if (kindForZ(layout, z) === 'street') continue;
    const w = widthForZ(layout, z);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const xA = x - STOP_GAP;
      const xB = x + STOP_GAP;
      if (xA > xMin + 1) pushBox(xA, MARK_Y, z, STOP_THICK, DASH_H, w - 1);
      if (xB < xMax - 1) pushBox(xB, MARK_Y, z, STOP_THICK, DASH_H, w - 1);
    }
  }

  const markMat = new THREE.MeshStandardMaterial({
    color: COL_MARK,
    roughness: 0.6,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const markCount = Math.max(1, markMatrices.length);
  const markMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), markMat, markCount);
  markMesh.receiveShadow = true;
  markMesh.frustumCulled = false;
  if (markMatrices.length === 0) {
    dummy.position.set(0, MARK_Y, 0);
    dummy.scale.set(0.01, 0.01, 0.01);
    dummy.updateMatrix();
    markMesh.setMatrixAt(0, dummy.matrix);
  } else {
    for (let i = 0; i < markMatrices.length; i++) {
      markMesh.setMatrixAt(i, markMatrices[i]);
    }
  }
  markMesh.instanceMatrix.needsUpdate = true;
  scene.add(markMesh);

  return {
    asphaltMesh,
    walkMesh,
    sandMesh,
    markMesh,
    usedAssets: asphaltMapsOk === true,
  };
}

/** Асфальт и тротуар для wetSurfaces. Песок не мочим. */
export function getGroundWetMats() {
  const out = [];
  if (asphaltMatLive) out.push(asphaltMatLive);
  if (walkMatLive) out.push(walkMatLive);
  return out;
}

/** Мокрость по state.weather.wet — wetSurfaces.js. */
export function updatePbrGround(_dt, _engine) {
  void _dt;
  void _engine;
}
