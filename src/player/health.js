// Здоровье героя 0..100, смерть и возврат на точку спавна.

export const MAX_HEALTH = 100;
export const RESPAWN_DELAY = 2;

export function initPlayerHealth(player) {
  player.health = MAX_HEALTH;
  player.dead = false;
  player.respawnTimer = 0;
}

export function hurtPlayer(player, amount) {
  const next = (player.health ?? MAX_HEALTH) - amount;
  player.health = Math.max(0, Math.min(MAX_HEALTH, next));
}

export function updatePlayerHealth(engine, dt) {
  const player = engine.state.player;
  if (!player) return;

  const city = engine.state.city;
  const spawn = (city && city.spawn) || { x: 0, z: 0 };

  if (!player.dead && player.health <= 0) {
    // Сначала высадить из машины, чтобы она больше не считала героя водителем.
    if (player.inVehicle) {
      const v = player.inVehicle;
      engine.emit('exitVehicle', v);
      player.inVehicle = null;
    }
    player.dead = true;
    player.respawnTimer = RESPAWN_DELAY;
    if (player.object3d) player.object3d.visible = false;
  }

  if (player.dead) {
    player.respawnTimer -= dt;
    if (player.respawnTimer <= 0) {
      player.health = MAX_HEALTH;
      player.dead = false;
      if (player.object3d) {
        player.object3d.visible = true;
        player.object3d.position.set(spawn.x, 0, spawn.z);
      }
    }
  }
}
