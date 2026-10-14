// ФАЙЛЫ: src/player/aim-ray.js
// Луч прицела из камеры через центр экрана; выстрел пистолета в точку под перекрестием.

import * as THREE from 'three';

export const PISTOL_RANGE = 80;
export const PISTOL_DAMAGE = 34;
export const ARM_LEN = 0.6;
export const MUZZLE_BONES = [
  'hand-right',
  'forearm-right',
  'arm-right',
  'RightHand',
  'handR',
  'HandR',
];

const _ndc = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();
const _muzzleLocal = new THREE.Vector3();
const _boneWorld = new THREE.Vector3();
const _boneQuat = new THREE.Quaternion();
const _armDir = new THREE.Vector3();

function xyz(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function normalizeDir(dir) {
  if (!dir) return { x: 0, y: 0, z: 1 };
  const len = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: dir.x / len, y: dir.y / len, z: dir.z / len };
}

function pointAlong(origin, dir, dist) {
  return {
    x: origin.x + dir.x * dist,
    y: origin.y + dir.y * dist,
    z: origin.z + dir.z * dist,
  };
}

function hitPointOf(hit, origin, dir, dist) {
  if (hit && hit.point && typeof hit.point.x === 'number') {
    return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
  }
  return pointAlong(origin, dir, dist);
}

function findNamed(obj, name) {
  if (!obj) return null;
  if (typeof obj.getObjectByName === 'function') {
    const found = obj.getObjectByName(name);
    if (found) return found;
  }
  if (typeof obj.traverse === 'function') {
    let found = null;
    obj.traverse((child) => {
      if (!found && child && child.name === name) found = child;
    });
    return found;
  }
  return null;
}

/**
 * Raycaster.setFromCamera(new Vector2(0,0), camera).
 * origin = ray.origin, dir = ray.direction (единичный). Нет camera — null.
 */
export function screenAimRay(camera) {
  if (!camera) return null;
  _ndc.set(0, 0);
  _raycaster.setFromCamera(_ndc, camera);
  const ray = _raycaster.ray;
  const origin = xyz(ray.origin);
  const dir = xyz(ray.direction);
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len > 1e-12) {
    dir.x /= len;
    dir.y /= len;
    dir.z /= len;
  }
  return { origin, dir };
}

/**
 * Дуло у кисти видимой модели, не у корня object3d (ступни/спина).
 * 1) первая кость из MUZZLE_BONES: кость + armDir*ARM_LEN + dir*0.12 (armDir = (0,-1,0) по ориентации кости; без getWorldQuaternion: кость + dir*0.18)
 * 2) узел pistol: local (0, 0.01, 0.18) → world
 * 3) грудь: pos + dir*0.45, y+1.42
 */
export function muzzleWorld(player, dir) {
  if (!player) return null;
  const d = normalizeDir(dir);
  const obj = player.object3d;

  for (let i = 0; i < MUZZLE_BONES.length; i++) {
    const bone = findNamed(obj, MUZZLE_BONES[i]);
    if (!bone) continue;
    if (typeof bone.getWorldPosition === 'function') {
      bone.getWorldPosition(_boneWorld);
    } else {
      _boneWorld.set(
        bone.position ? bone.position.x : 0,
        bone.position ? bone.position.y : 0,
        bone.position ? bone.position.z : 0,
      );
    }
    if (typeof bone.getWorldQuaternion === 'function') {
      bone.getWorldQuaternion(_boneQuat);
      _boneQuat.normalize();
      _armDir.set(0, -1, 0).applyQuaternion(_boneQuat);
      return {
        x: _boneWorld.x + _armDir.x * ARM_LEN + d.x * 0.12,
        y: _boneWorld.y + _armDir.y * ARM_LEN + d.y * 0.12,
        z: _boneWorld.z + _armDir.z * ARM_LEN + d.z * 0.12,
      };
    }
    return {
      x: _boneWorld.x + d.x * 0.18,
      y: _boneWorld.y + d.y * 0.18,
      z: _boneWorld.z + d.z * 0.18,
    };
  }

  const pistol = findNamed(obj, 'pistol');
  if (pistol && typeof pistol.localToWorld === 'function') {
    _muzzleLocal.set(0, 0.01, 0.18);
    pistol.localToWorld(_muzzleLocal);
    return { x: _muzzleLocal.x, y: _muzzleLocal.y, z: _muzzleLocal.z };
  }

  const pos = player.position || { x: 0, y: 0, z: 0 };
  return {
    x: pos.x + d.x * 0.45,
    y: (pos.y || 0) + 1.42,
    z: pos.z + d.z * 0.45,
  };
}

/**
 * Луч из камеры (не из груди героя).
 * hitB = physics.raycastBodies(camOrigin, dir, 80, player)
 * hitW = physics.raycast(camOrigin, dir, 80)
 * Ближайшее по dist. Нет попадания: hitPoint = origin+dir*80, hitKind='none'.
 */
export function firePistol(engine) {
  if (!engine) return null;
  const player = engine.state && engine.state.player;
  const camera = engine.camera;
  const physics = engine.physics;
  if (!player || !camera || !physics) return null;

  const aim = screenAimRay(camera);
  if (!aim) return null;
  const origin = aim.origin;
  const dir = aim.dir;
  const muzzle = muzzleWorld(player, dir);

  const hitB = physics.raycastBodies
    ? physics.raycastBodies(origin, dir, PISTOL_RANGE, player)
    : null;
  const hitW = physics.raycast
    ? physics.raycast(origin, dir, PISTOL_RANGE)
    : null;

  const distB = hitB && typeof hitB.dist === 'number' ? hitB.dist : Infinity;
  const distW = hitW && typeof hitW.dist === 'number' ? hitW.dist : Infinity;

  let hitKind = 'none';
  let hitPoint = pointAlong(origin, dir, PISTOL_RANGE);
  let ped = null;

  // Земля (плоскость y=0): луч вниз, земля ближе попаданий — ped не трогаем.
  const tGround = dir.y < -1e-4 ? -origin.y / dir.y : Infinity;
  if (tGround > 0 && tGround <= PISTOL_RANGE && tGround < distB && tGround < distW) {
    hitKind = 'ground';
    hitPoint = pointAlong(origin, dir, tGround);
  } else if (distB < distW && hitB) {
    hitPoint = hitPointOf(hitB, origin, dir, distB);
    const body = hitB.body;
    if (body && body.kind === 'ped') {
      hitKind = 'ped';
      ped = body.ref || null;
      if (ped && ped.mode !== 'dead') {
        ped.health -= PISTOL_DAMAGE;
        if (engine.emit) {
          engine.emit('pedHurt', { ped, by: 'bullet', attacker: 'player' });
        }
        if (ped.health <= 0) {
          ped.mode = 'dead';
          ped._deadT = 0;
          if (engine.emit) {
            engine.emit('pedKilled', { ped, by: 'bullet', attacker: 'player' });
          }
        }
      }
    } else if (body && body.kind === 'car') {
      hitKind = 'car';
    } else {
      hitKind = 'wall';
    }
  } else if (hitW && distW <= distB) {
    hitKind = 'wall';
    hitPoint = hitPointOf(hitW, origin, dir, distW);
  }

  const pos = player.position || { x: 0, z: 0 };
  if (engine.emit) {
    engine.emit('shot', { x: pos.x, z: pos.z, by: 'player' });
  }

  return { muzzle, hitPoint, hitKind, dir, ped };
}
