import { defineSticker } from './define';

export default defineSticker({
  type: 'wander',
  category: 'gameplay',
  label: 'Wander',
  help: 'Walks around at random, stopping and turning now and then. Good for animals and villagers.',
  icon: 'builtin:img/slime',
  fields: [
    { key: 'speed', kind: 'slider', label: 'Speed', help: 'How fast it walks.', min: 5, max: 600, step: 5 },
    { key: 'changeEvery', kind: 'slider', label: 'Change mind every', help: 'About how often it picks a new direction.', min: 0.2, max: 20, step: 0.1, unit: 's' },
    {
      key: 'axis', kind: 'choice', label: 'Moves', help: 'Only sideways (platform games) or in every direction (top-down).',
      options: [{ value: 'x', label: 'Sideways' }, { value: 'both', label: 'Any direction' }],
    },
  ],
  init(inst, _s, state) {
    inst.body = true;
    state.t = 0;
    state.dx = 0;
    state.dy = 0;
  },
  step(inst, s, state, ctx) {
    if (inst.dragged || inst.stun > 0) return;
    state.t = (state.t as number) - ctx.dt;
    if ((state.t as number) <= 0 || inst.blocked.left || inst.blocked.right) {
      state.t = s.changeEvery * (0.5 + ctx.rng());
      const r = ctx.rng();
      if (s.axis === 'x') {
        state.dx = r < 0.3 ? 0 : r < 0.65 ? -1 : 1;
        if (inst.blocked.left) state.dx = 1;
        if (inst.blocked.right) state.dx = -1;
        state.dy = 0;
      } else {
        const a = r * Math.PI * 2;
        const still = ctx.rng() < 0.25;
        state.dx = still ? 0 : Math.cos(a);
        state.dy = still ? 0 : Math.sin(a);
      }
    }
    inst.vx = (state.dx as number) * s.speed;
    if (s.axis === 'both') inst.vy = (state.dy as number) * s.speed;
    if (inst.vx) inst.facing = inst.vx < 0 ? -1 : 1;
    inst.dir = { x: state.dx as number, y: state.dy as number };
  },
});
