// ФАЙЛЫ: src/core/post-ssao.js, src/core/post-aa.js
// Palmetto Bay — SSAO (GTAOPass) для medium/high, полразрешения кадра
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

function saneSize(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Полразрешения: max(1, floor(n/2)). Нет или <1 → сначала 1. */
function halfRes(n) {
  return Math.max(1, Math.floor(saneSize(n) / 2));
}

/**
 * GTAOPass(scene, camera, w, h).
 * w,h — полразрешения кадра: max(1, floor(width/2)), max(1, floor(height/2)).
 * width/height нет или <1 → 1.
 * pass.output = GTAOPass.OUTPUT.Default (если OUTPUT есть).
 * Не добавлять pass в композер.
 * Возврат: pass.
 */
export function createSsaoPass(scene, camera, width, height) {
  const w = halfRes(width);
  const h = halfRes(height);
  const pass = new GTAOPass(scene, camera, w, h);
  if (GTAOPass.OUTPUT && GTAOPass.OUTPUT.Default !== undefined) {
    pass.output = GTAOPass.OUTPUT.Default;
  }
  return pass;
}

/** pass.setSize(max(1,floor(width/2)), max(1,floor(height/2))). Нет setSize — ничего. */
export function resizeSsaoPass(pass, width, height) {
  if (!pass || typeof pass.setSize !== 'function') return;
  pass.setSize(halfRes(width), halfRes(height));
}
