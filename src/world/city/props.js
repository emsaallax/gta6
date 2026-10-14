/** Пальмы, фонари и светофоры вдоль улиц. Только InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const PALM_STEP = 80;
const LAMP_STEP = 40;

let lampGlobeMat = null;
let tfRedMat = null;
let tfYellowMat = null;
let tfGreenMat = null;

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

function applyInstance(mesh, index, dummy) {
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function makeInstanced(geo, mat, count, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = false;
  return mesh;
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

/** Изогнутый ствол + крона из нескольких листьев. Один меш на инстанс. */
function makePalmGeo() {
  const parts = [];
  let x = 0;
  let y = 0;
  let ang = 0;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    ang = t * 0.42;
    const h = 1.05;
    const r0 = 0.30 - t * 0.10;
    const r1 = 0.24 - t * 0.10;
    const geo = new THREE.CylinderGeometry(r1, r0, h, 7);
    geo.translate(0, h * 0.5, 0);
    geo.rotateZ(-ang);
    geo.translate(x, y, 0);
    colorAttr(geo, 0x8a5a32);
    parts.push(geo);
    x += Math.sin(ang) * h;
    y += Math.cos(ang) * h;
  }
  const leafN = 9;
  const leafColors = [0x2d8a4a, 0x3a9a4a, 0x246b38];
  for (let i = 0; i < leafN; i++) {
    const a = (i / leafN) * Math.PI * 2;
    const tilt = 0.52 + (i % 3) * 0.14;
    const leaf = new THREE.BoxGeometry(0.28, 0.07, 2.8);
    leaf.translate(0, 0, 1.25);
    leaf.rotateX(tilt);
    leaf.rotateY(a);
    leaf.translate(x, y + 0.12, 0);
    colorAttr(leaf, leafColors[i % 3]);
    parts.push(leaf);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35;
    const leaf = new THREE.BoxGeometry(0.22, 0.06, 2.15);
    leaf.translate(0, 0, 0.95);
    leaf.rotateX(0.22);
    leaf.rotateY(a);
    leaf.translate(x, y + 0.38, 0);
    colorAttr(leaf, 0x4aad55);
    parts.push(leaf);
  }
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

/**
 * Точки на тротуаре вдоль оси север–юг (x = const), шаг вдоль z.
 * Середина каждого отрезка сетки — между перекрёстками.
 */
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

/** Точки на тротуаре вдоль оси запад–восток (z = const), шаг вдоль x. */
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

/**
 * Строит реквизит города. В state не пишет. Физику столбов не добавляет.
 * @param {{ scene: import('three').Scene }} engine
 * @param {object} layout
 */
