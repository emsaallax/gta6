// ФАЙЛЫ: src/core/camera-vehicle.js
// Камера в машине: мышь, возврат за спину, пружина, крен, тряска.

export const LOOK_IDLE = 1.2;
export const YAW_RETURN_TAU = 0.4;
export const CAM_DIST_MIN = 3;
export const CAM_DIST_MAX = 15;
export const SPRING_OMEGA = 8;
export const ROLL_MAX = 0.1;

function wrapPi(a) {
  const twoPi = Math.PI * 2;
  a = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

function finite(n) {
  return Number.isFinite(n);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Пешком (vehicle=false): idle=0, вернуть { yaw, idle: 0 } (yaw как пришёл; не finite → 0).
 * В машине:
 *   |mouseDx|>=0.4 или |mouseDy|>=0.4 → idle=0, yaw без изменений (мышь уже добавил CameraRig).
 *   иначе idle += dt; если idle < 1.2 — yaw без изменений;
 *   иначе yaw = wrapPi(yaw); yaw += (0-yaw)*(1-Math.exp(-dt/0.4)).
 * yaw/idle не finite → 0.
 * Возврат: { yaw, idle }
 */
export function stepVehicleLook(yaw, idle, mouseDx, mouseDy, dt, vehicle) {
  if (!finite(yaw)) yaw = 0;
  if (!finite(idle)) idle = 0;
  if (!vehicle) {
    return { yaw, idle: 0 };
  }
  const dx = finite(mouseDx) ? mouseDx : 0;
  const dy = finite(mouseDy) ? mouseDy : 0;
  if (Math.abs(dx) >= 0.4 || Math.abs(dy) >= 0.4) {
    idle = 0;
  } else {
    idle += finite(dt) ? dt : 0;
    if (idle >= LOOK_IDLE) {
      yaw = wrapPi(yaw);
      const stepDt = finite(dt) ? dt : 0;
      yaw += (0 - yaw) * (1 - Math.exp(-stepDt / YAW_RETURN_TAU));
    }
  }
  if (!finite(yaw)) yaw = 0;
  if (!finite(idle)) idle = 0;
  return { yaw, idle };
}

/**
 * Желаемая точка камеры в машине без NaN, xz-дистанция до цели 3..15 м.
 * desired={x,y,z}, targetPos=cameraTarget.position, heading=cameraTarget.heading??0.
 * 1) любая координата desired не finite → запас:
 *    x = targetPos.x + Math.sin(heading)*11
 *    y = (targetPos.y||0) + 1.4
 *    z = targetPos.z + Math.cos(heading)*11
 * 2) dx,dz = desired.xz - targetPos.xz; dist = hypot(dx,dz);
 *    dist не finite или dist<3 → dist=3; dist>15 → dist=15;
 *    если hypot(dx,dz)<1e-8 — взять (sin(heading), cos(heading)).
 *    xz = target + dir * dist.
 * 3) y не finite → targetPos.y+1.4.
 * Возврат { x, y, z }.
 */
export function stabilizeVehicleCam(desired, targetPos, heading) {
  const h = finite(heading) ? heading : 0;
  const tx = targetPos && finite(targetPos.x) ? targetPos.x : 0;
  const ty = targetPos && finite(targetPos.y) ? targetPos.y : 0;
  const tz = targetPos && finite(targetPos.z) ? targetPos.z : 0;

  let x = desired && desired.x;
  let y = desired && desired.y;
  let z = desired && desired.z;

  if (!finite(x) || !finite(y) || !finite(z)) {
    x = tx + Math.sin(h) * 11;
    y = ty + 1.4;
    z = tz + Math.cos(h) * 11;
  }

  let dx = x - tx;
  let dz = z - tz;
  const hypot = Math.hypot(dx, dz);
  let dist = hypot;
  if (!finite(dist) || dist < CAM_DIST_MIN) dist = CAM_DIST_MIN;
  if (dist > CAM_DIST_MAX) dist = CAM_DIST_MAX;

  if (!finite(hypot) || hypot < 1e-8) {
    dx = Math.sin(h);
    dz = Math.cos(h);
  } else {
    dx /= hypot;
    dz /= hypot;
  }

  x = tx + dx * dist;
  z = tz + dz * dist;

  if (!finite(y)) y = ty + 1.4;
  if (!finite(x)) x = tx + Math.sin(h) * CAM_DIST_MIN;
  if (!finite(z)) z = tz + Math.cos(h) * CAM_DIST_MIN;
  if (!finite(y)) y = 1.4;

  return { x, y, z };
}

/**
 * Пружина: из a в b, k = 1-exp(-dt*omega). omega нет → 8.
 * a,b — {x,y,z}. Не finite в результате → взять b.
 * Возврат { x, y, z } новый объект.
 */
export function springPos(a, b, dt, omega) {
  const w = finite(omega) ? omega : SPRING_OMEGA;
  const k = 1 - Math.exp(-(finite(dt) ? dt : 0) * w);
  const bx = b && finite(b.x) ? b.x : 0;
  const by = b && finite(b.y) ? b.y : 0;
  const bz = b && finite(b.z) ? b.z : 0;
  const ax = a && finite(a.x) ? a.x : bx;
  const ay = a && finite(a.y) ? a.y : by;
  const az = a && finite(a.z) ? a.z : bz;
  let x = ax + (bx - ax) * k;
  let y = ay + (by - ay) * k;
  let z = az + (bz - az) * k;
  if (!finite(x)) x = bx;
  if (!finite(y)) y = by;
  if (!finite(z)) z = bz;
  return { x, y, z };
}

/** Крен в машине: clamp(speed,0,40)/40 * ROLL_MAX * clamp(yawDelta,-1,1) * -1. Не finite → 0. */
export function vehicleRoll(speed, yawDelta) {
  const s = finite(speed) ? speed : 0;
  const yd = finite(yawDelta) ? yawDelta : 0;
  const roll = (clamp(s, 0, 40) / 40) * ROLL_MAX * clamp(yd, -1, 1) * -1;
  return finite(roll) ? roll : 0;
}

/**
 * Тряска. Не подписываться на события самим — лид вызовет onHit из engine.on('bodyHit').
 * onHit(speed): amp = min(0.35, (speed||0)*0.03), добавить к текущей.
 * offset(dt): amp *= exp(-dt*6); вернуть { x: amp*sin(t*37), y: amp*sin(t*53), z: amp*sin(t*41) }.
 * t копить внутри.
 */
export function createCameraShake() {
  let amp = 0;
  let t = 0;
  return {
    onHit(speed) {
      const add = Math.min(0.35, (speed || 0) * 0.03);
      amp += finite(add) ? add : 0;
      if (!finite(amp)) amp = 0;
    },
    offset(dt) {
      t += finite(dt) ? dt : 0;
      amp *= Math.exp(-(finite(dt) ? dt : 0) * 6);
      if (!finite(amp)) amp = 0;
      if (!finite(t)) t = 0;
      const x = amp * Math.sin(t * 37);
      const y = amp * Math.sin(t * 53);
      const z = amp * Math.sin(t * 41);
      return {
        x: finite(x) ? x : 0,
        y: finite(y) ? y : 0,
        z: finite(z) ? z : 0,
      };
    },
  };
}
