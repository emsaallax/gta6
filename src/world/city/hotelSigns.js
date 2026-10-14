// ФАЙЛЫ: src/world/city/hotelSigns.js
// Вывески отелей на широкой грани корпуса, высота этажа. Индекс имени — порядок пляжных лотов, не lot.id.
import * as THREE from 'three';

export const HOTEL_NAMES = ['Coral Inn', 'Flamingo Rosa', 'Neon Tide', 'Sunset Palms'];
export const SIGN_Y = 3.6;

const SIGN_W = 4.8;
const SIGN_H = 1.2;
const SIGN_D = 0.16;
const WALL_OUT = 0.08;
const SIGN_BG = ['#2a2030', '#4a1830', '#102830', '#302010'];
const SIGN_FG = ['#19f0ff', '#ff2fa0', '#e8f06a', '#ffc4a3'];
const NIGHT_EMISSIVE = 3;

const signGeo = new THREE.BoxGeometry(SIGN_W, SIGN_H, SIGN_D);
const dummy = new THREE.Object3D();

let signMats = [];
let signMeshes = [];

/**
 * Индекс имени по порядковому номеру пляжного лота.
 * @param {number} beachIndex
 * @returns {0|1|2|3}
 */
export function hotelNameIndex(beachIndex) {
  const n = Number(beachIndex);
  if (!Number.isFinite(n)) return 0;
  return ((n % 4) + 4) % 4;
}

function isNight(t) {
  return typeof t === 'number' && Number.isFinite(t) && (t < 6 || t >= 19.5);
}

function beachLots(lots) {
  const out = [];
  if (!lots || !lots.length) return out;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot) continue;
    if (lot.district === 'beach' && lot.cz < 440) out.push(lot);
  }
  return out;
}

function fallbackPose(nameI) {
  const x = nameI % 2 === 0 ? -8 : 8;
  return { x, y: SIGN_Y, z: 400, yaw: 0 };
}

/** Корпус как в buildings: minX+2..maxX-2; широкая грань, вынос 0.08. */
function poseOnLot(lot) {
  const bx0 = lot.minX + 2;
  const bx1 = lot.maxX - 2;
  const bz0 = lot.minZ + 2;
  const bz1 = lot.maxZ - 2;
  const sx = bx1 - bx0;
  const sz = bz1 - bz0;
  if (!(sx >= 6 && sz >= 6)) return null;
  const faceOnZ = sx >= sz;
  const faceW = faceOnZ ? sx : sz;
  if (faceW < SIGN_W + 0.4) return null;
  const stick = WALL_OUT + SIGN_D * 0.5;
  if (faceOnZ) {
    return {
      x: (bx0 + bx1) / 2,
      y: SIGN_Y,
      z: bz1 + stick,
      yaw: 0,
    };
  }
  return {
    x: bx1 + stick,
    y: SIGN_Y,
    z: (bz0 + bz1) / 2,
    yaw: Math.PI / 2,
  };
}

function makeSignTextures(name, bg, fg) {
  const W = 512;
  const H = 128;
  function paint(emissive) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = emissive ? '#000000' : bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = emissive ? fg : '#f4ecd6';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = emissive ? fg : '#f4ecd6';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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

/**
 * @param {import('three').Scene} scene
 * @param {Array<{ district: string, cz: number, minX: number, maxX: number, minZ: number, maxZ: number }>} lots
 * @returns {{ meshes: import('three').InstancedMesh[], mats: import('three').Material[] }}
 */
export function buildHotelSigns(scene, lots) {
  signMats = [];
  signMeshes = [];
  const lists = [[], [], [], []];
  const beach = beachLots(lots);
  for (let i = 0; i < beach.length; i++) {
    const nameI = hotelNameIndex(i);
    const pose = poseOnLot(beach[i]);
    if (pose) lists[nameI].push(pose);
  }
  for (let i = 0; i < 4; i++) {
    if (!lists[i].length) lists[i].push(fallbackPose(i));
  }

  for (let i = 0; i < HOTEL_NAMES.length; i++) {
    const items = lists[i];
    const tex = makeSignTextures(HOTEL_NAMES[i], SIGN_BG[i], SIGN_FG[i]);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.map,
      emissive: 0xffffff,
      emissiveMap: tex.emissiveMap,
      emissiveIntensity: 0,
      roughness: 0.45,
      metalness: 0.1,
    });
    signMats.push(mat);
    const mesh = new THREE.InstancedMesh(signGeo, mat, items.length);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (let k = 0; k < items.length; k++) applyPose(mesh, k, items[k]);
    mesh.instanceMatrix.needsUpdate = true;
    if (scene && typeof scene.add === 'function') scene.add(mesh);
    signMeshes.push(mesh);
  }
  return { meshes: signMeshes, mats: signMats };
}

/**
 * Ночь по state.time: < 6 или >= 19.5. state не писать. Без PointLight.
 * @param {number} dt
 * @param {{ state?: { time?: number } }} engine
 */
export function updateHotelSigns(dt, engine) {
  void dt;
  const t = engine && engine.state ? engine.state.time : undefined;
  const intensity = isNight(t) ? NIGHT_EMISSIVE : 0;
  for (let i = 0; i < signMats.length; i++) {
    signMats[i].emissiveIntensity = intensity;
  }
}
