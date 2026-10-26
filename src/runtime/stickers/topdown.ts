import { anyHeld, applyMotionLook, defineSticker, keysFor } from './define';

export default defineSticker({
  type: 'topdown',
  category: 'controller',
  label: 'Top-down Controller',
  help: 'Walks in any direction with the arrow keys or WASD, seen from above.',
  icon: 'builtin:img/knight',
  fields: [
    { key: 'speed', kind: 'slider', label: 'Walk speed', help: 'How fast it walks, in pixels per second.', min: 20, max: 800, step: 10 },
    {
      key: 'directions', kind: 'choice', label: 'Directions', help: '8 lets it walk diagonally; 4 only straight up, down, left and right.',
      options: [{ value: 8, label: '8 directions' }, { value: 4, label: '4 directions' }],
    },
    {
      key: 'keys', kind: 'choice', label: 'Keys', help: 'Which keys move it.',
      options: [{ value: 'both', label: 'Arrows and WASD' }, { value: 'arrows', label: 'Arrows only' }, { value: 'wasd', label: 'WASD only' }],
    },
    { key: 'faceMovement', kind: 'toggle', label: 'Face where it walks', help: 'Flips to look left or right when walking that way.' },
    { key: 'walkLook', kind: 'look', label: 'Walking look', help: 'Look while walking (empty keeps its normal look).' },
  ],
  init(inst, _s, state) {
    inst.body = true;
    state.axis = 'x';
  },
  step(inst, s, state, ctx) {
    if (inst.dragged) return;
    if (inst.stun > 0) {
      inst.stun -= ctx.dt;
      inst.vx *= 0.85;
      inst.vy *= 0.85;
      return;
    }
    const { held, pressed } = ctx.input;
    let dx = (anyHeld(held, keysFor('right', s.keys)) ? 1 : 0) - (anyHeld(held, keysFor('left', s.keys)) ? 1 : 0);
    let dy = (anyHeld(held, keysFor('down', s.keys)) ? 1 : 0) - (anyHeld(held, keysFor('up', s.keys)) ? 1 : 0);
    if (s.directions === 4) {
      // The most recently pressed axis wins.
      if ([...keysFor('up', s.keys), ...keysFor('down', s.keys)].some((k) => pressed.has(k))) state.axis = 'y';
      if ([...keysFor('left', s.keys), ...keysFor('right', s.keys)].some((k) => pressed.has(k))) state.axis = 'x';
      if (dx !== 0 && dy !== 0) {
        if (state.axis === 'x') dy = 0;
        else dx = 0;
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    inst.vx = (dx / len) * s.speed;
    inst.vy = (dy / len) * s.speed;
    if (dx !== 0 || dy !== 0) inst.dir = { x: dx / len, y: dy / len };
    if (s.faceMovement && dx !== 0) inst.facing = dx;
    applyMotionLook(inst, state, (dx || dy) && s.walkLook ? s.walkLook : null);
  },
});
