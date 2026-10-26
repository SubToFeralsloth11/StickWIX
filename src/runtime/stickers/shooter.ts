import { center, defineSticker } from './define';

export default defineSticker({
  type: 'shooter',
  category: 'gameplay',
  label: 'Shooter',
  help: 'Fires a projectile when you press a key or click.',
  icon: 'builtin:img/fireball',
  fields: [
    {
      key: 'fireWith', kind: 'choice', label: 'Fire with', help: 'A key on the keyboard or a mouse click.',
      options: [{ value: 'key', label: 'A key' }, { value: 'click', label: 'Mouse click' }],
    },
    { key: 'key', kind: 'key', label: 'Fire key', help: 'The key that fires.' },
    { key: 'projectile', kind: 'kind', label: 'Projectile', help: 'What it fires; give that Kind a Hurts sticker so it does damage.', emptyLabel: 'Choose a Kind' },
    { key: 'speed', kind: 'slider', label: 'Projectile speed', help: 'How fast projectiles fly.', min: 20, max: 2000, step: 10 },
    { key: 'cooldownMs', kind: 'slider', label: 'Time between shots', help: 'Shortest time between two shots.', min: 0, max: 5000, step: 50, unit: 'ms' },
    {
      key: 'aim', kind: 'choice', label: 'Aim', help: 'Fire the way it faces, or toward the mouse.',
      options: [{ value: 'facing', label: 'Where it faces' }, { value: 'mouse', label: 'At the mouse' }],
    },
  ],
  events: [{ id: 'shoots', phrase: 'shoots' }],
  init(_inst, _s, state) {
    state.cool = 0;
  },
  step(inst, s, state, ctx) {
    state.cool = Math.max(0, (state.cool as number) - ctx.dt);
    const fire = s.fireWith === 'key' ? ctx.input.pressed.has(s.key) : ctx.input.mouse.pressed;
    if (!fire || (state.cool as number) > 0 || !s.projectile || inst.dead) return;
    const from = center(inst);
    let dir = inst.dir.x || inst.dir.y ? inst.dir : { x: inst.facing, y: 0 };
    if (s.aim === 'mouse') {
      const m = ctx.world.mouseWorld();
      const d = Math.hypot(m.x - from.x, m.y - from.y) || 1;
      dir = { x: (m.x - from.x) / d, y: (m.y - from.y) / d };
    }
    const p = ctx.world.spawn(s.projectile, from.x, from.y);
    if (!p) return;
    p.x -= p.hit.x + p.hit.w / 2;
    p.y -= p.hit.y + p.hit.h / 2;
    p.vx = dir.x * s.speed;
    p.vy = dir.y * s.speed;
    p.facing = dir.x < 0 ? -1 : 1;
    p.dir = dir;
    p.projectile = true;
    p.body = true;
    state.cool = s.cooldownMs / 1000;
    ctx.emit({ type: 'sticker', id: inst.id, event: 'shoots' });
  },
});
