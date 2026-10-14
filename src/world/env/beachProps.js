/** Зонты и шезлонги на песке. ФАЙЛЫ: src/world/env/beachProps.js */
import * as THREE from 'three';

export const PARASOL_A = 'assets/models/kenney/city-kit-commercial/detail-parasol-a.glb';
export const PARASOL_B = 'assets/models/kenney/city-kit-commercial/detail-parasol-b.glb';
export const LOUNGER = 'assets/models/kenney/survival-kit/bedroll.glb';

const X0 = -400;
const X1 = 200;
const Z0 = 448;
const Z1 = 492;
const STEP = 18;
const LOUNGE_DX = 2;
const DEFAULT_BEACH = { x: -80, z: 470 };

const POLE_H = 2.2;
const POLE_R = 0.06;
const DOME_R = 1.85;
const DOME_H = 0.95;
const LOUNGE_W = 0.85;
const LOUNGE_H = 0.18;
const LOUNGE_L = 2.0;

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function beachAnchor(engine) {
  const p = engine.state?.city?.pois?.beach;
  const x = Number.isFinite(p?.x) ? p.x : DEFAULT_BEACH.x;
  const z = Number.isFinite(p?.z) ? p.z : DEFAULT_BEACH.z;
  return { x: clamp(x, X0, X1), z: clamp(z, Z0, Z1) };
}

function alignedRange(min, max, step, anchor) {
  const out = [];
  let v = anchor;
  while (v >= min) {
    if (v <= max) out.push(v);
    v -= step;
  }
  v = anchor + step;
  while (v <= max) {
    if (v >= min) out.push(v);
    v += step;
  }
  out.sort((a, b) => a - b);
  return out;
}

function collectSpots(anchor) {
  const xs = alignedRange(X0, X1, STEP, anchor.x);
  let zs = alignedRange(Z0, Z1, STEP, anchor.z);
  zs.sort((a, b) => Math.abs(a - anchor.z) - Math.abs(b - anchor.z));
  while (zs.length > 1 && xs.length * zs.length > 40) zs.pop();
  zs.sort((a, b) => a - b);
  const spots = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < zs.length; j++) {
      spots.push({ x: xs[i], z: zs[j] });
    }
  }
  return spots;
}

function makeInstanced(geo, mat, count, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function firstMesh(root) {
  let found = null;
  root.traverse((obj) => {
    if (found || !obj.isMesh) return;
    found = obj;
  });
  return found;
}

function matAt(dummy, mesh, x, y, z, extra) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  if (extra) {
    dummy.matrix.multiply(extra);
  }
  mesh.setMatrixAt(dummy._idx, dummy.matrix);
}

