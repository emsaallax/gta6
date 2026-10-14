// Круглая миникарта слева снизу. Только читает state, ничего не пишет.
const CSS_SIZE = 180;
const RADIUS_METERS = 80;
const PAUSE_DRAW_INTERVAL = 0.5;

function mapCenter(state) {
  const p = state.player?.position;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    return { x: p.x, z: p.z };
  }
  const t = state.cameraTarget?.position;
  if (t && Number.isFinite(t.x) && Number.isFinite(t.z)) {
    return { x: t.x, z: t.z };
  }
  return { x: 0, z: 0 };
}

function hasPlayerPosition(state) {
  const p = state.player?.position;
  return !!(p && Number.isFinite(p.x) && Number.isFinite(p.z));
}

export class Minimap {
  init(engine) {
    const host = document.getElementById('ui');
    if (!host) return;

    this.pauseAccum = 0;

    this.root = document.createElement('div');
    this.root.id = 'minimap';
    this.root.style.cssText = [
      'position:absolute',
      'left:16px',
      'bottom:16px',
      `width:${CSS_SIZE}px`,
      `height:${CSS_SIZE}px`,
      'border-radius:50%',
      'overflow:hidden',
      'pointer-events:none',
      'z-index:10',
      'border:3px solid rgba(8,16,14,0.72)',
      'box-shadow:0 0 0 1px rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.35)',
      'background:#16382f',
    ].join(';');

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;';
    this.root.appendChild(this.canvas);
    host.appendChild(this.root);

    this.ctx = this.canvas.getContext('2d');
    this.resize();
    this.draw(engine);
    this.applyVisibility(engine);
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(CSS_SIZE * dpr);
    this.canvas.height = Math.round(CSS_SIZE * dpr);
    this.dpr = dpr;
  }

  applyVisibility(engine) {
    if (!this.root) return;
    const started = engine.state.ui?.started;
    this.root.style.display = started === false ? 'none' : '';
  }

  update(dt, engine) {
    if (!this.root) return;
    this.applyVisibility(engine);
    if (engine.state.ui?.started === false) return;

    const paused = engine.state.paused === true;
    if (paused) {
      this.pauseAccum += dt || 0;
      if (this.pauseAccum < PAUSE_DRAW_INTERVAL) return;
      this.pauseAccum = 0;
    } else {
      this.pauseAccum = 0;
    }

    this.draw(engine);
  }

  draw(engine) {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const canvasRadiusPx = Math.min(cx, cy);
    const scale = canvasRadiusPx / RADIUS_METERS;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, canvasRadiusPx, 0, Math.PI * 2);
    ctx.clip();

    // Земля: тёмно-бирюзовая, не чёрный квадрат.
    ctx.fillStyle = '#1a4a44';
    ctx.fillRect(0, 0, w, h);

    const pos = mapCenter(engine.state);
    const px = pos.x;
    const pz = pos.z;
    const cam = engine.camera?.position;
    const angle = cam
      ? Math.atan2(cam.x - px, cam.z - pz)
      : 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle);

    const roads = engine.state.city?.roads || [];
    ctx.strokeStyle = '#8d918e';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of roads) {
      if (!road) continue;
      const width = road.width > 0 ? road.width : 8;
      ctx.lineWidth = width * scale;
      ctx.beginPath();
      ctx.moveTo((road.x1 - px) * scale, (road.z1 - pz) * scale);
      ctx.lineTo((road.x2 - px) * scale, (road.z2 - pz) * scale);
      ctx.stroke();
    }

    const vehicles = Array.isArray(engine.state.vehicles) ? engine.state.vehicles : [];
    const riding = engine.state.player?.inVehicle;
    const dpr = this.dpr || 1;
    ctx.fillStyle = '#ffd24a';
    for (const car of vehicles) {
      if (!car || car === riding) continue;
      if (car.type === 'police' || car.controller === 'police') continue;
      const cp = car.position;
      if (!cp) continue;
      ctx.beginPath();
      ctx.arc((cp.x - px) * scale, (cp.z - pz) * scale, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ff3b3b';
    for (const car of vehicles) {
      if (!car || car === riding) continue;
      if (car.type !== 'police' && car.controller !== 'police') continue;
      const cp = car.position;
      if (!cp) continue;
      const dx = cp.x - px;
      const dz = cp.z - pz;
      if (Math.hypot(dx, dz) > RADIUS_METERS) continue;
      ctx.beginPath();
      ctx.arc(dx * scale, dz * scale, 3.8 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    const peds = engine.state.npcs?.list;
    if (Array.isArray(peds)) {
      ctx.fillStyle = '#3a7cff';
      for (const ped of peds) {
        if (!ped || ped.kind !== 'cop') continue;
        const pp = ped.position;
        if (!pp) continue;
        const dx = pp.x - px;
        const dz = pp.z - pz;
        if (Math.hypot(dx, dz) > RADIUS_METERS) continue;
        ctx.beginPath();
        ctx.arc(dx * scale, dz * scale, 3.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const target = engine.state.mission?.target;
    if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
      let dx = target.x - px;
      let dz = target.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > RADIUS_METERS && dist > 0) {
        const k = RADIUS_METERS / dist;
        dx *= k;
        dz *= k;
      }
      ctx.fillStyle = '#ff2fa0';
      ctx.strokeStyle = '#fff4fb';
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      ctx.arc(dx * scale, dz * scale, 5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (hasPlayerPosition(engine.state)) {
      const s = 7 * dpr;
      ctx.fillStyle = '#d7f4ff';
      ctx.strokeStyle = '#0b1c22';
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.4);
      ctx.lineTo(cx + s, cy + s);
      ctx.lineTo(cx, cy + s * 0.4);
      ctx.lineTo(cx - s, cy + s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
