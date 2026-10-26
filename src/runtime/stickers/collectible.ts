import { defineSticker, targetKinds } from './define';

export default defineSticker({
  type: 'collectible',
  category: 'gameplay',
  label: 'Collectible',
  help: 'Gets picked up when the player touches it. Add a rule to count it.',
  icon: 'builtin:img/coin',
  fields: [
    { key: 'collectedBy', kind: 'kind', label: 'Collected by', help: 'Who can pick it up.', emptyLabel: 'The player' },
    { key: 'sound', kind: 'sound', label: 'Sound', help: 'Plays when it is picked up.' },
    { key: 'disappear', kind: 'toggle', label: 'Disappear', help: 'Vanishes when picked up.' },
  ],
  events: [{ id: 'collected', phrase: 'is collected' }],
  onContact(inst, other, s, state, ctx) {
    if (state.collected || !targetKinds(s.collectedBy, ctx).includes(other.kindId)) return;
    state.collected = true;
    ctx.world.playSound(s.sound);
    ctx.emit({ type: 'sticker', id: inst.id, event: 'collected' });
    if (s.disappear) ctx.world.destroy(inst);
    // Without disappearing it can be collected again once the touch ends.
    else state.collected = false;
  },
});
