// Посадка, угон (carjack) и цель камеры в машине. state.player не пишет.

export function bindEnterExit(engine) {
  if (!engine || typeof engine.on !== 'function') return;

  engine.on('enterVehicle', (vehicle) => {
    if (!vehicle) return;
    const ctrl = vehicle.controller;
    if (ctrl === 'traffic' || ctrl === 'police') {
      const pos = vehicle.position || {};
      if (typeof engine.emit === 'function') {
        engine.emit('carjack', {
          vehicle,
          x: pos.x,
          z: pos.z,
          wasPolice: ctrl === 'police',
        });
      }
    }
    vehicle.controller = 'player';
    vehicle.driver = 'player';
  });

  engine.on('exitVehicle', (vehicle) => {
    if (!vehicle) return;
    vehicle.driver = null;
    vehicle.controller = null;
  });
}

export { vehicleCameraTarget } from './occupant.js';
