// Процедурная модель машины: ≤6 Mesh, огни влиты в кузов.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const VEHICLE_TYPES = ['sedan', 'taxi', 'sport', 'van', 'police', 'coupe', 'pickup'];

const RADIUS = 1.6;
const WHEEL_R = 0.33;
const WHEEL_T = 0.24;
const DAY_EMIT = 0.2;

const COLORS = {
  sedan: 0x2a6bd6,
  taxi: 0xf5c400,
  sport: 0xc41e3a,
  van: 0x5a6a4a,
  police: 0xececec,
  coupe: 0xd4783a,
  pickup: 0x6b4e3d,
};

const WIDTH = {
  sedan: 1.86,
  taxi: 1.86,
  sport: 1.94,
  van: 2.06,
  police: 1.88,
  coupe: 1.82,
  pickup: 1.96,
};

const cache = {};
let wheelGeom = null;
let lodMat = null;
let glassMat = null;
let wheelMat = null;

function normType(type) {
  return VEHICLE_TYPES.includes(type) ? type : 'sedan';
}

function prep(g) {
  if (!g) return g;
  let out = g;
  if (out.index) out = out.toNonIndexed();
  if (typeof out.clearGroups === 'function') out.clearGroups();
  return out;
}

function stripExtraAttrs(g) {
  const out = g.clone();
  const keep = { position: true, normal: true, color: true };
  for (const name of Object.keys(out.attributes)) {
    if (!keep[name]) out.deleteAttribute(name);
  }
  return prep(out);
}

function mergeParts(list, useGroups) {
  const parts = [];
  for (const g of list) {
    if (g) parts.push(prep(g));
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  let merged = mergeGeometries(parts, !!useGroups);
  if (merged) return merged;
  const cleaned = parts.map(stripExtraAttrs);
  merged = mergeGeometries(cleaned, !!useGroups);
  if (merged) return merged;
  return parts[0];
}

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function boxAt(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  return prep(g);
}

function emitMat(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: DAY_EMIT,
    roughness: 0.45,
    metalness: 0.2,
  });
}

function bodyMat(hex) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.48,
    metalness: 0.18,
  });
}

function roundedShape(pts, r) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const rr = Math.min(r, d1 * 0.4, d2 * 0.4);
    const ux1 = (cur.x - prev.x) / d1;
    const uy1 = (cur.y - prev.y) / d1;
    const ux2 = (next.x - cur.x) / d2;
    const uy2 = (next.y - cur.y) / d2;
    const p1x = cur.x - ux1 * rr;
    const p1y = cur.y - uy1 * rr;
    const p2x = cur.x + ux2 * rr;
    const p2y = cur.y + uy2 * rr;
    if (i === 0) s.moveTo(p1x, p1y);
    else s.lineTo(p1x, p1y);
    s.quadraticCurveTo(cur.x, cur.y, p2x, p2y);
  }
  s.closePath();
  return s;
}

