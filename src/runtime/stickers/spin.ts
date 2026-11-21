import { defineSticker } from './define';

export default defineSticker({
  type: 'spin',
  category: 'visual',
  label: 'Spin',
  help: 'Keeps turning round and round.',
  icon: 'builtin:img/gem',
  fields: [{ key: 'speed', kind: 'slider', label: 'Speed', help: 'Degrees per second (minus turns the other way).', min: -1440, max: 1440, step: 10 }],
  step(inst, s, _state, ctx) {
    inst.rotation = (((inst.rotation + s.speed * ctx.dt) % 360) + 360) % 360;
  },
});
