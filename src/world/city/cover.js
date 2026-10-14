// ФАЙЛЫ: src/world/city/cover.js
/** Низкие укрытия у перекрёстков авеню и на набережной. Три InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CRATE_PATH = 'assets/models/kenney/survival-kit/box.glb';
export const WALL_PATH = 'assets/models/kenney/city-kit-roads/construction-barrier.glb';
export const BLOCK = { w: 1.6, d: 0.55, h: 1.1 };
export const WALL = { w: 2.2, d: 0.28, h: 1.0 };
export const CRATE = { w: 0.9, d: 0.9, h: 0.85 };

const EPS = 1e-4;
const BEACH_Z = 440;
const PROM_STEP = 40;
const SIDE_GAP = 2.2;
const HIDE = 0.001;
const BLOCK_HEX = 0x9aa3ab;
const WALL_HEX = 0x8a9299;
const CRATE_HEX = 0x8b6a45;

const dummy = new THREE.Object3D();

function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function inList(value, list) {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (near(value, list[i])) return true;
  }
  return false;
}

function widthOnAxis(value, avenues, streetW, avenueW) {
  return inList(value, avenues) ? avenueW : streetW;
}

function geoSize(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return {
    x: Math.max(0.001, b.max.x - b.min.x),
    y: Math.max(0.001, b.max.y - b.min.y),
    z: Math.max(0.001, b.max.z - b.min.z),
    minY: b.min.y,
  };
}

function sitOnGround(geo) {
  const s = geoSize(geo);
  geo.translate(0, -s.minY, 0);
}

function cloneMaterial(src) {
  const m = Array.isArray(src) ? src[0] : src;
  if (!m || typeof m.clone !== 'function') return null;
  return m.clone();
}

function extractKenney(gltf) {
  if (!gltf || !gltf.scene) return null;
  gltf.scene.updateMatrixWorld(true);
  const geos = [];
  let mat = null;
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const g = obj.geometry.clone();
    g.applyMatrix4(obj.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    geos.push(g);
    if (!mat) mat = cloneMaterial(obj.material);
  });
  if (!geos.length) return null;
  let geo = geos[0];
  if (geos.length > 1) {
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (merged) geo = merged;
  }
  if (mat && geo.attributes.color) mat.vertexColors = true;
  sitOnGround(geo);
  return { geo, mat };
}

async function tryLoadGlb(engine, path) {
  const assets = engine && engine.state && engine.state.assets;
  if (!assets || typeof assets.loadGLB !== 'function') return null;
  try {
    const gltf = await assets.loadGLB(path);
    return extractKenney(gltf);
  } catch (_err) {
    return null;
  }
}

function stdMat(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.82,
    metalness: 0.05,
  });
}

function onStreetX(x, xs, avenueXs, streetW, avenueW) {
  if (!xs) return false;
  for (let i = 0; i < xs.length; i++) {
    const half = widthOnAxis(xs[i], avenueXs, streetW, avenueW) * 0.5;
    if (Math.abs(x - xs[i]) < half) return true;
  }
  return false;
}

function pushUnique(out, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  if (z >= BEACH_Z) return;
  for (let i = 0; i < out.length; i++) {
    if (Math.abs(out[i].x - x) < 1.2 && Math.abs(out[i].z - z) < 1.2) return;
  }
  out.push({ x, z });
}

function collectPoints(layout) {
  const out = [];
  const grid = (layout && layout.grid) || {};
  const ocean = (layout && layout.ocean) || {};
  const streetW = grid.streetWidth != null ? grid.streetWidth : 12;
  const avenueW = grid.avenueWidth != null ? grid.avenueWidth : 22;
  const avenueXs = grid.avenueXs || [];
  const avenueZs = grid.avenueZs || [];
  const xs = grid.xs || [];
  const crosses = (layout && layout.intersections) || [];

  for (let i = 0; i < crosses.length; i++) {
    const c = crosses[i];
    if (!c || (!c.avenueX && !c.avenueZ)) continue;
    const wNS = widthOnAxis(c.x, avenueXs, streetW, avenueW);
    const wEW = widthOnAxis(c.z, avenueZs, streetW, avenueW);
    const ox = wNS * 0.5 + SIDE_GAP;
    const oz = wEW * 0.5 + SIDE_GAP;
    const sx = [1, 1, -1, -1];
    const sz = [1, -1, 1, -1];
    for (let k = 0; k < 4; k++) {
      pushUnique(out, c.x + sx[k] * ox, c.z + sz[k] * oz);
    }
  }

  const promenadeZ =
    ocean.promenadeZ != null && Number.isFinite(ocean.promenadeZ) ? ocean.promenadeZ : 400;
  const half = (layout && layout.half) || 600;
  const promOff = avenueW * 0.5 + SIDE_GAP;
  for (let x = -half; x <= half + 0.01; x += PROM_STEP) {
    if (onStreetX(x, xs, avenueXs, streetW, avenueW)) continue;
    pushUnique(out, x, promenadeZ - promOff);
    pushUnique(out, x, promenadeZ + promOff);
  }

  let extra = 0;
  while (out.length < 30 && extra < 80) {
    const x = -half + extra * 20;
    extra += 1;
    if (onStreetX(x, xs, avenueXs, streetW, avenueW)) continue;
    const side = extra % 2 === 0 ? -1 : 1;
    pushUnique(out, x, promenadeZ + side * (promOff + 1.6));
  }
  return out;
}

function typeSize(kind) {
  if (kind === 0) return BLOCK;
  if (kind === 1) return WALL;
  return CRATE;
}

function yawForPoint(kind, p, layout) {
  if (kind === 2) return (p.x * 0.07 + p.z * 0.03) % (Math.PI * 2);
  const grid = (layout && layout.grid) || {};
  const xs = grid.xs || [];
  let nearestX = 0;
  let best = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dx = Math.abs(p.x - xs[i]);
    if (dx < best) {
      best = dx;
      nearestX = xs[i];
    }
  }
  const alongZ = Math.abs(p.x - nearestX) < Math.abs(p.z - ((layout && layout.ocean && layout.ocean.promenadeZ) || 400));
  if (kind === 1) return alongZ ? 0 : Math.PI * 0.5;
  return alongZ ? Math.PI * 0.5 : 0;
}

function makeBoxGeo(size) {
  const geo = new THREE.BoxGeometry(size.w, size.h, size.d);
  sitOnGround(geo);
  return geo;
}

function scaleFor(geo, size) {
  const s = geoSize(geo);
  return {
    x: size.w / s.x,
    y: size.h / s.y,
    z: size.d / s.z,
  };
}

function fillMesh(mesh, pts, size, layout, kind, fromBox) {
  const n = pts.length;
  const sc = fromBox ? { x: 1, y: 1, z: 1 } : scaleFor(mesh.geometry, size);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, yawForPoint(kind, p, layout), 0);
    dummy.scale.set(sc.x, sc.y, sc.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  if (n === 0) {
    dummy.position.set(0, -20, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(HIDE, HIDE, HIDE);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = Math.max(1, n);
}

/**
 * 3 InstancedMesh в scene. Пишет только state.city.cover.
 * Нет city — не создавать city, cover не писать.
 * @returns {Promise<{ list: {x,z,w,d,h}[], meshes: object[] }>}
 */
