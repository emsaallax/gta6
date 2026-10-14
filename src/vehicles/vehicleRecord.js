// Запись машины по CONTRACTS §6. Меш не строит — object3d передаёт вызывающий.

export function makeVehicle({ object3d, type, x, z, heading, controller }) {
  if (object3d) {
    if (object3d.position && typeof object3d.position.set === 'function') {
      object3d.position.set(x, 0, z);
    } else if (object3d.position) {
      object3d.position.x = x;
      object3d.position.y = 0;
      object3d.position.z = z;
    }
    if (object3d.rotation) {
      object3d.rotation.order = 'YXZ';
      object3d.rotation.y = heading;
    }
  }
  const kind = type || 'sedan';
  return {
    object3d,
    position: object3d.position,
    heading,
    speed: 0,
    steer: 0,
    braking: false,
    type: kind,
    radius: 1.6,
    body: null,
    controller: controller || null,
    driver: null,
    health: 1000,
    lane: null,
    siren: kind === 'police' ? false : undefined,
  };
}

export function addCarBody(physics, vehicle) {
  if (!physics || typeof physics.addBody !== 'function' || !vehicle) return null;
  const body = physics.addBody({
    position: vehicle.position,
    radius: 1.6,
    mass: 1200,
    kind: 'car',
    ref: vehicle,
    vx: 0,
    vz: 0,
    height: 1.5,
  });
  vehicle.body = body;
  return body;
}

export function removeCarBody(physics, vehicle) {
  if (!vehicle) return;
  if (physics && typeof physics.removeBody === 'function' && vehicle.body) {
    physics.removeBody(vehicle.body);
  }
  vehicle.body = null;
}
