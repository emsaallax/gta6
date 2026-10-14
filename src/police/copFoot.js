// Пешие копы: спаун на дороге, ход к игроку, стрельба.
const SPEED = 4;
const SPAWN_MIN = 70;
const SPAWN_MAX = 120;
const DESPAWN_M = 180;
const STOP_M = 5;
const SHOT_RANGE = 25;
const SHOT_CD = 0.8;
const SHOT_AMOUNT = 8;

function distXZ(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function wantedLevel(state) {
  const w = state.wanted;
  if (!w || w.level == null) return 0;
  return w.level;
}

function playerPos(state) {
  const player = state.player;
  if (!player || !player.position) return null;
  return player.position;
}

function pickOnRoad(roads, px, pz) {
  if (roads && roads.length) {
    for (let n = 0; n < 48; n++) {
      const road = roads[(Math.random() * roads.length) | 0];
      const t = Math.random();
      const x = road.x1 + (road.x2 - road.x1) * t;
      const z = road.z1 + (road.z2 - road.z1) * t;
      const d = distXZ(x, z, px, pz);
      if (d >= SPAWN_MIN && d <= SPAWN_MAX) return { x, z };
    }
  }
  const ang = Math.random() * Math.PI * 2;
  const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  return { x: px + Math.sin(ang) * r, z: pz + Math.cos(ang) * r };
}

function brain(ped, dt, engine) {
  const pos = playerPos(engine.state);
  if (!pos || !ped.position) return;
  const dx = pos.x - ped.position.x;
  const dz = pos.z - ped.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return;
  const nx = dx / len;
  const nz = dz / len;
  ped.heading = Math.atan2(nx, nz);
  // Пед-лайф группы 3 после мозга пишет body.vx из сдвига позиции.
  // Если двигать только body.vx, сдвиг нулевой — коп стоит на месте.
  if (len > STOP_M) {
    const step = Math.min(SPEED * (dt || 0), len - STOP_M);
    ped.position.x += nx * step;
    ped.position.z += nz * step;
  }
}

export class CopFoot {
  init(engine) {
    this.cops = [];
  }

  _despawnOne(engine, entry, index) {
    const npcs = engine.state.npcs;
    if (npcs && typeof npcs.despawn === 'function' && entry.ped) {
      npcs.despawn(entry.ped);
    }
    this.cops.splice(index, 1);
  }

  _despawnAll(engine) {
    const npcs = engine.state.npcs;
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const ped = this.cops[i].ped;
      if (npcs && typeof npcs.despawn === 'function' && ped) npcs.despawn(ped);
    }
    this.cops.length = 0;
  }

  update(dt, engine) {
    const state = engine.state;
    const level = wantedLevel(state);
    const player = state.player;
    const dead = player && player.dead === true;

    if (level === 0 || dead) {
      this._despawnAll(engine);
      return;
    }

    const pos = playerPos(state);
    if (!pos) return;

    const limit = 2 * level;
    const npcs = state.npcs;

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const entry = this.cops[i];
      const ped = entry.ped;
      const p = ped && ped.position;
      if (!p || distXZ(p.x, p.z, pos.x, pos.z) > DESPAWN_M) {
        this._despawnOne(engine, entry, i);
      }
    }

    while (this.cops.length > limit) {
      this._despawnOne(engine, this.cops[this.cops.length - 1], this.cops.length - 1);
    }

    if (npcs && typeof npcs.spawn === 'function') {
      while (this.cops.length < limit) {
        const at = pickOnRoad(state.city && state.city.roads, pos.x, pos.z);
        const ped = npcs.spawn({ kind: 'cop', x: at.x, z: at.z, brain });
        if (!ped) break;
        this.cops.push({ ped, shootWait: 0 });
      }
    }

    for (let i = 0; i < this.cops.length; i++) {
      const entry = this.cops[i];
      entry.shootWait = Math.max(0, entry.shootWait - dt);
      const ped = entry.ped;
      const p = ped && ped.position;
      if (!p) continue;
      if (distXZ(p.x, p.z, pos.x, pos.z) <= SHOT_RANGE && entry.shootWait <= 0) {
        engine.emit('playerDamage', { amount: SHOT_AMOUNT, source: 'police' });
        entry.shootWait = SHOT_CD;
      }
    }
  }
}
