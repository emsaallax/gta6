// ФАЙЛЫ: src/core/crash.js
// Удар тел: событие crash рядом с bodyHit, emit только из maybeEmitCrash.

export const CRASH_IMPULSE_MIN = 6;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function vel(body, key) {
  if (!body) return 0;
  const v = body[key];
  return finite(v) ? v : 0;
}

function posComponent(body, key, fallback) {
  const p = body && body.position;
  if (!p) return fallback;
  const n = p[key];
  return finite(n) ? n : fallback;
}

/**
 * Сближение вдоль a→b на XZ (м/с). Как closing в stepBodies: >0 = едут друг в друга.
 * nx,nz единичные из a в b. Нет чисел / нет vx,vz → 0.
 * impulse = max(0, closing).
 */
export function pairImpulse(a, b, nx, nz) {
  if (!finite(nx) || !finite(nz)) return 0;
  if (!a || !b) return 0;
  const avx = vel(a, 'vx');
  const avz = vel(a, 'vz');
  const bvx = vel(b, 'vx');
  const bvz = vel(b, 'vz');
  const closing = -((bvx - avx) * nx + (bvz - avz) * nz);
  if (!finite(closing)) return 0;
  return closing > 0 ? closing : 0;
}

/**
 * Точка контакта: середина position a и b.
 * y = среднее y + 0.4. Нет position → {x:0,y:0.4,z:0}. Все поля finite.
 */
export function contactPoint(a, b) {
  const hasA = a && a.position;
  const hasB = b && b.position;
  if (!hasA && !hasB) return { x: 0, y: 0.4, z: 0 };
  const ax = posComponent(a, 'x', 0);
  const ay = posComponent(a, 'y', 0);
  const az = posComponent(a, 'z', 0);
  const bx = posComponent(b, 'x', 0);
  const by = posComponent(b, 'y', 0);
  const bz = posComponent(b, 'z', 0);
  let x = (ax + bx) * 0.5;
  let y = (ay + by) * 0.5 + 0.4;
  let z = (az + bz) * 0.5;
  if (!finite(x)) x = 0;
  if (!finite(y)) y = 0.4;
  if (!finite(z)) z = 0;
  return { x, y, z };
}

function partyMatchesVehicle(party, vehicle) {
  if (!party || !vehicle) return false;
  const vBody = vehicle.body;
  const nodes = [party, party.ref, party.body];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    if (n === vehicle) return true;
    if (vBody && n === vBody) return true;
  }
  return false;
}

/**
 * true если player.inVehicle участвует в паре.
 * vehicle = player.inVehicle. Совпадение: party / party.ref / party.body === vehicle
 * или === vehicle.body. Нет player / нет inVehicle / нет detail → false.
 */
export function crashConcernsPlayerVehicle(detail, player) {
  if (!detail || !player) return false;
  const vehicle = player.inVehicle;
  if (!vehicle) return false;
  return (
    partyMatchesVehicle(detail.a, vehicle) ||
    partyMatchesVehicle(detail.b, vehicle)
  );
}

/**
 * impulse = pairImpulse(...). Если impulse > 6:
 *   engine.emit('crash', { a, b, impulse, point: contactPoint(a,b) })
 * impulse ≤ 6, нет engine/a/b — ничего. bodyHit не слать.
 */
export function maybeEmitCrash(engine, a, b, nx, nz) {
  if (!engine || typeof engine.emit !== 'function') return;
  if (!a || !b) return;
  const impulse = pairImpulse(a, b, nx, nz);
  if (!(impulse > CRASH_IMPULSE_MIN)) return;
  const point = contactPoint(a, b);
  engine.emit('crash', { a, b, impulse, point });
}
