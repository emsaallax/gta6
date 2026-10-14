// ФАЙЛЫ: src/world/city/breakHydrants.js
/** Ломаемые гидранты: InstancedMesh, crash/shot, фонтан 5 с. */

import * as THREE from 'three';

export const HYDRANT_COLOR = 0xc41e3a;
export const BOX = { w: 0.5, d: 0.5, h: 0.7 };
export const SPRAY_SEC = 5;
export const FLY_N = 8;

const STEP = 80;
const INTERSECT_GAP = 10;
const BEACH_Z = 440;
const HIDE = 0.001;
const REST_Y = 0.35;
const FLY_SEC = 0.8;
const FLY_G = 18;
const SHOT_DIST = 40;
const SPRAY_DT = 0.2;
const EPS = 1e-4;

const dummy = new THREE.Object3D();

let _ctx = null;
let _listening = false;

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

function sidewalkNS(x, zs, offset, step, beachZ0) {
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
      if (tooCloseToAxis(z, zs)) continue;
      out.push({ x: x - offset, z });
      out.push({ x: x + offset, z });
    }
  }
  return out;
}

function sidewalkEW(z, xs, offset, step, beachZ0) {
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
      if (tooCloseToAxis(x, xs)) continue;
      const zA = z - offset;
      const zB = z + offset;
      if (zA < beachZ0) out.push({ x, z: zA });
      if (zB < beachZ0) out.push({ x, z: zB });
    }
  }
  return out;
}

export function collectHydrantPts(layout) {
  if (!layout || !layout.grid) return [];
  const grid = layout.grid;
  const xs = grid.xs;
  const zs = grid.zs;
  if (!xs || !zs || !xs.length || !zs.length) return [];
  const beachZ0 =
    (layout.ocean && typeof layout.ocean.beachZ0 === 'number' && Number.isFinite(layout.ocean.beachZ0))
      ? layout.ocean.beachZ0
      : BEACH_Z;
  const streetW = grid.streetWidth || 12;
  const avenueW = grid.avenueWidth || 22;
  const sidewalk = grid.sidewalk || 3.5;
  const out = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const w = widthOnAxis(x, grid.avenueXs, streetW, avenueW);
    const pts = sidewalkNS(x, zs, sidewalkOffset(w, sidewalk), STEP, beachZ0);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    const w = widthOnAxis(z, grid.avenueZs, streetW, avenueW);
    const pts = sidewalkEW(z, xs, sidewalkOffset(w, sidewalk), STEP, beachZ0);
    for (let p = 0; p < pts.length; p++) out.push(pts[p]);
  }
  return out;
}

