// ФАЙЛЫ: src/npc/npc-spawn.js
import * as THREE from 'three';

export const PED_RADIUS = 0.4;
export const POP_MIN = 40;
export const POP_MAX = 80;
export const POP_RADIUS = 150;
export const DESPAWN_RADIUS = 180;
export const SPAWN_MIN_DIST = 40;
export const POP_INTERVAL = 0.5;
export const SPAWNS_PER_TICK = 3;

const KINDS = { civ: true, cop: true, driver: true };

function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function pickSpawnPoint(px, pz, sidewalks) {
  const minD2 = SPAWN_MIN_DIST * SPAWN_MIN_DIST;
  const maxD2 = POP_RADIUS * POP_RADIUS;
  if (sidewalks && sidewalks.length) {
    for (let i = 0; i < 10; i++) {
      const s = sidewalks[(Math.random() * sidewalks.length) | 0];
      const t = Math.random();
      const x = s.x1 + (s.x2 - s.x1) * t;
      const z = s.z1 + (s.z2 - s.z1) * t;
      const d2 = distSq(x, z, px, pz);
      if (d2 >= minD2 && d2 <= maxD2) return { x, z };
    }
  }
  const ang = Math.random() * Math.PI * 2;
  const r = SPAWN_MIN_DIST + Math.random() * (POP_RADIUS - SPAWN_MIN_DIST);
  return { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r };
}

function farthestCivWalk(list, px, pz) {
  let best = null;
  let bestD2 = -1;
  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    if (ped.kind !== 'civ' || ped.mode !== 'walk' || ped.brain) continue;
    const d2 = distSq(ped.position.x, ped.position.z, px, pz);
    if (d2 > bestD2) {
      bestD2 = d2;
      best = ped;
    }
  }
  return best;
}

export function createNpcApi(engine) {
  const list = [];
  const api = {
    list,
    _popAcc: 0,
    spawn(opts) {
      opts = opts || {};
      const kind = KINDS[opts.kind] ? opts.kind : 'civ';
      const x = opts.x || 0;
      const z = opts.z || 0;
      const object3d = new THREE.Group();
      object3d.position.set(x, 0, z);
      engine.scene.add(object3d);
      const ped = {
        object3d,
        position: object3d.position,
        heading: opts.heading || 0,
        health: 100,
        mode: opts.mode || 'walk',
        kind,
        body: null,
        brain: opts.brain || null,
      };
      const physics = engine.physics;
      if (physics && physics.addBody) {
        ped.body = physics.addBody({
          position: ped.position,
          radius: PED_RADIUS,
          mass: 80,
          kind: 'ped',
          ref: ped,
          vx: 0,
          vz: 0,
          height: 1.8,
        });
      }
      list.push(ped);
      return ped;
    },
    despawn(ped) {
      if (!ped) return;
      const physics = engine.physics;
      if (physics && physics.removeBody && ped.body) {
        physics.removeBody(ped.body);
      }
      if (engine.scene && ped.object3d) {
        engine.scene.remove(ped.object3d);
      }
      const i = list.indexOf(ped);
      if (i >= 0) list.splice(i, 1);
    },
  };
  return api;
}

export function tickNpcPopulation(engine, api, dt) {
  if (!api) return;
  api._popAcc = (api._popAcc || 0) + dt;
  if (api._popAcc < POP_INTERVAL) return;
  api._popAcc = 0;

  const state = engine.state || {};
  const player = state.player;
  const pos = player && player.position;
  if (!pos) return;
  const px = pos.x;
  const pz = pos.z;
  const list = api.list;
  const far2 = DESPAWN_RADIUS * DESPAWN_RADIUS;
  const near2 = POP_RADIUS * POP_RADIUS;

  for (let i = list.length - 1; i >= 0; i--) {
    const ped = list[i];
    if (ped.kind !== 'civ' || ped.mode !== 'walk' || ped.brain) continue;
    if (distSq(ped.position.x, ped.position.z, px, pz) > far2) {
      api.despawn(ped);
    }
  }

  while (list.length > POP_MAX) {
    const extra = farthestCivWalk(list, px, pz);
    if (!extra) break;
    api.despawn(extra);
  }

  let nearby = 0;
  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    const m = ped.mode;
    if (m !== 'walk' && m !== 'flee') continue;
    if (distSq(ped.position.x, ped.position.z, px, pz) <= near2) nearby++;
  }

  const sidewalks = (state.city && state.city.sidewalks) || [];
  let spawned = 0;
  while (
    nearby < POP_MIN &&
    list.length < POP_MAX &&
    spawned < SPAWNS_PER_TICK
  ) {
    const p = pickSpawnPoint(px, pz, sidewalks);
    const d2 = distSq(p.x, p.z, px, pz);
    if (d2 < SPAWN_MIN_DIST * SPAWN_MIN_DIST) break;
    api.spawn({
      kind: 'civ',
      x: p.x,
      z: p.z,
      heading: Math.random() * Math.PI * 2,
      mode: 'walk',
    });
    nearby++;
    spawned++;
  }
}
