// 3-04. Вход и выход из машины по F. Поле driver не трогаем — это группа 4.
import * as THREE from 'three';

export const ENTER_DIST = 3;

const _doorLocal = new THREE.Vector3();

export function nearestVehicle(vehicles, x, z, maxDist) {
  if (!vehicles || vehicles.length === 0) return null;
  let best = null;
  let bestD = maxDist;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const px = v.position ? v.position.x : v.object3d && v.object3d.position.x;
    const pz = v.position ? v.position.z : v.object3d && v.object3d.position.z;
    if (px == null || pz == null) continue;
    const d = Math.hypot(px - x, pz - z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function doorWorld(vehicle, localX) {
  // После syncPose матрица мира может быть со прошлого кадра.
  if (vehicle.object3d.updateMatrixWorld) {
    vehicle.object3d.updateMatrixWorld(true);
  }
  _doorLocal.set(localX, 0, 0);
  vehicle.object3d.localToWorld(_doorLocal);
  return { x: _doorLocal.x, z: _doorLocal.z };
}

function placeByDoor(engine, vehicle, localX) {
  const p = doorWorld(vehicle, localX);
  const r = engine.physics.resolveCircle(p.x, p.z, 0.4);
  return { x: r.x, z: r.z, shift: Math.hypot(r.x - p.x, r.z - p.z) };
}

export function handleVehicleInteract(engine) {
  if (!engine.input.pressed('KeyF')) return;
  const player = engine.state.player;
  if (!player || !player.object3d) return;

  if (player.inVehicle) {
    const vehicle = player.inVehicle;
    if (Math.abs(vehicle.speed) > 3) return;

    engine.emit('exitVehicle', vehicle);
    player.inVehicle = null;
    player.object3d.visible = true;

    let placed = placeByDoor(engine, vehicle, 1.5);
    if (placed.shift > 0.8) {
      placed = placeByDoor(engine, vehicle, -1.5);
    }
    player.object3d.position.x = placed.x;
    player.object3d.position.z = placed.z;
    player.object3d.position.y = 0;
    return;
  }

  const v = nearestVehicle(
    engine.state.vehicles,
    player.object3d.position.x,
    player.object3d.position.z,
    ENTER_DIST
  );
  if (v) {
    engine.emit('enterVehicle', v);
    player.inVehicle = v;
    player.object3d.visible = false;
  }
}
