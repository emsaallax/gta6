// Сборка группы 4: подмена Kenney, слияние кузова, один меш огней, LOD.
// Не файлы исполнителей. Бюджет: ≤6 мешей на машину, ≤110 DC.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collectKenneyWheels } from './kenneyWheels.js';

export const LOD_FAR = 60;
export const LOD_FAR_LOW = 45;
export const LIGHT_FAR = 60;

const BOX_W = 0.18;
const BOX_H = 0.08;
const BOX_D = 0.06;
const HEAD_HEX = 0xfff2cc;
const BRAKE_HEX = 0x991111;
const SIREN_RED = 0xff1a1a;
const SIREN_BLUE = 0x2244ff;
const DAY_K = 0.22;
const HEAD_NIGHT_K = 1;
const BRAKE_ON_K = 1;
const SIREN_HZ = 4;

const KEEP_WHEEL = {
  'wheel-front-left': 1,
  'wheel-front-right': 1,
  'wheel-back-left': 1,
  'wheel-back-right': 1,
  wheel_fl: 1,
  wheel_fr: 1,
  wheel_rl: 1,
  wheel_rr: 1,
};

function isKeptWheel(obj) {
  let n = obj;
  while (n) {
    const name = (n.name || '').toLowerCase();
    if (KEEP_WHEEL[name]) return true;
    n = n.parent;
  }
  return false;
}

function isNight(time) {
  const t = Number(time);
  if (!Number.isFinite(t)) return false;
  return t < 6 || t >= 19.5;
}

function playerXZ(engine) {
  const st = engine && engine.state;
  const p = st && st.player;
  const pos = (p && p.position) || (p && p.object3d && p.object3d.position)
    || (st && st.cameraTarget && st.cameraTarget.position);
  return { x: pos && pos.x != null ? pos.x : 0, z: pos && pos.z != null ? pos.z : 0 };
}

function stripGeom(src) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const keep = { position: 1, normal: 1, uv: 1 };
  const attrs = g.attributes;
  for (const name in attrs) {
    if (!keep[name]) g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  if (!g.getAttribute('normal') && g.getAttribute('position')) g.computeVertexNormals();
  return g;
}

function bakeGeom(mesh, root) {
  const g = stripGeom(mesh.geometry);
  mesh.updateWorldMatrix(true, false);
  if (typeof root.updateWorldMatrix === 'function') root.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4();
  if (root.matrixWorld) m.copy(root.matrixWorld).invert();
  if (mesh.matrixWorld) m.multiply(mesh.matrixWorld);
  g.applyMatrix4(m);
  return g;
}

/** Не-колёсные меши GLB → один кузов `body`. Четыре колеса не трогаем. */
export function mergeKenneyBody(root) {
  if (!root || typeof root.traverse !== 'function') return;
  const parts = [];
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.geometry) return;
    if (isKeptWheel(ch)) return;
    if ((ch.name || '').indexOf('light_') === 0) return;
    parts.push(ch);
  });
  if (!parts.length) return;

  let mat = null;
  let best = 0;
  const geoms = [];
  for (let i = 0; i < parts.length; i++) {
    const mesh = parts[i];
    const g = bakeGeom(mesh, root);
    geoms.push(g);
    const n = g.getAttribute('position') ? g.getAttribute('position').count : 0;
    if (n >= best && mesh.material) {
      best = n;
      mat = mesh.material;
    }
  }
  let merged = null;
  try {
    merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  } catch (err) {
    merged = null;
  }
  if (!merged) {
    parts.sort((a, b) => {
      const na = a.geometry && a.geometry.getAttribute('position') ? a.geometry.getAttribute('position').count : 0;
      const nb = b.geometry && b.geometry.getAttribute('position') ? b.geometry.getAttribute('position').count : 0;
      return nb - na;
    });
    parts[0].name = 'body';
    for (let i = 1; i < parts.length; i++) parts[i].visible = false;
    return;
  }
  if (mat && mat.clone) mat = mat.clone();
  else {
    mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.1 });
  }
  const body = new THREE.Mesh(merged, mat);
  body.name = 'body';
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  for (let i = 0; i < parts.length; i++) {
    const mesh = parts[i];
    if (mesh.parent) mesh.parent.remove(mesh);
  }
}

function localBox(root) {
  const box = new THREE.Box3();
  if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld(true);
  box.setFromObject(root);
  if (box.isEmpty()) {
    box.min.set(-0.93, 0, -2.2);
    box.max.set(0.93, 1.2, 2.2);
    return box;
  }
  const inv = new THREE.Matrix4();
  if (root.matrixWorld) inv.copy(root.matrixWorld).invert();
  box.applyMatrix4(inv);
  return box;
}