function profilePts(kind) {
  if (kind === 'sport') {
    return [
      { x: -2.12, y: 0.22 },
      { x: -2.18, y: 0.4 },
      { x: -1.95, y: 0.56 },
      { x: -0.95, y: 0.86 },
      { x: -0.15, y: 1.02 },
      { x: 0.55, y: 0.98 },
      { x: 1.25, y: 0.64 },
      { x: 1.95, y: 0.52 },
      { x: 2.18, y: 0.4 },
      { x: 2.1, y: 0.22 },
    ];
  }
  if (kind === 'van') {
    return [
      { x: -2.18, y: 0.28 },
      { x: -2.24, y: 0.5 },
      { x: -2.12, y: 1.58 },
      { x: 0.85, y: 1.64 },
      { x: 1.32, y: 1.18 },
      { x: 1.58, y: 0.86 },
      { x: 2.12, y: 0.74 },
      { x: 2.2, y: 0.5 },
      { x: 2.12, y: 0.28 },
    ];
  }
  if (kind === 'pickup') {
    return [
      { x: -2.22, y: 0.28 },
      { x: -2.26, y: 0.48 },
      { x: -2.18, y: 0.84 },
      { x: -0.32, y: 0.84 },
      { x: -0.22, y: 1.3 },
      { x: 0.58, y: 1.4 },
      { x: 1.12, y: 1.04 },
      { x: 1.38, y: 0.78 },
      { x: 2.08, y: 0.7 },
      { x: 2.2, y: 0.48 },
      { x: 2.12, y: 0.28 },
    ];
  }
  const roof = kind === 'coupe' ? 1.2 : 1.36;
  return [
    { x: -2.12, y: 0.26 },
    { x: -2.18, y: 0.48 },
    { x: -2.0, y: 0.78 },
    { x: -1.12, y: 1.16 },
    { x: -0.32, y: roof },
    { x: 0.58, y: roof },
    { x: 1.18, y: 0.86 },
    { x: 1.72, y: 0.72 },
    { x: 2.16, y: 0.5 },
    { x: 2.08, y: 0.26 },
  ];
}

function extrudeBody(kind, width) {
  const shape = roundedShape(profilePts(kind), 0.1);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 6,
    steps: 1,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  const out = prep(g);
  out.computeBoundingBox();
  const bb = out.boundingBox;
  if (bb) {
    const midX = (bb.min.x + bb.max.x) * 0.5;
    if (Math.abs(midX) > 1e-5) out.translate(-midX, 0, 0);
  }
  return out;
}

function lengthOf(kind) {
  const pts = profilePts(kind);
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.x < min) min = p.x;
    if (p.x > max) max = p.x;
  }
  return max - min + 0.08;
}

function glassGeom(kind, w) {
  if (kind === 'sport') return boxAt(w * 0.78, 0.26, 1.32, 0, 0.9, 0.08);
  if (kind === 'van') return boxAt(w * 0.82, 0.52, 2.35, 0, 1.22, -0.12);
  if (kind === 'pickup') return boxAt(w * 0.78, 0.36, 1.12, 0, 1.14, 0.48);
  if (kind === 'coupe') return boxAt(w * 0.78, 0.32, 1.45, 0, 1.02, 0.02);
  return boxAt(w * 0.8, 0.36, 1.68, 0, 1.12, -0.02);
}

function extraBody(kind, w, L) {
  const bits = [];
  if (kind === 'sport') bits.push(boxAt(w * 0.72, 0.05, 0.3, 0, 0.92, -L * 0.36));
  if (kind === 'taxi') bits.push(boxAt(0.5, 0.12, 0.3, 0, 1.42, 0.08));
  if (kind === 'police') bits.push(boxAt(0.95, 0.08, 0.28, 0, 1.48, 0));
  if (kind === 'pickup') bits.push(boxAt(w * 0.9, 0.06, 1.7, 0, 0.86, -0.95));
  return bits.length ? mergeParts(bits, false) : null;
}

function stripeGeom(w, L) {
  return mergeParts([
    boxAt(0.05, 0.22, L * 0.72, -w * 0.5, 0.58, 0),
    boxAt(0.05, 0.22, L * 0.72, w * 0.5, 0.58, 0),
  ], false);
}

function lightPair(w, y, z, sx, sy, sz) {
  const hx = w * 0.32;
  return mergeParts([
    boxAt(sx, sy, sz, -hx, y, z),
    boxAt(sx, sy, sz, hx, y, z),
  ], false);
}

function makeWheelGeom() {
  const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_T, 12);
  tire.rotateZ(Math.PI / 2);
  paint(prep(tire), 0x1a1a1a);
  const rim = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_T * 1.08, 10);
  rim.rotateZ(Math.PI / 2);
  paint(prep(rim), 0x9aa0a8);
  const hub = new THREE.CylinderGeometry(WHEEL_R * 0.18, WHEEL_R * 0.18, WHEEL_T * 1.12, 8);
  hub.rotateZ(Math.PI / 2);
  paint(prep(hub), 0xc8cdd3);
  return mergeParts([tire, rim, hub], false);
}

