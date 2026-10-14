// ФАЙЛЫ: src/vehicles/carHeading.js
// Нос корпуса = vehicle.heading. Крен/клевок (rotation.x/z) не трогаем.
import * as THREE from 'three';

const FRONT_WHEELS = ['wheel-front-left', 'wheel-front-right', 'wheel_fl', 'wheel_fr'];
const BACK_WHEELS = ['wheel-back-left', 'wheel-back-right', 'wheel_rl', 'wheel_rr'];
const YAW_EPS = 0.08;

export function wrapPi(a) {
  const two = Math.PI * 2;
  let x = ((a + Math.PI) % two + two) % two - Math.PI;
  if (x <= -Math.PI) x += two;
  return x;
}

/**
 * Каждый кадр. Не трогает rotation.x и rotation.z.
 * object3d.rotation.order = 'YXZ'
 * heading не finite → 0
 * object3d.rotation.y = heading
 */
export function applyCarHeading(object3d, heading) {
  if (!object3d || !object3d.rotation) return;
  const y = Number.isFinite(heading) ? heading : 0;
  object3d.rotation.order = 'YXZ';
  object3d.rotation.y = y;
}

function avgNamedLocal(root, names) {
  const acc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < names.length; i++) {
    const o = typeof root.getObjectByName === 'function' ? root.getObjectByName(names[i]) : null;
    if (!o || typeof o.getWorldPosition !== 'function') continue;
    o.getWorldPosition(p);
    if (typeof root.worldToLocal === 'function') root.worldToLocal(p);
    acc.add(p);
    n += 1;
  }
  if (!n) return null;
  acc.multiplyScalar(1 / n);
  return acc;
}

/**
 * Нос Kenney → локальный +Z, один раз.
 * Если root.userData.kenneyFaced === true — return.
 */
export function faceKenneyPlusZ(root) {
  if (!root) return;
  if (root.userData && root.userData.kenneyFaced === true) return;
  if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld(true);
  const front = avgNamedLocal(root, FRONT_WHEELS);
  const back = avgNamedLocal(root, BACK_WHEELS);
  if (!root.userData) root.userData = {};
  if (!front || !back) {
    root.userData.kenneyFaced = true;
    return;
  }
  const yaw = Math.atan2(front.x - back.x, front.z - back.z);
  if (Math.abs(yaw) < YAW_EPS) {
    root.userData.kenneyFaced = true;
    return;
  }
  const visual = new THREE.Group();
  visual.name = 'kenneyFacing';
  const kids = root.children.slice();
  for (let i = 0; i < kids.length; i++) visual.add(kids[i]);
  visual.rotation.y = -yaw;
  root.add(visual);
  root.userData.kenneyFaced = true;
}

/** applyCarHeading(vehicle.object3d, vehicle.heading). Нет object3d — return. */
export function syncVehicleYaw(vehicle) {
  if (!vehicle || !vehicle.object3d) return;
  applyCarHeading(vehicle.object3d, vehicle.heading);
}
