/** ФАЙЛЫ: src/core/timescale.js */

export const TIME_SCALE_MIN = 0.2;
export const TIME_SCALE_MAX = 1;
export const SLOWMO_SCALE = 0.3;
export const SLOWMO_DURATION = 1.5;
export const SLOWMO_EASE = 0.2;
export const SLOWMO_COOLDOWN = 10;
export const SLOWMO_IMPULSE = 12;

/** Не число → 1. Иначе clamp 0.2..1. */
export function clampTimeScale(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return TIME_SCALE_MAX;
  if (v < TIME_SCALE_MIN) return TIME_SCALE_MIN;
  if (v > TIME_SCALE_MAX) return TIME_SCALE_MAX;
  return v;
}

/**
 * Пишет только engine.state.timeScale = clampTimeScale(value).
 * Другие поля state не трогать. Нет engine.state — ничего.
 */
export function writeTimeScale(engine, value) {
  if (!engine || !engine.state) return;
  engine.state.timeScale = clampTimeScale(value);
}

/**
 * dt * clampTimeScale(engine.state.timeScale). Нет поля / нет engine → dt как пришёл.
 * Не писать state.
 */
export function scaledDt(dt, engine) {
  if (!engine || !engine.state || engine.state.timeScale == null) return dt;
  return dt * clampTimeScale(engine.state.timeScale);
}

function partyMatchesVehicle(party, vehicle) {
  if (!party || !vehicle) return false;
  const vb = vehicle.body;
  return (
    party === vehicle ||
    party === vb ||
    party.ref === vehicle ||
    party.ref === vb ||
    party.body === vehicle ||
    party.body === vb
  );
}

/** Тот же смысл, что crashConcernsPlayerVehicle, без импорта crash.js. */
function crashIsPlayerVehicle(detail, player) {
  if (!detail || !player) return false;
  const vehicle = player.inVehicle;
  if (!vehicle) return false;
  return partyMatchesVehicle(detail.a, vehicle) || partyMatchesVehicle(detail.b, vehicle);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function slowMoScaleAt(t) {
  if (t <= 0) return TIME_SCALE_MAX;
  if (t >= SLOWMO_DURATION) return TIME_SCALE_MAX;
  const easeOutStart = SLOWMO_DURATION - SLOWMO_EASE;
  if (t < SLOWMO_EASE) {
    return lerp(TIME_SCALE_MAX, SLOWMO_SCALE, t / SLOWMO_EASE);
  }
  if (t < easeOutStart) return SLOWMO_SCALE;
  const u = (t - easeOutStart) / SLOWMO_EASE;
  return lerp(SLOWMO_SCALE, TIME_SCALE_MAX, u);
}

/**
 * Таймер от realtime dt (немасштабированного).
 * Самим emit/on не вызывать. Не импортировать crash.js.
 */
export function createSlowMo() {
  let active = false;
  let t = 0;
  let cooldownElapsed = SLOWMO_COOLDOWN;

  return {
    onCrash(detail, player) {
      if (!detail || typeof detail.impulse !== 'number' || !Number.isFinite(detail.impulse)) return;
      if (detail.impulse < SLOWMO_IMPULSE) return;
      if (!crashIsPlayerVehicle(detail, player)) return;
      if (cooldownElapsed < SLOWMO_COOLDOWN) return;
      active = true;
      t = 0;
      cooldownElapsed = 0;
    },

    update(dt, engine) {
      const step = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
      cooldownElapsed += step;
      if (!active) {
        writeTimeScale(engine, TIME_SCALE_MAX);
        return;
      }
      t += step;
      if (t >= SLOWMO_DURATION) {
        active = false;
        t = SLOWMO_DURATION;
        writeTimeScale(engine, TIME_SCALE_MAX);
        return;
      }
      writeTimeScale(engine, clampTimeScale(slowMoScaleAt(t)));
    },
  };
}
