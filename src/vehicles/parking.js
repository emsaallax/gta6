// Позы парковки вдоль дорог. Без THREE, без мешей.

const TYPES = ['sedan', 'sport', 'suv', 'taxi', 'police'];

function clampCount(count) {
  const n = count == null ? 20 : Number(count);
  if (!Number.isFinite(n)) return 20;
  return Math.max(15, Math.min(30, Math.floor(n)));
}

function fallback(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: -24 + i * 5, z: 6, heading: 0, type: TYPES[i % 5] });
  }
  return out;
}

function isVertical(road) {
  return road && road.x1 === road.x2;
}

function isHorizontal(road) {
  return road && road.z1 === road.z2;
}

function nearCross(x, z, seg, roads) {
  if (!roads) return false;
  if (seg.vertical) {
    for (let i = 0; i < roads.length; i++) {
      const other = roads[i];
      if (!other || !isHorizontal(other)) continue;
      if (Math.abs(z - other.z1) < 14) return true;
    }
  } else if (seg.horizontal) {
    for (let i = 0; i < roads.length; i++) {
      const other = roads[i];
      if (!other || !isVertical(other)) continue;
      if (Math.abs(x - other.x1) < 14) return true;
    }
  }
  return false;
}

export function parkAlongRoads(roads, count = 20) {
  const n = clampCount(count);
  if (!Array.isArray(roads) || roads.length === 0) return fallback(n);

  const segs = [];
  for (const road of roads) {
    if (!road) continue;
    if (road.kind === 'promenade') continue;
    const x1 = Number(road.x1);
    const z1 = Number(road.z1);
    const x2 = Number(road.x2);
    const z2 = Number(road.z2);
    if (![x1, z1, x2, z2].every(Number.isFinite)) continue;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (!(len > 8)) continue;
    segs.push({
      x1,
      z1,
      ux: dx / len,
      uz: dz / len,
      len,
      width: road.width > 0 ? road.width : 8,
      heading: Math.atan2(dx, dz),
      vertical: road.x1 === road.x2,
      horizontal: road.z1 === road.z2,
    });
  }
  if (segs.length === 0) return fallback(n);

  const usableTotal = segs.reduce((s, g) => s + Math.max(0, g.len - 8), 0);
  if (!(usableTotal > 0)) return fallback(n);

  // Мелкий шаг: перекрёстки режут улицу на короткие окна (~50 м), крупный шаг их все промахивает.
  const step = 4;
  const valid = [];
  for (const seg of segs) {
    const offMag = (seg.width || 8) * 0.5 - 1.6;
    for (let along = 4; along <= seg.len - 4 + 1e-6; along += step) {
      const side = valid.length % 2 === 0 ? 1 : -1;
      const off = offMag * side;
      const x = seg.x1 + seg.ux * along + -seg.uz * off;
      const z = seg.z1 + seg.uz * along + seg.ux * off;
      if (nearCross(x, z, seg, roads)) continue;
      valid.push({ x, z, heading: seg.heading, type: TYPES[valid.length % 5] });
    }
  }
  if (valid.length === 0) return fallback(n);

  if (valid.length <= n) {
    for (let i = 0; i < valid.length; i++) valid[i].type = TYPES[i % 5];
    return valid;
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const pose = valid[Math.floor((i * valid.length) / n)];
    out.push({
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      type: TYPES[i % 5],
    });
  }
  return out;
}
