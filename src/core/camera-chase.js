// ФАЙЛЫ: src/core/camera-chase.js
// Камера погони: обычная / бампер / кино (клавиша V подключает лид).

export const CHASE_MODES = ['normal', 'bumper', 'cinema'];
export const CINEMA_PERIOD = 4;
export const CINEMA_BLEND = 0.8;
export const BUMPER_DIST = 2.2;
export const BUMPER_HEIGHT = 0.55;

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function isVecFinite(v) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function readPos(t) {
  const p = t && t.position;
  return {
    x: finite(p && p.x),
    y: finite(p && p.y),
    z: finite(p && p.z),
  };
}

function headingOf(t) {
  return finite(t && t.heading);
}

function lerpVec(a, b, k) {
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
  };
}

function smoothstep(x) {
  const t = clamp(finite(x), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 'normal'→'bumper'→'cinema'→'normal'. Иное / нет → 'bumper'. */
export function nextChaseMode(mode) {
  if (mode === 'normal') return 'bumper';
  if (mode === 'bumper') return 'cinema';
  if (mode === 'cinema') return 'normal';
  return 'bumper';
}

/**
 * t = cameraTarget { position, heading, distance, height }.
 * h = heading??0. pos нет → (0,0,0).
 * Бампер за кормой: x = pos.x + sin(h)*2.2; y = pos.y + 0.55; z = pos.z + cos(h)*2.2.
 * Все finite. Возврат {x,y,z}.
 */
export function bumperPos(t) {
  const pos = readPos(t);
  const h = headingOf(t);
  const out = {
    x: pos.x + Math.sin(h) * BUMPER_DIST,
    y: pos.y + BUMPER_HEIGHT,
    z: pos.z + Math.cos(h) * BUMPER_DIST,
  };
  return {
    x: finite(out.x),
    y: finite(out.y),
    z: finite(out.z),
  };
}

const CINEMA_SHOTS = [
  { yaw: 0.55, dist: 8, height: 1.6 },
  { yaw: Math.PI / 2, dist: 7, height: 1.2 },
  { yaw: -0.7, dist: 9, height: 2.0 },
];

/**
 * shot 0: сзади-слева (h+0.55 рад, dist 8, height 1.6)
 * shot 1: строго сбоку (h+π/2, dist 7, height 1.2)
 * shot 2: сзади-справа 3/4 (h-0.7, dist 9, height 2.0)
 * Иной shot → 0. Формула как орбита: x=pos.x+sin(h+yaw)*dist, z=pos.z+cos(h+yaw)*dist, y=pos.y+height.
 * Возврат {x,y,z} finite.
 */
export function cinemaShotPos(t, shot) {
  const spec = CINEMA_SHOTS[shot] || CINEMA_SHOTS[0];
  const pos = readPos(t);
  const h = headingOf(t);
  const out = {
    x: pos.x + Math.sin(h + spec.yaw) * spec.dist,
    y: pos.y + spec.height,
    z: pos.z + Math.cos(h + spec.yaw) * spec.dist,
  };
  return {
    x: finite(out.x),
    y: finite(out.y),
    z: finite(out.z),
  };
}

/**
 * Не читать input и state. Лид:
 *   if (input.pressed('KeyV')) rig.toggle()
 *   pos = rig.desiredPos(state.cameraTarget, dt); если не null — камера туда.
 */
export function createChaseRig() {
  let mode = 'normal';
  let shot = 0;
  let shotT = 0;
  let blend = 0;
  let firstCinemaFrame = false;

  return {
    get mode() {
      return mode;
    },
    set mode(v) {
      mode = v;
    },
    toggle() {
      mode = nextChaseMode(mode);
      if (mode === 'cinema') {
        shotT = 0;
        shot = 0;
        blend = 0;
        firstCinemaFrame = true;
      }
    },
    desiredPos(t, dt) {
      if (!t || t.mode !== 'vehicle' || mode === 'normal') return null;
      if (mode === 'bumper') return bumperPos(t);
      if (mode !== 'cinema') return null;

      const step = finite(dt);
      shotT += step;
      if (shotT >= CINEMA_PERIOD) {
        shotT -= CINEMA_PERIOD;
        shot = (shot + 1) % 3;
        blend = 0;
        firstCinemaFrame = false;
      }
      blend += step / CINEMA_BLEND;
      blend = clamp(blend, 0, 1);

      const to = cinemaShotPos(t, shot);
      // Первый план режима: from=to, иначе на 2-м кадре скачок к «предыдущему» shot 2.
      const from = firstCinemaFrame
        ? to
        : cinemaShotPos(t, (shot + 2) % 3);

      const k = smoothstep(blend);
      let pos = lerpVec(from, to, k);
      if (!isVecFinite(pos)) pos = bumperPos(t);
      return {
        x: finite(pos.x),
        y: finite(pos.y),
        z: finite(pos.z),
      };
    },
  };
}
