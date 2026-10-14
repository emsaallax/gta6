/** ФАЙЛЫ: src/core/post-luma.js */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ночь 0..1 по CONTRACTS §1a из time.
 * не число → 0.
 * time < 5 или time >= 19.5 → 1
 * time >= 6 и time < 18.5 → 0
 * 5→6: 1→0; 18.5→19.5: 0→1.
 */
export function nightAmount(time) {
  if (!isFiniteNumber(time)) return 0;
  if (time < 5 || time >= 19.5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time < 6) return 1 - (time - 5);
  return time - 18.5;
}

export const KNEE_NIGHT = 0.72;
export const STRENGTH_NIGHT = 0.85;

export const LUMA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    night: { value: 0 },
    knee: { value: 1 },
    strength: { value: 0 },
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
    uniform float night;
    uniform float knee;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 rgb = c.rgb;
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      float over = max(0.0, luma - knee);
      rgb *= 1.0 / (1.0 + over * strength);
      gl_FragColor = vec4(rgb, c.a);
    }
  `,
};

/** new ShaderPass(LUMA_SHADER). В композер не добавлять. */
export function createLumaClampPass() {
  return new ShaderPass(LUMA_SHADER);
}

/**
 * n = nightAmount(engine.state.time)
 * uniforms.night = n
 * uniforms.knee = lerp(1.0, 0.72, n)
 * uniforms.strength = lerp(0.0, 0.85, n)
 * Нет pass/uniforms — ничего. state не писать.
 */
export function updateLumaClampPass(pass, engine) {
  if (!pass || !pass.uniforms) return;
  const time = engine && engine.state ? engine.state.time : undefined;
  const n = nightAmount(time);
  const uniforms = pass.uniforms;
  if (uniforms.night) uniforms.night.value = n;
  if (uniforms.knee) uniforms.knee.value = lerp(1.0, KNEE_NIGHT, n);
  if (uniforms.strength) uniforms.strength.value = lerp(0.0, STRENGTH_NIGHT, n);
}
