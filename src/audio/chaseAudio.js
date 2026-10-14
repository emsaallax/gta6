// Радио полиции и музыка погони (Web Audio, без импортов). intensity 0..1 = розыск 0..5 звёзд.

// Плавно ведёт параметр к target (setTargetAtTime 0.3 с). При 0 через 2 с ставит точный ноль.
function glide(p, target, t) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.setTargetAtTime(target, t, 0.3);
  if (target === 0) p.setValueAtTime(0, t + 2);
}

export class ChaseAudio {
  constructor(ctx, destination, noiseBuffer) {
    this._ok = false;
    this._v = 0; // intensity
    this._phase = 0; // доля такта
    this._radioT = 3 + Math.random() * 5; // до следующего щелчка радио, с
    try {
      if (!ctx || !destination) return; // нет AudioContext: молчим
      this._ctx = ctx;
      const g = (v, to) => { const n = ctx.createGain(); n.gain.value = v; n.connect(to); return n; };
      const f = (type, hz, to) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = hz; n.connect(to); return n; };
      const o = (type, hz, to) => { const n = ctx.createOscillator(); n.type = type; n.frequency.value = hz; n.connect(to); return n; };
      // музыка: бас saw 55 Гц -> lowpass 400 Гц -> пульс; пэд square 110 Гц
      this._music = g(0, destination);
      this._pulse = g(0.35, this._music);
      const bass = o('sawtooth', 55, f('lowpass', 400, this._pulse));
      const pad = o('square', 110, g(0.25, this._music));
      // радио: шум через bandpass 1800 Гц, тон 1200 затем 900 Гц
      this._radio = g(0, destination);
      this._noiseG = g(0, this._radio);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer || null; noise.loop = true;
      noise.connect(f('bandpass', 1800, this._noiseG));
      this._toneG = g(0, this._radio);
      this._tone = o('sine', 1200, this._toneG);
      this._src = [bass, pad, noise, this._tone];
      this._src.forEach((s) => s.start());
      this._ok = true;
    } catch (e) {
      // нет Web Audio: класс молчит и не падает
    }
  }

  setIntensity(v) {
    if (!this._ok) return;
    this._v = Math.min(1, Math.max(0, +v || 0));
    const t = this._ctx.currentTime;
    glide(this._music.gain, 0.12 * this._v, t); // общий gain музыки
    glide(this._radio.gain, 0.4 * this._v, t); // громкость радио
  }

  update(dt) {
    if (!this._ok) return;
    dt = Math.min(Math.max(+dt || 0, 0), 0.5);
    const t = this._ctx.currentTime;
    // пульс баса: 100 + 60*intensity BPM, счёт здесь, без setInterval
    this._phase += dt * (100 + 60 * this._v) / 60;
    if (this._phase >= 1) {
      this._phase %= 1;
      const p = this._pulse.gain;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(1, t, 0.015);
      p.setTargetAtTime(0.35, t + 0.06, 0.12);
    }
    // радио: раз в 3..8 с, только при intensity > 0.1
    if (this._v > 0.1) {
      this._radioT -= dt;
      if (this._radioT <= 0) {
        this._radioT = 3 + Math.random() * 5;
        this._click(t);
      }
    }
  }

  // щелчок: шум 0.25 с, тоны 1200 и 900 Гц по 0.08 с; узлы уже есть, меняем только параметры
  _click(t) {
    const ng = this._noiseG.gain, tg = this._toneG.gain, tf = this._tone.frequency;
    ng.cancelScheduledValues(t); ng.setValueAtTime(0, t);
    ng.linearRampToValueAtTime(0.8, t + 0.01);
    ng.linearRampToValueAtTime(0, t + 0.25);
    tg.cancelScheduledValues(t); tf.cancelScheduledValues(t); tg.setValueAtTime(0, t);
    [1200, 900].forEach((hz, i) => {
      const a = t + i * 0.08;
      tf.setValueAtTime(hz, a);
      tg.linearRampToValueAtTime(0.2, a + 0.005);
      tg.setValueAtTime(0.2, a + 0.07);
      tg.linearRampToValueAtTime(0, a + 0.08);
    });
  }

  dispose() {
    if (!this._ok) return;
    this._ok = false;
    this._src.forEach((s) => s.stop());
    this._music.disconnect();
    this._radio.disconnect();
  }
}
