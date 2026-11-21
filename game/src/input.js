// SOLMAR v4 — keyboard + mouse input (drag orbit, no pointer-lock dependency).
export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys, mouseDX: 0, mouseDY: 0, clicked: false, dragging: false,
    wheel: 0,
  };
  const down = (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  const up = (e) => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  let lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    state.dragging = true; lastX = e.clientX; lastY = e.clientY;
    if (e.button === 0) state.clicked = true;
  });
  window.addEventListener('mouseup', () => { state.dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!state.dragging) return;
    state.mouseDX += e.clientX - lastX; state.mouseDY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { state.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  window.addEventListener('blur', () => keys.clear());
  return {
    state,
    axis() {
      // returns {f, s} forward/strafe in [-1,1]
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { f, s };
    },
    pressed(code) { return keys.has(code); },
    consumeClick() { const c = state.clicked; state.clicked = false; return c; },
    consumeMouse() { const dx = state.mouseDX, dy = state.mouseDY; state.mouseDX = 0; state.mouseDY = 0; return { dx, dy }; },
    consumeWheel() { const w = state.wheel; state.wheel = 0; return w; },
  };
}
