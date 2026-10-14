// Счётчик розыска: heat → level, преступления, спад.
import { Visibility } from './visibility.js';
import { crashHeat } from '../mission/escape.js';
const HEAT_FLOOR = [0, 15, 35, 60, 80, 100];
const NEAR_M = 60;
const COOLDOWN_BEFORE_DECAY = 25;
const DECAY_EVERY = 10;
const UNSEEN_DECAY_AFTER = 10;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function levelFromHeat(heat) {
  if (heat === 100) return 5;
  if (heat >= 80) return 4;
  if (heat >= 60) return 3;
  if (heat >= 35) return 2;
  if (heat >= 15) return 1;
  return 0;
}

function playerXZ(state) {
  const pos = state.player && state.player.position;
  if (!pos) return null;
  return { x: pos.x, z: pos.z };
}

function distXZ(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function policeNearby(state, px, pz) {
  const npcs = state.npcs && state.npcs.list;
  if (npcs) {
    for (let i = 0; i < npcs.length; i++) {
      const ped = npcs[i];
      if (!ped || ped.kind !== 'cop') continue;
      const p = ped.position;
      if (p && distXZ(p.x, p.z, px, pz) < NEAR_M) return true;
    }
  }
  const vehicles = state.vehicles;
  if (vehicles) {
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v) continue;
      if (v.type !== 'police' && v.controller !== 'police') continue;
      const p = v.position;
      if (p && distXZ(p.x, p.z, px, pz) < NEAR_M) return true;
    }
  }
  return false;
}

export class Wanted {
  init(engine) {
    this._decayWait = 0;
    this._unseenActive = false;
    this._vis = new Visibility();
    this._cops = [];
    engine.state.wanted = {
      level: 0,
      heat: 0,
      lastSeen: null,
      cooldown: 0,
      search: { center: null, radius: 0 },
    };

    engine.on('crash', (data) => {
      const h = crashHeat(data);
      if (h > 0) this._crime(engine, h);
    });

    engine.on('shot', (data) => {
      if (!data || data.by !== 'player') return;
      this._crime(engine, 10);
    });

    engine.on('pedHurt', (data) => {
      if (!data || data.attacker !== 'player') return;
      const add = data.ped && data.ped.kind === 'cop' ? 40 : 15;
      this._crime(engine, add);
    });

    engine.on('pedKilled', (data) => {
      if (!data || data.attacker !== 'player') return;
      this._crime(engine, 35);
    });

    engine.on('carjack', (data) => {
      const add = data && data.wasPolice === true ? 50 : 20;
      this._crime(engine, add);
    });
  }

  _crime(engine, add) {
    const w = engine.state.wanted;
    w.heat = clamp(w.heat + add, 0, 100);
    w.level = levelFromHeat(w.heat);
    w.cooldown = 0;
    this._decayWait = 0;
    const p = playerXZ(engine.state);
    if (p) w.lastSeen = { x: p.x, z: p.z };
  }

  _collectCops(state) {
    const out = this._cops;
    out.length = 0;
    const npcs = state.npcs && state.npcs.list;
    if (npcs) {
      for (let i = 0; i < npcs.length; i++) {
        const ped = npcs[i];
        if (ped && ped.kind === 'cop' && ped.position) out.push(ped.position);
      }
    }
    const vehicles = state.vehicles;
    if (vehicles) {
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        if (v && v.position && (v.type === 'police' || v.controller === 'police')) out.push(v.position);
      }
    }
    return out;
  }

  update(dt, engine) {
    if (engine.state.paused === true) return;
    const w = engine.state.wanted;
    if (!w) return;

    w.cooldown += dt;
    w.heat = clamp(w.heat, 0, 100);
    w.level = levelFromHeat(w.heat);

    const p = playerXZ(engine.state);
    const near = p ? policeNearby(engine.state, p.x, p.z) : false;

    let unseenLong = false;
    const search = w.search || (w.search = { center: null, radius: 0 });
    if (w.level === 0 || !p) {
      if (this._vis.unseenTime !== 0 || this._vis.hasLastSeen) this._vis = new Visibility();
      this._unseenActive = false;
      search.center = null;
      search.radius = 0;
    } else {
      const cops = this._collectCops(engine.state);
      const r = this._vis.update(dt, p, cops);
      if (r.seen) this._unseenActive = false;
      else if (r.unseenTime >= UNSEEN_DECAY_AFTER) {
        unseenLong = true;
        if (!this._unseenActive) {
          this._unseenActive = true;
          this._decayWait = DECAY_EVERY; // первая звезда падает сразу на 10 с
        }
      }
      if (r.searchCenter) {
        if (!search.center) search.center = { x: 0, z: 0 };
        search.center.x = r.searchCenter.x;
        search.center.z = r.searchCenter.z;
        search.radius = r.searchRadius;
      } else {
        search.center = null;
        search.radius = 0;
      }
    }

    if ((w.cooldown >= COOLDOWN_BEFORE_DECAY && !near) || unseenLong) {
      this._decayWait += dt;
      if (this._decayWait >= DECAY_EVERY) {
        this._decayWait -= DECAY_EVERY;
        w.level = Math.max(0, w.level - 1);
        w.heat = HEAT_FLOOR[w.level];
        if (w.level === 0) w.lastSeen = null;
      }
    } else {
      this._decayWait = 0;
    }
  }
}
