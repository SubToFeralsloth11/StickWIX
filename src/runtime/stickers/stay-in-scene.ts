import { defineSticker } from './define';

export default defineSticker({
  type: 'stayInScene',
  category: 'physics',
  label: 'Stay In Scene',
  help: 'Can never leave the edges of the scene.',
  icon: 'builtin:img/crate',
  fields: [],
  step(inst, _s, _state, ctx) {
    const sc = ctx.world.sceneSize();
    const x = Math.min(Math.max(inst.x, -inst.hit.x), sc.w - inst.hit.x - inst.hit.w);
    const y = Math.min(Math.max(inst.y, -inst.hit.y), sc.h - inst.hit.y - inst.hit.h);
    if (x !== inst.x) inst.vx = 0;
    if (y !== inst.y) inst.vy = 0;
    inst.x = x;
    inst.y = y;
  },
});
