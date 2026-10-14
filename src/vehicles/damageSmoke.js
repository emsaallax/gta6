// Урон машины (bodyHit, стена) и дым: 1 Points на машину.
import * as THREE from 'three';

const SMOKE_COUNT = 24;
const HIT_CD = 0.45;
const COLOR_OK = 0x889099;
const COLOR_DEAD = 0x111111;
const SPEED_THRESHOLD = 4;
const DAMAGE_K = 8;
const DAMAGE_CAP = 220;

function clampHealth(h) {
  return Math.max(0, Math.min(1000, h));
}

function isPedBody(body) {
  return !!(body && (body.kind === 'ped' || body.kind === 'player'));
}

function looksLikeVehicle(ref) {
  return !!(ref && ref.type != null && ref.radius != null && ref.object3d);
}

function isCarBody(body) {
  if (!body) return false;
  if (isPedBody(body)) return false;
  if (body.kind === 'car') return true;
  return looksLikeVehicle(body.ref);
}

function vehicleFromBody(body, engine) {
  if (!body || isPedBody(body)) return null;
  if (looksLikeVehicle(body.ref)) return body.ref;
  const list = engine && engine.state && engine.state.vehicles;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v && v.body === body) return v;
    }
  }
  if (body.kind === 'car' && body.ref && body.ref.object3d) return body.ref;
  return null;
}

function seedParticle(pos, vel, i) {
  const i3 = i * 3;
  pos[i3] = (Math.random() - 0.5) * 0.55;
  pos[i3 + 1] = Math.random() * 0.35;
  pos[i3 + 2] = (Math.random() - 0.5) * 0.55;
  vel[i] = 0.45 + Math.random() * 0.75;
}

function ensureSmoke(vehicle) {
  const root = vehicle.object3d;
  if (!root) return null;
  let pts = typeof root.getObjectByName === 'function' ? root.getObjectByName('smoke') : null;
  if (pts) return pts;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SMOKE_COUNT * 3);
  const vel = new Float32Array(SMOKE_COUNT);
  for (let i = 0; i < SMOKE_COUNT; i++) seedParticle(pos, vel, i);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: COLOR_OK,
    size: 0.2,
    depthWrite: false,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: true,
  });
  pts = new THREE.Points(geo, mat);
  pts.name = 'smoke';
  pts.position.set(0, 1.2, 0);
  pts.frustumCulled = false;
  pts.userData.vel = vel;
  root.add(pts);
  return pts;
}

/**
 * Урон от относительной скорости. Порог 4 м/с.
 * Удар 15 м/с → 88 (≤10% из 1000). Сильный ~28–32 м/с → 192–220, сломать за 5–6 ударов.
 * Не пишет vehicle.speed / body.vx.
 */
export function crashDamageFromSpeed(relSpeed) {
  const s = Math.abs(Number(relSpeed) || 0);
  if (!(s > SPEED_THRESHOLD)) return 0;
  const over = s - SPEED_THRESHOLD;
  return Math.min(DAMAGE_CAP, over * DAMAGE_K);
}

export function applyCrashDamage(vehicle, relSpeed) {
  if (!vehicle) return;
  if (vehicle._hitCd > 0) return;
  const dmg = crashDamageFromSpeed(relSpeed);
  if (dmg <= 0) return;
  const cur = Number(vehicle.health);
  const base = Number.isFinite(cur) ? cur : 1000;
  vehicle.health = clampHealth(base - dmg);
  vehicle._hitCd = HIT_CD;
  vehicle._crashT = 1;
}

export function updateVehicleSmoke(vehicle, dt) {
  if (!vehicle) return;
  vehicle._hitCd = Math.max(0, (vehicle._hitCd || 0) - (dt > 0 ? dt : 0));
  if (!vehicle.object3d) return;
  const cur = Number(vehicle.health);
  const health = Number.isFinite(cur) ? cur : 1000;
  if (health >= 300) {
    const old = typeof vehicle.object3d.getObjectByName === 'function'
      ? vehicle.object3d.getObjectByName('smoke')
      : null;
    if (old) old.visible = false;
    return;
  }
  const pts = ensureSmoke(vehicle);
  if (!pts) return;
  pts.visible = true;
  if (pts.material && pts.material.color) {
    pts.material.color.setHex(health <= 0 ? COLOR_DEAD : COLOR_OK);
  }
  const attr = pts.geometry && pts.geometry.getAttribute('position');
  if (!attr) return;
  const pos = attr.array;
  let vel = pts.userData.vel;
  if (!vel || vel.length !== SMOKE_COUNT) {
    vel = new Float32Array(SMOKE_COUNT);
    for (let i = 0; i < SMOKE_COUNT; i++) vel[i] = 0.6;
    pts.userData.vel = vel;
  }
  const t = dt > 0 ? dt : 0;
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const i3 = i * 3;
    pos[i3 + 1] += vel[i] * t;
    if (pos[i3 + 1] > 1.85) seedParticle(pos, vel, i);
  }
  attr.needsUpdate = true;
}

export function bindVehicleDamage(engine) {
  if (!engine || typeof engine.on !== 'function') return;
  engine.on('bodyHit', ({ a, b, speed }) => {
    const carA = isCarBody(a);
    const carB = isCarBody(b);
    const pedA = isPedBody(a);
    const pedB = isPedBody(b);
    const spd = Number(speed) || 0;
    if (!carA && !carB) return;

    if (carA && carB) {
      const vA = vehicleFromBody(a, engine);
      const vB = vehicleFromBody(b, engine);
      if (vA) applyCrashDamage(vA, spd);
      if (vB) applyCrashDamage(vB, spd);
      return;
    }

    if (spd <= 6) return;
    if (carA && pedB) {
      applyCrashDamage(vehicleFromBody(a, engine), spd * 0.4);
      return;
    }
    if (carB && pedA) {
      applyCrashDamage(vehicleFromBody(b, engine), spd * 0.4);
    }
  });
}
