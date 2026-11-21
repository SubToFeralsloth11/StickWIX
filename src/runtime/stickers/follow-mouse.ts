import { defineSticker } from './define';

export default defineSticker({
  type: 'followMouse',
  category: 'input',
  label: 'Follow Mouse',
  help: 'Sticks to the mouse pointer. Make custom cursors, crosshairs, or a ghost block that shows where you will build.',
  icon: 'builtin:img/star',
  fields: [
    { key: 'smoothing', kind: 'slider', label: 'Smoothing', help: '0 sticks exactly; higher trails behind.', min: 0, max: 1, step: 0.05 },
    { key: 'snap', kind: 'slider', label: 'Snap to grid', help: 'Jumps from cell to cell of this size (0 = smooth).', min: 0, max: 256, step: 4, unit: 'px' },
    { key: 'hideCursor', kind: 'toggle', label: 'Hide the real pointer', help: 'Hides the mouse pointer, so this object is the pointer.' },
  ],
  init(inst) {
    inst.ignoreMouse = true;
  },
  step(inst, s, _state, ctx) {
    const m = ctx.world.mouseWorld();
    let x = m.x - inst.w / 2;
    let y = m.y - inst.h / 2;
    if (s.snap > 0) {
      x = Math.floor(m.x / s.snap) * s.snap;
      y = Math.floor(m.y / s.snap) * s.snap;
    }
    const k = s.smoothing <= 0 || s.snap > 0 ? 1 : 1 - Math.exp(-ctx.dt / (s.smoothing * 0.3));
    inst.x += (x - inst.x) * k;
    inst.y += (y - inst.y) * k;
    if (s.hideCursor) ctx.world.cursorHint('none');
  },
});
