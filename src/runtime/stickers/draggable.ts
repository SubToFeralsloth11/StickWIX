import { defineSticker } from './define';

export default defineSticker({
  type: 'draggable',
  category: 'input',
  label: 'Draggable',
  help: 'The player can pick it up and move it with the mouse.',
  icon: 'builtin:img/crate',
  fields: [{ key: 'snapToGrid', kind: 'toggle', label: 'Snap to grid', help: 'Lines up with the tile grid when dropped.' }],
  events: [{ id: 'dropped', phrase: 'is dropped' }],
  step(inst, s, state, ctx) {
    const m = ctx.world.mouseWorld();
    const mouse = ctx.input.mouse;
    if (!inst.dragged && mouse.pressed && ctx.world.topmostAt(m.x, m.y) === inst) {
      inst.dragged = true;
      state.ox = m.x - inst.x;
      state.oy = m.y - inst.y;
    }
    if (!inst.dragged) return;
    inst.x = m.x - (state.ox as number);
    inst.y = m.y - (state.oy as number);
    inst.vx = 0;
    inst.vy = 0;
    if (!mouse.down) {
      inst.dragged = false;
      if (s.snapToGrid) {
        const c = ctx.world.cellSize();
        inst.x = Math.round(inst.x / c) * c;
        inst.y = Math.round(inst.y / c) * c;
      }
      ctx.emit({ type: 'sticker', id: inst.id, event: 'dropped' });
    }
  },
});
