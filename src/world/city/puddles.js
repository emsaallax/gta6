/** Лужи-декали на дороге и тротуаре. Один InstancedMesh. */
// ФАЙЛЫ: src/world/city/puddles.js
import * as THREE from 'three';

export const PUDDLE_Y = 0.08;
export const WET_SHOW = 0.2;
export const PUDDLE_COUNT = 48;

const BEACH_Z = 440;
const INTERSECT_M = 8;
const NUDGE = 10;
const ROAD_STEP = 36;
const SX0 = 1.6;
const SX1 = 3.2;
const SZ0 = 0.9;
const SZ1 = 1.6;

let puddleMesh = null;
let puddleMat = null;

function numOrZero(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * CONTRACTS §11: state.weather.wet 0..1; нет поля / не число → 0.
 * @param {{ state?: { weather?: { wet?: unknown } } } | null | undefined} engine
 * @returns {number}
 */
export function readWet(engine) {
  const w = engine && engine.state && engine.state.weather;
  if (!w) return 0;
  const wet = w.wet;
  if (typeof wet !== 'number' || !Number.isFinite(wet)) return 0;
  if (wet < 0) return 0;
  if (wet > 1) return 1;
  return wet;
}

function nearIntersect(x, z, xs, zs) {
  if (!xs || !zs) return false;
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      const dx = x - xs[i];
      const dz = z - zs[j];
      if (dx * dx + dz * dz < INTERSECT_M * INTERSECT_M) return true;
    }
  }
  return false;
}

function shiftFromIntersect(x, z, dx, dz, xs, zs, beachZ0) {
  let nx = x;
  let nz = z;
  if (nearIntersect(nx, nz, xs, zs)) {
    nx = x + dx * NUDGE;
    nz = z + dz * NUDGE;
  }
  if (nz >= beachZ0 || nearIntersect(nx, nz, xs, zs)) {
    nx = x - dx * NUDGE;
    nz = z - dz * NUDGE;
  }
  if (nz >= beachZ0 || nearIntersect(nx, nz, xs, zs)) return null;
  return { x: nx, z: nz };
}

function hash01(id) {
  let t = (id * 747796405 + 2891336453) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function collectRoad(xs, zs, beachZ0) {
  const out = [];
  if (!xs || !zs || xs.length < 1 || zs.length < 1) return out;
  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    for (let z = zMin; z <= zMax; z += ROAD_STEP) {
      const p = shiftFromIntersect(x, z, 0, 1, xs, zs, beachZ0);
      if (p) out.push(p);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    if (z >= beachZ0) continue;
    for (let x = xMin; x <= xMax; x += ROAD_STEP) {
      const p = shiftFromIntersect(x, z, 1, 0, xs, zs, beachZ0);
      if (p) out.push(p);
    }
  }
  return out;
}

function streetW(value, avenues, streetWidth, avenueWidth) {
  if (!avenues) return streetWidth;
  for (let i = 0; i < avenues.length; i++) {
    if (Math.abs(value - avenues[i]) < 1e-4) return avenueWidth;
  }
  return streetWidth;
}

function collectWalk(grid, beachZ0) {
  const out = [];
  const xs = grid.xs;
  const zs = grid.zs;
  if (!xs || !zs) return out;
  const sidewalk = numOrZero(grid.sidewalk) || 3.5;
  const streetWidth = numOrZero(grid.streetWidth) || 12;
  const avenueWidth = numOrZero(grid.avenueWidth) || 22;
  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = streetW(x, grid.avenueXs, streetWidth, avenueWidth);
    const off = w / 2 + sidewalk / 2;
    for (let z = zMin; z <= zMax; z += ROAD_STEP) {
      const a = shiftFromIntersect(x - off, z, 0, 1, xs, zs, beachZ0);
      const b = shiftFromIntersect(x + off, z, 0, 1, xs, zs, beachZ0);
      if (a) out.push(a);
      if (b) out.push(b);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    if (z >= beachZ0) continue;
    const w = streetW(z, grid.avenueZs, streetWidth, avenueWidth);
    const off = w / 2 + sidewalk / 2;
    for (let x = xMin; x <= xMax; x += ROAD_STEP) {
      const a = shiftFromIntersect(x, z - off, 1, 0, xs, zs, beachZ0);
      const b = shiftFromIntersect(x, z + off, 1, 0, xs, zs, beachZ0);
      if (a) out.push(a);
      if (b) out.push(b);
    }
  }
  return out;
}

function pickN(list, n, start) {
  const out = [];
  if (!list.length) return out;
  const stride = Math.max(1, Math.floor(list.length / n));
  for (let i = 0; i < n; i++) {
    out.push(list[(start + i * stride) % list.length]);
  }
  return out;
}

function applyOpacity(wet) {
  if (!puddleMat) return;
  puddleMat.opacity = 0.4 + wet * 0.4;
}

/**
 * @param {{ scene: import('three').Scene, state?: object }} engine
 * @param {object} layout
 * @returns {{ mesh: import('three').InstancedMesh, mat: import('three').Material, count: number }}
 */
export function buildPuddles(engine, layout) {
  puddleMesh = null;
  puddleMat = null;

  const scene = engine && engine.scene;
  const grid = (layout && layout.grid) || {};
  const beachZ0 =
    (layout && layout.ocean && typeof layout.ocean.beachZ0 === 'number'
      && Number.isFinite(layout.ocean.beachZ0)
      ? layout.ocean.beachZ0
      : BEACH_Z);

  const road = collectRoad(grid.xs, grid.zs, beachZ0);
  const walk = collectWalk(grid, beachZ0);
  const half = PUDDLE_COUNT / 2;
  const pts = pickN(road, half, 3).concat(pickN(walk, half, 7));
  while (pts.length < PUDDLE_COUNT && (road.length || walk.length)) {
    const src = pts.length % 2 === 0 ? road : walk;
    const pool = src.length ? src : road.length ? road : walk;
    pts.push(pool[pts.length % pool.length]);
  }
  while (pts.length < PUDDLE_COUNT) {
    pts.push({ x: (pts.length - 24) * 12, z: -80 });
  }

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a2430,
    roughness: 0.08,
    metalness: 0.15,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  if (scene && scene.environment) mat.envMap = scene.environment;

  const mesh = new THREE.InstancedMesh(geo, mat, PUDDLE_COUNT);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.visible = false;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < PUDDLE_COUNT; i++) {
    const p = pts[i];
    const u = hash01(i);
    const v = hash01(i + 91);
    const sx = SX0 + (SX1 - SX0) * u;
    const sz = SZ0 + (SZ1 - SZ0) * v;
    const yaw = u * Math.PI * 2;
    dummy.position.set(p.x, PUDDLE_Y, p.z);
    dummy.rotation.set(-Math.PI / 2, 0, yaw);
    dummy.scale.set(sx, sz, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  if (scene) scene.add(mesh);

  puddleMesh = mesh;
  puddleMat = mat;
  return { mesh, mat, count: PUDDLE_COUNT };
}

/**
 * Видимость по wet. State не пишет.
 * @param {number} _dt
 * @param {object} engine
 */
export function updatePuddles(_dt, engine) {
  if (!puddleMesh) return;
  const wet = readWet(engine);
  if (wet > WET_SHOW) {
    puddleMesh.visible = true;
    applyOpacity(wet);
  } else {
    puddleMesh.visible = false;
  }
}
