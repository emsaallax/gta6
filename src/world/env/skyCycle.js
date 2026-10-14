// Цикл неба: Sky.js, солнце/луна/полусфера, state.time и state.render.
// Туман FogExp2 и PCFSoft-тени — hazeShadows.js (собирает environment.js).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const START_HOUR = 8;
const SUN_DIST = 400;
const SHADOW_EXTENT = 40;
const DEFAULT_DRAW = 800;

const DAY_EXPOSURE = 0.9;
const NIGHT_EXPOSURE = 1.05;
const DAY_BLOOM = 0.15;
const NIGHT_BLOOM = 0.7;
const DAY_BLOOM_THR = 1.0;
const NIGHT_BLOOM_THR = 1.0;

const NIGHT_SKY_A = new THREE.Color(0x1b2a55);
const NIGHT_SKY_B = new THREE.Color(0x2a1f4a);
const NIGHT_GROUND = new THREE.Color(0x120c1c);
const DAY_SKY = new THREE.Color(0xc8e8ff);
const DAY_GROUND = new THREE.Color(0x4a5a38);
const SUNSET_SKY = new THREE.Color(0xffc4a3).lerp(new THREE.Color(0xff8a7a), 0.4);
const SUN_COLOR = new THREE.Color(0xfff1d0);
const MOON_COLOR = new THREE.Color(0xa8c8ff);

function originOf(engine) {
  const p = engine.state.player?.position ?? engine.state.cameraTarget?.position;
  if (p) return { x: p.x ?? 0, y: 0, z: p.z ?? 0 };
  return { x: 0, y: 0, z: 0 };
}

function drawDistanceOf(engine) {
  const raw = Number(engine.state.settings?.drawDistance);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DRAW;
}

const SKY_SUN_SCALE = 450000;

// Свет (CONTRACTS §1a): 0 днём, 1 ночью, переход 18.5→19.5 и 5→6.
function nightBlend(time) {
  if (time < 5 || time >= 19.5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time >= 18.5 && time < 19.5) return time - 18.5;
  if (time >= 5 && time < 6) return 1 - (time - 5);
  return 0;
}

function isHardNight(time) {
  return time < 6 || time >= 19.5;
}

// state.render: день 7–17, lerp к ночи с 17, к 19.5 уже ночные значения.
function renderBlend(time) {
  if (time >= 7 && time <= 17) return 0;
  if (time < 6 || time >= 19.5) return 1;
  if (time > 17 && time < 19.5) return (time - 17) / 2.5;
  if (time >= 6 && time < 7) return 1 - (time - 6);
  return 0;
}

function nightTint(time, out) {
  let u = 0.5;
  if (time >= 20) u = (time - 20) / 4;
  else if (time <= 5) u = 1 - time / 5;
  else if (time >= 19.5) u = 0;
  u = THREE.MathUtils.clamp(u, 0, 1);
  return out.copy(NIGHT_SKY_A).lerp(NIGHT_SKY_B, u);
}

// Фон/туман/tint купола: пик персика ~18, к 19.5 ночь.
function atmosphereColor(time, out, tmpNight) {
  if (time < 6 || time >= 19.5) return nightTint(time, out);
  if (time > 17 && time < 19.5) {
    if (time <= 18) {
      return out.copy(DAY_SKY).lerp(SUNSET_SKY, time - 17);
    }
    nightTint(19.5, tmpNight);
    return out.copy(SUNSET_SKY).lerp(tmpNight, (time - 18) / 1.5);
  }
  if (time >= 6 && time < 7) {
    nightTint(time, tmpNight);
    return out.copy(tmpNight).lerp(DAY_SKY, time - 6);
  }
  return out.copy(DAY_SKY);
}

function domeTintAmount(time) {
  if (time < 6 || time >= 18) return 1;
  if (time >= 7 && time <= 17) return 0;
  if (time > 17 && time < 18) return time - 17;
  if (time >= 6 && time < 7) return 1 - (time - 6);
  return 0;
}

