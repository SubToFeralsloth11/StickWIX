import { defineSticker } from './define';

export default defineSticker({
  type: 'solid',
  category: 'physics',
  label: 'Solid',
  help: 'Things cannot walk or fall through it, like a wall or a floor.',
  icon: 'builtin:img/crate',
  fields: [
    { key: 'oneWay', kind: 'toggle', label: 'Jump up through it', help: 'Lets things pass from below and stand on top, like a cloud platform.' },
  ],
  init(inst, s) {
    inst.solid = s.oneWay ? 'oneWay' : 'solid';
  },
});
