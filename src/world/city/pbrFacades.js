// ФАЙЛЫ: src/world/city/pbrFacades.js
// PBR-фасады: штукатурка/плитка, UV в метрах, окна с рамами, черепица.

import * as THREE from 'three';

export const FACADE_PBR = [
  'white_plaster_02',
  'yellow_plaster',
  'painted_plaster_wall',
  'white_stucco',
  'rectangular_facade_tiles',
];

export const PASTEL = [0x9fe3c9, 0xffc4a3, 0xc9b6ff, 0xf4ecd6, 0xff8a7a];
export const TILE_M = 4;

const WIN_SIZE = 512;
const ROOF_NAME = 'clay_roof_tiles';

let cachedWindowMaps = null;

function wrapRepeat(tex) {
  if (!tex) return;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
}

function armTex(maps) {
  return maps?.aoRoughnessMetalness || maps?.arm || null;
}

function makePbrMat(maps, color) {
  wrapRepeat(maps.map);
  wrapRepeat(maps.normalMap);
  const arm = armTex(maps);
  wrapRepeat(arm);
  return new THREE.MeshStandardMaterial({
    color,
    map: maps.map || null,
    normalMap: maps.normalMap || null,
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    metalness: 0.02,
    roughness: 1,
  });
}

function emptyResult() {
  return { facades: [], roof: null, usedAssets: false };
}

export async function loadFacadePBR(assets) {
  if (!assets || typeof assets.loadPBR !== 'function') {
    return emptyResult();
  }
  const facades = [];
  for (let i = 0; i < FACADE_PBR.length; i++) {
    const name = FACADE_PBR[i];
    try {
      const maps = await assets.loadPBR(name);
      if (!maps) continue;
      facades.push({
        name,
        mat: makePbrMat(maps, PASTEL[i % PASTEL.length]),
        maps,
      });
    } catch {
      // нет ассета — пропускаем, не падаем
    }
  }
  let roof = null;
  try {
    const maps = await assets.loadPBR(ROOF_NAME);
    if (maps) {
      roof = { mat: makePbrMat(maps, 0xc45c38), maps };
    }
  } catch {
    roof = null;
  }
  return {
    facades,
    roof,
    usedAssets: facades.length > 0 || roof !== null,
  };
}

export function applyBoxMeterUV(geometry, sx, sy, sz, tile = TILE_M) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;
  const t = tile > 0 ? tile : TILE_M;
  const ruX = sx / t;
  const ruY = sy / t;
  const ruZ = sz / t;
  // BoxGeometry: 6 граней × 4 вершины: +x −x +y −y +z −z
  const scales = [
    [ruZ, ruY],
    [ruZ, ruY],
    [ruX, ruZ],
    [ruX, ruZ],
    [ruX, ruY],
    [ruX, ruY],
  ];
  const count = Math.min(uv.count, 24);
  for (let face = 0; face < 6; face++) {
    const su = scales[face][0];
    const sv = scales[face][1];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      if (idx >= count) break;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv2', uv.clone());
  return geometry;
}

function paintWindows(ctx, night) {
  const size = WIN_SIZE;
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, size, size);
  const cols = 4;
  const rows = 4;
  const cell = size / cols;
  const pad = 18;
  const frame = 10;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cell + pad;
      const y = row * cell + pad;
      const w = cell - pad * 2;
      const h = cell - pad * 2;
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(x, y, w, h);
      const gx = x + frame;
      const gy = y + frame;
      const gw = w - frame * 2;
      const gh = h - frame * 2;
      if (night) {
        const n = Math.sin((row + 1) * 19.7 + (col + 1) * 41.3) * 43758.5453;
        const frac = n - Math.floor(n);
        if (frac < 0.55) {
          ctx.fillStyle = frac < 0.28 ? '#ffe0a0' : '#ffb347';
        } else {
          ctx.fillStyle = '#1a2228';
        }
      } else {
        ctx.fillStyle = '#8eb8c8';
      }
      ctx.fillRect(gx, gy, gw, gh);
      // крестовина рамы
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(gx + gw * 0.5 - 3, gy, 6, gh);
      ctx.fillRect(gx, gy + gh * 0.5 - 3, gw, 6);
    }
  }
}

function makeWinTex(draw, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = WIN_SIZE;
  canvas.height = WIN_SIZE;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWindowFrameMaps() {
  if (cachedWindowMaps) return cachedWindowMaps;
  cachedWindowMaps = {
    map: makeWinTex((ctx) => paintWindows(ctx, false), true),
    emissiveMap: makeWinTex((ctx) => paintWindows(ctx, true), true),
  };
  return cachedWindowMaps;
}

export function buildPbrFacadeDemo(_engine, _layout) {
  // сборщик зданий кладёт меши; демо в игровой сцене не обязательно
}

/** Окна ночью ведёт windowNight.js (потолок 1.6). Не ставить 2.5. */
export function updatePbrFacades(_dt, _engine) {
  void _dt;
  void _engine;
}
