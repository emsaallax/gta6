// ГРУППА 3. Прохожие. state.npcs = { list, spawn, despawn } по CONTRACTS §7.
import { createNpcApi, tickNpcPopulation } from './npc-spawn.js';
import { createPedInstances, syncPedInstances } from './ped-visual.js';
import { bindPedLife, stepPed } from './ped-life.js';
import { attachKenneyPed } from './kenney-ped.js';
import { updateAllPedAnims } from './ped-anim.js';
import { updatePedTalk } from './ped-talk.js';
import { applyPedStride, createUmbrellaPool } from './ped-gait.js';

export class Npcs {
  init(engine) {
    const api = createNpcApi(engine);
    const spawn = api.spawn.bind(api);
    api.spawn = (opts) => {
      const ped = spawn(opts);
      attachKenneyPed(ped, engine);
      return ped;
    };
    engine.state.npcs = api;
    this.inst = createPedInstances(engine.scene);
    this.umbrellas = createUmbrellaPool(engine.scene);
    bindPedLife(engine);
    this.frame = 0;
  }

  update(dt, engine) {
    const api = engine.state.npcs;
    if (!api) return;

    tickNpcPopulation(engine, api, dt);

    const snapshot = api.list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      stepPed(snapshot[i], dt, engine);
      applyPedStride(snapshot[i], dt);
    }

    const pos = engine.state.player && engine.state.player.position;
    const playerPos = pos || { x: 0, z: 0 };

    updatePedTalk(api.list, dt, playerPos);
    updateAllPedAnims(api.list, dt, playerPos, this.frame);
    this.frame += 1;

    const instList = [];
    for (let i = 0; i < api.list.length; i++) {
      if (api.list[i]._lod === 'instance') instList.push(api.list[i]);
    }
    syncPedInstances(this.inst, instList, playerPos, dt);

    if (this.umbrellas && typeof this.umbrellas.update === 'function') {
      this.umbrellas.update(api.list, engine.state.weather);
    }
  }
}
