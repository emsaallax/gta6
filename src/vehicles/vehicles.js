// ГРУППА 4. Машины: список, vehicleApi, езда игрока/полиции, камера, LOD, фары.
import { createCarMesh, setCarDetail } from './carMesh.js';
import { stepDrive, spinWheels } from './driveSim.js';
import { makeVehicle, addCarBody, removeCarBody } from './vehicleRecord.js';
import { bindEnterExit } from './enterExit.js';
import { readDriveInput, vehicleCameraTarget } from './occupant.js';
import { bindVehicleDamage, applyCrashDamage } from './damageSmoke.js';
import { updateSuspension, kickSuspension } from './suspension.js';
import { applyDent, resetDents } from './dents.js';
import { syncDamage, crashParts } from './damageParts.js';
import { createSkidMarks, updateSkidMarks } from './skidMarks.js';
import { bindScrapeSparks, updateScrapeSparks } from './scrapeSparks.js';
import { updateWreckFx } from './wreckFx.js';
import { paintKenneyCar } from './kenneyPaint.js';
import { applyCarFeel } from './carFeel.js';
import { loadKenneyCar } from './kenneyModel.js';
import { collectKenneyWheels, spinKenneyWheels } from './kenneyWheels.js';
import { attachKenneyMesh, applyKenneyLod, updateCompactLights } from './kenneyAttach.js';
import { applyCarHeading } from './carHeading.js';
import { createHeadlightCones, updateHeadlightCones } from './headlightCones.js';
import { bindVehicleAudio, updateVehicleAudio } from './vehicleAudio.js';
import { wetDriveMul, applyWetSlip, applyWetMaterials, alignNoseToVelocity } from './wetGrip.js';
import { createWheelSpray, updateWheelSpray } from './wheelSpray.js';

const EMPTY_CONTROLS = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const LOD_NEAR = 60;
const LOD_NEAR_LOW = 45;

function playerXZ(engine) {
  const p = engine.state && engine.state.player;
  const pos = (p && p.position) || (p && p.object3d && p.object3d.position)
    || (engine.state.cameraTarget && engine.state.cameraTarget.position);
  return { x: pos && pos.x != null ? pos.x : 0, z: pos && pos.z != null ? pos.z : 0 };
}

function withWetBrake(controls, weather) {
  const raw = controls || EMPTY_CONTROLS;
  const { brakeMul } = wetDriveMul(weather);
  if (brakeMul === 1) return raw;
  return {
    throttle: raw.throttle,
    brake: (Number(raw.brake) || 0) * brakeMul,
    steer: raw.steer,
    handbrake: raw.handbrake,
  };
}

// crash даёт тела или vehicle: приводим к vehicle через body.ref
function carOf(x) {
  if (!x) return null;
  const r = x.ref || x;
  return r && r.object3d && r.type != null && r.radius != null ? r : null;
}

// удар по машине: подвеска, вмятина, отлёт деталей
function onCarHit(engine, v, impulse, point) {
  if (!v) return;
  kickSuspension(v, impulse);
  if (point) applyDent(v, point, impulse);
  syncDamage(v);
  crashParts(engine, v, impulse, point);
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
  resetDents(vehicle);
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
    bindVehicleAudio(e);
    bindScrapeSparks(e);
    this._skid = createSkidMarks();
    if (e.scene && this._skid && this._skid.mesh) e.scene.add(this._skid.mesh);
    e.on('crash', (ev) => {
      const imp = Number(ev && ev.impulse) || 0;
      onCarHit(e, carOf(ev.a), imp, ev.point);
      onCarHit(e, carOf(ev.b), imp, ev.point);
    });
    this._cones = createHeadlightCones();
    if (e.scene && this._cones && this._cones.mesh) e.scene.add(this._cones.mesh);
    this._spray = createWheelSpray();
    if (e.scene && this._spray && this._spray.mesh) e.scene.add(this._spray.mesh);
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
    const weather = e.state.weather;

    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const ctrl = v.controller;
      if (ctrl === 'player' || ctrl === 'police') {
        const raw = v._exploded ? EMPTY_CONTROLS : ctrl === 'player'
          ? readDriveInput(e.input)
          : (v.controls || EMPTY_CONTROLS);
        const controls = withWetBrake(raw, weather);
        const hit = stepDrive(v, controls, t, e.physics);
        if (hit && hit.hitWall && hit.impact > 1) applyCrashDamage(v, hit.impact);
        v._scrape = hit && hit.hitWall ? 1 : 0;
        // занос: ручник на ходу или резкий руль на скорости (driveSim _slip не пишет)
        const sp = Math.abs(v.speed) || 0;
        v._slip = controls.handbrake && sp > 4 ? 1
          : Math.min(1, Math.abs(Number(v.steer) || 0) * sp / 8 * (sp > 10 ? 1 : 0));
        if (hit && hit.hitWall && hit.impact > 6 && !(v._wallCd > 0)) {
          v._wallCd = 0.5;
          const h = Number(v.heading) || 0;
          onCarHit(e, v, hit.impact, { x: v.position.x + Math.sin(h) * 1.3, y: 0.6, z: v.position.z + Math.cos(h) * 1.3 });
        }
        applyCarFeel(v, controls, t);
        applyWetSlip(v, t, weather, controls);
        if (v._kenney) {
          if (!v.wheels || !v.wheels.fl) v.wheels = collectKenneyWheels(v.object3d);
          spinKenneyWheels(v.wheels, v, t);
        } else {
          spinWheels(v, t);
        }
      }
      applyWetMaterials(v, weather);
      if (v.object3d && Number.isFinite(v.heading)) applyCarHeading(v.object3d, v.heading);
      alignNoseToVelocity(v, t);
      updateSuspension(v, t);
      v._hitCd = Math.max(0, (v._hitCd || 0) - t);
      v._wallCd = Math.max(0, (v._wallCd || 0) - t);
      syncDamage(v);
      updateWreckFx(e, v, t);
      updateCompactLights(v, e);
      applyKenneyLod(v, e);
      if (v._model) {
        const p = v.position;
        const d2 = p ? (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz) : 0;
        const low = v !== driven && d2 > lodDist2;
        setCarDetail(v._model, low);
      }
    }

    updateHeadlightCones(this._cones, e);
    updateWheelSpray(this._spray, e, t);
    updateVehicleAudio(e, t);
    updateSkidMarks(this._skid, e, t);
    updateScrapeSparks(e, t);

    if (driven) {
      e.state.cameraTarget = vehicleCameraTarget(driven, e.state.cameraTarget);
    }
  }
}
