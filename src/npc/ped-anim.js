// Смешивание клипов педа и LOD (скелет рядом, инстанс дальше).
// ФАЙЛЫ: src/npc/ped-anim.js
import * as THREE from 'three';

export const LOD_NEAR = 40;
export const LOD_FAR = 80;
export const MAX_SKINNED = 38;
export const IDLE_SPEED = 0.25;
export const SPRINT_SPEED = 3.5;

const CROSS_FADE = 0.2;

function pedSpeed(ped) {
  const body = ped && ped.body;
  if (!body) return 0;
  const vx = body.vx || 0;
  const vz = body.vz || 0;
  return Math.hypot(vx, vz);
}

function distToPlayer(ped, playerPos) {
  if (!ped || !playerPos) return Infinity;
  const p = ped.position || (ped.body && ped.body.position) || (ped.object3d && ped.object3d.position);
  if (!p) return Infinity;
  const dx = (p.x || 0) - (playerPos.x || 0);
  const dz = (p.z || 0) - (playerPos.z || 0);
  return Math.hypot(dx, dz);
}

function chooseClip(ped) {
  const kenney = ped._kenney;
  const actions = (kenney && kenney.actions) || {};
  const mode = ped.mode;
  if (mode === 'dead') return 'die';
  if (mode === 'down') return actions.fall ? 'fall' : 'die';
  if (mode === 'flee') return 'sprint';
  const speed = pedSpeed(ped);
  if (speed < IDLE_SPEED) return 'idle';
  if (speed < SPRINT_SPEED) return 'walk';
  return 'sprint';
}

function playClip(kenney, name) {
  if (!kenney || !name) return;
  const actions = kenney.actions || {};
  const next = actions[name];
  if (!next) return;
  if (kenney._clip === name) return;
  const prev = kenney._clip ? actions[kenney._clip] : null;
  if (name === 'die' || name === 'fall') {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.reset();
  } else {
    next.setLoop(THREE.LoopRepeat, Infinity);
  }
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.play();
  if (prev && prev !== next && typeof next.crossFadeFrom === 'function') {
    next.crossFadeFrom(prev, CROSS_FADE, false);
  }
  kenney._clip = name;
}

function applyHeading(ped) {
  if (ped.object3d) {
    ped.object3d.rotation.y = ped.heading || 0;
  }
}

function setRootVisible(ped, visible) {
  const root = ped._kenney && ped._kenney.root;
  if (root) root.visible = visible;
}

/** Один пед: клипы и поворот. Mixer здесь не тикаем. Нет _kenney — тихий no-op. */
export function updatePedAnim(ped, dt, playerPos, frame) {
  if (!ped || !ped._kenney) return;
  applyHeading(ped);
  playClip(ped._kenney, chooseClip(ped));
}

function tickMixer(ped, dt, frame, dist) {
  const mixer = ped._kenney && ped._kenney.mixer;
  if (!mixer || typeof mixer.update !== 'function') return;
  if (dist > LOD_NEAR) {
    if ((frame | 0) % 3 !== 0) return;
    mixer.update(dt * 3);
    return;
  }
  mixer.update(dt);
}

/**
 * LOD по дистанции до игрока. object3d.visible не трогаем.
 * Пишет ped._lod: 'skinned' | 'instance' | 'hidden'.
 */
export function updateAllPedAnims(list, dt, playerPos, frame) {
  if (!list || !list.length) return;
  const f = frame | 0;
  const ranked = [];

  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    if (!ped) continue;
    const dist = distToPlayer(ped, playerPos);
    ped._dist = dist;
    if (dist > LOD_FAR) {
      ped._lod = 'hidden';
      setRootVisible(ped, false);
      continue;
    }
    ranked.push(ped);
  }

  ranked.sort((a, b) => a._dist - b._dist);

  for (let i = 0; i < ranked.length; i++) {
    const ped = ranked[i];
    if (i < MAX_SKINNED) {
      ped._lod = 'skinned';
      setRootVisible(ped, true);
      if (ped._kenney) {
        applyHeading(ped);
        playClip(ped._kenney, chooseClip(ped));
        tickMixer(ped, dt, f, ped._dist);
      }
    } else {
      ped._lod = 'instance';
      setRootVisible(ped, false);
    }
  }
}
