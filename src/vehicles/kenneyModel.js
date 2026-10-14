// ФАЙЛЫ: src/vehicles/kenneyModel.js
// Загрузка Kenney car-kit: путь, клон GLB, масштаб ~4.4 м, посадка на землю.

import * as THREE from 'three';

export const KENNEY_DIR = 'assets/models/kenney/car-kit';

export const KENNEY_FILES = {
  sedan: 'sedan.glb',
  taxi: 'taxi.glb',
  police: 'police.glb',
  sport: 'sedan-sports.glb',
  van: 'delivery.glb',
  suv: 'suv.glb',
  coupe: 'sedan-sports.glb',
  pickup: 'suv.glb',
};

const TARGET_LENGTH = 4.4;
const FALLBACK_SCALE = 2;
const RADIUS = 1.6;

const WHEEL_NAMES = [
  'wheel-front-left',
  'wheel-front-right',
  'wheel-back-left',
  'wheel-back-right',
];

function normalizeType(type) {
  if (type && Object.prototype.hasOwnProperty.call(KENNEY_FILES, type)) return type;
  return 'sedan';
}

/** Неизвестный type → sedan. Путь от корня сайта. */
export function kenneyCarPath(type) {
  const key = normalizeType(type);
  return KENNEY_DIR + '/' + KENNEY_FILES[key];
}

function findNamed(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}

function wheelCentersLocal(root) {
  const nodes = [];
  for (let i = 0; i < WHEEL_NAMES.length; i++) {
    const n = findNamed(root, WHEEL_NAMES[i]);
    if (!n) return null;
    nodes.push(n);
  }
  const acc = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].getWorldPosition(p);
    root.worldToLocal(p);
    acc.add(p);
  }
  acc.multiplyScalar(1 / nodes.length);
  return acc;
}

function sitOnGround(root, cloned) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);

  let localCx;
  let localCz;
  const wheels = wheelCentersLocal(root);
  if (wheels) {
    localCx = wheels.x;
    localCz = wheels.z;
  } else {
    const mid = new THREE.Vector3();
    box.getCenter(mid);
    root.worldToLocal(mid);
    localCx = mid.x;
    localCz = mid.z;
  }

  const minLocal = box.min.clone();
  root.worldToLocal(minLocal);
  cloned.position.x -= localCx;
  cloned.position.y -= minLocal.y;
  cloned.position.z -= localCz;
}

function enableCastShadow(root) {
  root.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
}

function takeClone(assets, gltf) {
  if (typeof assets.cloneGLB === 'function') {
    const c = assets.cloneGLB(gltf);
    if (c && c.isObject3D) return c;
    if (c && c.scene && c.scene.isObject3D) return c.scene;
    return null;
  }
  if (!gltf.scene || typeof gltf.scene.clone !== 'function') return null;
  return gltf.scene.clone(true);
}

/**
 * Грузит GLB, клонирует, масштабирует, сажает на землю.
 * Не добавляет в scene. Не пишет engine.state.
 */
export async function loadKenneyCar(engine, type) {
  const norm = normalizeType(type);
  try {
    const assets = engine && engine.state && engine.state.assets;
    if (!assets || typeof assets.loadGLB !== 'function') return null;

    let gltf;
    try {
      gltf = await assets.loadGLB(kenneyCarPath(norm));
    } catch (_err) {
      return null;
    }
    if (!gltf || !gltf.scene) return null;

    const cloned = takeClone(assets, gltf);
    if (!cloned || typeof cloned.traverse !== 'function') return null;

    const root = new THREE.Group();
    root.name = 'car_' + norm;
    root.add(cloned);

    const box0 = new THREE.Box3().setFromObject(root);
    const length = box0.max.z - box0.min.z;
    if (!Number.isFinite(length) || length < 0.1) {
      root.scale.setScalar(FALLBACK_SCALE);
    } else {
      root.scale.setScalar(TARGET_LENGTH / length);
    }

    sitOnGround(root, cloned);
    enableCastShadow(root);

    return { object3d: root, type: norm, radius: RADIUS };
  } catch (_err) {
    return null;
  }
}
