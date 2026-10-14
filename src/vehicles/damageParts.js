// Повреждения машины по CONTRACTS §12: vehicle.damage (0..1) и vehicle.parts.
// Отлёт бампера, капота и колеса уходит в общий state.fx как 'debris'. Своих пулов нет.

const HEALTH_MAX = 1000;
const WHEEL_KEYS = ['fl', 'fr', 'rl', 'rr'];
const NOSE_OFFSET = 2; // м от центра машины до носа; вперёд = (sin h, cos h), как в driveSim
const PAINT_DEFAULT = 0x888888;
const WHEEL_COLOR = 0x111111;
const DIR_UP = 0.6;
const wheelAt = { x: 0, y: 0, z: 0 }; // общий буфер мировой позиции колеса, без аллокаций

function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function healthDamage(vehicle) {
  return clamp01(1 - num(vehicle.health, HEALTH_MAX) / HEALTH_MAX);
}

function ensureParts(vehicle) {
  if (!vehicle.parts) {
    vehicle.parts = { bumper: true, hood: true, wheels: { fl: true, fr: true, rl: true, rr: true } };
  } else if (!vehicle.parts.wheels) {
    vehicle.parts.wheels = { fl: true, fr: true, rl: true, rr: true };
  }
  return vehicle.parts;
}

function centerOf(vehicle) {
  const p = vehicle.position || (vehicle.object3d && vehicle.object3d.position);
  const ok = !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
  return { x: ok ? p.x : 0, z: ok ? p.z : 0, ok };
}

// Мировая позиция колеса из matrixWorld. Если матриц нет, берём центр машины.
function wheelWorld(w, c) {
  if (typeof w.updateWorldMatrix === 'function') w.updateWorldMatrix(true, false);
  const e = w.matrixWorld && w.matrixWorld.elements;
  wheelAt.x = e ? e[12] : c.x;
  wheelAt.y = e ? e[13] : 0.4;
  wheelAt.z = e ? e[14] : c.z;
  return wheelAt;
}

// Горизонталь (ox, oz) нормируется, y = 0.6. Нулевая длина даёт только подъём вверх.
function dirTo(ox, oz) {
  const len = Math.hypot(ox, oz);
  const k = len > 1e-6 ? 1 / len : 0;
  return { x: ox * k, y: DIR_UP, z: oz * k };
}

export function syncDamage(vehicle) {
  if (!vehicle) return;
  vehicle.damage = healthDamage(vehicle);
  ensureParts(vehicle);
}

function detachNearestWheel(fx, vehicle, parts, c, px, py, pz) {
  const wheels = vehicle.wheels;
  if (!wheels) return;
  let best = null;
  let bestD = Infinity;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const key of WHEEL_KEYS) {
    const w = wheels[key];
    if (!w || parts.wheels[key] === false) continue;
    const at = wheelWorld(w, c);
    const d = (at.x - px) ** 2 + (at.y - py) ** 2 + (at.z - pz) ** 2;
    if (d < bestD) {
      best = key;
      bestD = d;
      bx = at.x;
      by = at.y;
      bz = at.z;
    }
  }
  if (!best) return;
  wheels[best].visible = false;
  parts.wheels[best] = false;
  fx.spawn('debris', { pos: { x: bx, y: by, z: bz }, dir: dirTo(bx - c.x, bz - c.z), count: 3, color: WHEEL_COLOR });
}

export function crashParts(engine, vehicle, impulse, point) {
  const fx = engine && engine.state && engine.state.fx;
  if (!vehicle || !fx || typeof fx.spawn !== 'function') return;
  const parts = ensureParts(vehicle);
  const imp = num(impulse, 0);
  const damage = Number.isFinite(vehicle.damage) ? vehicle.damage : healthDamage(vehicle);
  const color = Number.isFinite(vehicle.paint) ? vehicle.paint : PAINT_DEFAULT;
  const c = centerOf(vehicle);
  const h = num(vehicle.heading, 0);
  // Точка на носу. Если позиции машины нет, берём point.
  const sx = c.ok ? c.x + Math.sin(h) * NOSE_OFFSET : num(point && point.x, 0);
  const sz = c.ok ? c.z + Math.cos(h) * NOSE_OFFSET : num(point && point.z, 0);
  const px = num(point && point.x, sx);
  const py = num(point && point.y, 0);
  const pz = num(point && point.z, sz);
  const hit = dirTo(c.x - px, c.z - pz); // направление удара: от point к центру машины
  if (damage > 0.5 && parts.bumper) {
    fx.spawn('debris', { pos: { x: sx, y: 0.5, z: sz }, dir: hit, count: 4, color });
    parts.bumper = false;
  }
  if (damage > 0.5 && parts.hood && imp > 14) {
    fx.spawn('debris', { pos: { x: sx, y: 1, z: sz }, dir: hit, count: 5, color });
    parts.hood = false;
  }
  if (imp > 24) detachNearestWheel(fx, vehicle, parts, c, px, py, pz);
}
