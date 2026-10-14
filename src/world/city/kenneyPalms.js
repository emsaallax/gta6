/** Пальмы Kenney nature-kit вдоль авеню и набережной. Только InstancedMesh. */
// ФАЙЛЫ: src/world/city/kenneyPalms.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const PALM_STEP = 80;
const TRUNK = 0xc48a4a;
const CROWN_A = 0x5ecf6a;
const CROWN_B = 0x7edc78;

export const PALM_PATHS = [
  'assets/models/kenney/nature-kit/tree_palm.glb',
  'assets/models/kenney/nature-kit/tree_palmTall.glb',
  'assets/models/kenney/nature-kit/tree_palmBend.glb',
];

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
  if (!axes) return false;
  for (let i = 0; i < axes.length; i++) {
    if (Math.abs(value - axes[i]) < INTERSECT_GAP) return true;
  }
  return false;
}

function colorAttr(geo, hex) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/**
 * Запасная пальма: ствол #c48a4a, крона #5ecf6a / #7edc78 (не темнее #3a9a4a).
 * @returns {import('three').BufferGeometry}
 */
export function makePalmFallbackGeo() {
  const parts = [];
  const trunkH = 6.2;
  const trunk = new THREE.CylinderGeometry(0.18, 0.32, trunkH, 8);
  trunk.translate(0, trunkH * 0.5, 0);
  colorAttr(trunk, TRUNK);
  parts.push(trunk);
  const leafN = 10;
  for (let i = 0; i < leafN; i++) {
    const a = (i / leafN) * Math.PI * 2;
    const tilt = 0.55 + (i % 3) * 0.12;
    const leaf = new THREE.BoxGeometry(0.42, 0.1, 3.2);
    leaf.translate(0, 0, 1.4);
    leaf.rotateX(tilt);
    leaf.rotateY(a);
    leaf.translate(0, trunkH + 0.15, 0);
    colorAttr(leaf, i % 2 === 0 ? CROWN_A : CROWN_B);
    parts.push(leaf);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.28;
    const leaf = new THREE.BoxGeometry(0.32, 0.08, 2.2);
    leaf.translate(0, 0, 0.95);
    leaf.rotateX(0.28);
    leaf.rotateY(a);
    leaf.translate(0, trunkH + 0.45, 0);
    colorAttr(leaf, CROWN_B);
    parts.push(leaf);
  }
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  sitOnGround(merged);
  return merged;
}

function sitOnGround(geo) {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const dy = -box.min.y;
  if (Math.abs(dy) > 1e-6) geo.translate(0, dy, 0);
  geo.computeBoundingBox();
}

function geoHeight(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return 1;
  const h = box.max.y - box.min.y;
  return h > 0.01 ? h : 1;
}

function makeFallbackMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.0,
    vertexColors: true,
  });
}

function pickColormapMat(meshes) {
  for (let i = 0; i < meshes.length; i++) {
    let mat = meshes[i].material;
    if (Array.isArray(mat)) mat = mat[0];
    if (mat) return mat.clone();
  }
  return makeFallbackMat();
}

async function loadPalmType(assets, path) {
  if (!assets || typeof assets.loadGLB !== 'function') return null;
  try {
    const gltf = await assets.loadGLB(path);
    const root = gltf && gltf.scene;
    if (!root) return null;
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && o.geometry) meshes.push(o);
    });
    if (!meshes.length) return null;
    const parts = [];
    for (let i = 0; i < meshes.length; i++) {
      const geo = meshes[i].geometry.clone();
      geo.applyMatrix4(meshes[i].matrixWorld);
      parts.push(geo);
    }
    const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) parts[i].dispose();
    }
    if (!geo) return null;
    sitOnGround(geo);
    const mat = pickColormapMat(meshes);
    return { geo, mat };
  } catch (_e) {
    return null;
  }
}

