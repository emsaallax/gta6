// Модели машин из примитивов. В сцену не добавляет.
import * as THREE from 'three';

export const VEHICLE_TYPES = ['sedan', 'sport', 'suv', 'taxi', 'police'];

const WHEEL_R = 0.35;
const WHEEL_T = 0.22;

const SPECS = {
  sedan: { w: 1.8, h: 1.4, l: 4.2, radius: 1.3, color: 0x2a6bd6 },
  sport: { w: 1.9, h: 1.15, l: 4.4, radius: 1.25, color: 0xc41e3a },
  suv: { w: 2.0, h: 1.8, l: 4.6, radius: 1.5, color: 0x3d5c3a },
  taxi: { w: 1.8, h: 1.4, l: 4.2, radius: 1.3, color: 0xf5c400 },
  police: { w: 1.8, h: 1.4, l: 4.2, radius: 1.3, color: 0xececec },
};

const wheelGeom = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_T, 12);
wheelGeom.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

function stdMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
}

function namedMesh(name, geom, mat, x, y, z) {
  const m = new THREE.Mesh(geom, mat);
  m.name = name;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makeWheel(name, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  const mesh = new THREE.Mesh(wheelGeom, wheelMat);
  mesh.castShadow = true;
  g.add(mesh);
  g.position.set(x, y, z);
  return g;
}

function makeLight(name, color, sx, sy, sz) {
  const mat = stdMat(color, { emissive: color, emissiveIntensity: 0.15 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.name = name;
  m.castShadow = true;
  return m;
}

export function createCarModel(type) {
  const kind = VEHICLE_TYPES.includes(type) ? type : 'sedan';
  const spec = SPECS[kind];
  const { w, h, l, radius, color } = spec;

  const root = new THREE.Group();
  const bodyY = WHEEL_R + h * 0.38;
  const cabinH = kind === 'sport' ? h * 0.32 : h * 0.42;

  const chassis = namedMesh('chassis', new THREE.BoxGeometry(w, h * 0.55, l), stdMat(color), 0, bodyY, 0);
  root.add(chassis);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.72, cabinH, l * (kind === 'sport' ? 0.38 : 0.48)),
    stdMat(kind === 'police' ? 0xd8e4f0 : 0x1a2330, { roughness: 0.25, metalness: 0.4 }),
  );
  cabin.position.set(0, bodyY + h * 0.28, kind === 'sport' ? -0.15 : -0.2);
  cabin.castShadow = true;
  root.add(cabin);

  if (kind === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.06, 0.28), stdMat(0x1a1a1a));
    spoiler.position.set(0, bodyY + h * 0.22, -l * 0.42);
    spoiler.castShadow = true;
    root.add(spoiler);
  }

  if (kind === 'taxi') {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.1, 0.36), stdMat(0x111111));
    visor.position.set(0, bodyY + h * 0.42, 0.15);
    visor.castShadow = true;
    root.add(visor);
  }

  if (kind === 'police') {
    const stripeMat = stdMat(0x1a3a8a);
    const stripeGeom = new THREE.BoxGeometry(0.06, h * 0.22, l * 0.7);
    const sl = new THREE.Mesh(stripeGeom, stripeMat);
    sl.position.set(-w * 0.5, bodyY, 0);
    sl.castShadow = true;
    const sr = sl.clone();
    sr.position.x = w * 0.5;
    root.add(sl, sr);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.28), stdMat(0x222222));
    bar.position.set(0, bodyY + h * 0.48, 0);
    bar.castShadow = true;
    root.add(bar);
  }

  const ax = w * 0.42;
  const fz = l * 0.3;
  const rz = -l * 0.3;
  const wy = WHEEL_R;
  const fl = makeWheel('wheel_fl', -ax, wy, fz);
  const fr = makeWheel('wheel_fr', ax, wy, fz);
  const rl = makeWheel('wheel_rl', -ax, wy, rz);
  const rr = makeWheel('wheel_rr', ax, wy, rz);
  root.add(fl, fr, rl, rr);

  const ly = bodyY;
  const headL = makeLight('light_head_l', 0xfff2cc, 0.22, 0.12, 0.08);
  const headR = makeLight('light_head_r', 0xfff2cc, 0.22, 0.12, 0.08);
  headL.position.set(-w * 0.32, ly, l * 0.5);
  headR.position.set(w * 0.32, ly, l * 0.5);
  const brakeL = makeLight('light_brake_l', 0x991111, 0.22, 0.1, 0.08);
  const brakeR = makeLight('light_brake_r', 0x991111, 0.22, 0.1, 0.08);
  brakeL.position.set(-w * 0.32, ly, -l * 0.5);
  brakeR.position.set(w * 0.32, ly, -l * 0.5);
  root.add(headL, headR, brakeL, brakeR);

  if (kind === 'police') {
    const sirenY = bodyY + h * 0.55;
    const sirenL = makeLight('light_siren_l', 0xff1a1a, 0.28, 0.12, 0.22);
    const sirenR = makeLight('light_siren_r', 0x2244ff, 0.28, 0.12, 0.22);
    sirenL.position.set(-0.28, sirenY, 0);
    sirenR.position.set(0.28, sirenY, 0);
    root.add(sirenL, sirenR);
  }

  return {
    object3d: root,
    wheels: { fl, fr, rl, rr },
    type: kind,
    radius,
    length: l,
    width: w,
  };
}
