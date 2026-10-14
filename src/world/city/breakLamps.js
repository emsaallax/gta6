// ФАЙЛЫ: src/world/city/breakLamps.js
/** Ломаемые фонари: InstancedMesh + пул падения. События crash / shot. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAMP_PATH = 'assets/models/kenney/city-kit-roads/light-curved.glb';
export const LAMP_STEP = 40;
export const BOX = { w: 0.6, d: 0.6, h: 5 };
export const FALL_SEC = 0.7;
export const FLY_N = 8;

const EPS = 1e-4;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const HIDE = 0.001;
const SHOT_DIST = 40;
const FLY_Y0 = 0; // пивот падения у основания (геометрия от y=0): старт с земли, иначе столб подпрыгивает
const FLY_Y1 = 0.15;
const SPARK_COLOR = 0xffcc66;
const GLOW_Y = BOX.h; // центр плафона: голова фонаря
const GLOW_R = 0.22; // радиус плафона
const GLOW_NIGHT = 2.5; // emissiveIntensity ночью, днём 0
const GLOW_NIGHT_FROM = 19.5; // ночь: с 19:30 до 6:00
const GLOW_NIGHT_TO = 6;

const dummy = new THREE.Object3D();

let runtime = null;

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

function sidewalkNS(x, zs, offset, step, beachZ0, skipIntersect) {
  const out = [];
  if (!zs || zs.length < 2) return out;
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
  if (!xs || xs.length < 2) return out;
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

export function collectLampPts(layout) {
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

export function rayHitsBox(ox, oz, dx, dz, x, z, w, d, maxDist) {
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-8) || !(maxDist > 0)) return null;
  const rdx = dx / len;
  const rdz = dz / len;
  const hx = w * 0.5;
  const hz = d * 0.5;
  const minX = x - hx;
  const maxX = x + hx;
  const minZ = z - hz;
  const maxZ = z + hz;
  let tmin = 0;
  let tmax = maxDist;

  if (Math.abs(rdx) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    let t1 = (minX - ox) / rdx;
    let t2 = (maxX - ox) / rdx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (Math.abs(rdz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    let t1 = (minZ - oz) / rdz;
    let t2 = (maxZ - oz) / rdz;
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

function pointHitsBox(px, pz, x, z, w, d) {
  return Math.abs(px - x) <= w * 0.5 && Math.abs(pz - z) <= d * 0.5;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readXZ(obj) {
  if (!obj) return null;
  const x = num(obj.x);
  const z = num(obj.z);
  if (x == null || z == null) return null;
  return { x, z };
}

function makeFallbackGeo() {
  const post = new THREE.CylinderGeometry(0.08, 0.08, 5, 8);
  post.translate(0, 2.5, 0);
  const globe = new THREE.SphereGeometry(0.22, 8, 6);
  globe.translate(0, 5.12, 0);
  const merged = mergeGeometries([post, globe], false);
  post.dispose();
  globe.dispose();
  if (merged && !merged.attributes.normal) merged.computeVertexNormals();
  return merged || post;
}

function bakeGlbGeo(gltf) {
  const root = gltf && gltf.scene;
  if (!root) return null;
  root.updateMatrixWorld(true);
  const geos = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const g = obj.geometry.clone();
    g.applyMatrix4(obj.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    geos.push(g);
  });
  if (!geos.length) return null;
  let geo = geos[0];
  if (geos.length > 1) {
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (merged) geo = merged;
  }
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (box && !box.isEmpty()) {
    const height = box.max.y - box.min.y;
    const dy = -box.min.y;
    if (Math.abs(dy) > 1e-6) geo.translate(0, dy, 0);
    // нормировка к BOX.h: видимый столб совпадает с коробкой попадания
    if (height > 1e-6) {
      const s = BOX.h / height;
      geo.scale(s, s, s);
    }
  }
  return geo;
}

async function loadLampGeo(engine) {
  const assets = engine && engine.state && engine.state.assets;
  if (!assets || typeof assets.loadGLB !== 'function') return makeFallbackGeo();
  try {
    const gltf = await assets.loadGLB(LAMP_PATH);
    const geo = bakeGlbGeo(gltf);
    return geo || makeFallbackGeo();
  } catch (err) {
    return makeFallbackGeo();
  }
}

function applyInst(mesh, i, posX, posY, posZ, rotZ, sx, sy, sz) {
  dummy.position.set(posX, posY, posZ);
  dummy.rotation.set(0, 0, rotZ);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

function hideFlySlot(rt, i) {
  rt.flyBusy[i] = false;
  rt.flyAge[i] = 0;
  rt.flyLamp[i] = -1;
  applyInst(rt.fly, i, 0, 0, 0, 0, HIDE, HIDE, HIDE);
  rt.fly.instanceMatrix.needsUpdate = true;
}

function spawnSparks(engine, x, z) {
  const fx = engine && engine.state && engine.state.fx;
  if (!fx || typeof fx.spawn !== 'function') return;
  try {
    fx.spawn('sparks', {
      pos: { x, y: 2, z },
      dir: { x: 0, y: 1, z: 0 },
      count: 10,
      color: SPARK_COLOR,
    });
  } catch (err) {
    /* нет fx — молчать */
  }
}

