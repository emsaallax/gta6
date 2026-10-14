// ФАЙЛЫ: src/player/kenney-hero.js
// Герой Kenney: клипы idle/walk/sprint/jump/стрельба/удар/drive. Без ассетов — null.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const HERO_PATH = 'assets/models/kenney/mini-characters/character-male-a.glb';
export const TARGET_HEIGHT = 1.75;

const FADE = 0.15;

const CLIP_KEYS = ['idle', 'walk', 'sprint', 'jump', 'drive', 'die'];
const CLIP_ALIASES = {
  shoot: 'holding-right-shoot',
  melee: 'attack-melee-right',
};

function findClip(clips, name) {
  if (!clips || !name) return null;
  const lower = name.toLowerCase();
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (c && c.name === name) return c;
  }
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (c && String(c.name).toLowerCase() === lower) return c;
  }
  return null;
}

function cloneRoot(assets, gltf) {
  if (assets && typeof assets.cloneGLB === 'function') {
    const cloned = assets.cloneGLB(gltf);
    if (cloned && cloned.isObject3D) return cloned;
    if (cloned && cloned.scene && cloned.scene.isObject3D) return cloned.scene;
  }
  return SkeletonUtils.clone(gltf.scene);
}

function fitHeightAndFeet(object3d) {
  object3d.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object3d);
  const height = box.max.y - box.min.y;
  if (height > 1e-6) {
    const s = TARGET_HEIGHT / height;
    object3d.scale.multiplyScalar(s);
  }
  object3d.updateMatrixWorld(true);
  box.setFromObject(object3d);
  object3d.position.y -= box.min.y;
  object3d.updateMatrixWorld(true);
}

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
}

function playAction(hero, name) {
  const next = hero.actions[name];
  if (!next) return;

  if (hero._clip === name && name !== 'melee') return;

  const prev = hero._clip ? hero.actions[hero._clip] : null;

  if (name === 'melee') {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    const clip = next.getClip();
    hero._meleeLeft = clip && clip.duration ? clip.duration : 0.4;
  } else {
    next.setLoop(THREE.LoopRepeat);
    next.clampWhenFinished = false;
    hero._meleeLeft = 0;
  }

  next.reset();
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.play();

  if (prev && prev !== next) {
    prev.crossFadeTo(next, FADE, true);
  } else {
    next.fadeIn(FADE);
  }

  hero._clip = name;
}

function pickClip(hero, flags) {
  const a = hero.actions;
  const meleeHold = hero._meleeLeft > 0;

  if (flags.dead && a.die) return 'die';
  if (flags.inVehicle && a.drive) return 'drive';
  if ((flags.melee && flags.weapon === 'fist' && a.melee) || (meleeHold && a.melee && !flags.dead && !flags.inVehicle)) {
    return 'melee';
  }
  if (flags.aiming && flags.weapon === 'pistol' && a.shoot) return 'shoot';
  if ((!flags.grounded || flags.gait === 'jump') && a.jump) return 'jump';
  if (flags.gait === 'run' && a.sprint) return 'sprint';
  if (flags.gait === 'walk' && a.walk) return 'walk';
  if (a.idle) return 'idle';
  return null;
}

export async function loadKenneyHero(assets) {
  if (!assets || typeof assets.loadGLB !== 'function') return null;

  let gltf;
  try {
    gltf = await assets.loadGLB(HERO_PATH);
  } catch {
    return null;
  }
  if (!gltf || !gltf.scene) return null;

  let visual;
  try {
    visual = cloneRoot(assets, gltf);
  } catch {
    return null;
  }
  if (!visual || !visual.isObject3D) return null;

  const object3d = new THREE.Group();
  object3d.name = 'kenneyHero';
  object3d.rotation.y = 0;
  // Kenney смотрит в −Z. Разворот на внутреннем клоне: ход героя каждый кадр
  // пишет object3d.rotation.y = heading и стёр бы Math.PI на обёртке.
  visual.rotation.y = Math.PI;
  object3d.add(visual);
  fitHeightAndFeet(object3d);
  enableShadows(object3d);

  const mixer = new THREE.AnimationMixer(visual);
  const clips = gltf.animations || [];
  const actions = {
    idle: undefined,
    walk: undefined,
    sprint: undefined,
    jump: undefined,
    drive: undefined,
    die: undefined,
    shoot: undefined,
    melee: undefined,
  };

  for (let i = 0; i < CLIP_KEYS.length; i++) {
    const key = CLIP_KEYS[i];
    const clip = findClip(clips, key);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  const shootClip = findClip(clips, CLIP_ALIASES.shoot);
  if (shootClip) actions.shoot = mixer.clipAction(shootClip);
  const meleeClip = findClip(clips, CLIP_ALIASES.melee);
  if (meleeClip) actions.melee = mixer.clipAction(meleeClip);

  return {
    object3d,
    mixer,
    actions,
    _clip: null,
    _meleeLeft: 0,
  };
}

export function updateKenneyHero(hero, flags, dt) {
  if (!hero || !hero.mixer) return;

  const t = typeof dt === 'number' && dt > 0 ? dt : 0;
  if (hero._meleeLeft > 0) {
    hero._meleeLeft -= t;
    if (hero._meleeLeft < 0) hero._meleeLeft = 0;
  }

  const name = pickClip(hero, flags || {});
  if (name) {
    const punchAgain =
      name === 'melee' &&
      flags &&
      flags.melee &&
      flags.weapon === 'fist' &&
      hero._meleeLeft <= 0;
    if (hero._clip !== name || punchAgain) playAction(hero, name);
  }

  hero.mixer.update(t);
}
