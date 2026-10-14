// ФАЙЛЫ: src/world/city/breakStreet.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BOX = {
  urn: { w: 1.1, d: 0.75, h: 1.0 },
  bench: { w: 1.4, d: 0.5, h: 0.5 },
  fence: { w: 1.6, d: 0.2, h: 1.0 },
  umbrella: { w: 2.2, d: 2.2, h: 2.4 },
};
export const FLY_N = 6;
export const DUMPSTER_PATH = 'assets/models/kenney/city-kit-roads/dumpster.glb';
export const PARASOL_PATH = 'assets/models/kenney/city-kit-commercial/detail-parasol-a.glb';
export const FENCE_PATH = 'assets/models/kenney/city-kit-roads/construction-fence.glb';

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const PROP_STEP = 80;
const HIDE = 0.001;
const FLY_SCALE = 0.9;
const FLY_LIFT = 0.1;
const G = 18;
const VY0 = 4;
const FENCE_ROT = 1.4;
const FENCE_SEC = 0.5;
const UMB_ROT = 1.3;
const UMB_SEC = 0.6;
const SHOT_DIST = 40;
const FLY_XZ = 10;

const dummy = new THREE.Object3D();

let street = null;
let listenEngine = null;

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
      out.push({ x: x - offset, z, ns: true });
      out.push({ x: x + offset, z, ns: true });
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
      if (zA < beachZ0) out.push({ x, z: zA, ns: false });
      if (zB < beachZ0) out.push({ x, z: zB, ns: false });
    }
  }
  return out;
}

function collectSidewalk(layout) {
  const out = [];
  if (!layout || !layout.grid) return out;
  const grid = layout.grid;
  const beachZ0 = (layout.ocean && layout.ocean.beachZ0) || BEACH_Z;
  const xs = grid.xs;
  const zs = grid.zs;
  if (!xs || !zs) return out;
  const streetW = grid.streetWidth;
  const avenueW = grid.avenueWidth;
  const sidewalk = grid.sidewalk;
  const avenueXs = grid.avenueXs;
  const avenueZs = grid.avenueZs;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkNS(x, zs, off, PROP_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkEW(z, xs, off, PROP_STEP, beachZ0, true);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  return out;
}

/** Луч xz из (ox,oz) вдоль (dx,dz) vs коробка центра (x,z) размера (w,d). t в (0, maxDist] или null. */
export function rayHitsBox(ox, oz, dx, dz, x, z, w, d, maxDist) {
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-8) || !(maxDist > 0)) return null;
  const ndx = dx / len;
  const ndz = dz / len;
  const minX = x - w * 0.5;
  const maxX = x + w * 0.5;
  const minZ = z - d * 0.5;
  const maxZ = z + d * 0.5;
  let tmin = 0;
  let tmax = maxDist;
  if (Math.abs(ndx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / ndx;
    let t2 = (maxX - ox) / ndx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(ndz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / ndz;
    let t2 = (maxZ - oz) / ndz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin > 0 && tmin <= maxDist) return tmin;
  return null;
}

function stdMat(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.8,
    metalness: 0,
  });
}

function cloneMaterial(src) {
  const m = Array.isArray(src) ? src[0] : src;
  if (!m || typeof m.clone !== 'function') return null;
  return m.clone();
}

function extractKenney(gltf) {
  if (!gltf || !gltf.scene) return null;
  gltf.scene.updateMatrixWorld(true);
  const geos = [];
  let mat = null;
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const g = obj.geometry.clone();
    g.applyMatrix4(obj.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    geos.push(g);
    if (!mat) mat = cloneMaterial(obj.material);
  });
  if (!geos.length) return null;
  let geo = geos[0];
  if (geos.length > 1) {
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (merged) geo = merged;
  }
  if (mat && geo.attributes.color) mat.vertexColors = true;
  return { geo, mat };
}

async function tryLoadGlb(engine, path) {
  const assets = engine && engine.state && engine.state.assets;
  if (!assets || typeof assets.loadGLB !== 'function') return null;
  try {
    return await assets.loadGLB(path);
  } catch (err) {
    return null;
  }
}

function geoSize(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return {
    x: Math.max(0.001, b.max.x - b.min.x),
    y: Math.max(0.001, b.max.y - b.min.y),
    z: Math.max(0.001, b.max.z - b.min.z),
    minY: b.min.y,
  };
}

