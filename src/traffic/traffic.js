// ГРУППА 4. Трафик: 20–40 машин по полосам, 1 спавн за кадр, деспавн за 170 м.
import { stepTrafficVehicle } from './laneFollow.js';
import { spinWheels } from '../vehicles/driveSim.js';
import { collectKenneyWheels, spinKenneyWheels } from '../vehicles/kenneyWheels.js';
import { applyCarHeading } from '../vehicles/kenneyAttach.js';
import {
  TRAFFIC_MIN,
  TRAFFIC_MAX,
  countTraffic,
  collectTrafficDespawn,
  nextTrafficSpawn,
} from './trafficSpawn.js';

function playerPose(engine) {
  const p = engine.state && engine.state.player;
  const pos = (p && p.position)
    || (p && p.object3d && p.object3d.position)
    || (engine.state.cameraTarget && engine.state.cameraTarget.position);
  const x = pos && pos.x != null ? pos.x : 0;
  const z = pos && pos.z != null ? pos.z : 0;
  let heading;
  if (p && p.inVehicle && Number.isFinite(p.inVehicle.heading)) {
    heading = p.inVehicle.heading;
  } else {
    const f = engine.state.camera && engine.state.camera.forward;
    if (f && (f.x || f.z)) heading = Math.atan2(f.x, f.z);
    else if (engine.state.cameraTarget && Number.isFinite(engine.state.cameraTarget.heading)) {
      heading = engine.state.cameraTarget.heading;
    }
  }
  return { x, z, heading };
}

function wantCount(engine) {
  const q = engine.state.settings && engine.state.settings.quality;
  if (q === 'low') return TRAFFIC_MIN;
  if (q === 'medium') return 28;
  return TRAFFIC_MAX;
}

export class Traffic {
  init() {}

  update(dt, engine) {
    const api = engine.state && engine.state.vehicleApi;
    const list = engine.state && engine.state.vehicles;
    if (!api || !Array.isArray(list)) return;

    const { x, z, heading } = playerPose(engine);
    const playerCar = engine.state.player && engine.state.player.inVehicle;

    const gone = collectTrafficDespawn(list, x, z);
    for (let i = 0; i < gone.length; i++) {
      if (gone[i] === playerCar) continue;
      api.despawn(gone[i]);
    }

    const live = engine.state.vehicles;
    if (countTraffic(live) < wantCount(engine)) {
      const pose = nextTrafficSpawn(engine.state.city, x, z, live, heading);
      if (pose) {
        const v = api.spawn(pose.type, pose.x, pose.z, pose.heading, 'traffic');
        if (v) v.lane = pose.lane;
      }
    }

    const after = engine.state.vehicles;
    const t = dt > 0 ? dt : 0;
    for (let i = 0; i < after.length; i++) {
      const v = after[i];
      if (v.controller !== 'traffic') continue;
      stepTrafficVehicle(v, t, engine);
      if (v.object3d && Number.isFinite(v.heading)) applyCarHeading(v.object3d, v.heading);
      if (v._kenney) {
        if (!v.wheels || !v.wheels.fl) v.wheels = collectKenneyWheels(v.object3d);
        spinKenneyWheels(v.wheels, v, t);
      } else {
        spinWheels(v, t);
      }
    }
  }
}
