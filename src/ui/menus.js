// Старт Palmetto Bay и меню паузы. Владелец state.paused / ui / settings.

const SHADOW_LABELS = [
  { value: 'low', text: 'Низко' },
  { value: 'medium', text: 'Средне' },
  { value: 'high', text: 'Высоко' },
];

const DISTANCE_PRESETS = [
  { value: 400, text: 'Близко' },
  { value: 800, text: 'Норма' },
  { value: 2000, text: 'Далеко' },
];

export class Menus {
  init(engine) {
    this.engine = engine;
    this.ignoreLockLoss = false;
    this.openedPauseFromLock = false;

    engine.state.paused = true;
    engine.state.ui = {
      started: false,
      showControls: false,
      showSettings: false,
    };
    engine.state.settings = {
      shadows: 'medium',
      drawDistance: 800,
    };

    const host = document.getElementById('ui');
    if (!host) return;

    this.injectStyle();
    this.buildStart(host);
    this.buildPause(host);

    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    this.sync();
  }

  injectStyle() {
    if (document.getElementById('g5-menus-style')) return;
    const style = document.createElement('style');
    style.id = 'g5-menus-style';
    style.textContent = `
      #start-screen, #pause-menu {
        position: absolute; inset: 0; z-index: 1000;
        display: flex; align-items: center; justify-content: center;
        pointer-events: auto; font-family: system-ui, sans-serif; color: #fff;
      }
      #start-screen { background: linear-gradient(180deg, #071018 0%, #163445 45%, #c45a3a 100%); }
      #pause-menu { background: rgba(4, 10, 16, 0.72); }
      .g5-card {
        min-width: 280px; max-width: 420px; padding: 28px 32px;
        background: rgba(8, 16, 22, 0.82); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px; text-align: center; box-shadow: 0 18px 50px rgba(0,0,0,0.45);
      }
      .g5-title { font-size: 42px; margin: 0 0 8px; letter-spacing: 0.04em; }
      .g5-sub { margin: 0 0 28px; opacity: 0.8; font-size: 15px; }
      .g5-btn {
        display: block; width: 100%; margin: 8px 0; padding: 12px 16px;
        border: 0; border-radius: 10px; cursor: pointer;
        background: #2aa7c9; color: #062028; font-size: 16px; font-weight: 650;
      }
      .g5-btn.secondary { background: rgba(255,255,255,0.12); color: #fff; font-weight: 500; }
      .g5-btn:hover { filter: brightness(1.08); }
      .g5-help { text-align: left; line-height: 1.7; font-size: 15px; margin: 12px 0 18px; }
      .g5-row { display: flex; gap: 8px; margin: 8px 0 16px; }
      .g5-row button { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2);
        background: transparent; color: #fff; cursor: pointer; }
      .g5-row button.on { background: #2aa7c9; color: #062028; border-color: transparent; }
      .g5-label { text-align: left; font-size: 13px; opacity: 0.85; margin-top: 8px; }
    `;
    document.head.appendChild(style);
  }

  buildStart(host) {
    this.start = document.createElement('div');
    this.start.id = 'start-screen';
    this.start.innerHTML = `
      <div class="g5-card">
        <h1 class="g5-title">Palmetto Bay</h1>
        <p class="g5-sub">Побережье Costa Verde</p>
        <button type="button" class="g5-btn" id="g5-play">Играть</button>
      </div>
    `;
    host.appendChild(this.start);
    this.start.querySelector('#g5-play').addEventListener('click', () => this.play());
  }

