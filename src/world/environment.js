// ГРУППА 5. Свет, небо, день/ночь, HDRI, погода, дождь, пляж. e.state.time = 0..24
import { SkyCycle } from './env/skyCycle.js';
import { NightSky } from './env/nightSky.js';
import { HdriSky } from './env/hdriSky.js';
import { BeachProps } from './env/beachProps.js';
import { Weather } from './env/weather.js';
import { Rain } from './env/rain.js';
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
    this.weather = new Weather();
    this.rain = new Rain();
    this._shadowQ = null;

    this.skyCycle.init(engine);
    this.nightSky.init(engine);
    // HDRI только как IBL (scene.environment). Фон — Sky.js, иначе PMREM CubeUV даёт чёрное небо.
    this.hdriSky.init(engine);
    this.beachProps.init(engine);
    this.weather.init(engine);
    this.rain.init(engine);
    this._restoreSky(engine);
    this._sync(engine);
    this.weather.applyLook(engine);
  }

  update(dt, engine) {
    this.skyCycle.update(dt, engine);
    this.hdriSky.update(dt, engine);
    this._restoreSky(engine);
    this.nightSky.update(dt, engine);
    this.beachProps.update(dt, engine);
    this._sync(engine);
    this.weather.update(dt, engine);
    this.rain.update(dt, engine);
  }

  // Купол Sky.js всегда виден. Фон — цвет атмосферы, не PMREM.
  // Environment из HdriSky оставляем (IBL); ночью не обнуляем.
  _restoreSky(engine) {
    if (this.skyCycle.sky) this.skyCycle.sky.visible = true;
    if (this.skyCycle._fogCol) engine.scene.background = this.skyCycle._fogCol;
    if (this.hdriSky && this.hdriSky._group) this.hdriSky._group.visible = false;
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
