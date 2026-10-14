// 3-01. Модель героя из примитивов. Корень — ступни (локальный y=0).
import * as THREE from 'three';

const SKIN = 0xe8b896;
const SHIRT = 0x1f8a70;
const PANTS = 0x1c3d4a;
const HAIR = 0x3d2b1f;
const SHOE = 0x222222;

function makeMesh(geometry, color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  return mesh;
}

export function createPlayerModel() {
  const object3d = new THREE.Group();
  object3d.name = 'playerModel';

  // Ноги: pivot у верха бедра. Низ обуви на y=0 при object3d.position.y = 0.
  const hipY = 0.94;

  const legL = new THREE.Group();
  legL.name = 'legL';
  legL.position.set(-0.13, hipY, 0);
  const thighL = makeMesh(new THREE.BoxGeometry(0.16, 0.50, 0.18), PANTS);
  thighL.position.y = -0.25;
  const shinL = makeMesh(new THREE.BoxGeometry(0.14, 0.40, 0.16), PANTS);
  shinL.position.y = -0.70;
  const shoeL = makeMesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), SHOE);
  shoeL.position.set(0, -0.90, 0.04);
  legL.add(thighL, shinL, shoeL);

  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(0.13, hipY, 0);
  const thighR = makeMesh(new THREE.BoxGeometry(0.16, 0.50, 0.18), PANTS);
  thighR.position.y = -0.25;
  const shinR = makeMesh(new THREE.BoxGeometry(0.14, 0.40, 0.16), PANTS);
  shinR.position.y = -0.70;
  const shoeR = makeMesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), SHOE);
  shoeR.position.set(0, -0.90, 0.04);
  legR.add(thighR, shinR, shoeR);

  // Торс: pivot у пояса.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, hipY, 0);
  const belly = makeMesh(new THREE.BoxGeometry(0.38, 0.58, 0.24), SHIRT);
  belly.position.y = 0.32;
  torso.add(belly);

  // Руки: pivot у плеча, меш свисает вниз — 3-02 крутит rotation.x.
  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.set(-0.27, 1.48, 0);
  const upperL = makeMesh(new THREE.BoxGeometry(0.12, 0.30, 0.12), SHIRT);
  upperL.position.y = -0.15;
  const lowerL = makeMesh(new THREE.BoxGeometry(0.10, 0.32, 0.10), SKIN);
  lowerL.position.y = -0.44;
  const handL = makeMesh(new THREE.BoxGeometry(0.09, 0.10, 0.09), SKIN);
  handL.position.y = -0.64;
  armL.add(upperL, lowerL, handL);

  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(0.27, 1.48, 0);
  const upperR = makeMesh(new THREE.BoxGeometry(0.12, 0.30, 0.12), SHIRT);
  upperR.position.y = -0.15;
  const lowerR = makeMesh(new THREE.BoxGeometry(0.10, 0.32, 0.10), SKIN);
  lowerR.position.y = -0.44;
  const handR = makeMesh(new THREE.BoxGeometry(0.09, 0.10, 0.09), SKIN);
  handR.position.y = -0.64;
  armR.add(upperR, lowerR, handR);

  // Голова. Верх черепа ≈ 1.79 м.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.66, 0);
  const skull = makeMesh(new THREE.SphereGeometry(0.13, 12, 10), SKIN);
  const hair = makeMesh(
    new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    HAIR,
  );
  hair.position.y = 0.04;
  const nose = makeMesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), SKIN);
  nose.position.set(0, -0.02, 0.13);
  head.add(skull, hair, nose);

  object3d.add(torso, head, armL, armR, legL, legR);

  return {
    object3d,
    parts: { head, torso, armL, armR, legL, legR },
  };
}
