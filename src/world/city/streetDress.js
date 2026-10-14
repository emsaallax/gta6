/** Бордюры и пятна фонарей на асфальте. Только InstancedMesh. */
import * as THREE from 'three';

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const LAMP_STEP = 40;
const CURB_STEP = 1;
const CURB_Y = 0.09;
const SPOT_Y = 0.07;
const SPOT_R = 3.2;

let spotMat = null;
let spotMesh = null;

function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function inList(value, list) {
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    if (near(value, list[i])) return true;
  }
  return false;
}

function widthOnAxis(value, avenues, streetW, avenueW) {
  return inList(value, avenues) ? avenueW : streetW;
}

function sidewalkOffset(width, sidewalk) {
  return width * 0.5 + sidewalk * 0.5;
}

function tooCloseToAxis(value, axes) {
  for (let i = 0; i < axes.length; i++) {
    if (Math.abs(value - axes[i]) < INTERSECT_GAP) return true;
  }
  return false;
}

function sidewalkNS(x, zs, offset, step, beachZ0, skipIntersect) {
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j];
    const z1 = zs[j + 1];
    const len = z1 - z0;
    const n = Math.max(1, Math.round(len / step));
    const cell = len / n;
    for (let k = 0; k < n; k++) {
      const z = z0 + cell * (k + 0.5);
      if (z >= beachZ0) continue;
      if (skipIntersect && tooCloseToAxis(z, zs)) continue;
      out.push({ x: x - offset, z });
      out.push({ x: x + offset, z });
    }
  }
  return out;
}

function sidewalkEW(z, xs, offset, step, beachZ0, skipIntersect) {
  const out = [];
  if (z >= beachZ0) return out;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const len = x1 - x0;
    const n = Math.max(1, Math.round(len / step));
    const cell = len / n;
    for (let k = 0; k < n; k++) {
      const x = x0 + cell * (k + 0.5);
      if (skipIntersect && tooCloseToAxis(x, xs)) continue;
      const zA = z - offset;
      const zB = z + offset;
      if (zA < beachZ0) out.push({ x, z: zA });
      if (zB < beachZ0) out.push({ x, z: zB });
    }
  }
  return out;
}

function nightFactor(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 0;
  if (t >= 19.5 || t < 5) return 1;
  if (t >= 6 && t < 18.5) return 0;
  if (t >= 18.5) return t - 18.5;
  return 1 - (t - 5);
}

function applyInstance(mesh, index, dummy) {
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function curbBlockedOnZ(z, zs, avenueZs, streetW, avenueW) {
  for (let j = 0; j < zs.length; j++) {
    const gap = widthOnAxis(zs[j], avenueZs, streetW, avenueW) / 2 + 1;
    if (Math.abs(z - zs[j]) < gap) return true;
  }
  return false;
}

function curbBlockedOnX(x, xs, avenueXs, streetW, avenueW) {
  for (let i = 0; i < xs.length; i++) {
    const gap = widthOnAxis(xs[i], avenueXs, streetW, avenueW) / 2 + 1;
    if (Math.abs(x - xs[i]) < gap) return true;
  }
  return false;
}

/**
 * Бордюры и круги света под фонарями. В state не пишет. Физику не трогает.
 * @param {{ scene: import('three').Scene, state?: object }} engine
 * @param {object} layout
 */
export function buildStreetDress(engine, layout) {
  spotMat = null;
  spotMesh = null;
  const scene = engine.scene;
  const grid = layout.grid;
  const xs = grid.xs;
  const zs = grid.zs;
  const streetW = grid.streetWidth;
  const avenueW = grid.avenueWidth;
  const sidewalk = grid.sidewalk;
  const avenueXs = grid.avenueXs;
  const avenueZs = grid.avenueZs;
  const beachZ0 = (layout.ocean && layout.ocean.beachZ0) || BEACH_Z;

  const dummy = new THREE.Object3D();
  const curbPts = [];

  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = w * 0.5;
    for (let z = zMin; z <= zMax; z += CURB_STEP) {
      if (z >= beachZ0) continue;
      if (curbBlockedOnZ(z, zs, avenueZs, streetW, avenueW)) continue;
      curbPts.push({ x: x - off, y: CURB_Y, z, yaw: 0 });
      curbPts.push({ x: x + off, y: CURB_Y, z, yaw: 0 });
    }
  }

  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    if (z >= beachZ0) continue;
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = w * 0.5;
    for (let x = xMin; x <= xMax; x += CURB_STEP) {
      if (curbBlockedOnX(x, xs, avenueXs, streetW, avenueW)) continue;
      const zA = z - off;
      const zB = z + off;
      const yaw = Math.PI * 0.5;
      if (zA < beachZ0) curbPts.push({ x, y: CURB_Y, z: zA, yaw });
      if (zB < beachZ0) curbPts.push({ x, y: CURB_Y, z: zB, yaw });
    }
  }

  const curbN = Math.max(1, curbPts.length);
  const curbGeo = new THREE.BoxGeometry(0.25, 0.18, 1);
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xc9c4b8,
    roughness: 0.85,
    metalness: 0.0,
  });
  const curbs = new THREE.InstancedMesh(curbGeo, curbMat, curbN);
  curbs.frustumCulled = false;
  curbs.castShadow = false;
  curbs.receiveShadow = true;
  for (let i = 0; i < curbPts.length; i++) {
    const p = curbPts[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(1, 1, 1);
    applyInstance(curbs, i, dummy);
  }
  curbs.instanceMatrix.needsUpdate = true;
  scene.add(curbs);
  // пятна волны 4 — lampSpots.js; старые круги не ставим
}

/** Скрыть старые пятна, когда фонари Kenney уже в сцене. */
export function setLampSpotsVisible(on) {
  if (spotMesh) spotMesh.visible = !!on;
}

/**
 * Яркость пятен по времени суток. В state не пишет.
 * @param {number} dt
 * @param {object} engine
 */
export function updateStreetDress(dt, engine) {
  if (!spotMat) return;
  const t = engine && engine.state && engine.state.time;
  spotMat.opacity = 0.08 + nightFactor(t) * 0.37;
}
