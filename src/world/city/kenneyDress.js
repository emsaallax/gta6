/** ФАЙЛЫ: src/world/city/kenneyDress.js */
/** Фонари, урны, клумбы, навесы кафе и LOD дальних кварталов. Только InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const LAMP_STEP = 40;
const PROP_STEP = 80;
const SPOT_Y = 0.07;
const SPOT_R = 3.2;
const AWNING_Y = 3.2;
const LOD_HIDE = 0.001;
const LOD_NEAR = 80;

export const DRESS_PATHS = {
  lamp: 'assets/models/kenney/city-kit-roads/light-curved.glb',
  dumpster: 'assets/models/kenney/city-kit-roads/dumpster.glb',
  bush: 'assets/models/kenney/nature-kit/plant_bushSmall.glb',
  awning: 'assets/models/kenney/city-kit-commercial/detail-awning.glb',
  parasol: 'assets/models/kenney/city-kit-commercial/detail-parasol-a.glb',
  lod: 'assets/models/kenney/city-kit-commercial/low-detail-building-a.glb',
};

let spotMat = null;
let globeMat = null;
let lodMesh = null;
let lodBases = [];
const dummy = new THREE.Object3D();

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

function collectSidewalk(grid, beachZ0, step) {
  const out = [];
  const xs = grid.xs;
  const zs = grid.zs;
  const streetW = grid.streetWidth;
  const avenueW = grid.avenueWidth;
  const sidewalk = grid.sidewalk;
  const avenueXs = grid.avenueXs;
  const avenueZs = grid.avenueZs;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, avenueXs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkNS(x, zs, off, step, beachZ0, true);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const w = widthOnAxis(z, avenueZs, streetW, avenueW);
    const off = sidewalkOffset(w, sidewalk);
    const pts = sidewalkEW(z, xs, off, step, beachZ0, true);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  return out;
}

function isNight(t) {
  return typeof t === 'number' && Number.isFinite(t) && (t < 6 || t >= 19.5);
}

function applyInstance(mesh, index, obj) {
  obj.updateMatrix();
  mesh.setMatrixAt(index, obj.matrix);
}

function makeInstanced(geo, mat, count, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.frustumCulled = false;
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function stdMat(hex, extra) {
  const o = extra || {};
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: o.roughness != null ? o.roughness : 0.8,
    metalness: o.metalness != null ? o.metalness : 0,
    emissive: o.emissive != null ? o.emissive : 0x000000,
    emissiveIntensity: o.emissiveIntensity != null ? o.emissiveIntensity : 0,
  });
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

function cloneMaterial(src) {
  const m = Array.isArray(src) ? src[0] : src;
  if (!m || typeof m.clone !== 'function') return null;
  return m.clone();
}

/** Все Mesh после updateMatrixWorld → один geo + клон материала Kenney. */
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

function fillGround(mesh, pts, y, sx, sy, sz, yawFn) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, yawFn ? yawFn(i, p) : 0, 0);
    dummy.scale.set(sx, sy, sz);
    applyInstance(mesh, i, dummy);
  }
  if (pts.length === 0) {
    dummy.position.set(0, 0, 0);
    dummy.scale.set(LOD_HIDE, LOD_HIDE, LOD_HIDE);
    applyInstance(mesh, 0, dummy);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function makeLampFallback() {
  const post = new THREE.CylinderGeometry(0.08, 0.1, 5, 6);
  post.translate(0, 2.5, 0);
  const globe = new THREE.SphereGeometry(0.22, 6, 5);
  globe.translate(0, 5.12, 0);
  return { post, globe };
}

function makeDumpsterFallback() {
  return new THREE.BoxGeometry(1.1, 1.0, 0.75);
}

function makeBushFallback() {
  return new THREE.SphereGeometry(0.55, 8, 6);
}

function makeAwningFallback() {
  return new THREE.BoxGeometry(3.2, 0.12, 1.4);
}

function makeParasolFallback() {
  const cone = new THREE.ConeGeometry(1.35, 0.22, 10);
  cone.translate(0, 2.35, 0);
  return cone;
}

function makeLodFallback() {
  return new THREE.BoxGeometry(1, 1, 1);
}

function cafeLots(lots, beachZ0) {
  const out = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.cz >= beachZ0 || lot.cz >= 440) continue;
    if (lot.district !== 'residential' && lot.district !== 'beach') continue;
    if (lot.id % 6 !== 0) continue;
    out.push(lot);
  }
  return out;
}