function shared() {
  if (!wheelGeom) wheelGeom = makeWheelGeom();
  if (!lodMat) {
    lodMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.16,
    });
  }
  if (!glassMat) {
    glassMat = new THREE.MeshStandardMaterial({
      color: 0x15202c,
      metalness: 0.6,
      roughness: 0.1,
    });
  }
  if (!wheelMat) {
    wheelMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.25,
    });
  }
}

function ensure(type) {
  const kind = normType(type);
  if (cache[kind]) return cache[kind];
  shared();

  const w = WIDTH[kind];
  const L = lengthOf(kind);
  const color = COLORS[kind];
  const ly = kind === 'sport' ? 0.46 : 0.52;
  const zf = L * 0.48;
  const zr = -L * 0.48;

  const shell = extrudeBody(kind, w);
  const extra = extraBody(kind, w, L);
  const bodyParts = extra ? [shell, extra] : [shell];
  const bodyGeom = mergeParts(bodyParts, false);

  const head = lightPair(w, ly, zf, 0.3, 0.1, 0.08);
  const brake = lightPair(w, ly, zr, 0.3, 0.09, 0.08);

  const lightMats = {
    head: emitMat(0xfff2cc),
    brake: emitMat(0x991111),
  };

  const hiList = [bodyGeom];
  const hiMats = [bodyMat(color)];
  const lodList = [paint(bodyGeom.clone(), color)];

  if (kind === 'police') {
    const stripe = stripeGeom(w, L);
    hiList.push(stripe);
    hiMats.push(new THREE.MeshStandardMaterial({ color: 0x1a4a9a, roughness: 0.5, metalness: 0.1 }));
    lodList.push(paint(stripe.clone(), 0x1a4a9a));
  }

  hiList.push(head, brake);
  hiMats.push(lightMats.head, lightMats.brake);
  lodList.push(paint(head.clone(), 0xfff2cc), paint(brake.clone(), 0x991111));

  let sirenLGeom = null;
  let sirenRGeom = null;
  const roofY = kind === 'van' ? 1.7 : 1.5;
  if (kind === 'police') {
    lightMats.sirenL = emitMat(0xff1a1a);
    lightMats.sirenR = emitMat(0x2244ff);
    sirenLGeom = boxAt(0.34, 0.1, 0.22, -0.28, roofY, 0);
    sirenRGeom = boxAt(0.34, 0.1, 0.22, 0.28, roofY, 0);
    hiList.push(sirenLGeom, sirenRGeom);
    hiMats.push(lightMats.sirenL, lightMats.sirenR);
    lodList.push(paint(sirenLGeom.clone(), 0xff1a1a), paint(sirenRGeom.clone(), 0x2244ff));
  }

  let hiGeom = mergeParts(hiList.filter(Boolean), true);
  if (!hiGeom) hiGeom = bodyGeom;
  const glass = glassGeom(kind, w);
  lodList.push(paint(glass.clone(), 0x15202c));
  let lodGeom = mergeParts(lodList.filter(Boolean), false);
  if (!lodGeom) lodGeom = bodyGeom;

  const rec = {
    kind,
    w,
    L,
    ly,
    zf,
    zr,
    roofY,
    hiGeom,
    hiMats,
    lodGeom,
    glassGeom: glass,
    lightMats,
  };
  cache[kind] = rec;
  return rec;
}

