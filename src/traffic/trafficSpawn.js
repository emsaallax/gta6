// Сбор точек спавна/деспавна трафика. В scene и state не пишем — это делает сборщик.

export const TRAFFIC_MIN = 20;
export const TRAFFIC_MAX = 40;
export const KEEP_RADIUS = 150;

const DESPAWN_R = KEEP_RADIUS + 20;
const RING_MIN = 40;
const RING_MAX = 140;
const CLEAR = 12;
const VIEW_DOT = 0.3;
const VIEW_DIST = 100;
const TYPES = ['sedan', 'taxi', 'sport', 'van', 'suv', 'coupe', 'pickup'];

let typeCursor = 0;

function nextType() {
  const t = TYPES[typeCursor % TYPES.length];
  typeCursor += 1;
  return t;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Число машин с controller === 'traffic'. */
export function countTraffic(vehicles) {
  if (!vehicles) return 0;
  let n = 0;
  for (let i = 0; i < vehicles.length; i++) {
    if (vehicles[i].controller === 'traffic') n += 1;
  }
  return n;
}

/** Трафик дальше KEEP_RADIUS+20 от игрока. */
export function collectTrafficDespawn(vehicles, px, pz) {
  const out = [];
  if (!vehicles) return out;
  const lim2 = DESPAWN_R * DESPAWN_R;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (v.controller !== 'traffic') continue;
    const p = v.position || (v.object3d && v.object3d.position);
    if (!p) continue;
    if (dist2(p.x, p.z, px, pz) > lim2) out.push(v);
  }
  return out;
}

function tooClose(x, z, vehicles) {
  if (!vehicles) return false;
  const c2 = CLEAR * CLEAR;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const p = v.position || (v.object3d && v.object3d.position);
    if (!p) continue;
    if (dist2(p.x, p.z, x, z) < c2) return true;
  }
  return false;
}

function sampleLane(lane, t) {
  return {
    x: lane.x1 + (lane.x2 - lane.x1) * t,
    z: lane.z1 + (lane.z2 - lane.z1) * t,
  };
}

/**
 * Следующая точка спавна в кольце 40…140 м, вне взгляда игрока.
 * heading необязателен: нет — фильтр взгляда не применяется.
 */
export function nextTrafficSpawn(city, px, pz, vehicles, heading) {
  const lanes = city && city.lanes;
  if (!lanes || !lanes.length) return null;

  const filterView = heading != null && Number.isFinite(heading);
  const fwdX = filterView ? Math.sin(heading) : 0;
  const fwdZ = filterView ? Math.cos(heading) : 1;
  const preferred = [];
  const fringes = [];

  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const len = Math.hypot(lane.x2 - lane.x1, lane.z2 - lane.z1);
    const n = Math.max(8, Math.min(12, Math.ceil(len / 15) || 8));
    for (let s = 0; s < n; s++) {
      const t = n === 1 ? 0.5 : s / (n - 1);
      const pt = sampleLane(lane, t);
      const dx = pt.x - px;
      const dz = pt.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < RING_MIN || dist > RING_MAX) continue;
      if (tooClose(pt.x, pt.z, vehicles)) continue;
      const cand = {
        x: pt.x,
        z: pt.z,
        heading: Math.atan2(lane.dirX, lane.dirZ),
        lane: lane.id,
        type: null,
        dist,
        dot: filterView ? (dx * fwdX + dz * fwdZ) / dist : -1,
      };
      if (filterView && cand.dot >= VIEW_DOT && dist < VIEW_DIST) {
        continue;
      }
      if (!filterView || cand.dot < VIEW_DOT || dist >= VIEW_DIST) {
        preferred.push(cand);
      } else {
        fringes.push(cand);
      }
    }
  }

  const pool = preferred.length ? preferred : fringes;
  if (!pool.length) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  pick.type = nextType();
  return { x: pick.x, z: pick.z, heading: pick.heading, lane: pick.lane, type: pick.type };
}
