// ФАЙЛЫ: src/world/city/windowNight.js
/** Ночные окна: emissive ≤ 1.6. Свет даёт bloom. Неон не трогать. */

export const WINDOW_EMISSIVE_MAX = 1.6;

const registered = [];

/**
 * Ночь 0..1 по CONTRACTS §1a (как в задаче 01).
 * Нет числа → 0; ≥19.5 или <5 → 1; ≥6 и <18.5 → 0;
 * 18.5…19.5 → t-18.5; 5…6 → 1-(t-5).
 * @param {unknown} time
 * @returns {number}
 */
export function night01(time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return 0;
  const t = ((time % 24) + 24) % 24;
  if (t >= 19.5 || t < 5) return 1;
  if (t >= 6 && t < 18.5) return 0;
  if (t >= 18.5) return t - 18.5;
  return 1 - (t - 5);
}

/**
 * Яркость окон. Потолок строго 1.6 даже при night=1.
 * @param {unknown} time
 * @returns {number}
 */
export function windowEmissive(time) {
  const v = night01(time) * WINDOW_EMISSIVE_MAX;
  if (v <= 0) return 0;
  if (v >= WINDOW_EMISSIVE_MAX) return WINDOW_EMISSIVE_MAX;
  return v;
}

/**
 * Ставит emissiveIntensity всем материалам. Нет mats — return.
 * @param {Array<{ emissiveIntensity?: number }>|null|undefined} mats
 * @param {unknown} time
 */
export function applyWindowMats(mats, time) {
  if (!mats || !mats.length) return;
  const intensity = windowEmissive(time);
  for (let i = 0; i < mats.length; i++) {
    const mat = mats[i];
    if (mat) mat.emissiveIntensity = intensity;
  }
}

/**
 * Регистрирует материал окон. Дубликаты не класть. Неон / вывески не регистрировать.
 * @param {{ emissiveIntensity?: number }|null|undefined} mat
 */
export function registerWindowMat(mat) {
  if (!mat) return;
  for (let i = 0; i < registered.length; i++) {
    if (registered[i] === mat) return;
  }
  registered.push(mat);
}

/**
 * Обновление по state.time. Сцену не обходить. State не писать.
 * Нет state.time — intensity 0, не падать.
 * @param {number} dt
 * @param {{ state?: { time?: unknown } }|null|undefined} engine
 */
export function updateWindowNight(dt, engine) {
  void dt;
  let time;
  try {
    time = engine && engine.state ? engine.state.time : undefined;
  } catch (e) {
    time = undefined;
  }
  applyWindowMats(registered, time);
}
