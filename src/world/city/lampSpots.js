/** ФАЙЛЫ: src/world/city/lampSpots.js */
/** Инстансные пятна света под фонарями. Без PointLight. */
import * as THREE from 'three';

export const SPOT_Y = 0.09;
export const SPOT_R = 5;
export const LAMP_STEP = 40;

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;

let spotMat = null;

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

/** 0 днём, 1 ночью. CONTRACTS §1a. */
export function night01(time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return 0;
  if (time >= 19.5 || time < 5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time >= 18.5) return time - 18.5;
  return 1 - (time - 5);
}

/** Радиальная карта: центр белый непрозрачный, край alpha 0. */
export function makeRadialSpotMap() {
  const size = 64;
  let canvas = null;
  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(size, size);
      const data = img.data;
      const half = size * 0.5;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (x + 0.5 - half) / half;
          const dy = (y + 0.5 - half) / half;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = Math.max(0, 1 - d);
          const i = (y * size + x) * 4;
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = Math.round(a * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  }
  const tex = canvas ? new THREE.CanvasTexture(canvas) : new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
  );
  tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function collectLampPts(layout) {
  const pts = [];
  if (!layout || !layout.grid) return pts;
  const grid = layout.grid;
  const xs = grid.xs || [];
  const zs = grid.zs || [];
  const streetW = grid.streetWidth || 10;
  const avenueW = grid.avenueWidth || 16;
  const sidewalk = grid.sidewalk || 3.5;
  const avenueXs = grid.avenueXs;
  const avenueZs = grid.avenueZs;
  const beachZ0 = (layout.ocean && layout.ocean.beachZ0) || BEACH_Z;

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const list = sidewalkNS(x, zs, off, LAMP_STEP, beachZ0, true);
    for (let p = 0; p < list.length; p++) pts.push(list[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const list = sidewalkEW(z, xs, off, LAMP_STEP, beachZ0, true);
    for (let p = 0; p < list.length; p++) pts.push(list[p]);
  }
  return pts;
}

/**
 * Один InstancedMesh пятен. В state не пишет.
 * @param {{ scene: import('three').Scene, state?: object }} engine
 * @param {object} layout
 */
export function buildLampSpots(engine, layout) {
  spotMat = null;
  const scene = engine && engine.scene;
  const pts = collectLampPts(layout);
  const count = Math.max(1, pts.length);
  const geo = new THREE.CircleGeometry(SPOT_R, 16);
  const map = makeRadialSpotMap();
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: 0xffe8b0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'lampSpots';

  const dummy = new THREE.Object3D();
  if (pts.length === 0) {
    dummy.position.set(0, SPOT_Y, 0);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(0.001, 0.001, 0.001);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
  } else {
    dummy.scale.set(1, 1, 1);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      dummy.position.set(p.x, SPOT_Y, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (scene) scene.add(mesh);
  spotMat = mat;

  const time = engine && engine.state ? engine.state.time : 0;
  mat.opacity = night01(time) * 0.55;

  return { mesh, mat, count };
}

/** Читает только state.time. State не пишет. */
export function updateLampSpots(dt, engine) {
  if (!spotMat) return;
  const time = engine && engine.state ? engine.state.time : 0;
  spotMat.opacity = night01(time) * 0.55;
}
