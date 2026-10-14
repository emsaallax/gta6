// ФАЙЛЫ: src/player/recoil.js, src/npc/ped-talk.js
// Короткая отдача камеры на выстрел героя. Не пишет state.camera.

const DECAY = 0.12;
const KICK_DIST = 0.12;
const KICK_HEIGHT = 0.04;
const EPS = 0.001;

let bound = false;
let impulse = 0;
let restDistance = null;
let restHeight = null;

export function bindRecoil(engine) {
  if (!engine || typeof engine.on !== 'function') return;
  if (bound) return;
  bound = true;

  engine.on('shot', (payload) => {
    if (!payload || payload.by !== 'player') return;
    const cam = engine.state && engine.state.cameraTarget;
    if (cam && impulse <= EPS) {
      if (typeof cam.distance === 'number') restDistance = cam.distance;
      if (typeof cam.height === 'number') restHeight = cam.height;
    }
    impulse = 1;
  });
}

export function stepRecoil(cameraTarget, dt) {
  if (!cameraTarget) return;
  if (impulse <= 0) return;

  if (restDistance == null && typeof cameraTarget.distance === 'number') {
    restDistance = cameraTarget.distance;
  }
  if (restHeight == null && typeof cameraTarget.height === 'number') {
    restHeight = cameraTarget.height;
  }

  const t = dt > 0 ? dt : 0;
  impulse *= Math.exp(-t / DECAY);
  if (impulse < EPS) impulse = 0;

  if (typeof cameraTarget.distance === 'number' && restDistance != null) {
    cameraTarget.distance = restDistance - KICK_DIST * impulse;
  }
  if (typeof cameraTarget.height === 'number' && restHeight != null) {
    cameraTarget.height = restHeight + KICK_HEIGHT * impulse;
  }
}
