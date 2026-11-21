import { center, defineSticker } from './define';

export default defineSticker({
  type: 'pointAt',
  category: 'visual',
  label: 'Point At',
  help: 'Always turns to point at the mouse or at the nearest object of a Kind. Great for guns and turrets.',
  icon: 'builtin:img/fireball',
  fields: [
    { key: 'target', kind: 'kind', label: 'Points at', help: 'The nearest of this Kind, or the mouse.', emptyLabel: 'The mouse' },
    { key: 'offset', kind: 'slider', label: 'Picture angle', help: 'Turn this if the picture faces up or down instead of right.', min: -180, max: 180, step: 5, unit: '°' },
  ],
  step(inst, s, _state, ctx) {
    const c = center(inst);
    let p: { x: number; y: number } | null = ctx.world.mouseWorld();
    if (s.target) {
      let best = Infinity;
      p = null;
      for (const o of ctx.world.byKind(s.target)) {
        if (o === inst) continue;
        const q = center(o);
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d < best) {
          best = d;
          p = q;
        }
      }
    }
    if (!p || (p.x === c.x && p.y === c.y)) return;
    const a = Math.atan2(p.y - c.y, p.x - c.x);
    inst.rotation = ((((a * 180) / Math.PI + s.offset) % 360) + 360) % 360;
    inst.dir = { x: Math.cos(a), y: Math.sin(a) };
  },
});
