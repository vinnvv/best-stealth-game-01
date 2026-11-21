// Keyboard and mouse, read as a plain object each frame. The game asks for a
// direction (a unit vector or zero), whether the player is sneaking, and which
// one-shot actions happened since the last read.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const KEY_DIRECTION = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const down = new Set();
  let actions = 0;
  let click = null;
  let mouse = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    down.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    down.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    click = { x: event.clientX - rect.left, y: event.clientY - rect.top, button: event.button };
    mouse = { x: click.x, y: click.y };
  }

  function onBlur() {
    down.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  function direction() {
    let x = 0;
    let y = 0;
    for (const code of down) {
      const d = KEY_DIRECTION[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  }

  function sneaking() {
    return down.has('ShiftLeft') || down.has('ShiftRight');
  }

  /** The one-shot actions since the last call, then cleared. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** The mouse click since the last call (or null), then cleared. */
  function takeClick() {
    const taken = click;
    click = null;
    return taken;
  }

  function mousePos() {
    return mouse;
  }

  return { direction, sneaking, takeActions, takeClick, mousePos };
}
