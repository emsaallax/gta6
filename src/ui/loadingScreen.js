// Экран загрузки: прогресс state.assets. Не пишет state, не шлёт события.
// ФАЙЛЫ: src/ui/loadingScreen.js

const HIDE_AFTER_SEC = 15;

export class LoadingScreen {
  init(engine) {
    this.engine = engine;
    this.elapsed = 0;
    this.hidden = false;
    this.root = null;
    this.barFill = null;
    this.rafId = 0;
    this.lastFrameMs = 0;

    const host = document.getElementById('ui');
    if (!host) return;

    this.injectStyle();

    const overlay = document.createElement('div');
    overlay.id = 'g5-loading';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="g5-loading-inner">
        <div class="g5-loading-track">
          <div class="g5-loading-fill"></div>
        </div>
      </div>
    `;
    host.appendChild(overlay);
    this.root = overlay;
    this.barFill = overlay.querySelector('.g5-loading-fill');
    this.applyProgress(this.readProgress(engine));

    this.lastFrameMs = performance.now();
    const tick = (now) => {
      this.rafId = 0;
      if (this.hidden) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.lastFrameMs) / 1000));
      this.lastFrameMs = now;
      this.tick(dt, this.engine);
      if (!this.hidden) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  injectStyle() {
    if (document.getElementById('g5-loading-style')) return;
    const style = document.createElement('style');
    style.id = 'g5-loading-style';
    style.textContent = `
      #g5-loading {
        position: absolute; inset: 0; z-index: 2000;
        display: flex; align-items: center; justify-content: center;
        pointer-events: auto;
        background: #071018;
        font-family: system-ui, sans-serif;
      }
      #g5-loading .g5-loading-inner {
        min-width: 280px; max-width: 420px; width: 70%;
        text-align: center;
      }
      #g5-loading .g5-loading-track {
        height: 8px; border-radius: 8px;
        background: rgba(255,255,255,0.16);
        overflow: hidden;
      }
      #g5-loading .g5-loading-fill {
        height: 100%; width: 0%;
        background: #2aa7c9;
      }
    `;
    document.head.appendChild(style);
  }

  readAssets(engine) {
    const state = engine && engine.state;
    return state && state.assets ? state.assets : null;
  }

  readProgress(engine) {
    const assets = this.readAssets(engine);
    if (!assets || typeof assets.progress !== 'number' || Number.isNaN(assets.progress)) {
      return 0;
    }
    const p = assets.progress;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  readReady(engine) {
    const assets = this.readAssets(engine);
    return !!(assets && assets.ready === true);
  }

  applyProgress(progress) {
    if (!this.barFill) return;
    this.barFill.style.width = `${progress * 100}%`;
  }

  tick(dt, engine) {
    if (this.hidden || !this.root) return;
    const step = typeof dt === 'number' && !Number.isNaN(dt) ? dt : 0;
    this.elapsed += step;
    this.applyProgress(this.readProgress(engine));
    if (this.readReady(engine) || this.elapsed >= HIDE_AFTER_SEC) {
      this.hide();
    }
  }

  hide() {
    if (this.hidden) return;
    this.hidden = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.root) this.root.style.display = 'none';
  }

  update(dt, engine) {
    this.tick(dt, engine);
  }
}
