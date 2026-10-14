import { scaledDt } from './timescale.js';

/** Секунд на один шаг физики. */
export const FIXED_DT = 1 / 60;

/**
 * Накапливает время кадра и вызывает onStep(FIXED_DT) целое число раз.
 * maxSteps — защита от «спирали смерти» (кадр очень долгий).
 */
export class FixedStep {
  constructor(fixedDt = FIXED_DT, maxSteps = 5) {
    this.fixedDt = fixedDt;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
  }

  /**
   * frameDt — время кадра (уже обрезанное, напр. ≤ 0.05).
   * onStep(fixedDt) — колбэк одного шага.
   * Возврат: сколько шагов сделано (0…maxSteps).
   * Остаток accumulator сохраняется до следующего tick.
   */
  tick(frameDt, onStep) {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      onStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }
    if (steps === this.maxSteps && this.accumulator >= this.fixedDt) {
      this.accumulator = this.accumulator % this.fixedDt;
    }
    return steps;
  }

  /** Доля до следующего шага 0…1 (для сглаживания; можно не использовать снаружи). */
  alpha() {
    if (this.fixedDt <= 0) return 0;
    return Math.min(1, Math.max(0, this.accumulator / this.fixedDt));
  }
}

/**
 * Если paused ещё не задавали — поставить false.
 * Не затирай true: меню паузы (группа 5) пишет сюда.
 */
export function ensurePauseState(engine) {
  engine.state.paused = engine.state.paused === true;
}

export function isPaused(engine) {
  return engine.state.paused === true;
}

/**
 * Тело игрового кадра. Лид вставляет в Engine.start: attachLoop(this).
 *
 * Порядок: пауза → dt → шаги систем (если не пауза) → input.endFrame всегда → render → rAF.
 */
export function attachLoop(engine) {
  const stepper = new FixedStep();

  function loop() {
    ensurePauseState(engine);
    const dt = Math.min(engine.clock.getDelta(), 0.05);

    if (!isPaused(engine)) {
      // Таймер слоу-мо от realtime dt, не от scaled.
      engine._slowMo?.update?.(dt, engine);
      let stepN = 0;
      stepper.tick(dt, (fixedDt) => {
        const simDt = scaledDt(fixedDt, engine);
        for (const s of engine.systems) s.update?.(simDt, engine);
        engine.physics.stepBodies?.(engine);
        engine.state.fx?.update?.(simDt, engine);
        stepN += 1;
        // Один клик — один фикс-шаг: иначе justPressed живёт до endFrame и даёт 2–3 выстрела.
        if (stepN === 1) engine.input.clearPressed?.();
      });
    }

    engine.input.endFrame();
    if (typeof engine.render === 'function') engine.render();
    else engine.renderer.render(engine.scene, engine.camera);
    requestAnimationFrame(loop);
  }

  loop();
}
