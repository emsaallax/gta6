// HUD волны 2: розыск, оружие, миссия, тосты, качество, подсказка E.

const QUALITY_OPTS = [
  { value: 'low', text: 'Низко' },
  { value: 'medium', text: 'Средне' },
  { value: 'high', text: 'Высоко' },
];

function formatMissionTime(sec) {
  const t = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function xzDist(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dz = (a?.z ?? 0) - (b?.z ?? 0);
  return Math.hypot(dx, dz);
}

export class GameHud {
  init(engine) {
    this.engine = engine;
    this.toasts = [];
    this.toastSeq = 0;
    this.endBannerUntil = 0;
    this.endBannerText = '';
    this.lastMissionStatus = null;

    this.ensureQuality(engine);

    engine.on('notify', (data) => this.onNotify(data));

    const host = document.getElementById('ui');
    if (!host) return;

    this.root = document.createElement('div');
    this.root.id = 'g5-game-hud';
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'z-index:25',
      'font-family:system-ui,sans-serif',
      'color:#fff',
      'text-shadow:0 1px 3px rgba(0,0,0,0.85)',
    ].join(';');

    this.root.innerHTML = `
      <div id="g5-wanted" style="position:absolute;top:16px;right:16px;display:flex;gap:4px;font-size:22px"></div>
      <div id="g5-weapon" style="position:absolute;left:210px;bottom:16px;font-size:16px;display:none"></div>
      <div id="g5-mission" style="position:absolute;top:52px;left:50%;transform:translateX(-50%);text-align:center;font-size:15px;display:none"></div>
      <div id="g5-toasts" style="position:absolute;top:56px;right:16px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:280px"></div>
      <div id="g5-e-prompt" style="position:absolute;left:50%;bottom:56px;transform:translateX(-50%);font-size:16px;display:none">E — начать миссию</div>
    `;
    host.appendChild(this.root);

    this.wantedEl = this.root.querySelector('#g5-wanted');
    this.weaponEl = this.root.querySelector('#g5-weapon');
    this.missionEl = this.root.querySelector('#g5-mission');
    this.toastsEl = this.root.querySelector('#g5-toasts');
    this.promptEl = this.root.querySelector('#g5-e-prompt');

    this.buildStars();
    this.mountQuality(host);
    this.syncQualityButtons();
    this.update(0, engine);
  }

  ensureQuality(engine) {
    const settings = engine.state.settings;
    if (!settings || typeof settings !== 'object') return;
    if (settings.quality !== 'low' && settings.quality !== 'medium' && settings.quality !== 'high') {
      settings.quality = 'high';
    }
  }

  buildStars() {
    this.starEls = [];
    this.wantedEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.style.color = 'rgba(255,255,255,0.22)';
      this.wantedEl.appendChild(s);
      this.starEls.push(s);
    }
  }

  mountQuality(host) {
    const panel = document.getElementById('g5-pause-settings');
    const row = document.createElement('div');
    row.id = 'g5-quality-row';
    row.style.cssText = 'display:flex;gap:8px;margin:8px 0 16px;pointer-events:auto';

    const label = document.createElement('div');
    label.className = 'g5-label';
    label.textContent = 'Качество';
    label.style.pointerEvents = 'none';

    this.qualityBtns = [];
    for (const opt of QUALITY_OPTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.text;
      b.dataset.quality = opt.value;
      b.style.cssText = [
        'flex:1',
        'padding:8px',
        'border-radius:8px',
        'border:1px solid rgba(255,255,255,0.2)',
        'background:transparent',
        'color:#fff',
        'cursor:pointer',
        'pointer-events:auto',
      ].join(';');
      b.addEventListener('click', () => {
        const st = this.engine.state.settings;
        if (!st || typeof st !== 'object') return;
        st.quality = opt.value;
        this.syncQualityButtons();
      });
      row.appendChild(b);
      this.qualityBtns.push(b);
    }

    if (panel) {
      const back = panel.querySelector('[data-act="back"]');
      panel.insertBefore(label, back || null);
      panel.insertBefore(row, back || null);
    } else {
      const box = document.createElement('div');
      box.id = 'g5-quality-fallback';
      box.style.cssText = 'position:absolute;right:16px;bottom:72px;pointer-events:none;z-index:30';
      box.appendChild(label);
      box.appendChild(row);
      host.appendChild(box);
      this.qualityFallback = box;
    }
  }

  syncQualityButtons() {
    const q = this.engine.state.settings?.quality;
    for (const b of this.qualityBtns || []) {
      const on = b.dataset.quality === q;
      b.style.background = on ? '#2aa7c9' : 'transparent';
      b.style.color = on ? '#062028' : '#fff';
      b.style.borderColor = on ? 'transparent' : 'rgba(255,255,255,0.2)';
    }
  }

  onNotify(data) {
    const text = data?.text;
    if (!text) return;
    const ms = Number.isFinite(data.ms) ? data.ms : 2500;
    const id = ++this.toastSeq;
    this.toasts.push({ id, text, until: performance.now() + ms });
    this.renderToasts();
  }

  renderToasts() {
    if (!this.toastsEl) return;
    this.toastsEl.innerHTML = '';
    for (const t of this.toasts) {
      const el = document.createElement('div');
      el.textContent = t.text;
      el.style.cssText = [
        'background:rgba(8,16,22,0.82)',
        'border:1px solid rgba(255,255,255,0.12)',
        'border-radius:8px',
        'padding:8px 12px',
        'font-size:14px',
        'pointer-events:none',
      ].join(';');
      this.toastsEl.appendChild(el);
    }
  }

  update(_dt, engine) {
    this.ensureQuality(engine);
    if (!this.root) return;

    const started = engine.state.ui?.started;
    this.root.style.display = started === false ? 'none' : '';
    if (this.qualityFallback) {
      this.qualityFallback.style.display = started === false ? 'none' : '';
    }
    if (started === false) return;

    const now = performance.now();
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.until > now);
    if (this.toasts.length !== before) this.renderToasts();

    const level = engine.state.wanted?.level;
    const filled = Math.max(0, Math.min(5, Number.isFinite(level) ? level : 0));
    for (let i = 0; i < 5; i++) {
      this.starEls[i].style.color = i < filled ? '#f5d76e' : 'rgba(255,255,255,0.22)';
    }

    const player = engine.state.player;
    if (!player) {
      this.weaponEl.style.display = 'none';
    } else {
      const weapon = player.weapon;
      let label = '';
      if (weapon === 'fist') label = 'Кулаки';
      else if (weapon === 'pistol') label = `Пистолет  ${player.ammo ?? 0}`;
      if (label) {
        this.weaponEl.textContent = label;
        this.weaponEl.style.display = '';
      } else {
        this.weaponEl.style.display = 'none';
      }
    }

    const mission = engine.state.mission;
    const status = mission?.status;
    if (status === 'active') {
      const title = mission.title || '';
      const time = formatMissionTime(mission.timeLeft);
      this.missionEl.textContent = title ? `${title}  ${time}` : time;
      this.missionEl.style.display = '';
      this.endBannerUntil = 0;
    } else if (status === 'success' || status === 'fail') {
      if (this.lastMissionStatus !== status) {
        this.endBannerText = status === 'success' ? 'Успех' : 'Провал';
        this.endBannerUntil = now + 2500;
      }
      if (now < this.endBannerUntil) {
        this.missionEl.textContent = this.endBannerText;
        this.missionEl.style.display = '';
      } else {
        this.missionEl.style.display = 'none';
      }
    } else {
      this.missionEl.style.display = 'none';
    }
    this.lastMissionStatus = status;

    const target = mission?.target;
    const near =
      status === 'idle' &&
      player?.position &&
      target &&
      xzDist(player.position, target) <= 10;
    this.promptEl.style.display = near ? '' : 'none';

    this.syncQualityButtons();
  }
}
