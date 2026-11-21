import type { StickerType } from '../../model/sticker-settings';
import type { StickerModule } from '../types';
import platformer from './platformer';
import topdown from './topdown';
import solid from './solid';
import falls from './falls';
import bouncy from './bouncy';
import collectible from './collectible';
import hurts from './hurts';
import health from './health';
import patrol from './patrol';
import chase from './chase';
import shooter from './shooter';
import clickable from './clickable';
import draggable from './draggable';
import cameraFollow from './camera-follow';
import animate from './animate';
import breakable from './breakable';
import followMouse from './follow-mouse';
import wander from './wander';
import spin from './spin';
import lifetime from './lifetime';
import pointAt from './point-at';
import wrap from './wrap';
import stayInScene from './stay-in-scene';
import float from './float';
import spawner from './spawner';
import animator from './animator';

/** Every sticker, in the order the editor lists them (FR-011). */
export const STICKERS: Record<StickerType, StickerModule> = {
  platformer,
  topdown,
  solid,
  falls,
  bouncy,
  collectible,
  hurts,
  health,
  patrol,
  chase,
  shooter,
  clickable,
  draggable,
  cameraFollow,
  animate,
  breakable,
  followMouse,
  wander,
  spin,
  lifetime,
  pointAt,
  wrap,
  stayInScene,
  float,
  spawner,
  animator,
};

/**
 * Per-step run order: solids first (so bodies see them), controllers and
 * movers, then reactions. Within a category, the object's own sticker order.
 */
export const STEP_ORDER: Record<StickerModule['category'], number> = {
  physics: 0,
  controller: 1,
  gameplay: 2,
  input: 3,
  visual: 4,
};