function makeInstanced(geo, mat, count, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.frustumCulled = false;
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function setInst(mesh, index, x, y, z, rx, ry, rz, sx, sy, sz) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function applyMesh(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
}

function makeUrnFallback() {
  return new THREE.BoxGeometry(1.1, 1.0, 0.75);
}

function makeBenchFallback() {
  return new THREE.BoxGeometry(1.4, 0.45, 0.45);
}

function makeFenceFallback() {
  return new THREE.BoxGeometry(1.6, 1.0, 0.08);
}

function makeUmbrellaFallback() {
  const cone = new THREE.ConeGeometry(1.35, 0.22, 10);
  cone.translate(0, 2.29, 0);
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.18, 6);
  pole.translate(0, 1.09, 0);
  const merged = mergeGeometries([cone, pole], false);
  cone.dispose();
  pole.dispose();
  return merged || new THREE.ConeGeometry(1.35, 0.22, 10);
}

function fitScale(geo, box) {
  const sz = geoSize(geo);
  const sx = box.w / sz.x;
  const sy = box.h / sz.y;
  const szs = box.d / sz.z;
  const s = Math.min(sx, sy, szs);
  return { s, y: -sz.minY * s, minY: sz.minY };
}

function umbrellaPts(layout) {
  const out = [];
  if (!layout) return out;
  const lots = layout.lots || [];
  const beachZ0 = (layout.ocean && layout.ocean.beachZ0) || BEACH_Z;
  const sidewalk = (layout.grid && layout.grid.sidewalk) || 3.5;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.cz >= beachZ0) continue;
    if (lot.district !== 'residential' && lot.district !== 'beach') continue;
    if (lot.id % 6 !== 0) continue;
    const z = lot.maxZ + sidewalk * 0.5;
    if (z >= beachZ0) continue;
    out.push({ x: lot.cx, z, yaw: 0 });
  }
  return out;
}

function ensurePts(pts) {
  if (pts && pts.length) return pts;
  return [{ x: 0, z: 0, yaw: 0, ns: true }];
}

function pointInBox(px, pz, x, z, w, d) {
  return Math.abs(px - x) <= w * 0.5 && Math.abs(pz - z) <= d * 0.5;
}

function spawnFx(engine, kind, x, z) {
  const fx = engine && engine.state && engine.state.fx;
  if (!fx || typeof fx.spawn !== 'function') return;
  const name = kind === 'umbrella' ? 'dust' : 'debris';
  fx.spawn(name, {
    pos: { x, y: 0.4, z },
    dir: { x: 0, y: 1, z: 0 },
    count: 8,
    color: 0x888888,
  });
}

function hideRest(kind, i) {
  const rec = street.kinds[kind];
  const p = rec.pts[i];
  setInst(rec.mesh, i, p.x, 0, p.z, 0, p.yaw || 0, 0, HIDE, HIDE, HIDE);
  applyMesh(rec.mesh);
  rec.alive[i] = false;
}

function takeFly(kind) {
  const rec = street.kinds[kind];
  if (!rec.flySlots) return -1;
  for (let i = 0; i < rec.flySlots.length; i++) {
    if (!rec.flySlots[i].used) return i;
  }
  return -1;
}

function hideFly(kind, slot) {
  const rec = street.kinds[kind];
  const f = rec.flySlots[slot];
  f.used = false;
  setInst(rec.fly, slot, 0, 0, 0, 0, 0, 0, HIDE, HIDE, HIDE);
  applyMesh(rec.fly);
}

function breakFlyKind(kind, i, dirx, dirz) {
  const rec = street.kinds[kind];
  if (!rec.alive[i]) return;
  const p = rec.pts[i];
  hideRest(kind, i);
  spawnFx(street.engine, kind, p.x, p.z);
  const slot = takeFly(kind);
  if (slot < 0) return;
  let vx = dirx;
  let vz = dirz;
  const len = Math.hypot(vx, vz);
  if (len > 1e-6) {
    vx = (vx / len) * FLY_XZ;
    vz = (vz / len) * FLY_XZ;
  } else {
    vx = FLY_XZ;
    vz = 0;
  }
  const startY = rec.y0 + FLY_LIFT;
  rec.flySlots[slot] = {
    used: true,
    x: p.x,
    y: startY,
    z: p.z,
    vx,
    vy: VY0,
    vz,
    yaw: p.yaw || 0,
  };
  setInst(rec.fly, slot, p.x, startY, p.z, 0, p.yaw || 0, 0, rec.sx * FLY_SCALE, rec.sy * FLY_SCALE, rec.sz * FLY_SCALE);
  applyMesh(rec.fly);
}

