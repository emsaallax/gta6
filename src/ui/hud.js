// ГРУППА 5. HUD: миникарта, подсказки, меню, экран загрузки. Рисовать в #ui.
import { Menus } from './menus.js';
import { Minimap } from './minimap.js';
import { StatusHud } from './statusHud.js';
import { GameHud } from './gameHud.js';
import { LoadingScreen } from './loadingScreen.js';

export class HUD {
  constructor() {
    // На паузе движок пропускает update. Меню, миникарта и HUD должны жить.
    this.updatePaused = true;
  }

  init(engine) {
    this.menus = new Menus();
    this.minimap = new Minimap();
    this.status = new StatusHud();
    this.gameHud = new GameHud();
    this.loading = new LoadingScreen();
    this.menus.init(engine);
    this.minimap.init(engine);
    this.status.init(engine);
    this.gameHud.init(engine);
    this.loading.init(engine);
  }

  update(dt, engine) {
    this.menus.update(dt, engine);
    this.minimap.update(dt, engine);
    this.status.update(dt, engine);
    this.gameHud.update(dt, engine);
    this.loading.update(dt, engine);
  }
}
