// ФАЙЛЫ: src/vehicles/kenneyWheels.js
// Колёса Kenney: ступица, качение по speed, руль по steer. GLB не грузит.

import * as THREE from 'three';

const ROLL_RADIUS = 0.35;

const SLOTS = {
  fl: ['wheel_fl', 'wheel-front-left'],
  fr: ['wheel_fr', 'wheel-front-right'],
  rl: ['wheel_rl', 'wheel-back-left'],
  rr: ['wheel_rr', 'wheel-back-right'],
};

const _box = new THREE.Box3();
const _center = new THREE.Vector3();

function findNamed(root, name) {
  if (!root || !name) return null;
  if (typeof root.getObjectByName === 'function') {
    const hit = root.getObjectByName(name);
    if (hit) return hit;
  }
  return null;
}

function resolveExistingHub(node) {
  if (!node) return null;
  if (node.userData && node.userData.kenneyHub === true) return node;
  const p = node.parent;
  if (p && p.userData && p.userData.kenneyHub === true) return p;
  return null;
}

function hubCenterInParent(node) {
  const parent = node.parent;
  if (typeof node.updateWorldMatrix === 'function') node.updateWorldMatrix(true, true);
  _box.setFromObject(node);
  _box.getCenter(_center);
  if (parent && typeof parent.worldToLocal === 'function') {
    parent.worldToLocal(_center);
  }
  return _center.clone();
}

function wrapInHub(node, groupName) {
  if (!node) return null;
  const existing = resolveExistingHub(node);
  if (existing) {
    existing.name = groupName;
    existing.userData.kenneyHub = true;
    return existing;
  }

  const parent = node.parent;
  const center = hubCenterInParent(node);
  const hub = new THREE.Group();
  hub.name = groupName;
  hub.userData.kenneyHub = true;

  if (parent) {
    hub.position.copy(center);
    parent.add(hub);
    const offsetX = node.position.x - center.x;
    const offsetY = node.position.y - center.y;
    const offsetZ = node.position.z - center.z;
    parent.remove(node);
    hub.add(node);
    node.position.set(offsetX, offsetY, offsetZ);
  } else {
    hub.position.copy(center);
    hub.add(node);
    node.position.sub(center);
  }
  return hub;
}

function collectSlot(root, key) {
  const names = SLOTS[key];
  const groupName = names[0];
  for (let i = 0; i < names.length; i++) {
    const node = findNamed(root, names[i]);
    if (!node) continue;
    const hub = resolveExistingHub(node);
    if (hub) {
      hub.name = groupName;
      return hub;
    }
    return wrapInHub(node, groupName);
  }
  return null;
}

/**
 * Находит 4 колеса, один раз заворачивает каждое в Group в позиции ступицы.
 * Имена узлов Kenney: wheel-front-left/right, wheel-back-left/right.
 * Также принять уже готовые wheel_fl / wheel_fr / wheel_rl / wheel_rr.
 * Повторный вызов не дублирует группы (метка userData.kenneyHub === true).
 */
export function collectKenneyWheels(object3d) {
  if (!object3d) {
    return { fl: null, fr: null, rl: null, rr: null };
  }
  if (typeof object3d.updateMatrixWorld === 'function') object3d.updateMatrixWorld(true);
  return {
    fl: collectSlot(object3d, 'fl'),
    fr: collectSlot(object3d, 'fr'),
    rl: collectSlot(object3d, 'rl'),
    rr: collectSlot(object3d, 'rr'),
  };
}

/**
 * Крутит колёса. Не пишет state. Не меняет position машины.
 * dt — секунды. Радиус качения 0.35 м.
 */
export function spinKenneyWheels(wheels, vehicle, dt) {
  if (!wheels) return;
  const t = Number(dt);
  if (!(t > 0)) return;
  if (!vehicle) return;

  const speed = Number(vehicle.speed);
  const steer = Number(vehicle.steer);
  const v = Number.isFinite(speed) ? speed : 0;
  const s = Number.isFinite(steer) ? steer : 0;
  const dRoll = (v / ROLL_RADIUS) * t;

  const fl = wheels.fl;
  const fr = wheels.fr;
  const rl = wheels.rl;
  const rr = wheels.rr;

  if (fl) {
    fl.rotation.x -= dRoll;
    fl.rotation.y = s;
  }
  if (fr) {
    fr.rotation.x -= dRoll;
    fr.rotation.y = s;
  }
  if (rl) rl.rotation.x -= dRoll;
  if (rr) rr.rotation.x -= dRoll;
}