function hideRest(rt, lampI) {
  const p = rt.pts[lampI];
  applyInst(rt.mesh, lampI, p.x, 0, p.z, 0, HIDE, HIDE, HIDE);
  rt.mesh.instanceMatrix.needsUpdate = true;
}

function pickFlySlot(rt) {
  let oldest = 0;
  for (let i = 0; i < FLY_N; i++) {
    if (!rt.flyBusy[i]) return i;
    if (rt.flyAge[i] > rt.flyAge[oldest]) oldest = i;
  }
  // все слоты заняты: переиспользуем самый старый (он почти упал), удар не теряем
  return oldest;
}

// плафон горит ночью (GLOW_NIGHT), днём 0; час суток из engine.state.time
function glowTarget(engine) {
  const state = engine && engine.state;
  const h = state ? state.time : NaN;
  if (!Number.isFinite(h)) return 0;
  return h >= GLOW_NIGHT_FROM || h < GLOW_NIGHT_TO ? GLOW_NIGHT : 0;
}

// сломанный или летящий фонарь гасит свой плафон (scale 0)
function hideGlow(rt, i) {
  applyInst(rt.glow, i, 0, 0, 0, 0, 0, 0, 0);
  rt.glow.instanceMatrix.needsUpdate = true;
}

function breakLamp(rt, engine, lampI) {
  if (!rt || lampI < 0 || lampI >= rt.pts.length) return;
  if (rt.broken[lampI]) return;
  const slot = pickFlySlot(rt);
  rt.broken[lampI] = true;
  hideRest(rt, lampI);
  hideGlow(rt, lampI);
  const p = rt.pts[lampI];
  rt.flyBusy[slot] = true;
  rt.flyAge[slot] = 0;
  rt.flyLamp[slot] = lampI;
  applyInst(rt.fly, slot, p.x, FLY_Y0, p.z, 0, 1, 1, 1);
  rt.fly.instanceMatrix.needsUpdate = true;
  spawnSparks(engine, p.x, p.z);
}

function onCrash(engine, detail) {
  const rt = runtime;
  if (!rt) return;
  const point = detail && detail.point;
  const xz = readXZ(point);
  if (!xz) return;
  for (let i = 0; i < rt.pts.length; i++) {
    if (rt.broken[i]) continue;
    const p = rt.pts[i];
    if (pointHitsBox(xz.x, xz.z, p.x, p.z, BOX.w, BOX.d)) {
      breakLamp(rt, engine, i);
      return;
    }
  }
}

function onShot(engine) {
  const rt = runtime;
  if (!rt) return;
  const state = engine && engine.state;
  const pos = state && state.player && state.player.position;
  const fwd = state && state.camera && state.camera.forward;
  const oxz = readXZ(pos);
  const dxz = readXZ(fwd);
  if (!oxz || !dxz) return;
  let bestI = -1;
  let bestT = Infinity;
  for (let i = 0; i < rt.pts.length; i++) {
    if (rt.broken[i]) continue;
    const p = rt.pts[i];
    const t = rayHitsBox(oxz.x, oxz.z, dxz.x, dxz.z, p.x, p.z, BOX.w, BOX.d, SHOT_DIST);
    if (t == null) continue;
    if (t < bestT) {
      bestT = t;
      bestI = i;
    }
  }
  if (bestI >= 0) breakLamp(rt, engine, bestI);
}

function disposeRuntime(rt) {
  if (!rt) return;
  if (rt.mesh.parent) rt.mesh.parent.remove(rt.mesh);
  if (rt.fly.parent) rt.fly.parent.remove(rt.fly);
  rt.mesh.geometry.dispose();
  rt.mesh.material.dispose();
}

// подписки на engine ставятся один раз на объект engine; обработчики берут текущий runtime
const listenedEngines = new WeakSet();