function marker(name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

function wheelGroup(name, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  const mesh = new THREE.Mesh(wheelGeom, wheelMat);
  mesh.castShadow = true;
  mesh.name = name + '_mesh';
  g.add(mesh);
  return { group: g, mesh };
}

export function getCarLightMats(type) {
  return ensure(type).lightMats;
}

export function createCarMesh(type) {
  const rec = ensure(type);
  const kind = rec.kind;
  const root = new THREE.Group();
  root.name = 'car_' + kind;

  // Стопы и мигалки — клоны, иначе торможение одной машины зажжёт все.
  let brakeMat = rec.lightMats.brake;
  let sirenLMat = rec.lightMats.sirenL || null;
  let sirenRMat = rec.lightMats.sirenR || null;
  const mats = rec.hiMats.map((m) => {
    if (m === rec.lightMats.brake) {
      brakeMat = m.clone();
      return brakeMat;
    }
    if (rec.lightMats.sirenL && m === rec.lightMats.sirenL) {
      sirenLMat = m.clone();
      return sirenLMat;
    }
    if (rec.lightMats.sirenR && m === rec.lightMats.sirenR) {
      sirenRMat = m.clone();
      return sirenRMat;
    }
    return m;
  });

  const body = new THREE.Mesh(rec.hiGeom, mats);
  body.name = 'body';
  body.castShadow = true;
  root.add(body);

  const glass = new THREE.Mesh(rec.glassGeom, glassMat);
  glass.name = 'glass';
  glass.castShadow = false;
  root.add(glass);

  const ax = rec.w * 0.42;
  const fz = rec.L * 0.3;
  const rz = -rec.L * 0.3;
  const wy = WHEEL_R;
  const fl = wheelGroup('wheel_fl', -ax, wy, fz);
  const fr = wheelGroup('wheel_fr', ax, wy, fz);
  const rl = wheelGroup('wheel_rl', -ax, wy, rz);
  const rr = wheelGroup('wheel_rr', ax, wy, rz);
  root.add(fl.group, fr.group, rl.group, rr.group);

  const hx = rec.w * 0.32;
  root.add(
    marker('light_head_l', -hx, rec.ly, rec.zf),
    marker('light_head_r', hx, rec.ly, rec.zf),
    marker('light_brake_l', -hx, rec.ly, rec.zr),
    marker('light_brake_r', hx, rec.ly, rec.zr),
  );
  if (kind === 'police') {
    root.add(
      marker('light_siren_l', -0.28, rec.roofY, 0),
      marker('light_siren_r', 0.28, rec.roofY, 0),
    );
  }

  return {
    object3d: root,
    wheels: { fl: fl.group, fr: fr.group, rl: rl.group, rr: rr.group },
    type: kind,
    radius: RADIUS,
    _body: body,
    _glass: glass,
    _wheelMeshes: [fl.mesh, fr.mesh, rl.mesh, rr.mesh],
    _hiGeom: rec.hiGeom,
    _hiMats: mats,
    _lodGeom: rec.lodGeom,
    _brakeMat: brakeMat,
    _sirenLMat: sirenLMat,
    _sirenRMat: sirenRMat,
    _low: false,
  };
}

export function setCarDetail(model, low) {
  if (!model || !model._body) return;
  const on = !!low;
  if (model._low === on) {
    model._body.visible = true;
    return;
  }
  model._low = on;
  const body = model._body;
  if (on) {
    body.geometry = model._lodGeom;
    body.material = lodMat;
    body.visible = true;
    if (model._glass) model._glass.visible = false;
    if (model._wheelMeshes) {
      for (const m of model._wheelMeshes) m.visible = false;
    }
    const wh = model.wheels;
    if (wh) {
      if (wh.fl) wh.fl.visible = false;
      if (wh.fr) wh.fr.visible = false;
      if (wh.rl) wh.rl.visible = false;
      if (wh.rr) wh.rr.visible = false;
    }
  } else {
    body.geometry = model._hiGeom;
    body.material = model._hiMats;
    body.visible = true;
    if (model._glass) model._glass.visible = true;
    if (model._wheelMeshes) {
      for (const m of model._wheelMeshes) m.visible = true;
    }
    const wh = model.wheels;
    if (wh) {
      if (wh.fl) wh.fl.visible = true;
      if (wh.fr) wh.fr.visible = true;
      if (wh.rl) wh.rl.visible = true;
      if (wh.rr) wh.rr.visible = true;
    }
  }
}
