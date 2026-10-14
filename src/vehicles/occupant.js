// Ввод, камера сзади машины, посадка. Физику и меши не пишет.

function emptyInput() {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false };
}

export function readDriveInput(input) {
  if (!input || typeof input.down !== 'function') return emptyInput();
  const w = !!input.down('KeyW');
  const s = !!input.down('KeyS');
  const a = !!input.down('KeyA');
  const d = !!input.down('KeyD');
  let throttle = 0;
  let brake = 0;
  if (w && s) {
    throttle = 0;
    brake = 1;
  } else if (w) {
    throttle = 1;
  } else if (s) {
    brake = 1;
  }
  let steer = 0;
  if (a && d) steer = 0;
  else if (a) steer = 1;
  else if (d) steer = -1;
  return { throttle, brake, steer, handbrake: !!input.down('Space') };
}

/**
 * Цель камеры в машине (CONTRACTS §2).
 * Пишет только position, heading, distance, height, mode, speed.
 * prev — текущий state.cameraTarget: обновляем на месте, чтобы не стереть
 * поля камеры группы 1 (yaw мыши живёт в CameraRig, не здесь).
 */
export function vehicleCameraTarget(vehicle, prev) {
  const position = vehicle && vehicle.position ? vehicle.position : { x: 0, y: 0, z: 0 };
  const heading = vehicle && Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  const speed = vehicle && Number.isFinite(vehicle.speed) ? vehicle.speed : 0;
  const out = prev && typeof prev === 'object' ? prev : {};
  out.position = position;
  out.heading = heading + Math.PI;
  out.distance = 12;
  out.height = 1.35;
  out.mode = 'vehicle';
  out.speed = speed;
  return out;
}

export function findNearestVehicle(vehicles, x, z, maxDist = 3) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return null;
  const max = maxDist == null ? 3 : maxDist;
  let best = null;
  let bestD = Infinity;
  for (const v of vehicles) {
    const p = v && v.position;
    if (!p) continue;
    const d = Math.hypot((p.x || 0) - x, (p.z || 0) - z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (!best || bestD > max) return null;
  return best;
}

export function bindOccupantEvents(engine) {
  if (!engine || typeof engine.on !== 'function') return;
  engine.on('enterVehicle', (vehicle) => {
    if (!vehicle) return;
    const player = engine.state && engine.state.player;
    if (player) vehicle.driver = player;
  });
  engine.on('exitVehicle', (vehicle) => {
    if (!vehicle) return;
    vehicle.driver = null;
  });
}

export function getDrivenVehicle(engine) {
  const v = engine && engine.state && engine.state.player && engine.state.player.inVehicle;
  if (!v) return null;
  const list = engine.state.vehicles;
  if (Array.isArray(list) && list.includes(v)) return v;
  return v;
}
