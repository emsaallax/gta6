// ФАЙЛЫ: src/core/bodies-bounce.js
/** Одноразовый импульс отскока: не копит заднюю скорость. */

export const RESTITUTION = 0.2;

function isFixed(mass) {
  return !(mass > 0) || !Number.isFinite(mass);
}

function readSpeed(body, key) {
  const v = body[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function massShares(a, b) {
  const aFixed = isFixed(a.mass);
  const bFixed = isFixed(b.mass);
  if (aFixed) return { shareA: 0, shareB: 1, bothFixed: bFixed };
  if (bFixed) return { shareA: 1, shareB: 0, bothFixed: false };
  const ma = a.mass;
  const mb = b.mass;
  const sum = ma + mb;
  return { shareA: mb / sum, shareB: ma / sum, bothFixed: false };
}

function pairKey(ids, nextId, a, b) {
  let ia = ids.get(a);
  if (ia == null) {
    ia = nextId.n++;
    ids.set(a, ia);
  }
  let ib = ids.get(b);
  if (ib == null) {
    ib = nextId.n++;
    ids.set(b, ib);
  }
  return ia < ib ? ia + ':' + ib : ib + ':' + ia;
}

/**
 * Гасит сближение вдоль нормали (nx,nz — из a в b, единичные).
 * Не двигает position. Не инвертирует скорость в постоянный задний ход.
 */
export function applyBounceImpulse(a, b, nx, nz) {
  const avx = readSpeed(a, 'vx');
  const avz = readSpeed(a, 'vz');
  const bvx = readSpeed(b, 'vx');
  const bvz = readSpeed(b, 'vz');
  const rvn = (bvx - avx) * nx + (bvz - avz) * nz;
  if (!(rvn < 0)) return Number.isFinite(rvn) ? rvn : 0;

  const { shareA, shareB, bothFixed } = massShares(a, b);
  if (bothFixed) return rvn;

  const j = -(1 + RESTITUTION) * rvn;
  a.vx = avx - j * shareA * nx;
  a.vz = avz - j * shareA * nz;
  b.vx = bvx + j * shareB * nx;
  b.vz = bvz + j * shareB * nz;

  const after = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  return Number.isFinite(after) ? after : 0;
}

/**
 * Пары тел: импульс только на новый контакт, не каждый кадр пока пересекаются.
 */
export function createContactTracker() {
  const ids = new WeakMap();
  const nextId = { n: 1 };
  let prev = new Set();
  let curr = new Set();
  return {
    beginStep() {
      prev = curr;
      curr = new Set();
    },
    isNewContact(a, b) {
      const key = pairKey(ids, nextId, a, b);
      const wasCurrent = curr.has(key);
      const isNew = !wasCurrent && !prev.has(key);
      curr.add(key);
      return isNew;
    },
  };
}

/**
 * Выталкивание из стены (push = newPos-oldPos из resolveCircle).
 * Обнуляет вход в стену, не отражает.
 */
export function killClosingVelocity(body, pushX, pushZ) {
  const len = Math.hypot(pushX, pushZ);
  if (!(len >= 1e-10)) return;
  const nx = pushX / len;
  const nz = pushZ / len;
  const vx = readSpeed(body, 'vx');
  const vz = readSpeed(body, 'vz');
  const closing = -(vx * nx + vz * nz);
  if (closing > 0) {
    body.vx = vx + nx * closing;
    body.vz = vz + nz * closing;
  }
}
