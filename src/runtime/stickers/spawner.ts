import { center, defineSticker } from './define';

export default defineSticker({
  type: 'spawner',
  category: 'gameplay',
  label: 'Spawner',
  help: 'Keeps making new objects of a Kind, like a monster spawner or a cloud making raindrops.',
  icon: 'builtin:img/gem',
  fields: [
    { key: 'kind', kind: 'kind', label: 'Makes', help: 'The Kind it creates.', emptyLabel: 'Choose a Kind' },
    { key: 'every', kind: 'slider', label: 'Every', help: 'Seconds between new ones.', min: 0.1, max: 60, step: 0.1, unit: 's' },
    { key: 'max', kind: 'slider', label: 'At most', help: 'Stops while there are this many of that Kind.', min: 1, max: 200, step: 1 },
    { key: 'spread', kind: 'slider', label: 'Spread', help: 'New ones appear up to this far away, at random.', min: 0, max: 1000, step: 8, unit: 'px' },
  ],
  events: [{ id: 'spawns', phrase: 'spawns something' }],
  init(_inst, s, state) {
    state.t = s.every;
  },
  step(inst, s, state, ctx) {
    if (!s.kind) return;
    state.t = (state.t as number) - ctx.dt;
    if ((state.t as number) > 0) return;
    state.t = s.every;
    if (ctx.world.byKind(s.kind).length >= s.max) return;
    const c = center(inst);
    const ox = (ctx.rng() * 2 - 1) * s.spread;
    const oy = (ctx.rng() * 2 - 1) * s.spread;
    const made = ctx.world.spawn(s.kind, c.x + ox, c.y + oy, (o) => {
      o.x -= o.w / 2;
      o.y -= o.h / 2;
    });
    if (made) ctx.emit({ type: 'sticker', id: inst.id, event: 'spawns' });
  },
});
