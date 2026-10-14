/** ФАЙЛЫ: src/core/bloom-night.js */

export const BLOOM_DAY_RADIUS = 0.4;
export const BLOOM_NIGHT_RADIUS = 0.25;
export const BLOOM_NIGHT_STRENGTH_MAX = 0.55;
export const BLOOM_NIGHT_THRESHOLD_MIN = 0.92;
export const DEFAULT_STRENGTH = 0.4;
export const DEFAULT_THRESHOLD = 0.9;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ночь 0..1 по CONTRACTS §1a из state.time.
 * time не число → 0.
 * 1, если time < 5 или time >= 19.5
 * 0, если time >= 6 и time < 18.5
 * lerp 5→6: 1→0; lerp 18.5→19.5: 0→1.
 */
export function nightAmount(time) {
  if (!isFiniteNumber(time)) return 0;
  if (time < 5 || time >= 19.5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time < 6) return 1 - (time - 5);
  return time - 18.5;
}

/**
 * Читает engine.state.time и engine.state.render.{bloomStrength, bloomThreshold}.
 * Нет числа → дефолт 0.4 / 0.9.
 * n = nightAmount(time)
 * strength = lerp(src.strength, min(src.strength, 0.55), n)
 * threshold = lerp(src.threshold, max(src.threshold, 0.92), n)
 * radius = lerp(0.4, 0.25, n)
 * Возврат: { strength, threshold, radius } все finite.
 */
export function bloomForTime(engine) {
  const state = engine && engine.state;
  const render = state && state.render;
  const n = nightAmount(state && state.time);
  const srcStrength = isFiniteNumber(render && render.bloomStrength)
    ? render.bloomStrength
    : DEFAULT_STRENGTH;
  const srcThreshold = isFiniteNumber(render && render.bloomThreshold)
    ? render.bloomThreshold
    : DEFAULT_THRESHOLD;
  const strength = lerp(
    srcStrength,
    Math.min(srcStrength, BLOOM_NIGHT_STRENGTH_MAX),
    n,
  );
  const threshold = lerp(
    srcThreshold,
    Math.max(srcThreshold, BLOOM_NIGHT_THRESHOLD_MIN),
    n,
  );
  const radius = lerp(BLOOM_DAY_RADIUS, BLOOM_NIGHT_RADIUS, n);
  return {
    strength: Number.isFinite(strength) ? strength : DEFAULT_STRENGTH,
    threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
    radius: Number.isFinite(radius) ? radius : BLOOM_DAY_RADIUS,
  };
}
