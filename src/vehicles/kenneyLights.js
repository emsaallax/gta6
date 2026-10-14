// ФАЙЛЫ: src/vehicles/kenneyPaint.js, src/vehicles/kenneyLights.js
// Фары, стопы и мигалка: Box-меши на корне. Без PointLight.

import * as THREE from 'three';

export const LIGHT_FAR = 60;
export const HEAD_NIGHT = 2.8;
export const BRAKE_ON = 3.0;
export const DAY_EMIT = 0.2;
export const SIREN_HZ = 4;
export const HEAD_COLOR = 0xfff2cc;
export const BRAKE_COLOR = 0x991111;
export const SIREN_RED = 0xff1a1a;
export const SIREN_BLUE = 0x2244ff;

const BOX_W = 0.18;
const BOX_H = 0.08;
const BOX_D = 0.06;

function isNight(time) {
  const t = Number(time);
  if (!Number.isFinite(t)) return false;
  return t < 6 || t >= 19.5;
}

function grab(root, name) {
  if (!root || typeof root.getObjectByName !== 'function') return null;
  return root.getObjectByName(name) || null;
}

function localBox(root) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  if (root.matrixWorld) inv.copy(root.matrixWorld).invert();
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    if (typeof ch.geometry.computeBoundingBox === 'function') ch.geometry.computeBoundingBox();
    const bb = ch.geometry.boundingBox;
    if (!bb) return;
    tmp.copy(bb);
    if (ch.matrixWorld) tmp.applyMatrix4(ch.matrixWorld);
    tmp.applyMatrix4(inv);
    box.union(tmp);
  });
  if (box.isEmpty()) {
    box.min.set(-0.93, 0, -2.2);
    box.max.set(0.93, 1.2, 2.2);
  }
  return box;
}

function makeLightMesh(name, hex) {
  const mat = new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: DAY_EMIT,
    roughness: 0.45,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function ensureLight(root, name, hex, x, y, z) {
  const existing = grab(root, name);
  if (existing && existing.isMesh) return existing;
  const mesh = makeLightMesh(name, hex);
  if (existing) {
    mesh.name = name;
    existing.add(mesh);
    mesh.position.set(0, 0, 0);
    return mesh;
  }
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function setEmit(obj, intensity) {
  if (!obj) return;
  const apply = (node) => {
    const mat = node && node.material;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && 'emissiveIntensity' in list[i]) list[i].emissiveIntensity = intensity;
    }
  };
  apply(obj);
  if (typeof obj.traverse === 'function') obj.traverse(apply);
}

function playerXZ(engine) {
  const st = engine && engine.state;
  const p = st && st.player;
  const pos = (p && p.position) || (p && p.object3d && p.object3d.position)
    || (st && st.cameraTarget && st.cameraTarget.position);
  return { x: pos && pos.x != null ? pos.x : 0, z: pos && pos.z != null ? pos.z : 0 };
}

export function setupKenneyLights(object3d, type) {
  if (!object3d) return;
  if (!object3d.userData) object3d.userData = {};
  if (object3d.userData.kenneyLights === true) return;

  const box = localBox(object3d);
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const y = box.min.y + height * 0.45;
  const xOff = width * 0.28;
  const zF = box.max.z;
  const zB = box.min.z;

  ensureLight(object3d, 'light_head_l', HEAD_COLOR, -xOff, y, zF);
  ensureLight(object3d, 'light_head_r', HEAD_COLOR, xOff, y, zF);
  ensureLight(object3d, 'light_brake_l', BRAKE_COLOR, -xOff, y, zB);
  ensureLight(object3d, 'light_brake_r', BRAKE_COLOR, xOff, y, zB);

  if (type === 'police') {
    const sy = box.max.y - 0.04;
    const sx = width * 0.12;
    const sz = (box.min.z + box.max.z) * 0.5;
    ensureLight(object3d, 'light_siren_l', SIREN_RED, -sx, sy, sz);
    ensureLight(object3d, 'light_siren_r', SIREN_BLUE, sx, sy, sz);
  }

  object3d.userData.kenneyLights = true;
}

export function updateKenneyLights(vehicle, engine) {
  if (!vehicle || !vehicle.object3d) return;
  if (!vehicle.object3d.userData || vehicle.object3d.userData.kenneyLights !== true) {
    setupKenneyLights(vehicle.object3d, vehicle.type);
  }
  const root = vehicle.object3d;
  const headL = grab(root, 'light_head_l');
  const headR = grab(root, 'light_head_r');
  const brakeL = grab(root, 'light_brake_l');
  const brakeR = grab(root, 'light_brake_r');
  const sirenL = grab(root, 'light_siren_l');
  const sirenR = grab(root, 'light_siren_r');

  const pos = vehicle.position || root.position;
  const pl = playerXZ(engine);
  const dist = Math.hypot((pos && pos.x) - pl.x, (pos && pos.z) - pl.z);
  if (dist > LIGHT_FAR) {
    setEmit(headL, 0);
    setEmit(headR, 0);
    setEmit(brakeL, 0);
    setEmit(brakeR, 0);
    setEmit(sirenL, 0);
    setEmit(sirenR, 0);
    return;
  }

  const st = engine && engine.state;
  const night = isNight(st && st.time);
  const headI = night ? HEAD_NIGHT : DAY_EMIT;
  setEmit(headL, headI);
  setEmit(headR, headI);

  const brakeI = vehicle.braking === true ? BRAKE_ON : DAY_EMIT;
  setEmit(brakeL, brakeI);
  setEmit(brakeR, brakeI);

  if ((vehicle.type || '') !== 'police') return;
  const blinkOn = vehicle.siren === true || vehicle.controller === 'police';
  if (!blinkOn) {
    setEmit(sirenL, 0.15);
    setEmit(sirenR, 0.15);
    return;
  }
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
  const s = Math.sin(now * 0.001 * Math.PI * 2 * SIREN_HZ);
  setEmit(sirenL, s >= 0 ? 3.2 : 0.15);
  setEmit(sirenR, s >= 0 ? 0.15 : 3.2);
}