function attachListeners(engine) {
  if (!engine || typeof engine.on !== 'function') return;
  if (listenedEngines.has(engine)) return;
  listenedEngines.add(engine);
  engine.on('crash', (detail) => {
    onCrash(engine, detail);
  });
  engine.on('shot', () => {
    onShot(engine);
  });
}

/**
 * @param {{ scene?: object, state?: object, on?: Function }} engine
 * @param {object} layout
 * @returns {Promise<{ mesh: object, fly: object, pts: object[] }>}
 */
export async function buildBreakLamps(engine, layout) {
  const pts = collectLampPts(layout);
  const geo = await loadLampGeo(engine);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc9c4b8,
    roughness: 0.55,
    metalness: 0.15,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  const restCount = Math.max(1, pts.length);
  const mesh = new THREE.InstancedMesh(geo, mat, restCount);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'breakLamps';

  const fly = new THREE.InstancedMesh(geo, mat, FLY_N);
  fly.frustumCulled = false;
  fly.castShadow = true;
  fly.receiveShadow = false;
  fly.name = 'breakLampsFly';

  // плафон: отдельный InstancedMesh с той же раскладкой, без теней (один draw call)
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dc,
    roughness: 0.4,
    metalness: 0,
    emissive: 0xffe8b0,
    emissiveIntensity: glowTarget(engine),
  });
  const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(GLOW_R, 8, 6), glowMat, restCount);
  glow.frustumCulled = false;
  glow.castShadow = false;
  glow.receiveShadow = false;
  glow.name = 'breakLampsGlow';

  if (pts.length === 0) {
    applyInst(mesh, 0, 0, 0, 0, 0, HIDE, HIDE, HIDE);
    applyInst(glow, 0, 0, 0, 0, 0, 0, 0, 0);
  } else {
    for (let i = 0; i < pts.length; i++) {
      applyInst(mesh, i, pts[i].x, 0, pts[i].z, 0, 1, 1, 1);
      applyInst(glow, i, pts[i].x, GLOW_Y, pts[i].z, 0, 1, 1, 1);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  glow.instanceMatrix.needsUpdate = true;

  // прошлую сборку плафонов убираем сами: disposeRuntime о них не знает
  if (runtime && runtime.glow) {
    if (runtime.glow.parent) runtime.glow.parent.remove(runtime.glow);
    runtime.glow.geometry.dispose();
    runtime.glowMat.dispose();
  }
  disposeRuntime(runtime);
  runtime = {
    mesh,
    fly,
    glow,
    glowMat,
    pts,
    broken: [],
    flyBusy: [],
    flyAge: [],
    flyLamp: [],
  };
  for (let i = 0; i < pts.length; i++) runtime.broken[i] = false;
  for (let i = 0; i < FLY_N; i++) {
    runtime.flyBusy[i] = false;
    runtime.flyAge[i] = 0;
    runtime.flyLamp[i] = -1;
    applyInst(fly, i, 0, 0, 0, 0, HIDE, HIDE, HIDE);
  }
  fly.instanceMatrix.needsUpdate = true;

  if (engine && engine.scene) {
    engine.scene.add(mesh);
    engine.scene.add(fly);
    engine.scene.add(glow);
  }

  attachListeners(engine);

  return { mesh, fly, glow, pts };
}

export function updateBreakLamps(dt, engine) {
  const rt = runtime;
  if (!rt || !rt.fly) return;
  const step = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
  let dirty = false;
  for (let i = 0; i < FLY_N; i++) {
    if (!rt.flyBusy[i]) continue;
    rt.flyAge[i] += step;
    const u = Math.min(1, rt.flyAge[i] / FALL_SEC);
    const lampI = rt.flyLamp[i];
    const p = lampI >= 0 ? rt.pts[lampI] : { x: 0, z: 0 };
    const y = FLY_Y0 + (FLY_Y1 - FLY_Y0) * u;
    const rotZ = (Math.PI / 2) * u;
    applyInst(rt.fly, i, p.x, y, p.z, rotZ, 1, 1, 1);
    dirty = true;
    if (u >= 1) {
      hideFlySlot(rt, i);
    }
  }
  if (dirty) rt.fly.instanceMatrix.needsUpdate = true;
  // плафоны плавно: к GLOW_NIGHT ночью, к 0 днём (без аллокаций)
  rt.glowMat.emissiveIntensity += (glowTarget(engine) - rt.glowMat.emissiveIntensity) * Math.min(1, step * 2);
}
