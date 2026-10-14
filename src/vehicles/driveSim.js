// Шаг езды для controller player|police. object3d.rotation и engine.state не трогает.

const ACCEL = 18;
const BRAKE = 28;
const REVERSE = 10;
const COAST = 4;
const HANDBRAKE = 18;
const MAX_SPEED = 32;
const MAX_REVERSE = 10;
const STEER_MAX = 0.55;
const STEER_EASE = 12;
const STEER_MIN = 0.12;
const HIT_LOSS = 0.55;
const DEFAULT_RADIUS = 1.6;
const CRASH_RECOVER = 1;
const BOUNCE_DECAY = 4;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function approachZero(v, dv) {
  if (v > 0) return Math.max(0, v - dv);
  if (v < 0) return Math.min(0, v + dv);
  return 0;
}

function wrapPi(a) {
  const two = Math.PI * 2;
  let x = ((a + Math.PI) % two + two) % two - Math.PI;
  if (x <= -Math.PI) x += two;
  return x;
}

function writeBody(vehicle, vx, vz) {
  const body = vehicle.body;
  if (!body) return;
  body.vx = vx;
  body.vz = vz;
  body.position = vehicle.position;
}

function clearCrash(vehicle) {
  vehicle._crashT = 0;
  vehicle._bounceVx = 0;
  vehicle._bounceVz = 0;
}

/** Удар: гасим скорость, не разворачиваем в задний ход. Контроль вернётся через 1 с. */
export function markVehicleCrash(vehicle, impact) {
  if (!vehicle) return;
  const fresh = !(vehicle._crashT > 0);
  vehicle._crashT = CRASH_RECOVER;
  if (!fresh) return;
  const mag = Math.min(8, Math.abs(Number(impact) || 0) * 0.35);
  const h = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  // Толчок один раз, затухает. Не пишем vehicle.speed.
  vehicle._bounceVx = -Math.sin(h) * mag;
  vehicle._bounceVz = -Math.cos(h) * mag;
}

export function stepDrive(vehicle, controls, dt, physics) {
  const none = { hitWall: false, impact: 0 };
  if (!vehicle || !vehicle.position) return none;

  const t = dt > 0 ? dt : 0;
  const c = controls || {};
  const throttle = clamp(Number(c.throttle) || 0, 0, 1);
  const brake = clamp(Number(c.brake) || 0, 0, 1);
  const steerIn = clamp(Number(c.steer) || 0, -1, 1);
  const hb = !!c.handbrake;
  const radius = vehicle.radius > 0 ? vehicle.radius : DEFAULT_RADIUS;

  if (vehicle._crashT > 0) {
    vehicle._crashT = Math.max(0, vehicle._crashT - t);
    if (vehicle._crashT === 0) clearCrash(vehicle);
  }

  if (vehicle.health <= 0) {
    vehicle.speed = 0;
    vehicle.steer = 0;
    vehicle.braking = false;
    clearCrash(vehicle);
    writeBody(vehicle, 0, 0);
    return none;
  }

  let speed = Number(vehicle.speed);
  if (!Number.isFinite(speed)) speed = 0;
  let heading = Number(vehicle.heading);
  if (!Number.isFinite(heading)) heading = 0;

  const inCrash = vehicle._crashT > 0;

  if (hb) {
    speed = approachZero(speed, HANDBRAKE * t);
  } else if (brake > 0) {
    // В ударе и при езде вперёд S только тормозит. Реверс — только стоя, после 1 с.
    if (inCrash || speed > 0.15) speed = approachZero(speed, BRAKE * brake * t);
    else speed -= REVERSE * brake * t;
  } else if (throttle > 0) {
    speed += ACCEL * throttle * t;
  } else {
    const coast = inCrash ? COAST * 3 : COAST;
    speed = approachZero(speed, coast * t);
  }
  speed = clamp(speed, -MAX_REVERSE, MAX_SPEED);
  if (!Number.isFinite(speed)) speed = 0;

  let limit = STEER_MAX * (1 - Math.abs(speed) / STEER_EASE);
  if (limit < STEER_MIN) limit = STEER_MIN;
  vehicle.steer = steerIn * limit;
  heading = wrapPi(heading + vehicle.steer * speed * t);

  const bvx = inCrash ? (vehicle._bounceVx || 0) : 0;
  const bvz = inCrash ? (vehicle._bounceVz || 0) : 0;
  const nx = vehicle.position.x + Math.sin(heading) * speed * t + bvx * t;
  const nz = vehicle.position.z + Math.cos(heading) * speed * t + bvz * t;

  let hitWall = false;
  let impact = 0;

  if (!Number.isFinite(nx) || !Number.isFinite(nz)) {
    vehicle.speed = 0;
    vehicle.heading = heading;
    vehicle.braking = brake > 0 && speed > 0.3;
    writeBody(vehicle, 0, 0);
    return none;
  }

  if (physics && typeof physics.resolveCircle === 'function') {
    const r = physics.resolveCircle(nx, nz, radius);
    vehicle.position.x = r.x;
    vehicle.position.z = r.z;
    if (r.hit) {
      impact = Math.abs(speed);
      hitWall = true;
      const fresh = !(vehicle._crashT > 0);
      markVehicleCrash(vehicle, impact);
      speed = approachZero(speed, Math.abs(speed) * (1 - HIT_LOSS));
      if (Math.abs(speed) < 0.75) speed = 0;
      if (fresh) {
        const px = r.x - nx;
        const pz = r.z - nz;
        const plen = Math.hypot(px, pz);
        if (plen > 1e-8) {
          const mag = Math.min(8, impact * 0.35);
          vehicle._bounceVx = (px / plen) * mag;
          vehicle._bounceVz = (pz / plen) * mag;
        }
      }
    }
  } else {
    vehicle.position.x = nx;
    vehicle.position.z = nz;
  }

  if (vehicle._crashT > 0) {
    const decay = Math.exp(-BOUNCE_DECAY * t);
    vehicle._bounceVx = (vehicle._bounceVx || 0) * decay;
    vehicle._bounceVz = (vehicle._bounceVz || 0) * decay;
  } else {
    vehicle._bounceVx = 0;
    vehicle._bounceVz = 0;
  }

  vehicle.speed = speed;
  vehicle.heading = heading;
  vehicle.braking = brake > 0 && speed > 0.3;
  const ovx = Math.sin(heading) * speed + (vehicle._bounceVx || 0);
  const ovz = Math.cos(heading) * speed + (vehicle._bounceVz || 0);
  writeBody(vehicle, ovx, ovz);
  return { hitWall, impact };
}

export function spinWheels(vehicle, dt) {
  const w = vehicle && vehicle.wheels;
  if (!w) return;
  const t = dt > 0 ? dt : 0;
  const dRoll = ((Number(vehicle.speed) || 0) / 0.35) * t;
  const steer = Number(vehicle.steer) || 0;
  if (w.rl && w.rl.rotation) w.rl.rotation.x -= dRoll;
  if (w.rr && w.rr.rotation) w.rr.rotation.x -= dRoll;
  if (w.fl && w.fl.rotation) {
    w.fl.rotation.x -= dRoll;
    w.fl.rotation.y = steer;
  }
  if (w.fr && w.fr.rotation) {
    w.fr.rotation.x -= dRoll;
    w.fr.rotation.y = steer;
  }
}
