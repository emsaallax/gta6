// Орбита камеры вокруг машины: мышь крутит yaw/pitch, через 1.5 с возврат за корму.
// Пешком yaw/pitch не трогаем — их ставит CameraRig.

export const LOOK_IDLE = 1.5;
export const LOOK_SENS = 0.003;
export const YAW_RETURN_TAU = 0.4;
export const PITCH_MIN = -0.15;
export const PITCH_MAX = 1.15;
export const PITCH_REST = 0;

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Угол в (−π, π]. Не finite → 0. */
export function wrapPi(a) {
  if (!Number.isFinite(a)) return 0;
  const twoPi = Math.PI * 2;
  let x = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (x <= -Math.PI) x += twoPi;
  return x;
}

/**
 * vehicle=false: idle=0, вернуть { yaw, pitch, idle: 0 } как пришли (не finite → 0).
 * Не менять yaw/pitch пешком — мышь там ставит CameraRig.
 *
 * vehicle=true:
 *   yaw -= (finite dx ? dx : 0) * LOOK_SENS
 *   pitch = clamp(pitch + dy * LOOK_SENS, PITCH_MIN, PITCH_MAX)
 *   |dx|>=0.4 или |dy|>=0.4 → idle=0
 *   иначе idle += dt; если idle >= 1.5:
 *     yaw = wrapPi(yaw); yaw += (0-yaw)*(1-Math.exp(-dt/0.4))
 *     pitch += (PITCH_REST-pitch)*(1-Math.exp(-dt/0.4))
 * Не finite → 0. Возврат { yaw, pitch, idle }.
 */
export function stepOrbitLook(yaw, pitch, idle, mouseDx, mouseDy, dt, vehicle) {
  const y0 = finite(yaw);
  const p0 = finite(pitch);
  if (!vehicle) {
    return { yaw: y0, pitch: p0, idle: 0 };
  }

  const dx = finite(mouseDx);
  const dy = finite(mouseDy);
  const stepDt = finite(dt);

  let y = y0 - dx * LOOK_SENS;
  let p = clamp(p0 + dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);
  let id = finite(idle);

  if (Math.abs(dx) >= 0.4 || Math.abs(dy) >= 0.4) {
    id = 0;
  } else {
    id += stepDt;
    if (id >= LOOK_IDLE) {
      y = wrapPi(y);
      const k = 1 - Math.exp(-stepDt / YAW_RETURN_TAU);
      y += (0 - y) * k;
      p += (PITCH_REST - p) * k;
    }
  }

  return {
    yaw: finite(y),
    pitch: finite(p),
    idle: finite(id),
  };
}

/**
 * Точка камеры вокруг машины с yaw и pitch.
 * t = { position, heading, distance, height } из state.cameraTarget.
 * Нет pos / не finite → запас: pos=(0,0,0), dist=11, height=1.4.
 * Возврат { x, y, z } все finite.
 */
export function desiredVehicleOrbit(t, yaw, pitch, zoom) {
  const src = t && typeof t === 'object' ? t : {};
  const raw = src.position;
  const hasPos =
    raw &&
    typeof raw === 'object' &&
    Number.isFinite(raw.x) &&
    Number.isFinite(raw.y) &&
    Number.isFinite(raw.z);

  let px = 0;
  let py = 0;
  let pz = 0;
  let dist = 11;
  let height = 1.4;

  if (hasPos) {
    px = raw.x;
    py = raw.y;
    pz = raw.z;
    dist = src.distance ?? 11;
    if (!Number.isFinite(dist)) dist = 11;
    height = src.height ?? 1.4;
    if (!Number.isFinite(height)) height = 1.4;
  }

  const heading = finite(src.heading ?? 0);
  const h = heading + finite(yaw);
  const zoomMul = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  dist *= zoomMul;

  const pit = finite(pitch);
  const cosP = Math.cos(pit);
  const x = px + Math.sin(h) * dist * cosP;
  const y = Math.max(py + 0.5, py + height + Math.sin(pit) * dist);
  const z = pz + Math.cos(h) * dist * cosP;

  return { x: finite(x), y: finite(y), z: finite(z) };
}
