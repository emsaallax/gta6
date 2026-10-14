// Пляж, океан и парапет южного края Palmetto Bay.
import * as THREE from 'three';

const FALLBACK = {
  half: 600,
  beachZ0: 440,
  beachZ1: 500,
  waterZ: 500,
};

let waterMesh = null;
let sandMesh = null;
let shoreTime = 0;

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeWaterMap() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#5ed4e0');
  g.addColorStop(0.18, '#2aa8bc');
  g.addColorStop(0.45, '#156a88');
  g.addColorStop(1, '#06283c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#d8f6ff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    ctx.beginPath();
    const y = ((i + 0.5) / 36) * S;
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 12) {
      const wobble = Math.sin(x * 0.045 + i * 0.7) * 7;
      ctx.lineTo(x, y + wobble);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 50; i++) {
    const px = ((i * 97) % S) + 8;
    const py = ((i * 53) % (S * 0.7)) + S * 0.08;
    ctx.fillRect(px, py, 18 + (i % 5) * 4, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.repeat.set(6, 3);
  tex.needsUpdate = true;
  return tex;
}

function tintWaterGeo(geo, depth) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const near = new THREE.Color(0x7ee8ee);
  const far = new THREE.Color(0x0a3048);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = 0.5 - pos.getY(i) / depth;
    const u = Math.min(1, Math.max(0, t));
    c.copy(near).lerp(far, u);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

export function buildShore(engine, layout) {
  const scene = engine.scene;
  const ocean = layout && layout.ocean ? layout.ocean : {};
  const half = num(layout && layout.half, FALLBACK.half);
  const beachZ0 = num(ocean.beachZ0, FALLBACK.beachZ0);
  const beachZ1 = num(ocean.beachZ1, FALLBACK.beachZ1);
  const waterZ = num(ocean.waterZ, FALLBACK.waterZ);

  const sandWidth = Math.max(1400, half * 2 + 200);
  const sandDepth = Math.max(1, beachZ1 - beachZ0);
  sandMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sandWidth, sandDepth),
    new THREE.MeshStandardMaterial({
      color: 0xe8d5a3,
      roughness: 0.95,
      metalness: 0.02,
    })
  );
  sandMesh.rotation.x = -Math.PI / 2;
  sandMesh.position.set(0, 0.02, (beachZ0 + beachZ1) * 0.5);
  sandMesh.receiveShadow = true;
  scene.add(sandMesh);

  const waterWidth = Math.max(1600, sandWidth + 200);
  const waterDepth = 800;
  const waterGeo = new THREE.PlaneGeometry(waterWidth, waterDepth, 1, 32);
  tintWaterGeo(waterGeo, waterDepth);
  waterMesh = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeWaterMap(),
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      metalness: 0.38,
      roughness: 0.16,
    })
  );
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, 0.01, waterZ + waterDepth * 0.5);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  const parapet = new THREE.Mesh(
    new THREE.BoxGeometry(1400, 0.9, 0.5),
    new THREE.MeshStandardMaterial({
      color: 0xcfc8bb,
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  parapet.position.set(0, 0.45, beachZ0);
  parapet.castShadow = true;
  parapet.receiveShadow = true;
  scene.add(parapet);

  const boardWidth = 42;
  const boardLen = 8;
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0x8b6914,
    roughness: 0.85,
    metalness: 0.0,
  });
  const boardYs = 0.04;
  const boardZ = 430;
  const boardOffsets = [-90, -45, 0, 45, 90];
  const plankGeo = new THREE.BoxGeometry(boardWidth, 0.08, boardLen);
  const planks = new THREE.InstancedMesh(plankGeo, boardMat, boardOffsets.length);
  planks.receiveShadow = true;
  planks.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boardOffsets.length; i++) {
    dummy.position.set(boardOffsets[i], boardYs, boardZ);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    planks.setMatrixAt(i, dummy.matrix);
  }
  planks.instanceMatrix.needsUpdate = true;
  scene.add(planks);
}

/** Скрыть процедурный песок, когда загрузился PBR coast_sand_01. Воду не трогает. */
export function setShoreSandVisible(on) {
  if (sandMesh) sandMesh.visible = !!on;
}

export function updateShore(dt, _engine) {
  if (!waterMesh) return;
  const step = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
  shoreTime += step;
  waterMesh.position.y = 0.04 + Math.sin(shoreTime * 1.2) * 0.06;
  waterMesh.rotation.z = Math.sin(shoreTime * 0.7) * 0.012;
  const map = waterMesh.material && waterMesh.material.map;
  if (map) {
    map.offset.x = shoreTime * 0.01;
    map.offset.y = Math.sin(shoreTime * 0.28) * 0.02;
  }
}
