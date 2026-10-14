// ФАЙЛЫ: src/player/turn-heading.js
// Разворот корпуса героя по ходу (slerp ~0.25 с). При прицеле — на camera.forward.

export const TURN_TIME = 0.25;

function shortestDelta(current, target) {
  const d = target - current;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/**
 * Кратчайший угол current→target, k = 1-Math.exp(-dt/time), time по умолчанию 0.25.
 * Не finite → current или 0.
 */
export function slerpAngle(current, target, dt, time) {
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(target) || !Number.isFinite(dt)) return current;
  const tau = time == null || !Number.isFinite(time) ? TURN_TIME : time;
  if (!(tau > 0) || dt <= 0) return current;
  const k = 1 - Math.exp(-dt / tau);
  return current + shortestDelta(current, target) * k;
}

/**
 * aiming===true и camForward есть: target = atan2(camForward.x, camForward.z).
 * иначе spd=hypot(move.vx, move.vz): если spd>0.15 — target=atan2(vx,vz); иначе не крутить.
 * move.heading = slerpAngle(move.heading, target, dt, 0.25).
 * object3d.rotation.y = move.heading.
 * Нет object3d/move — no-op.
 */
export function stepHeroTurn(object3d, move, aiming, camForward, dt) {
  if (!object3d || !move) return;

  let target = null;
  const hasCam =
    camForward &&
    Number.isFinite(camForward.x) &&
    Number.isFinite(camForward.z);

  if (aiming === true && hasCam) {
    target = Math.atan2(camForward.x, camForward.z);
  } else {
    const vx = Number.isFinite(move.vx) ? move.vx : 0;
    const vz = Number.isFinite(move.vz) ? move.vz : 0;
    const spd = Math.hypot(vx, vz);
    if (spd > 0.15) target = Math.atan2(vx, vz);
  }

  if (target != null) {
    move.heading = slerpAngle(move.heading, target, dt, TURN_TIME);
  }
  object3d.rotation.y = move.heading;
}
