// Силуэты даунтауна: ступени, стекло, арт-деко, вертикальный неон.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFacadeArt } from './facadeArt.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const NEON_HEX = [0xff2fa0, 0x19f0ff, 0x9d4dff];
const INSET = 2;
const MIN_SIDE = 6;
const PILASTER = 1.15;
const TILE = 8;

const dummy = new THREE.Object3D();
const neonMats = [];
const windowMats = [];

function nightFactor(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 0;
  if (t >= 19.5 || t < 5) return 1;
  if (t >= 6 && t < 18.5) return 0;
  if (t >= 18.5) return t - 18.5;
  return 1 - (t - 5);
}

function boxMeterGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const faceRepeat = [
    [sz / TILE, sy / TILE],
    [sz / TILE, sy / TILE],
    [sx / TILE, sz / TILE],
    [sx / TILE, sz / TILE],
    [sx / TILE, sy / TILE],
    [sx / TILE, sy / TILE],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      uv.setXY(vi, uv.getX(vi) * faceRepeat[f][0], uv.getY(vi) * faceRepeat[f][1]);
    }
  }
  return g;
}

function addMerged(scene, items, mat, castShadow) {
  if (!items.length) return;
  const geos = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const g = boxMeterGeo(it.sx, it.sy, it.sz);
    g.translate(it.x, it.y, it.z);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (let i = 0; i < geos.length; i++) geos[i].dispose();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Высота из lot.id, без Math.random. */
function heightFromId(id, lo, hi, salt) {
  const n = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
  const u = n - Math.floor(n);
  return lo + u * (hi - lo);
}

function pushVolume(list, physics, minX, maxX, minZ, maxZ, y0, h) {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  if (sx < 0.4 || sz < 0.4 || h < 0.4) return;
  list.push({
    x: (minX + maxX) * 0.5,
    y: y0 + h * 0.5,
    z: (minZ + maxZ) * 0.5,
    sx,
    sy: h,
    sz,
  });
  physics.addBox({
    minX,
    maxX,
    minZ,
    maxZ,
    height: h,
    minY: y0,
    maxY: y0 + h,
  });
}

function fillInstanced(mesh, items) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x, it.y, it.z);
    dummy.scale.set(it.sx, it.sy, it.sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function cloneMaps(facade) {
  const map = facade.map.clone();
  map.needsUpdate = true;
  const emissiveMap = facade.emissiveMap.clone();
  emissiveMap.needsUpdate = true;
  return { map, emissiveMap };
}

function makeWindowMat(facade, metalness, roughness) {
  const maps = cloneMaps(facade);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness,
    roughness,
    map: maps.map,
    emissive: 0xfff2c8,
    emissiveMap: maps.emissiveMap,
    emissiveIntensity: 0,
  });
  windowMats.push(mat);
  return mat;
}

function addNeonStrip(neonLists, id, minX, maxX, minZ, maxZ, height) {
  const colorI = ((id % 3) + 3) % 3;
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  const stripW = 0.38;
  const stripD = 0.16;
  const h = height * 0.82;
  const y = h * 0.5 + height * 0.08;
  const face = id % 2;
  let x;
  let z;
  let wx;
  let wz;
  if (face === 0) {
    x = (minX + maxX) * 0.5;
    z = maxZ + stripD * 0.5 + 0.02;
    wx = Math.min(stripW, sx * 0.2);
    wz = stripD;
  } else {
    x = maxX + stripD * 0.5 + 0.02;
    z = (minZ + maxZ) * 0.5;
    wx = stripD;
    wz = Math.min(stripW, sz * 0.2);
  }
  neonLists[colorI].push({ x, y, z, sx: wx, sy: h, sz: wz });
}

