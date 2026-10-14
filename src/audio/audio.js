// ФАЙЛЫ: src/audio/audio.js

export const SOUND_NAMES = [
  'engine', 'tires', 'horn', 'siren', 'shot', 'hit',
  'step', 'rain', 'city', 'wind', 'thunder', 'neon',
];

const NAMES = new Set(SOUND_NAMES);

const EMPTY_HANDLE = { set() {}, stop() {} };

function clamp01(v) {
  const n = Number(v);
  if (!(n >= 0)) return 0;
  if (n > 1) return 1;
  return n;
}

function makeNoiseBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function readPos(pos) {
  if (!pos) return null;
  const x = Number(pos.x);
  const y = Number(pos.y);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function setPannerPos(panner, pos) {
  if (!panner || !pos) return;
  if (panner.positionX) {
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
  } else if (panner.setPosition) {
    panner.setPosition(pos.x, pos.y, pos.z);
  }
}

function setListenerFromCamera(listener, camera) {
  if (!listener || !camera || !camera.position) return;
  const p = camera.position;
  if (listener.positionX) {
    listener.positionX.value = p.x;
    listener.positionY.value = p.y;
    listener.positionZ.value = p.z;
  } else if (listener.setPosition) {
    listener.setPosition(p.x, p.y, p.z);
  }

  let fx = 0;
  let fy = 0;
  let fz = -1;
  let ux = 0;
  let uy = 1;
  let uz = 0;
  const e = camera.matrixWorld && camera.matrixWorld.elements;
  if (e && e.length >= 16) {
    fx = -e[8];
    fy = -e[9];
    fz = -e[10];
    ux = e[4];
    uy = e[5];
    uz = e[6];
  } else if (camera.up) {
    ux = camera.up.x;
    uy = camera.up.y;
    uz = camera.up.z;
  }
  if (listener.forwardX) {
    listener.forwardX.value = fx;
    listener.forwardY.value = fy;
    listener.forwardZ.value = fz;
    listener.upX.value = ux;
    listener.upY.value = uy;
    listener.upZ.value = uz;
  } else if (listener.setOrientation) {
    listener.setOrientation(fx, fy, fz, ux, uy, uz);
  }
}

/** Синтез: осциллятор + шум + фильтр. Без fetch и без файлов. */
function buildGraph(ctx, noiseBuf, name, looping) {
  const sources = [];
  const gain = ctx.createGain();
  gain.gain.value = 1;
  let filter = null;

  const addOsc = (type, freq) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    sources.push({ node: osc, kind: 'osc', baseFreq: freq });
    return osc;
  };
  const addNoise = () => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    sources.push({ node: src, kind: 'noise', baseFreq: 1 });
    return src;
  };

  if (name === 'engine') {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const a = addOsc('sawtooth', 72);
    const b = addOsc('sawtooth', 144);
    a.connect(filter);
    b.connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.28;
  } else if (name === 'tires') {
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    addNoise().connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.22;
  } else if (name === 'horn') {
    addOsc('square', 392).connect(gain);
    addOsc('square', 494).connect(gain);
    gain.gain.value = 0.18;
  } else if (name === 'siren') {
    const osc = addOsc('sawtooth', 760);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.42;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 280;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    sources.push({ node: lfo, kind: 'lfo', baseFreq: 0.42 });
    osc.connect(gain);
    gain.gain.value = 0.2;
  } else if (name === 'shot') {
    filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 800;
    addNoise().connect(filter);
    addOsc('square', 180).connect(gain);
    filter.connect(gain);
    gain.gain.value = 0.45;
  } else if (name === 'hit') {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    addNoise().connect(filter);
    addOsc('triangle', 90).connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.4;
  } else if (name === 'step') {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    addNoise().connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.3;
  } else if (name === 'rain') {
    filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    addNoise().connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.18;
  } else if (name === 'city') {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    addNoise().connect(filter);
    addOsc('sine', 55).connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.16;
  } else if (name === 'wind') {
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.4;
    addNoise().connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.2;
  } else if (name === 'thunder') {
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 120;
    addNoise().connect(filter);
    addOsc('sine', 38).connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.5;
  } else if (name === 'neon') {
    filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 8;
    addOsc('sawtooth', 120).connect(filter);
    addOsc('square', 121.5).connect(filter);
    filter.connect(gain);
    gain.gain.value = 0.12;
  }

  const oneshot = {
    engine: 0.4,
    tires: 0.45,
    horn: 0.35,
    siren: 1.1,
    shot: 0.14,
    hit: 0.22,
    step: 0.08,
    rain: 1.2,
    city: 1.6,
    wind: 1.2,
    thunder: 2.4,
    neon: 0.45,
  };

  return { sources, gain, duration: looping ? 0 : oneshot[name] || 0.3 };
}