  buildPause(host) {
    this.pause = document.createElement('div');
    this.pause.id = 'pause-menu';
    this.pause.innerHTML = `
      <div class="g5-card">
        <div id="g5-pause-main">
          <h1 class="g5-title" style="font-size:28px">Пауза</h1>
          <button type="button" class="g5-btn" data-act="resume">Продолжить</button>
          <button type="button" class="g5-btn secondary" data-act="controls">Управление</button>
          <button type="button" class="g5-btn secondary" data-act="settings">Настройки</button>
        </div>
        <div id="g5-pause-controls" hidden>
          <h1 class="g5-title" style="font-size:24px">Управление</h1>
          <div class="g5-help">
            WASD — ходьба / машина<br>
            Shift — бег<br>
            Мышь — камера<br>
            F — сесть / выйти<br>
            Esc — пауза
          </div>
          <button type="button" class="g5-btn secondary" data-act="back">Назад</button>
        </div>
        <div id="g5-pause-settings" hidden>
          <h1 class="g5-title" style="font-size:24px">Настройки</h1>
          <div class="g5-label">Качество теней</div>
          <div class="g5-row" id="g5-shadows"></div>
          <div class="g5-label">Дальность</div>
          <div class="g5-row" id="g5-distance"></div>
          <button type="button" class="g5-btn secondary" data-act="back">Назад</button>
        </div>
      </div>
    `;
    host.appendChild(this.pause);

    this.mainPanel = this.pause.querySelector('#g5-pause-main');
    this.controlsPanel = this.pause.querySelector('#g5-pause-controls');
    this.settingsPanel = this.pause.querySelector('#g5-pause-settings');

    this.pause.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-act]');
      const act = btn?.getAttribute?.('data-act');
      if (act === 'resume') this.resume();
      if (act === 'controls') {
        this.engine.state.ui.showControls = true;
        this.engine.state.ui.showSettings = false;
        this.sync();
      }
      if (act === 'settings') {
        this.engine.state.ui.showSettings = true;
        this.engine.state.ui.showControls = false;
        this.sync();
      }
      if (act === 'back') {
        this.engine.state.ui.showControls = false;
        this.engine.state.ui.showSettings = false;
        this.sync();
      }
    });

    const shadowRow = this.pause.querySelector('#g5-shadows');
    for (const opt of SHADOW_LABELS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.text;
      b.dataset.shadows = opt.value;
      b.addEventListener('click', () => {
        this.engine.state.settings.shadows = opt.value;
        this.sync();
      });
      shadowRow.appendChild(b);
    }

    const distRow = this.pause.querySelector('#g5-distance');
    for (const opt of DISTANCE_PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.text;
      b.dataset.distance = String(opt.value);
      b.addEventListener('click', () => {
        this.engine.state.settings.drawDistance = Math.max(400, Math.min(2000, opt.value));
        this.sync();
      });
      distRow.appendChild(b);
    }
  }

  onPointerLockChange() {
    const state = this.engine.state;
    const locked = !!document.pointerLockElement;

    if (locked) {
      if (state.ui?.started && state.paused) {
        state.paused = false;
        state.ui.showControls = false;
        state.ui.showSettings = false;
        this.sync();
      }
      return;
    }

    if (this.ignoreLockLoss === true) {
      this.ignoreLockLoss = false;
      return;
    }

    if (state.ui?.started === true && state.paused !== true) {
      state.paused = true;
      this.openedPauseFromLock = true;
      this.sync();
    }
  }

  play() {
    const ui = this.engine.state.ui;
    ui.started = true;
    ui.showControls = false;
    ui.showSettings = false;
    this.engine.state.paused = false;
    this.sync();
    this.lockPointer();
  }

  resume() {
    const ui = this.engine.state.ui;
    ui.showControls = false;
    ui.showSettings = false;
    this.engine.state.paused = false;
    this.sync();
    this.lockPointer();
  }

  lockPointer() {
    const el = this.engine.renderer?.domElement;
    if (!el || typeof el.requestPointerLock !== 'function') return;
    try {
      const result = el.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_err) {
      // headless / отказ браузера — игра идёт без захвата курсора
    }
  }

  update(_dt, engine) {
    this.engine = engine;
    const state = engine.state;
    const escapeDown = engine.input?.pressed?.('Escape') === true;

    // Если Esc в этом кадре не нажат — флаг не должен висеть до следующего нажатия.
    if (!escapeDown) {
      this.openedPauseFromLock = false;
    } else if (state.ui?.started === false) {
      // стартовый экран: Esc ничего не делает
    } else if (this.openedPauseFromLock) {
      this.openedPauseFromLock = false;
    } else if (state.ui?.showControls || state.ui?.showSettings) {
      state.ui.showControls = false;
      state.ui.showSettings = false;
    } else if (state.paused !== true) {
      state.paused = true;
      if (state.ui) {
        state.ui.showControls = false;
        state.ui.showSettings = false;
      }
      // lock уже снят браузером; exitPointerLock не звать
    } else {
      this.resume();
    }

    this.sync();
  }

  sync() {
    if (!this.start || !this.pause) return;
    const ui = this.engine.state.ui || {};
    const paused = this.engine.state.paused === true;
    const started = ui.started === true;

    this.start.style.display = started ? 'none' : 'flex';
    this.pause.style.display = started && paused ? 'flex' : 'none';

    const nested = ui.showControls || ui.showSettings;
    this.mainPanel.hidden = !!nested;
    this.controlsPanel.hidden = !ui.showControls;
    this.settingsPanel.hidden = !ui.showSettings;

    const shadows = this.engine.state.settings?.shadows;
    for (const b of this.pause.querySelectorAll('#g5-shadows button')) {
      b.classList.toggle('on', b.dataset.shadows === shadows);
    }
    const dist = this.engine.state.settings?.drawDistance;
    for (const b of this.pause.querySelectorAll('#g5-distance button')) {
      b.classList.toggle('on', Number(b.dataset.distance) === dist);
    }
  }
}
