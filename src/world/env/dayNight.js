// Волна 1. Не подключать: волна 2 использует SkyCycle в environment.js.
// Цикл дня и ночи: часы 0..24, солнце, небо, туман, тени за игроком.
import * as THREE from 'three';

const START_HOUR = 8;
const DEFAULT_SHADOWS = 'medium';
const DEFAULT_DRAW = 800;
const SUN_DIST = 400;
const SHADOW_EXTENT = 40;
const MAP_SIZE = { low: 512, medium: 1024, high: 2048 };

const NIGHT = 0x020814;
const DAWN = 0xc48a9a;
const DAY = 0x87ceeb;
const SUNSET = 0xff7a45;
const DUSK = 0x3a2a6a;

// Границы из задачи + середины, чтобы на 18:00 был закат, на 19.5 — сумерки.
const SKY_STOPS = [
  { t: 0, c: new THREE.Color(NIGHT) },
  { t: 5, c: new THREE.Color(NIGHT) },
  { t: 6, c: new THREE.Color(DAWN) },
  { t: 7, c: new THREE.Color(DAY) },
  { t: 17, c: new THREE.Color(DAY) },
  { t: 18, c: new THREE.Color(SUNSET) },
  { t: 19.5, c: new THREE.Color(DUSK) },
  { t: 21, c: new THREE.Color(NIGHT) },
  { t: 24, c: new THREE.Color(NIGHT) },
];

function lerpSky(time, out) {
  let i = 0;
  while (i + 1 < SKY_STOPS.length && SKY_STOPS[i + 1].t < time) i += 1;
  const a = SKY_STOPS[i];
  const b = SKY_STOPS[Math.min(i + 1, SKY_STOPS.length - 1)];
  const span = b.t - a.t;
  const u = span > 0 ? (time - a.t) / span : 0;
  return out.copy(a.c).lerp(b.c, u);
}

function originOf(engine) {
  const p = engine.state.player?.position || engine.state.cameraTarget?.position;
  if (p) return { x: p.x ?? 0, y: 0, z: p.z ?? 0 };
  return { x: 0, y: 0, z: 0 };
}

export class DayNight {
  init(engine) {
    this.skyColor = new THREE.Color();
    this._shadowKey = null;
    this._origin = new THREE.Vector3();

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.camera.left = -SHADOW_EXTENT;
    this.sun.shadow.camera.right = SHADOW_EXTENT;
    this.sun.shadow.camera.top = SHADOW_EXTENT;
    this.sun.shadow.camera.bottom = -SHADOW_EXTENT;
    this.sun.shadow.camera.updateProjectionMatrix();

    this.hemi = new THREE.HemisphereLight(0x87ceeb, 0x334422, 0.8);

    engine.scene.add(this.sun);
    engine.scene.add(this.sun.target);
    engine.scene.add(this.hemi);

    engine.scene.background = this.skyColor;
    engine.scene.fog = new THREE.Fog(this.skyColor.getHex(), 80, DEFAULT_DRAW);

    engine.state.time = START_HOUR;
    this.apply(0, engine, true);
  }

  update(dt, engine) {
    this.apply(dt, engine, false);
  }

  apply(dt, engine, force) {
    if (engine.state.paused !== true) {
      engine.state.time = (engine.state.time + dt / 60) % 24;
    }
    const time = engine.state.time;

    const origin = originOf(engine);
    this._origin.set(origin.x, origin.y, origin.z);

    const theta = ((time - 6) / 24) * Math.PI * 2;
    this.sun.position.set(
      origin.x + Math.cos(theta) * SUN_DIST,
      Math.sin(theta) * SUN_DIST,
      origin.z,
    );
    this.sun.target.position.copy(this._origin);
    this.sun.target.updateMatrixWorld();

    // Ночью солнце под горизонтом — интенсивность 0; днём около 1.2.
    const dayAmt = Math.max(0, Math.sin(theta));
    this.sun.intensity = this.sun.position.y < 0 ? 0 : 1.2 * Math.min(1, dayAmt / 0.35);
    this.hemi.intensity = 0.12 + 0.68 * dayAmt;
    lerpSky(time, this.skyColor);
    this.hemi.color.copy(this.skyColor);
    engine.scene.background = this.skyColor;
    if (engine.scene.fog) engine.scene.fog.color.copy(this.skyColor);

    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.updateProjectionMatrix();

    const shadows = engine.state.settings?.shadows || DEFAULT_SHADOWS;
    const mapSize = MAP_SIZE[shadows] || MAP_SIZE.medium;
    if (force || this._shadowKey !== mapSize) {
      this._shadowKey = mapSize;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(mapSize, mapSize);
    }

    const raw = Number(engine.state.settings?.drawDistance);
    const far = Number.isFinite(raw) ? raw : DEFAULT_DRAW;
    engine.camera.far = far;
    if (engine.scene.fog) {
      engine.scene.fog.near = Math.min(120, far * 0.2);
      engine.scene.fog.far = far;
    }
    engine.camera.updateProjectionMatrix();
  }
}
