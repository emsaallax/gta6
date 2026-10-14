// ФАЙЛЫ: src/vehicles/wheelSpray.js
// Брызги из-под колёс: один InstancedMesh-пул на все ближние машины.
import * as THREE from 'three';

export const SPRAY_MAX = 96;
export const SPRAY_NEAR = 35;
export const SPRAY_WET = 0.5;
export const SPRAY_SPEED = 3;

const DROP_LIFE = 0.35;
const REAR = 1.2;
const SIDE = 0.6;
const DROP_Y = 0.12;
const FLY_BACK = 4;
const FLY_DOWN = 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

function readWet(state) {
  const w = state && state.weather;
  if (!w || w.wet == null) return 0;
  const n = Number(w.wet);
  return Number.isFinite(n) ? n : 0;
}

function playerXZ(engine) {
  const st = engine && engine.state;
  const p = st && st.player;
  const pos = (p && p.position)
    || (st && st.cameraTarget && st.cameraTarget.position);
  return { x: pos && pos.x != null ? pos.x : 0, z: pos && pos.z != null ? pos.z : 0 };
}

function ensureScratch(pool) {
  if (!pool.pos || pool.pos.length !== SPRAY_MAX * 3) {
    pool.pos = new Float32Array(SPRAY_MAX * 3);
  }
  if (!pool.vel || pool.vel.length !== SPRAY_MAX * 3) {
    pool.vel = new Float32Array(SPRAY_MAX * 3);
  }
}

function findFree(life) {
  for (let i = 0; i < SPRAY_MAX; i++) {
    if (!(life[i] > 0)) return i;
  }
  return -1;
}

function spawnDrop(pool, x, y, z, heading) {
  const i = findFree(pool.life);
  if (i < 0) return;
  const i3 = i * 3;
  pool.life[i] = DROP_LIFE;
  pool.pos[i3] = x;
  pool.pos[i3 + 1] = y;
  pool.pos[i3 + 2] = z;
  const sh = Math.sin(heading);
  const ch = Math.cos(heading);
  pool.vel[i3] = -sh * FLY_BACK;
  pool.vel[i3 + 1] = -FLY_DOWN;
  pool.vel[i3 + 2] = -ch * FLY_BACK;
}

function writeLiving(pool, dt) {
  const life = pool.life;
  const pos = pool.pos;
  const vel = pool.vel;
  const mesh = pool.mesh;
  let count = 0;
  const t = dt > 0 ? dt : 0;
  for (let i = 0; i < SPRAY_MAX; i++) {
    if (!(life[i] > 0)) continue;
    life[i] -= t;
    if (!(life[i] > 0)) {
      life[i] = 0;
      continue;
    }
    const i3 = i * 3;
    pos[i3] += vel[i3] * t;
    pos[i3 + 1] += vel[i3 + 1] * t;
    pos[i3 + 2] += vel[i3 + 2] * t;
    _p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
    _q.identity();
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(count, _m);
    count++;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * InstancedMesh: BoxGeometry 0.12×0.08×0.18, MeshBasicMaterial
 * цвет #c8d4dc, transparent, opacity 0.45, depthWrite=false, frustumCulled=false.
 * Без PointLight. Вернуть { mesh, max: SPRAY_MAX, life: Float32Array(SPRAY_MAX) }.
 * В сцену сам не добавляет. life заполнить 0.
 */
export function createWheelSpray() {
  const geo = new THREE.BoxGeometry(0.12, 0.08, 0.18);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc8d4dc,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, SPRAY_MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const life = new Float32Array(SPRAY_MAX);
  return {
    mesh,
    max: SPRAY_MAX,
    life,
    pos: new Float32Array(SPRAY_MAX * 3),
    vel: new Float32Array(SPRAY_MAX * 3),
  };
}

/**
 * wet = Number(state.weather && state.weather.wet); нет → 0.
 * wet ≤ 0.5 или нет vehicles: погасить живые (life-=dt), count по живым, return.
 * Игрок: player.position или cameraTarget.position.
 * Машины dist < SPRAY_NEAR и abs(speed) > SPRAY_SPEED: каждый кадр
 * спавнить до 2 капель у задней оси (heading, −1.2 м по ходу, ±0.6 м вбок, y=0.12).
 * Свободный слот: life=0. Свободных нет — пропуск.
 * Капля: life 0.35 с, летит назад-вниз (против heading * 4 + y−2).
 * instanceMatrix каждый кадр; mesh.count = число с life>0.
 * Не бросать, если нет weather/vehicles.
 */
export function updateWheelSpray(pool, engine, dt) {
  if (!pool || !pool.mesh || !pool.life) return;
  try {
    ensureScratch(pool);
    const state = engine && engine.state;
    const wet = readWet(state);
    const vehicles = state && state.vehicles;
    const canSpawn = wet > SPRAY_WET && Array.isArray(vehicles) && vehicles.length > 0;
    if (canSpawn) {
      const pl = playerXZ(engine);
      const near2 = SPRAY_NEAR * SPRAY_NEAR;
      for (let v = 0; v < vehicles.length; v++) {
        const car = vehicles[v];
        if (!car) continue;
        const pos = car.position;
        if (!pos) continue;
        const dx = (pos.x || 0) - pl.x;
        const dz = (pos.z || 0) - pl.z;
        if (dx * dx + dz * dz >= near2) continue;
        const speed = Number(car.speed);
        if (!(Math.abs(Number.isFinite(speed) ? speed : 0) > SPRAY_SPEED)) continue;
        const heading = Number.isFinite(car.heading) ? car.heading : 0;
        const sh = Math.sin(heading);
        const ch = Math.cos(heading);
        const rx = (pos.x || 0) - sh * REAR;
        const rz = (pos.z || 0) - ch * REAR;
        const sx = ch * SIDE;
        const sz = -sh * SIDE;
        spawnDrop(pool, rx + sx, DROP_Y, rz + sz, heading);
        spawnDrop(pool, rx - sx, DROP_Y, rz - sz, heading);
      }
    }
    writeLiving(pool, dt);
  } catch (_e) {
    // нет weather/vehicles — молча
  }
}
