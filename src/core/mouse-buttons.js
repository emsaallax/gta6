// ГРУППА 1. ЛКМ/ПКМ как input.down('Mouse0') / input.down('Mouse2').
export const MOUSE_LEFT = 'Mouse0';
export const MOUSE_RIGHT = 'Mouse2';

/**
 * Слушатели на el (canvas) и window.
 * mousedown:
 *   button===0 → если кода не было в keys — justPressed.add('Mouse0'); keys.add('Mouse0'); mouse.left=true
 *   button===2 → то же для 'Mouse2' (mouse.left не трогать)
 * mouseup: button 0 → keys.delete('Mouse0'), mouse.left=false; button 2 → keys.delete('Mouse2')
 * contextmenu на el: preventDefault (чтобы ПКМ не открывал меню)
 * Возврат не нужен.
 * Не ломай клавиатуру и геймпад. Не вызывай requestPointerLock (это уже делает Input).
 */
export function attachMouseButtons(input, el) {
  function onMouseDown(e) {
    if (e.button === 0) {
      if (!input.keys.has(MOUSE_LEFT)) input.justPressed.add(MOUSE_LEFT);
      input.keys.add(MOUSE_LEFT);
      input.mouse.left = true;
    } else if (e.button === 2) {
      if (!input.keys.has(MOUSE_RIGHT)) input.justPressed.add(MOUSE_RIGHT);
      input.keys.add(MOUSE_RIGHT);
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) {
      input.keys.delete(MOUSE_LEFT);
      input.mouse.left = false;
    } else if (e.button === 2) {
      input.keys.delete(MOUSE_RIGHT);
    }
  }

  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
