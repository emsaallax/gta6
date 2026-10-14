// 3-03. Ходьба относительно камеры, разгон, прыжок, присед, гравитация, коллизии.

export const PLAYER_RADIUS = 0.4;
export const WALK_SPEED = 4;
export const RUN_SPEED = 9;
export const CROUCH_SPEED = 2;
export const ACCEL = 18;
export const FRICTION = 14;
export const JUMP_VEL = 7.5;
export const GRAVITY = 22;

export function createMoveState() {
  return {
    vx: 0,
    vz: 0,
    vy: 0,
    heading: 0,
    grounded: true,
    crouching: false,
    gait: 'idle',
  };
}

function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

export function stepPlayerMove(move, object3d, input, camera, physics, dt) {
  const crouching = !!input.down('KeyC');
  move.crouching = crouching;

  // Горизонтальный угол «камера → герой»: W уводит от камеры (вперёд по виду).
  const yaw = Math.atan2(
    camera.position.x - object3d.position.x,
    camera.position.z - object3d.position.z
  );

  let f = 0;
  let s = 0;
  if (input.down('KeyW')) f -= 1;
  if (input.down('KeyS')) f += 1;
  if (input.down('KeyA')) s -= 1;
  if (input.down('KeyD')) s += 1;
  const want = f !== 0 || s !== 0;

  let maxSpeed = WALK_SPEED;
  if (crouching) maxSpeed = CROUCH_SPEED;
  else if (input.down('ShiftLeft')) maxSpeed = RUN_SPEED;

  let tx = 0;
  let tz = 0;
  if (want) {
    const dx = Math.sin(yaw) * f + Math.cos(yaw) * s;
    const dz = Math.cos(yaw) * f - Math.sin(yaw) * s;
    const len = Math.hypot(dx, dz) || 1;
    tx = (dx / len) * maxSpeed;
    tz = (dz / len) * maxSpeed;
  }

  if (want) {
    move.vx = approach(move.vx, tx, ACCEL * dt);
    move.vz = approach(move.vz, tz, ACCEL * dt);
  } else {
    move.vx = approach(move.vx, 0, FRICTION * dt);
    move.vz = approach(move.vz, 0, FRICTION * dt);
  }

  if (input.pressed('Space') && move.grounded && !crouching) {
    move.vy = JUMP_VEL;
  }

  move.vy -= GRAVITY * dt;
  object3d.position.y += move.vy * dt;
  if (object3d.position.y <= 0 && move.vy <= 0) {
    object3d.position.y = 0;
    move.vy = 0;
  } else if (object3d.position.y < 0) {
    object3d.position.y = 0;
  }
  move.grounded = object3d.position.y <= 0 && move.vy <= 0;

  object3d.position.x += move.vx * dt;
  object3d.position.z += move.vz * dt;
  // Коллизии XZ всегда, и на земле, и в прыжке — иначе герой залипает в стене.
  const r = physics.resolveCircle(object3d.position.x, object3d.position.z, PLAYER_RADIUS);
  object3d.position.x = r.x;
  object3d.position.z = r.z;

  const spd = Math.hypot(move.vx, move.vz);

  if (!move.grounded) move.gait = 'jump';
  else if (crouching) move.gait = 'crouch';
  else if (spd > 0.4 && input.down('ShiftLeft')) move.gait = 'run';
  else if (spd > 0.4) move.gait = 'walk';
  else move.gait = 'idle';
}
