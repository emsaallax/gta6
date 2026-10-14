export const PERF_DEFAULTS = {
  maxPixelRatio: 1.5,
};

/**
 * Раньше ставил pixelRatio. Теперь качество — applyPixelRatio в composer.js.
 * Оставлено, чтобы старый вызов из PerfSystem.init не ломался.
 * НЕ трогать: camera.far, fog, state.settings, state.time, shadowMap.
 */
export function applyPerfDefaults(engine, opts = PERF_DEFAULTS) {
  void engine;
  void opts;
}

/**
 * Пройти scene: у объектов с frustumCulled !== false выставить frustumCulled = true.
 * Не ставь mesh.visible = false у чужих объектов (город/машины пропадут насовсем).
 * InstancedMesh тоже оставляй frustumCulled = true.
 */
export function enableFrustumCulling(root) {
  if (!root || !root.traverse) return;
  root.traverse((obj) => {
    if (obj.frustumCulled !== false) {
      obj.frustumCulled = true;
    }
  });
}

export class PerfSystem {
  init(engine) {
    applyPerfDefaults(engine);
    enableFrustumCulling(engine.scene);

    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:9999;padding:4px 8px;' +
      'font:14px/1.2 monospace;color:#fff;background:rgba(0,0,0,0.55);' +
      'pointer-events:none;display:none';
    el.textContent = '0 FPS';
    document.body.appendChild(el);
    this.overlay = el;

    engine.state.perf = {
      fps: 0,
      showFps: false,
      maxPixelRatio: PERF_DEFAULTS.maxPixelRatio,
    };

    this._lastElapsed = null;
    this._fpsTime = 0;
    this._fpsFrames = 0;
    this._cullTime = 0;
    this._f3Lock = false;
  }

  update(dt, engine) {
    const perf = engine.state.perf;
    if (!perf) return;

    const pressed = engine.input.pressed('F3');
    if (pressed && !this._f3Lock) {
      this._f3Lock = true;
      perf.showFps = !perf.showFps;
      this.overlay.style.display = perf.showFps ? 'block' : 'none';
    }
    if (!pressed) this._f3Lock = false;

    // FPS по кадрам экрана: за один кадр update может вызваться несколько раз (фиксированный шаг).
    const elapsed = engine.clock?.elapsedTime;
    if (elapsed != null && elapsed !== this._lastElapsed) {
      const frameDt = this._lastElapsed == null ? 0 : elapsed - this._lastElapsed;
      this._lastElapsed = elapsed;
      if (frameDt > 0) {
        this._fpsTime += frameDt;
        this._fpsFrames += 1;
        this._cullTime += frameDt;
      }
    }

    if (this._fpsTime >= 0.5) {
      perf.fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsTime = 0;
      this._fpsFrames = 0;
      if (perf.showFps) {
        this.overlay.textContent = `${perf.fps} FPS`;
      }
    }

    if (this._cullTime >= 1) {
      this._cullTime = 0;
      enableFrustumCulling(engine.scene);
    }
  }
}
