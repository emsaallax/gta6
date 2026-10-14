// Кинематика NPC-трафика по полосам города. Класс Traffic здесь не создаём.
import { STOP_LINE, redLightTarget } from './redStop.js';

const ACCEL = 8;
const BRAKE = 14;
const LATERAL_RATE = 5;
const LOOK_AHEAD = 12;
const FOLLOW_STOP = 10;
const FOLLOW_MATCH = 16;
const LANE_SWITCH_DIST = 1.5;
const LATERAL_AHEAD = 2;
const DEFAULT_SPEED = 11;
const CROSS_STOP = 4;

function hypot2(dx, dz) {
  return Math.hypot(dx, dz);
}

function projectOnLane(x, z, lane) {
  const dx = lane.x2 - lane.x1;
  const dz = lane.z2 - lane.z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) {
    return { t: 0, qx: lane.x1, qz: lane.z1, len: 0, remain: 0 };
  }
  const t = ((x - lane.x1) * dx + (z - lane.z1) * dz) / len2;
  const tc = Math.max(0, Math.min(1, t));
  const len = Math.sqrt(len2);
  return {
    t,
    qx: lane.x1 + tc * dx,
    qz: lane.z1 + tc * dz,
    len,
    remain: (1 - Math.max(0, Math.min(1, t))) * len,
  };
}

function distToSegment(x, z, lane) {
  const p = projectOnLane(x, z, lane);
  return hypot2(x - p.qx, z - p.qz);
}

function findLaneById(lanes, id) {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i].id === id) return lanes[i];
  }
  return null;
}

function nearestLane(lanes, x, z) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < lanes.length; i++) {
    const d = distToSegment(x, z, lanes[i]);
    if (d < bestD) {
      bestD = d;
      best = lanes[i];
    }
  }
  return best;
}

function findIntersection(intersections, id) {
  if (!intersections) return null;
  for (let i = 0; i < intersections.length; i++) {
    if (intersections[i].id === id) return intersections[i];
  }
  return null;
}

function pullSpeed(speed, target, dt) {
  if (speed < target) return Math.min(target, speed + ACCEL * dt);
  if (speed > target) return Math.max(target, speed - BRAKE * dt);
  return speed;
}

function pickNextLane(lane, lanes) {
  const ids = lane.next;
  if (!ids || !ids.length) return null;
  const cands = [];
  for (let i = 0; i < ids.length; i++) {
    const n = findLaneById(lanes, ids[i]);
    if (!n) continue;
    const d = lane.dirX * n.dirX + lane.dirZ * n.dirZ;
    if (d > 0) cands.push(n);
  }
  if (!cands.length) return null;
  return cands[Math.floor(Math.random() * cands.length)];
}

function nextLaneSet(lane) {
  const set = Object.create(null);
  const ids = lane.next;
  if (!ids) return set;
  for (let i = 0; i < ids.length; i++) set[ids[i]] = true;
  return set;
}

/**
 * Шаг одной машины трафика. Пишет position, heading, speed, braking, lane, body.vx/vz.
 */