function breakTiltKind(kind, i) {
  const rec = street.kinds[kind];
  if (!rec.alive[i]) return;
  rec.alive[i] = false;
  rec.fall[i] = { t: 0, done: false };
  spawnFx(street.engine, kind, rec.pts[i].x, rec.pts[i].z);
}

function breakAt(kind, i, dirx, dirz) {
  if (kind === 'urn' || kind === 'bench') breakFlyKind(kind, i, dirx, dirz);
  else breakTiltKind(kind, i);
}

/** yaw ≈ π/2 (mod π): коробка повёрнута, w и d меняются местами. */
function quarterTurn(yaw) {
  return Math.abs(Math.cos(yaw || 0)) < 0.5;
}

function hitW(kind, yaw) {
  return quarterTurn(yaw) ? BOX[kind].d : BOX[kind].w;
}

function hitD(kind, yaw) {
  return quarterTurn(yaw) ? BOX[kind].w : BOX[kind].d;
}

function onCrash(detail) {
  if (!street || !detail || !detail.point) return;
  const pt = detail.point;
  const px = pt.x;
  const pz = pt.z;
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return;
  let best = null;
  let bestDist = Infinity;
  const names = ['urn', 'bench', 'fence', 'umbrella'];
  for (let n = 0; n < names.length; n++) {
    const kind = names[n];
    const rec = street.kinds[kind];
    for (let i = 0; i < rec.pts.length; i++) {
      if (!rec.alive[i]) continue;
      const p = rec.pts[i];
      if (!pointInBox(px, pz, p.x, p.z, hitW(kind, p.yaw), hitD(kind, p.yaw))) continue;
      const dist = Math.hypot(px - p.x, pz - p.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind, i };
      }
    }
  }
  if (!best) return;
  const p = street.kinds[best.kind].pts[best.i];
  breakAt(best.kind, best.i, px - p.x, pz - p.z);
}

function onShot() {
  if (!street) return;
  const st = street.engine && street.engine.state;
  const pos = st && st.player && st.player.position;
  const fwd = st && st.camera && st.camera.forward;
  if (!pos || !fwd) return;
  const ox = pos.x;
  const oz = pos.z;
  const dx = fwd.x;
  const dz = fwd.z;
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
  let best = null;
  let bestT = Infinity;
  const names = ['urn', 'bench', 'fence', 'umbrella'];
  for (let n = 0; n < names.length; n++) {
    const kind = names[n];
    const rec = street.kinds[kind];
    for (let i = 0; i < rec.pts.length; i++) {
      if (!rec.alive[i]) continue;
      const p = rec.pts[i];
      const t = rayHitsBox(ox, oz, dx, dz, p.x, p.z, hitW(kind, p.yaw), hitD(kind, p.yaw), SHOT_DIST);
      if (t == null) continue;
      if (t < bestT) {
        bestT = t;
        best = { kind, i };
      }
    }
  }
  if (!best) return;
  breakAt(best.kind, best.i, dx, dz);
}

/** Подписка на crash/shot один раз на engine; при смене engine старую снимаем через off, если он есть. */
function listen(engine) {
  if (listenEngine === engine) return;
  if (listenEngine && typeof listenEngine.off === 'function') {
    listenEngine.off('crash', onCrash);
    listenEngine.off('shot', onShot);
  }
  listenEngine = null;
  if (!engine || typeof engine.on !== 'function') return;
  engine.on('crash', onCrash);
  engine.on('shot', onShot);
  listenEngine = engine;
}

function fillRest(rec, y0, sx, sy, sz) {
  for (let i = 0; i < rec.pts.length; i++) {
    const p = rec.pts[i];
    setInst(rec.mesh, i, p.x, y0, p.z, 0, p.yaw || 0, 0, sx, sy, sz);
  }
  applyMesh(rec.mesh);
}

