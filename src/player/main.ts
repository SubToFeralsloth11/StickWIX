import { attachFpsOverlay, fpsRequested } from '../runtime/render/fps-overlay';
import { PixiRenderer } from '../runtime/render/pixi-renderer';
import { bootPlayer } from './player';

/** Entry of the exported-game player (player.html → public/player-template.html). */
void bootPlayer(document, {
  createRenderer: (parent, o) => PixiRenderer.create(parent, o),
  // `<game>.html?fps` shows the frame-rate overlay (SC-004).
  onStart: (stage) => {
    if (fpsRequested()) attachFpsOverlay(stage);
  },
});
