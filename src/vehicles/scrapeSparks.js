// ФАЙЛЫ: src/vehicles/scrapeSparks.js
// Искры: удар о тело (crash) и трение борта о стену (vehicle._scrape). Без state.fx модуль молчит.
const SCRAPE_EVERY = 0.05, SPARK_COLOR = 0xffcc66, BODY_HALF_W = 0.9, BODY_Y = 0.45, ALONG = 0.8;
const _pos = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _opts = { pos: _pos, dir: _dir, count: 3, color: SPARK_COLOR };
let acc = 0, phase = 0;

/** Подписка на crash: при impulse > 6 искры в точке удара (или у позиции a). */
export function bindScrapeSparks(engine) {
  engine.on('crash', (ev) => {
    const fx = engine.state && engine.state.fx;
    const impulse = Number(ev && ev.impulse) || 0;
    if (!fx || !(impulse > 6)) return;
    const p = ev.point || (ev.a && ev.a.position) || (ev.b && ev.b.position);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    fx.spawn('sparks', { pos: { x: p.x, y: Number.isFinite(p.y) ? p.y : 0.5, z: p.z },
      dir: { x: 0, y: 1, z: 0 }, count: Math.min(30, Math.round(6 + impulse)), color: SPARK_COLOR });
  });
}

/** Кадр: каждые 0.05 с — 3 искры у борта со стороны стены для машин игрока и копов с _scrape > 0. */
export function updateScrapeSparks(engine, dt) {
  const st = engine && engine.state, fx = st && st.fx, vs = st && st.vehicles;
  if (!fx || !vs) return;
  acc += dt > 0 ? dt : 0;
  if (acc < SCRAPE_EVERY) return;
  acc = acc > 2 * SCRAPE_EVERY ? 0 : acc - SCRAPE_EVERY;
  for (let k = 0; k < vs.length; k++) {
    const v = vs[k];
    if (!v || !v.position || !(v._scrape > 0)) continue;
    if (v.controller !== 'player' && v.controller !== 'police') continue;
    const h = Number.isFinite(v.heading) ? v.heading : 0;
    const sh = Math.sin(h), ch = Math.cos(h);
    const side = wallSide(v, ch, -sh);
    phase = (phase + 1) % 3;
    const along = (phase - 1) * ALONG;
    _pos.x = v.position.x + ch * side * BODY_HALF_W + sh * along;
    _pos.y = BODY_Y;
    _pos.z = v.position.z - sh * side * BODY_HALF_W + ch * along;
    _dir.x = -sh * 0.6 - ch * side * 0.4;
    _dir.y = 0.8;
    _dir.z = -ch * 0.6 + sh * side * 0.4;
    fx.spawn('sparks', _opts);
  }
}

// Сторона борта к стене (+1/-1) по толчку от стены (_bounceVx/_bounceVz из driveSim); нет толчка: +1.
function wallSide(v, sx, sz) {
  const bx = v._bounceVx || 0, bz = v._bounceVz || 0;
  if (bx === 0 && bz === 0) return 1;
  return -(bx * sx + bz * sz) >= 0 ? 1 : -1;
}
