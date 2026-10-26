import { center, defineSticker, targetKinds } from './define';
import { hurt } from './health';

export default defineSticker({
  type: 'hurts',
  category: 'gameplay',
  label: 'Hurts Player',
  help: 'Touching it hurts the player (or the Kind you choose) and knocks it back.',
  icon: 'builtin:img/spikes',
  fields: [
    { key: 'damage', kind: 'slider', label: 'Damage', help: 'How much health one touch takes away.', min: 0, max: 100, step: 1 },
    { key: 'knockback', kind: 'slider', label: 'Knockback', help: 'How hard it pushes the one it hurts away.', min: 0, max: 1000, step: 10 },
    { key: 'target', kind: 'kind', label: 'Hurts', help: 'Who it hurts.', emptyLabel: 'The player' },
  ],
  onContact(inst, other, s, _state, ctx) {
    if (inst.firedBy === other.id) return;
    if (!targetKinds(s.target, ctx).includes(other.kindId) || other.dead) return;
    if (!hurt(other, s.damage, ctx)) return;
    if (s.knockback > 0 && !other.dead) {
      const a = center(inst);
      const b = center(other);
      other.vx = (b.x >= a.x ? 1 : -1) * s.knockback;
      other.vy = -s.knockback * 0.6;
      other.grounded = false;
      other.stun = 0.25;
    }
    if (inst.projectile) ctx.world.destroy(inst);
  },
});
