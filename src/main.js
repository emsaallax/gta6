// ОРКЕСТРАТОР владеет этим файлом. Группы регистрируют свои системы здесь (одной строкой).
import { Engine } from './core/engine.js';
import { Assets } from './assets/assets.js';
import { City } from './world/city.js';
import { Environment } from './world/environment.js';
import { Player } from './player/player.js';
import { Vehicles } from './vehicles/vehicles.js';
import { Traffic } from './traffic/traffic.js';
import { Npcs } from './npc/npc.js';
import { Police } from './police/police.js';
import { Missions } from './mission/mission.js';
import { CameraRig } from './core/camera.js';
import { HUD } from './ui/hud.js';

const engine = new Engine(document.getElementById('game'));
engine.add(new Assets());
engine.add(new Environment());   // группа 5
engine.add(new City());          // группа 2
engine.add(new Vehicles());      // группа 4
engine.add(new Traffic());       // группа 4
engine.add(new Npcs());          // группа 3
engine.add(new Player());        // группа 3
engine.add(new Police());        // группа 5
engine.add(new Missions());      // группа 5
engine.add(new CameraRig());     // группа 1
engine.add(new HUD());           // группа 5
engine.start();
window.engine = engine;          // для отладки
