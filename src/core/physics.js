import { SpatialGrid } from './spatial-grid.js';
import { killClosingVelocity } from './bodies-bounce.js';

// ГРУППА 1. Простая физика: статичные коробки (AABB) на плоскости XZ, земля y=0.
export class Physics {
  constructor() {
    this.boxes = []; // {minX,maxX,minZ,maxZ,height}
    this.grid = new SpatialGrid(32);
  }

  addBox(b) {
    this.boxes.push(b);
    this.grid.insert(b, b);
  }

  rebuildGrid() {
    this.grid.clear();
    for (const b of this.boxes) this.grid.insert(b, b);
  }

  // Выталкивает круг (x,z,r) из коробок. Возвращает {x,z,hit}.
  // Четвёртый аргумент body необязателен: гасит скорость в стену (не отражает).
  resolveCircle(x, z, r, body) {
    const ox = x;
    const oz = z;
    let hit = false;
    const candidates = this.grid.queryCircle(x, z, r);
    for (const b of candidates) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          x += dx * k;
          z += dz * k;
        } else {
          x = (x - b.minX < b.maxX - x) ? b.minX - r : b.maxX + r;
        }
      }
    }
    if (hit && body) killClosingVelocity(body, x - ox, z - oz);
    return { x, z, hit };
  }

  raycast(origin, dir, maxDist) {
    if (!(maxDist > 0)) return null;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-12) return null;
    dx /= len;
    dy /= len;
    dz /= len;

    const candidates = this.grid.queryRay(ox, oz, dx, dz, maxDist);
    let best = null;
    let bestDist = maxDist;
    for (const box of candidates) {
      const t = this._rayAabb(ox, oy, oz, dx, dy, dz, box, maxDist);
      if (t == null) continue;
      if (t < bestDist) {
        bestDist = t;
        best = box;
      }
    }
    if (!best) return null;
    return {
      hit: true,
      dist: bestDist,
      point: { x: ox + dx * bestDist, y: oy + dy * bestDist, z: oz + dz * bestDist },
      box: best,
    };
  }

  _rayAabb(ox, oy, oz, dx, dy, dz, box, maxDist) {
    const minX = box.minX, maxX = box.maxX;
    const minZ = box.minZ, maxZ = box.maxZ;
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
    // Вход снаружи. Если начало внутри (tmin < 0) — не считаем попаданием.
    if (tmin < 0) return null;
    return tmin;

    function slab(o, d, min, max) {
      if (Math.abs(d) < 1e-12) {
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
}
