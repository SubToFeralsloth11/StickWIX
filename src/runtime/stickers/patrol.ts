import { defineSticker } from './define';

export default defineSticker({
  type: 'patrol',
  category: 'gameplay',
  label: 'Patrol',
  help: 'Walks back and forth by itself, turning at walls and ledges.',
  icon: 'builtin:img/slime',
  fields: [
    { key: 'distance', kind: 'slider', label: 'Distance', help: 'How far it walks before turning back (0 = until something blocks it).', min: 0, max: 2000, step: 8, unit: 'px' },
    { key: 'speed', kind: 'slider', label: 'Speed', help: 'How fast it walks.', min: 5, max: 600, step: 5 },
    {
      key: 'axis', kind: 'choice', label: 'Direction', help: 'Side to side or up and down.',
      options: [{ value: 'x', label: 'Side to side' }, { value: 'y', label: 'Up and down' }],
    },
    { key: 'turnAtEdges', kind: 'toggle', label: 'Turn at ledges', help: 'Turns around instead of walking off a ledge.' },
  ],
  init(inst, s, state) {
    if (inst.solid === 'none') inst.body = true;
    state.origin = s.axis === 'x' ? inst.x : inst.y;
    state.dir = 1;
  },
  step(inst, s, state, ctx) {
    if (inst.dragged) return;
    if (inst.stun > 0) {
      inst.stun -= ctx.dt;
      return;
    }
    let dir = state.dir as number;
    const pos = s.axis === 'x' ? inst.x : inst.y;
    const origin = state.origin as number;
    const hitWall = s.axis === 'x' ? (dir > 0 ? inst.blocked.right : inst.blocked.left) : dir > 0 ? inst.blocked.down : inst.blocked.up;
    if (hitWall) dir = -dir;
    else if (s.distance > 0 && dir > 0 && pos >= origin + s.distance) dir = -1;
    else if (s.distance > 0 && dir < 0 && pos <= origin) dir = 1;
    else if (s.turnAtEdges && s.axis === 'x' && inst.grounded) {
      const footX = dir > 0 ? inst.x + inst.hit.x + inst.hit.w + 1 : inst.x + inst.hit.x - 1;
      const footY = inst.y + inst.hit.y + inst.hit.h + 2;
      if (!ctx.world.solidAt(footX, footY, inst)) dir = -dir;
    }
    state.dir = dir;
    if (s.axis === 'x') {
      inst.vx = dir * s.speed;
      inst.facing = dir;
    } else inst.vy = dir * s.speed;
  },
});
