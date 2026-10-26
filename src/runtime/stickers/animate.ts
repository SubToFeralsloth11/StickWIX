import { defineSticker } from './define';

export default defineSticker({
  type: 'animate',
  category: 'visual',
  label: 'Animate',
  help: 'Plays the frames of a look over and over, like a flip book.',
  icon: 'builtin:img/coin',
  fields: [
    { key: 'lookId', kind: 'look', label: 'Animation', help: 'The look to play (empty plays its normal look).' },
    { key: 'fps', kind: 'slider', label: 'Speed', help: 'Frames per second.', min: 1, max: 60, step: 1 },
    { key: 'loop', kind: 'toggle', label: 'Loop', help: 'Starts again from the first frame when it reaches the end.' },
  ],
  init(inst, s) {
    if (s.lookId) inst.lookId = s.lookId;
    inst.anim = { assetId: inst.lookId, fps: s.fps, loop: s.loop, t: 0, frame: 0 };
  },
});
