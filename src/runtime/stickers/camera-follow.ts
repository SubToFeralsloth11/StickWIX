import { defineSticker } from './define';

/** Marks the object the camera follows; the camera itself lives in runtime/camera.ts. */
export default defineSticker({
  type: 'cameraFollow',
  category: 'visual',
  label: 'Camera Follow',
  help: 'The screen scrolls to keep this object in view.',
  icon: 'builtin:img/star',
  fields: [
    { key: 'smoothing', kind: 'slider', label: 'Smoothness', help: '0 snaps instantly; higher glides more gently.', min: 0, max: 1, step: 0.05 },
    { key: 'deadzone', kind: 'slider', label: 'Free zone', help: 'It can move this far from the centre before the screen scrolls.', min: 0, max: 400, step: 4, unit: 'px' },
    { key: 'clampToScene', kind: 'toggle', label: 'Stay inside the scene', help: 'Never scrolls past the edges of the scene.' },
  ],
});
