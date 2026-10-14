/** Пляж: вышки и пирс. Зонты и шезлонги — группа 5. Только InstancedMesh / один настил. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TOWERS = [
  { x: -240, z: 470 },
  { x: -40, z: 475 },
  { x: 120, z: 470 },
];

const WOOD = 0x8b6914;

const TOWER_POST_H = 5.6;
const TOWER_DECK_Y = 5.6;
const TOWER_ROOF_H = 1.7;

const PIER_Z0 = 500;
const PIER_Z1 = 560;
const PIER_W = 8;
const PIER_STEP = 8;
const PILE_XS = [-2.5, 2.5];

function applyInstance(mesh, index, dummy) {
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function makeInstanced(geo, mat, count, castShadow) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.castShadow = !!castShadow;
  mesh.receiveShadow = false;
  return mesh;
}

function paintGeo(geo, hex) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

export function buildBeachLife(engine, layout) {
  void layout;
  const scene = engine.scene;
  const dummy = new THREE.Object3D();

  const towerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    vertexColors: true,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: WOOD,
    roughness: 0.9,
  });

  // Вышка целиком (стойка + площадка + крыша) одной геометрией с цветом в вершинах: 1 DC вместо 3.
  const post = new THREE.CylinderGeometry(0.32, 0.38, TOWER_POST_H, 8);
  post.translate(0, TOWER_POST_H * 0.5, 0);
  paintGeo(post, 0xffffff);
  const deck = new THREE.BoxGeometry(5.6, 0.22, 4.4);
  deck.translate(0, TOWER_DECK_Y, 0);
  paintGeo(deck, 0xffffff);
  const roof = new THREE.ConeGeometry(3.4, TOWER_ROOF_H, 4);
  roof.rotateY(Math.PI * 0.25);
  roof.translate(0, TOWER_DECK_Y + 0.11 + TOWER_ROOF_H * 0.5, 0);
  paintGeo(roof, 0xff8a7a);
  const towerGeo = mergeGeometries([post, deck, roof], false);
  post.dispose();
  deck.dispose();
  roof.dispose();
  const towers = makeInstanced(towerGeo, towerMat, 3, false);
  for (let i = 0; i < 3; i++) {
    const t = TOWERS[i];
    dummy.position.set(t.x, 0, t.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    applyInstance(towers, i, dummy);
  }
  towers.instanceMatrix.needsUpdate = true;
  scene.add(towers);

  const pierLen = PIER_Z1 - PIER_Z0;
  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(PIER_W, 0.3, pierLen), woodMat);
  pierDeck.position.set(0, 0.15, (PIER_Z0 + PIER_Z1) * 0.5);
  pierDeck.castShadow = false;
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);

  const pileZs = [];
  for (let z = PIER_Z0; z <= PIER_Z1; z += PIER_STEP) pileZs.push(z);
  const pileCount = pileZs.length * PILE_XS.length;
  const pileH = 2.2;
  const piles = makeInstanced(new THREE.CylinderGeometry(0.22, 0.26, pileH, 6), woodMat, pileCount, false);
  let pi = 0;
  for (let r = 0; r < PILE_XS.length; r++) {
    for (let k = 0; k < pileZs.length; k++) {
      dummy.position.set(PILE_XS[r], -0.4, pileZs[k]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      applyInstance(piles, pi, dummy);
      pi += 1;
    }
  }
  piles.instanceMatrix.needsUpdate = true;
  scene.add(piles);
}

export function updateBeachLife(dt, engine) {
  void dt;
  void engine;
}
