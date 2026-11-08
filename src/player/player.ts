import { WebAudio, type AudioAdapter } from '../runtime/audio';
import { createGame, type Game } from '../runtime/game';
import { attachDomInput } from '../runtime/input';
import type { AssetInfo, Renderer } from '../runtime/render/renderer';
import { localStorageRemember } from '../runtime/values';
import { parsePayload, payloadAssetInfo, PAYLOAD_ELEMENT_ID, type GamePayload } from './payload';

export const DAMAGED_MESSAGE = 'This game file is damaged.';
export const NO_GRAPHICS_MESSAGE = "This browser couldn't start the game's graphics.";

export interface PlayerRendererOptions {
  screen: { w: number; h: number };
  pixelArt: boolean;
  textureUrl: (assetId: string) => string | undefined;
  assetInfo: AssetInfo;
}

/** A renderer that draws into its own canvas. */
export type CanvasRenderer = Renderer & { readonly canvas: HTMLCanvasElement };

export interface PlayerDeps {
  /** Creates the renderer and appends its canvas to `parent` (PixiRenderer in the real player). */
  createRenderer: (parent: HTMLElement, o: PlayerRendererOptions) => Promise<CanvasRenderer>;
  createAudio?: (urlFor: (assetId: string) => string | undefined) => AudioAdapter & { unlock(): void };
  /** "Remember between plays" storage; defaults to window.localStorage. */
  storage?: Storage;
  /** Called once the game loop starts, with the element that holds the canvas (position: relative). */
  onStart?: (stage: HTMLElement, game: Game) => void;
}

/** Replaces the page with a centred message (damaged payload, no WebGL...). */
export function showMessage(doc: Document, text: string): void {
  doc.body.replaceChildren();
  const p = doc.createElement('p');
  p.className = 'player-message';
  p.setAttribute('role', 'alert');
  p.textContent = text;
  doc.body.appendChild(p);
}

/** Reads the payload embedded in the page; undefined when it is missing, damaged or invalid. */
export function readPayload(doc: Document): GamePayload | undefined {
  try {
    return parsePayload(doc.getElementById(PAYLOAD_ELEMENT_ID)?.textContent ?? '');
  } catch {
    return undefined;
  }
}

/** Largest size that fits the window while keeping the game's aspect ratio. */
export function letterbox(win: { w: number; h: number }, screen: { w: number; h: number }): { w: number; h: number } {
  const scale = Math.max(0, Math.min(win.w / screen.w, win.h / screen.h));
  return { w: Math.floor(screen.w * scale), h: Math.floor(screen.h * scale) };
}

/**
 * Share action in an exported game: the system share sheet (phones), else the
 * clipboard with a "Copied!" note. False when neither exists, so the game
 * shows the message instead. A cancelled share sheet is not an error.
 */
export function shareText(win: Window, text: string, note: (msg: string) => void): boolean {
  const nav = win.navigator;
  if (typeof nav.share === 'function') {
    nav.share({ text }).catch(() => undefined);
    return true;
  }
  if (nav.clipboard?.writeText) {
    nav.clipboard.writeText(text).then(
      () => note('Copied! Paste it anywhere.'),
      () => note('Sharing is blocked here'),
    );
    return true;
  }
  return false;
}

/**
 * Boots an exported game: validates the payload, draws the start scene behind
 * a "Click to play" overlay, and starts the loop (and audio, which browsers
 * only allow after a gesture) on the first click or key press.
 */
export async function bootPlayer(doc: Document, deps: PlayerDeps): Promise<Game | null> {
  const payload = readPayload(doc);
  if (!payload) {
    showMessage(doc, DAMAGED_MESSAGE);
    return null;
  }
  const { project, assets } = payload;
  const win = doc.defaultView!;
  const screen = { w: project.settings.screenWidth, h: project.settings.screenHeight };
  const assetInfo = payloadAssetInfo(payload);
  const urlFor = (id: string) => assets[id];
  doc.title = project.name;

  const stage = doc.createElement('div');
  stage.className = 'player-stage';
  if (project.settings.pixelArt) stage.classList.add('pixel-art');
  doc.body.appendChild(stage);

  let renderer: CanvasRenderer;
  try {
    renderer = await deps.createRenderer(stage, { screen, pixelArt: project.settings.pixelArt, textureUrl: urlFor, assetInfo });
  } catch {
    showMessage(doc, NO_GRAPHICS_MESSAGE);
    return null;
  }

  const audio = deps.createAudio?.(urlFor) ?? new WebAudio(urlFor);
  const game = createGame(project, {
    renderer,
    audio,
    remember: localStorageRemember(project.id, deps.storage ?? win.localStorage),
    assetInfo,
    share: (text) => shareText(win, text, (note) => game.scene.showText(note, 2)),
  });

  const fit = () => {
    const size = letterbox({ w: win.innerWidth, h: win.innerHeight }, screen);
    stage.style.width = `${size.w}px`;
    stage.style.height = `${size.h}px`;
  };
  fit();
  win.addEventListener('resize', fit);

  const canvas = renderer.canvas;
  canvas.tabIndex = 0;
  attachDomInput(game.input, canvas, (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / (r.width || 1)) * screen.w, y: ((cy - r.top) / (r.height || 1)) * screen.h };
  });
  game.render();

  const overlay = doc.createElement('button');
  overlay.type = 'button';
  overlay.className = 'player-overlay';
  overlay.textContent = win.matchMedia?.('(pointer: coarse)').matches ? 'Tap to play' : 'Click to play';
  stage.appendChild(overlay);
  const play = (e: Event) => {
    if (e.type === 'keydown') e.preventDefault();
    overlay.remove();
    win.removeEventListener('keydown', play);
    audio.unlock();
    canvas.focus();
    game.start();
    deps.onStart?.(stage, game);
  };
  overlay.addEventListener('click', play, { once: true });
  win.addEventListener('keydown', play, { once: true });
  overlay.focus();
  return game;
}
