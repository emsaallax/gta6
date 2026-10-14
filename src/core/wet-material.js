// ФАЙЛЫ: src/core/post-grade.js, src/core/wet-material.js
// Мокрый материал: roughness/envMap из state.render.wet или ночи по state.time.
import { nightAmount } from './post-grade.js';

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 0..1. Если state.render.wet — конечное число, clamp 0..1.
 * Иначе ночь из state.time: 5→6 1→0, 18.5→19.5 0→1, ночь 1, день 0.
 * Нет engine/state → 0.
 */
export function readWet(engine) {
  if (!engine || !engine.state) return 0;
  const render = engine.state.render;
  if (render && finiteNumber(render.wet)) return clamp01(render.wet);
  return clamp01(nightAmount(engine.state.time));
}

/**
 * Первый вызов: сохранить material.userData._dryRoughness = roughness ?? 0.9
 * и _dryEnv = envMapIntensity ?? 0.4 (если ещё не сохранены).
 * wet clamp 0..1.
 * roughness = lerp(dryR, 0.22, wet)
 * envMapIntensity = lerp(dryE, 1.35, wet)
 * metalness не менять. material.needsUpdate = true.
 * Нет material — ничего.
 */
export function applyWetToMaterial(material, wet) {
  if (!material) return;
  if (!material.userData) material.userData = {};
  const data = material.userData;
  if (!finiteNumber(data._dryRoughness)) {
    data._dryRoughness = finiteNumber(material.roughness) ? material.roughness : 0.9;
  }
  if (!finiteNumber(data._dryEnv)) {
    data._dryEnv = finiteNumber(material.envMapIntensity) ? material.envMapIntensity : 0.4;
  }
  const t = clamp01(finiteNumber(wet) ? wet : 0);
  material.roughness = lerp(data._dryRoughness, 0.22, t);
  material.envMapIntensity = lerp(data._dryEnv, 1.35, t);
  material.needsUpdate = true;
}
