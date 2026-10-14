// ФАЙЛЫ: src/world/env/rain.js
// Инстансные струи и брызги вокруг камеры. state.weather только читаем.
import * as THREE from 'three';

export const STREAK_COUNT = 700;
export const SPLASH_COUNT = 220;
export const CYL_RADIUS = 18;
export const CYL_HEIGHT = 22;

const RAIN_ON = 0.05;
const FALL_SPEED = 16;
const FLASH_DECAY = 0.12;
const TILT_K = 0.45;
const WHITE = new THREE.Color(1, 1, 1);

function readWeather(engine) {
  const w = engine?.state?.weather;
  const rain = Number(w?.rain);
  const wind = Number(w?.wind);
  return {
    rain: Number.isFinite(rain) ? rain : 0,
    wind: Number.isFinite(wind) ? wind : 0,
    kind: w?.kind === 'cloudy' || w?.kind === 'rain' || w?.kind === 'storm' ? w.kind : 'clear',
  };
}

function randInDisk(radius) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function wrapDisk(x, z, radius) {
  const d2 = x * x + z * z;
  const max = radius * radius;
  if (d2 <= max) return { x, z };
  const d = Math.sqrt(d2) || 1;
  const scale = (radius * 0.98) / d;
  return { x: x * scale, z: z * scale };
}

export class Rain {
  init(engine) {
    const scene = engine.scene;
    this.flash = 0;
    this.thunderIn = 0;
    this._nextStrike = 4 + Math.random() * 6;
    this._dummy = new THREE.Object3D();
    this._bgWork = new THREE.Color();

    const streakGeo = new THREE.BoxGeometry(0.018, 0.85, 0.018);
    const splashGeo = new THREE.CircleGeometry(0.11, 8);
    splashGeo.rotateX(-Math.PI / 2);

    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xb8d4ee,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xc5d8ea,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_COUNT);
    this.splashes = new THREE.InstancedMesh(splashGeo, splashMat, SPLASH_COUNT);
    this.streaks.count = STREAK_COUNT;
    this.splashes.count = SPLASH_COUNT;
    this.streaks.frustumCulled = false;
    this.splashes.frustumCulled = false;
    this.streaks.matrixAutoUpdate = false;
    this.splashes.matrixAutoUpdate = false;
    this.streaks.castShadow = false;
    this.splashes.castShadow = false;
    this.streaks.receiveShadow = false;
    this.splashes.receiveShadow = false;
    this.streaks.visible = false;
    this.splashes.visible = false;
    this.streaks.name = 'rainStreaks';
    this.splashes.name = 'rainSplashes';

    this._sx = new Float32Array(STREAK_COUNT);
    this._sy = new Float32Array(STREAK_COUNT);
    this._sz = new Float32Array(STREAK_COUNT);
    this._px = new Float32Array(SPLASH_COUNT);
    this._pz = new Float32Array(SPLASH_COUNT);
    this._page = new Float32Array(SPLASH_COUNT);

    for (let i = 0; i < STREAK_COUNT; i++) this._resetStreak(i, true);
    for (let i = 0; i < SPLASH_COUNT; i++) this._resetSplash(i, true);

    scene.add(this.streaks);
    scene.add(this.splashes);
  }

  _resetStreak(i, scatterY) {
    const p = randInDisk(CYL_RADIUS);
    this._sx[i] = p.x;
    this._sz[i] = p.z;
    this._sy[i] = scatterY ? Math.random() * CYL_HEIGHT : CYL_HEIGHT * (0.85 + Math.random() * 0.15);
  }

  _resetSplash(i, scatterAge) {
    const p = randInDisk(CYL_RADIUS);
    this._px[i] = p.x;
    this._pz[i] = p.z;
    this._page[i] = scatterAge ? Math.random() : 0;
  }

  update(dt, engine) {
    const { rain, wind, kind } = readWeather(engine);
    const cam = engine.camera.position;
    const tilt = wind * TILT_K;
    const drift = Math.tan(tilt) * FALL_SPEED;

    this._updateStorm(dt, engine, kind, rain);

    const on = rain >= RAIN_ON;
    this.streaks.visible = on;
    this.splashes.visible = on;
    if (!on) return;

    const nStreak = STREAK_COUNT;
    const nSplash = SPLASH_COUNT;
    this.streaks.count = nStreak;
    this.splashes.count = nSplash;
    this.streaks.material.opacity = 0.22 + rain * 0.28;
    this.splashes.material.opacity = 0.18 + rain * 0.22;

    const dummy = this._dummy;
    const step = FALL_SPEED * dt;

    for (let i = 0; i < nStreak; i++) {
      let y = this._sy[i] - step;
      let x = this._sx[i] + drift * dt;
      let z = this._sz[i];
      if (y < 0) {
        this._resetStreak(i, false);
        x = this._sx[i];
        y = this._sy[i];
        z = this._sz[i];
      } else {
        const w = wrapDisk(x, z, CYL_RADIUS);
        x = w.x;
        z = w.z;
        this._sx[i] = x;
        this._sy[i] = y;
        this._sz[i] = z;
      }
      dummy.position.set(cam.x + x, y, cam.z + z);
      dummy.rotation.set(0, 0, -tilt);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.streaks.setMatrixAt(i, dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < nSplash; i++) {
      let age = this._page[i] + dt * (1.8 + rain);
      if (age >= 1) {
        this._resetSplash(i, false);
        age = this._page[i];
      } else {
        this._page[i] = age;
      }
      const s = 0.35 + age * 1.4;
      dummy.position.set(cam.x + this._px[i], 0, cam.z + this._pz[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      this.splashes.setMatrixAt(i, dummy.matrix);
    }
    this.splashes.instanceMatrix.needsUpdate = true;
  }

  _updateStorm(dt, engine, kind, rain) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt / FLASH_DECAY);
    }

    if (kind === 'storm' && rain > 0.4) {
      this._nextStrike -= dt;
      if (this._nextStrike <= 0) {
        this.flash = 1;
        this.thunderIn = 1 + Math.random() * 2;
        this._nextStrike = 4 + Math.random() * 6;
      }
    } else {
      this._nextStrike = 4 + Math.random() * 6;
    }

    if (this.thunderIn > 0) {
      this.thunderIn -= dt;
      if (this.thunderIn <= 0) {
        this.thunderIn = 0;
        const audio = engine.state && engine.state.audio;
        if (audio && typeof audio.play === 'function') {
          audio.play('thunder', { volume: 0.9 });
        }
      }
    }

    const scene = engine.scene;
    if (this.flash > 0 && scene.background && scene.background.isColor) {
      this._bgWork.copy(scene.background);
      this._bgWork.lerp(WHITE, this.flash);
      scene.background.copy(this._bgWork);
    }
    if (this.flash > 0 && 'backgroundIntensity' in scene) {
      scene.backgroundIntensity = 1 + this.flash * 2.5;
    }
  }
}
