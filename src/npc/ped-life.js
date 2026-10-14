// Жизнь педа: walk / flee / down / dead, удар машиной, угон.
import { rainSpeedMul } from './ped-gait.js';

export const WALK_SPEED = 1.3;
export const FLEE_SPEED = 5;
export const DEAD_DESPAWN = 20;
export const DOWN_MIN = 4;
export const DOWN_MAX = 6;

const FLEE_TIME = 8;
const PED_R = 0.4;
const JOIN_EPS = 2.2;
const END_EPS = 0.55;

export function bindPedLife(engine) {
  if (!engine || typeof engine.on !== 'function') return;
  if (engine._pedLifeBound) return;
  engine._pedLifeBound = true;

  engine.on('bodyHit', (payload) => onBodyHit(engine, payload));
  engine.on('shot', (payload) => onShot(engine, payload));
  engine.on('carjack', (payload) => onCarjack(engine, payload));
}

export function stepPed(ped, dt, engine) {
  if (!ped) return;
  const t = dt > 0 ? dt : 0;
  const pos = pedPos(ped);

  if (ped.mode === 'dead') {
    stepDead(ped, t, engine);
    return;
  }
  if (ped.mode === 'down') {
    stepDown(ped, t);
    return;
  }

  if (typeof ped.brain === 'function') {
    ped.brain(ped, t, engine);
    if (ped.object3d) ped.object3d.rotation.y = ped.heading || 0;
    return;
  }

  if (ped.mode === 'flee') {
    stepFlee(ped, t, engine, pos);
    return;
  }

  stepWalk(ped, t, engine, pos);
}

function onBodyHit(engine, payload) {
  if (!payload) return;
  const speed = payload.speed;
  const ped = pedFromHitPair(payload.a, payload.b);
  if (!ped) return;
  if (!(speed > 6) || ped.mode === 'dead') return;

  ped.health = (ped.health == null ? 100 : ped.health) - speed * 6;
  engine.emit('pedHurt', { ped, by: 'car', attacker: null });

  if (ped.health <= 0) {
    ped.mode = 'dead';
    ped._deadT = 0;
    engine.emit('pedKilled', { ped, by: 'car', attacker: null });
  } else {
    ped.mode = 'down';
    ped._downT = 0;
    ped._downDur = DOWN_MIN + Math.random() * (DOWN_MAX - DOWN_MIN);
  }
}

function onShot(engine, payload) {
  if (!payload) return;
  const x = payload.x;
  const z = payload.z;
  const list = engine.state && engine.state.npcs && engine.state.npcs.list;
  if (!list) return;
  const r2 = 80 * 80;
  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    if (!ped) continue;
    if (ped.kind !== 'civ' && ped.kind !== 'driver') continue;
    if (ped.mode !== 'walk') continue;
    const p = pedPos(ped);
    if (!p) continue;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz >= r2) continue;
    ped.mode = 'flee';
    ped._fleeX = x;
    ped._fleeZ = z;
    ped._fleeT = 0;
  }
}

function onCarjack(engine, payload) {
  if (!payload) return;
  const npcs = engine.state && engine.state.npcs;
  if (!npcs || typeof npcs.spawn !== 'function') return;
  const x = payload.x;
  const z = payload.z;
  const ped = npcs.spawn({ kind: 'driver', x, z, mode: 'flee' });
  if (!ped) return;
  ped._fleeX = x;
  ped._fleeZ = z;
  ped._fleeT = 0;
}

function pedFromHitPair(a, b) {
  let car = null;
  let pedBody = null;
  if (a && a.kind === 'car') car = a;
  if (b && b.kind === 'car') car = b;
  if (a && a.kind === 'ped') pedBody = a;
  if (b && b.kind === 'ped') pedBody = b;
  if (!car || !pedBody) return null;
  return pedBody.ref || null;
}

function stepDead(ped, dt, engine) {
  if (!Number.isFinite(ped._deadT)) ped._deadT = 0;
  const t = dt > 0 ? dt : 0;
  ped._deadT += t;
  writeBodyVel(ped, 0, 0);
  if (ped._deadT >= DEAD_DESPAWN) {
    const npcs = engine && engine.state && engine.state.npcs;
    if (npcs && typeof npcs.despawn === 'function') npcs.despawn(ped);
  }
}

function stepDown(ped, dt) {
  writeBodyVel(ped, 0, 0);
  if (!(ped.health > 0)) return;
  ped._downT = (ped._downT || 0) + dt;
  const dur = ped._downDur || 5;
  if (ped._downT >= dur) ped.mode = 'walk';
}

