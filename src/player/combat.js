// Оружие героя: кулаки/пистолет, луч, урон педам, тело физики, поза прицела.

import { hurtPlayer } from './health.js';

export const MAG_SIZE = 12;
export const FIST_RANGE = 1.4;
export const FIST_DAMAGE = 15;
export const PISTOL_DAMAGE = 34;
export const PISTOL_RANGE = 80;

/** Предыдущий кадр ЛКМ (модуль, не state) — фронт false→true, если pressed('Mouse0') нет. */
let prevMouseLeft = false;

function cameraDir(state) {
  const f = state.camera && state.camera.forward;
  if (f && typeof f.x === 'number') return f;
  return { x: 0, y: 0, z: 1 };
}

function hitPed(engine, player, maxDist, damage, by) {
  const physics = engine.physics;
  if (!physics) return;

  const pos = player.position;
  const origin = {
    x: pos.x,
    y: (pos.y || 0) + 1.4,
    z: pos.z,
  };
  const dir = cameraDir(engine.state);

  const hitB = physics.raycastBodies?.(origin, dir, maxDist, player) ?? null;
  const hitW = physics.raycast?.(origin, dir, maxDist) ?? null;

  if (!hitB) return;
  if (hitW && hitW.dist < hitB.dist) return;

  const body = hitB.body;
  if (!body || body.kind !== 'ped') return;
  const ped = body.ref;
  if (!ped) return;
  if (ped.mode === 'dead') return;

  ped.health -= damage;
  engine.emit('pedHurt', { ped, by, attacker: 'player' });

  if (ped.health <= 0 && ped.mode !== 'dead') {
    ped.mode = 'dead';
    ped._deadT = 0;
    engine.emit('pedKilled', { ped, by, attacker: 'player' });
  }
}

export function initPlayerCombat(engine) {
  const player = engine.state.player;
  if (!player) return;

  player.weapon = 'fist';
  player.ammo = MAG_SIZE;
  player.aiming = false;

  if (engine.physics && engine.physics.addBody) {
    player.body = engine.physics.addBody({
      position: player.position,
      radius: 0.4,
      mass: 80,
      kind: 'player',
      ref: player,
      vx: 0,
      vz: 0,
      height: 1.8,
    });
  }

  engine.on('playerDamage', (payload) => {
    const p = engine.state.player;
    const amount = payload && payload.amount;
    if (p && !p.dead && amount) hurtPlayer(p, amount);
  });
}

function fireJustPressed(input) {
  const left = !!(input.mouse && input.mouse.left);
  const edge = !prevMouseLeft && left;
  prevMouseLeft = left;
  return input.pressed('Mouse0') || edge;
}

export function updatePlayerCombat(engine, dt) {
  void dt;
  const player = engine.state.player;
  const input = engine.input;

  if (!player || player.dead || player.inVehicle) {
    if (player) player.aiming = false;
    // Не копить ложный фронт ЛКМ, пока герой мёртв / в машине.
    if (input) prevMouseLeft = !!(input.mouse && input.mouse.left);
    return;
  }

  if (!input) return;

  if (input.pressed('Digit1') || input.down('Digit1')) player.weapon = 'fist';
  if (input.pressed('Digit2') || input.down('Digit2')) player.weapon = 'pistol';

  player.aiming = input.down('Mouse2') === true;

  if (player.weapon === 'pistol' && input.pressed('KeyR')) {
    player.ammo = MAG_SIZE;
  }

  let pistolShot = false;
  if (fireJustPressed(input)) {
    if (player.weapon === 'fist') {
      hitPed(engine, player, FIST_RANGE, FIST_DAMAGE, 'fist');
    } else if (player.weapon === 'pistol' && player.ammo > 0) {
      player.ammo -= 1;
      pistolShot = true;
    }
  }
  return pistolShot;
}

export function applyCombatPose(parts, player) {
  if (!parts || !player) return;

  if (parts.pistol) {
    parts.pistol.visible = player.weapon === 'pistol';
  }

  if (!player.aiming) {
    // anim.js не крутит предплечья — сбрасываем, иначе поза прицела залипает.
    if (parts.forearmR) parts.forearmR.rotation.x = 0;
    if (parts.handR) parts.handR.rotation.x = 0;
    if (parts.forearmL) parts.forearmL.rotation.x = 0;
    if (parts.handL) parts.handL.rotation.x = 0;
    return;
  }

  if (parts.armR) parts.armR.rotation.x = -1.1;

  if (player.weapon === 'pistol') {
    if (parts.forearmR) parts.forearmR.rotation.x = -0.25;
    if (parts.handR) parts.handR.rotation.x = -0.2;
  }
}

export function syncPlayerBody(player, vx, vz) {
  if (player && player.body) {
    player.body.vx = vx;
    player.body.vz = vz;
  }
}
