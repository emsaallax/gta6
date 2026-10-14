/** ФАЙЛЫ: src/core/post-feel.js */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function ensureFeel(pass) {
  if (!pass.feel) pass.feel = { hurt: 0, t: 0 };
  return pass.feel;
}

function getHurt(pass) {
  const data = pass.feel;
  if (!data || !isFiniteNumber(data.hurt)) return 0;
  return data.hurt;
}

/**
 * quality дословно 'high' и speed = cameraTarget.speed (нет / не число → 0):
 *   clamp(speed / 40, 0, 1) * 0.22
 * Иначе 0 (в т.ч. medium/low, нет target).
 */
export function motionBlurAmount(engine) {
  const state = engine && engine.state;
  if (!state) return 0;
  const quality = state.settings && state.settings.quality;
  if (quality !== 'high') return 0;
  const target = state.cameraTarget;
  if (!target) return 0;
  const speed = target.speed;
  if (!isFiniteNumber(speed)) return 0;
  return clamp01(speed / 40) * 0.22;
}

export const FEEL_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    blur: { value: 0 },
    hurt: { value: 0 },
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
    uniform float blur;
    uniform float hurt;
    varying vec2 vUv;
    void main() {
      vec2 off = vec2(blur * 0.012, 0.0);
      vec4 a = texture2D(tDiffuse, vUv - off);
      vec4 b = texture2D(tDiffuse, vUv);
      vec4 c = texture2D(tDiffuse, vUv + off);
      vec3 rgb = (a.rgb + b.rgb + c.rgb) / 3.0;
      vec2 fromCenter = vUv - vec2(0.5);
      float d = dot(fromCenter, fromCenter);
      rgb = mix(rgb, rgb * vec3(1.0, 0.15, 0.12), hurt * smoothstep(0.08, 0.42, d));
      gl_FragColor = vec4(rgb, b.a);
    }
  `,
};

/** new ShaderPass(FEEL_SHADER). В композер не добавлять. pass.feel = { hurt: 0, t: 0 }. */
export function createFeelPass() {
  const pass = new ShaderPass(FEEL_SHADER);
  pass.feel = { hurt: 0, t: 0 };
  return pass;
}

/**
 * Лид: on('playerDamage', d => pulseHurt(pass, d.amount))
 * add = min(1, (amount||0) / 40); _hurt = min(1, _hurt+add). Нет pass — ничего.
 */
export function pulseHurt(pass, amount) {
  if (!pass) return;
  const feel = ensureFeel(pass);
  const add = Math.min(1, (amount || 0) / 40);
  feel.hurt = Math.min(1, getHurt(pass) + add);
}

/**
 * uniforms.blur = motionBlurAmount(engine)
 * _hurt *= exp(-dt*4); dt брать 1/60 (копить не нужно, просто *= exp(-4/60) за вызов)
 *   если _hurt < 0.01 → 0
 * uniforms.hurt = _hurt
 * pass.enabled = blur>0 || hurt>0 (нет enabled — только uniforms)
 * Нет pass — ничего. state не писать.
 */
export function updateFeelPass(pass, engine) {
  if (!pass) return;
  const feel = ensureFeel(pass);
  const blur = motionBlurAmount(engine);
  let hurt = getHurt(pass) * Math.exp(-4 / 60);
  if (hurt < 0.01) hurt = 0;
  feel.hurt = hurt;
  const uniforms = pass.uniforms;
  if (uniforms) {
    if (uniforms.blur) uniforms.blur.value = blur;
    if (uniforms.hurt) uniforms.hurt.value = hurt;
  }
  if ('enabled' in pass) {
    pass.enabled = blur > 0 || hurt > 0;
  }
}
