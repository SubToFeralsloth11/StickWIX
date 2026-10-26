import { defineSticker } from './define';

export default defineSticker({
  type: 'clickable',
  category: 'input',
  label: 'Clickable',
  help: 'Grows a little under the mouse and clicks when pressed. Use "is clicked" rules.',
  icon: 'builtin:img/cookie',
  fields: [
    { key: 'hoverGrow', kind: 'toggle', label: 'Grow under the mouse', help: 'Gets slightly bigger when the mouse is over it.' },
    { key: 'sound', kind: 'sound', label: 'Click sound', help: 'Plays when it is clicked.' },
  ],
  step(inst, s, _state, ctx) {
    const m = ctx.world.mouseWorld();
    const over = ctx.world.topmostAt(m.x, m.y) === inst;
    const target = s.hoverGrow && over ? (ctx.input.mouse.down ? 0.95 : 1.08) : 1;
    inst.pop += (target - inst.pop) * 0.3;
    if (over && ctx.input.mouse.pressed) ctx.world.playSound(s.sound);
  },
});
