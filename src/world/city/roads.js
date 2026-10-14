// Улицы Palmetto Bay: трава, асфальт, тротуары, разметка. Физику не трогаем.
import * as THREE from 'three';

const EPS = 0.05;
const MARK_Y = 0.06;
const DASH_LEN = 3;
const DASH_STEP = 7;
const DASH_W = 0.18;
const DASH_H = 0.03;
const STOP_GAP = 9;
const STOP_THICK = 0.45;
const CENTER_GAP = 0.28;

function hasValue(list, v) {
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - v) < EPS) return true;
  }
  return false;
}

function widthForX(layout, x) {
  return hasValue(layout.grid.avenueXs, x) ? layout.grid.avenueWidth : layout.grid.streetWidth;
}

function widthForZ(layout, z) {
  return hasValue(layout.grid.avenueZs, z) ? layout.grid.avenueWidth : layout.grid.streetWidth;
}

function kindForX(layout, x) {
  return hasValue(layout.grid.avenueXs, x) ? 'avenue' : 'street';
}

function kindForZ(layout, z) {
  if (Math.abs(z - layout.ocean.promenadeZ) < EPS) return 'promenade';
  return hasValue(layout.grid.avenueZs, z) ? 'avenue' : 'street';
}

function makeGrassMap() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a7d44';
  ctx.fillRect(0, 0, S, S);
  const patches = [
    ['#2d6a38', 70],
    ['#4a9250', 55],
    ['#356b3c', 40],
    ['#5aa65a', 28],
    ['#2a5c32', 22],
  ];
  for (let p = 0; p < patches.length; p++) {
    ctx.fillStyle = patches[p][0];
    const n = patches[p][1];
    for (let i = 0; i < n; i++) {
      const seed = Math.sin((p + 1) * 19.7 + (i + 1) * 41.3) * 43758.5453;
      const u = seed - Math.floor(seed);
      const seed2 = Math.sin((p + 3) * 11.1 + (i + 2) * 27.9) * 23421.123;
      const v = seed2 - Math.floor(seed2);
      const seed3 = Math.sin((p + 5) * 7.3 + (i + 4) * 13.7) * 9123.45;
      const w = seed3 - Math.floor(seed3);
      const x = u * S;
      const y = v * S;
      const r = 6 + w * 18;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.repeat.set(80, 80);
  tex.needsUpdate = true;
  return tex;
}

let pavedMeshes = [];
let pavedWetMats = [];

function addInstancedPlanes(scene, geo, mat, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  dummy.rotation.x = -Math.PI / 2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x, it.y, it.z);
    dummy.scale.set(it.sx, it.sz, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  pavedMeshes.push(mesh);
  return mesh;
}

/** Скрыть плоский асфальт/тротуар/разметку, когда загрузился PBR. Траву не трогает. */
export function setPavedVisible(on) {
  for (let i = 0; i < pavedMeshes.length; i++) {
    if (pavedMeshes[i]) pavedMeshes[i].visible = !!on;
  }
}

/** Асфальт и тротуар процедурного грунта — запас, если PBR не встал. */
export function getPavedWetMats() {
  return pavedWetMats;
}

/**
 * Строит видимую сетку улиц и возвращает отрезки для state.city.roads.
 * В engine.state не пишет.
 */
export function buildRoads(engine, layout) {
  pavedMeshes = [];
  pavedWetMats = [];
  const scene = engine.scene;
  const grid = layout.grid;
  const xs = grid.xs.slice().sort((a, b) => a - b);
  const zs = grid.zs.slice().sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const sidewalkW = grid.sidewalk;
  const spanX = xMax - xMin;
  const spanZ = zMax - zMin;

  const matGrass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeGrassMap(),
    roughness: 1,
  });
  const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95 });
  const matAvenue = new THREE.MeshStandardMaterial({ color: 0x35353a, roughness: 0.95 });
  const matWalk = new THREE.MeshStandardMaterial({ color: 0xb7b3a8, roughness: 0.9 });
  const matMark = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });

  const unit = new THREE.PlaneGeometry(1, 1);

  // Трава 2000×2000, южный край у пляжа (z=440), чтобы не спорить с песком.
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), matGrass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, 440 - 1000);
  grass.receiveShadow = true;
  scene.add(grass);

  const roads = [];

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const width = widthForX(layout, x);
    const kind = kindForX(layout, x);
    roads.push({ x1: x, z1: zMin, x2: x, z2: zMax, width, kind });
  }
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const width = widthForZ(layout, z);
    const kind = kindForZ(layout, z);
    roads.push({ x1: xMin, z1: z, x2: xMax, z2: z, width, kind });
  }

  const streetPlanes = [];
  const avenuePlanes = [];
  const walkPlanes = [];
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    const ns = Math.abs(r.x2 - r.x1) < EPS;
    const asphalt = r.kind === 'street' ? streetPlanes : avenuePlanes;
    if (ns) {
      asphalt.push({ x: r.x1, y: 0.02, z: (r.z1 + r.z2) / 2, sx: r.width, sz: spanZ });
      const ox = r.width / 2 + sidewalkW / 2;
      walkPlanes.push({ x: r.x1 - ox, y: 0.05, z: (r.z1 + r.z2) / 2, sx: sidewalkW, sz: spanZ });
      walkPlanes.push({ x: r.x1 + ox, y: 0.05, z: (r.z1 + r.z2) / 2, sx: sidewalkW, sz: spanZ });
    } else {
      asphalt.push({ x: (r.x1 + r.x2) / 2, y: 0.02, z: r.z1, sx: spanX, sz: r.width });
      const oz = r.width / 2 + sidewalkW / 2;
      walkPlanes.push({ x: (r.x1 + r.x2) / 2, y: 0.05, z: r.z1 - oz, sx: spanX, sz: sidewalkW });
      walkPlanes.push({ x: (r.x1 + r.x2) / 2, y: 0.05, z: r.z1 + oz, sx: spanX, sz: sidewalkW });
    }
  }
  addInstancedPlanes(scene, unit, matAsphalt, streetPlanes);
  addInstancedPlanes(scene, unit, matAvenue, avenuePlanes);
  addInstancedPlanes(scene, unit, matWalk, walkPlanes);
  pavedWetMats = [matAsphalt, matAvenue, matWalk];

  const dummy = new THREE.Object3D();
  const markMatrices = [];

  function pushBox(x, y, z, sx, sy, sz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    markMatrices.push(dummy.matrix.clone());
  }

  function dashesAlongZ(x, z0, z1, xOff) {
    const start = z0 + DASH_LEN * 0.5;
    const end = z1 - DASH_LEN * 0.5;
    for (let z = start; z <= end; z += DASH_STEP) {
      pushBox(x + xOff, MARK_Y, z, DASH_W, DASH_H, DASH_LEN);
    }
  }

  function dashesAlongX(z, x0, x1, zOff) {
    const start = x0 + DASH_LEN * 0.5;
    const end = x1 - DASH_LEN * 0.5;
    for (let x = start; x <= end; x += DASH_STEP) {
      pushBox(x, MARK_Y, z + zOff, DASH_LEN, DASH_H, DASH_W);
    }
  }

  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    const ns = Math.abs(r.x2 - r.x1) < EPS;
    const doubleLine = r.kind === 'avenue' || r.kind === 'promenade';
    if (ns) {
      if (doubleLine) {
        dashesAlongZ(r.x1, r.z1, r.z2, -CENTER_GAP);
        dashesAlongZ(r.x1, r.z1, r.z2, CENTER_GAP);
      } else {
        dashesAlongZ(r.x1, r.z1, r.z2, 0);
      }
    } else if (doubleLine) {
      dashesAlongX(r.z1, r.x1, r.x2, -CENTER_GAP);
      dashesAlongX(r.z1, r.x1, r.x2, CENTER_GAP);
    } else {
      dashesAlongX(r.z1, r.x1, r.x2, 0);
    }
  }

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (kindForX(layout, x) !== 'avenue') continue;
    const w = widthForX(layout, x);
    for (let j = 0; j < zs.length; j++) {
      const z = zs[j];
      const zA = z - STOP_GAP;
      const zB = z + STOP_GAP;
      if (zA > zMin + 1) pushBox(x, MARK_Y, zA, w - 1, DASH_H, STOP_THICK);
      if (zB < zMax - 1) pushBox(x, MARK_Y, zB, w - 1, DASH_H, STOP_THICK);
    }
  }
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j];
    if (kindForZ(layout, z) === 'street') continue;
    const w = widthForZ(layout, z);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const xA = x - STOP_GAP;
      const xB = x + STOP_GAP;
      if (xA > xMin + 1) pushBox(xA, MARK_Y, z, STOP_THICK, DASH_H, w - 1);
      if (xB < xMax - 1) pushBox(xB, MARK_Y, z, STOP_THICK, DASH_H, w - 1);
    }
  }

  if (markMatrices.length > 0) {
    const markGeo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(markGeo, matMark, markMatrices.length);
    inst.receiveShadow = true;
    for (let i = 0; i < markMatrices.length; i++) {
      inst.setMatrixAt(i, markMatrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    scene.add(inst);
  }

  return roads;
}
