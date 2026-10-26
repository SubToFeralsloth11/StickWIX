import { defineSticker } from './define';

export default defineSticker({
  type: 'falls',
  category: 'physics',
  label: 'Falls',
  help: 'Gravity pulls it down until it lands on something solid.',
  icon: 'builtin:img/rock',
  fields: [
    { key: 'gravity', kind: 'slider', label: 'Gravity', help: 'How strongly it is pulled down.', min: 100, max: 5000, step: 50 },
    { key: 'maxFall', kind: 'slider', label: 'Top falling speed', help: 'It never falls faster than this.', min: 50, max: 3000, step: 50 },
  ],
  events: [{ id: 'lands', phrase: 'lands' }],
  init(inst, _s, state) {
    inst.body = true;
    state.air = 0;
  },
  step(inst, s, state, ctx) {
    if (inst.dragged) return;
    if (inst.grounded) {
      if ((state.air as number) >= 2) ctx.emit({ type: 'sticker', id: inst.id, event: 'lands' });
      state.air = 0;
    } else state.air = (state.air as number) + 1;
    inst.vy = Math.min(s.maxFall, inst.vy + s.gravity * ctx.dt);
  },
});
