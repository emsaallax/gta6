// ФАЙЛЫ: src/player/aim-pose.js
// Поза прицела: правая рука к цели (процедурные parts или кость Kenney).

export const AIM_ARM_X = -1.35;
export const AIM_FOREARM_X = -0.22;
export const AIM_HAND_X = -0.18;
export const SHOOT_HOLD = 0.22;
export const BONE_NAMES = [
  'arm-right',
  'RightArm',
  'rightArm',
  'armR',
  'UpperArm.R',
  'mixamorigRightArm',
];
export const KENNEY_AIM_ARM_Y = Math.PI / 3;

export function createAimPoseState() {
  return { shootHold: 0 };
}

export function notifyShot(poseState) {
  if (!poseState) return;
  poseState.shootHold = SHOOT_HOLD;
}

export function stepAimPoseState(poseState, dt, aiming) {
  if (!poseState) return;
  if (aiming) return;
  poseState.shootHold = Math.max(0, (poseState.shootHold || 0) - dt);
}

/** pistol и не dead и не inVehicle и (aiming или shootHold>0). */
export function wantAimPose(poseState, player) {
  if (!player) return false;
  if (player.weapon !== 'pistol') return false;
  if (player.dead) return false;
  if (player.inVehicle) return false;
  const hold = poseState && poseState.shootHold > 0;
  return !!(player.aiming || hold);
}

/**
 * on=true: armR.x=-1.35, forearmR.x=-0.22, handR.x=-0.18; pistol.visible=true.
 * on=false: не сбрасывать ноги; pistol.visible = weapon==='pistol'.
 * Нет parts — no-op.
 */
export function applyProceduralAim(parts, player, on) {
  if (!parts) return;

  if (on) {
    if (parts.armR) parts.armR.rotation.x = AIM_ARM_X;
    if (parts.forearmR) parts.forearmR.rotation.x = AIM_FOREARM_X;
    if (parts.handR) parts.handR.rotation.x = AIM_HAND_X;
    if (parts.pistol) parts.pistol.visible = true;
    return;
  }

  if (parts.pistol) {
    parts.pistol.visible = !!(player && player.weapon === 'pistol');
  }
}

function findAimBone(root) {
  if (!root || typeof root.traverse !== 'function') return null;
  let found = null;
  root.traverse((obj) => {
    if (found || !obj) return;
    const name = obj.name;
    for (let i = 0; i < BONE_NAMES.length; i++) {
      if (name === BONE_NAMES[i]) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

/**
 * on=true: найти кость по BONE_NAMES (traverse object3d).
 * Kenney character-male-a: arm-right, bone.rotation.y = Math.PI/3 (как holding-right-shoot).
 * Не rotation.x = -1.35. После mixer, иначе клип затрёт. Нет кости — no-op.
 * aimDir не обязателен. hero null — no-op.
 */
export function applyKenneyAim(hero, on) {
  if (!hero || !on) return;
  const root = hero.object3d || hero;
  const bone = findAimBone(root);
  if (!bone || !bone.rotation) return;
  bone.rotation.y = KENNEY_AIM_ARM_Y;
}
