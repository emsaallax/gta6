// ФАЙЛЫ: src/world/city/neonSigns.js
/** Неоновые вывески Palmetto Bay на авеню и набережной. Без PointLight. */
import * as THREE from 'three';

export const NEON_NAMES = [
  'Mango Club',
  'Palmetto Diner',
  'Coral Inn',
  'Sunset Palms',
  'Neon Tide',
  'Flamingo Rosa',
];
export const SIGN_Y = 4.2;
export const NIGHT_EMISSIVE = 3;
export const NEON_HUM_MAX = 3;

const SIGN_W = 4.8;
const SIGN_H = 1.2;
const SIGN_D = 0.16;
const WALL_OUT = 0.08;
const NEON_HEX = ['#ff2fa0', '#19f0ff', '#9d4dff'];
const EPS = 1.25;
const BUILD_INSET = 2;

const signGeo = new THREE.BoxGeometry(SIGN_W, SIGN_H, SIGN_D);
const dummy = new THREE.Object3D();

let signMats = [];
let signMeshes = [];
/** @type {{ x: number, y: number, z: number }[]} */
let signPositions = [];
/** @type {({ set: Function, stop: Function } | null)[]} */
let humHandles = [null, null, null];
let animT = 0;

/**
 * Ночь 0..1 по CONTRACTS §1a.
 * @param {unknown} time
 * @returns {number}
 */
export function night01(time) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return 0;
  const t = time;
  if (t >= 19.5 || t < 5) return 1;
  if (t >= 6 && t < 18.5) return 0;
  if (t >= 18.5 && t <= 19.5) return t - 18.5;
  if (t >= 5 && t <= 6) return 1 - (t - 5);
  return 0;
}

function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function layoutBits(layout) {
  const grid = layout && layout.grid ? layout.grid : {};
  const ocean = layout && layout.ocean ? layout.ocean : {};
  return {
    xs: Array.isArray(grid.avenueXs) ? grid.avenueXs : [0],
    zs: Array.isArray(grid.avenueZs) ? grid.avenueZs : [400],
    promenadeZ: ocean.promenadeZ != null ? ocean.promenadeZ : 400,
    aw: typeof grid.avenueWidth === 'number' ? grid.avenueWidth : 22,
    sw: typeof grid.sidewalk === 'number' ? grid.sidewalk : 3.5,
  };
}

function facesStreet(edge, street, halfW, sidewalk, towardPositive) {
  const expected = towardPositive ? street + halfW + sidewalk : street - halfW - sidewalk;
  return near(edge, expected);
}

/**
 * Поза на фасаде к авеню / набережной. Вынос 0.08, центр y = SIGN_Y.
 * @returns {{ x: number, y: number, z: number, yaw: number } | null}
 */
function poseOnLotFace(lot, bits) {
  if (!lot) return null;
  const bx0 = lot.minX + BUILD_INSET;
  const bx1 = lot.maxX - BUILD_INSET;
  const bz0 = lot.minZ + BUILD_INSET;
  const bz1 = lot.maxZ - BUILD_INSET;
  const sx = bx1 - bx0;
  const sz = bz1 - bz0;
  if (!(sx >= SIGN_W + 0.4 || sz >= SIGN_W + 0.4)) return null;
  const half = bits.aw / 2;
  const stick = WALL_OUT + SIGN_D * 0.5;
  const y = SIGN_Y;

  const west = bits.xs.some((ax) => facesStreet(lot.minX, ax, half, bits.sw, true));
  const east = bits.xs.some((ax) => facesStreet(lot.maxX, ax, half, bits.sw, false));
  const south = bits.zs.some((az) => facesStreet(lot.minZ, az, half, bits.sw, true));
  const north =
    bits.zs.some((az) => facesStreet(lot.maxZ, az, half, bits.sw, false)) ||
    facesStreet(lot.maxZ, bits.promenadeZ, half, bits.sw, false) ||
    near(lot.maxZ + half + bits.sw, bits.promenadeZ);

  if (west && sz >= SIGN_W + 0.4) {
    return { x: bx0 - stick, y, z: (bz0 + bz1) / 2, yaw: -Math.PI / 2 };
  }
  if (east && sz >= SIGN_W + 0.4) {
    return { x: bx1 + stick, y, z: (bz0 + bz1) / 2, yaw: Math.PI / 2 };
  }
  if (north && sx >= SIGN_W + 0.4) {
    return { x: (bx0 + bx1) / 2, y, z: bz1 + stick, yaw: 0 };
  }
  if (south && sx >= SIGN_W + 0.4) {
    return { x: (bx0 + bx1) / 2, y, z: bz0 - stick, yaw: Math.PI };
  }
  return null;
}

function fallbackTwelve() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    out.push({ x: 0, y: SIGN_Y, z: -200 + i * 80, yaw: Math.PI / 2, nameI: i });
    out.push({ x: -200 + i * 80, y: SIGN_Y, z: 400, yaw: 0, nameI: i });
  }
  return out;
}

