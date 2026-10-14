// Здания Palmetto Bay: корпус на участок, коллизии, окна, неон, вывески.
// Даунтаун не ставим — его рисует skyline.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFacadeArt } from './facadeArt.js';

const TILE = 8;
const SIGN_W = 4.8;
const SIGN_H = 1.2;
const SIGN_D = 0.16;
const SIGN_Y = 3.6;
const SIGN_NAMES = ['Coral Inn', 'Flamingo Rosa', 'Neon Tide', 'Sunset Palms'];
const SIGN_BG = ['#2a2030', '#4a1830', '#102830', '#302010'];
const SIGN_FG = ['#19f0ff', '#ff2fa0', '#e8f06a', '#ffc4a3'];

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const signBox = new THREE.BoxGeometry(SIGN_W, SIGN_H, SIGN_D);

const HEIGHT = {
  downtown: [48, 120],
  beach: [14, 28],
  port: [8, 22],
  residential: [6, 12],
};

function rand01(id, salt) {
  const n = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerpH(district, id) {
  const [a, b] = HEIGHT[district];
  return a + rand01(id, 3) * (b - a);
}

function pick(arr, id, salt) {
  return arr[Math.floor(rand01(id, salt) * arr.length) % arr.length];
}

const windowMats = [];
const neonMats = [];
const signMats = [];

function nightFactor(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 0;
  if (t >= 19.5 || t < 5) return 1;
  if (t >= 6 && t < 18.5) return 0;
  if (t >= 18.5) return t - 18.5;
  return 1 - (t - 5);
}

function facadeIndex(district) {
  if (district === 'port') return 3;
  if (district === 'beach') return 1;
  return 0;
}

function makeWindowMat(metalness, roughness, facade) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: facade.map,
    emissive: 0xfff2c8,
    emissiveMap: facade.emissiveMap,
    emissiveIntensity: 0,
    metalness,
    roughness,
  });
  windowMats.push(mat);
  return mat;
}

function boxMeterGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const faceRepeat = [
    [sz / TILE, sy / TILE],
    [sz / TILE, sy / TILE],
    [sx / TILE, sz / TILE],
    [sx / TILE, sz / TILE],
    [sx / TILE, sy / TILE],
    [sx / TILE, sy / TILE],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const vi = f * 4 + i;
      uv.setXY(vi, uv.getX(vi) * faceRepeat[f][0], uv.getY(vi) * faceRepeat[f][1]);
    }
  }
  g.setAttribute('uv2', uv.clone());
  return g;
}

const bodyBatches = new Map();
const neonBatches = new Map();
const signLists = [[], [], [], []];
const roofItems = [];
let roofMesh = null;
let clayRoofMat = null;

function addBody(physics, mat, minX, maxX, minZ, maxZ, height, y0) {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  let list = bodyBatches.get(mat);
  if (!list) {
    list = [];
    bodyBatches.set(mat, list);
  }
  list.push({
    x: (minX + maxX) / 2,
    y: y0 + height / 2,
    z: (minZ + maxZ) / 2,
    sx,
    sy: height,
    sz,
  });
  physics.addBox({
    minX,
    maxX,
    minZ,
    maxZ,
    height,
    minY: y0,
    maxY: y0 + height,
  });
}

