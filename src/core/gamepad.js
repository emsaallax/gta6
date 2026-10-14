export const DEADZONE = 0.18;
export const LOOK_SCALE = 14;   // в пиксели мыши за кадр при стике = 1
export const STICK_KEY = 0.4;   // порог, с которого стик = KeyW/A/S/D

/** v — число оси; |v|<dz → 0, иначе масштаб наружу, чтобы край оси остался ±1. */
export function applyDeadzone(v, dz = DEADZONE) {
  if (v == null || Number.isNaN(v)) return 0;
  const a = Math.abs(v);
  if (a < dz) return 0;
  if (dz >= 1) return v < 0 ? -1 : 1;
  const scaled = (a - dz) / (1 - dz);
  return (v < 0 ? -1 : 1) * Math.min(1, scaled);
}

function btn(pad, i) {
  const b = pad.buttons && pad.buttons[i];
  if (!b) return false;
  return b.pressed || b.value > 0.5;
}

/**
 * Снимок первого геймпада (индекс 0). Без navigator — как «нет пада».
 * Оси после deadzone. Стик вверх (axes[1] < 0) → moveY < 0 → это «вперёд».
 */
export function readGamepad(index = 0) {
  const empty = {
    connected: false,
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    codes: new Set(),
  };

  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return empty;
  }

  let pads;
  try {
    pads = navigator.getGamepads();
  } catch (e) {
    return empty;
  }
  const pad = pads && pads[index];
  if (!pad) return empty;

  const ax = pad.axes || [];
  const moveX = applyDeadzone(ax[0]);
  const moveY = applyDeadzone(ax[1]);
  const lookX = applyDeadzone(ax[2]);
  const lookY = applyDeadzone(ax[3]);

  const codes = new Set();
  if (moveX < -STICK_KEY || btn(pad, 14)) codes.add('KeyA');
  if (moveX > STICK_KEY || btn(pad, 15)) codes.add('KeyD');
  if (moveY < -STICK_KEY || btn(pad, 12)) codes.add('KeyW');
  if (moveY > STICK_KEY || btn(pad, 13)) codes.add('KeyS');
  if (btn(pad, 7) || btn(pad, 10)) codes.add('ShiftLeft');
  if (btn(pad, 0)) codes.add('Space');
  if (btn(pad, 2)) codes.add('KeyF');
  if (btn(pad, 1)) codes.add('KeyC');
  if (btn(pad, 9)) codes.add('Escape');

  return { connected: true, moveX, moveY, lookX, lookY, codes };
}
