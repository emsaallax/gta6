// ФАЙЛЫ: src/core/post-grade.js, src/core/wet-material.js
// Цветокор и виньетка: тёплый день / холодно-неоновая ночь из state.time.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Ночь 0..1. Как CONTRACTS §1a. time не число → 0. 5→6: 1→0; 18.5→19.5: 0→1. */
export function nightAmount(time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return 0;
  if (time < 5 || time >= 19.5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time >= 18.5 && time < 19.5) return time - 18.5;
  if (time >= 5 && time < 6) return 1 - (time - 5);
  return 0;
}

export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    warm: { value: 1 },
    exposure: { value: 1 },
    vignette: { value: 0.28 },
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
    uniform float warm;
    uniform float exposure;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 dayT = vec3(1.05, 1.0, 0.93);
      vec3 nightT = vec3(0.90, 0.95, 1.10);
      vec3 g = c.rgb * mix(nightT, dayT, clamp(warm, 0.0, 1.0));
      g *= mix(1.0, clamp(exposure, 0.5, 1.5), 0.15);
      g = mix(vec3(0.5), g, 1.06);
      float d = dot(vUv - 0.5, vUv - 0.5);
      float v = 1.0 - vignette * d * 2.2;
      gl_FragColor = vec4(g * v, c.a);
    }
  `,
};

/** new ShaderPass(GRADE_SHADER). Возврат pass. В композер не добавлять. */
export function createGradePass() {
  return new ShaderPass(GRADE_SHADER);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * warm = 1 - nightAmount(engine.state.time).
 * exposure = state.render.exposure, если конечное число, иначе 1.0.
 * pass.uniforms.warm.value = warm;
 * pass.uniforms.exposure.value = exposure;
 * vignette не менять (0.28).
 * Полный toneMappingExposure ставит render-tonemap — в шейдере только лёгкий mix 0.15, не g *= exposure.
 */
export function updateGradePass(pass, engine) {
  if (!pass || !pass.uniforms) return;
  const state = engine && engine.state;
  const time = state ? state.time : undefined;
  const warm = 1 - nightAmount(time);
  const render = state && state.render;
  const exposure = render && finiteNumber(render.exposure) ? render.exposure : 1.0;
  pass.uniforms.warm.value = warm;
  pass.uniforms.exposure.value = exposure;
}
