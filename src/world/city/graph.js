/** Граф дорог: перекрёстки, полосы, тротуары, фазы светофоров. Без мешей. */

import { streetWidthX, streetWidthZ } from './layout.js';

const EPS = 1e-6;
const SIDEWALK_HALF = 1.75;
const SIDEWALK_W = 3.5;
const CYCLE = 24;

let t = 0;

function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function inList(value, list) {
  for (let i = 0; i < list.length; i++) {
    if (near(value, list[i])) return true;
  }
  return false;
}

function isPromenadeZ(z) {
  return near(z, 400);
}

function ixId(i, j, nZ) {
  return i * nZ + j;
}

function signalAt(time) {
  const p = ((time % CYCLE) + CYCLE) % CYCLE;
  if (p < 10) return 'ns';
  if (p < 12) return 'red';
  if (p < 22) return 'ew';
  return 'red';
}

/**
 * Строит граф города по сетке layout. Не пишет engine.state.
 * @param {ReturnType<typeof import('./layout.js').createLayout>} layout
 */
export function buildCityGraph(layout) {
  const xs = layout.grid.xs;
  const zs = layout.grid.zs;
  const avenueXs = layout.grid.avenueXs;
  const avenueZs = layout.grid.avenueZs;
  const nX = xs.length;
  const nZ = zs.length;

  const intersections = [];
  for (let i = 0; i < nX; i++) {
    for (let j = 0; j < nZ; j++) {
      const x = xs[i];
      const z = zs[j];
      intersections.push({
        id: ixId(i, j, nZ),
        x,
        z,
        signal: 'ns',
        hasLight: inList(x, avenueXs) || inList(z, avenueZs),
      });
    }
  }

  const lanes = [];
  let laneId = 0;

  function addLane(fields) {
    lanes.push({
      id: laneId++,
      ...fields,
      next: [],
    });
  }

  for (let i = 0; i < nX; i++) {
    const x = xs[i];
    const width = streetWidthX(x);
    const off = width / 4;
    const speed = inList(x, avenueXs) ? 15 : 11;
    for (let j = 0; j < nZ - 1; j++) {
      const fromS = ixId(i, j, nZ);
      const toS = ixId(i, j + 1, nZ);
      addLane({
        x1: x - off,
        z1: zs[j],
        x2: x - off,
        z2: zs[j + 1],
        dirX: 0,
        dirZ: 1,
        axis: 'ns',
        from: fromS,
        to: toS,
        speed,
      });
      addLane({
        x1: x + off,
        z1: zs[j + 1],
        x2: x + off,
        z2: zs[j],
        dirX: 0,
        dirZ: -1,
        axis: 'ns',
        from: toS,
        to: fromS,
        speed,
      });
    }
  }

  for (let j = 0; j < nZ; j++) {
    const z = zs[j];
    if (isPromenadeZ(z)) continue;
    const width = streetWidthZ(z);
    const off = width / 4;
    const speed = inList(z, avenueZs) ? 15 : 11;
    for (let i = 0; i < nX - 1; i++) {
      const fromE = ixId(i, j, nZ);
      const toE = ixId(i + 1, j, nZ);
      addLane({
        x1: xs[i],
        z1: z + off,
        x2: xs[i + 1],
        z2: z + off,
        dirX: 1,
        dirZ: 0,
        axis: 'ew',
        from: fromE,
        to: toE,
        speed,
      });
      addLane({
        x1: xs[i + 1],
        z1: z - off,
        x2: xs[i],
        z2: z - off,
        dirX: -1,
        dirZ: 0,
        axis: 'ew',
        from: toE,
        to: fromE,
        speed,
      });
    }
  }

  const outgoing = new Map();
  for (let i = 0; i < lanes.length; i++) {
    const L = lanes[i];
    let list = outgoing.get(L.from);
    if (!list) {
      list = [];
      outgoing.set(L.from, list);
    }
    list.push(L);
  }
  for (let i = 0; i < lanes.length; i++) {
    const L = lanes[i];
    const cand = outgoing.get(L.to) || [];
    const next = [];
    for (let k = 0; k < cand.length; k++) {
      const M = cand[k];
      if (M.to !== L.from) next.push(M.id);
    }
    L.next = next;
  }

  const sidewalks = [];
  for (let i = 0; i < nX; i++) {
    const x = xs[i];
    const roadW = streetWidthX(x);
    const shift = roadW / 2 + SIDEWALK_HALF;
    for (let j = 0; j < nZ - 1; j++) {
      sidewalks.push({
        x1: x - shift,
        z1: zs[j],
        x2: x - shift,
        z2: zs[j + 1],
        width: SIDEWALK_W,
      });
      sidewalks.push({
        x1: x + shift,
        z1: zs[j],
        x2: x + shift,
        z2: zs[j + 1],
        width: SIDEWALK_W,
      });
    }
  }
  for (let j = 0; j < nZ; j++) {
    const z = zs[j];
    const roadW = streetWidthZ(z);
    const shift = roadW / 2 + SIDEWALK_HALF;
    for (let i = 0; i < nX - 1; i++) {
      sidewalks.push({
        x1: xs[i],
        z1: z - shift,
        x2: xs[i + 1],
        z2: z - shift,
        width: SIDEWALK_W,
      });
      sidewalks.push({
        x1: xs[i],
        z1: z + shift,
        x2: xs[i + 1],
        z2: z + shift,
        width: SIDEWALK_W,
      });
    }
  }

  return {
    intersections,
    lanes,
    sidewalks,
    pois: {
      downtown: { x: 0, z: 0 },
      beach: { x: -80, z: 470 },
      pier: { x: 0, z: 530 },
      port: { x: 400, z: 240 },
    },
  };
}

/**
 * Цикл светофоров 24 с. Пишет .signal только у hasLight.
 * @param {number} dt
 * @param {{ state: { city?: { intersections?: { hasLight: boolean, signal: string }[] } } }} engine
 */
export function updateCityGraph(dt, engine) {
  const city = engine && engine.state && engine.state.city;
  if (!city || !city.intersections) return;
  t = (t + dt) % CYCLE;
  const signal = signalAt(t);
  const list = city.intersections;
  for (let i = 0; i < list.length; i++) {
    if (list[i].hasLight === true) list[i].signal = signal;
  }
}
