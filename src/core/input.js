// ГРУППА 1. input.down('KeyW'), input.pressed('KeyE') (только в этот кадр), input.mouse.dx/dy
// Геймпад: те же down/pressed и input.axis('moveX'|'moveY'|'lookX'|'lookY').
import { readGamepad, LOOK_SCALE } from './gamepad.js';

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false };
    this._padCodes = new Set();
    this._padPrev = new Set();
    this._padSnap = { connected: false, moveX: 0, moveY: 0, lookX: 0, lookY: 0, codes: new Set() };
    this._padPolled = false;

    addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    el.addEventListener('click', () => {
      // Промис: отказ (меню «Играть», документ ещё не готов) не должен падать в консоль.
      // Старые браузеры возвращают undefined — catch не зовём.
      try {
        const p = el.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    // Mouse0/Mouse2 вешает attachMouseButtons (engine.js). Старый mousedown
    // на любую кнопку ставил mouse.left и ломал ПКМ.
  }

  down(code) {
    this.pollGamepad();
    return this.keys.has(code) || this._padCodes.has(code);
  }

  pressed(code) {
    this.pollGamepad();
    return this.justPressed.has(code) || (this._padCodes.has(code) && !this._padPrev.has(code));
  }

  /**
   * Как pressed, но нажатие снимается: повторный вызов в этом кадре — false.
   * Нужен, чтобы один клик не стрелял на каждый фикс-шаг.
   */
  consumePressed(code) {
    this.pollGamepad();
    const key = this.justPressed.has(code);
    const pad = this._padCodes.has(code) && !this._padPrev.has(code);
    if (key) this.justPressed.delete(code);
    if (pad) this._padPrev.add(code);
    return key || pad;
  }

  /** Снять все «нажато в этом кадре», чтобы следующие фикс-шаги их не видели. */
  clearPressed() {
    this.justPressed.clear();
    this._padPrev = new Set(this._padCodes);
  }

  /** -1…1. Имена: moveX, moveY, lookX, lookY. Нет пада / неизвестное имя → 0. */
  axis(name) {
    this.pollGamepad();
    if (name !== 'moveX' && name !== 'moveY' && name !== 'lookX' && name !== 'lookY') return 0;
    return this._padSnap[name] ?? 0;
  }

  pollGamepad() {
    if (this._padPolled) return;
    this._padPolled = true;
    this._padPrev = this._padCodes;
    this._padSnap = readGamepad(0);
    this._padCodes = this._padSnap.codes;
    this.mouse.dx += this._padSnap.lookX * LOOK_SCALE;
    this.mouse.dy += this._padSnap.lookY * LOOK_SCALE;
  }

  endFrame() {
    this.justPressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this._padPolled = false;
    this.pollGamepad();
  }
}