function hideAllFly(fly, n) {
  for (let i = 0; i < n; i++) {
    setInst(fly, i, 0, 0, 0, 0, 0, 0, HIDE, HIDE, HIDE);
  }
  applyMesh(fly);
}

function makeKindFly(geo, mat, pts, y0, sx, sy, sz) {
  const mesh = makeInstanced(geo, mat, pts.length, true);
  const rec = {
    mesh,
    fly: makeInstanced(geo, mat, FLY_N, true),
    pts,
    alive: pts.map(() => true),
    flySlots: [],
    y0,
    sx,
    sy,
    sz,
  };
  fillRest(rec, y0, sx, sy, sz);
  hideAllFly(rec.fly, FLY_N);
  for (let i = 0; i < FLY_N; i++) rec.flySlots.push({ used: false });
  return rec;
}

function makeKindTilt(geo, mat, pts, y0, sx, sy, sz) {
  const rec = {
    mesh: makeInstanced(geo, mat, pts.length, true),
    pts,
    alive: pts.map(() => true),
    fall: pts.map(() => null),
    y0,
    sx,
    sy,
    sz,
  };
  fillRest(rec, y0, sx, sy, sz);
  return rec;
}

/**
 * Урна, скамейка, заборчик, зонт кафе. В state не пишет.
 * @returns {Promise<{ kinds: object }>}
 */
export async function buildBreakStreet(engine, layout) {
  street = null;
  const emptyKind = (name) => ({
    mesh: null,
    fly: name === 'urn' || name === 'bench' ? null : undefined,
    pts: [{ x: 0, z: 0 }],
  });
  const empty = {
    kinds: {
      urn: emptyKind('urn'),
      bench: emptyKind('bench'),
      fence: emptyKind('fence'),
      umbrella: emptyKind('umbrella'),
    },
  };
  if (!engine || !engine.scene) return empty;

  const sidewalk = collectSidewalk(layout);
  const urnPts = [];
  const benchPts = [];
  for (let i = 0; i < sidewalk.length; i++) {
    const p = sidewalk[i];
    if (i % 2 === 0) urnPts.push(p);
    else benchPts.push(p);
  }
  const fencePts = [];
  const beachZ0 = (layout && layout.ocean && layout.ocean.beachZ0) || BEACH_Z;
  const srcFence = sidewalk.length ? sidewalk : [];
  const gridXs = layout && layout.grid && layout.grid.xs;
  const gridZs = layout && layout.grid && layout.grid.zs;
  for (let i = 0; i < srcFence.length; i++) {
    const p = srcFence[i];
    const fx = p.ns ? p.x : p.x + 3;
    const fz = p.ns ? p.z + 3 : p.z;
    if (fz >= beachZ0) continue;
    // Сдвинутый забор тоже не должен попасть в зазор перекрёстка.
    const axes = p.ns ? gridZs : gridXs;
    if (axes && tooCloseToAxis(p.ns ? fz : fx, axes)) continue;
    // ns: улица вдоль z, забор вдоль тротуара (длинная сторона по z); ew: вдоль x.
    fencePts.push({ x: fx, z: fz, yaw: p.ns ? Math.PI * 0.5 : 0 });
  }

  const urnList = ensurePts(urnPts);
  const benchList = ensurePts(benchPts);
  const fenceList = ensurePts(fencePts);
  const umbList = ensurePts(umbrellaPts(layout));

  const dumpGltf = await tryLoadGlb(engine, DUMPSTER_PATH);
  const fenceGltf = await tryLoadGlb(engine, FENCE_PATH);
  const paraGltf = await tryLoadGlb(engine, PARASOL_PATH);
  const dumpPack = extractKenney(dumpGltf);
  const fencePack = extractKenney(fenceGltf);
  const paraPack = extractKenney(paraGltf);

  let urnGeo;
  let urnMat;
  let urnY = BOX.urn.h * 0.5;
  let urnS = 1;
  if (dumpPack && dumpPack.geo) {
    urnGeo = dumpPack.geo;
    urnMat = dumpPack.mat || stdMat(0x6a6a6a);
    const fit = fitScale(urnGeo, BOX.urn);
    urnS = fit.s;
    urnY = fit.y;
  } else {
    urnGeo = makeUrnFallback();
    urnMat = stdMat(0x6a6a6a);
  }

  const benchGeo = makeBenchFallback();
  const benchMat = stdMat(0xc9c4b8);
  const benchY = 0.225;

  let fenceGeo;
  let fenceMat;
  let fenceY = BOX.fence.h * 0.5;
  let fenceS = 1;
  if (fencePack && fencePack.geo) {
    fenceGeo = fencePack.geo;
    fenceMat = fencePack.mat || stdMat(0x8a9096);
    const fit = fitScale(fenceGeo, { w: 1.6, d: 0.08, h: 1.0 });
    fenceS = fit.s;
    fenceY = fit.y;
  } else {
    fenceGeo = makeFenceFallback();
    fenceMat = stdMat(0x8a9096);
  }

  let umbGeo;
  let umbMat;
  let umbY = 0;
  let umbS = 1;
  if (paraPack && paraPack.geo) {
    umbGeo = paraPack.geo;
    umbMat = paraPack.mat || stdMat(0xffc4a3);
    const fit = fitScale(umbGeo, BOX.umbrella);
    umbS = fit.s;
    umbY = fit.y;
  } else {
    umbGeo = makeUmbrellaFallback();
    umbMat = stdMat(0xffc4a3);
  }

  const urn = makeKindFly(urnGeo, urnMat, urnList, urnY, urnS, urnS, urnS);
  const bench = makeKindFly(benchGeo, benchMat, benchList, benchY, 1, 1, 1);
  const fence = makeKindTilt(fenceGeo, fenceMat, fenceList, fenceY, fenceS, fenceS, fenceS);
  const umbrella = makeKindTilt(umbGeo, umbMat, umbList, umbY, umbS, umbS, umbS);

  engine.scene.add(urn.mesh, urn.fly, bench.mesh, bench.fly, fence.mesh, umbrella.mesh);

  street = { engine, kinds: { urn, bench, fence, umbrella } };

  listen(engine);

  return {
    kinds: {
      urn: { mesh: urn.mesh, fly: urn.fly, pts: urn.pts },
      bench: { mesh: bench.mesh, fly: bench.fly, pts: bench.pts },
      fence: { mesh: fence.mesh, pts: fence.pts },
      umbrella: { mesh: umbrella.mesh, pts: umbrella.pts },
    },
  };
}

