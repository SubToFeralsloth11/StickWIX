import { center, defineSticker, targetKinds } from './define';
import type { Instance } from '../types';

export default defineSticker({
  type: 'chase',
  category: 'gameplay',
  label: 'Chase',
  help: 'Moves toward the player (or the Kind you choose) when it comes close.',
  icon: 'builtin:img/ghost',
  fields: [
    { key: 'target', kind: 'kind', label: 'Chases', help: 'Who it goes after.', emptyLabel: 'The player' },
    { key: 'speed', kind: 'slider', label: 'Speed', help: 'How fast it chases.', min: 5, max: 600, step: 5 },
    { key: 'range', kind: 'slider', label: 'Notice distance', help: 'Starts chasing when the target is this close (0 = always).', min: 0, max: 3000, step: 10, unit: 'px' },
  ],
  init(inst, _s, state) {
    inst.body = true;
    state.gravity = inst.stickers.some((s) => s.type === 'falls' || s.type === 'platformer');
  },
  step(inst, s, state, ctx) {
    if (inst.dragged) return;
    if (inst.stun > 0) {
      inst.stun -= ctx.dt;
      return;
    }
    const me = center(inst);
    let best: Instance | undefined;
    let bestD = s.range > 0 ? s.range : Infinity;
    for (const kindId of targetKinds(s.target, ctx))
      for (const t of ctx.world.byKind(kindId)) {
        if (t === inst || t.hidden) continue;
        const c = center(t);
        const d = Math.hypot(c.x - me.x, c.y - me.y);
        if (d <= bestD) {
          bestD = d;
          best = t;
        }
      }
    const onGround = state.gravity as boolean;
    if (!best) {
      inst.vx = 0;
      if (!onGround) inst.vy = 0;
      return;
    }
    const c = center(best);
    if (onGround) {
      const dx = c.x - me.x;
      inst.vx = Math.abs(dx) < 2 ? 0 : Math.sign(dx) * s.speed;
    } else {
      const d = Math.max(bestD, 1e-6);
      inst.vx = ((c.x - me.x) / d) * s.speed;
      inst.vy = ((c.y - me.y) / d) * s.speed;
    }
    if (inst.vx !== 0) inst.facing = Math.sign(inst.vx);
  },
});