export class BeachProps {
  init(engine) {
    const scene = engine.scene;
    const dummy = new THREE.Object3D();
    const spots = collectSpots(beachAnchor(engine));
    const n = spots.length;
    const nA = Math.ceil(n / 2);
    const nB = Math.floor(n / 2);
    this._dummy = dummy;
    this._spots = spots;

    const poleGeo = new THREE.CylinderGeometry(POLE_R, POLE_R, POLE_H, 6);
    poleGeo.translate(0, POLE_H * 0.5, 0);
    const domeGeo = new THREE.ConeGeometry(DOME_R, DOME_H, 8, 1, true);
    domeGeo.translate(0, POLE_H + DOME_H * 0.35, 0);
    const loungeGeo = new THREE.BoxGeometry(LOUNGE_W, LOUNGE_H, LOUNGE_L);
    loungeGeo.translate(0, LOUNGE_H * 0.5, 0);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d4, roughness: 0.7 });
    const domeAMat = new THREE.MeshStandardMaterial({
      color: 0xff8a7a,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const domeBMat = new THREE.MeshStandardMaterial({
      color: 0x3fc1c9,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const loungeMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd6, roughness: 0.85 });

    this.poles = makeInstanced(poleGeo, poleMat, n, true);
    this.domeA = makeInstanced(domeGeo, domeAMat, Math.max(1, nA), true);
    this.domeB = makeInstanced(domeGeo.clone(), domeBMat, Math.max(1, nB), true);
    this.lounges = makeInstanced(loungeGeo, loungeMat, n, false);

    let iA = 0;
    let iB = 0;
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      dummy._idx = i;
      matAt(dummy, this.poles, s.x, 0, s.z, null);
      dummy._idx = i;
      matAt(dummy, this.lounges, s.x + LOUNGE_DX, 0, s.z, null);
      if (i % 2 === 0) {
        dummy._idx = iA++;
        matAt(dummy, this.domeA, s.x, 0, s.z, null);
      } else {
        dummy._idx = iB++;
        matAt(dummy, this.domeB, s.x, 0, s.z, null);
      }
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.domeA.instanceMatrix.needsUpdate = true;
    this.domeB.instanceMatrix.needsUpdate = true;
    this.lounges.instanceMatrix.needsUpdate = true;

    this.poles.name = 'beachPoles';
    this.domeA.name = 'beachDomeA';
    this.domeB.name = 'beachDomeB';
    this.lounges.name = 'beachLounges';

    scene.add(this.poles, this.domeA, this.domeB, this.lounges);

    this._glbA = null;
    this._glbB = null;
    this._glbL = null;
    this._tryLoad(engine);
  }

  _tryLoad(engine) {
    const assets = engine.state?.assets;
    if (typeof assets?.loadGLB !== 'function') return;
    const load = (path, onOk) => {
      Promise.resolve()
        .then(() => assets.loadGLB(path))
        .then((gltf) => {
          if (!gltf) return;
          onOk(gltf);
        })
        .catch(() => {});
    };
    load(PARASOL_A, (gltf) => this._swapParasol(engine, gltf, 'A'));
    load(PARASOL_B, (gltf) => this._swapParasol(engine, gltf, 'B'));
    load(LOUNGER, (gltf) => this._swapLounge(engine, gltf));
  }

  _cloneRoot(engine, gltf) {
    const assets = engine.state?.assets;
    if (typeof assets?.cloneGLB === 'function') return assets.cloneGLB(gltf);
    if (gltf?.scene) return gltf.scene.clone(true);
    return null;
  }

  _bakeFromMesh(mesh) {
    mesh.updateWorldMatrix(true, false);
    return mesh.matrixWorld.clone();
  }

  _fillKind(inst, kind, bake) {
    const dummy = this._dummy;
    const spots = this._spots;
    let k = 0;
    for (let i = 0; i < spots.length; i++) {
      const take = kind === 'L' ? true : kind === 'A' ? i % 2 === 0 : i % 2 === 1;
      if (!take) continue;
      const s = spots[i];
      const x = kind === 'L' ? s.x + LOUNGE_DX : s.x;
      dummy._idx = k++;
      matAt(dummy, inst, x, 0, s.z, bake);
    }
    inst.count = k;
    inst.instanceMatrix.needsUpdate = true;
  }

  _hidePolesIfBoth() {
    if (this._glbA && this._glbB) this.poles.visible = false;
  }

  _swapParasol(engine, gltf, kind) {
    const root = this._cloneRoot(engine, gltf);
    const mesh = root && firstMesh(root);
    if (!mesh) return;
    const n = kind === 'A' ? Math.ceil(this._spots.length / 2) : Math.floor(this._spots.length / 2);
    const geo = mesh.geometry;
    const mat = mesh.material;
    const inst = makeInstanced(geo, mat, Math.max(1, n), true);
    inst.name = kind === 'A' ? 'beachGlbParasolA' : 'beachGlbParasolB';
    this._fillKind(inst, kind, this._bakeFromMesh(mesh));
    engine.scene.add(inst);
    if (kind === 'A') {
      this.domeA.visible = false;
      this._glbA = inst;
      this._zeroPoles('even');
    } else {
      this.domeB.visible = false;
      this._glbB = inst;
      this._zeroPoles('odd');
    }
    this._hidePolesIfBoth();
  }

  _zeroPoles(which) {
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    const n = this._spots.length;
    for (let i = 0; i < n; i++) {
      const even = i % 2 === 0;
      if (which === 'even' && even) this.poles.setMatrixAt(i, dummy.matrix);
      if (which === 'odd' && !even) this.poles.setMatrixAt(i, dummy.matrix);
    }
    this.poles.instanceMatrix.needsUpdate = true;
  }

  _swapLounge(engine, gltf) {
    const root = this._cloneRoot(engine, gltf);
    const mesh = root && firstMesh(root);
    if (!mesh) return;
    const inst = makeInstanced(mesh.geometry, mesh.material, this._spots.length, false);
    inst.name = 'beachGlbLounger';
    this._fillKind(inst, 'L', this._bakeFromMesh(mesh));
    engine.scene.add(inst);
    this.lounges.visible = false;
    this._glbL = inst;
  }

  update(_dt, engine) {
    void _dt;
    void engine;
  }
}
