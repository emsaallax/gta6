// ФАЙЛЫ: src/player/hero-rig.js
// Детальная процедурная модель героя. Корень — ступни (локальный y=0). Без анимации и без state.
import * as THREE from 'three';

const SKIN = 0xd4a07a;
const SHIRT = 0x9fe3c9;
const COLLAR = 0xb8efe0;
const PANTS = 0x2a3340;
const BELT = 0x3a2a22;
const HAIR = 0x2c1a12;
const SHOE = 0x1a1410;
const GUN = 0x2b2e33;
const GUN_DARK = 0x1a1c20;

function makeMesh(geometry, color, extras) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: extras && extras.roughness != null ? extras.roughness : 0.68,
    metalness: extras && extras.metalness != null ? extras.metalness : 0.05,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  return mesh;
}

function makeArm(side) {
  const sign = side === 'L' ? -1 : 1;
  const arm = new THREE.Group();
  arm.name = side === 'L' ? 'armL' : 'armR';
  arm.position.set(sign * 0.28, 1.50, 0);

  const upper = makeMesh(new THREE.BoxGeometry(0.13, 0.28, 0.13), SHIRT);
  upper.position.y = -0.14;
  arm.add(upper);

  const forearm = new THREE.Group();
  forearm.name = side === 'L' ? 'forearmL' : 'forearmR';
  forearm.position.set(0, -0.28, 0);
  const forearmMesh = makeMesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), SKIN);
  forearmMesh.position.y = -0.13;
  forearm.add(forearmMesh);

  const hand = new THREE.Group();
  hand.name = side === 'L' ? 'handL' : 'handR';
  hand.position.set(0, -0.26, 0);
  const palm = makeMesh(new THREE.BoxGeometry(0.09, 0.10, 0.08), SKIN);
  palm.position.y = -0.05;
  hand.add(palm);
  forearm.add(hand);
  arm.add(forearm);

  return { arm, forearm, hand };
}

export function createHeroRig() {
  const object3d = new THREE.Group();
  object3d.name = 'playerModel';

  const hipY = 0.96;

  const legL = new THREE.Group();
  legL.name = 'legL';
  legL.position.set(-0.12, hipY, 0);
  const thighL = makeMesh(new THREE.BoxGeometry(0.17, 0.48, 0.19), PANTS);
  thighL.position.y = -0.24;
  const shinL = makeMesh(new THREE.BoxGeometry(0.15, 0.40, 0.17), PANTS);
  shinL.position.y = -0.68;
  const shoeL = makeMesh(new THREE.BoxGeometry(0.16, 0.08, 0.28), SHOE, { roughness: 0.55 });
  shoeL.position.set(0, -0.92, 0.05);
  legL.add(thighL, shinL, shoeL);

  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(0.12, hipY, 0);
  const thighR = makeMesh(new THREE.BoxGeometry(0.17, 0.48, 0.19), PANTS);
  thighR.position.y = -0.24;
  const shinR = makeMesh(new THREE.BoxGeometry(0.15, 0.40, 0.17), PANTS);
  shinR.position.y = -0.68;
  const shoeR = makeMesh(new THREE.BoxGeometry(0.16, 0.08, 0.28), SHOE, { roughness: 0.55 });
  shoeR.position.set(0, -0.92, 0.05);
  legR.add(thighR, shinR, shoeR);

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, hipY, 0);
  const shirt = makeMesh(new THREE.BoxGeometry(0.40, 0.56, 0.24), SHIRT);
  shirt.position.y = 0.30;
  const collar = makeMesh(new THREE.BoxGeometry(0.28, 0.06, 0.22), COLLAR);
  collar.position.set(0, 0.58, 0.02);
  const belt = makeMesh(new THREE.BoxGeometry(0.42, 0.05, 0.26), BELT, { roughness: 0.6 });
  belt.position.y = 0.02;
  torso.add(shirt, collar, belt);

  const left = makeArm('L');
  const right = makeArm('R');
  const armL = left.arm;
  const forearmL = left.forearm;
  const handL = left.hand;
  const armR = right.arm;
  const forearmR = right.forearm;
  const handR = right.hand;

  const pistol = new THREE.Group();
  pistol.name = 'pistol';
  pistol.visible = false;
  const grip = makeMesh(new THREE.BoxGeometry(0.05, 0.10, 0.04), GUN_DARK, {
    roughness: 0.4,
    metalness: 0.35,
  });
  grip.position.set(0, -0.04, 0.02);
  const body = makeMesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), GUN, {
    roughness: 0.35,
    metalness: 0.45,
  });
  body.position.set(0, 0.01, 0.08);
  const barrel = makeMesh(new THREE.BoxGeometry(0.03, 0.03, 0.10), GUN_DARK, {
    roughness: 0.3,
    metalness: 0.5,
  });
  barrel.position.set(0, 0.01, 0.18);
  pistol.add(grip, body, barrel);
  handR.add(pistol);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.68, 0);
  const skull = makeMesh(new THREE.SphereGeometry(0.13, 14, 12), SKIN);
  skull.position.y = 0.02;
  const hair = makeMesh(
    new THREE.SphereGeometry(0.132, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    HAIR,
    { roughness: 0.82 },
  );
  hair.position.y = 0.04;
  const bang = makeMesh(new THREE.BoxGeometry(0.16, 0.05, 0.08), HAIR, { roughness: 0.82 });
  bang.position.set(0, 0.08, 0.10);
  const nose = makeMesh(new THREE.BoxGeometry(0.04, 0.05, 0.05), SKIN);
  nose.position.set(0, -0.01, 0.13);
  head.add(skull, hair, bang, nose);

  object3d.add(torso, head, armL, armR, legL, legR);

  return {
    object3d,
    parts: {
      head,
      torso,
      armL,
      armR,
      legL,
      legR,
      forearmL,
      forearmR,
      handL,
      handR,
      pistol,
    },
  };
}
