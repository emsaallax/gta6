// Palmetto Bay — тонмаппинг ACES и exposure из state.render (группа 1, задача 01)
import * as THREE from 'three';

export const RENDER_DEFAULTS = {
  exposure: 1.0,
  bloomStrength: 0.4,
  bloomThreshold: 0.9,
};

function pickNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** renderer.toneMapping = ACESFilmic; renderer.outputColorSpace = SRGBColorSpace. Свет/небо/тени не трогать. */
export function applyTonemap(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

/**
 * Читает engine.state.render.
 * Нет поля или поля нет числа → дефолт из RENDER_DEFAULTS.
 * Возврат: { exposure, bloomStrength, bloomThreshold }
 */
export function readRenderState(engine) {
  const render = engine && engine.state && engine.state.render;
  const src = render && typeof render === 'object' ? render : {};
  return {
    exposure: pickNumber(src.exposure, RENDER_DEFAULTS.exposure),
    bloomStrength: pickNumber(src.bloomStrength, RENDER_DEFAULTS.bloomStrength),
    bloomThreshold: pickNumber(src.bloomThreshold, RENDER_DEFAULTS.bloomThreshold),
  };
}

/** renderer.toneMappingExposure = readRenderState(engine).exposure */
export function applyExposure(renderer, engine) {
  renderer.toneMappingExposure = readRenderState(engine).exposure;
}
