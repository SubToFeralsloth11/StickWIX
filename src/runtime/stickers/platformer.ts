import { anyHeld, defineSticker, keysFor } from './define';

const MAX_FALL = 1200;

export default defineSticker({
  type: 'platformer',
  category: 'controller',
  label: 'Platformer Controller',
  help: 'Runs left and right with the arrow keys or A/D and jumps with Space, W or Up.',
  icon: 'builtin:img/hero',
  fields: [
    { key: 'speed', kind: 'slider', label: 'Run speed', help: 'How fast it runs, in pixels per second.', min: 20, max: 800, step: 10 },
    { key: 'jumpHeight', kind: 'slider', label: 'Jump height', help: 'How high a full jump goes, in pixels.', min: 0, max: 400, step: 4, unit: 'px' },
    { key: 'gravity', kind: 'slider', label: 'Gravity', help: 'How strongly it falls back down.', min: 100, max: 5000, step: 50 },
    { key: 'airControl', kind: 'slider', label: 'Air control', help: 'How much you can steer while in the air (0 none, 1 full).', min: 0, max: 1, step: 0.05 },
    { key: 'coyoteMs', kind: 'slider', label: 'Late jump time', help: 'You can still jump this long after running off a ledge.', min: 0, max: 500, step: 10, unit: 'ms' },
    { key: 'jumpBufferMs', kind: 'slider', label: 'Early jump time', help: 'A jump pressed this long before landing still counts.', min: 0, max: 500, step: 10, unit: 'ms' },
    {
      key: 'keys', kind: 'choice', label: 'Keys', help: 'Which keys move it.',
      options: [{ value: 'both', label: 'Arrows and WASD' }, { value: 'arrows', label: 'Arrows only' }, { value: 'wasd', label: 'WASD only' }],
    },
    { key: 'idleLook', kind: 'look', label: 'Standing look', help: 'Look while standing still (empty keeps its normal look).' },
    { key: 'walkLook', kind: 'look', label: 'Running look', help: 'Look while running.' },
    { key: 'jumpLook', kind: 'look', label: 'Jumping look', help: 'Look while in the air.' },
  ],
  events: [
    { id: 'jumps', phrase: 'jumps' },
    { id: 'lands', phrase: 'lands' },
  ],
  init(inst, _s, state) {
    inst.body = true;
    state.coyote = 0;
    state.buffer = 0;
    state.rising = false;
    state.air = 0;
    state.baseLook = inst.lookId;
  },
  step(inst, s, state, ctx) {
    if (inst.dragged) return;
    const { held, pressed, released } = ctx.input;
    const left = keysFor('left', s.keys);
    const right = keysFor('right', s.keys);
    const jumpKeys = ['Space', ...keysFor('up', s.keys)];

    if (inst.grounded) {
      if ((state.air as number) >= 2) ctx.emit({ type: 'sticker', id: inst.id, event: 'lands' });
      state.air = 0;
      state.coyote = s.coyoteMs / 1000;
    } else {
      state.air = (state.air as number) + 1;
      state.coyote = (state.coyote as number) - ctx.dt;
    }

    if (inst.stun > 0) {
      inst.stun -= ctx.dt;
    } else {
      const dir = (anyHeld(held, right) ? 1 : 0) - (anyHeld(held, left) ? 1 : 0);
      const target = dir * s.speed;
      inst.vx = inst.grounded ? target : inst.vx + (target - inst.vx) * Math.min(1, s.airControl * ctx.dt * 20);
      if (dir !== 0) inst.facing = dir;
      inst.dir = { x: inst.facing, y: 0 };

      if (jumpKeys.some((k) => pressed.has(k))) state.buffer = s.jumpBufferMs / 1000;
      else state.buffer = (state.buffer as number) - ctx.dt;
      if ((state.buffer as number) > 0 && (state.coyote as number) > 0 && s.jumpHeight > 0) {
        // Gravity is applied before each move, which loses about v0·dt/2 of height
        // versus v0²/2g; solving h = v0²/2g - v0·dt/2 makes the apex match jumpHeight.
        const a = (s.gravity * ctx.dt) / 2;
        inst.vy = -(a + Math.sqrt(a * a + 2 * s.gravity * s.jumpHeight));
        inst.grounded = false;
        state.buffer = 0;
        state.coyote = 0;
        state.rising = true;
        ctx.emit({ type: 'sticker', id: inst.id, event: 'jumps' });
      }
      // Variable jump height: letting go early cuts the rise.
      if (state.rising && inst.vy < 0 && jumpKeys.some((k) => released.has(k))) inst.vy *= 0.5;
    }
    if (inst.vy >= 0) state.rising = false;
    inst.vy = Math.min(MAX_FALL, inst.vy + s.gravity * ctx.dt);

    const look = !inst.grounded ? s.jumpLook : Math.abs(inst.vx) > 1 ? s.walkLook : s.idleLook;
    const next = look ?? (state.baseLook as string | null);
    if (inst.lookId !== next) {
      inst.lookId = next;
      inst.anim = null;
    }
  },
});
