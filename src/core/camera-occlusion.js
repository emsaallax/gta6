// ГРУППА 1. Луч по AABB-коробкам физики и оттягивание камеры от стен.
import * as THREE from 'three';

const EPS = 1e-9;
const _dir = { x: 0, y: 0, z: 0 };
const _origin = { x: 0, y: 0, z: 0 };

/**
 * origin, dir — объекты с x,y,z (dir желательно нормализован).
 * boxes — массив physics.boxes: { minX, maxX, minZ, maxZ, height }
 *   земля y=0, крыша y=height (или minY/maxY, если есть).
 * Возврат: null если нет попадания, иначе
 *   { hit: true, dist: number, point: { x, y, z }, box }
 */
export function raycastBoxes(boxes, origin, dir, maxDist) {
  if (!boxes || !(maxDist > 0)) return null;

  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < EPS) return null;
  const invLen = 1 / len;
  const dx = dir.x * invLen;
  const dy = dir.y * invLen;
  const dz = dir.z * invLen;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;

  let bestDist = maxDist;
  let bestBox = null;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const t = rayAabb(ox, oy, oz, dx, dy, dz, box, bestDist);
    if (t !== null && t < bestDist) {
      bestDist = t;
      bestBox = box;
    }
  }

  if (!bestBox) return null;
  return {
    hit: true,
    dist: bestDist,
    point: { x: ox + dx * bestDist, y: oy + dy * bestDist, z: oz + dz * bestDist },
    box: bestBox,
  };
}

/** Луч против одной AABB. Снаружи на грани — попадание; изнутри — не считаем. */
function rayAabb(ox, oy, oz, dx, dy, dz, box, maxDist) {
  const minX = box.minX;
  const maxX = box.maxX;
  const minZ = box.minZ;
  const maxZ = box.maxZ;
  const minY = box.minY != null ? box.minY : 0;
  const maxY = box.maxY != null ? box.maxY : box.height;
  if (maxY == null) return null;

  let tmin = -Infinity;
  let tmax = Infinity;

  if (!slab(ox, dx, minX, maxX)) return null;
  if (!slab(oy, dy, minY, maxY)) return null;
  if (!slab(oz, dz, minZ, maxZ)) return null;
  if (tmin > tmax) return null;
  if (tmax < 0) return null;
  if (tmin > maxDist) return null;
  // Начало внутри объёма — не попадание «наугад».
  if (tmin < 0) return null;
  return tmin;

  function slab(o, d, min, max) {
    if (Math.abs(d) < EPS) {
      return o >= min && o <= max;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  }
}

/**
 * from — точка взгляда (у персонажа/машины).
 * desired — желаемая позиция камеры.
 * padding — отодвинуть от стены, например 0.25.
 * Возврат: THREE.Vector3 (можно мутировать copy of desired).
 * Если луч from→desired попал в коробку — камера ставится в точку удара минус padding вдоль луча.
 * castFn — необязательно: (boxes, origin, dir, maxDist) => hit|null
 */
export function pullCamera(from, desired, boxes, padding = 0.25, castFn) {
  const out = desired.isVector3 ? desired : new THREE.Vector3(desired.x, desired.y, desired.z);
  const dx = out.x - from.x;
  const dy = out.y - from.y;
  const dz = out.z - from.z;
  const maxDist = Math.hypot(dx, dy, dz);
  if (maxDist < EPS) return out;

  _dir.x = dx / maxDist;
  _dir.y = dy / maxDist;
  _dir.z = dz / maxDist;
  _origin.x = from.x;
  _origin.y = from.y;
  _origin.z = from.z;

  const cast = castFn || raycastBoxes;
  const hit = cast(boxes, _origin, _dir, maxDist);
  if (!hit) return out;

  const d = Math.max(0, hit.dist - padding);
  out.x = from.x + _dir.x * d;
  out.y = from.y + _dir.y * d;
  out.z = from.z + _dir.z * d;
  return out;
}
