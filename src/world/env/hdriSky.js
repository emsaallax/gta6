// Небо из трёх HDRI: день / закат / ночь. Свет, туман и Sky.js не трогаем.
// PMREM — только scene.environment (IBL). В background не ставить: CubeUV = чёрное небо.

export const HDRI_DAY = 'assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr';
export const HDRI_DUSK = 'assets/hdri/qwantani_dusk_2_puresky_2k.hdr';
export const HDRI_NIGHT = 'assets/hdri/qwantani_night_puresky_2k.hdr';

const KEYS = ['day', 'dusk', 'night'];
const PATHS = { day: HDRI_DAY, dusk: HDRI_DUSK, night: HDRI_NIGHT };

function readTime(engine) {
  const t = engine?.state?.time;
  return Number.isFinite(t) ? t : 12;
}

// Веса 0..1 по CONTRACTS §1a.
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

export class HdriSky {
  constructor() {
    this.active = false;
    this._maps = { day: null, dusk: null, night: null };
    this._group = null;
  }

  init(engine) {
    this.active = false;
    const assets = engine?.state?.assets;
    if (!assets || typeof assets.loadHDR !== 'function') {
      this.active = false;
      return;
    }
    this._loadSeq(engine, assets);
  }

  // По очереди, не три огромных HDR сразу: параллель давала requestfailed на dusk.
  async _loadSeq(engine, assets) {
    for (const key of KEYS) {
      await this._tryLoad(assets, PATHS[key], key);
    }
    const any = KEYS.some((k) => this._maps[k]);
    if (!any) {
      this.active = false;
      return;
    }
    this.active = true;
    this._apply(engine);
  }

  async _tryLoad(assets, path, key) {
    try {
      const tex = await assets.loadHDR(path);
      if (tex) this._maps[key] = tex;
    } catch (_err) {
      this._maps[key] = null;
    }
  }

  update(_dt, engine) {
    if (!this.active) return;
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

    // Только IBL. Фон оставляет Sky.js — иначе PMREM CubeUV чёрный.
    engine.scene.environment = ranked[0].tex;
  }
}