export class SkyCycle {
  init(engine) {
    this._nightCol = new THREE.Color();
    this._tmpNight = new THREE.Color();
    this._fogCol = new THREE.Color();
    this._hemiSky = new THREE.Color();
    this._hemiGround = new THREE.Color();
    this._origin = new THREE.Vector3();
    this._skySun = new THREE.Vector3();
    this._uNight = { value: 0 };
    this._uNightColor = { value: new THREE.Color(NIGHT_SKY_A) };

    this.sun = new THREE.DirectionalLight(SUN_COLOR, 1.2);
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

    this.moon = new THREE.DirectionalLight(MOON_COLOR, 0);
    this.moon.castShadow = false;

    this.hemi = new THREE.HemisphereLight(DAY_SKY, DAY_GROUND, 0.85);

    this.sky = new Sky();
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -1;
    this.sky.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this._uNight;
      shader.uniforms.uNightColor = this._uNightColor;
      shader.fragmentShader =
        'uniform float uNight;\nuniform vec3 uNightColor;\n' +
        shader.fragmentShader.replace(
          'gl_FragColor = vec4( retColor, 1.0 );',
          'gl_FragColor = vec4( mix(retColor, uNightColor, uNight), 1.0 );',
        );
    };

    engine.scene.add(this.sun);
    engine.scene.add(this.sun.target);
    engine.scene.add(this.moon);
    engine.scene.add(this.moon.target);
    engine.scene.add(this.hemi);
    engine.scene.add(this.sky);

    engine.state.time = START_HOUR;
    engine.state.render = {
      exposure: DAY_EXPOSURE,
      bloomStrength: DAY_BLOOM,
      bloomThreshold: DAY_BLOOM_THR,
    };

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
    const blend = nightBlend(time);
    const rBlend = renderBlend(time);
    const far = drawDistanceOf(engine);

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

    this.moon.position.set(
      origin.x + Math.cos(theta + Math.PI) * SUN_DIST,
      Math.sin(theta + Math.PI) * SUN_DIST,
      origin.z,
    );
    this.moon.target.position.copy(this._origin);
    this.moon.target.updateMatrixWorld();

    const hardNight = isHardNight(time);
    this.sun.intensity = hardNight || this.sun.position.y < 0 ? 0 : 1.2;
    this.moon.intensity = hardNight ? 0.25 : 0.25 * blend;

    atmosphereColor(time, this._fogCol, this._tmpNight);
    nightTint(time, this._nightCol);
    this._hemiSky.copy(DAY_SKY).lerp(NIGHT_SKY_A, blend);
    if (time > 17 && time < 19.5) {
      const peach = time <= 18 ? time - 17 : 1 - (time - 18) / 1.5;
      this._hemiSky.lerp(SUNSET_SKY, THREE.MathUtils.clamp(peach, 0, 1));
    }
    this._hemiGround.copy(DAY_GROUND).lerp(NIGHT_GROUND, blend);
    this.hemi.color.copy(this._hemiSky);
    this.hemi.groundColor.copy(this._hemiGround);
    this.hemi.intensity = THREE.MathUtils.lerp(0.85, 0.35, blend);

    // Фон всегда цвет атмосферы. PMREM CubeUV как background — чёрное небо.
    engine.scene.background = this._fogCol;

    this._uNight.value = domeTintAmount(time);
    this._uNightColor.value.copy(this._fogCol);

    const uniforms = this.sky.material.uniforms;
    // Шейдер Sky делит sunPosition.y на 450000 — мировой офсет игрока ломает купол.
    this._skySun.set(Math.cos(theta) * SKY_SUN_SCALE, Math.sin(theta) * SKY_SUN_SCALE, 0);
    uniforms['sunPosition'].value.copy(this._skySun);
    uniforms['turbidity'].value = THREE.MathUtils.lerp(4, 1, blend);
    uniforms['rayleigh'].value = THREE.MathUtils.lerp(2.2, 0.2, blend);
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;

    this.sky.scale.setScalar(far * 0.9);
    if (engine.camera) {
      this.sky.position.copy(engine.camera.position);
      engine.camera.far = far;
      engine.camera.updateProjectionMatrix();
    }
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -1;

    const exposure = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(DAY_EXPOSURE, NIGHT_EXPOSURE, rBlend),
      0.9,
      1.3,
    );
    const bloomStrength = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(DAY_BLOOM, NIGHT_BLOOM, rBlend),
      0,
      1.2,
    );
    const bloomThreshold = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(DAY_BLOOM_THR, NIGHT_BLOOM_THR, rBlend),
      0.8,
      1.0,
    );
    engine.state.render = { exposure, bloomStrength, bloomThreshold };
  }
}
