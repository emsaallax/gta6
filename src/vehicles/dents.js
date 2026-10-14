import * as THREE from 'three';

// Вмятины кузова Kenney: вершины body у точки удара сдвигаются к оси машины (0, y, 0).
const MAX_POWER = 30;           // предел impulse, м/с
const DENT_CAP = 0.35;          // максимум суммарного смещения одной вершины
const NORMALS_MAX_VERTS = 6000;
const _local = new THREE.Vector3();

// Детерминированный шум [-1, 1] по позиции вершины: дубли вершин (разрезы по UV и нормалям)
// получают одно значение, поэтому трещин в сетке не появляется.
function posNoise(x, y, z) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

// Вмятина в точке worldPoint ({x, y, z}; y по умолчанию 0.6) при ударе impulse (м/с).
// Возвращает true, если геометрия изменена.
export function applyDent(vehicle, worldPoint, impulse) {
  const body = vehicle && vehicle.object3d ? vehicle.object3d.getObjectByName('body') : null;
  if (!body || !body.isMesh || !body.geometry || !worldPoint) return false;
  if (!Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.z)) return false;
  const power = Math.min(Math.max(Number(impulse) || 0, 0), MAX_POWER);
  const depth = power * 0.012;
  if (!(depth > 0)) return false;
  // Клон геометрии только на первый удар машины (общие геометрии типов не портим). Материал не клонируем.
  if (!vehicle._dentGeo) {
    body.geometry = body.geometry.clone();
    vehicle._dentGeo = true;
  }
  const geo = body.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return false;
  const n = pos.count;
  let dent = geo.userData.dent;
  if (!(dent instanceof Float32Array) || dent.length !== n) {
    dent = new Float32Array(n); // накопленное смещение по каждой вершине
    geo.userData.dent = dent;
  }
  _local.set(worldPoint.x, Number.isFinite(worldPoint.y) ? worldPoint.y : 0.6, worldPoint.z);
  body.worldToLocal(_local);
  const lx = _local.x, ly = _local.y, lz = _local.z;
  const R = 0.5 + power * 0.03;
  let changed = false;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const dx = x - lx, dy = y - ly, dz = z - lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d < R)) continue;
    const f = 1 - d / R;
    const want = depth * f * f + depth * 0.15 * posNoise(x, y, z);
    const cur = dent[i];
    const add = Math.min(want, DENT_CAP - cur);
    if (!(add > 0)) continue;
    // Сдвиг по горизонтали к оси, не дальше самой оси.
    const r = Math.sqrt(x * x + z * z);
    const mv = Math.min(add, r);
    if (!(mv > 0)) continue;
    const k = (r - mv) / r;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    dent[i] = cur + mv;
    changed = true;
  }
  if (!changed) return false;
  pos.needsUpdate = true;
  geo.boundingSphere = null; // пересчитается лениво, чтобы отсечение по кадру не врало
  geo.boundingBox = null;
  if (n <= NORMALS_MAX_VERTS) geo.computeVertexNormals();
  return true;
}

// Сброс при despawn: геометрию не восстанавливаем, флаг снимаем.
export function resetDents(vehicle) {
  if (vehicle) vehicle._dentGeo = false;
}
