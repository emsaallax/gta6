// ФАЙЛЫ: src/core/bodies.js
// Динамические тела: круги на XZ, цилиндры для луча, раздвижка и bodyHit.
import { applyBounceImpulse, createContactTracker } from './bodies-bounce.js';
import { maybeEmitCrash } from './crash.js';

function defaultMass(kind) {
  return kind === 'car' ? 1200 : 80;
}

function defaultHeight(kind) {
  return kind === 'car' ? 1.5 : 1.8;
}

function isImmovable(mass) {
  return !(mass > 0) || !Number.isFinite(mass);
}

function yOverlap(a, b) {
  const ay0 = a.position.y;
  const ay1 = ay0 + (a.height != null ? a.height : defaultHeight(a.kind));
  const by0 = b.position.y;
  const by1 = by0 + (b.height != null ? b.height : defaultHeight(b.kind));
  return ay0 < by1 && by0 < ay1;
}

/**
 * Луч origin+dir (единичный) против вертикального цилиндра.
 * t в (0, maxDist]. Промах → null, попадание → { dist, point }.
 */
function rayCylinder(origin, dx, dy, dz, body, maxDist) {
  const px = body.position.x;
  const py = body.position.y;
  const pz = body.position.z;
  const r = body.radius;
  const h = body.height != null ? body.height : defaultHeight(body.kind);
  const ymin = py;
  const ymax = py + h;

  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const qx = ox - px;
  const qz = oz - pz;

  const a = dx * dx + dz * dz;
  let tCyl0;
  let tCyl1;

  if (a < 1e-16) {
    if (qx * qx + qz * qz > r * r) return null;
    tCyl0 = -Infinity;
    tCyl1 = Infinity;
  } else {
    const b = 2 * (qx * dx + qz * dz);
    const c = qx * qx + qz * qz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    tCyl0 = (-b - s) / (2 * a);
    tCyl1 = (-b + s) / (2 * a);
    if (tCyl0 > tCyl1) {
      const tmp = tCyl0;
      tCyl0 = tCyl1;
      tCyl1 = tmp;
    }
  }

  let tY0;
  let tY1;
  if (Math.abs(dy) < 1e-12) {
    if (oy < ymin || oy > ymax) return null;
    tY0 = -Infinity;
    tY1 = Infinity;
  } else {
    tY0 = (ymin - oy) / dy;
    tY1 = (ymax - oy) / dy;
    if (tY0 > tY1) {
      const tmp = tY0;
      tY0 = tY1;
      tY1 = tmp;
    }
  }

  const tEnter = Math.max(tCyl0, tY0);
  const tExit = Math.min(tCyl1, tY1);
  if (tEnter > tExit) return null;

  // Ближайшая поверхность луча: вход, изнутри — выход.
  let t = tEnter;
  if (t <= 0) t = tExit;
  if (!(t > 0 && t <= maxDist)) return null;

  return {
    dist: t,
    point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
  };
}

/**
 * Навешивает на physics:
 *   physics.bodies          // массив, изначально []
 *   physics.addBody(body) → body
 *   physics.removeBody(body)
 *   physics.queryBodies(x, z, r) → body[]
 *   physics.raycastBodies(origin, dir, maxDist, ignoreRef?) → { body, dist, point } | null
 *   physics.stepBodies(engine)
 * Не трогать physics.boxes / addBox / resolveCircle / raycast / grid.
 */
export function attachBodies(physics) {
  physics.bodies = [];
  const contacts = createContactTracker();

  physics.addBody = function addBody(body) {
    if (body.vx == null) body.vx = 0;
    if (body.vz == null) body.vz = 0;
    if (body.mass == null) body.mass = defaultMass(body.kind);
    if (body.height == null) body.height = defaultHeight(body.kind);
    physics.bodies.push(body);
    return body;
  };

  physics.removeBody = function removeBody(body) {
    const i = physics.bodies.indexOf(body);
    if (i >= 0) physics.bodies.splice(i, 1);
  };

  physics.queryBodies = function queryBodies(x, z, r) {
    const out = [];
    const list = physics.bodies;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const dx = b.position.x - x;
      const dz = b.position.z - z;
      if (Math.hypot(dx, dz) <= r + b.radius) out.push(b);
    }
    return out;
  };

  physics.raycastBodies = function raycastBodies(origin, dir, maxDist, ignoreRef) {
    if (!(maxDist > 0) || !dir) return null;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-12) return null;
    const dx = dir.x / len;
    const dy = dir.y / len;
    const dz = dir.z / len;

    let best = null;
    let bestDist = maxDist;
    const list = physics.bodies;
    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      if (body.disabled === true) continue;
      if (ignoreRef !== undefined && body.ref === ignoreRef) continue;
      const hit = rayCylinder(origin, dx, dy, dz, body, bestDist);
      if (!hit) continue;
      if (hit.dist < bestDist || (hit.dist <= bestDist && !best)) {
        bestDist = hit.dist;
        best = { body, dist: hit.dist, point: hit.point };
      }
    }
    return best;
  };

  physics.stepBodies = function stepBodies(engine) {
    const list = physics.bodies;
    const n = list.length;
    contacts.beginStep();
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (a.disabled === true) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (b.disabled === true) continue;
        if (a.ref != null && a.ref === b.ref) continue;
        if (!yOverlap(a, b)) continue;

        const maRaw = a.mass;
        const mbRaw = b.mass;
        const aFixed = isImmovable(maRaw);
        const bFixed = isImmovable(mbRaw);
        if (aFixed && bFixed) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        let nx;
        let nz;
        if (dist > 1e-8) {
          nx = dx / dist;
          nz = dz / dist;
        } else {
          nx = 1;
          nz = 0;
        }
        const overlap = minDist - dist;

        let shareA;
        let shareB;
        if (aFixed) {
          shareA = 0;
          shareB = 1;
        } else if (bFixed) {
          shareA = 1;
          shareB = 0;
        } else {
          const ma = maRaw;
          const mb = mbRaw;
          const sum = ma + mb;
          shareA = mb / sum;
          shareB = ma / sum;
        }

        a.position.x -= nx * overlap * shareA;
        a.position.z -= nz * overlap * shareA;
        b.position.x += nx * overlap * shareB;
        b.position.z += nz * overlap * shareB;

        const avx = Number.isFinite(a.vx) ? a.vx : 0;
        const avz = Number.isFinite(a.vz) ? a.vz : 0;
        const bvx = Number.isFinite(b.vx) ? b.vx : 0;
        const bvz = Number.isFinite(b.vz) ? b.vz : 0;
        // Сближение вдоль нормали: >0 значит едут друг в друга. Не hypot всех vx —
        // иначе касание боком или чужая пара в мире даёт ложный bodyHit.
        const closing = -((bvx - avx) * nx + (bvz - avz) * nz);
        const isNew = contacts.isNewContact(a, b);
        if (isNew) {
          // До отскока: impulse = closing, как bodyHit.speed.
          maybeEmitCrash(engine, a, b, nx, nz);
          applyBounceImpulse(a, b, nx, nz);
        }
        if (isNew && closing > 1) {
          engine.emit('bodyHit', { a, b, speed: closing });
        }
      }
    }
  };
}
