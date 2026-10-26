import type { Instance, StepCtx } from '../types';
import { defineSticker } from './define';

/**
 * Applies damage to an instance. With a Health sticker it loses health and
 * briefly becomes invincible; without one it is destroyed outright.
 * Returns false when the hit was ignored (invincible).
 */
export function hurt(inst: Instance, damage: number, ctx: StepCtx): boolean {
  if (inst.dead || inst.invincible > 0) return false;
  const health = inst.stickers.find((s) => s.type === 'health');
  if (!health) {
    ctx.emit({ type: 'sticker', id: inst.id, event: 'hurt' });
    ctx.world.destroy(inst);
    return true;
  }
  const hp = (health.state.hp as number) - damage;
  health.state.hp = hp;
  ctx.emit({ type: 'sticker', id: inst.id, event: 'hurt' });
  if (hp <= 0) {
    ctx.emit({ type: 'sticker', id: inst.id, event: 'outOfHealth' });
    ctx.world.destroy(inst);
  } else inst.invincible = (health.settings.invincibleMs as number) / 1000;
  return true;
}

export default defineSticker({
  type: 'health',
  category: 'gameplay',
  label: 'Health',
  help: 'Takes several hits before it is defeated, with a short safe time after each hit.',
  icon: 'builtin:img/heart',
  fields: [
    { key: 'max', kind: 'slider', label: 'Health', help: 'How many hits of 1 damage it can take.', min: 1, max: 100, step: 1 },
    { key: 'invincibleMs', kind: 'slider', label: 'Safe time after a hit', help: 'It cannot be hurt again for this long.', min: 0, max: 5000, step: 100, unit: 'ms' },
    { key: 'flash', kind: 'toggle', label: 'Flash when hurt', help: 'Blinks during the safe time.' },
  ],
  events: [
    { id: 'hurt', phrase: 'is hurt' },
    { id: 'outOfHealth', phrase: 'runs out of health' },
  ],
  init(_inst, s, state) {
    state.hp = s.max;
  },
  step(inst, s, _state, ctx) {
    if (inst.invincible > 0) {
      inst.invincible = Math.max(0, inst.invincible - ctx.dt);
      inst.alpha = s.flash && inst.invincible > 0 && Math.floor(inst.invincible * 12) % 2 === 0 ? 0.3 : 1;
    }
  },
});
