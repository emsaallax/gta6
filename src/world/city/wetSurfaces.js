// ФАЙЛЫ: src/world/city/wetSurfaces.js
// Мокрые фасады / тротуар / асфальт по state.weather.wet. Меши не создаём.

const WET_ROUGH = 0.15;
const WET_ENV = 1.4;
const DARKEN = 0.25;

const registered = [];

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function colorToHex(color) {
  if (!color) return null;
  if (typeof color.getHex === 'function') return color.getHex();
  if (finiteNumber(color)) return color >>> 0;
  return null;
}

/**
 * CONTRACTS §11: state.weather.wet, clamp 0..1; нет объекта/не число → 0
 */
export function readWet(engine) {
  if (!engine || !engine.state || !engine.state.weather) return 0;
  const wet = engine.state.weather.wet;
  if (!finiteNumber(wet)) return 0;
  return clamp01(wet);
}

/**
 * Первый вызов: userData._dryColor (hex), _dryRoughness, _dryEnv.
 * roughness = lerp(dryR, 0.15, wet)
 * envMapIntensity = lerp(dryE, 1.4, wet)
 * color = dry * (1 - 0.25*wet)
 * metalness не менять. нет mat — return
 */
export function applyWetMat(mat, wet) {
  if (!mat) return;
  if (!mat.userData) mat.userData = {};
  const data = mat.userData;
  if (!finiteNumber(data._dryRoughness)) {
    data._dryRoughness = finiteNumber(mat.roughness) ? mat.roughness : 0.9;
  }
  if (!finiteNumber(data._dryEnv)) {
    data._dryEnv = finiteNumber(mat.envMapIntensity) ? mat.envMapIntensity : 0.4;
  }
  if (!finiteNumber(data._dryColor)) {
    const hex = colorToHex(mat.color);
    data._dryColor = finiteNumber(hex) ? hex : 0x808080;
    if (mat.color) {
      data._dryR = finiteNumber(mat.color.r) ? mat.color.r : 0.5;
      data._dryG = finiteNumber(mat.color.g) ? mat.color.g : 0.5;
      data._dryB = finiteNumber(mat.color.b) ? mat.color.b : 0.5;
    }
  }
  const t = clamp01(finiteNumber(wet) ? wet : 0);
  mat.roughness = lerp(data._dryRoughness, WET_ROUGH, t);
  mat.envMapIntensity = lerp(data._dryEnv, WET_ENV, t);
  if (mat.color && finiteNumber(data._dryR)) {
    const k = 1 - DARKEN * t;
    mat.color.r = data._dryR * k;
    mat.color.g = data._dryG * k;
    mat.color.b = data._dryB * k;
  }
  mat.needsUpdate = true;
}

/** Копит ссылки, дубликаты не класть. */
export function registerWetMat(mat) {
  if (!mat) return;
  for (let i = 0; i < registered.length; i++) {
    if (registered[i] === mat) return;
  }
  registered.push(mat);
}

/** applyWetMat всем зарегистрированным. State не пишет. */
export function updateWetSurfaces(dt, engine) {
  const wet = readWet(engine);
  for (let i = 0; i < registered.length; i++) {
    applyWetMat(registered[i], wet);
  }
}
