// ФАЙЛЫ: src/core/fx.js
import * as THREE from 'three';

export const FX_KINDS = ['sparks', 'debris', 'smoke', 'dust', 'glass', 'shell'];

/** Ёмкость на high. low = max(1, floor(n/2)). */
export const FX_CAP = {
  sparks: 64, debris: 48, smoke: 48, dust: 40, glass: 40, shell: 32,
};

const FX_LIFE = {
  sparks: 0.4, debris: 1.2, smoke: 1.5, dust: 0.8, glass: 0.7, shell: 1.0,
};

const FX_AY = {
  sparks: -18, debris: -12, smoke: 0.6, dust: -1.2, glass: -14, shell: -20,
};

const FX_BOUNCE = {
  debris: -0.25, glass: -0.2, shell: -0.35,
};

const FX_COLOR = {
  sparks: 0xffcc44,
  debris: 0x6a645c,
  smoke: 0x3a3a3a,
  dust: 0xc2b59a,
  glass: 0xaad4ff,
  shell: 0xc9a227,
};

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();
const _col = new THREE.Color();

export function fxCap(kind, quality) {
  const n = FX_CAP[kind];
  if (n == null) return 0;
  if (quality === 'low') return Math.max(1, Math.floor(n / 2));
  return n;
}

function makeGeometry(kind) {
  if (kind === 'sparks') return new THREE.BoxGeometry(0.04, 0.04, 0.04);
  if (kind === 'debris') return new THREE.BoxGeometry(0.1, 0.1, 0.1);
  if (kind === 'smoke') return new THREE.SphereGeometry(0.12, 6, 4);
  if (kind === 'dust') return new THREE.SphereGeometry(0.1, 6, 4);
  if (kind === 'glass') return new THREE.BoxGeometry(0.05, 0.05, 0.05);
  return new THREE.BoxGeometry(0.03, 0.03, 0.08);
}

function readQuality(engine) {
  const q = engine && engine.state && engine.state.settings && engine.state.settings.quality;
  return q === 'low' ? 'low' : 'high';
}

function normalizeDir(dir) {
  if (!dir) return { x: 0, y: 1, z: 0 };
  const x = Number(dir.x);
  const y = Number(dir.y);
  const z = Number(dir.z);
  const dx = Number.isFinite(x) ? x : 0;
  const dy = Number.isFinite(y) ? y : 0;
  const dz = Number.isFinite(z) ? z : 0;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) return { x: 0, y: 1, z: 0 };
  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * 6 InstancedMesh в scene (если scene есть): sparks Box 0.04; debris Box 0.1;
 * smoke Sphere 0.12; dust Sphere 0.1; glass Box 0.05; shell Box 0.03×0.03×0.08.
 * MeshBasicMaterial. frustumCulled=true. Нет живых → mesh.count=0, visible=false.
 * Не добавлять в engine.systems.
 */
export function createFx(scene) {
  let lastQuality = 'high';
  const pools = {};
  const meshes = [];

  for (let k = 0; k < FX_KINDS.length; k++) {
    const kind = FX_KINDS[k];
    const max = FX_CAP[kind];
    const geo = makeGeometry(kind);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;
    mesh.count = 0;
    mesh.visible = false;
    mesh.name = 'fx-' + kind;
    if (scene && typeof scene.add === 'function') scene.add(mesh);

    const life = new Float32Array(max);
    const maxLife = new Float32Array(max);
    const x = new Float32Array(max);
    const y = new Float32Array(max);
    const z = new Float32Array(max);
    const vx = new Float32Array(max);
    const vy = new Float32Array(max);
    const vz = new Float32Array(max);
    const cr = new Float32Array(max);
    const cg = new Float32Array(max);
    const cb = new Float32Array(max);

    _pos.set(0, -1000, 0);
    _scale.set(0, 0, 0);
    _quat.identity();
    _col.setHex(FX_COLOR[kind]);
    for (let i = 0; i < max; i++) {
      life[i] = 0;
      _mat.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat);
      mesh.setColorAt(i, _col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;

    pools[kind] = {
      kind, mesh, max, cursor: 0,
      life, maxLife, x, y, z, vx, vy, vz, cr, cg, cb,
    };
    meshes.push(mesh);
  }

  function spawn(kind, opts) {
    const pool = pools[kind];
    if (!pool) return;
    if (!opts || opts.pos == null) return;
    const pos = opts.pos;
    const px = Number(pos.x);
    const py = Number(pos.y);
    const pz = Number(pos.z);
    const ox = Number.isFinite(px) ? px : 0;
    const oy = Number.isFinite(py) ? py : 0;
    const oz = Number.isFinite(pz) ? pz : 0;

    const cap = fxCap(kind, lastQuality);
    let n = opts.count == null ? 8 : Number(opts.count);
    if (!Number.isFinite(n)) n = 8;
    n = Math.floor(n);
    n = Math.max(1, Math.min(n, cap));

    const dir = normalizeDir(opts.dir);
    let hex = FX_COLOR[kind];
    if (Number.isFinite(opts.color)) hex = opts.color;
    _col.setHex(hex);
    const r = _col.r;
    const g = _col.g;
    const b = _col.b;
    const maxL = FX_LIFE[kind];

    for (let s = 0; s < n; s++) {
      const i = pool.cursor % cap;
      pool.cursor = (pool.cursor + 1) % cap;
      pool.life[i] = maxL;
      pool.maxLife[i] = maxL;
      pool.x[i] = ox;
      pool.y[i] = oy;
      pool.z[i] = oz;
      const spd = 4 + Math.random() * 5;
      pool.vx[i] = dir.x * spd + (Math.random() * 2 - 1);
      pool.vy[i] = dir.y * spd + (kind === 'sparks' ? 2 : 0);
      pool.vz[i] = dir.z * spd + (Math.random() * 2 - 1);
      pool.cr[i] = r;
      pool.cg[i] = g;
      pool.cb[i] = b;
    }
  }

  function update(dt, engine) {
    lastQuality = readQuality(engine);
    if (!Number.isFinite(dt)) dt = 0;

    for (let k = 0; k < FX_KINDS.length; k++) {
      const kind = FX_KINDS[k];
      const pool = pools[kind];
      const mesh = pool.mesh;
      const ay = FX_AY[kind];
      const bounce = FX_BOUNCE[kind];
      const high = pool.max;
      let living = 0;

      for (let i = 0; i < high; i++) {
        if (pool.life[i] <= 0) continue;
        pool.life[i] -= dt;
        if (pool.life[i] <= 0) {
          pool.life[i] = 0;
          continue;
        }
        pool.vy[i] += ay * dt;
        pool.x[i] += pool.vx[i] * dt;
        pool.y[i] += pool.vy[i] * dt;
        pool.z[i] += pool.vz[i] * dt;
        if (bounce != null && pool.y[i] < 0) {
          pool.y[i] = 0;
          pool.vy[i] *= bounce;
        }

        const lifeT = pool.life[i] / pool.maxLife[i];
        let sc = 1;
        if (kind === 'smoke') sc = 1 + 2 * (1 - lifeT);

        _pos.set(pool.x[i], pool.y[i], pool.z[i]);
        _scale.set(sc, sc, sc);
        _quat.identity();
        _mat.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(living, _mat);
        _col.setRGB(pool.cr[i], pool.cg[i], pool.cb[i]);
        mesh.setColorAt(living, _col);
        living++;
      }

      mesh.count = living;
      mesh.visible = living > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (living > 0 && typeof mesh.computeBoundingSphere === 'function') {
        mesh.computeBoundingSphere();
      }
    }
  }

  return { spawn, update, meshes };
}
