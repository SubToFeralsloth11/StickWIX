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
    { key: 'auto', kind: 'toggle', label: 'Hold to keep firing', help: 'Keeps shooting while the key or mouse button is held.' },
    { key: 'count', kind: 'slider', label: 'Shots at once', help: 'Fires several projectiles in a fan, like a shotgun.', min: 1, max: 12, step: 1 },
    { key: 'spread', kind: 'slider', label: 'Fan width', help: 'Angle between shots fired at once.', min: 0, max: 180, step: 1, unit: '°' },
  ],
  events: [{ id: 'shoots', phrase: 'shoots' }],
  init(_inst, _s, state) {
    state.cool = 0;
  },
  step(inst, s, state, ctx) {
    state.cool = Math.max(0, (state.cool as number) - ctx.dt);
    const fire = s.auto
      ? s.fireWith === 'key' ? ctx.input.held.has(s.key) : ctx.input.mouse.down
      : s.fireWith === 'key' ? ctx.input.pressed.has(s.key) : ctx.input.mouse.pressed;
    if (!fire || (state.cool as number) > 0 || !s.projectile || inst.dead) return;
    const from = center(inst);
    let dir = inst.dir.x || inst.dir.y ? inst.dir : { x: inst.facing, y: 0 };
    if (s.aim === 'mouse') {
      const m = ctx.world.mouseWorld();
      const d = Math.hypot(m.x - from.x, m.y - from.y) || 1;
      dir = { x: (m.x - from.x) / d, y: (m.y - from.y) / d };
    }
    const base = Math.atan2(dir.y, dir.x);
    for (let k = 0; k < s.count; k++) {
      const a = base + (((k - (s.count - 1) / 2) * s.spread) * Math.PI) / 180;
      const d = { x: Math.cos(a), y: Math.sin(a) };
      const p = ctx.world.spawn(s.projectile, from.x, from.y, (q) => {
        q.x -= q.hit.x + q.hit.w / 2;
        q.y -= q.hit.y + q.hit.h / 2;
        q.vx = d.x * s.speed;
        q.vy = d.y * s.speed;
        q.facing = d.x < 0 ? -1 : 1;
        q.dir = d;
        q.projectile = true;
        q.firedBy = inst.id;
        q.body = true;
      });
      if (!p) return;
    }
    state.cool = s.cooldownMs / 1000;
    ctx.emit({ type: 'sticker', id: inst.id, event: 'shoots' });
  },
});
