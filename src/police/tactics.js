// Тактика погони: выбор манёвра для каждой полицейской машины.
// Чистая функция, без импортов. player = {x, z, heading, speed}, cars = [{x, z, heading, speed}].
// heading в радианах: вперёд = (sin h, cos h), правее = (cos h, -sin h).

// Расстояние от машины c до точки t.
function dst(c, t) {
  return Math.hypot(c.x - t.x, c.z - t.z);
}

// Индексы до k машин с наименьшим key. key = Infinity значит «исключена».
function pickNearest(key, k) {
  return key
    .map((v, i) => i)
    .filter((i) => key[i] < Infinity)
    .sort((a, b) => key[a] - key[b])
    .slice(0, k);
}

// Раздаёт машинам ids точки справа (tp) и слева (tm) с минимальным суммарным путём.
// Возвращает цели в том же порядке, что ids.
function assignSides(cars, ids, tp, tm) {
  if (ids.length === 0) return [];
  const a = cars[ids[0]];
  if (ids.length === 1) return [dst(a, tp) <= dst(a, tm) ? tp : tm];
  const b = cars[ids[1]];
  return dst(a, tp) + dst(b, tm) <= dst(a, tm) + dst(b, tp) ? [tp, tm] : [tm, tp];
}

export function planTactics(level, player, cars) {
  const px = player.x, pz = player.z, h = player.heading;
  const fx = Math.sin(h), fz = Math.cos(h); // вперёд
  const rx = Math.cos(h), rz = -Math.sin(h); // правее

  // По умолчанию все преследуют игрока.
  const out = cars.map(() => ({ role: 'chase', target: { x: px, z: pz }, throttle: 1, brake: 0 }));
  if (level <= 1) return out;

  // Положение каждой машины относительно игрока.
  const dP = cars.map((c) => Math.hypot(c.x - px, c.z - pz));
  const fw = cars.map((c) => (c.x - px) * fx + (c.z - pz) * fz);
  const taken = cars.map(() => false);

  // PIT: ближайшая машина сзади игрока, ближе 15 м.
  if (level >= 2) {
    const key = cars.map((_, i) => (fw[i] < 0 && dP[i] < 15 ? dP[i] : Infinity));
    for (const i of pickNearest(key, 1)) {
      taken[i] = true;
      out[i] = { role: 'pit', target: { x: px - fx * 2.5 + rx * 1, z: pz - fz * 2.5 + rz * 1 }, throttle: 1, brake: 0 };
    }
  }

  // FLANK: две ближайшие к игроку из оставшихся, по бокам.
  if (level >= 3) {
    const key = cars.map((_, i) => (taken[i] ? Infinity : dP[i]));
    const ids = pickNearest(key, 2);
    const ts = assignSides(cars, ids, { x: px + rx * 4, z: pz + rz * 4 }, { x: px - rx * 4, z: pz - rz * 4 });
    ids.forEach((i, k) => {
      taken[i] = true;
      out[i] = { role: 'flank', target: ts[k], throttle: 0.9, brake: 0 };
    });
  }

  // BLOCK: из оставшихся две, ближайшие к P (игрок + вперёд*60) и дальше 30 м впереди игрока.
  if (level >= 4) {
    const qx = px + fx * 60, qz = pz + fz * 60;
    const key = cars.map((c, i) => ((taken[i] || fw[i] <= 30) ? Infinity : Math.hypot(c.x - qx, c.z - qz)));
    const ids = pickNearest(key, 2);
    const ts = assignSides(cars, ids, { x: qx + rx * 3, z: qz + rz * 3 }, { x: qx - rx * 3, z: qz - rz * 3 });
    ids.forEach((i, k) => {
      out[i] = { role: 'block', target: ts[k], throttle: 0.5, brake: dst(cars[i], ts[k]) < 4 ? 1 : 0 };
    });
  }
  return out;
}
