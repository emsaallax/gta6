// ФАЙЛЫ: src/vehicles/carFeel.js, src/traffic/redStop.js
/**
 * Крен и клевок — только object3d.rotation.x и .z.
 * rotation.y (heading) не трогать.
 * Занос: при handbrake смещает position поперёк heading, пишет body.vx/vz.
 */

const EMPTY = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const ROLL_MAX = 0.18;
const PITCH_BRAKE = 0.08;
const PITCH_THROTTLE = 0.03;
const FEEL_RATE = 8;
const SLIP_GAIN = 0.35;
const SLIP_SPEED = 4;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function slipSteer(steer) {
  const s = Number(steer) || 0;
  if (Math.abs(s) > 1) return Math.tanh(s);
  return clamp(s, -1, 1);
}

export function applyCarFeel(vehicle, controls, dt) {
  if (!vehicle || !vehicle.position) return;

  const c = controls || EMPTY;
  const t = dt > 0 ? dt : 0;
  const health = vehicle.health != null ? vehicle.health : 1;
  const speed = Number(vehicle.speed) || 0;
  const heading = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  const pos = vehicle.position;

  if (c.handbrake && speed > SLIP_SPEED && health > 0) {
    const slip = slipSteer(c.steer != null ? c.steer : vehicle.steer);
    const side = heading + Math.PI / 2;
    pos.x += Math.sin(side) * speed * SLIP_GAIN * slip * t;
    pos.z += Math.cos(side) * speed * SLIP_GAIN * slip * t;
    const body = vehicle.body;
    if (body) {
      body.vx = Math.sin(heading) * speed;
      body.vz = Math.cos(heading) * speed;
    }
  }

  const obj = vehicle.object3d;
  if (!obj || !obj.rotation) return;

  let rollZ = 0;
  let pitchX = 0;
  if (health > 0) {
    const steer = Number(vehicle.steer) || 0;
    rollZ = -steer * clamp(Math.abs(speed) / 24, 0, 1) * ROLL_MAX;
    const braking = !!(vehicle.braking || (Number(c.brake) || 0) > 0);
    pitchX = (braking ? PITCH_BRAKE : 0) - ((Number(c.throttle) || 0) > 0 ? PITCH_THROTTLE : 0);
  }

  const k = 1 - Math.exp(-FEEL_RATE * t);
  obj.rotation.z += (rollZ - obj.rotation.z) * k;
  obj.rotation.x += (pitchX - obj.rotation.x) * k;
}