/** Луч xz из (ox,oz) вдоль (dx,dz) vs коробка центра (x,z) размера (w,d). t в (0, maxDist] или null. */
export function rayHitsBox(ox, oz, dx, dz, x, z, w, d, maxDist) {
  const len = Math.hypot(dx, dz);
  if (!(len > 0) || !(maxDist > 0)) return null;
  const ux = dx / len;
  const uz = dz / len;
  const hx = w * 0.5;
  const hz = d * 0.5;
  const minX = x - hx;
  const maxX = x + hx;
  const minZ = z - hz;
  const maxZ = z + hz;
  let tmin = 0;
  let tmax = maxDist;

  if (Math.abs(ux) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const tx1 = (minX - ox) / ux;
    const tx2 = (maxX - ox) / ux;
    const txMin = Math.min(tx1, tx2);
    const txMax = Math.max(tx1, tx2);
    tmin = Math.max(tmin, txMin);
    tmax = Math.min(tmax, txMax);
  }

  if (Math.abs(uz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const tz1 = (minZ - oz) / uz;
    const tz2 = (maxZ - oz) / uz;
    const tzMin = Math.min(tz1, tz2);
    const tzMax = Math.max(tz1, tz2);
    tmin = Math.max(tmin, tzMin);
    tmax = Math.min(tmax, tzMax);
  }

  if (tmax < tmin) return null;
  if (tmin > 0 && tmin <= maxDist) return tmin;
  return null;
}

function pointInHydrant(px, pz, hx, hz) {
  return Math.abs(px - hx) <= BOX.w * 0.5 && Math.abs(pz - hz) <= BOX.d * 0.5;
}

function setInst(mesh, i, x, y, z, sx, sy, sz, rx, ry, rz) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx || 0, ry || 0, rz || 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

function hideInst(mesh, i) {
  setInst(mesh, i, 0, 0, 0, HIDE, HIDE, HIDE, 0, 0, 0);
}

function spawnDust(engine, x, z) {
  try {
    const fx = engine && engine.state && engine.state.fx;
    if (!fx || typeof fx.spawn !== 'function') return;
    fx.spawn('dust', {
      pos: { x, y: 0.5, z },
      dir: { x: 0, y: 1, z: 0 },
      count: 6,
      color: 0x7ec8e3,
    });
  } catch (_e) {
    // нет fx — молчать
  }
}

function takeFly(ctx) {
  for (let i = 0; i < ctx.flies.length; i++) {
    if (!ctx.flies[i].used) return ctx.flies[i];
  }
  return null;
}

function breakHydrant(ctx, engine, index, dirX, dirZ) {
  if (!ctx || index == null || ctx.broken[index]) return;
  const fly = takeFly(ctx);
  if (!fly) return;
  ctx.broken[index] = true;
  hideInst(ctx.mesh, index);
  ctx.mesh.instanceMatrix.needsUpdate = true;

  const p = ctx.pts[index];
  let dx = dirX;
  let dz = dirZ;
  const dlen = Math.hypot(dx, dz);
  if (dlen < 1e-4) {
    dx = 1;
    dz = 0;
  } else {
    dx /= dlen;
    dz /= dlen;
  }
  fly.used = true;
  fly.x = p.x;
  fly.y = REST_Y;
  fly.z = p.z;
  fly.vx = dx * 6;
  fly.vy = 5;
  fly.vz = dz * 6;
  fly.t = 0;
  fly.spin = 0;
  setInst(ctx.fly, fly.i, fly.x, fly.y, fly.z, 1, 1, 1, 0, 0, 0);
  ctx.fly.instanceMatrix.needsUpdate = true;

  ctx.sprays.push({ x: p.x, z: p.z, t: 0, acc: 0 });
  spawnDust(engine, p.x, p.z);
}

function onCrash(engine, detail) {
  const ctx = _ctx;
  if (!ctx || !ctx.pts.length) return;
  const d = detail && detail.point ? detail : (detail && detail.detail);
  const point = d && d.point;
  if (!point) return;
  const px = point.x;
  const pz = point.z;
  if (typeof px !== 'number' || typeof pz !== 'number') return;
  for (let i = 0; i < ctx.pts.length; i++) {
    const p = ctx.pts[i];
    if (pointInHydrant(px, pz, p.x, p.z)) {
      breakHydrant(ctx, engine, i, px - p.x, pz - p.z);
      return;
    }
  }
}

function onShot(engine) {
  const ctx = _ctx;
  if (!ctx || !ctx.pts.length) return;
  const state = engine && engine.state;
  const pos = state && state.player && state.player.position;
  const fwd = state && state.camera && state.camera.forward;
  if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') return;
  if (!fwd || typeof fwd.x !== 'number' || typeof fwd.z !== 'number') return;
  let bestI = -1;
  let bestT = Infinity;
  for (let i = 0; i < ctx.pts.length; i++) {
    if (ctx.broken[i]) continue;
    const p = ctx.pts[i];
    const t = rayHitsBox(pos.x, pos.z, fwd.x, fwd.z, p.x, p.z, BOX.w, BOX.d, SHOT_DIST);
    if (t != null && t < bestT) {
      bestT = t;
      bestI = i;
    }
  }
  if (bestI >= 0) breakHydrant(ctx, engine, bestI, fwd.x, fwd.z);
}

function subscribe(engine) {
  if (_listening || !engine || typeof engine.on !== 'function') return;
  _listening = true;
  engine.on('crash', (detail) => {
    try {
      onCrash(engine, detail);
    } catch (_e) {
      // тихо
    }
  });
  engine.on('shot', () => {
    try {
      onShot(engine);
    } catch (_e) {
      // тихо
    }
  });
}

export async function buildBreakHydrants(engine, layout) {
  const pts = collectHydrantPts(layout);
  const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: HYDRANT_COLOR,
    roughness: 0.45,
    metalness: 0.1,
  });
  const restN = Math.max(1, pts.length);
  const mesh = new THREE.InstancedMesh(geo, mat, restN);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const fly = new THREE.InstancedMesh(geo, mat, FLY_N);
  fly.frustumCulled = false;
  fly.castShadow = true;
  fly.receiveShadow = true;

  for (let i = 0; i < restN; i++) {
    if (i < pts.length) setInst(mesh, i, pts[i].x, REST_Y, pts[i].z, 1, 1, 1, 0, 0, 0);
    else hideInst(mesh, i);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const flies = [];
  for (let i = 0; i < FLY_N; i++) {
    hideInst(fly, i);
    flies.push({
      i, used: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, spin: 0,
    });
  }
  fly.instanceMatrix.needsUpdate = true;

  if (engine && engine.scene) {
    engine.scene.add(mesh);
    engine.scene.add(fly);
  }

  _ctx = {
    mesh,
    fly,
    pts,
    broken: pts.map(() => false),
    flies,
    sprays: [],
  };
  subscribe(engine);
  return { mesh, fly, pts };
}

export function updateBreakHydrants(dt, engine) {
  const ctx = _ctx;
  if (!ctx) return;
  const step = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;

  let flyDirty = false;
  for (let i = 0; i < ctx.flies.length; i++) {
    const f = ctx.flies[i];
    if (!f.used) continue;
    f.t += step;
    f.vy -= FLY_G * step;
    f.x += f.vx * step;
    f.y += f.vy * step;
    f.z += f.vz * step;
    f.spin += 4 * step;
    if (f.y < 0.12) {
      f.y = 0.12;
      f.vy = 0;
    }
    if (f.t >= FLY_SEC) {
      f.used = false;
      hideInst(ctx.fly, f.i);
    } else {
      setInst(ctx.fly, f.i, f.x, f.y, f.z, 1, 1, 1, f.spin, 0, f.spin * 0.6);
    }
    flyDirty = true;
  }
  if (flyDirty) ctx.fly.instanceMatrix.needsUpdate = true;

  const keep = [];
  for (let i = 0; i < ctx.sprays.length; i++) {
    const s = ctx.sprays[i];
    s.t += step;
    s.acc += step;
    if (s.t > SPRAY_SEC) continue;
    while (s.acc >= SPRAY_DT) {
      s.acc -= SPRAY_DT;
      spawnDust(engine, s.x, s.z);
    }
    keep.push(s);
  }
  ctx.sprays = keep;
}