export class Audio {
  constructor() {
    this.master = 1;
    this.muted = false;
    this.listener = null;
    this._engine = null;
    this._ctx = null;
    this._masterGain = null;
    this._noise = null;
    this._loops = new Map();
    this._resumeBound = null;
  }

  init(engine) {
    this._engine = engine;
    engine.state.audio = this;

    let ctx = null;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    } catch (_e) {
      ctx = null;
    }

    if (!ctx) return;

    this._ctx = ctx;
    this.listener = ctx.listener || null;
    this._masterGain = ctx.createGain();
    this._masterGain.gain.value = 1;
    this._masterGain.connect(ctx.destination);
    this._noise = makeNoiseBuffer(ctx);

    this._resumeBound = () => {
      if (this._ctx && this._ctx.resume) this._ctx.resume();
    };
    document.addEventListener('click', this._resumeBound);
    document.addEventListener('pointerdown', this._resumeBound);
  }

  play(name, opts) {
    if (!this._ctx || !this._masterGain) return;
    if (!NAMES.has(name)) return;
    this._startVoice(name, opts || {}, false);
  }

  loop(id, name, opts) {
    if (!this._ctx || !this._masterGain) return EMPTY_HANDLE;
    if (!NAMES.has(name)) return EMPTY_HANDLE;
    const key = String(id);
    const existing = this._loops.get(key);
    if (existing) {
      existing.set(opts || {});
      return existing.handle;
    }
    const voice = this._startVoice(name, opts || {}, true);
    if (!voice) return EMPTY_HANDLE;

    const handle = {
      set: (patch) => {
        this._applyOpts(voice, patch || {});
      },
      stop: () => {
        this._stopVoice(voice);
        if (this._loops.get(key) === handleWrap) this._loops.delete(key);
      },
    };
    const handleWrap = { handle, voice, set: handle.set, stop: handle.stop };
    this._loops.set(key, handleWrap);
    return handle;
  }

  update(_dt, engine) {
    const ctx = this._ctx;
    if (ctx && this._masterGain) {
      const g = this.muted ? 0 : clamp01(this.master);
      const param = this._masterGain.gain;
      if (param.setTargetAtTime) param.setTargetAtTime(g, ctx.currentTime, 0.03);
      else param.value = g;
      setListenerFromCamera(this.listener, engine && engine.camera);
    }

    const state = (engine && engine.state) || {};
    const ui = state.ui;
    const started = !!(ui && ui.started === true);
    const weather = state.weather;
    const rain = weather && Number.isFinite(weather.rain) ? weather.rain : 0;
    const wind = weather && Number.isFinite(weather.wind) ? weather.wind : 0;

    if (!started) {
      this._setLoopVol('amb-city', 0);
      this._setLoopVol('amb-rain', 0);
      this._setLoopVol('amb-wind', 0);
      this._stopSirens(null);
      return;
    }

    this.loop('amb-city', 'city', { volume: 0.2 });
    this.loop('amb-rain', 'rain', { volume: rain || 0 });
    this.loop('amb-wind', 'wind', { volume: (wind || 0) * 0.35 });

    const vehicles = state.vehicles;
    const live = new Set();
    if (Array.isArray(vehicles)) {
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        const sid = 'siren-' + i;
        if (v && v.siren === true) {
          const pos = readPos(v.position);
          this.loop(sid, 'siren', { pos: pos || undefined, volume: 0.55 });
          live.add(sid);
        } else {
          this._stopId(sid);
        }
      }
    }
    this._stopSirens(live);
  }

  _setLoopVol(id, volume) {
    const rec = this._loops.get(id);
    if (rec) rec.set({ volume });
  }

  _stopId(id) {
    const rec = this._loops.get(id);
    if (rec) rec.stop();
  }

  _stopSirens(live) {
    for (const id of [...this._loops.keys()]) {
      if (id.indexOf('siren-') !== 0) continue;
      if (live && live.has(id)) continue;
      this._stopId(id);
    }
  }

  _startVoice(name, opts, looping) {
    const ctx = this._ctx;
    const graph = buildGraph(ctx, this._noise, name, looping);
    const volumeGain = ctx.createGain();
    volumeGain.gain.value = clamp01(opts.volume == null ? 1 : opts.volume);

    let panner = null;
    const pos = readPos(opts.pos);
    graph.gain.connect(volumeGain);
    if (pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 10;
      panner.maxDistance = 160;
      panner.rolloffFactor = 1;
      setPannerPos(panner, pos);
      volumeGain.connect(panner);
      panner.connect(this._masterGain);
    } else {
      volumeGain.connect(this._masterGain);
    }

    const voice = {
      sources: graph.sources,
      volumeGain,
      panner,
      dest: this._masterGain,
      rate: opts.rate == null ? 1 : Number(opts.rate) || 1,
      stopped: false,
    };
    this._applyRate(voice);

    const t = ctx.currentTime;
    for (const s of graph.sources) {
      try {
        s.node.start(t);
      } catch (_e) { /* уже запущен */ }
    }

    if (!looping) {
      const dur = graph.duration;
      try {
        volumeGain.gain.setValueAtTime(volumeGain.gain.value, t);
        volumeGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      } catch (_e) {
        volumeGain.gain.value = 0;
      }
      setTimeout(() => this._stopVoice(voice), (dur + 0.05) * 1000);
    }
    return voice;
  }

  _applyOpts(voice, patch) {
    if (voice.stopped) return;
    if (patch.volume != null) {
      voice.volumeGain.gain.value = clamp01(patch.volume);
    }
    if (patch.rate != null) {
      voice.rate = Number(patch.rate) || 1;
      this._applyRate(voice);
    }
    const pos = readPos(patch.pos);
    if (pos) {
      if (!voice.panner && this._ctx) {
        try {
          voice.volumeGain.disconnect();
        } catch (_e) { /* нет связи */ }
        const panner = this._ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 10;
        panner.maxDistance = 160;
        panner.rolloffFactor = 1;
        voice.volumeGain.connect(panner);
        panner.connect(voice.dest);
        voice.panner = panner;
      }
      setPannerPos(voice.panner, pos);
    }
  }

  _applyRate(voice) {
    const rate = voice.rate > 0 ? voice.rate : 1;
    for (const s of voice.sources) {
      if (s.kind === 'osc' || s.kind === 'lfo') {
        s.node.frequency.value = s.baseFreq * rate;
      } else if (s.node.playbackRate) {
        s.node.playbackRate.value = rate;
      }
    }
  }

  _stopVoice(voice) {
    if (!voice || voice.stopped) return;
    voice.stopped = true;
    for (const s of voice.sources) {
      try {
        s.node.stop();
      } catch (_e) { /* уже остановлен */ }
      try {
        s.node.disconnect();
      } catch (_e2) { /* нет связи */ }
    }
    try {
      voice.volumeGain.disconnect();
    } catch (_e3) { /* нет связи */ }
    if (voice.panner) {
      try {
        voice.panner.disconnect();
      } catch (_e4) { /* нет связи */ }
    }
  }
}
