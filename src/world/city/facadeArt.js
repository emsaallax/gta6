// Общие CanvasTexture фасадов 512×512: 4 варианта на весь город.
import * as THREE from 'three';

const SIZE = 512;
const DAY_GLASS = '#8eb8c8';
const CORNICE = '#f4f4f0';
const LIT_A = '#ffe0a0';
const LIT_B = '#ffb347';
const NEON_PINK = '#ff2fa0';
const NEON_CYAN = '#19f0ff';
const NEON_VIOLET = '#9d4dff';

const WALLS = ['#f4ecd6', '#ffe8dc', '#eee6dc', '#f0dcc8'];

function windowFrac(row, col) {
  const n = Math.sin((row + 1) * 19.7 + (col + 1) * 41.3 + 3.1);
  return n - Math.floor(n);
}

function litWindowColor(row, col) {
  const frac = windowFrac(row, col);
  if (frac < 0.28) return null;
  return frac > 0.64 ? LIT_A : LIT_B;
}

function makeTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function drawCornice(ctx, h) {
  ctx.fillStyle = CORNICE;
  ctx.fillRect(0, 0, SIZE, h);
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(0, h - 6, SIZE, 6);
}

function drawWindowGrid(ctx, cols, rows, opts) {
  const { top, bottom, left, right, gapX, gapY, emissive } = opts;
  const inset = opts.inset ?? 7;
  const areaW = SIZE - left - right;
  const areaH = SIZE - top - bottom;
  const cellW = areaW / cols;
  const cellH = areaH / rows;
  const winW = cellW - gapX;
  const winH = cellH - gapY;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = left + col * cellW + gapX * 0.5;
      const y = top + row * cellH + gapY * 0.5;
      const gx = x + inset;
      const gy = y + inset;
      const gw = winW - inset * 2;
      const gh = winH - inset * 2;
      if (gw < 4 || gh < 4) continue;
      if (emissive) {
        const c = litWindowColor(row, col);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(gx, gy, gw, gh);
        continue;
      }
      ctx.fillStyle = CORNICE;
      ctx.fillRect(x, y, winW, winH);
      ctx.fillStyle = DAY_GLASS;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = CORNICE;
      ctx.fillRect(x + winW / 2 - 2, y, 4, winH);
      ctx.fillRect(x, y + winH / 2 - 2, winW, 4);
    }
  }
}

function paintResidential(ctx, emissive) {
  if (emissive) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = WALLS[0];
    ctx.fillRect(0, 0, SIZE, SIZE);
    drawCornice(ctx, 36);
  }
  drawWindowGrid(ctx, 3, 3, {
    top: 52,
    bottom: 28,
    left: 36,
    right: 36,
    gapX: 28,
    gapY: 36,
    emissive,
  });
}

function paintBalconies(ctx) {
  const top = 52;
  const bottom = 28;
  const left = 40;
  const right = 40;
  const cols = 3;
  const rows = 3;
  const areaW = SIZE - left - right;
  const areaH = SIZE - top - bottom;
  const cellW = areaW / cols;
  const cellH = areaH / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = left + col * cellW + 10;
      const y = top + (row + 1) * cellH - 18;
      const w = cellW - 20;
      ctx.fillStyle = '#f4ecd6';
      ctx.fillRect(x, y, w, 12);
      ctx.strokeStyle = CORNICE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 14);
      ctx.lineTo(x + w, y - 14);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + w, y - 7);
      ctx.stroke();
    }
  }
}

function paintBeach(ctx, emissive) {
  if (emissive) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = WALLS[1];
    ctx.fillRect(0, 0, SIZE, SIZE);
    drawCornice(ctx, 28);
    paintBalconies(ctx);
  }
  drawWindowGrid(ctx, 3, 3, {
    top: 52,
    bottom: 28,
    left: 40,
    right: 40,
    gapX: 36,
    gapY: 44,
    emissive,
  });
}

function paintDowntown(ctx, emissive) {
  if (emissive) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = WALLS[2];
    ctx.fillRect(0, 0, SIZE, SIZE);
    drawCornice(ctx, 22);
  }
  drawWindowGrid(ctx, 6, 10, {
    top: 32,
    bottom: 16,
    left: 20,
    right: 20,
    gapX: 10,
    gapY: 8,
    inset: 6,
    emissive,
  });
}

function paintPilasters(ctx) {
  ctx.fillStyle = WALLS[3];
  ctx.fillRect(0, 0, 36, SIZE);
  ctx.fillRect(SIZE - 36, 0, 36, SIZE);
  ctx.fillStyle = CORNICE;
  ctx.fillRect(4, 0, 10, SIZE);
  ctx.fillRect(22, 0, 6, SIZE);
  ctx.fillRect(SIZE - 14, 0, 10, SIZE);
  ctx.fillRect(SIZE - 28, 0, 6, SIZE);
}

function paintNeonStrip(ctx, emissive) {
  const x = SIZE - 58;
  ctx.fillStyle = emissive ? NEON_VIOLET : NEON_PINK;
  ctx.fillRect(x, 24, 10, SIZE - 48);
  ctx.fillStyle = NEON_CYAN;
  ctx.fillRect(x + 3, 28, 4, SIZE - 56);
}

function paintDeco(ctx, emissive) {
  if (emissive) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = WALLS[3];
    ctx.fillRect(0, 0, SIZE, SIZE);
    drawCornice(ctx, 24);
    paintPilasters(ctx);
  }
  drawWindowGrid(ctx, 4, 6, {
    top: 40,
    bottom: 24,
    left: 52,
    right: 72,
    gapX: 16,
    gapY: 18,
    emissive,
  });
  paintNeonStrip(ctx, emissive);
}

const PAINTERS = [paintResidential, paintBeach, paintDowntown, paintDeco];

/** 4 пары map / emissiveMap. Не создавать канвас на каждое здание. */
export function createFacadeArt() {
  const list = [];
  for (let v = 0; v < 4; v++) {
    const paint = PAINTERS[v];
    const map = makeTexture((ctx) => paint(ctx, false));
    const emissiveMap = makeTexture((ctx) => paint(ctx, true));
    list.push({ map, emissiveMap, variant: v });
  }
  return list;
}

/** Ночь по CONTRACTS §1a: t < 6 или t >= 19.5. */
export function isNight(t) {
  return typeof t === 'number' && (t < 6 || t >= 19.5);
}

/** Яркость окон под bloom. Материалы окон создаёт лид. */
export function windowEmissiveIntensity(night) {
  return night === true ? 2.5 : 0;
}
