// Постобработка: RenderPass → GTAO → Bloom → luma → grade → reflect → SMAA → капли → Output.
// Low — без композера.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bloomForTime } from './bloom-night.js';
import { createSsaoPass, resizeSsaoPass } from './post-ssao.js';
import { createAaPass, resizeAaPass } from './post-aa.js';
import { createGradePass, updateGradePass } from './post-grade.js';
import { createLumaClampPass, updateLumaClampPass } from './post-luma.js';
import { createReflectPass, updateReflectPass } from './post-reflect.js';
import { createRaindropsPass, updateRaindropsPass } from './post-raindrops.js';

const QUALITIES = { low: true, medium: true, high: true };

const LIMITS = {
  low: { pixelRatio: 1, useComposer: false, bloomHalf: false },
  medium: { pixelRatio: 1.25, useComposer: true, bloomHalf: true },
  high: { pixelRatio: 1.5, useComposer: true, bloomHalf: false },
};

/** quality: 'low'|'medium'|'high'. Иное или нет → 'high'. */
export function readQuality(engine) {
  const q = engine?.state?.settings?.quality;
  return QUALITIES[q] ? q : 'high';
}

/**
 * low    → { pixelRatio: 1,    useComposer: false, bloomHalf: false }
 * medium → { pixelRatio: 1.25, useComposer: true,  bloomHalf: true  }
 * high   → { pixelRatio: 1.5,  useComposer: true,  bloomHalf: false }
 */
export function qualityLimits(quality) {
  return LIMITS[quality] || LIMITS.high;
}

/**
 * next = min(devicePixelRatio, limits.pixelRatio).
 * setPixelRatio только если значение сменилось.
 */
export function applyPixelRatio(renderer, quality) {
  const limits = qualityLimits(quality);
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const next = Math.min(dpr, limits.pixelRatio);
  if (renderer.getPixelRatio() !== next) {
    renderer.setPixelRatio(next);
  }
  return next;
}

function cssSize(renderer) {
  const el = renderer?.domElement;
  const w = el?.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 1);
  const h = el?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 1);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

/**
 * Render target с MSAA.
 * Цепочка: RenderPass → GTAO → UnrealBloom → luma → grade → reflect → SMAA → капли → OutputPass.
 * Low композер не рисует (CONTRACTS).
 */
export function createComposer(renderer, scene, camera) {
  const { w: cssW, h: cssH } = cssSize(renderer);
  const pr = renderer.getPixelRatio() || 1;
  const tw = Math.max(1, Math.floor(cssW * pr));
  const th = Math.max(1, Math.floor(cssH * pr));
  const target = new THREE.WebGLRenderTarget(tw, th, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  // Конструктор берёт width target (уже css*pr) как логический размер и снова
  // умножает на pixelRatio — без setSize(css) кадр будет в pr².
  composer.setPixelRatio(pr);
  composer.setSize(cssW, cssH);
  composer.addPass(new RenderPass(scene, camera));
  const ssaoPass = createSsaoPass(scene, camera, cssW, cssH);
  composer.addPass(ssaoPass);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(cssW, cssH),
    0.4,
    0.4,
    0.9
  );
  composer.addPass(bloomPass);
  const lumaPass = createLumaClampPass();
  composer.addPass(lumaPass);
  const gradePass = createGradePass();
  composer.addPass(gradePass);
  const reflectPass = createReflectPass();
  composer.addPass(reflectPass);
  const aaPass = createAaPass(cssW, cssH, pr);
  composer.addPass(aaPass);
  const raindropsPass = createRaindropsPass();
  composer.addPass(raindropsPass);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloomPass,
    ssaoPass,
    lumaPass,
    gradePass,
    reflectPass,
    raindropsPass,
    aaPass,
    lastWidth: cssW,
    lastHeight: cssH,
    lastQuality: null,
    lastPixelRatio: renderer.getPixelRatio(),
  };
}

/**
 * Композер — полный css-размер; bloom при medium — половинное разрешение.
 * pixelRatio нет → bundle.lastPixelRatio или 1.
 */
export function resizeComposer(bundle, width, height, quality, pixelRatio) {
  if (!bundle) return;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const pr =
    typeof pixelRatio === 'number' && pixelRatio > 0
      ? pixelRatio
      : bundle.lastPixelRatio || 1;
  bundle.composer.setSize(w, h);
  const limits = qualityLimits(quality);
  if (bundle.bloomPass) {
    if (limits.bloomHalf) {
      bundle.bloomPass.setSize(
        Math.max(1, Math.floor(w / 2)),
        Math.max(1, Math.floor(h / 2))
      );
    } else {
      bundle.bloomPass.setSize(w, h);
    }
  }
  if (bundle.ssaoPass) resizeSsaoPass(bundle.ssaoPass, w, h);
  if (bundle.aaPass) resizeAaPass(bundle.aaPass, w, h, pr);
  bundle.lastWidth = w;
  bundle.lastHeight = h;
  bundle.lastPixelRatio = pr;
}

/**
 * Кадр: pixelRatio, bloom из state.render, low — прямой render, иначе composer.
 */
export function renderFrame(engine, bundle) {
  const renderer = engine.renderer;
  const quality = readQuality(engine);
  const ratio = applyPixelRatio(renderer, quality);

  if (bundle && (quality !== bundle.lastQuality || ratio !== bundle.lastPixelRatio)) {
    bundle.composer.setPixelRatio(ratio);
    let w = bundle.lastWidth;
    let h = bundle.lastHeight;
    if (!w || !h) {
      const css = cssSize(renderer);
      w = css.w;
      h = css.h;
    }
    resizeComposer(bundle, w, h, quality, ratio);
    bundle.lastQuality = quality;
    bundle.lastPixelRatio = ratio;
  }

  if (bundle?.bloomPass) {
    const bloom = bloomForTime(engine);
    bundle.bloomPass.strength = bloom.strength;
    bundle.bloomPass.threshold = bloom.threshold;
    bundle.bloomPass.radius = bloom.radius;
  }
  if (bundle?.lumaPass) updateLumaClampPass(bundle.lumaPass, engine);
  if (bundle?.gradePass) updateGradePass(bundle.gradePass, engine);
  if (bundle?.reflectPass) updateReflectPass(bundle.reflectPass, engine);
  if (bundle?.raindropsPass) updateRaindropsPass(bundle.raindropsPass, engine);

  const limits = qualityLimits(quality);
  if (!limits.useComposer || !bundle) {
    renderer.render(engine.scene, engine.camera);
  } else {
    bundle.composer.render();
  }
}
