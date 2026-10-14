// ГРУППА 5 — полицейские машины (погоня через vehicle.controls).
// ФАЙЛЫ: src/police/units.js
import { planTactics } from './tactics.js';

const SPAWN_MIN = 70;
const SPAWN_MAX = 120;
const DESPAWN_DIST = 180;
const CLOSE_DIST = 12;
const FAR_THROTTLE_DIST = 40;

export class PoliceUnits {
  init(engine) {
    this.cars = [];
    this._plan = [];
    this._info = [];
    this._pinfo = { x: 0, z: 0, heading: 0, speed: 0 };
  }

  update(dt, engine) {
    if (!this.cars) this.cars = [];
    const state = engine.state || {};
    const wanted = state.wanted;
    const level = wanted && typeof wanted.level === 'number' ? wanted.level : 0;
    const player = state.player;
    const playerPos = player && player.position;
    const dead = !!(player && player.dead);
    const api = state.vehicleApi;
    const maxCars = Math.max(0, 2 * level);

    if (level === 0 || dead) {
      while (this.cars.length) this._despawnAt(api, this.cars.length - 1);
      return;
    }
    if (!playerPos) return;

    const px = playerPos.x;
    const pz = playerPos.z;

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const vehicle = this.cars[i];
      const pos = vehicle && vehicle.position;
      const dist = pos ? Math.hypot(pos.x - px, pos.z - pz) : DESPAWN_DIST + 1;
      if (dist > DESPAWN_DIST) {
        this._despawnAt(api, i);
        continue;
      }
    }
    this._driveAll(level, player, px, pz);
    while (this.cars.length > maxCars) {
      this._despawnAt(api, this.cars.length - 1);
    }

    if (!api || typeof api.spawn !== 'function') return;

    while (this.cars.length < maxCars) {
      const spawned = this._spawn(api, state, px, pz);
      if (!spawned) break;
      this.cars.push(spawned);
    }
  }

  _despawnAt(api, index) {
    const vehicle = this.cars[index];
    if (api && typeof api.despawn === 'function') {
      api.despawn(vehicle);
    }
    this.cars.splice(index, 1);
  }

  _spawn(api, state, px, pz) {
    const roads = state.city && state.city.roads;
    let x;
    let z;
    let heading = 0;

    const point = this._pickRoadSpawn(roads, px, pz);
    if (point) {
      x = point.x;
      z = point.z;
      heading = point.heading;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      x = px + Math.sin(ang) * dist;
      z = pz + Math.cos(ang) * dist;
      heading = 0;
    }

    const vehicle = api.spawn('police', x, z, heading, 'police');
    if (!vehicle) return null;
    vehicle.siren = true;
    vehicle.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    return vehicle;
  }

  _pickRoadSpawn(roads, px, pz) {
    if (!roads || !roads.length) return null;
    const candidates = [];
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      const sample = this._sampleOnRoad(road, px, pz);
      if (sample) candidates.push(sample);
    }
    if (!candidates.length) return null;
    return candidates[(Math.random() * candidates.length) | 0];
  }

  _sampleOnRoad(road, px, pz) {
    const dx = road.x2 - road.x1;
    const dz = road.z2 - road.z1;
    const len = Math.hypot(dx, dz);
    if (len < 1) return null;

    for (let k = 0; k < 8; k++) {
      const t = 0.08 + Math.random() * 0.84;
      const x = road.x1 + dx * t;
      const z = road.z1 + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (dist >= SPAWN_MIN && dist <= SPAWN_MAX) {
        return {
          x,
          z,
          heading: Math.atan2(road.x2 - road.x1, road.z2 - road.z1),
        };
      }
    }
    return null;
  }

  _driveAll(level, player, px, pz) {
    const cars = this.cars;
    const info = this._info;
    while (info.length < cars.length) info.push({ x: 0, z: 0, heading: 0, speed: 0 });
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const o = info[i];
      o.x = c.position ? c.position.x : 0;
      o.z = c.position ? c.position.z : 0;
      o.heading = c.heading || 0;
      o.speed = c.speed || 0;
    }
    info.length = cars.length;
    const pv = player && player.inVehicle;
    const pi = this._pinfo;
    pi.x = px;
    pi.z = pz;
    pi.heading = (pv && pv.heading) || 0;
    pi.speed = (pv && pv.speed) || 0;
    const plan = planTactics(level, pi, info);
    for (let i = 0; i < cars.length; i++) {
      const p = plan && plan[i];
      this._drive(cars[i], p ? p.target.x : px, p ? p.target.z : pz, p);
    }
  }

  _drive(vehicle, px, pz, tac) {
    const pos = vehicle.position;
    if (!pos) return;
    const dx = px - pos.x;
    const dz = pz - pos.z;
    const dist = Math.hypot(dx, dz);
    let delta = Math.atan2(dx, dz) - vehicle.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, delta * 1.5));

    let throttle;
    let brake;
    if (tac && tac.role === 'block') {
      throttle = tac.brake > 0 ? 0 : tac.throttle;
      brake = tac.brake > 0 ? 1 : 0;
    } else if (tac && tac.role !== 'chase') {
      throttle = tac.throttle;
      brake = tac.brake;
    } else if (dist < CLOSE_DIST) {
      throttle = 0;
      brake = vehicle.speed > 3 ? 1 : 0;
    } else {
      throttle = dist > FAR_THROTTLE_DIST ? 1 : 0.6;
      brake = 0;
    }
    const c = vehicle.controls || (vehicle.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false });
    c.throttle = throttle;
    c.brake = brake;
    c.steer = steer;
    c.handbrake = false;
    vehicle.siren = true;
  }
}
