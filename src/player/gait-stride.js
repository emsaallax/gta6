// ФАЙЛЫ: src/player/gait-stride.js, src/npc/ped-gait.js
// Шаг без скольжения: timeScale клипа = скорость / опорная, процедурные ноги по фазе.

export const WALK_REF_SPEED = 4;
export const SPRINT_REF_SPEED = 9;
export const WALK_STRIDE = 1.35;
export const SPRINT_STRIDE = 2.4;
export const TIMESCALE_MIN = 0.45;
export const TIMESCALE_MAX = 1.8;

const TWO_PI = Math.PI * 2;
const AMP_WALK = 0.42;
const AMP_RUN = 0.72;
const STEP_VOLUME = 0.35;

/** gait 'walk' → speed/4; 'run' → speed/9; иначе 1. clamp 0.45..1.8. Не finite → 1. */
export function strideTimeScale(speed, gait) {
  let scale = 1;
  if (gait === 'walk') scale = speed / WALK_REF_SPEED;
  else if (gait === 'run') scale = speed / SPRINT_REF_SPEED;
  if (!Number.isFinite(scale)) return 1;
  if (scale < TIMESCALE_MIN) return TIMESCALE_MIN;
  if (scale > TIMESCALE_MAX) return TIMESCALE_MAX;
  return scale;
}

/**
 * Только gait walk|run. hz = speed / stride (walk 1.35, run 2.4).
 * anim.phase += dt * hz * 2π. Ноги: legL.x = sin(phase)*amp, legR.x = -sin.
 */
export function applyStridePose(anim, parts, speed, gait, dt) {
  if (!anim || !parts) return;
  if (gait !== 'walk' && gait !== 'run') return;

  const stride = gait === 'run' ? SPRINT_STRIDE : WALK_STRIDE;
  const spd = Number.isFinite(speed) ? speed : 0;
  const stepDt = Number.isFinite(dt) ? dt : 0;
  const hz = stride > 0 ? spd / stride : 0;
  anim.phase = (anim.phase || 0) + stepDt * hz * TWO_PI;

  const amp = gait === 'run' ? AMP_RUN : AMP_WALK;
  const swing = Math.sin(anim.phase) * amp;

  const { legL, legR, armL, armR } = parts;
  if (legL && legL.rotation) {
    legL.rotation.x = swing;
    legL.rotation.y = 0;
    legL.rotation.z = 0;
  }
  if (legR && legR.rotation) {
    legR.rotation.x = -swing;
    legR.rotation.y = 0;
    legR.rotation.z = 0;
  }
  if (armL && armL.rotation) armL.rotation.x = -swing;
  if (armR && armR.rotation) armR.rotation.x = swing;
}

/** Текущий клип walk|sprint: action.timeScale = strideTimeScale. idle/jump/shoot не трогать. */
export function applyKenneyStride(hero, speed, gait) {
  if (!hero || !hero.actions) return;
  const clip = hero._clip;
  if (clip !== 'walk' && clip !== 'sprint') return;
  const action = hero.actions[clip];
  if (!action) return;
  const g = clip === 'sprint' || gait === 'run' ? 'run' : 'walk';
  action.timeScale = strideTimeScale(speed, g);
}

/**
 * Смена опоры: sin(phase) сменил знак. Тогда если engine.state.audio?.play —
 * audio.play('step', { volume: 0.35 }). Нет audio — молчать. true если шаг.
 */
export function maybePlayStep(anim, prevPhase, engine) {
  if (!anim || !Number.isFinite(anim.phase) || !Number.isFinite(prevPhase)) return false;
  const curSign = Math.sign(Math.sin(anim.phase));
  const prevSign = Math.sign(Math.sin(prevPhase));
  if (curSign === prevSign || curSign === 0) return false;

  const audio = engine && engine.state && engine.state.audio;
  if (audio && typeof audio.play === 'function') {
    audio.play('step', { volume: STEP_VOLUME });
  }
  return true;
}
