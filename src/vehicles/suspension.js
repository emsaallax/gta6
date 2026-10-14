// Подвеска кузова: три пружины (подскок y, клевок p, крен r) на меше body.
// Только визуально: object3d, колёса и физику не трогаем.
// body.position.y и body.rotation.x/z пишутся как смещение от базы меша.

const K = 90; // жёсткость пружин
const C = 9; // демпфер
const MAX_DT = 0.05; // шаг интегрирования, с
const ACC_LIMIT = 20; // предел продольного ускорения, м/с² (удар, телепорт)
const PITCH_PER_ACC = 0.007; // рад клевка на 1 м/с²: разгон даёт p<0 (присед), торможение p>0
const ROLL_MAX = 0.04; // рад крена на полном руле при скорости от 24 м/с
const ROLL_SPEED = 24;
const ROAD_AMP = 0.04; // м, амплитуда кочек
const ROAD_SPEED = 20; // м/с, с этой скорости кочки в полную силу
const KICK_GAIN = 0.02;
const KICK_MAX = 0.5; // м/с, предел скорости подскока
const Y_LIM = 0.06;
const TILT_LIM = 0.07;

const baseOf = new WeakMap(); // body -> базовые y, rx, rz (fallback-меш из модели может быть смещён или повёрнут)

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function stateOf(vehicle) {
  if (!vehicle._sus) {
    const speed = Number.isFinite(vehicle.speed) ? vehicle.speed : 0;
    vehicle._sus = { y: 0, vy: 0, p: 0, vp: 0, r: 0, vr: 0, lastSpeed: speed };
  }
  return vehicle._sus;
}

function isUnder(obj, root) {
  for (let o = obj; o; o = o.parent) if (o === root) return true;
  return false;
}

function findBody(vehicle) {
  const root = vehicle.object3d;
  if (!root || typeof root.getObjectByName !== 'function') return null;
  let body = vehicle._susBody;
  if (!body || !isUnder(body, root)) {
    body = root.getObjectByName('body') || null;
    vehicle._susBody = body;
  }
  if (body && !baseOf.has(body)) {
    baseOf.set(body, { y: body.position.y, rx: body.rotation.x, rz: body.rotation.z });
  }
  return body;
}

export function updateSuspension(vehicle, dt) {
  if (!vehicle || !(dt > 0)) return;
  const body = findBody(vehicle);
  if (!body) return;
  const s = stateOf(vehicle);
  const speed = Number.isFinite(vehicle.speed) ? vehicle.speed : 0;
  const steer = Number.isFinite(vehicle.steer) ? clamp(vehicle.steer, -1, 1) : 0;
  const pos = vehicle.position;
  const px = pos && Number.isFinite(pos.x) ? pos.x : 0;
  const pz = pos && Number.isFinite(pos.z) ? pos.z : 0;
  const t = Math.min(dt, MAX_DT);

  // продольное ускорение считаем по реальному dt, чтобы пауза кадра не давала рывок
  const acc = clamp((speed - s.lastSpeed) / dt, -ACC_LIMIT, ACC_LIMIT);
  s.lastSpeed = speed;
  // цели пружин: клевок от ускорения, крен от руля (знак как в carFeel.js), кочки
  const pitchT = -acc * PITCH_PER_ACC;
  const rollT = -steer * clamp(Math.abs(speed) / ROLL_SPEED, 0, 1) * ROLL_MAX;
  const road = (Math.sin(px * 1.7) + Math.sin(pz * 2.3)) * clamp(Math.abs(speed) / ROAD_SPEED, 0, 1) * ROAD_AMP;

  // полунеявный Эйлер: сначала скорость, потом координата
  s.vy += (K * (road - s.y) - C * s.vy) * t;
  s.y += s.vy * t;
  s.vp += (K * (pitchT - s.p) - C * s.vp) * t;
  s.p += s.vp * t;
  s.vr += (K * (rollT - s.r) - C * s.vr) * t;
  s.r += s.vr * t;

  const base = baseOf.get(body);
  body.position.y = base.y + clamp(s.y, -Y_LIM, Y_LIM);
  body.rotation.x = base.rx + clamp(s.p, -TILT_LIM, TILT_LIM);
  body.rotation.z = base.rz + clamp(s.r, -TILT_LIM, TILT_LIM);
}

export function kickSuspension(vehicle, impulse) {
  if (!vehicle) return;
  const s = stateOf(vehicle);
  const imp = Number.isFinite(impulse) ? impulse : 0;
  s.vy = clamp(s.vy - imp * KICK_GAIN, -KICK_MAX, KICK_MAX);
}
