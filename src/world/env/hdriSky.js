// Небо из трёх HDRI: день / закат / ночь. Свет, туман и Sky.js не трогаем.
// ФАЙЛЫ: src/world/env/hdriSky.js
import * as THREE from 'three';

export const HDRI_DAY = 'assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
export const HDRI_DUSK = 'assets/hdri/qwantani_dusk_2_puresky_2k.hdr';
export const HDRI_NIGHT = 'assets/hdri/qwantani_night_puresky_2k.hdr';

const SPHERE_RADIUS = 600;
const KEYS = ['day', 'dusk', 'night'];

function readTime(engine) {
  const t = engine?.state?.time;
  return Number.isFinite(t) ? t : 12;
}

// Веса 0..1 по CONTRACTS §1a. Сумма не обязана быть 1 — нормализуем при смешении.
function hdriWeights(time) {
  let night = 0;
  if (time < 5 || time >= 19.5) night = 1;
  else if (time >= 6 && time < 18.5) night = 0;
  else if (time >= 18.5 && time < 19.5) night = time - 18.5;
  else if (time >= 5 && time < 6) night = 1 - (time - 5);

  let dusk = 0;
  if (time >= 17 && time <= 18) dusk = time - 17;
  else if (time > 18 && time < 19.5) dusk = 1 - (time - 18) / 1.5;

  let day = 1 - night - dusk;
  if (day < 0) day = 0;
  return { day, dusk, night };
}

function normalizeWeights(w) {
  const s = w.day + w.dusk + w.night;
  if (s <= 0) return { day: 1, dusk: 0, night: 0 };
  return { day: w.day / s, dusk: w.dusk / s, night: w.night / s };
}

function bindSkyMaterial(mat, tex) {
  mat.map = null;
  mat.envMap = null;
  if (!tex) {
    mat.needsUpdate = true;
    return;
  }
  const mapping = tex.mapping;
  const cubeish =
    tex.isCubeTexture ||
    mapping === THREE.CubeReflectionMapping ||
    mapping === THREE.CubeRefractionMapping ||
    mapping === THREE.CubeUVReflectionMapping;
  if (cubeish) mat.envMap = tex;
  else mat.map = tex;
  mat.needsUpdate = true;
}

function makeSphereMat() {
  return new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    transparent: true,
    opacity: 0,
    toneMapped: true,
  });
}

export class HdriSky {
  constructor() {
    this.active = false;
    this._maps = { day: null, dusk: null, night: null };
    this._built = false;
    this._group = null;
    this._slots = [];
  }

  init(engine) {
    this.active = false;
    const assets = engine?.state?.assets;
    if (!assets || typeof assets.loadHDR !== 'function') {
      this.active = false;
      return;
    }
    const jobs = [
      this._tryLoad(assets, HDRI_DAY, 'day'),
      this._tryLoad(assets, HDRI_DUSK, 'dusk'),
      this._tryLoad(assets, HDRI_NIGHT, 'night'),
    ];
    Promise.all(jobs).then(() => {
      const any = KEYS.some((k) => this._maps[k]);
      if (!any) {
        this.active = false;
        return;
      }
      this.active = true;
      this._build(engine);
      this._apply(engine);
    });
  }

  async _tryLoad(assets, path, key) {
    try {
      const tex = await assets.loadHDR(path);
      if (tex) this._maps[key] = tex;
    } catch (_err) {
      this._maps[key] = null;
    }
  }

  _build(engine) {
    if (this._built || !engine?.scene) return;
    this._built = true;
    this._group = new THREE.Group();
    this._group.name = 'hdriSky';

    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 16);
    for (let i = 0; i < 2; i++) {
      const mat = makeSphereMat();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -2;
      mesh.frustumCulled = false;
      mesh.name = i === 0 ? 'hdriSkyA' : 'hdriSkyB';
      this._group.add(mesh);
      this._slots.push({ mesh, mat });
    }
    engine.scene.add(this._group);
  }

  update(_dt, engine) {
    if (!this.active) return;
    if (!this._built) this._build(engine);
    this._apply(engine);
  }

  _apply(engine) {
    if (!this.active || !engine?.scene) return;

    const raw = hdriWeights(readTime(engine));
    const avail = { day: 0, dusk: 0, night: 0 };
    for (const k of KEYS) {
      avail[k] = this._maps[k] ? raw[k] : 0;
    }
    const w = normalizeWeights(avail);

    const ranked = KEYS.filter((k) => this._maps[k])
      .map((k) => ({ key: k, w: w[k], tex: this._maps[k] }))
      .sort((a, b) => b.w - a.w);

    if (ranked.length === 0) {
      this.active = false;
      return;
    }

    const envTex = ranked[0].tex;
    engine.scene.background = envTex;
    engine.scene.environment = envTex;

    if (!this._built || this._slots.length < 2) return;

    const a = ranked[0];
    const b = ranked[1] || { key: a.key, w: 0, tex: a.tex };
    bindSkyMaterial(this._slots[0].mat, a.tex);
    bindSkyMaterial(this._slots[1].mat, b.tex);
    this._slots[0].mat.opacity = a.w;
    this._slots[1].mat.opacity = b.w;
    this._slots[0].mesh.visible = a.w > 0.001;
    this._slots[1].mesh.visible = b.w > 0.001;

    const cam = engine.camera;
    if (cam && this._group) {
      this._group.position.copy(cam.position);
      const far = cam.far || 800;
      const fit = Math.min(1, (far * 0.9) / SPHERE_RADIUS);
      this._group.scale.setScalar(Math.max(0.25, fit));
    }
  }
}