function makeSignTextures(name, fg) {
  const W = 512;
  const H = 128;
  function paint(emissive) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = emissive ? '#000000' : '#141018';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeText(name, W / 2, H / 2);
    ctx.fillStyle = fg;
    ctx.fillText(name, W / 2, H / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
  return { map: paint(false), emissiveMap: paint(true) };
}

function applyPose(mesh, index, pose) {
  dummy.position.set(pose.x, pose.y, pose.z);
  dummy.rotation.set(0, pose.yaw, 0);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function listenerPos(state) {
  const cam = state && state.cameraTarget && state.cameraTarget.position;
  if (cam && typeof cam.x === 'number') return { x: cam.x, y: cam.y, z: cam.z };
  const pl = state && state.player && state.player.position;
  if (pl && typeof pl.x === 'number') return { x: pl.x, y: pl.y, z: pl.z };
  return { x: 0, y: 0, z: 0 };
}

/**
 * @param {import('three').Scene} scene
 * @param {Array<{ minX: number, maxX: number, minZ: number, maxZ: number }>|null} lots
 * @param {object} layout
 * @returns {{ meshes: import('three').InstancedMesh[], mats: import('three').Material[], count: number }}
 */
export function buildNeonSigns(scene, lots, layout) {
  signMats = [];
  signMeshes = [];
  signPositions = [];
  humHandles = [null, null, null];
  animT = 1;

  const lists = [[], [], [], [], [], []];
  const bits = layoutBits(layout);
  const hasLots = lots && lots.length;

  if (hasLots) {
    let seq = 0;
    for (let i = 0; i < lots.length; i++) {
      const pose = poseOnLotFace(lots[i], bits);
      if (!pose) continue;
      lists[seq % 6].push(pose);
      seq += 1;
    }
  }

  const need = fallbackTwelve();
  let total = lists.reduce((s, a) => s + a.length, 0);
  if (!hasLots || total < 12) {
    for (let i = 0; i < need.length; i++) {
      const n = need[i];
      if (lists[n.nameI].length < 2) {
        lists[n.nameI].push({ x: n.x, y: n.y, z: n.z, yaw: n.yaw });
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    if (!lists[i].length) {
      const n = need[i];
      lists[i].push({ x: n.x, y: n.y, z: n.z, yaw: n.yaw });
    }
  }

  let count = 0;
  for (let i = 0; i < NEON_NAMES.length; i++) {
    const items = lists[i];
    const fg = NEON_HEX[i % NEON_HEX.length];
    const tex = makeSignTextures(NEON_NAMES[i], fg);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.map,
      emissive: 0xffffff,
      emissiveMap: tex.emissiveMap,
      emissiveIntensity: 0,
      roughness: 0.35,
      metalness: 0.15,
    });
    signMats.push(mat);
    const mesh = new THREE.InstancedMesh(signGeo, mat, Math.max(1, items.length));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.neonName = NEON_NAMES[i];
    for (let k = 0; k < items.length; k++) {
      applyPose(mesh, k, items[k]);
      signPositions.push({ x: items[k].x, y: items[k].y, z: items[k].z });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (scene && typeof scene.add === 'function') scene.add(mesh);
    signMeshes.push(mesh);
    count += items.length;
  }

  return { meshes: signMeshes, mats: signMats, count };
}

function flickerMul(nameI, t) {
  if (nameI === 0 || nameI === 3) return Math.sin(t * 8) > -0.2 ? 1 : 0;
  if (nameI === 1) return (t * 13) % 9 < 0.12 ? 0 : 1;
  return 1;
}

function updateHum(state, night) {
  const audio = state && state.audio;
  if (!audio || typeof audio.loop !== 'function') return;
  const lis = listenerPos(state);
  const ranked = signPositions.map((p, i) => {
    const dx = p.x - lis.x;
    const dz = p.z - lis.z;
    return { i, p, d2: dx * dx + dz * dz };
  });
  ranked.sort((a, b) => a.d2 - b.d2);

  for (let i = 0; i < NEON_HUM_MAX; i++) {
    const id = 'neon-' + i;
    const hit = ranked[i];
    const pos = hit ? hit.p : null;
    const volume = pos && night > 0 ? night * 0.12 : 0;
    const payload = { pos: pos || { x: 0, y: 0, z: 0 }, volume };
    try {
      if (!humHandles[i]) {
        const h = audio.loop(id, 'neon', payload);
        humHandles[i] = h && typeof h.set === 'function' ? h : { set() {}, stop() {} };
      } else {
        humHandles[i].set({ pos: payload.pos, volume: payload.volume });
      }
    } catch (e) {
      void e;
    }
  }
}

/**
 * Ночь и мигание. State не писать. Без PointLight.
 * @param {number} dt
 * @param {{ state?: object }} engine
 */
export function updateNeonSigns(dt, engine) {
  const state = engine && engine.state ? engine.state : null;
  const tHours = state ? state.time : undefined;
  const night = night01(tHours);
  const step = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
  animT += step;
  const t = animT;
  const base = night * NIGHT_EMISSIVE;
  for (let i = 0; i < signMats.length; i++) {
    signMats[i].emissiveIntensity = base * flickerMul(i, t);
  }
  updateHum(state, night);
}
