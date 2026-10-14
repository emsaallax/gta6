// ФАЙЛЫ: src/vehicles/wetGrip.js
// Мокрая дорога: слабее тормоз, легче занос, мокрый кузов. Нос по скорости (L14).

export const WET_ON = 0.5;
export const BRAKE_WET = 0.7;
export const SLIP_WET = 1.8;
/** Блокер L14: макс. угол носа к heading на заносе. */
export const NOSE_SLIP_MAX = (25 * Math.PI) / 180;
/** Возврат носа к цели за 0.5 с. */
export const NOSE_ALIGN_T = 0.5;
const SPEED_ALIGN = 2;

const origMats = new WeakMap();

/** wet 0..1; нет/не число → 0. */
export function wetAmount(weather) {
  if (!weather || typeof weather.wet !== 'number' || !Number.isFinite(weather.wet)) return 0;
  const w = weather.wet;
  if (w < 0) return 0;
  if (w > 1) return 1;
  return w;
}

export function isWetRoad(weather) {
  return wetAmount(weather) > WET_ON;
}

/** wet>0.5 → { brakeMul: 0.7, slipMul: 1.8 }, иначе { brakeMul: 1, slipMul: 1 }. */
export function wetDriveMul(weather) {
  if (isWetRoad(weather)) return { brakeMul: BRAKE_WET, slipMul: SLIP_WET };
  return { brakeMul: 1, slipMul: 1 };
}

function clampSteer(v) {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return 1;
  if (v < -1) return -1;
  return v;
}

/**
 * Доп. занос только если isWetRoad.
 * |steer|>0.2 и abs(speed)>4: сдвиг position поперёк heading
 * на speed * 0.22 * slipMul * steerClamped * dt.
 * steer брать из vehicle.steer (фоллбек controls.steer).
 * body.vx/vz не писать (их пишет drive). rotation не трогать.
 * Нет position — return.
 */
export function applyWetSlip(vehicle, dt, weather, controls) {
  if (!vehicle || !vehicle.position) return;
  if (!isWetRoad(weather)) return;
  const pos = vehicle.position;
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
  const t = Number(dt);
  if (!Number.isFinite(t) || t === 0) return;

  let steer = vehicle.steer;
  if (typeof steer !== 'number' || !Number.isFinite(steer)) {
    steer = controls && typeof controls.steer === 'number' ? controls.steer : 0;
  }
  const steerClamped = clampSteer(steer);
  const speed = Number(vehicle.speed);
  if (!Number.isFinite(speed)) return;
  if (Math.abs(steerClamped) <= 0.2 || Math.abs(speed) <= 4) return;

  const { slipMul } = wetDriveMul(weather);
  const amount = speed * 0.22 * slipMul * steerClamped * t;
  const heading = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  // Поперёк heading: вправо от (sin, cos) — (cos, -sin); знак задаёт руль.
  pos.x += Math.cos(heading) * amount;
  pos.z += -Math.sin(heading) * amount;
}

function shortestDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Блокер L14. При |speed|>2 м/с нос смотрит по atan2(body.vx, body.vz),
 * не только по vehicle.heading. На заносе угол к heading ≤ 25°.
 * Возврат к цели за 0.5 с. Пишет object3d.rotation.y (YXZ), heading не меняет.
 * applyWetSlip rotation не трогает — звать это отдельно.
 */
export function alignNoseToVelocity(vehicle, dt) {
  if (!vehicle) return;
  const heading = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  const body = vehicle.body;
  const vx = body && Number.isFinite(body.vx) ? body.vx : 0;
  const vz = body && Number.isFinite(body.vz) ? body.vz : 0;
  const vlen = Math.hypot(vx, vz);
  const absSpeed = Number.isFinite(vehicle.speed) ? Math.abs(vehicle.speed) : vlen;
  const moving = vlen > SPEED_ALIGN || absSpeed > SPEED_ALIGN;

  let target = heading;
  if (moving && vlen > 1e-6) {
    const velYaw = Math.atan2(vx, vz);
    let slip = shortestDelta(heading, velYaw);
    if (slip > NOSE_SLIP_MAX) slip = NOSE_SLIP_MAX;
    if (slip < -NOSE_SLIP_MAX) slip = -NOSE_SLIP_MAX;
    target = heading + slip;
  }

  const obj = vehicle.object3d;
  let current = heading;
  if (obj && obj.rotation && Number.isFinite(obj.rotation.y)) current = obj.rotation.y;
  else if (Number.isFinite(vehicle._noseY)) current = vehicle._noseY;

  const t = Number(dt);
  const k = !Number.isFinite(t) || t <= 0 ? 1 : Math.min(1, t / NOSE_ALIGN_T);
  const next = current + shortestDelta(current, target) * k;
  vehicle._noseY = next;

  if (obj && obj.rotation) {
    if (obj.rotation.order !== 'YXZ') obj.rotation.order = 'YXZ';
    obj.rotation.y = next;
  }
}

function snapshotMat(mat) {
  const snap = {};
  if (mat.color && Number.isFinite(mat.color.r)) {
    snap.color = { r: mat.color.r, g: mat.color.g, b: mat.color.b };
  }
  if (typeof mat.roughness === 'number' && Number.isFinite(mat.roughness)) {
    snap.roughness = mat.roughness;
  }
  if (typeof mat.envMapIntensity === 'number' && Number.isFinite(mat.envMapIntensity)) {
    snap.envMapIntensity = mat.envMapIntensity;
  }
  return snap;
}

function applyOneMat(mat, k) {
  if (!mat) return;
  let orig = origMats.get(mat);
  if (!orig) {
    orig = snapshotMat(mat);
    origMats.set(mat, orig);
  }
  if (orig.color && mat.color) {
    const dim = 1 - 0.25 * k;
    mat.color.r = orig.color.r * dim;
    mat.color.g = orig.color.g * dim;
    mat.color.b = orig.color.b * dim;
  }
  if (typeof orig.roughness === 'number' && typeof mat.roughness === 'number') {
    mat.roughness = orig.roughness + (0.15 - orig.roughness) * k;
  }
  if (typeof orig.envMapIntensity === 'number' && typeof mat.envMapIntensity === 'number') {
    mat.envMapIntensity = orig.envMapIntensity + 0.8 * k;
  }
}

function applyNodeMats(node, k) {
  if (!node || !node.material) return;
  const m = node.material;
  if (Array.isArray(m)) {
    for (let i = 0; i < m.length; i++) applyOneMat(m[i], k);
  } else {
    applyOneMat(m, k);
  }
}

/**
 * Материалы мешей vehicle.object3d.
 * orig в WeakMap: { color, roughness, envMapIntensity }.
 * k = wetAmount. roughness → lerp(orig, 0.15, k).
 * color умножить на (1 - 0.25*k) от orig.
 * envMapIntensity → orig + 0.8*k (нет поля — пропуск).
 * Нет material — пропуск. Не бросать.
 */
export function applyWetMaterials(vehicle, weather) {
  try {
    if (!vehicle || !vehicle.object3d) return;
    const k = wetAmount(weather);
    const root = vehicle.object3d;
    if (typeof root.traverse === 'function') {
      root.traverse((node) => applyNodeMats(node, k));
    } else {
      applyNodeMats(root, k);
    }
  } catch (_e) {
    /* не бросать */
  }
}
