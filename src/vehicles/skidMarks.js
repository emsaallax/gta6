// ФАЙЛЫ: src/vehicles/skidMarks.js
// Следы шин: один InstancedMesh-пул (200) под задними колёсами машин в заносе и торможении.
import * as THREE from 'three';

export const SKID_MAX = 200;
const LIFE = 25, FADE = 5, STEP = 0.12, RANGE2 = 45 * 45, REAR = 1.3, SIDE = 0.8, Y = 0.02;
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _zero = { x: 0, z: 0 };

/** InstancedMesh на 200 пятен, все скрыты (scale 0). Вернуть { mesh, life, info, ring, acc }; в сцену не добавляет. */
export function createSkidMarks() {
  const geo = new THREE.PlaneGeometry(0.22, 0.6).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, SKID_MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  const skid = { mesh, life: new Float32Array(SKID_MAX), info: new Float32Array(SKID_MAX * 3), ring: 0, acc: 0 };
  for (let i = 0; i < SKID_MAX; i++) put(skid, i, 0, false);
  mesh.instanceMatrix.needsUpdate = true;
  return skid;
}

/** Кадр: затухание (масштаб x к 0 в последние 5 с) и каждые 0.12 с новые пятна под задними колёсами. */
export function updateSkidMarks(skid, engine, dt) {
  if (!skid || !skid.mesh) return;
  const st = engine && engine.state, t = dt > 0 ? dt : 0, life = skid.life;
  skid.mesh.material.opacity = readWet(st) > 0.5 ? 0.3 : 0.55;
  let dirty = false;
  for (let i = 0; i < SKID_MAX; i++) {
    if (!(life[i] > 0)) continue;
    const left = Math.max(0, life[i] - t);
    life[i] = left;
    if (left < FADE) { put(skid, i, left / FADE, left > 0); dirty = true; }
  }
  skid.acc += t;
  if (skid.acc >= STEP) {
    skid.acc = skid.acc > 2 * STEP ? 0 : skid.acc - STEP;
    if (stamp(skid, st)) dirty = true;
  }
  if (dirty) skid.mesh.instanceMatrix.needsUpdate = true;
}

// Матрица экземпляра: x-масштаб sx у живого пятна, полный ноль у скрытого.
function put(skid, i, sx, live) {
  const i3 = i * 3, info = skid.info, k = live ? 1 : 0;
  _p.set(info[i3], Y, info[i3 + 1]);
  _q.setFromAxisAngle(AXIS_Y, info[i3 + 2]);
  _s.set(sx * k, k, k);
  skid.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

// Два пятна под задними колёсами машин в радиусе 45 м от игрока, если занос (_slip > 0.2)
// или ручник/тормоз на скорости больше 4 м/с.
function stamp(skid, st) {
  const vs = st && st.vehicles;
  if (!vs) return false;
  const pl = (st.player && st.player.position) || (st.cameraTarget && st.cameraTarget.position) || _zero;
  let any = false;
  for (let k = 0; k < vs.length; k++) {
    const v = vs[k];
    if (!v || !v.position) continue;
    const dx = v.position.x - pl.x, dz = v.position.z - pl.z;
    if (dx * dx + dz * dz > RANGE2) continue;
    const hb = v.handbrake || (v.controls && v.controls.handbrake);
    if (!(v._slip > 0.2 || (Math.abs(v.speed) > 4 && (hb || v.braking)))) continue;
    rearMark(skid, v, -1);
    rearMark(skid, v, 1);
    any = true;
  }
  return any;
}

// Пятно под задним колесом: side -1 или 1 (борт), 1.3 м назад от heading, кольцевой индекс.
function rearMark(skid, v, side) {
  const h = Number.isFinite(v.heading) ? v.heading : 0;
  const sh = Math.sin(h), ch = Math.cos(h);
  const i = skid.ring;
  skid.ring = (i + 1) % SKID_MAX;
  skid.info[i * 3] = v.position.x - sh * REAR + ch * SIDE * side;
  skid.info[i * 3 + 1] = v.position.z - ch * REAR - sh * SIDE * side;
  skid.info[i * 3 + 2] = h;
  skid.life[i] = LIFE;
  put(skid, i, 1, true);
}

function readWet(st) { const n = Number(st && st.weather && st.weather.wet); return Number.isFinite(n) ? n : 0; }