export function buildSkyline(engine, layout) {
  neonMats.length = 0;
  windowMats.length = 0;
  const facades = createFacadeArt();
  const downtown = facades[2];
  const physics = engine.physics;
  const scene = engine.scene;
  const lots = (layout && layout.lots) || [];

  const stepVol = [];
  const glassVol = [];
  const decoVol = [];
  const pilVol = [];
  const neonLists = [[], [], []];

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.district !== 'downtown') continue;
    if (lot.cz >= 440) continue;
    const minX = lot.minX + INSET;
    const maxX = lot.maxX - INSET;
    const minZ = lot.minZ + INSET;
    const maxZ = lot.maxZ - INSET;
    if (maxX - minX < MIN_SIDE || maxZ - minZ < MIN_SIDE) continue;

    const kind = lot.id % 3;
    if (kind === 0) {
      const nTiers = lot.id % 2 === 0 ? 3 : 2;
      const H = heightFromId(lot.id, 48, 120, 3);
      const hTier = H / nTiers;
      let x0 = minX;
      let x1 = maxX;
      let z0 = minZ;
      let z1 = maxZ;
      let y0 = 0;
      for (let t = 0; t < nTiers; t++) {
        if (x1 - x0 < 4 || z1 - z0 < 4) break;
        pushVolume(stepVol, physics, x0, x1, z0, z1, y0, hTier);
        y0 += hTier;
        x0 += 4;
        x1 -= 4;
        z0 += 4;
        z1 -= 4;
      }
      addNeonStrip(neonLists, lot.id, minX, maxX, minZ, maxZ, H);
    } else if (kind === 1) {
      const H = heightFromId(lot.id, 48, 120, 5);
      pushVolume(glassVol, physics, minX, maxX, minZ, maxZ, 0, H);
      addNeonStrip(neonLists, lot.id, minX, maxX, minZ, maxZ, H);
    } else {
      const H = heightFromId(lot.id, 40, 80, 7);
      pushVolume(decoVol, physics, minX, maxX, minZ, maxZ, 0, H);
      const p = PILASTER;
      pushVolume(pilVol, physics, minX, minX + p, minZ, minZ + p, 0, H);
      pushVolume(pilVol, physics, maxX - p, maxX, minZ, minZ + p, 0, H);
      pushVolume(pilVol, physics, minX, minX + p, maxZ - p, maxZ, 0, H);
      pushVolume(pilVol, physics, maxX - p, maxX, maxZ - p, maxZ, 0, H);
      addNeonStrip(neonLists, lot.id, minX, maxX, minZ, maxZ, H);
    }
  }

  addMerged(scene, stepVol, makeWindowMat(downtown, 0.12, 0.55), true);
  addMerged(scene, glassVol, makeWindowMat(downtown, 0.6, 0.2), true);
  addMerged(scene, decoVol, makeWindowMat(downtown, 0.18, 0.45), true);
  addMerged(
    scene,
    pilVol,
    new THREE.MeshStandardMaterial({
      color: 0xffc4a3,
      metalness: 0.22,
      roughness: 0.4,
    }),
    true,
  );

  for (let c = 0; c < 3; c++) {
    const items = neonLists[c];
    const hex = NEON_HEX[c];
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: 0,
      metalness: 0.25,
      roughness: 0.35,
    });
    neonMats.push(mat);
    const count = Math.max(items.length, 1);
    const mesh = new THREE.InstancedMesh(unitBox, mat, count);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (items.length) fillInstanced(mesh, items);
    else {
      dummy.position.set(0, -50, 0);
      dummy.scale.set(0.01, 0.01, 0.01);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    scene.add(mesh);
  }
}

/** Материалы окон даунтауна (не неон). Сборщик регистрирует в windowNight. */
export function getSkylineWindowMats() {
  return windowMats;
}

export function updateSkyline(dt, engine) {
  void dt;
  const t = engine.state && engine.state.time;
  const f = nightFactor(t);
  const inten = 3 * f;
  for (let i = 0; i < neonMats.length; i++) {
    neonMats[i].emissiveIntensity = inten;
  }
}
