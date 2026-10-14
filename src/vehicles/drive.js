// Аркадная езда. object3d.rotation не трогает — это делает сборка.

export const DRIVE = {
  accel: 18,
  brake: 28,
  reverseAccel: 10,
  maxSpeed: 32,
  maxReverse: 10,
  friction: 4,
  handbrakeFriction: 18,
  steerMax: 0.55,
  steerEase: 12,
  bounce: 0.45,
  speedLossOnHit: 0.55,
  driftSlip: 0.65,
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function approachZero(v, dv) {
  if (v > 0) return Math.max(0, v - dv);
  if (v < 0) return Math.min(0, v + dv);
  return 0;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.max(0, Math.min(1, t));
}

function angleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function stepDrive(vehicle, controls, dt, physics) {
  if (!vehicle || !vehicle.position) return { hit: false };
  const t = dt > 0 ? dt : 0;
  const c = controls || {};
  const throttle = clamp(Number(c.throttle) || 0, 0, 1);
  const brake = clamp(Number(c.brake) || 0, 0, 1);
  const steerIn = clamp(Number(c.steer) || 0, -1, 1);
  const hb = !!c.handbrake;
  const radius = vehicle.radius > 0 ? vehicle.radius : 1.4;

  let speed = Number(vehicle.speed) || 0;
  let heading = Number(vehicle.heading) || 0;

  vehicle.braking = brake > 0 && speed > 0.3;

  if (hb) {
    speed = approachZero(speed, DRIVE.handbrakeFriction * t);
  } else if (brake > 0) {
    if (speed > 0.3) speed = approachZero(speed, DRIVE.brake * brake * t);
    else speed -= DRIVE.reverseAccel * brake * t;
  } else if (throttle > 0) {
    speed += DRIVE.accel * throttle * t;
  } else {
    speed = approachZero(speed, DRIVE.friction * t);
  }
  speed = clamp(speed, -DRIVE.maxReverse, DRIVE.maxSpeed);

  let limit = DRIVE.steerMax * (1 - Math.abs(speed) / DRIVE.steerEase);
  if (limit < 0.12) limit = 0.12;
  if (hb) limit = DRIVE.steerMax;
  vehicle.steer = steerIn * limit;
  heading += vehicle.steer * speed * t;

  if (vehicle._moveH == null) vehicle._moveH = heading;
  if (hb) {
    vehicle._moveH = lerpAngle(vehicle._moveH, heading, 1 - Math.exp(-DRIVE.driftSlip * t));
  } else {
    vehicle._moveH = heading;
  }
  const moveH = vehicle._moveH;

  const nx = vehicle.position.x + Math.sin(moveH) * speed * t;
  const nz = vehicle.position.z + Math.cos(moveH) * speed * t;

  let hit = false;
  if (physics && typeof physics.resolveCircle === 'function') {
    const r = physics.resolveCircle(nx, nz, radius);
    hit = !!r.hit;
    vehicle.position.x = r.x;
    vehicle.position.z = r.z;
    if (hit) {
      speed *= DRIVE.speedLossOnHit;
      const px = r.x - nx;
      const pz = r.z - nz;
      if (px * px + pz * pz > 1e-10) {
        const away = Math.atan2(px, pz);
        heading += angleDelta(heading, away) * DRIVE.bounce;
        vehicle._moveH = heading;
      }
    }
  } else {
    vehicle.position.x = nx;
    vehicle.position.z = nz;
  }

  vehicle.speed = speed;
  vehicle.heading = heading;
  return { hit };
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
