// Хелпер Canvas-текстур фасадов: 4 варианта окон, общие на весь город.
import * as THREE from 'three';

const SIZE = 256;

function fillWall(ctx, wall) {
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function drawWindows(ctx, cols, rows, pad, winW, winH, litChance, litColors, dayColor, lit) {
  const cellW = SIZE / cols;
  const cellH = SIZE / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW + pad;
      const y = row * cellH + pad;
      const n = Math.sin((row + 1) * 19.7 + (col + 1) * 41.3 + cols * 3.1) * 43758.5453;
      const frac = n - Math.floor(n);
      if (lit && frac < litChance) {
        ctx.fillStyle = litColors[Math.floor(frac * 17) % litColors.length];
      } else {
        ctx.fillStyle = dayColor;
      }
      ctx.fillRect(x, y, winW, winH);
    }
  }
}

function makeCanvas(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// variant: 0 плотная сетка, 1 средняя, 2 высокая башня, 3 редкие окна (порт)
function paintDay(ctx, variant) {
  fillWall(ctx, variant === 3 ? '#3a3530' : '#2c3038');
  const day = variant === 3 ? '#4a5560' : '#5a6a78';
  if (variant === 0) drawWindows(ctx, 8, 8, 6, 18, 18, 0, [], day, false);
  else if (variant === 1) drawWindows(ctx, 6, 6, 8, 24, 22, 0, [], day, false);
  else if (variant === 2) drawWindows(ctx, 5, 10, 6, 28, 14, 0, [], day, false);
  else drawWindows(ctx, 4, 3, 16, 28, 36, 0, [], day, false);
}

function paintNight(ctx, variant) {
  fillWall(ctx, '#000000');
  const lit = ['#f0e0a0', '#ffe9b8', '#fff8e0', '#d8ecff'];
  if (variant === 0) drawWindows(ctx, 8, 8, 6, 18, 18, 0.55, lit, '#000000', true);
  else if (variant === 1) drawWindows(ctx, 6, 6, 8, 24, 22, 0.5, lit, '#000000', true);
  else if (variant === 2) drawWindows(ctx, 5, 10, 6, 28, 14, 0.6, lit, '#000000', true);
  else drawWindows(ctx, 4, 3, 16, 28, 36, 0.25, lit, '#000000', true);
}

/** 4 пары map / emissiveMap. Не создавать канвас на каждое здание. */
export function createFacades() {
  const list = [];
  for (let v = 0; v < 4; v++) {
    const map = makeCanvas((ctx) => paintDay(ctx, v));
    const emissiveMap = makeCanvas((ctx) => paintNight(ctx, v));
    list.push({ map, emissiveMap, variant: v });
  }
  return list;
}