function awningPlaces(lots, beachZ0) {
  const out = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.cz >= beachZ0 || lot.cz >= 440) continue;
    if (lot.district !== 'residential' && lot.district !== 'beach') continue;
    const faces = [
      { x: lot.cx, z: lot.maxZ + 0.15, yaw: 0, zOk: lot.maxZ + 0.15 < 440 },
      { x: lot.cx, z: lot.minZ - 0.15, yaw: Math.PI, zOk: lot.minZ - 0.15 < 440 },
      { x: lot.maxX + 0.15, z: lot.cz, yaw: Math.PI * 0.5, zOk: lot.cz < 440 },
      { x: lot.minX - 0.15, z: lot.cz, yaw: -Math.PI * 0.5, zOk: lot.cz < 440 },
    ];
    for (let f = 0; f < faces.length; f++) {
      if (!faces[f].zOk) continue;
      out.push({ x: faces[f].x, z: faces[f].z, yaw: faces[f].yaw });
    }
  }
  return out;
}

function parasolPlaces(lots, beachZ0, sidewalk) {
  const cafes = cafeLots(lots, beachZ0);
  const out = [];
  const off = (sidewalk || 3.5) * 0.5 + 0.4;
  for (let i = 0; i < cafes.length; i++) {
    const lot = cafes[i];
    const z1 = lot.maxZ + off;
    const z2 = lot.minZ - off;
    if (z1 < 440) out.push({ x: lot.cx - 1.6, z: z1, yaw: 0 });
    if (z1 < 440) out.push({ x: lot.cx + 1.6, z: z1, yaw: 0.4 });
    if (z2 < 440 && z2 >= -600) out.push({ x: lot.cx, z: z2, yaw: 1.1 });
  }
  return out;
}

function lodPlaces(lots) {
  const out = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (lot.district !== 'downtown') continue;
    out.push({
      x: lot.cx,
      z: lot.cz,
      sx: Math.max(8, lot.sx * 0.85),
      sy: 28 + (lot.id % 7) * 6,
      sz: Math.max(8, lot.sz * 0.85),
    });
  }
  return out;
}

function lookAtPos(engine) {
  const s = engine && engine.state;
  if (s && s.cameraTarget && s.cameraTarget.position) return s.cameraTarget.position;
  if (s && s.player && s.player.position) return s.player.position;
  return { x: 0, y: 0, z: 0 };
}

/**
 * Фонари, пропсы тротуара, навесы и LOD. В state не пишет.
 * @param {{ scene: import('three').Scene, state?: object }} engine
 * @param {object} layout
 */
