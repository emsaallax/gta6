// ФАЙЛЫ: src/core/post-raindrops.js
// Капли на стекле камеры: ShaderPass, только quality==='high' и rain > 0.2.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** rain из state.weather.rain, clamp 0..1. Нет числа / нет weather → 0. */
export function readWeatherRain(engine) {
  const weather = engine && engine.state && engine.state.weather;
  if (!weather) return 0;
  const rain = weather.rain;
  if (!finiteNumber(rain)) return 0;
  if (rain < 0) return 0;
  if (rain > 1) return 1;
  return rain;
}

/**
 * true только если quality==='high' (дословно) и rain > 0.2.
 * Иное quality, нет settings, нет weather → false.
 */
export function raindropsEnabled(engine) {
  const state = engine && engine.state;
  if (!state || !state.settings || !state.weather) return false;
  if (state.settings.quality !== 'high') return false;
  return readWeatherRain(engine) > 0.2;
}

export const RAINDROPS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    rain: { value: 0 },
    time: { value: 0 },
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
    uniform float rain;
    uniform float time;
    varying vec2 vUv;

    void main() {
      if (rain <= 0.0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 uv = vUv;
      vec2 shift = vec2(0.0);
      float gleam = 0.0;
      for (int i = 0; i < 8; i++) {
        float id = float(i) + 1.0;
        float n = fract(sin(dot(vUv * id, vec2(12.9, 78.2))) * 43758.0);
        float seed = fract(sin(dot(vec2(id, id * 2.3), vec2(12.9, 78.2))) * 43758.0);
        float seed2 = fract(sin(dot(vec2(id * 4.1, seed), vec2(12.9, 78.2))) * 43758.0);
        vec2 center = vec2(
          fract(seed + 0.04 * sin(time * 0.31 + id)),
          fract(seed2 + time * (0.07 + seed * 0.05))
        );
        vec2 d = uv - center;
        d.x *= 1.4;
        float rad = 0.04 * (0.8 + seed * 0.4);
        float dist = length(d);
        float inside = 1.0 - smoothstep(rad * 0.92, rad, dist);
        shift += d * inside * 0.28 * rain;
        float rim = smoothstep(rad * 0.62, rad * 0.88, dist) * (1.0 - smoothstep(rad * 0.88, rad, dist));
        gleam += rim * rain * (0.4 + n * 0.3);
      }
      vec3 col = texture2D(tDiffuse, uv - shift).rgb;
      col += vec3(gleam);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** new ShaderPass(RAINDROPS_SHADER). В композер не добавлять. */
export function createRaindropsPass() {
  return new ShaderPass(RAINDROPS_SHADER);
}

/**
 * pass.uniforms.rain.value = readWeatherRain(engine) если enabled, иначе 0.
 * time += 0.016 (копить на pass.userData._t, не finite → 0).
 * pass.enabled = raindropsEnabled(engine) (нет enabled — rain=0).
 * Нет pass — ничего, не бросать.
 */
export function updateRaindropsPass(pass, engine) {
  if (!pass) return;
  const on = raindropsEnabled(engine);
  const rainVal = on ? readWeatherRain(engine) : 0;
  if (!pass.userData) pass.userData = {};
  let t = pass.userData._t;
  if (!finiteNumber(t)) t = 0;
  t += 0.016;
  pass.userData._t = t;
  if (pass.uniforms) {
    if (pass.uniforms.rain) pass.uniforms.rain.value = rainVal;
    if (pass.uniforms.time) pass.uniforms.time.value = t;
  }
  pass.enabled = on;
}
