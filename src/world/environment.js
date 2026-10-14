// ГРУППА 5. Свет, небо, день/ночь, HDRI, пляж. e.state.time = 0..24
import { SkyCycle } from './env/skyCycle.js';
import { NightSky } from './env/nightSky.js';
import { HdriSky } from './env/hdriSky.js';
import { BeachProps } from './env/beachProps.js';
import { setupShadowMap, updateSoftShadows, updateHaze } from './env/hazeShadows.js';

function qualityOf(engine) {
  const q = engine.state?.settings?.quality;
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  return 'high';
}

export class Environment {
  constructor() {
    // На паузе движок не зовёт update, пока нет этого флага.
    // Свет должен соответствовать time, настройки теней/дали — применяться сразу.
    this.updatePaused = true;
  }

  init(engine) {
    this.skyCycle = new SkyCycle();
    this.nightSky = new NightSky();
    this.hdriSky = new HdriSky();
    this.beachProps = new BeachProps();
    this._shadowQ = null;

    this.skyCycle.init(engine);
    this.nightSky.init(engine);
    // HdriSky.init не зовём: loadHDR отдаёт PMREM CubeUV, его нельзя
    // ставить в scene.background (чёрное небо), сферы светятся серыми
    // квадратами, ночной IBL + bloom — белая пелена. Параллельная
    // загрузка dusk HDR даёт requestfailed в приёмке. Пока исполнители
    // 01/03 не починят — только процедурное Sky.js.
    this.beachProps.init(engine);
    this._restoreSky(engine);
    this._sync(engine);
  }

  update(dt, engine) {
    this.skyCycle.update(dt, engine);
    this.hdriSky.update(dt, engine);
    this._restoreSky(engine);
    this.nightSky.update(dt, engine);
    this.beachProps.update(dt, engine);
    this._sync(engine);
  }

  // Sky.js всегда виден. Фон — цвет атмосферы, не PMREM.
  _restoreSky(engine) {
    if (this.skyCycle.sky) this.skyCycle.sky.visible = true;
    if (this.skyCycle._fogCol) engine.scene.background = this.skyCycle._fogCol;
    if (this.hdriSky && this.hdriSky._group) this.hdriSky._group.visible = false;
    const time = Number(engine.state && engine.state.time);
    if (time < 6 || time >= 19.5) {
      engine.scene.environment = null;
    }
  }

  _sync(engine) {
    if (this.skyCycle.sky) this.skyCycle.sky.visible = true;

    const q = qualityOf(engine);
    if (this._shadowQ !== q) {
      this._shadowQ = q;
      setupShadowMap(engine.renderer, q);
    }
    updateSoftShadows(this.skyCycle.sun, engine);
    updateHaze(engine.scene, engine, this.skyCycle._fogCol);
  }
}