export function stepTrafficVehicle(vehicle, dt, engine) {
  if (!vehicle || !engine || !engine.state) return;
  if (vehicle.controller !== 'traffic') return;
  const city = engine.state.city;
  const lanes = city && city.lanes;
  if (!lanes || !lanes.length) return;

  const pos = vehicle.position || (vehicle.object3d && vehicle.object3d.position);
  if (!pos) return;

  const body = vehicle.body;
  if (vehicle.health != null && vehicle.health <= 0) {
    vehicle.speed = 0;
    vehicle.braking = true;
    if (body) {
      body.vx = 0;
      body.vz = 0;
    }
    return;
  }

  let lane = findLaneById(lanes, vehicle.lane);
  if (!lane) {
    lane = nearestLane(lanes, pos.x, pos.z);
    if (!lane) return;
    vehicle.lane = lane.id;
  }

  const proj = projectOnLane(pos.x, pos.z, lane);
  const ex = proj.qx - pos.x;
  const ez = proj.qz - pos.z;
  const lat = hypot2(ex, ez);
  const maxShift = LATERAL_RATE * dt;
  if (lat > 1e-8) {
    const k = lat > maxShift ? maxShift / lat : 1;
    pos.x += ex * k;
    pos.z += ez * k;
  }

  let dirX = lane.dirX || 0;
  let dirZ = lane.dirZ || 0;
  let dlen = Math.hypot(dirX, dirZ);
  if (dlen < 1e-8) {
    dirX = (lane.x2 - lane.x1) || 0;
    dirZ = (lane.z2 - lane.z1) || 0;
    dlen = Math.hypot(dirX, dirZ);
  }
  if (dlen > 1e-8) {
    dirX /= dlen;
    dirZ /= dlen;
  } else {
    dirX = 0;
    dirZ = 1;
  }
  vehicle.heading = Math.atan2(dirX, dirZ);

  let target = lane.speed != null ? lane.speed : DEFAULT_SPEED;
  vehicle.braking = false;

  const ix = findIntersection(city.intersections, lane.to);
  let distTo = Infinity;
  let towardTo = false;
  let holdAtStop = false;
  if (ix) {
    const rx = ix.x - pos.x;
    const rz = ix.z - pos.z;
    distTo = hypot2(rx, rz);
    towardTo = rx * dirX + rz * dirZ > 0;
    const red = redLightTarget({
      speed: vehicle.speed || 0,
      gap: distTo,
      toward: towardTo,
      lane,
      ix,
    });
    target = red.target;
    holdAtStop = red.hold;
  }

  const vehicles = engine.state.vehicles;
  if (vehicles && vehicles.length) {
    const watchNext = proj.remain < LOOK_AHEAD;
    const nextSet = watchNext ? nextLaneSet(lane) : null;
    let closest = Infinity;
    let closestSpeed = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const other = vehicles[i];
      if (other === vehicle) continue;
      if (other.controller == null) continue;
      const sameLane = other.lane === vehicle.lane;
      const onNext = watchNext && other.lane != null && nextSet[other.lane];
      if (!sameLane && !onNext) continue;
      const op = other.position || (other.object3d && other.object3d.position);
      if (!op) continue;
      const ox = op.x - pos.x;
      const oz = op.z - pos.z;
      const ahead = ox * dirX + oz * dirZ;
      if (ahead <= 0) continue;
      const side = Math.abs(ox * dirZ - oz * dirX);
      if (side >= LATERAL_AHEAD) continue;
      const d = hypot2(ox, oz);
      if (d < closest) {
        closest = d;
        closestSpeed = other.speed || 0;
      }
    }
    if (closest < FOLLOW_STOP) target = 0;
    else if (closest < FOLLOW_MATCH && target > closestSpeed) target = closestSpeed;

    for (let i = 0; i < vehicles.length; i++) {
      const other = vehicles[i];
      if (other === vehicle) continue;
      if (other.controller == null) continue;
      const op = other.position || (other.object3d && other.object3d.position);
      if (!op) continue;
      const ox = op.x - pos.x;
      const oz = op.z - pos.z;
      if (ox * dirX + oz * dirZ <= 0) continue;
      if (hypot2(ox, oz) < CROSS_STOP) target = 0;
    }
  }

  const speed0 = vehicle.speed || 0;
  if (target < speed0) vehicle.braking = true;
  vehicle.speed = pullSpeed(speed0, target, dt);

  let sp = vehicle.speed;
  let step = sp * dt;
  if (holdAtStop) {
    const room = distTo - STOP_LINE;
    if (room > 0 && step >= room) {
      step = Math.max(0, room);
      sp = 0;
      vehicle.speed = 0;
      vehicle.braking = true;
    }
  }
  pos.x += dirX * step;
  pos.z += dirZ * step;
  if (body) {
    body.vx = dirX * sp;
    body.vz = dirZ * sp;
  }

  const after = projectOnLane(pos.x, pos.z, lane);
  const pastEnd = after.t > 1;
  const nearTo = towardTo && distTo < LANE_SWITCH_DIST;
  if (pastEnd || nearTo) {
    const nxt = pickNextLane(lane, lanes);
    if (nxt) vehicle.lane = nxt.id;
  }
}
