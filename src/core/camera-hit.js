// ФАЙЛЫ: src/core/camera-hit.js
// Короткая мягкая тряска камеры при ударе. Подписки вешает лид.

export const SHAKE_MAX = 0.15;
export const SHAKE_TIME = 0.3;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function sameRef(node, player) {
  if (!node || !player) return false;
  if (node === player) return true;
  if (player.body && node === player.body) return true;
  const veh = player.inVehicle;
  if (veh && (node === veh || node === veh.body)) return true;
  return false;
}

function partyHitsPlayer(party, player) {
  if (!party) return false;
  const nodes = [party, party.ref, party.body];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    if (n.kind === 'player') return true;
    if (sameRef(n, player)) return true;
  }
  return false;
}

/**
 * Игрок или его машина в паре bodyHit.
 * player = state.player. true если a или b (или .ref / .body) это player, player.body,
 * player.inVehicle или player.inVehicle.body, либо kind==='player'.
 * Нет player/detail → false.
 */
export function hitConcernsPlayer(detail, player) {
  if (!detail || !player) return false;
  return partyHitsPlayer(detail.a, player) || partyHitsPlayer(detail.b, player);
}

/**
 * Пружина-lerp: k = 1-exp(-dt*omega), omega нет → 14.
 * a,b = {x,y,z}. Не finite → взять b. Возврат новый {x,y,z}.
 */
export function lerpCam(a, b, dt, omega) {
  const bx = finite(b && b.x) ? b.x : 0;
  const by = finite(b && b.y) ? b.y : 0;
  const bz = finite(b && b.z) ? b.z : 0;
  const aOk = a && finite(a.x) && finite(a.y) && finite(a.z);
  if (!aOk) return { x: bx, y: by, z: bz };
  const d = finite(dt) ? dt : 0;
  const w = finite(omega) ? omega : 14;
  const k = 1 - Math.exp(-d * w);
  return {
    x: a.x + (bx - a.x) * k,
    y: a.y + (by - a.y) * k,
    z: a.z + (bz - a.z) * k,
  };
}

/**
 * Не подписываться на engine. Лид:
 *   on('bodyHit', d => { if (hitConcernsPlayer(d, player)) shake.onHit(d.speed); })
 *   on('playerDamage', d => shake.onDamage(d.amount))
 */
export function createHitShake() {
  let amp = 0;
  let tHit = 0;
  let t = 0;

  return {
    onHit(speed) {
      const s = finite(speed) ? speed : 0;
      const add = Math.min(SHAKE_MAX, s * 0.008);
      amp = Math.min(SHAKE_MAX, amp + add);
      tHit = 0;
    },
    onDamage(amount) {
      const n = finite(amount) ? amount : 0;
      const add = Math.min(SHAKE_MAX, n * 0.004);
      amp = Math.min(SHAKE_MAX, amp + add);
      tHit = 0;
    },
    offset(dt) {
      const d = finite(dt) ? dt : 0;
      tHit += d;
      t += d;
      if (finite(amp)) amp *= Math.exp(-d * 10);
      else amp = 0;

      if (tHit >= SHAKE_TIME || amp < 0.001) {
        amp = 0;
        return { x: 0, y: 0, z: 0 };
      }

      let x = amp * Math.sin(t * 37);
      let y = amp * Math.sin(t * 53);
      let z = amp * Math.sin(t * 41);
      if (!finite(x)) x = 0;
      if (!finite(y)) y = 0;
      if (!finite(z)) z = 0;
      x = Math.max(-SHAKE_MAX, Math.min(SHAKE_MAX, x));
      y = Math.max(-SHAKE_MAX, Math.min(SHAKE_MAX, y));
      z = Math.max(-SHAKE_MAX, Math.min(SHAKE_MAX, z));
      const len = Math.hypot(x, y, z);
      if (len > SHAKE_MAX && len > 0) {
        const s = SHAKE_MAX / len;
        x *= s;
        y *= s;
        z *= s;
      }
      return { x, y, z };
    },
  };
}