function updateFlyKind(kind, dt) {
  const rec = street.kinds[kind];
  let dirty = false;
  for (let i = 0; i < rec.flySlots.length; i++) {
    const f = rec.flySlots[i];
    if (!f.used) continue;
    f.vy -= G * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    if (f.y <= rec.y0) {
      hideFly(kind, i);
      dirty = true;
      continue;
    }
    setInst(rec.fly, i, f.x, f.y, f.z, 0, f.yaw, 0, rec.sx * FLY_SCALE, rec.sy * FLY_SCALE, rec.sz * FLY_SCALE);
    dirty = true;
  }
  if (dirty) applyMesh(rec.fly);
}

function updateTilt(kind, dt, rotAxis, target, dur) {
  const rec = street.kinds[kind];
  let dirty = false;
  for (let i = 0; i < rec.pts.length; i++) {
    const fall = rec.fall[i];
    if (!fall || fall.done) continue;
    fall.t += dt;
    const u = Math.min(1, fall.t / dur);
    const ang = target * u;
    const p = rec.pts[i];
    const rx = rotAxis === 'x' ? ang : 0;
    const rz = rotAxis === 'z' ? ang : 0;
    if (u >= 1) {
      fall.done = true;
      setInst(rec.mesh, i, p.x, rec.y0, p.z, rx, p.yaw || 0, rz, HIDE, HIDE, HIDE);
    } else {
      setInst(rec.mesh, i, p.x, rec.y0, p.z, rx, p.yaw || 0, rz, rec.sx, rec.sy, rec.sz);
    }
    dirty = true;
  }
  if (dirty) applyMesh(rec.mesh);
}

export function updateBreakStreet(dt) {
  if (!street) return;
  const d = Number.isFinite(dt) ? dt : 0;
  updateFlyKind('urn', d);
  updateFlyKind('bench', d);
  updateTilt('fence', d, 'z', FENCE_ROT, FENCE_SEC);
  updateTilt('umbrella', d, 'x', UMB_ROT, UMB_SEC);
}
