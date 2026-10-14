// Г4-05: дым из-под капота при damage > 0.6, взрыв при damage 1, обгоревший остов.
// updateWreckFx вызывается каждый кадр для каждой машины (после syncDamage).
import * as THREE from 'three';

const FLASH_T = 0.6; // с, за сколько гаснет вспышка
const FLASH_I = 6; // сила света вспышки
const _nose = new THREE.Vector3();
const _center = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _smokeOpts = { pos: _nose, dir: _up, count: 1, color: 0x555555 };
let flashLight = null; // один общий свет модуля, создаётся при первом взрыве
let flashOwner = null; // машина, чья вспышка сейчас идёт
let flashT = 0; // остаток вспышки, уменьшается в кадре владельца

export function updateWreckFx(engine, vehicle, dt) {
  const fx = engine && engine.state ? engine.state.fx : null;
  if (!fx || !vehicle || !vehicle.position) return;
  const step = dt > 0 ? dt : 0;
  const d = Number(vehicle.damage) || 0;
  tickFlash(vehicle, step);
  if (d > 0.6) smokeTick(fx, vehicle, d, step);
  if (d >= 1 && !vehicle._exploded) explode(engine, fx, vehicle);
}

// дым из носа раз в max(0.05, 0.25*(1.1-d)) с
function smokeTick(fx, vehicle, d, step) {
  const every = Math.max(0.05, 0.25 * (1.1 - d));
  const t = (vehicle._smokeT || 0) + step;
  if (t < every) {
    vehicle._smokeT = t;
    return;
  }
  vehicle._smokeT = 0;
  const p = vehicle.position;
  const h = Number(vehicle.heading) || 0;
  _nose.set(p.x + Math.sin(h) * 1.3, 1.0, p.z + Math.cos(h) * 1.3);
  _smokeOpts.color = d > 0.9 ? 0x111111 : 0x555555;
  fx.spawn('smoke', _smokeOpts);
}

// однократный взрыв: частицы, звук, вспышка, почернение
function explode(engine, fx, vehicle) {
  vehicle._exploded = true;
  const p = vehicle.position;
  _center.set(p.x, p.y + 1, p.z);
  fx.spawn('debris', { pos: _center, dir: _up, count: 12, color: 0x222222 });
  fx.spawn('sparks', { pos: _center, dir: _up, count: 30, color: 0xffaa33 });
  fx.spawn('smoke', { pos: _center, dir: _up, count: 10, color: 0x111111 });
  const audio = engine.state.audio;
  if (audio && typeof audio.play === 'function') {
    try {
      audio.play('hit', { pos: p, volume: 1, rate: 0.4 });
    } catch (_) {}
  }
  if (!flashLight) flashLight = new THREE.PointLight(0xff8833, FLASH_I, 18);
  if (engine.scene && !flashLight.parent) engine.scene.add(flashLight);
  flashOwner = vehicle;
  flashT = FLASH_T;
  flashLight.position.set(p.x, p.y + 3, p.z);
  flashLight.intensity = FLASH_I;
  blackenWreck(vehicle);
}

// вспышка тикает по dt только в кадре своей машины: один раз за кадр
function tickFlash(vehicle, step) {
  if (!flashOwner) return;
  if (flashOwner !== vehicle) {
    // владелец убран из сцены (despawn): гасим, чтобы свет не завис
    const o = flashOwner.object3d;
    if (!o || !o.parent) endFlash();
    return;
  }
  flashT -= step;
  if (flashT <= 0) {
    endFlash();
    return;
  }
  const p = vehicle.position;
  flashLight.position.set(p.x, p.y + 3, p.z);
  flashLight.intensity = (FLASH_I * flashT) / FLASH_T;
}

function endFlash() {
  flashOwner = null;
  flashT = 0;
  if (flashLight) flashLight.intensity = 0;
}

function darkCopy(m) {
  if (!m || typeof m.clone !== 'function') return m;
  const c = m.clone();
  if (c.color && typeof c.color.multiplyScalar === 'function') c.color.multiplyScalar(0.15);
  return c;
}

// почернение кузова: клон материала один раз, огни выключены, управление обнулено
function blackenWreck(vehicle) {
  const root = vehicle.object3d;
  if (root && typeof root.traverse === 'function') {
    root.traverse((n) => {
      if (!n.isMesh || n.name !== 'body' || !n.material) return;
      if (!vehicle._wreckMat) {
        vehicle._wreckMat = Array.isArray(n.material) ? n.material.map(darkCopy) : darkCopy(n.material);
      }
      n.material = vehicle._wreckMat;
    });
  }
  vehicle.siren = false;
  const c = vehicle.controls;
  if (c) {
    c.throttle = 0;
    c.brake = 0;
    c.steer = 0;
    c.handbrake = 0;
  }
}
