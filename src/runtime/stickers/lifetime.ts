import { defineSticker } from './define';

export default defineSticker({
  type: 'lifetime',
  category: 'gameplay',
  label: 'Lifetime',
  help: 'Disappears by itself after a while. Good for bullets, effects and pop-ups.',
  icon: 'builtin:img/fireball',
  fields: [
    { key: 'seconds', kind: 'slider', label: 'Lives for', help: 'Seconds before it disappears.', min: 0.05, max: 120, step: 0.05, unit: 's' },
    { key: 'fade', kind: 'toggle', label: 'Fade out', help: 'Fades away during the last part of its life.' },
  ],
  init(_inst, _s, state) {
    state.t = 0;
  },
  step(inst, s, state, ctx) {
    const t = (state.t as number) + ctx.dt;
    state.t = t;
    const left = s.seconds - t;
    if (s.fade) inst.alpha = Math.min(1, Math.max(0, left / Math.min(0.5, s.seconds / 2)));
    if (left <= 0) ctx.world.destroy(inst);
  },
});