function stepFlee(ped, dt, engine, pos) {
  ped._fleeT = (ped._fleeT || 0) + dt;
  if (ped._fleeT >= FLEE_TIME) {
    ped.mode = 'walk';
    stepWalk(ped, dt, engine, pos);
    return;
  }
  if (!pos) {
    writeBodyVel(ped, 0, 0);
    return;
  }
  const hx = pos.x - (ped._fleeX || 0);
  const hz = pos.z - (ped._fleeZ || 0);
  applyMove(ped, dt, FLEE_SPEED, hx, hz, engine);
}

function stepWalk(ped, dt, engine, pos) {
  const sidewalks = engine.state && engine.state.city && engine.state.city.sidewalks;
  if (sidewalks && sidewalks.length && pos) {
    walkSidewalk(ped, dt, engine, pos, sidewalks);
    return;
  }
  wander(ped, dt, engine);
}

function walkSidewalk(ped, dt, engine, pos, sidewalks) {
  if (ped._sw == null || !sidewalks[ped._sw]) {
    ped._sw = nearestSidewalk(sidewalks, pos.x, pos.z);
    ped._swDir = 1;
  }
  const s = sidewalks[ped._sw];
  const tClosest = closestT(s, pos.x, pos.z);
  const px = s.x1 + (s.x2 - s.x1) * tClosest;
  const pz = s.z1 + (s.z2 - s.z1) * tClosest;
  const off = Math.hypot(pos.x - px, pos.z - pz);
  if (off > 1.2) {
    applyMove(ped, dt, walkSpeed(engine), px - pos.x, pz - pos.z, engine);
    return;
  }

  const dir = ped._swDir >= 0 ? 1 : -1;
  const tx = dir > 0 ? s.x2 : s.x1;
  const tz = dir > 0 ? s.z2 : s.z1;
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < END_EPS) {
    pickNextSidewalk(ped, sidewalks, tx, tz, -dir);
    return;
  }
  applyMove(ped, dt, walkSpeed(engine), dx, dz, engine);
}

function pickNextSidewalk(ped, sidewalks, endX, endZ, reverseDir) {
  const cur = ped._sw;
  for (let i = 0; i < sidewalks.length; i++) {
    if (i === cur) continue;
    const n = sidewalks[i];
    if (Math.hypot(n.x1 - endX, n.z1 - endZ) < JOIN_EPS) {
      ped._sw = i;
      ped._swDir = 1;
      return;
    }
    if (Math.hypot(n.x2 - endX, n.z2 - endZ) < JOIN_EPS) {
      ped._sw = i;
      ped._swDir = -1;
      return;
    }
  }
  ped._swDir = reverseDir;
}

function nearestSidewalk(sidewalks, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sidewalks.length; i++) {
    const s = sidewalks[i];
    const t = closestT(s, x, z);
    const px = s.x1 + (s.x2 - s.x1) * t;
    const pz = s.z1 + (s.z2 - s.z1) * t;
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function closestT(s, x, z) {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) return 0;
  let t = ((x - s.x1) * dx + (z - s.z1) * dz) / len2;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function wander(ped, dt, engine) {
  if (ped._wanderH == null) ped._wanderH = ped.heading || Math.random() * Math.PI * 2;
  ped._wanderT = (ped._wanderT || 0) + dt;
  if (ped._wanderT > 2.5) {
    ped._wanderT = 0;
    if (Math.random() < 0.35) ped._wanderH += (Math.random() - 0.5) * 1.4;
  }
  applyMove(ped, dt, walkSpeed(engine), Math.sin(ped._wanderH), Math.cos(ped._wanderH), engine);
}

function walkSpeed(engine) {
  const weather = engine && engine.state && engine.state.weather;
  return WALK_SPEED * rainSpeedMul(weather);
}

function applyMove(ped, dt, speed, hx, hz, engine) {
  const pos = pedPos(ped);
  let vx = 0;
  let vz = 0;
  const len = Math.hypot(hx, hz);
  if (len > 1e-6) {
    vx = (hx / len) * speed;
    vz = (hz / len) * speed;
    ped.heading = Math.atan2(vx, vz);
  }
  if (pos) {
    pos.x += vx * dt;
    pos.z += vz * dt;
    const physics = engine && engine.physics;
    if (physics && typeof physics.resolveCircle === 'function') {
      const r = physics.resolveCircle(pos.x, pos.z, PED_R);
      pos.x = r.x;
      pos.z = r.z;
    }
  }
  if (ped.object3d) ped.object3d.rotation.y = ped.heading || 0;
  writeBodyVel(ped, vx, vz);
}

function writeBodyVel(ped, vx, vz) {
  if (!ped.body) return;
  ped.body.vx = vx;
  ped.body.vz = vz;
}

function pedPos(ped) {
  return ped.position || (ped.object3d && ped.object3d.position) || null;
}
