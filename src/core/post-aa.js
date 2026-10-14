// ФАЙЛЫ: src/core/post-ssao.js, src/core/post-aa.js
// Palmetto Bay — SMAA (SMAAPass) для medium/high, размер в пикселях кадра
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

function saneSize(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? n : 1;
}

/** max(1, floor(n * pixelRatio)). Нет или <1 → 1. pixelRatio нет → 1. */
function pixelSize(n, pixelRatio) {
  return Math.max(1, Math.floor(saneSize(n) * saneSize(pixelRatio)));
}

/**
 * SMAAPass(pixelW, pixelH).
 * pixelW = max(1, floor(width * pixelRatio)), то же для height.
 * width/height/pixelRatio нет или <1 → 1 (pixelRatio нет → 1).
 * Не добавлять в композер. Возврат: pass.
 */
export function createAaPass(width, height, pixelRatio) {
  const pr = pixelRatio === undefined || pixelRatio === null ? 1 : pixelRatio;
  return new SMAAPass(pixelSize(width, pr), pixelSize(height, pr));
}

/** pass.setSize(max(1,floor(width*pr)), max(1,floor(height*pr))). pr нет → 1. */
export function resizeAaPass(pass, width, height, pixelRatio) {
  if (!pass || typeof pass.setSize !== 'function') return;
  const pr = pixelRatio === undefined || pixelRatio === null ? 1 : pixelRatio;
  pass.setSize(pixelSize(width, pr), pixelSize(height, pr));
}
