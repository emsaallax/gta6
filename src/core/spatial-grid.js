// Пространственная сетка по плоскости XZ: быстрый поиск коробок по ячейкам.
export class SpatialGrid {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _key(ix, iz) {
    return ix + ',' + iz;
  }

  _cellIndex(v) {
    return Math.floor(v / this.cellSize);
  }

  insert(box, item) {
    let minX = box.minX, maxX = box.maxX;
    let minZ = box.minZ, maxZ = box.maxZ;
    if (minX > maxX) { const t = minX; minX = maxX; maxX = t; }
    if (minZ > maxZ) { const t = minZ; minZ = maxZ; maxZ = t; }
    const ix0 = this._cellIndex(minX);
    const ix1 = this._cellIndex(maxX);
    const iz0 = this._cellIndex(minZ);
    const iz1 = this._cellIndex(maxZ);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(item);
      }
    }
  }

  queryAabb(minX, maxX, minZ, maxZ) {
    if (minX > maxX) { const t = minX; minX = maxX; maxX = t; }
    if (minZ > maxZ) { const t = minZ; minZ = maxZ; maxZ = t; }
    const ix0 = this._cellIndex(minX);
    const ix1 = this._cellIndex(maxX);
    const iz0 = this._cellIndex(minZ);
    const iz1 = this._cellIndex(maxZ);
    const seen = new Set();
    const out = [];
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        this._collect(ix, iz, seen, out);
      }
    }
    return out;
  }

  queryCircle(x, z, r) {
    return this.queryAabb(x - r, x + r, z - r, z + r);
  }

  queryRay(x, z, dx, dz, maxDist) {
    const seen = new Set();
    const out = [];

    if (!(maxDist > 0)) {
      this._collect(this._cellIndex(x), this._cellIndex(z), seen, out);
      return out;
    }

    const len = Math.hypot(dx, dz);
    if (len < 1e-12) {
      this._collect(this._cellIndex(x), this._cellIndex(z), seen, out);
      return out;
    }

    const ndx = dx / len;
    const ndz = dz / len;
    const endX = x + ndx * maxDist;
    const endZ = z + ndz * maxDist;
    const cs = this.cellSize;

    let ix = this._cellIndex(x);
    let iz = this._cellIndex(z);
    const ixEnd = this._cellIndex(endX);
    const izEnd = this._cellIndex(endZ);

    const stepX = ndx > 0 ? 1 : ndx < 0 ? -1 : 0;
    const stepZ = ndz > 0 ? 1 : ndz < 0 ? -1 : 0;

    const tDeltaX = stepX === 0 ? Infinity : cs / Math.abs(ndx);
    const tDeltaZ = stepZ === 0 ? Infinity : cs / Math.abs(ndz);

    let tMaxX;
    if (stepX === 0) tMaxX = Infinity;
    else if (stepX > 0) tMaxX = ((ix + 1) * cs - x) / ndx;
    else tMaxX = (ix * cs - x) / ndx;

    let tMaxZ;
    if (stepZ === 0) tMaxZ = Infinity;
    else if (stepZ > 0) tMaxZ = ((iz + 1) * cs - z) / ndz;
    else tMaxZ = (iz * cs - z) / ndz;

    const maxSteps = Math.abs(ixEnd - ix) + Math.abs(izEnd - iz) + 4;
    for (let i = 0; i < maxSteps; i++) {
      this._collect(ix, iz, seen, out);
      if (ix === ixEnd && iz === izEnd) break;
      if (Math.abs(tMaxX - tMaxZ) <= 1e-9) {
        // Диагональ: не пропускаем соседние ячейки по X и Z.
        if (stepX) this._collect(ix + stepX, iz, seen, out);
        if (stepZ) this._collect(ix, iz + stepZ, seen, out);
        tMaxX += tDeltaX;
        tMaxZ += tDeltaZ;
        ix += stepX;
        iz += stepZ;
      } else if (tMaxX < tMaxZ) {
        tMaxX += tDeltaX;
        ix += stepX;
      } else {
        tMaxZ += tDeltaZ;
        iz += stepZ;
      }
    }
    return out;
  }

  _collect(ix, iz, seen, out) {
    const list = this.cells.get(this._key(ix, iz));
    if (!list) return;
    for (const item of list) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
}