export function buildProps(engine, layout) {
  lampGlobeMat = null;
  tfRedMat = null;
  tfYellowMat = null;
  tfGreenMat = null;
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
  const promenadeZ = layout.ocean && layout.ocean.promenadeZ;

  const dummy = new THREE.Object3D();

  const palmPts = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (!inList(x, avenueXs)) continue;
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkNS(x, zs, off, PALM_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) palmPts.push(pts[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const isProm = promenadeZ != null && near(z, promenadeZ);
    if (!inList(z, avenueZs) && !isProm) continue;
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkEW(z, xs, off, PALM_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) palmPts.push(pts[p]);
  }

  const lampPts = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkNS(x, zs, off, LAMP_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) lampPts.push(pts[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkEW(z, xs, off, LAMP_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) lampPts.push(pts[p]);
  }

  const lightPts = [];
  const crosses = layout.intersections || [];
  for (let i = 0; i < crosses.length; i++) {
    const c = crosses[i];
    if (!c.avenueX && !c.avenueZ) continue;
    if (c.z >= beachZ0) continue;
    const wX = widthOnAxis(c.x, avenueXs, streetW, avenueW);
    const wZ = widthOnAxis(c.z, avenueZs, streetW, avenueW);
    const px = c.x + wX * 0.5 + 2;
    const pz = c.z + wZ * 0.5 + 2;
    if (pz >= beachZ0) continue;
    lightPts.push({ x: px, z: pz });
  }

  const palmGeo = makePalmGeo();
  const lampPostGeo = new THREE.CylinderGeometry(0.08, 0.09, 5, 6);
  const lampGlobeGeo = new THREE.SphereGeometry(0.22, 6, 5);
  const tfPostGeo = new THREE.CylinderGeometry(0.1, 0.12, 4.2, 6);
  const tfBoxGeo = new THREE.BoxGeometry(0.28, 0.28, 0.32);

  const palmMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    vertexColors: true,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e33,
    roughness: 0.6,
    metalness: 0.25,
  });
  lampGlobeMat = new THREE.MeshStandardMaterial({
    color: 0xffe8b0,
    emissive: 0xffe8b0,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.0,
  });
  tfRedMat = new THREE.MeshStandardMaterial({
    color: 0x331111,
    emissive: 0xff2222,
    emissiveIntensity: 0.15,
    roughness: 0.4,
  });
  tfYellowMat = new THREE.MeshStandardMaterial({
    color: 0x443300,
    emissive: 0xffcc22,
    emissiveIntensity: 0.15,
    roughness: 0.4,
  });
  tfGreenMat = new THREE.MeshStandardMaterial({
    color: 0x113311,
    emissive: 0x22cc44,
    emissiveIntensity: 0.15,
    roughness: 0.4,
  });

  const palmN = Math.max(1, palmPts.length);
  const palms = makeInstanced(palmGeo, palmMat, palmN, true);
  palms.name = 'propsPalms';
  for (let i = 0; i < palmPts.length; i++) {
    const p = palmPts[i];
    const yaw = (i * 0.37) % (Math.PI * 2);
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    applyInstance(palms, i, dummy);
  }
  palms.instanceMatrix.needsUpdate = true;
  scene.add(palms);

  const lampN = Math.max(1, lampPts.length);
  const lampPosts = makeInstanced(lampPostGeo, postMat, lampN, true);
  const lampGlobes = makeInstanced(lampGlobeGeo, lampGlobeMat, lampN, false);
  for (let i = 0; i < lampPts.length; i++) {
    const p = lampPts[i];
    dummy.position.set(p.x, 2.5, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    applyInstance(lampPosts, i, dummy);
    dummy.position.set(p.x, 5.12, p.z);
    applyInstance(lampGlobes, i, dummy);
  }
  lampPosts.instanceMatrix.needsUpdate = true;
  lampGlobes.instanceMatrix.needsUpdate = true;
  scene.add(lampPosts);
  scene.add(lampGlobes);

  const tfN = Math.max(1, lightPts.length);
  const tfPosts = makeInstanced(tfPostGeo, postMat, tfN, true);
  const tfRed = makeInstanced(tfBoxGeo, tfRedMat, tfN, false);
  const tfYellow = makeInstanced(tfBoxGeo, tfYellowMat, tfN, false);
  const tfGreen = makeInstanced(tfBoxGeo, tfGreenMat, tfN, false);
  for (let i = 0; i < lightPts.length; i++) {
    const p = lightPts[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(p.x, 2.1, p.z);
    applyInstance(tfPosts, i, dummy);
    dummy.position.set(p.x, 4.55, p.z);
    applyInstance(tfRed, i, dummy);
    dummy.position.set(p.x, 4.22, p.z);
    applyInstance(tfYellow, i, dummy);
    dummy.position.set(p.x, 3.89, p.z);
    applyInstance(tfGreen, i, dummy);
  }
  tfPosts.instanceMatrix.needsUpdate = true;
  tfRed.instanceMatrix.needsUpdate = true;
  tfYellow.instanceMatrix.needsUpdate = true;
  tfGreen.instanceMatrix.needsUpdate = true;
  scene.add(tfPosts);
  scene.add(tfRed);
  scene.add(tfYellow);
  scene.add(tfGreen);

  return { palms, lampPosts, lampGlobes };
}

/**
 * Яркость плафонов по времени суток. В state не пишет.
 * @param {number} dt
 * @param {object} engine
 */
export function updateProps(dt, engine) {
  const t = engine && engine.state && engine.state.time;
  const f = nightFactor(t);
  if (lampGlobeMat) lampGlobeMat.emissiveIntensity = 0.2 + f * 2.3;
  if (!tfRedMat || !tfYellowMat || !tfGreenMat) return;
  const list = engine.state && engine.state.city && engine.state.city.intersections;
  let signal = 'ns';
  if (list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].hasLight) {
        signal = list[i].signal;
        break;
      }
    }
  }
  tfGreenMat.emissiveIntensity = signal === 'ns' ? 3 : 0.1;
  tfRedMat.emissiveIntensity = signal === 'ns' ? 0.12 : 3;
  tfYellowMat.emissiveIntensity = signal === 'red' ? 2.5 : 0.1;
}