function coloredBox(x, y, z, hex) {
  const g = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geom: g, verts: n };
}

/** Один меш огней на машину. */
export function setupCompactLights(object3d, type) {
  if (!object3d) return;
  if (!object3d.userData) object3d.userData = {};
  if (object3d.userData.kenneyLights === true) return;

  const box = localBox(object3d);
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;
  const y = box.min.y + height * 0.45;
  const xOff = width * 0.28;
  const zF = box.max.z;
  const zB = box.min.z;

  const bits = [];
  const ranges = {};
  let cursor = 0;
  function add(name, x, yy, z, hex) {
    const b = coloredBox(x, yy, z, hex);
    bits.push(b.geom);
    if (!ranges[name]) ranges[name] = { start: cursor, count: 0 };
    ranges[name].count += b.verts;
    cursor += b.verts;
  }
  add('head', -xOff, y, zF, HEAD_HEX);
  add('head', xOff, y, zF, HEAD_HEX);
  add('brake', -xOff, y, zB, BRAKE_HEX);
  add('brake', xOff, y, zB, BRAKE_HEX);
  if (type === 'police') {
    const sy = box.max.y - 0.04;
    const sx = width * 0.12;
    const sz = (box.min.z + box.max.z) * 0.5;
    add('sirenL', -sx, sy, sz, SIREN_RED);
    add('sirenR', sx, sy, sz, SIREN_BLUE);
  }

  let merged = null;
  try {
    merged = mergeGeometries(bits, false);
  } catch (err) {
    merged = mergeGeometries(bits.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  }
  if (!merged) return;
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'light_pack';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const col = mesh.geometry.getAttribute('color');
  const base = col.array.slice(0);
  mesh.userData.lightRanges = ranges;
  mesh.userData.lightBase = base;
  object3d.add(mesh);
  object3d.userData.kenneyLights = true;
  object3d.userData.lightPack = mesh;
}

function tintRange(arr, base, range, k) {
  if (!range) return;
  const start = range.start;
  const count = range.count;
  for (let i = 0; i < count; i++) {
    const i3 = (start + i) * 3;
    arr[i3] = base[i3] * k;
    arr[i3 + 1] = base[i3 + 1] * k;
    arr[i3 + 2] = base[i3 + 2] * k;
  }
}

export function updateCompactLights(vehicle, engine) {
  if (!vehicle || !vehicle._kenney || !vehicle.object3d) return;
  const root = vehicle.object3d;
  if (!root.userData || root.userData.kenneyLights !== true) {
    setupCompactLights(root, vehicle.type);
  }
  const mesh = root.userData && root.userData.lightPack;
  if (!mesh || !mesh.geometry || mesh.visible === false) return;
  const pos = vehicle.position || root.position;
  const pl = playerXZ(engine);
  const dist = Math.hypot((pos && pos.x) - pl.x, (pos && pos.z) - pl.z);
  if (dist > LIGHT_FAR) return;
  const col = mesh.geometry.getAttribute('color');
  const base = mesh.userData.lightBase;
  const ranges = mesh.userData.lightRanges;
  if (!col || !base || !ranges) return;
  const st = engine && engine.state;
  const night = isNight(st && st.time);
  const headK = night ? HEAD_NIGHT_K : DAY_K;
  const brakeK = vehicle.braking === true ? BRAKE_ON_K : DAY_K;
  tintRange(col.array, base, ranges.head, headK);
  tintRange(col.array, base, ranges.brake, brakeK);
  if (ranges.sirenL || ranges.sirenR) {
    const blinkOn = vehicle.siren === true || vehicle.controller === 'police';
    let leftK = 0.12;
    let rightK = 0.12;
    if (blinkOn) {
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
      const s = Math.sin(now * 0.001 * Math.PI * 2 * SIREN_HZ);
      leftK = s >= 0 ? 1 : 0.08;
      rightK = s >= 0 ? 0.08 : 1;
    }
    tintRange(col.array, base, ranges.sirenL, leftK);
    tintRange(col.array, base, ranges.sirenR, rightK);
  }
  col.needsUpdate = true;
}

export function setKenneyLod(object3d, low) {
  if (!object3d || typeof object3d.traverse !== 'function') return;
  const hide = !!low;
  object3d.traverse((n) => {
    const name = n.name || '';
    if (name === 'body') {
      n.visible = true;
      if (n.isMesh) n.castShadow = !hide;
      return;
    }
    const lower = name.toLowerCase();
    if (KEEP_WHEEL[lower] || lower.indexOf('wheel') >= 0 || name.indexOf('light_') === 0) {
      n.visible = !hide;
      if (n.isMesh) n.castShadow = false;
    }
  });
}

export function applyKenneyLod(vehicle, engine) {
  if (!vehicle || !vehicle.object3d) return;
  const st = engine && engine.state;
  const player = st && st.player;
  if (player && player.inVehicle === vehicle) {
    setKenneyLod(vehicle.object3d, false);
    return;
  }
  const q = st && st.settings && st.settings.quality;
  const far = q === 'low' ? LOD_FAR_LOW : LOD_FAR;
  const pos = vehicle.position || vehicle.object3d.position;
  const pl = playerXZ(engine);
  const dist = Math.hypot((pos && pos.x) - pl.x, (pos && pos.z) - pl.z);
  setKenneyLod(vehicle.object3d, dist > far);
}

function avgNamedLocal(root, names) {
  const acc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < names.length; i++) {
    const o = typeof root.getObjectByName === 'function' ? root.getObjectByName(names[i]) : null;
    if (!o) continue;
    if (typeof o.getWorldPosition === 'function') o.getWorldPosition(p);
    else continue;
    if (typeof root.worldToLocal === 'function') root.worldToLocal(p);
    acc.add(p);
    n += 1;
  }
  if (!n) return null;
  acc.multiplyScalar(1 / n);
  return acc;
}

