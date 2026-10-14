// ФАЙЛЫ: src/ui/timeSwitch.js, src/ui/weatherHud.js
// Переключатель времени суток и громкости в меню паузы.

export const TIME_DAY = 12;
export const TIME_DUSK = 18;
export const TIME_NIGHT = 22;

export function clampHour(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 24) return 12;
  return n;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export class TimeSwitch {
  init(engine) {
    this.engine = engine;
    this.root = null;
    this.slider = null;
    this.volume = null;
    this._syncing = false;

    const main = document.getElementById('g5-pause-main');
    if (!main) return;

    this.root = document.createElement('div');
    this.root.id = 'g5-time-switch';
    this.root.style.cssText = [
      'pointer-events:auto',
      'margin:16px 0 8px',
      'text-align:left',
      'font-family:system-ui,sans-serif',
      'color:#fff',
    ].join(';');

    this.root.innerHTML = `
      <div style="font-size:13px;opacity:.85;margin-bottom:8px">Время суток</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button type="button" class="g5-btn secondary" data-time="${TIME_DAY}" style="flex:1;margin:0;padding:8px 10px;font-size:14px">День</button>
        <button type="button" class="g5-btn secondary" data-time="${TIME_DUSK}" style="flex:1;margin:0;padding:8px 10px;font-size:14px">Закат</button>
        <button type="button" class="g5-btn secondary" data-time="${TIME_NIGHT}" style="flex:1;margin:0;padding:8px 10px;font-size:14px">Ночь</button>
      </div>
      <label style="display:block;font-size:13px;opacity:.85;margin-bottom:4px">Час
        <input id="g5-time-slider" type="range" min="0" max="24" step="0.1" value="12"
          style="display:block;width:100%;margin-top:4px">
      </label>
      <label style="display:block;font-size:13px;opacity:.85;margin-top:10px">Громкость
        <input id="g5-volume" type="range" min="0" max="1" step="0.05" value="1"
          style="display:block;width:100%;margin-top:4px">
      </label>
    `;
    main.appendChild(this.root);

    this.slider = this.root.querySelector('#g5-time-slider');
    this.volume = this.root.querySelector('#g5-volume');

    this.root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-time]');
      if (!btn) return;
      engine.state.time = clampHour(btn.getAttribute('data-time'));
      this.pullSlider(engine);
    });

    this.slider.addEventListener('input', () => {
      if (this._syncing) return;
      engine.state.time = clampHour(this.slider.value);
    });

    this.volume.addEventListener('input', () => {
      if (this._syncing) return;
      const audio = engine.state.audio;
      if (!audio) return;
      audio.master = clamp01(this.volume.value);
    });

    this.pullSlider(engine);
    this.pullVolume(engine);
  }

  pullSlider(engine) {
    if (!this.slider) return;
    const t = clampHour(engine.state.time);
    this._syncing = true;
    this.slider.value = String(t);
    this._syncing = false;
  }

  pullVolume(engine) {
    if (!this.volume) return;
    const audio = engine.state.audio;
    if (!audio) return;
    this._syncing = true;
    this.volume.value = String(clamp01(audio.master));
    this._syncing = false;
  }

  update(_dt, engine) {
    if (!this.root) return;
    this.pullSlider(engine);
    this.pullVolume(engine);
  }
}
