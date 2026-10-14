// ФАЙЛЫ: src/vehicles/vehicleAudio.js
// Звук машин через state.audio (CONTRACTS §11). Без audio — тишина.

const ENGINE_ID = 'veh-engine';
const TIRES_ID = 'veh-tires';
const HORN_ID = 'veh-horn';
const SIREN_IDS = ['veh-siren-0', 'veh-siren-1'];
const TRAFFIC_IDS = ['veh-tr-0', 'veh-tr-1', 'veh-tr-2'];

const handles = new Map();
let bound = false;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function audioOf(engine) {
  return engine && engine.state && engine.state.audio ? engine.state.audio : null;
}

function posOf(vehicle) {
  const p = vehicle && vehicle.position;
  if (!p) return { x: 0, y: 0, z: 0 };
  return {
    x: p.x != null ? p.x : 0,
    y: p.y != null ? p.y : 0,
    z: p.z != null ? p.z : 0,
  };
}

function listenerXZ(engine) {
  const p = engine && engine.state && engine.state.player;
  const pos = (p && p.position) || (p && p.object3d && p.object3d.position);
  if (pos && pos.x != null) return { x: pos.x, z: pos.z != null ? pos.z : 0 };
  const cam = engine && engine.state && engine.state.cameraTarget && engine.state.cameraTarget.position;
  if (cam && cam.x != null) return { x: cam.x, z: cam.z != null ? cam.z : 0 };
  return { x: 0, z: 0 };
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function stopHandle(id) {
  const h = handles.get(id);
  if (!h) return;
  try {
    if (typeof h.stop === 'function') h.stop();
  } catch (_) {}
  handles.delete(id);
}

function stopAll() {
  const ids = Array.from(handles.keys());
  for (let i = 0; i < ids.length; i++) stopHandle(ids[i]);
}

function ensureLoop(audio, id, name, opts) {
  let h = handles.get(id);
  if (!h && audio && typeof audio.loop === 'function') {
    try {
      h = audio.loop(id, name, opts);
    } catch (_) {
      h = null;
    }
    if (h) handles.set(id, h);
  }
  if (h && typeof h.set === 'function') {
    try {
      h.set(opts);
    } catch (_) {}
  }
  return h;
}

function onBodyHit(engine, payload) {
  const audio = audioOf(engine);
  if (!audio || typeof audio.play !== 'function') return;
  const speed = payload && payload.speed != null ? Number(payload.speed) : 0;
  const volume = clamp(speed / 20, 0.2, 1);
  try {
    audio.play('hit', { volume });
  } catch (_) {}
}

export function bindVehicleAudio(engine) {
  if (bound) return;
  if (!engine || typeof engine.on !== 'function') return;
  bound = true;
  engine.on('bodyHit', (payload) => {
    onBodyHit(engine, payload);
  });
}

export function updateVehicleAudio(engine, dt) {
  void dt;
  const audio = audioOf(engine);
  if (!audio) {
    stopAll();
    return;
  }

  const player = engine.state && engine.state.player;
  const vehicle = player && player.inVehicle ? player.inVehicle : null;
  const input = engine.input;

  if (vehicle) {
    const speed = vehicle.speed != null ? Number(vehicle.speed) : 0;
    const absSpeed = Math.abs(speed);
    const pos = posOf(vehicle);
    const rate = 0.65 + absSpeed / 32 * 1.1;
    const volume = 0.15 + absSpeed / 32 * 0.5;
    ensureLoop(audio, ENGINE_ID, 'engine', { volume, rate, pos });

    const steer = vehicle.steer != null ? Number(vehicle.steer) : 0;
    const space = input && typeof input.down === 'function' && input.down('Space');
    const handbrake = !!(space || (vehicle.controls && vehicle.controls.handbrake));
    const skid = handbrake || (Math.abs(steer) > 0.35 && absSpeed > 6);
    if (skid) {
      ensureLoop(audio, TIRES_ID, 'tires', { volume: 0.35, pos });
    } else {
      stopHandle(TIRES_ID);
    }

    const hornDown = input && typeof input.down === 'function' && input.down('KeyG');
    if (hornDown) {
      ensureLoop(audio, HORN_ID, 'horn', { volume: 0.5, pos });
    } else {
      stopHandle(HORN_ID);
    }
  } else {
    stopHandle(ENGINE_ID);
    stopHandle(TIRES_ID);
    stopHandle(HORN_ID);
  }

  const list = engine.state && Array.isArray(engine.state.vehicles) ? engine.state.vehicles : [];
  const lz = listenerXZ(engine);

  const sirens = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!v || v.siren !== true) continue;
    const p = posOf(v);
    const d2 = dist2(lz.x, lz.z, p.x, p.z);
    if (d2 >= 80 * 80) continue;
    sirens.push({ v, d2, p });
  }
  sirens.sort((a, b) => a.d2 - b.d2);
  for (let i = 0; i < SIREN_IDS.length; i++) {
    const slot = sirens[i];
    if (slot) {
      ensureLoop(audio, SIREN_IDS[i], 'siren', { volume: 0.45, pos: slot.p });
    } else {
      stopHandle(SIREN_IDS[i]);
    }
  }

  const traffic = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (!v || v.controller !== 'traffic') continue;
    const p = posOf(v);
    const d2 = dist2(lz.x, lz.z, p.x, p.z);
    if (d2 >= 50 * 50) continue;
    traffic.push({ v, d2, p });
  }
  traffic.sort((a, b) => a.d2 - b.d2);
  for (let i = 0; i < TRAFFIC_IDS.length; i++) {
    const slot = traffic[i];
    if (slot) {
      ensureLoop(audio, TRAFFIC_IDS[i], 'engine', { volume: 0.08, rate: 0.9, pos: slot.p });
    } else {
      stopHandle(TRAFFIC_IDS[i]);
    }
  }
}
