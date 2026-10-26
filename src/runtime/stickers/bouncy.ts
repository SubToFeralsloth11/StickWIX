import { defineSticker } from './define';

export default defineSticker({
  type: 'bouncy',
  category: 'physics',
  label: 'Bouncy',
  help: 'Bounces off walls and floors instead of stopping.',
  icon: 'builtin:img/spring',
  fields: [
    { key: 'bounce', kind: 'slider', label: 'Bounciness', help: '0 stops dead, 1 bounces back as high, more gains speed.', min: 0, max: 1.2, step: 0.05 },
  ],
  init(inst, s) {
    inst.body = true;
    inst.bounce = s.bounce;
  },
});
