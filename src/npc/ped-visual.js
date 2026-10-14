// Вид прохожих: 3 InstancedMesh, без спауна.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAX_PEDS = 80;
export const LOD_DIST = 60;
export const CIV_PALETTE = [0xffc4a3, 0x9fe3c9, 0xc9b6ff, 0xf4ecd6, 0xff8a7a, 0x3fc1c9];
export const HIP_Y = 0.9;
export const SHOULDER_Y = 1.4;

const COP_COLOR = 0x2f4f8a;
const SWING = 0.42;
const DOWN_TILT = Math.PI / 2;
const DOWN_LIFT = 0.25;

const TORSO_H = 0.56;
const TORSO_W = 0.36;
const HEAD_H = 0.22;
const ARM_W = 0.1;
const ARM_H = 0.58;
const LEG_W = 0.14;
const LEG_D = 0.16;

const tint = new THREE.Color();
const mPos = new THREE.Matrix4();
const mRy = new THREE.Matrix4();
const mRx = new THREE.Matrix4();
const mT = new THREE.Matrix4();
const mTinv = new THREE.Matrix4();
const mBase = new THREE.Matrix4();
const mOut = new THREE.Matrix4();

let colorSeq = 0;

function boxAt(w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

function makeBodyGeo() {
  const torsoY = HIP_Y + TORSO_H * 0.5;
  const headY = HIP_Y + TORSO_H + HEAD_H * 0.5;
  const hairY = HIP_Y + TORSO_H + HEAD_H + 0.04;
  return mergeGeometries([
    boxAt(TORSO_W, TORSO_H, 0.22, 0, torsoY, 0),
    boxAt(0.2, HEAD_H, 0.2, 0, headY, 0),
    boxAt(0.22, 0.08, 0.22, 0, hairY, 0),
  ]);
}

function makeLegsGeo() {
  const cy = HIP_Y * 0.5;
  const x = 0.1;
  return mergeGeometries([
    boxAt(LEG_W, HIP_Y, LEG_D, -x, cy, 0),
    boxAt(LEG_W, HIP_Y, LEG_D, x, cy, 0),
  ]);
}

function makeArmsGeo() {
  const cy = SHOULDER_Y - ARM_H * 0.5;
  const x = TORSO_W * 0.5 + ARM_W * 0.5;
  return mergeGeometries([
    boxAt(ARM_W, ARM_H, ARM_W, -x, cy, 0),
    boxAt(ARM_W, ARM_H, ARM_W, x, cy, 0),
  ]);
}

function makeMat() {
  return new THREE.MeshStandardMaterial({
    roughness: 0.74,
    metalness: 0.04,
  });
}

function makeInstanced(geo) {
  const mesh = new THREE.InstancedMesh(geo, makeMat(), MAX_PEDS);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.count = 0;
  return mesh;
}

export function createPedInstances(scene) {
  const body = makeInstanced(makeBodyGeo());
  const legs = makeInstanced(makeLegsGeo());
  const arms = makeInstanced(makeArmsGeo());
  scene.add(body);
  scene.add(legs);
  scene.add(arms);
  return { body, legs, arms };
}

function pedPos(ped) {
  if (ped.object3d && ped.object3d.position) return ped.object3d.position;
  return ped.position;
}

function pedSpeed(ped, x, z, dt) {
  if (ped.body) {
    const b = ped.body;
    return Math.hypot(b.vx || 0, b.vz || 0);
  }
  const lx = ped._lastX;
  const lz = ped._lastZ;
  let spd = 0;
  if (typeof lx === 'number' && typeof lz === 'number') {
    spd = Math.hypot(x - lx, z - lz) / Math.max(dt, 1e-4);
  }
  ped._lastX = x;
  ped._lastZ = z;
  return spd;
}

function ensureColorIdx(ped) {
  if (typeof ped._colorIdx !== 'number') {
    ped._colorIdx = colorSeq++;
  }
  return ped._colorIdx;
}

function pedTint(ped) {
  if (ped.kind === 'cop') {
    tint.setHex(COP_COLOR);
  } else {
    const pal = CIV_PALETTE;
    tint.setHex(pal[ped._colorIdx % pal.length]);
  }
  return tint;
}

function composeBase(x, y, z, heading) {
  mPos.makeTranslation(x, y, z);
  mRy.makeRotationY(heading);
  mBase.multiplyMatrices(mPos, mRy);
  return mBase;
}

function composeDown(x, y, z, heading) {
  composeBase(x, y, z, heading);
  mRx.makeRotationX(DOWN_TILT);
  mOut.multiplyMatrices(mBase, mRx);
  return mOut;
}

function writeBase(mesh, i, mat) {
  mesh.setMatrixAt(i, mat);
}

function writeSwing(mesh, i, base, pivotY, swing) {
  if (!swing) {
    mesh.setMatrixAt(i, base);
    return;
  }
  mT.makeTranslation(0, pivotY, 0);
  mRx.makeRotationX(swing);
  mTinv.makeTranslation(0, -pivotY, 0);
  mOut.multiplyMatrices(base, mT);
  mOut.multiply(mRx);
  mOut.multiply(mTinv);
  mesh.setMatrixAt(i, mOut);
}

export function syncPedInstances(inst, list, playerPos, dt) {
  if (!inst || !list) return;
  const n = Math.min(list.length, MAX_PEDS);
  inst.body.count = n;
  inst.legs.count = n;
  inst.arms.count = n;

  const px = playerPos ? playerPos.x : 0;
  const pz = playerPos ? playerPos.z : 0;

  for (let i = 0; i < n; i++) {
    const ped = list[i];
    const pos = pedPos(ped);
    const x = pos.x;
    const z = pos.z;
    const y0 = pos.y || 0;
    const heading = ped.heading || 0;
    const spd = pedSpeed(ped, x, z, dt);
    const dist = Math.hypot(x - px, z - pz);
    const down = ped.mode === 'down' || ped.mode === 'dead';

    ensureColorIdx(ped);
    const col = pedTint(ped);
    inst.body.setColorAt(i, col);
    inst.legs.setColorAt(i, col);
    inst.arms.setColorAt(i, col);

    if (down) {
      const fallen = composeDown(x, y0 + DOWN_LIFT, z, heading);
      writeBase(inst.body, i, fallen);
      writeBase(inst.legs, i, fallen);
      writeBase(inst.arms, i, fallen);
      continue;
    }

    let swing = 0;
    if (dist <= LOD_DIST && spd >= 0.2) {
      ped._animPhase = (ped._animPhase || 0) + dt * 6;
      swing = Math.sin(ped._animPhase) * SWING;
    }

    const base = composeBase(x, y0, z, heading);
    writeBase(inst.body, i, base);
    writeSwing(inst.legs, i, base, HIP_Y, swing);
    writeSwing(inst.arms, i, base, SHOULDER_Y, -swing);
  }

  inst.body.instanceMatrix.needsUpdate = true;
  inst.legs.instanceMatrix.needsUpdate = true;
  inst.arms.instanceMatrix.needsUpdate = true;
  if (inst.body.instanceColor) inst.body.instanceColor.needsUpdate = true;
  if (inst.legs.instanceColor) inst.legs.instanceColor.needsUpdate = true;
  if (inst.arms.instanceColor) inst.arms.instanceColor.needsUpdate = true;
}
