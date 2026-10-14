// ФАЙЛЫ: src/player/gait-stride.js, src/npc/ped-gait.js
// Походка прохожих: stride клипов и пул зонтов под дождём. Погоду читаем только из аргумента.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { strideTimeScale } from '../player/gait-stride.js';

export const RAIN_SPEED_MUL = 1.45;
export const UMBRELLA_MAX = 24;
export const RAIN_ON = 0.3;

const dummy = new THREE.Object3D();

/** Нет weather или rain ≤ 0.3 → 1, иначе 1.45. Читает только аргумент, не state. */
export function rainSpeedMul(weather) {
  if (!weather) return 1;
  const rain = weather.rain;
  if (!(rain > RAIN_ON)) return 1;
  return RAIN_SPEED_MUL;
}

/**
 * ped._kenney.actions[walk|sprint].timeScale. Скорость: hypot(body.vx, body.vz), если > 0.01; иначе
 * смещение ped.position от прошлого вызова / dt (первый вызов 0, смещение > 5 м — телепорт, 0).
 * dt не число или ≤ 0 → 1/60. Нет _kenney — no-op.
 */
export function applyPedStride(ped, dt) {
  if (!ped || !ped._kenney) return;
  const actions = ped._kenney.actions;
  if (!actions) return;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const body = ped.body;
  const vx = body && Number.isFinite(body.vx) ? body.vx : 0;
  const vz = body && Number.isFinite(body.vz) ? body.vz : 0;
  let speed = Math.hypot(vx, vz);
  const p = ped.position;
  const hasPos = !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
  if (speed <= 0.01) {
    speed = 0;
    if (hasPos && Number.isFinite(ped._gx) && Number.isFinite(ped._gz)) {
      const dist = Math.hypot(p.x - ped._gx, p.z - ped._gz);
      if (dist <= 5) speed = dist / step;
    }
  }
  if (hasPos) {
    ped._gx = p.x;
    ped._gz = p.z;
  }
  const clip = ped._kenney._clip;
  if (clip === 'sprint' || ped.mode === 'flee') {
    if (actions.sprint) actions.sprint.timeScale = strideTimeScale(speed, 'run');
  } else if (clip === 'walk') {
    if (actions.walk) actions.walk.timeScale = strideTimeScale(speed, 'walk');
  }
}

function makeUmbrellaGeometry() {
  const stick = new THREE.CylinderGeometry(0.018, 0.018, 0.95, 6);
  stick.translate(0, 0.475, 0);
  const canopy = new THREE.ConeGeometry(0.48, 0.22, 8);
  canopy.translate(0, 1.02, 0);
  const merged = mergeGeometries([stick, canopy]);
  stick.dispose();
  canopy.dispose();
  return merged || new THREE.ConeGeometry(0.45, 0.9, 8);
}

/**
 * Один InstancedMesh зонт (конус+палка), count=24. Не PointLight.
 * update(list, weather): если rain>0.3 — до 24 педов mode walk|flee, matrix над головой (y+1.7);
 * иначе count=0. scene.add один раз.
 */
export function createUmbrellaPool(scene) {
  const geo = makeUmbrellaGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a4a6e,
    roughness: 0.55,
    metalness: 0.08,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, UMBRELLA_MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.name = 'pedUmbrellas';
  if (scene && typeof scene.add === 'function') scene.add(mesh);

  function update(list, weather) {
    const rain = weather && Number.isFinite(weather.rain) ? weather.rain : 0;
    if (!(rain > RAIN_ON) || !list || !list.length) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    let n = 0;
    for (let i = 0; i < list.length && n < UMBRELLA_MAX; i++) {
      const ped = list[i];
      if (!ped) continue;
      const mode = ped.mode;
      if (mode !== 'walk' && mode !== 'flee') continue;
      const p = ped.position || (ped.object3d && ped.object3d.position);
      if (!p) continue;
      dummy.position.set(p.x || 0, (p.y || 0) + 1.7, p.z || 0);
      dummy.rotation.set(0, ped.heading || 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}
