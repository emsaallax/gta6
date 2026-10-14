// Миссия «Оторваться от погони» и правило heat при ударе о полицейскую машину.
// Без импорта three. Состояние приходит снаружи (state), класс его не хранит.

const ESCAPE_TIME = 120; // сек
const LEVEL3_HEAT = 70;  // level 3 = heat >= 60

// Контроллер тела или его vehicle (у полицейской vehicle.controller === 'police').
const ctrlOf = (o) => o?.controller ?? o?.vehicle?.controller;

export class EscapeMission {
  // Старт: 3 звезды, heat 70, таймер 120 с.
  start(state) {
    if (!state.wanted) state.wanted = { level: 0, heat: 0, lastSeen: null, cooldown: 0 };
    state.wanted.level = 3;
    state.wanted.heat = LEVEL3_HEAT;
    state.mission = {
      id: 'escape',
      title: 'Оторваться от погони',
      status: 'active',
      target: null,
      timeLeft: ESCAPE_TIME,
    };
  }

  // Вызывать каждый кадр. Работает только пока миссия escape активна. Без аллокаций.
  update(dt, state) {
    const m = state.mission;
    if (!m || m.id !== 'escape' || m.status !== 'active') return;
    m.timeLeft -= dt;
    if (state.wanted.level === 0) { m.status = 'success'; return; } // успех важнее таймера
    if (m.timeLeft <= 0) m.status = 'fail';
  }
}

// Прирост heat за удар player + police при impulse >= 6, иначе 0: 15 + min(25, impulse), то есть 21..40.
export function crashHeat(data) {
  const a = ctrlOf(data?.a);
  const b = ctrlOf(data?.b);
  const pair = (a === 'player' && b === 'police') || (a === 'police' && b === 'player');
  const impulse = data?.impulse || 0;
  if (!pair || impulse < 6) return 0;
  return 15 + Math.min(25, impulse);
}
