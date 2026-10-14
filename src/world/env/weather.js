// ФАЙЛЫ: src/world/env/weather.js
// Погода: state.weather { rain, wet, wind, kind }, клавиша [, туман и затемнение неба.
import * as THREE from 'three';

export const KINDS = ['clear', 'cloudy', 'rain', 'storm'];
export const TRANSITION_SEC = 45; // строго в 30..90
export const WET_UP_SEC = 20;
export const WET_DOWN_SEC = 60;
export const TARGETS = {
  clear:  { rain: 0, wind: 0.15 },
  cloudy: { rain: 0, wind: 0.35 },
  rain:   { rain: 0.75, wind: 0.5 },
  storm:  { rain: 1, wind: 0.85 },
};

const CLOUD_BY_KIND = {
  clear: 0,
  cloudy: 0.45,
  rain: 0.7,
  storm: 1,
};

const HAZE_K = 2.5;
const DEFAULT_DRAW = 800;
const WET_RAIN_THRESHOLD = 0.05;

export function nextKind(kind) {
  const i = KINDS.indexOf(kind);
  if (i < 0) return 'clear';
  return KINDS[(i + 1) % KINDS.length];
}

function clamp01(v) {
  return THREE.MathUtils.clamp(v, 0, 1);
}

function drawDistanceOf(engine) {
  const raw = engine?.state?.settings?.drawDistance;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DRAW;
}

function cloudOf(kind) {
  return CLOUD_BY_KIND[kind] ?? 0;
}

function targetsOf(kind) {
  return TARGETS[kind] || TARGETS.clear;
}

/** FogExp2 плотность = (2.5 / drawDistance) * (1 + rain * 2).
 *  scene.environmentIntensity = lerp(1, 0.28, cloud);
 *  scene.backgroundIntensity = lerp(1, 0.45, cloud);
 *  cloud: clear 0, cloudy 0.45, rain 0.7, storm 1 (по kind).
 *  Нет свойства у scene — пропустить. drawDistance из settings, иначе 800. */
export function applyWeatherLook(engine) {
  const scene = engine?.scene;
  if (!scene) return;
  const w = engine.state?.weather;
  const rain = typeof w?.rain === 'number' && Number.isFinite(w.rain) ? clamp01(w.rain) : 0;
  const kind = typeof w?.kind === 'string' ? w.kind : 'clear';
  const cloud = cloudOf(kind);
  const draw = drawDistanceOf(engine);
  const density = (HAZE_K / draw) * (1 + rain * 2);

  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.density = density;
  } else if (!scene.fog) {
    scene.fog = new THREE.FogExp2(0xc8e8ff, density);
  }

  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = THREE.MathUtils.lerp(1, 0.28, cloud);
  }
  if ('backgroundIntensity' in scene) {
    scene.backgroundIntensity = THREE.MathUtils.lerp(1, 0.45, cloud);
  }
}

export class Weather {
  init(engine) {
    this._fromRain = 0;
    this._fromWind = 0.15;
    this._targetRain = TARGETS.clear.rain;
    this._targetWind = TARGETS.clear.wind;
    this._elapsed = TRANSITION_SEC;
    engine.state.weather = { rain: 0, wet: 0, wind: 0.15, kind: 'clear' };
    this.applyLook(engine);
  }

  update(dt, engine) {
    const state = engine.state;
    const prev = state.weather || { rain: 0, wet: 0, wind: 0.15, kind: 'clear' };
    let kind = KINDS.includes(prev.kind) ? prev.kind : 'clear';
    let rain = Number.isFinite(prev.rain) ? prev.rain : 0;
    let wet = Number.isFinite(prev.wet) ? prev.wet : 0;
    let wind = Number.isFinite(prev.wind) ? prev.wind : TARGETS.clear.wind;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

    if (engine.input?.pressed('BracketLeft')) {
      kind = nextKind(kind);
      const t = targetsOf(kind);
      this._fromRain = rain;
      this._fromWind = wind;
      this._targetRain = t.rain;
      this._targetWind = t.wind;
      this._elapsed = 0;
    }

    this._elapsed += step;
    const u = clamp01(this._elapsed / TRANSITION_SEC);
    rain = THREE.MathUtils.lerp(this._fromRain, this._targetRain, u);
    wind = THREE.MathUtils.lerp(this._fromWind, this._targetWind, u);

    if (rain > WET_RAIN_THRESHOLD) {
      wet += step / WET_UP_SEC;
    } else {
      wet -= step / WET_DOWN_SEC;
    }

    rain = clamp01(rain);
    wet = clamp01(wet);
    wind = clamp01(wind);

    state.weather = { rain, wet, wind, kind };
    this.applyLook(engine);
  }

  applyLook(engine) {
    applyWeatherLook(engine);
  }
}
