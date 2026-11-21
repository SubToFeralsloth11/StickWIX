import { defineSticker } from './define';

export default defineSticker({
  type: 'float',
  category: 'visual',
  label: 'Float',
  help: 'Bobs gently up and down. Nice for coins, items and ghosts.',
  icon: 'builtin:img/coin',
  fields: [
    { key: 'height', kind: 'slider', label: 'How far', help: 'Pixels it moves up and down.', min: 1, max: 200, step: 1, unit: 'px' },
    { key: 'speed', kind: 'slider', label: 'Speed', help: 'Bobs per second.', min: 0.1, max: 10, step: 0.1 },
  ],
  init(_inst, _s, state) {
    state.t = 0;
    state.off = 0;
  },
  step(inst, s, state, ctx) {
    state.t = (state.t as number) + ctx.dt;
    const off = Math.sin((state.t as number) * s.speed * Math.PI * 2) * s.height;
    inst.y += off - (state.off as number);
    state.off = off;
  },
});
