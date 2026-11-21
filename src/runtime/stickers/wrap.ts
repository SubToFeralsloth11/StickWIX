import { defineSticker } from './define';

export default defineSticker({
  type: 'wrap',
  category: 'physics',
  label: 'Wrap Around',
  help: 'Going off one edge of the scene brings it back on the other side, like Asteroids or Pac-Man.',
  icon: 'builtin:img/star',
  fields: [
    {
      key: 'axis', kind: 'choice', label: 'Edges', help: 'Which edges wrap.',
      options: [{ value: 'both', label: 'All edges' }, { value: 'x', label: 'Left and right' }, { value: 'y', label: 'Top and bottom' }],
    },
  ],
  step(inst, s, _state, ctx) {
    const sc = ctx.world.sceneSize();
    if (s.axis !== 'y') {
      if (inst.x + inst.w < 0) inst.x += sc.w + inst.w;
      else if (inst.x > sc.w) inst.x -= sc.w + inst.w;
    }
    if (s.axis !== 'x') {
      if (inst.y + inst.h < 0) inst.y += sc.h + inst.h;
      else if (inst.y > sc.h) inst.y -= sc.h + inst.h;
    }
  },
});