function flushMerged(scene, batches, castShadow) {
  for (const [mat, items] of batches) {
    if (!items.length) continue;
    const geos = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const g = boxMeterGeo(it.sx, it.sy, it.sz);
      g.translate(it.x, it.y, it.z);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function flushInstanced(scene, batches, geo, castShadow) {
  const dummy = new THREE.Object3D();
  for (const [mat, items] of batches) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

function addRoof(minX, maxX, minZ, maxZ, yTop) {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  if (sx < 4 || sz < 4) return;
  roofItems.push({
    x: (minX + maxX) / 2,
    y: yTop + 0.18,
    z: (minZ + maxZ) / 2,
    sx: sx + 0.35,
    sy: 0.36,
    sz: sz + 0.35,
  });
}

function addNeon(lot, minX, maxX, minZ, maxZ, height, y0) {
  if (lot.id % 10 >= 3) return;
  const color = pick([0xff4fa3, 0x4ecbff, 0xe8f06a], lot.id, 21);
  let mat = neonMats.find((m) => m.userData.neonColor === color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0,
      metalness: 0.3,
      roughness: 0.4,
    });
    mat.userData.neonColor = color;
    neonMats.push(mat);
  }
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  const faceOnZ = sx >= sz;
  const w = Math.min(faceOnZ ? sx : sz, 8) * 0.55;
  const h = Math.min(1.4, height * 0.18);
  const y = y0 + height * 0.62;
  let list = neonBatches.get(mat);
  if (!list) {
    list = [];
    neonBatches.set(mat, list);
  }
  if (faceOnZ) {
    list.push({ x: (minX + maxX) / 2, y, z: maxZ + 0.12, sx: w, sy: h, sz: 0.18 });
  } else {
    list.push({ x: maxX + 0.12, y, z: (minZ + maxZ) / 2, sx: 0.18, sy: h, sz: w });
  }
}

function makeSignTextures(name, bg, fg) {
  const W = 512;
  const H = 128;
  function paint(emissive) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
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

function addBeachSign(lot, minX, maxX, minZ, maxZ, y0) {
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  const faceOnZ = sx >= sz;
  const faceW = faceOnZ ? sx : sz;
  if (faceW < SIGN_W + 0.4) return;
  const nameI = ((lot.id % 4) + 4) % 4;
  const y = y0 + SIGN_Y;
  if (faceOnZ) {
    signLists[nameI].push({
      x: (minX + maxX) / 2,
      y,
      z: maxZ + SIGN_D * 0.5 + 0.05,
      yaw: 0,
    });
  } else {
    signLists[nameI].push({
      x: maxX + SIGN_D * 0.5 + 0.05,
      y,
      z: (minZ + maxZ) / 2,
      yaw: Math.PI / 2,
    });
  }
}

function flushSigns(scene) {
  const dummy = new THREE.Object3D();
  for (let i = 0; i < SIGN_NAMES.length; i++) {
    const items = signLists[i];
    const tex = makeSignTextures(SIGN_NAMES[i], SIGN_BG[i], SIGN_FG[i]);
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
    const count = Math.max(items.length, 1);
    const mesh = new THREE.InstancedMesh(signBox, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (items.length) {
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
    } else {
      dummy.position.set(0, -80, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.01, 0.01, 0.01);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

export function buildBuildings(engine, layout, opts) {
  const skipSigns = !!(opts && opts.skipSigns);
  windowMats.length = 0;
  neonMats.length = 0;
  signMats.length = 0;
  roofItems.length = 0;
  roofMesh = null;
  bodyBatches.clear();
  neonBatches.clear();
  for (let i = 0; i < signLists.length; i++) signLists[i] = [];
  const facades = createFacadeArt();
  const matByDistrict = {
    beach: makeWindowMat(0.12, 0.55, facades[facadeIndex('beach')]),
    port: makeWindowMat(0.25, 0.75, facades[facadeIndex('port')]),
    residential: makeWindowMat(0.08, 0.85, facades[facadeIndex('residential')]),
  };
  const lots = (layout && layout.lots) || [];

  for (const lot of lots) {
    if (lot.cz >= 440) continue;
    const district = lot.district;
    if (district === 'downtown') continue;
    if (!HEIGHT[district]) continue;
    const mat = matByDistrict[district];
    if (!mat) continue;

    const bx0 = lot.minX + 2;
    const bx1 = lot.maxX - 2;
    const bz0 = lot.minZ + 2;
    const bz1 = lot.maxZ - 2;
    if (bx1 - bx0 < 6 || bz1 - bz0 < 6) continue;

    const h = lerpH(district, lot.id);

    if (district === 'beach') {
      const hLow = h * 0.42;
      const hHigh = h - hLow;
      addBody(engine.physics, mat, bx0, bx1, bz0, bz1, hLow, 0);
      if (!skipSigns) addBeachSign(lot, bx0, bx1, bz0, bz1, 0);
      const inset = 2;
      const ux0 = bx0 + inset;
      const ux1 = bx1 - inset;
      const uz0 = bz0 + inset;
      const uz1 = bz1 - inset;
      if (ux1 - ux0 >= 4 && uz1 - uz0 >= 4) {
        addBody(engine.physics, mat, ux0, ux1, uz0, uz1, hHigh, hLow);
        addNeon(lot, ux0, ux1, uz0, uz1, hHigh, hLow);
      } else {
        addNeon(lot, bx0, bx1, bz0, bz1, hLow, 0);
      }
    } else {
      addBody(engine.physics, mat, bx0, bx1, bz0, bz1, h, 0);
    }
    if (h < 16) addRoof(bx0, bx1, bz0, bz1, h);
  }

  flushMerged(engine.scene, bodyBatches, true);
  flushInstanced(engine.scene, neonBatches, unitBox, false);
  clayRoofMat = new THREE.MeshStandardMaterial({
    color: 0xc45c38,
    roughness: 0.85,
    metalness: 0.02,
  });
  if (roofItems.length) {
    const geos = [];
    for (let i = 0; i < roofItems.length; i++) {
      const it = roofItems[i];
      const g = boxMeterGeo(it.sx, it.sy, it.sz);
      g.translate(it.x, it.y, it.z);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (let i = 0; i < geos.length; i++) geos[i].dispose();
    if (merged) {
      roofMesh = new THREE.Mesh(merged, clayRoofMat);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      engine.scene.add(roofMesh);
    }
  }
  if (!skipSigns) flushSigns(engine.scene);
}

/** PBR-нормали и ARM на уже собранные фасады. Карту окон canvas не снимаем. */
export function applyBuildingPbr(pbr) {
  if (!pbr || !pbr.usedAssets) return;
  if (pbr.facades && pbr.facades.length) {
    for (let i = 0; i < windowMats.length; i++) {
      const src = pbr.facades[i % pbr.facades.length];
      const maps = (src && src.maps) || {};
      const mat = windowMats[i];
      if (maps.normalMap) {
        mat.normalMap = maps.normalMap;
        mat.normalScale = new THREE.Vector2(1, 1);
      }
      const arm = maps.aoRoughnessMetalness || maps.arm;
      if (arm) {
        mat.aoMap = arm;
        mat.roughnessMap = arm;
        mat.metalnessMap = arm;
      }
      mat.needsUpdate = true;
    }
  }
  if (pbr.roof && pbr.roof.mat && roofMesh) {
    roofMesh.material = pbr.roof.mat;
    roofMesh.material.needsUpdate = true;
  }
}

/** Материалы окон (не неон). Сборщик регистрирует в windowNight. */
export function getBuildingWindowMats() {
  return windowMats;
}

export function updateBuildings(dt, engine) {
  void dt;
  const t = engine.state && engine.state.time;
  const f = nightFactor(t);
  const neonI = 3 * f;
  for (let i = 0; i < neonMats.length; i++) neonMats[i].emissiveIntensity = neonI;
  for (let i = 0; i < signMats.length; i++) signMats[i].emissiveIntensity = neonI;
}
