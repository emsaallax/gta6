/** Карта Palmetto Bay: сетка, районы, участки. Без мешей. Seed 7702. */

const SEED = 7702;
const SIZE = 1200;
const HALF = 600;
const STEP = 80;
const STREET_W = 12;
const AVENUE_W = 22;
const SIDEWALK = 3.5;
const EPS = 1e-6;

const XS = [
  -560, -480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400, 480, 560,
];
const ZS = [-560, -480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400];
const AVENUE_XS = [-320, 0, 320];
const AVENUE_ZS = [-320, 0, 320, 400];

function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function inList(value, list) {
  for (let i = 0; i < list.length; i++) {
    if (near(value, list[i])) return true;
  }
  return false;
}

/**
 * Детерминированный ГПСЧ (mulberry32).
 * @param {number} seed
 * @returns {() => number} число строго в [0, 1)
 */
export function makeRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Район по центру участка. Порядок проверок сверху вниз.
 * @param {number} x
 * @param {number} z
 * @returns {'downtown'|'beach'|'port'|'residential'}
 */
export function districtAt(x, z) {
  if (z >= 240 && z < 440 && x < 240) return 'beach';
  if (x >= 240 && z >= 80 && z < 440) return 'port';
  if (Math.abs(x) <= 240 && Math.abs(z) <= 240) return 'downtown';
  return 'residential';
}

/** Ширина улицы вдоль оси X (север–юг). */
export function streetWidthX(x) {
  return inList(x, AVENUE_XS) ? AVENUE_W : STREET_W;
}

/** Ширина улицы вдоль оси Z (запад–восток). */
export function streetWidthZ(z) {
  return inList(z, AVENUE_ZS) ? AVENUE_W : STREET_W;
}

function buildLots() {
  const lots = [];
  let id = 0;
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const x0 = XS[i];
      const x1 = XS[i + 1];
      const z0 = ZS[j];
      const z1 = ZS[j + 1];
      const minX = x0 + streetWidthX(x0) / 2 + SIDEWALK;
      const maxX = x1 - streetWidthX(x1) / 2 - SIDEWALK;
      const minZ = z0 + streetWidthZ(z0) / 2 + SIDEWALK;
      const maxZ = z1 - streetWidthZ(z1) / 2 - SIDEWALK;
      const sx = maxX - minX;
      const sz = maxZ - minZ;
      if (sx < 10 || sz < 10) continue;
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      if (cz >= 440) continue;
      lots.push({
        id: id++,
        minX,
        maxX,
        minZ,
        maxZ,
        cx,
        cz,
        sx,
        sz,
        district: districtAt(cx, cz),
      });
    }
  }
  return lots;
}

function buildIntersections() {
  const intersections = [];
  for (let i = 0; i < XS.length; i++) {
    for (let j = 0; j < ZS.length; j++) {
      const x = XS[i];
      const z = ZS[j];
      intersections.push({
        x,
        z,
        avenueX: inList(x, AVENUE_XS),
        avenueZ: inList(z, AVENUE_ZS),
      });
    }
  }
  return intersections;
}

export function createLayout() {
  return {
    seed: SEED,
    size: SIZE,
    half: HALF,
    spawn: { x: 16, z: 400 },
    ocean: {
      beachZ0: 440,
      beachZ1: 500,
      waterZ: 500,
      promenadeZ: 400,
    },
    grid: {
      step: STEP,
      streetWidth: STREET_W,
      avenueWidth: AVENUE_W,
      sidewalk: SIDEWALK,
      xs: XS.slice(),
      zs: ZS.slice(),
      avenueXs: AVENUE_XS.slice(),
      avenueZs: AVENUE_ZS.slice(),
    },
    districts: [
      { id: 'downtown', minX: -240, maxX: 240, minZ: -240, maxZ: 240 },
      { id: 'beach', minX: -600, maxX: 240, minZ: 240, maxZ: 440 },
      { id: 'port', minX: 240, maxX: 600, minZ: 80, maxZ: 440 },
      { id: 'residential', minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
    ],
    lots: buildLots(),
    intersections: buildIntersections(),
  };
}
