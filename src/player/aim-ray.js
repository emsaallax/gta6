// ФАЙЛЫ: src/player/aim-ray.js
// Луч прицела из камеры через центр экрана; выстрел пистолета в точку под перекрестием.

import * as THREE from 'three';

export const PISTOL_RANGE = 80;
export const PISTOL_DAMAGE = 34;

const _ndc = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();
const _muzzleLocal = new THREE.Vector3();

function xyz(v) {
  return { x: v.x, y: v.y, z: v.z };
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
 * Ствол: если player.object3d.getObjectByName('pistol') — world pos + локальный (0,0.01,0.18).
 * Иначе { x: pos.x + dir.x*0.45, y: (pos.y||0)+1.42, z: pos.z + dir.z*0.45 }.
 */
export function muzzleWorld(player, dir) {
  if (!player) return null;
  const obj = player.object3d;
  const pistol =
    obj && typeof obj.getObjectByName === 'function'
      ? obj.getObjectByName('pistol')
      : null;
  if (pistol) {
    _muzzleLocal.set(0, 0.01, 0.18);
    pistol.localToWorld(_muzzleLocal);
    return { x: _muzzleLocal.x, y: _muzzleLocal.y, z: _muzzleLocal.z };
  }
  const pos = player.position || { x: 0, y: 0, z: 0 };
  const d = dir || { x: 0, y: 0, z: 0 };
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

  if (distB < distW && hitB) {
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
