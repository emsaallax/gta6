// ГРУППА 4. Машины: список, vehicleApi, езда игрока/полиции, камера, LOD, фары.
import { createCarMesh, setCarDetail } from './carMesh.js';
import { stepDrive, spinWheels } from './driveSim.js';
import { makeVehicle, addCarBody, removeCarBody } from './vehicleRecord.js';
import { bindEnterExit } from './enterExit.js';
import { readDriveInput, vehicleCameraTarget } from './occupant.js';
import { bindVehicleDamage, applyCrashDamage, updateVehicleSmoke } from './damageSmoke.js';
import { paintKenneyCar } from './kenneyPaint.js';
import { applyCarFeel } from './carFeel.js';
import { loadKenneyCar } from './kenneyModel.js';
import { collectKenneyWheels, spinKenneyWheels } from './kenneyWheels.js';
import { attachKenneyMesh, applyKenneyLod, updateCompactLights, applyCarHeading } from './kenneyAttach.js';

const EMPTY_CONTROLS = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const LOD_NEAR = 60;
const LOD_NEAR_LOW = 45;

function playerXZ(engine) {
  const p = engine.state && engine.state.player;
  const pos = (p && p.position) || (p && p.object3d && p.object3d.position)
    || (engine.state.cameraTarget && engine.state.cameraTarget.position);
  return { x: pos && pos.x != null ? pos.x : 0, z: pos && pos.z != null ? pos.z : 0 };
}

function bumpKenneyGen(vehicle) {
  vehicle._kenneyGen = (vehicle._kenneyGen || 0) + 1;
}

function tryAttachKenney(engine, vehicle) {
  const gen = vehicle._kenneyGen || 0;
  Promise.resolve(loadKenneyCar(engine, vehicle.type)).then((loaded) => {
    if (!loaded) return;
    if ((vehicle._kenneyGen || 0) !== gen) return;
    if (!attachKenneyMesh(engine, vehicle, loaded)) return;
    const list = engine.state.vehicles;
    const seed = Array.isArray(list) ? list.indexOf(vehicle) : 0;
    paintKenneyCar(vehicle.object3d, vehicle.type, seed < 0 ? 0 : seed);
  }).catch(() => {});
}

function spawnVehicle(engine, type, x, z, heading, controller) {
  const model = createCarMesh(type);
  const vehicle = makeVehicle({
    object3d: model.object3d,
    type,
    x,
    z,
    heading,
    controller,
  });
  vehicle.wheels = model.wheels;
  vehicle._model = model;
  vehicle._kenneyGen = 0;
  const list = Array.isArray(engine.state.vehicles) ? engine.state.vehicles : [];
  const seed = list.length;
  paintKenneyCar(vehicle.object3d, vehicle.type, seed);
  addCarBody(engine.physics, vehicle);
  if (engine.scene && vehicle.object3d) engine.scene.add(vehicle.object3d);
  if (!Array.isArray(engine.state.vehicles)) engine.state.vehicles = [];
  engine.state.vehicles.push(vehicle);
  tryAttachKenney(engine, vehicle);
  return vehicle;
}

function despawnVehicle(engine, vehicle) {
  if (!vehicle) return;
  const player = engine.state && engine.state.player;
  if (player && player.inVehicle === vehicle) return;
  bumpKenneyGen(vehicle);
  removeCarBody(engine.physics, vehicle);
  if (engine.scene && vehicle.object3d) engine.scene.remove(vehicle.object3d);
  const list = engine.state.vehicles;
  if (Array.isArray(list)) {
    const i = list.indexOf(vehicle);
    if (i >= 0) list.splice(i, 1);
  }
}

function seedParkedNearSpawn(engine) {
  const spawn = (engine.state.city && engine.state.city.spawn) || { x: 0, z: 0 };
  const spots = [
    ['sedan', 6, 3, 0],
    ['taxi', 6, -3, 0],
  ];
  for (const [type, dx, dz, h] of spots) {
    spawnVehicle(engine, type, spawn.x + dx, spawn.z + dz, h, null);
  }
}

export class Vehicles {
  init(e) {
    if (!Array.isArray(e.state.vehicles)) e.state.vehicles = [];
    bindEnterExit(e);
    bindVehicleDamage(e);
    e.state.vehicleApi = {
      spawn: (type, x, z, heading, controller) => spawnVehicle(e, type, x, z, heading, controller),
      despawn: (vehicle) => despawnVehicle(e, vehicle),
    };
    seedParkedNearSpawn(e);
  }

  update(dt, e) {
    const list = e.state.vehicles;
    if (!Array.isArray(list)) return;
    const t = dt > 0 ? dt : 0;
    const player = e.state.player;
    const driven = player && player.inVehicle;
    const { x: px, z: pz } = playerXZ(e);
    const q = e.state.settings && e.state.settings.quality;
    const lodDist = q === 'low' ? LOD_NEAR_LOW : LOD_NEAR;
    const lodDist2 = lodDist * lodDist;

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const ctrl = v.controller;
      if (ctrl === 'player' || ctrl === 'police') {
        const controls = ctrl === 'player'
          ? readDriveInput(e.input)
          : (v.controls || EMPTY_CONTROLS);
        const hit = stepDrive(v, controls, t, e.physics);
        if (hit && hit.hitWall && hit.impact > 1) applyCrashDamage(v, hit.impact);
        applyCarFeel(v, controls, t);
        if (v._kenney) {
          if (!v.wheels || !v.wheels.fl) v.wheels = collectKenneyWheels(v.object3d);
          spinKenneyWheels(v.wheels, v, t);
        } else {
          spinWheels(v, t);
        }
      }
      if (v.object3d && Number.isFinite(v.heading)) applyCarHeading(v.object3d, v.heading);
      updateVehicleSmoke(v, t);
      updateCompactLights(v, e);
      applyKenneyLod(v, e);
      if (v._model) {
        const p = v.position;
        const d2 = p ? (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz) : 0;
        const low = v !== driven && d2 > lodDist2;
        setCarDetail(v._model, low);
      }
    }

    if (driven) {
      e.state.cameraTarget = vehicleCameraTarget(driven, e.state.cameraTarget);
    }
  }
}
