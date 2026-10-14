// ФАЙЛЫ: src/core/post-reflect.js
// Упрощённые отражения огней на мокрой дороге (нижняя треть кадра).
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/** wet из state.weather.wet, clamp 0..1. Нет числа / нет weather → 0. Не читать state.render.wet. */
export function readWeatherWet(engine) {
  const weather = engine && engine.state && engine.state.weather;
  if (!weather || !finiteNumber(weather.wet)) return 0;
  return clamp01(weather.wet);
}

/**
 * low или нет quality как 'medium'|'high' с wet≤0.3 → 0.
 * Иначе (wet-0.3)/0.7, clamp 0..1.
 */
export function reflectAmount(engine) {
  const wet = readWeatherWet(engine);
  const quality = engine && engine.state && engine.state.settings && engine.state.settings.quality;
  if (quality === 'low') return 0;
  if (wet <= 0.3) return 0;
  return clamp01((wet - 0.3) / 0.7);
}

/**
 * Пишет только reflect. Не затирать exposure / bloomStrength / bloomThreshold.
 * engine.state.render = существующий объект или {}.
 * render.reflect = reflectAmount(engine).
 */
export function writeReflectState(engine) {
  if (!engine || !engine.state) return;
  const amount = reflectAmount(engine);
  const render = engine.state.render && typeof engine.state.render === 'object' ? engine.state.render : {};
  engine.state.render = render;
  render.reflect = amount;
}

export const REFLECT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    reflectAmt: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float reflectAmt;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      if (vUv.y >= 0.42 || reflectAmt <= 0.0) {
        gl_FragColor = src;
        return;
      }
      vec2 ru = vec2(vUv.x, min(0.98, 0.84 - vUv.y));
      vec4 lit = texture2D(tDiffuse, ru);
      float luma = dot(lit.rgb, vec3(0.299, 0.587, 0.114));
      float mask = step(0.65, luma);
      vec3 mixed = mix(src.rgb, lit.rgb, clamp(reflectAmt, 0.0, 1.0) * mask);
      gl_FragColor = vec4(mixed, src.a);
    }
  `,
};

/** new ShaderPass(REFLECT_SHADER). В композер не добавлять. */
export function createReflectPass() {
  return new ShaderPass(REFLECT_SHADER);
}

/**
 * writeReflectState(engine).
 * pass.uniforms.reflectAmt.value = amount.
 * pass.enabled = amount > 0 (нет enabled — только uniform).
 * Нет pass/uniforms — ничего, не бросать.
 */
export function updateReflectPass(pass, engine) {
  writeReflectState(engine);
  if (!pass || !pass.uniforms || !pass.uniforms.reflectAmt) return;
  const amount = reflectAmount(engine);
  pass.uniforms.reflectAmt.value = amount;
  if ('enabled' in pass) pass.enabled = amount > 0;
}
