// ФАЙЛЫ: src/vehicles/carFeel.js, src/traffic/redStop.js

export const STOP_LINE = 8; // метры до центра перекрёстка to

const DEFAULT_SPEED = 11;
const CREEP = 5;
const APPROACH_MIN = 2.5;
const APPROACH_MAX = 6;
const HOLD_BAND = 9;
const HOLD_CAP = 2;

function laneSpeed(lane) {
  return lane && lane.speed != null ? lane.speed : DEFAULT_SPEED;
}

function isRed(ix, lane) {
  if (!ix || ix.hasLight !== true) return false;
  const signal = ix.signal;
  const axis = lane && lane.axis;
  return signal === 'red' || signal !== axis;
}

/**
 * gap — расстояние по XZ от машины до {ix.x, ix.z}.
 * Красный, если hasLight и (signal==='red' || signal !== lane.axis).
 * Нет светофора (hasLight!==true) → creep=5, не стоп-линия.
 *
 * Вернуть целевую скорость (м/с) и можно ли ехать ближе.
 * @returns {{ target: number, hold: boolean }}
 */
export function redLightTarget({ speed, gap, toward, lane, ix }) {
  if (toward === false || !ix) {
    return { target: laneSpeed(lane), hold: false };
  }

  const hasLight = ix.hasLight === true;
  if (hasLight && lane && ix.signal === lane.axis) {
    return { target: laneSpeed(lane), hold: false };
  }

  if (!hasLight) {
    if (gap > STOP_LINE) {
      return { target: Math.min(laneSpeed(lane), CREEP), hold: false };
    }
    return { target: laneSpeed(lane), hold: false };
  }

  if (isRed(ix, lane) && toward) {
    if (gap > HOLD_BAND) {
      const cur = speed || APPROACH_MIN;
      return { target: Math.max(APPROACH_MIN, Math.min(cur, APPROACH_MAX)), hold: false };
    }
    if (gap > STOP_LINE && gap <= HOLD_BAND) {
      return { target: Math.min(speed || 0, HOLD_CAP), hold: true };
    }
    return { target: 0, hold: true };
  }

  return { target: laneSpeed(lane), hold: false };
}