/**
 * Нос Kenney → локальный +Z (ход игры: heading 0 едет по +Z).
 * Поворот только внутренней обёртки, object3d.rotation.y остаётся heading.
 */
export function alignKenneyNose(root) {
  if (!root) return;
  if (root.userData && root.userData.kenneyFaced === true) return;
  if (typeof root.updateMatrixWorld === 'function') root.updateMatrixWorld(true);
  const front = avgNamedLocal(root, ['wheel-front-left', 'wheel-front-right', 'wheel_fl', 'wheel_fr']);
  const back = avgNamedLocal(root, ['wheel-back-left', 'wheel-back-right', 'wheel_rl', 'wheel_rr']);
  if (!root.userData) root.userData = {};
  root.userData.kenneyFaced = true;
  if (!front || !back) return;
  const dx = front.x - back.x;
  const dz = front.z - back.z;
  if (dx * dx + dz * dz < 1e-6) return;
  const yaw = Math.atan2(dx, dz);
  if (Math.abs(yaw) < 0.08) return;
  const visual = new THREE.Group();
  visual.name = 'kenneyFacing';
  const kids = root.children.slice();
  for (let i = 0; i < kids.length; i++) visual.add(kids[i]);
  visual.rotation.y = -yaw;
  root.add(visual);
}

/** Курс: YXZ, чтобы крен/клевок не уводили нос вбок. */
export function applyCarHeading(object3d, heading) {
  if (!object3d || !object3d.rotation) return;
  if (object3d.rotation.order !== 'YXZ') object3d.rotation.order = 'YXZ';
  object3d.rotation.y = heading;
}

export function attachKenneyMesh(engine, vehicle, loaded) {
  if (!engine || !vehicle || !loaded || !loaded.object3d) return false;
  const list = engine.state && engine.state.vehicles;
  if (!Array.isArray(list) || list.indexOf(vehicle) < 0) return false;
  const next = loaded.object3d;
  const old = vehicle.object3d;
  const x = vehicle.position ? vehicle.position.x : 0;
  const z = vehicle.position ? vehicle.position.z : 0;
  const heading = Number.isFinite(vehicle.heading) ? vehicle.heading : 0;
  mergeKenneyBody(next);
  setupCompactLights(next, vehicle.type || loaded.type);
  alignKenneyNose(next);
  if (next.position && typeof next.position.set === 'function') next.position.set(x, 0, z);
  applyCarHeading(next, heading);
  if (engine.scene) {
    if (old) engine.scene.remove(old);
    engine.scene.add(next);
  }
  vehicle.object3d = next;
  vehicle.position = next.position;
  if (vehicle.body) vehicle.body.position = vehicle.position;
  vehicle._model = null;
  vehicle._kenney = true;
  vehicle.wheels = collectKenneyWheels(next);
  next.traverse((ch) => {
    if (!ch.isMesh) return;
    const name = (ch.name || '').toLowerCase();
    if (name === 'body') {
      ch.castShadow = true;
      return;
    }
    ch.castShadow = false;
  });
  return true;
}