export async function buildKenneyDress(engine, layout) {
  spotMat = null;
  globeMat = null;
  lodMesh = null;
  lodBases = [];
  const meshes = [];
  const empty = { meshes, spotMat: null, usedAssets: false };
  if (!engine || !engine.scene || !layout || !layout.grid) return empty;
  const scene = engine.scene;
  const grid = layout.grid;
  const beachZ0 = (layout.ocean && layout.ocean.beachZ0) || BEACH_Z;
  const lots = layout.lots || [];

  const loaded = {};
  let usedAssets = false;
  const keys = Object.keys(DRESS_PATHS);
  for (let i = 0; i < keys.length; i++) {
    const gltf = await tryLoadGlb(engine, DRESS_PATHS[keys[i]]);
    const pack = extractKenney(gltf);
    if (pack && pack.geo) {
      loaded[keys[i]] = pack;
      usedAssets = true;
    }
  }

  const lampPts = collectSidewalk(grid, beachZ0, LAMP_STEP);
  const propPts = collectSidewalk(grid, beachZ0, PROP_STEP);
  const dumpPts = [];
  const bushPts = [];
  const benchPts = [];
  const hydrPts = [];
  for (let i = 0; i < propPts.length; i++) {
    const p = propPts[i];
    const m = i % 4;
    if (m === 0) dumpPts.push(p);
    else if (m === 1) bushPts.push(p);
    else if (m === 2) benchPts.push(p);
    else hydrPts.push(p);
  }

  const awnPts = awningPlaces(lots, beachZ0);
  const paraPts = parasolPlaces(lots, beachZ0, grid.sidewalk);
  const lodPts = lodPlaces(lots);

  if (loaded.lamp) {
    const geo = loaded.lamp.geo;
    const sz = geoSize(geo);
    const sy = 5.2 / sz.y;
    globeMat = loaded.lamp.mat || stdMat(0xffe8b0, { emissive: 0xffe8b0, roughness: 0.45 });
    globeMat.emissiveIntensity = 0;
    if (globeMat.emissive && globeMat.emissive.getHex() === 0) globeMat.emissive.setHex(0xffe8b0);
    const mesh = makeInstanced(geo, globeMat, lampPts.length, false);
    fillGround(mesh, lampPts, -sz.minY * sy, sy, sy, sy);
    scene.add(mesh);
    meshes.push(mesh);
  } else {
    const fb = makeLampFallback();
    const postMat = stdMat(0x2a2e33, { roughness: 0.6, metalness: 0.25 });
    globeMat = stdMat(0xffe8b0, {
      emissive: 0xffe8b0,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    const posts = makeInstanced(fb.post, postMat, lampPts.length, true);
    const globes = makeInstanced(fb.globe, globeMat, lampPts.length, false);
    fillGround(posts, lampPts, 0, 1, 1, 1);
    fillGround(globes, lampPts, 0, 1, 1, 1);
    scene.add(posts);
    scene.add(globes);
    meshes.push(posts, globes);
  }

  // пятна волны 4 — lampSpots.js; старые круги не ставим
  spotMat = null;

  if (loaded.dumpster) {
    const geo = loaded.dumpster.geo;
    const sz = geoSize(geo);
    const s = 1.1 / Math.max(sz.x, sz.z);
    const mesh = makeInstanced(geo, loaded.dumpster.mat || stdMat(0x6a6a6a), dumpPts.length, false);
    fillGround(mesh, dumpPts, -sz.minY * s, s, s, s);
    scene.add(mesh);
    meshes.push(mesh);
  } else {
    const mesh = makeInstanced(makeDumpsterFallback(), stdMat(0x6a6a6a), dumpPts.length, false);
    fillGround(mesh, dumpPts, 0.5, 1, 1, 1);
    scene.add(mesh);
    meshes.push(mesh);
  }

  if (loaded.bush) {
    const geo = loaded.bush.geo;
    const sz = geoSize(geo);
    const s = 1.1 / Math.max(sz.x, sz.z, sz.y);
    const mesh = makeInstanced(geo, loaded.bush.mat || stdMat(0x4aad55), bushPts.length, false);
    fillGround(mesh, bushPts, -sz.minY * s, s, s, s);
    scene.add(mesh);
    meshes.push(mesh);
  } else {
    const mesh = makeInstanced(makeBushFallback(), stdMat(0x4aad55), bushPts.length, false);
    fillGround(mesh, bushPts, 0.55, 1, 1, 1);
    scene.add(mesh);
    meshes.push(mesh);
  }

  const benchGeo = new THREE.BoxGeometry(1.4, 0.45, 0.45);
  const benches = makeInstanced(benchGeo, stdMat(0xc9c4b8), benchPts.length, true);
  fillGround(benches, benchPts, 0.225, 1, 1, 1, (i) => (i % 2 === 0 ? 0 : Math.PI * 0.5));
  scene.add(benches);
  meshes.push(benches);

  const hydrGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8);
  const hydrants = makeInstanced(hydrGeo, stdMat(0xc41e3a, { roughness: 0.45 }), hydrPts.length, true);
  fillGround(hydrants, hydrPts, 0.35, 1, 1, 1);
  scene.add(hydrants);
  meshes.push(hydrants);

  const awnMat = loaded.awning && loaded.awning.mat
    ? loaded.awning.mat
    : stdMat(0xff8a7a, { roughness: 0.7 });
  if (loaded.awning) {
    const geo = loaded.awning.geo;
    const sz = geoSize(geo);
    const sx = 3.2 / sz.x;
    const sy = 0.35 / sz.y;
    const szs = 1.4 / sz.z;
    const mesh = makeInstanced(geo, awnMat, awnPts.length, false);
    for (let i = 0; i < awnPts.length; i++) {
      const p = awnPts[i];
      dummy.position.set(p.x, AWNING_Y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(sx, sy, szs);
      applyInstance(mesh, i, dummy);
    }
    if (!awnPts.length) {
      dummy.scale.set(LOD_HIDE, LOD_HIDE, LOD_HIDE);
      applyInstance(mesh, 0, dummy);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    meshes.push(mesh);
  } else {
    const mesh = makeInstanced(makeAwningFallback(), awnMat, awnPts.length, false);
    for (let i = 0; i < awnPts.length; i++) {
      const p = awnPts[i];
      dummy.position.set(p.x, AWNING_Y, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      applyInstance(mesh, i, dummy);
    }
    if (!awnPts.length) {
      dummy.scale.set(LOD_HIDE, LOD_HIDE, LOD_HIDE);
      applyInstance(mesh, 0, dummy);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const paraMat = loaded.parasol && loaded.parasol.mat
    ? loaded.parasol.mat
    : stdMat(0xffc4a3, { roughness: 0.65 });
  if (loaded.parasol) {
    const geo = loaded.parasol.geo;
    const sz = geoSize(geo);
    const s = 2.6 / Math.max(sz.x, sz.z);
    const mesh = makeInstanced(geo, paraMat, paraPts.length, true);
    fillGround(mesh, paraPts, -sz.minY * s, s, s, s, (i, p) => p.yaw || 0);
    scene.add(mesh);
    meshes.push(mesh);
  } else {
    const mesh = makeInstanced(makeParasolFallback(), paraMat, paraPts.length, true);
    fillGround(mesh, paraPts, 0, 1, 1, 1, (i, p) => p.yaw || 0);
    scene.add(mesh);
    meshes.push(mesh);
  }

  const lodMat = loaded.lod && loaded.lod.mat
    ? loaded.lod.mat
    : stdMat(0xd8c4ae, { roughness: 0.9 });
  const lodGeo = loaded.lod ? loaded.lod.geo : makeLodFallback();
  const lodSz = geoSize(lodGeo);
  lodMesh = makeInstanced(lodGeo, lodMat, lodPts.length, false);
  lodBases = [];
  for (let i = 0; i < lodPts.length; i++) {
    const p = lodPts[i];
    const sx = p.sx / lodSz.x;
    const sy = p.sy / lodSz.y;
    const szs = p.sz / lodSz.z;
    const y = -lodSz.minY * sy;
    lodBases.push({ x: p.x, y, z: p.z, sx, sy, sz: szs });
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx, sy, szs);
    applyInstance(lodMesh, i, dummy);
  }
  if (!lodPts.length) {
    dummy.position.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    applyInstance(lodMesh, 0, dummy);
    lodBases.push({ x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 });
  }
  lodMesh.instanceMatrix.needsUpdate = true;
  scene.add(lodMesh);
  meshes.push(lodMesh);

  return { meshes, spotMat, usedAssets };
}

/**
 * Пятна и плафоны по времени; LOD по дистанции и quality. В state не пишет.
 * @param {number} dt
 * @param {object} engine
 */
export function updateKenneyDress(dt, engine) {
  const t = engine && engine.state && engine.state.time;
  const night = isNight(t);
  if (globeMat) globeMat.emissiveIntensity = night ? 3 : 0;
  if (!lodMesh || !lodBases.length) return;
  const quality = engine && engine.state && engine.state.settings && engine.state.settings.quality;
  const pos = lookAtPos(engine);
  const px = pos.x || 0;
  const pz = pos.z || 0;
  const forceShow = quality === 'low';
  for (let i = 0; i < lodBases.length; i++) {
    const b = lodBases[i];
    const dx = b.x - px;
    const dz = b.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const show = forceShow || dist > LOD_NEAR;
    const s = show ? 1 : LOD_HIDE;
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.sx * s, b.sy * s, b.sz * s);
    dummy.updateMatrix();
    lodMesh.setMatrixAt(i, dummy.matrix);
  }
  lodMesh.instanceMatrix.needsUpdate = true;
}
