import { center, defineSticker, targetKinds } from './define';

export default defineSticker({
  type: 'breakable',
  category: 'input',
  label: 'Breakable',
  help: 'Breaks when the mouse is held on it long enough, showing cracks as it goes. Like mining blocks.',
  icon: 'builtin:img/crate',
  fields: [
    { key: 'seconds', kind: 'slider', label: 'Time to break', help: 'How long the mouse must be held on it.', min: 0.05, max: 30, step: 0.05, unit: 's' },
    {
      key: 'button', kind: 'choice', label: 'Mouse button', help: 'Which button breaks it.',
      options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
    },
    { key: 'reach', kind: 'slider', label: 'Reach', help: 'Only breaks when the player is this close (0 = from anywhere).', min: 0, max: 3000, step: 8, unit: 'px' },
    { key: 'drop', kind: 'kind', label: 'Drops', help: 'Leaves this behind when it breaks (like an item to pick up).', emptyLabel: 'Nothing' },
    { key: 'sound', kind: 'sound', label: 'Break sound', help: 'Plays when it breaks.' },
    { key: 'cracks', kind: 'toggle', label: 'Show cracks', help: 'Draws cracks and a little progress bar while breaking.' },
  ],
  events: [{ id: 'broken', phrase: 'is broken' }],
  init(_inst, _s, state) {
    state.t = 0;
  },
  step(inst, s, state, ctx) {
    const m = ctx.world.mouseWorld();
    const over = ctx.world.topmostAt(m.x, m.y) === inst;
    let near = true;
    if (s.reach > 0) {
      const c = center(inst);
      near = targetKinds(null, ctx).some((k) => ctx.world.byKind(k).some((p) => Math.hypot(center(p).x - c.x, center(p).y - c.y) <= s.reach));
    }
    if (over && near && ctx.input.buttons.held.has(s.button)) state.t = (state.t as number) + ctx.dt;
    else state.t = 0;
    const k = Math.min(1, (state.t as number) / s.seconds);
    inst.crack = s.cracks ? k : 0;
    if (k < 1) return;
    const c = center(inst);
    ctx.world.playSound(s.sound);
    ctx.world.burst(c.x, c.y, inst.tint ?? '#c8b48a', 14);
    if (s.drop) ctx.world.spawn(s.drop, c.x, c.y, (d) => {
      d.x -= d.w / 2;
      d.y -= d.h / 2;
    });
    ctx.emit({ type: 'sticker', id: inst.id, event: 'broken' });
    ctx.world.destroy(inst);
  },
});
