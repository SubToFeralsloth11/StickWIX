import { defineSticker } from './define';

export default defineSticker({
  type: 'animator',
  category: 'visual',
  label: 'Animator',
  help: "Plays this Kind's animations by itself while standing, moving, jumping and falling.",
  icon: 'builtin:img/hero',
  fields: [
    { key: 'idle', kind: 'anim', label: 'Standing', help: 'Animation while it stands still.' },
    { key: 'walk', kind: 'anim', label: 'Moving', help: 'Animation while it moves.' },
    { key: 'jump', kind: 'anim', label: 'Going up', help: 'Animation while rising in the air.' },
    { key: 'fall', kind: 'anim', label: 'Falling', help: 'Animation while falling.' },
  ],
  step(inst, s, state, ctx) {
    const airborne = !inst.grounded && inst.body && Math.abs(inst.vy) > 20;
    const moving = Math.abs(inst.vx) > 2 || (!inst.body && Math.abs(inst.vy) > 2);
    const want = airborne ? (inst.vy < 0 ? s.jump || s.fall : s.fall || s.jump) : moving ? s.walk : s.idle;
    // Rules may play other animations; only take over when the wanted state changes.
    if (!want || want === state.last) return;
    if (ctx.world.playAnim(inst, want)) state.last = want;
  },
});