export async function buildCover(engine, layout) {
  const points = collectPoints(layout);
  const buckets = [[], [], []];
  const list = [];
  for (let i = 0; i < points.length; i++) {
    const kind = i % 3;
    const p = points[i];
    const size = typeSize(kind);
    buckets[kind].push(p);
    list.push({ x: p.x, z: p.z, w: size.w, d: size.d, h: size.h });
  }

  const wallPack = await tryLoadGlb(engine, WALL_PATH);
  const cratePack = await tryLoadGlb(engine, CRATE_PATH);

  const packs = [
    { geo: makeBoxGeo(BLOCK), mat: stdMat(BLOCK_HEX), fromBox: true },
    {
      geo: wallPack ? wallPack.geo : makeBoxGeo(WALL),
      mat: wallPack && wallPack.mat ? wallPack.mat : stdMat(WALL_HEX),
      fromBox: !wallPack,
    },
    {
      geo: cratePack ? cratePack.geo : makeBoxGeo(CRATE),
      mat: cratePack && cratePack.mat ? cratePack.mat : stdMat(CRATE_HEX),
      fromBox: !cratePack,
    },
  ];

  const meshes = [];
  const scene = engine && engine.scene;
  for (let k = 0; k < 3; k++) {
    const pts = buckets[k];
    const pack = packs[k];
    const mesh = new THREE.InstancedMesh(pack.geo, pack.mat, Math.max(1, pts.length));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = k === 0 ? 'cover-block' : k === 1 ? 'cover-wall' : 'cover-crate';
    fillMesh(mesh, pts, typeSize(k), layout, k, pack.fromBox);
    if (scene) scene.add(mesh);
    meshes.push(mesh);
  }

  const city = engine && engine.state && engine.state.city;
  if (city) city.cover = list;

  return { list, meshes };
}

/** Кадровое обновление не нужно. */
export function updateCover(_dt, _engine) {}
