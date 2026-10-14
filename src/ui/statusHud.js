// Часы, здоровье, скорость, подсказка «F — сесть». Меню и карту не трогаем.

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatClock(time) {
  const t = Number.isFinite(time) ? time : 12;
  const hours = Math.floor(t) % 24;
  const minutes = Math.floor((t % 1) * 60);
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function healthColor(h) {
  if (h > 40) return '#3dcc6a';
  if (h >= 20) return '#e6c84a';
  return '#e24b4b';
}

function xzDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export class StatusHud {
  init(engine) {
    this._pausedApplied = false;
    const host = document.getElementById('ui');
    if (!host) return;

    this.root = document.createElement('div');
    this.root.id = 'status-hud';
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'z-index:20',
      'font-family:system-ui,sans-serif',
      'color:#fff',
      'text-shadow:0 1px 3px rgba(0,0,0,0.85)',
    ].join(';');

    this.root.innerHTML = `
      <div id="hud-health" style="position:absolute;top:16px;left:16px;min-width:160px">
        <div style="font-size:12px;letter-spacing:.04em;opacity:.9;margin-bottom:4px">Здоровье <span id="hud-health-num">100</span></div>
        <div style="width:160px;height:10px;background:rgba(0,0,0,.35);border-radius:6px;overflow:hidden">
          <div id="hud-health-bar" style="height:100%;width:100%;background:#3dcc6a"></div>
        </div>
      </div>
      <div id="hud-clock" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:.08em">12:00</div>
      <div id="hud-speed" style="position:absolute;right:16px;bottom:16px;font-size:28px;font-variant-numeric:tabular-nums;display:none">0 км/ч</div>
      <div id="hud-prompt" style="position:absolute;left:50%;bottom:28px;transform:translateX(-50%);font-size:16px;display:none">F — сесть</div>
    `;
    host.appendChild(this.root);

    this.clock = this.root.querySelector('#hud-clock');
    this.healthNum = this.root.querySelector('#hud-health-num');
    this.healthBar = this.root.querySelector('#hud-health-bar');
    this.speed = this.root.querySelector('#hud-speed');
    this.prompt = this.root.querySelector('#hud-prompt');
    this.update(0, engine);
  }

  update(_dt, engine) {
    if (!this.root) return;

    const started = engine.state.ui?.started;
    this.root.style.display = started === false ? 'none' : '';
    if (started === false) {
      this._pausedApplied = false;
      return;
    }

    const paused = engine.state.paused === true;
    if (paused) {
      if (this._pausedApplied) return;
      this._pausedApplied = true;
    } else {
      this._pausedApplied = false;
    }

    const time = Number.isFinite(engine.state.time) ? engine.state.time : 12;
    this.clock.textContent = formatClock(time);

    const healthRaw = engine.state.player?.health;
    const health = Number.isFinite(healthRaw) ? healthRaw : 100;
    const clamped = Math.max(0, Math.min(100, health));
    this.healthNum.textContent = String(Math.round(clamped));
    this.healthBar.style.width = `${clamped}%`;
    this.healthBar.style.background = healthColor(clamped);

    const vehicle = engine.state.player?.inVehicle;
    if (vehicle != null) {
      const speedMps = Math.abs(vehicle.speed ?? 0);
      this.speed.style.display = '';
      this.speed.textContent = `${Math.round(speedMps * 3.6)} км/ч`;
    } else {
      this.speed.style.display = 'none';
    }

    const player = engine.state.player;
    const cars = Array.isArray(engine.state.vehicles) ? engine.state.vehicles : [];
    let showPrompt = false;
    if (player && player.inVehicle == null && player.position && cars.length) {
      for (const car of cars) {
        if (!car?.position) continue;
        if (xzDist(car.position, player.position) < 3) {
          showPrompt = true;
          break;
        }
      }
    }
    this.prompt.style.display = showPrompt ? '' : 'none';
    if (showPrompt) this.prompt.textContent = 'F — сесть';
  }
}
