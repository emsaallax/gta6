// ФАЙЛЫ: src/vehicles/headlightCones.js
// Конусы фар на асфальте: один InstancedMesh, без точечных ламп.
import * as THREE from 'three';

export const CONE_NEAR = 40;
export const CONE_MAX = 16;
export const LOW_LEN = 12;
export const HIGH_LEN = 28;
export const WET_GLOW = 1.7;

const CONE_Y = 0.04;
const BASE_GLOW = 0.85;
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

let highBeam = false;

/** Ночь: time < 6 || time >= 19.5. Не finite → false. Не читать bloom. */
export function isNightTime(time) {
  const t = Number(time);
  if (!Number.isFinite(t)) return false;
  return t < 6 || t >= 19.5;
}

function makeConeTexture() {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    const along = y / (h - 1);
    const fadeZ = 1 - along;
    const halfW = 0.12 + along * 0.88;
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1)) * 2 - 1;
      const fadeX = Math.max(0, 1 - Math.abs(nx) / halfW);
      const a = fadeZ * fadeZ * fadeX;
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 248;
      data[i + 2] = 230;
      data[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Один InstancedMesh: PlaneGeometry 2×1, canvas-градиент белый→прозрачный,
 * AdditiveBlending, depthWrite=false, toneMapped=false, frustumCulled=false.
 * Без точечных ламп. Вернуть { mesh, max: CONE_MAX }.
 * В сцену сам не добавляет.
 */
export function createHeadlightCones() {
  const geo = new THREE.PlaneGeometry(2, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: makeConeTexture(),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CONE_MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'headlightCones';
  return { mesh, max: CONE_MAX };
}

function playerPos(state) {
  const p = state && state.player;
  const pos = (p && p.position)
    || (state && state.cameraTarget && state.cameraTarget.position);
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return pos;
  return { x: 0, z: 0 };
}

function isPlayerCar(vehicle, player) {
  if (!player || !player.inVehicle) return false;
  if (player.inVehicle === vehicle) return true;
  return vehicle.controller === 'player' || vehicle.driver === 'player';
}

function wetValue(state) {
  return Number(state.weather && state.weather.wet);
}

/**
 * День: mesh.count = 0.
 * Ночь: до CONE_MAX машин из state.vehicles, dist к игроку < CONE_NEAR.
 * Конус на земле y=0.04, впереди по heading (sin/cos как drive: +Z при 0),
 * длина LOW_LEN. Игрок (player.inVehicle): input.pressed('KeyH') тоглит дальний
 * (HIGH_LEN) на его машине; тогл хранить в модуле, не в state.
 * wet = Number(state.weather && state.weather.wet); нет поля → 0.
 * wet > 0.3 → яркость × WET_GLOW (блик).
 * Нет vehicles — count=0, не бросать.
 */
export function updateHeadlightCones(pool, engine) {
  const mesh = pool && pool.mesh;
  if (!mesh) return;
  const state = engine && engine.state;
  if (!state) {
    mesh.count = 0;
    return;
  }

  if (!isNightTime(state.time)) {
    mesh.count = 0;
    return;
  }

  const player = state.player;
  const input = engine.input;
  if (player && player.inVehicle && input && typeof input.pressed === 'function') {
    if (input.pressed('KeyH')) highBeam = !highBeam;
  }

  const list = state.vehicles;
  if (!Array.isArray(list) || list.length === 0) {
    mesh.count = 0;
    return;
  }

  const origin = playerPos(state);
  const wet = Number.isFinite(wetValue(state)) ? wetValue(state) : 0;
  const glow = (wet > 0.3 ? WET_GLOW : 1) * BASE_GLOW;
  tint.setRGB(glow, glow, glow);

  const nearSq = CONE_NEAR * CONE_NEAR;
  const cap = pool.max != null ? pool.max : CONE_MAX;
  let n = 0;
  for (let i = 0; i < list.length && n < cap; i++) {
    const v = list[i];
    if (!v) continue;
    const pos = v.position || (v.object3d && v.object3d.position);
    if (!pos) continue;
    const dx = pos.x - origin.x;
    const dz = pos.z - origin.z;
    if (dx * dx + dz * dz >= nearSq) continue;

    const heading = Number.isFinite(v.heading) ? v.heading : 0;
    const len = (player && player.inVehicle && isPlayerCar(v, player) && highBeam)
      ? HIGH_LEN
      : LOW_LEN;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    dummy.position.set(
      pos.x + fx * (len * 0.5),
      CONE_Y,
      pos.z + fz * (len * 0.5),
    );
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(1.15, 1, len);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint);
    n += 1;
  }

  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
