// ФАЙЛЫ: src/player/gun-kick.js
// Отдача камеры и руки на выстрел, гильза через state.fx.spawn('shell').

export const KICK_HEIGHT = 0.22;
export const KICK_ARM = 0.45;
export const KICK_DECAY = 0.16;
export const KICK_EPS = 0.001;

const KENNEY_BONES = [
  'arm-right',
  'RightArm',
  'rightArm',
  'armR',
  'UpperArm.R',
  'mixamorigRightArm',
];

export function createGunKick() {
  return { impulse: 0 };
}

export function notifyGunKick(kick) {
  if (!kick) return;
  kick.impulse = 1;
}

export function stepGunKick(kick, cameraTarget, dt) {
  if (!kick) return;
  const impulse = kick.impulse || 0;
  if (impulse <= 0) {
    kick.impulse = 0;
    return;
  }

  if (cameraTarget && typeof cameraTarget.height === 'number') {
    cameraTarget.height += KICK_HEIGHT * impulse;
  }

  const t = dt > 0 ? dt : 0;
  let next = impulse * Math.exp(-t / KICK_DECAY);
  if (next < KICK_EPS) next = 0;
  kick.impulse = next;
}

function findKenneyArm(root) {
  if (!root || typeof root.traverse !== 'function') return null;
  let found = null;
  root.traverse((obj) => {
    if (found || !obj) return;
    const name = obj.name;
    for (let i = 0; i < KENNEY_BONES.length; i++) {
      if (name === KENNEY_BONES[i]) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

export function applyGunKickPose(kick, parts, kenney) {
  if (!kick) return;
  const impulse = kick.impulse || 0;
  if (impulse <= 0) return;

  const delta = KICK_ARM * impulse;

  if (parts && parts.armR && parts.armR.rotation) {
    parts.armR.rotation.x -= delta;
  }

  if (!kenney) return;
  const root = kenney.object3d || kenney;
  const bone = findKenneyArm(root);
  if (!bone || !bone.rotation) return;
  bone.rotation.x -= delta;
}

export function ejectShell(engine, muzzle) {
  const state = engine && engine.state;
  const spawn = state && state.fx && state.fx.spawn;
  if (typeof spawn !== 'function') return;

  let pos;
  if (
    muzzle &&
    typeof muzzle.x === 'number' &&
    typeof muzzle.y === 'number' &&
    typeof muzzle.z === 'number'
  ) {
    pos = { x: muzzle.x, y: muzzle.y, z: muzzle.z };
  } else {
    const p = state.player && state.player.position;
    pos = {
      x: p && typeof p.x === 'number' ? p.x : 0,
      y: (p && typeof p.y === 'number' ? p.y : 0) + 1.42,
      z: p && typeof p.z === 'number' ? p.z : 0,
    };
  }

  const rot = state.player && state.player.object3d && state.player.object3d.rotation;
  const heading = (rot && rot.y) || 0;
  const dir = {
    x: Math.cos(heading) * 0.7,
    y: 0.85,
    z: -Math.sin(heading) * 0.7,
  };

  spawn('shell', { pos: { x: pos.x, y: pos.y, z: pos.z }, dir, count: 1 });
}
