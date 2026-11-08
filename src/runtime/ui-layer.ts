import type { Anchor, UIElement } from '../model/schema';

const ANCHOR: Record<Anchor, [number, number]> = {
  tl: [0, 0], t: [0.5, 0], tr: [1, 0],
  l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5],
  bl: [0, 1], b: [0.5, 1], br: [1, 1],
};

/** Rough text width for layout without a DOM; renderers draw centred in the box. */
export function estimateTextWidth(text: string, size: number) {
  return text.length * size * 0.58;
}

export interface UIBox {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/**
 * Screen-space box of a UI element. (x, y) is an offset from the anchor point
 * of the screen, and the element's own matching corner sits there, so
 * "top-right, -16, 16" stays 16 px from the right edge at any size (FR-010).
 */
export function layoutUI(
  el: UIElement,
  text: string,
  screen: { w: number; h: number },
  imageSize: (assetId: string) => { w: number; h: number } | undefined,
  lookId: string | null | undefined = el.lookId,
): UIBox {
  const [ax, ay] = ANCHOR[el.anchor];
  let w: number;
  let h: number;
  const img = lookId ? imageSize(lookId) : undefined;
  if (el.type === 'image' && img) ({ w, h } = img);
  else if (el.type === 'button') {
    w = Math.max(img?.w ?? 0, estimateTextWidth(text, el.style.size) + 32);
    h = Math.max(img?.h ?? 0, el.style.size + 20);
  } else {
    w = estimateTextWidth(text, el.style.size);
    h = el.style.size * 1.25;
  }
  return { x: screen.w * ax + el.x - w * ax, y: screen.h * ay + el.y - h * ay, w, h, text };
}

/** Runtime state of a scene's screen layer: visibility and looks changed by rules. */
export class UILayer {
  readonly state = new Map<string, { hidden: boolean; lookId: string | null | undefined }>();

  constructor(readonly elements: UIElement[]) {
    for (const el of elements) this.state.set(el.id, { hidden: el.hidden, lookId: el.lookId });
  }

  setHidden(id: string, hidden: boolean) {
    const s = this.state.get(id);
    if (s) s.hidden = hidden;
  }

  setLook(id: string, lookId: string) {
    const s = this.state.get(id);
    if (s) s.lookId = lookId;
  }

  /** Visible elements with their boxes, in draw order. */
  boxes(screen: { w: number; h: number }, format: (t: string) => string, imageSize: (id: string) => { w: number; h: number } | undefined) {
    const out: { el: UIElement; box: UIBox; lookId: string | null | undefined }[] = [];
    for (const el of this.elements) {
      const s = this.state.get(el.id)!;
      if (s.hidden) continue;
      out.push({ el, box: layoutUI(el, format(el.text), screen, imageSize, s.lookId), lookId: s.lookId });
    }
    return out;
  }

  /** Topmost visible button under a screen point. */
  buttonAt(x: number, y: number, screen: { w: number; h: number }, format: (t: string) => string, imageSize: (id: string) => { w: number; h: number } | undefined) {
    const list = this.boxes(screen, format, imageSize);
    for (let i = list.length - 1; i >= 0; i--) {
      const { el, box } = list[i]!;
      if (el.type === 'button' && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h) return el;
    }
    return undefined;
  }
}