function collectPalmPoints(layout) {
  const out = [];
  const grid = (layout && layout.grid) || {};
  const ocean = (layout && layout.ocean) || {};
  const xs = grid.xs || [];
  const zs = grid.zs || [];
  const streetW = grid.streetWidth || 12;
  const avenueW = grid.avenueWidth || 22;
  const sidewalk = grid.sidewalk || 3.5;
  const avenueXs = grid.avenueXs || [];
  const beachZ0 = ocean.beachZ0 != null ? ocean.beachZ0 : BEACH_Z;
  const promenadeZ = ocean.promenadeZ;

  for (let i = 0; i < avenueXs.length; i++) {
    const x = avenueXs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    for (let j = 0; j < zs.length - 1; j++) {
      const z0 = zs[j];
      const z1 = zs[j + 1];
      const len = z1 - z0;
      const n = Math.max(1, Math.round(len / PALM_STEP));
      const cell = len / n;
      for (let k = 0; k < n; k++) {
        const z = z0 + cell * (k + 0.5);
        if (z >= beachZ0) continue;
        if (tooCloseToAxis(z, zs)) continue;
        out.push({ x: x - off, z });
        out.push({ x: x + off, z });
      }
    }
  }

  if (promenadeZ != null) {
    const z = promenadeZ;
    const w = avenueW;
    const off = sidewalkOffset(w, sidewalk);
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const len = x1 - x0;
      const n = Math.max(1, Math.round(len / PALM_STEP));
      const cell = len / n;
      for (let k = 0; k < n; k++) {
        const x = x0 + cell * (k + 0.5);
        if (tooCloseToAxis(x, xs)) continue;
        const zA = z - off;
        const zB = z + off;
        out.push({ x, z: zA });
        out.push({ x, z: zB });
      }
    }
  }

  if (out.length < 24) {
    for (let i = out.length; i < 24; i++) {
      out.push({ x: (i - 12) * PALM_STEP, z: 0 });
    }
  }
  return out;
}

function fillInstances(mesh, pts, geo) {
  const dummy = new THREE.Object3D();
  const h = geoHeight(geo);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const target = 8 + (i % 5);
    const s = target / h;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, (i * 0.73) % (Math.PI * 2), 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = n;
}

/**
 * @param {{ scene?: import('three').Scene, state?: object }} engine
 * @param {object} layout
 * @returns {Promise<{ meshes: import('three').InstancedMesh[], usedAssets: boolean }>}
 */
export async function buildKenneyPalms(engine, layout) {
  const assets = engine && engine.state && engine.state.assets;
  const points = collectPalmPoints(layout);
  const buckets = [[], [], []];
  for (let i = 0; i < points.length; i++) {
    buckets[i % 3].push(points[i]);
  }

  const loaded = await Promise.all(PALM_PATHS.map((p) => loadPalmType(assets, p)));
  let usedAssets = false;
  for (let i = 0; i < loaded.length; i++) {
    if (loaded[i]) usedAssets = true;
  }

  const fallbackGeo = makePalmFallbackGeo();
  const fallbackMat = makeFallbackMat();
  const meshes = [];
  const scene = engine && engine.scene;

  for (let t = 0; t < 3; t++) {
    const pts = buckets[t];
    if (pts.length < 8) continue;
    const pack = loaded[t];
    const geo = pack ? pack.geo : fallbackGeo;
    const mat = pack ? pack.mat : fallbackMat;
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    fillInstances(mesh, pts, geo);
    if (scene) scene.add(mesh);
    meshes.push(mesh);
  }

  if (meshes.length === 0) {
    const mesh = new THREE.InstancedMesh(fallbackGeo, fallbackMat, points.length);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    fillInstances(mesh, points, fallbackGeo);
    if (scene) scene.add(mesh);
    meshes.push(mesh);
  }

  return { meshes, usedAssets };
}

/**
 * Кадровое обновление не нужно.
 * @param {number} _dt
 * @param {object} _engine
 */
export function updateKenneyPalms(_dt, _engine) {}
