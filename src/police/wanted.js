// Счётчик розыска: heat → level, преступления, спад.
const HEAT_FLOOR = [0, 15, 35, 60, 80, 100];
const NEAR_M = 60;
const COOLDOWN_BEFORE_DECAY = 25;
const DECAY_EVERY = 10;

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
    engine.state.wanted = {
      level: 0,
      heat: 0,
      lastSeen: null,
      cooldown: 0,
    };

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

  update(dt, engine) {
    if (engine.state.paused === true) return;
    const w = engine.state.wanted;
    if (!w) return;

    w.cooldown += dt;
    w.heat = clamp(w.heat, 0, 100);
    w.level = levelFromHeat(w.heat);

    const p = playerXZ(engine.state);
    const near = p ? policeNearby(engine.state, p.x, p.z) : false;
    if (w.cooldown >= COOLDOWN_BEFORE_DECAY && !near) {
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
