// ГРУППА 1. Чистая математика камеры (CONTRACTS §2).
export const AIM = { distance: 2.6, right: 0.7, fov: 55 };
export const FOV_FOOT = 65;
export const FOV_VEHICLE_MAX = 78;
export const FOV_SPEED_MAX = 40; // м/с
export const MIN_CAM_Y = 1.0;    // камера.y >= pos.y + 1.0 пешком
/** Контракт: возврат yaw→0 за 1.2 с. Экспонента с tau=0.4 даёт ≈95% за 1.2 с (tau=1.2 оставило бы 37%). */
export const YAW_RETURN_TIME = 1.2;
export const YAW_RETURN_TAU = 0.4;

function wrapPi(a) {
  const twoPi = Math.PI * 2;
  a = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

/** aiming true → 55. vehicle → 65…78 при speed 0…40. иначе 65. */
export function cameraFov(mode, speed, aiming) {
  if (aiming) return AIM.fov;
  if (mode === 'vehicle') {
    const s = Math.max(0, Math.min(FOV_SPEED_MAX, speed ?? 0));
    const t = s / FOV_SPEED_MAX;
    return FOV_FOOT + (FOV_VEHICLE_MAX - FOV_FOOT) * t;
  }
  return FOV_FOOT;
}

/**
 * Плавный FOV: k = 1 - exp(-dt * 8); return current + (target - current) * k.
 */
export function stepFov(current, target, dt) {
  const k = 1 - Math.exp(-dt * 8);
  return current + (target - current) * k;
}

/**
 * Пешком: вернуть yaw как есть.
 * В машине: возврат сразу, без задержки простоя.
 */
export function stepVehicleYaw(yaw, mouseDx, mouseDy, dt, vehicle) {
  if (!vehicle) return yaw;
  if (Math.abs(mouseDx) < 0.4 && Math.abs(mouseDy) < 0.4) {
    yaw = wrapPi(yaw);
    yaw += (0 - yaw) * (1 - Math.exp(-dt / YAW_RETURN_TAU));
  }
  return yaw;
}

/**
 * Желаемая точка камеры (без стен).
 */
export function desiredCameraPos(t, yaw, pitch, zoom, aiming) {
  const pos = t.position;
  const heading = t.heading ?? 0;

  if (aiming) {
    const h = heading + yaw;
    const dist = AIM.distance;
    const rightX = Math.cos(h);
    const rightZ = -Math.sin(h);
    const x = pos.x + Math.sin(h) * dist * Math.cos(pitch) + AIM.right * rightX;
    const z = pos.z + Math.cos(h) * dist * Math.cos(pitch) + AIM.right * rightZ;
    const y = Math.max(pos.y + MIN_CAM_Y + Math.sin(pitch) * dist, pos.y + MIN_CAM_Y);
    return { x, y, z };
  }

  if (t.mode === 'vehicle') {
    const dist = (t.distance ?? 11) * zoom;
    const height = t.height ?? 1.4;
    const h = heading + yaw;
    return {
      x: pos.x + Math.sin(h) * dist,
      y: pos.y + height,
      z: pos.z + Math.cos(h) * dist,
    };
  }

  const dist = (t.distance ?? 6) * zoom;
  const height = t.height ?? 2;
  const h = heading + yaw;
  const y = Math.max(pos.y + height * 0.5 + Math.sin(pitch) * dist, pos.y + MIN_CAM_Y);
  return {
    x: pos.x + Math.sin(h) * Math.cos(pitch) * dist,
    y,
    z: pos.z + Math.cos(h) * Math.cos(pitch) * dist,
  };
}

/**
 * Точка lookAt в прицеле: обычный look + 0.7 вправо.
 */
export function aimLookTarget(t, yaw, pitch) {
  const pos = t.position;
  const h = (t.heading ?? 0) + yaw;
  const rightX = Math.cos(h);
  const rightZ = -Math.sin(h);
  const lookY = pos.y + (t.height ?? 2) * 0.6;
  return {
    x: pos.x + AIM.right * rightX,
    y: lookY,
    z: pos.z + AIM.right * rightZ,
  };
}

/**
 * После lookAt. Пишет только state.camera.
 * updateMatrixWorld обязателен: lookAt не обновляет matrixWorld сразу,
 * иначе forward будет со старого кадра.
 */
export function writeCameraState(engine, yaw, pitch, zoom, mode) {
  const cam = engine.camera;
  let fx = 0;
  let fy = 0;
  let fz = -1;
  if (cam && typeof cam.updateMatrixWorld === 'function') cam.updateMatrixWorld();
  const e = cam?.matrixWorld?.elements;
  if (e) {
    // Как camera.getWorldDirection: локальный −Z мира.
    fx = -e[8];
    fy = -e[9];
    fz = -e[10];
  }
  const len = Math.hypot(fx, fy, fz) || 1;
  engine.state.camera = {
    yaw,
    pitch,
    zoom,
    mode,
    forward: { x: fx / len, y: fy / len, z: fz / len },
  };
}
