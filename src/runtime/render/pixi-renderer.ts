import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite, type TextStyleFontWeight } from 'pixi.js';
import type { UIElement } from '../../model/schema';
import type { Instance } from '../types';
import type { AssetInfo, GameView, Renderer } from './renderer';

export interface PixiRendererOptions {
  screen: { w: number; h: number };
  pixelArt: boolean;
  /** URL for an asset id (builtin path, blob: or data: URL); undefined = missing. */
  textureUrl: (assetId: string) => string | undefined;
  assetInfo: AssetInfo;
  /** Called when an image finishes loading (views that only redraw on change use it). */
  onTextureLoad?: () => void;
}

const FONTS: Record<UIElement['style']['font'], { family: string; weight: TextStyleFontWeight }> = {
  pixel: { family: '"Courier New", ui-monospace, monospace', weight: '700' },
  round: { family: 'ui-rounded, "Trebuchet MS", system-ui, sans-serif', weight: '700' },
  bold: { family: 'Impact, "Arial Black", system-ui, sans-serif', weight: '400' },
};

/** Loads images once and slices frames; missing or broken images get a placeholder (FR asset deletion edge case). */
class TextureCache {
  /** `missing` remembers which URL failed (undefined = none was known yet), so a URL that turns up later is retried. */
  private base = new Map<string, Texture | 'loading' | { missing: string | undefined }>();
  private frames = new Map<string, Texture>();
  readonly placeholder: Texture;

  constructor(private readonly o: PixiRendererOptions, app: Application) {
    const g = new Graphics();
    g.rect(0, 0, 16, 16).fill(0xff4fa3).rect(0, 0, 8, 8).fill(0x2a2639).rect(8, 8, 8, 8).fill(0x2a2639);
    this.placeholder = app.renderer.generateTexture({ target: g, resolution: 1 });
    this.placeholder.source.scaleMode = 'nearest';
  }

  private load(id: string, url: string | undefined) {
    if (!url) {
      this.base.set(id, { missing: undefined });
      return;
    }
    this.base.set(id, 'loading');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img
      .decode()
      .then(() => {
        const t = Texture.from(img);
        t.source.scaleMode = this.o.pixelArt ? 'nearest' : 'linear';
        this.base.set(id, t);
        this.o.onTextureLoad?.();
      })
      .catch(() => {
        this.base.set(id, { missing: url });
        this.o.onTextureLoad?.();
      });
  }

  /** Whole image, the placeholder if it can't be had, or null while loading. */
  image(id: string): Texture | null {
    const b = this.base.get(id);
    if (b instanceof Texture) return b;
    if (b === 'loading') return null;
    const url = this.o.textureUrl(id);
    // Not tried yet, or the asset list (re)loaded since and now knows a different URL.
    if (b === undefined || b.missing !== url) {
      this.load(id, url);
      const now = this.base.get(id);
      return now instanceof Texture ? now : now === 'loading' ? null : this.placeholder;
    }
    return this.placeholder;
  }

  /** One frame of a horizontal strip. */
  frame(id: string, index: number): Texture | null {
    const img = this.image(id);
    if (!img || img === this.placeholder) return img;
    const info = this.o.assetInfo(id);
    const n = Math.max(1, info?.frames ?? 1);
    const fw = info?.w ?? img.width / n;
    const fh = info?.h ?? img.height;
    const i = ((index % n) + n) % n;
    const key = `${id}#${i}`;
    let t = this.frames.get(key);
    if (!t) {
      t = new Texture({ source: img.source, frame: new Rectangle(Math.min(i * fw, img.width - fw), 0, fw, Math.min(fh, img.height)) });
      this.frames.set(key, t);
    }
    return t;
  }

  /** Tile `index` from a tile sheet laid out in `columns`. */
  tile(id: string, index: number, size: number, columns: number): Texture | null {
    const img = this.image(id);
    if (!img || img === this.placeholder) return img;
    const key = `${id}@${size}:${index}`;
    let t = this.frames.get(key);
    if (!t) {
      const x = (index % columns) * size;
      const y = Math.floor(index / columns) * size;
      if (x + size > img.width || y + size > img.height) return this.placeholder;
      t = new Texture({ source: img.source, frame: new Rectangle(x, y, size, size) });
      this.frames.set(key, t);
    }
    return t;
  }

  destroy() {
    for (const t of this.frames.values()) t.destroy(false);
    for (const t of this.base.values()) if (t instanceof Texture) t.destroy(true);
    this.placeholder.destroy(true);
  }
}

/**
 * Draws a GameView with PixiJS (WebGL with automatic fallback). Sprites are
 * kept per instance id and updated in place every frame.
 */
export class PixiRenderer implements Renderer {
  readonly app: Application;
  private textures!: TextureCache;
  private bg = new Container();
  private world = new Container();
  private tiles = new Container();
  private objects = new Container();
  private ui = new Container();
  private overlay = new Container();
  /** Cracks, health bars and sparks, drawn in scene space above objects. */
  private fx = new Graphics();
  private bubbles = new Map<string, Text>();
  /** Instances with cracks, bars or bubbles this frame (`view.instances` can only be walked once). */
  private fxList: Instance[] = [];
  private tileSprites = new Map<string, { s: Sprite; index: number }>();
  private flashG = new Graphics();
  private cursorSprite = new Sprite();
  private pausedText: Text | null = null;
  private sprites = new Map<string, Sprite>();
  private uiNodes = new Map<string, { box: Graphics; label: Text; img: Sprite }>();
  private popups: Text[] = [];
  /** Tile sprites are updated only when the tile set, cell size or live tile version changes. */
  private drawnTiles: { cells: object; tileSet: object | undefined; version: number } | null = null;
  private bgKey = '';
  private destroyed = false;

  private constructor(private readonly o: PixiRendererOptions) {
    this.app = new Application();
  }

  static async create(parent: HTMLElement, o: PixiRendererOptions): Promise<PixiRenderer> {
    const r = new PixiRenderer(o);
    await r.app.init({
      width: o.screen.w,
      height: o.screen.h,
      background: '#000000',
      antialias: !o.pixelArt,
      // We size the canvas with CSS ourselves; autoDensity would overwrite that on every resize.
      autoDensity: false,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
    });
    r.textures = new TextureCache(o, r.app);
    r.app.canvas.style.width = '100%';
    r.app.canvas.style.height = '100%';
    r.app.canvas.style.display = 'block';
    if (o.pixelArt) r.app.canvas.style.imageRendering = 'pixelated';
    parent.appendChild(r.app.canvas);
    r.world.addChild(r.tiles, r.objects, r.fx);
    r.objects.sortableChildren = true;
    r.cursorSprite.anchor.set(0.5);
    r.cursorSprite.visible = false;
    r.app.stage.addChild(r.bg, r.world, r.ui, r.overlay, r.flashG, r.cursorSprite);
    // Rendering is driven by Game.frame, not Pixi's own ticker.
    r.app.ticker.stop();
    return r;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Changes the drawing size in game pixels (editor viewport resize / zoom). Not rounded, so the CSS stretch scale is exact. */
  resize(w: number, h: number) {
    if (this.destroyed) return;
    this.app.renderer.resize(Math.max(1, w), Math.max(1, h));
    this.bgKey = '';
  }

  render(v: GameView) {
    if (this.destroyed) return;
    this.drawBackground(v);
    this.drawTiles(v);
    const z = v.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(Math.round(-v.camera.x * z + v.camera.offset.x), Math.round(-v.camera.y * z + v.camera.offset.y));
    this.drawObjects(v);
    this.drawFx(v);
    this.drawUI(v);
    this.drawPopups(v);
    this.drawScreenFx(v);
    this.app.renderer.render(this.app.stage);
  }

  /** Cracks on breaking objects, health bars, speech bubbles and sparks. */
  private drawFx(v: GameView) {
    const g = this.fx;
    g.clear();
    const seenBubbles = new Set<string>();
    for (const i of this.fxList) {
      if (i.crack > 0) {
        const k = i.crack;
        g.rect(i.x, i.y, i.w, i.h).fill({ color: 0x000000, alpha: 0.35 * k });
        // Cracks spread from the middle as the object breaks.
        const cx = i.x + i.w / 2;
        const cy = i.y + i.h / 2;
        const n = 2 + Math.floor(k * 5);
        for (let j = 0; j < n; j++) {
          const a = j * 2.4 + 0.6;
          const len = (Math.min(i.w, i.h) / 2) * Math.min(1, k * 1.4);
          const mx = cx + Math.cos(a) * len * 0.5 + Math.sin(a * 3) * 2;
          const my = cy + Math.sin(a) * len * 0.5;
          g.moveTo(cx, cy).lineTo(mx, my).lineTo(cx + Math.cos(a + 0.3) * len, cy + Math.sin(a + 0.3) * len);
        }
        g.stroke({ color: 0x15131c, width: Math.max(1, Math.min(i.w, i.h) / 16), alpha: 0.85 });
        g.rect(i.x, i.y - 7, i.w, 4).fill({ color: 0x15131c, alpha: 0.8 }).rect(i.x, i.y - 7, i.w * k, 4).fill(0xffd166);
      }
      if (i.bar) {
        const w = Math.max(24, i.w);
        const x = i.x + i.w / 2 - w / 2;
        const f = Math.max(0, Math.min(1, i.bar.v / i.bar.max));
        g.roundRect(x, i.y - 10, w, 5, 2).fill({ color: 0x15131c, alpha: 0.85 }).roundRect(x, i.y - 10, w * f, 5, 2).fill(f > 0.5 ? 0x5fe0b0 : f > 0.25 ? 0xffd166 : 0xff5d8f);
      }
      if (i.say) {
        seenBubbles.add(i.id);
        let t = this.bubbles.get(i.id);
        if (!t) {
          t = new Text({ text: '', style: { fontFamily: FONTS.round.family, fontWeight: '700', fontSize: 14, fill: '#15131c', wordWrap: true, wordWrapWidth: 180, align: 'center' } });
          t.anchor.set(0.5, 1);
          this.bubbles.set(i.id, t);
          this.world.addChild(t);
        }
        t.text = i.say.text;
        const bx = i.x + i.w / 2;
        const by = i.y - 14;
        t.position.set(bx, by - 6);
        g.roundRect(bx - t.width / 2 - 8, by - t.height - 12, t.width + 16, t.height + 12, 8).fill(0xffffff).stroke({ color: 0x15131c, width: 2 });
        g.poly([bx - 6, by, bx + 6, by, bx, by + 8]).fill(0xffffff);
      }
    }
    for (const [id, t] of this.bubbles)
      if (!seenBubbles.has(id)) {
        t.destroy();
        this.bubbles.delete(id);
      }
    for (const p of v.particles) g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size).fill({ color: p.color, alpha: Math.max(0, p.life / p.max) });
  }

  /** Screen flash, the custom pointer and the pause sign. */
  private drawScreenFx(v: GameView) {
    this.flashG.clear();
    if (v.flash && v.flash.alpha > 0) this.flashG.rect(0, 0, v.screen.w, v.screen.h).fill({ color: v.flash.color, alpha: v.flash.alpha * 0.8 });
    const c = v.cursor;
    if (this.app.canvas.style.cursor !== c.css) this.app.canvas.style.cursor = c.css === 'look' ? 'none' : c.css;
    const tex = c.look ? this.textures.frame(c.look, 0) : null;
    this.cursorSprite.visible = !!tex && !v.frozen;
    if (tex) {
      if (this.cursorSprite.texture !== tex) this.cursorSprite.texture = tex;
      const k = c.size / Math.max(tex.width, tex.height);
      this.cursorSprite.scale.set(k);
      this.cursorSprite.position.set(c.x, c.y);
    }
    if (v.paused && !this.pausedText) {
      this.pausedText = new Text({ text: 'Paused', style: { fontFamily: FONTS.round.family, fontWeight: '800', fontSize: 48, fill: '#ffffff', stroke: { color: '#15131c', width: 8, join: 'round' } } });
      this.pausedText.anchor.set(0.5);
      this.overlay.addChild(this.pausedText);
    }
    if (this.pausedText) {
      this.pausedText.visible = v.paused;
      this.pausedText.position.set(v.screen.w / 2, v.screen.h / 2);
    }
  }

  private drawBackground(v: GameView) {
    const b = v.scene.background;
    const key = 'color' in b ? `c${b.color}` : `a${b.assetId}:${b.mode}`;
    const tex = 'assetId' in b ? this.textures.image(b.assetId) : null;
    if (key === this.bgKey && !('assetId' in b && this.bg.children.length === 0)) {
      const tiling = this.bg.children[0];
      if (tiling instanceof TilingSprite && 'assetId' in b && b.mode === 'parallax') tiling.tilePosition.set(-v.camera.x * 0.4, -v.camera.y * 0.2);
      return;
    }
    if ('assetId' in b && !tex) return; // retry next frame once loaded
    // A placeholder stand-in is drawn but not remembered, so the real picture replaces it once it loads.
    this.bgKey = tex === this.textures.placeholder ? '' : key;
    this.bg.removeChildren().forEach((c) => c.destroy());
    if ('color' in b) {
      this.bg.addChild(new Graphics().rect(0, 0, v.screen.w, v.screen.h).fill(b.color));
    } else if (tex) {
      if (b.mode === 'stretch') {
        const s = new Sprite(tex);
        s.width = v.screen.w;
        s.height = v.screen.h;
        this.bg.addChild(s);
      } else {
        const scale = b.mode === 'parallax' ? v.screen.h / tex.height : 1;
        const t = new TilingSprite({ texture: tex, width: v.screen.w, height: v.screen.h });
        t.tileScale.set(scale);
        this.bg.addChild(t);
      }
    }
  }

  private drawTiles(v: GameView) {
    const layer = v.scene.tileLayer;
    const ts = v.tileSet;
    const cells = v.tiles?.cells ?? layer.cells;
    const version = v.tiles?.version ?? 0;
    const d = this.drawnTiles;
    if (d && d.cells === cells && d.tileSet === ts && d.version === version) return;
    const sheet = ts ? this.textures.image(ts.assetId) : null;
    if (ts && !sheet) return; // not loaded yet
    if (!d || d.tileSet !== ts || d.cells !== cells) {
      for (const { s } of this.tileSprites.values()) s.destroy();
      this.tileSprites.clear();
    }
    // A missing tile sheet draws placeholders now and tries again next frame.
    this.drawnTiles = sheet === this.textures.placeholder ? null : { cells, tileSet: ts, version };
    if (!ts) return;
    // Only cells that changed get new sprites, so digging in a big tile world stays fast.
    for (const [cell, index] of Object.entries(cells)) {
      const have = this.tileSprites.get(cell);
      if (have && have.index === index) continue;
      const tex = this.textures.tile(ts.assetId, index, ts.tileSize, ts.columns);
      if (!tex) continue;
      if (have) {
        have.s.texture = tex;
        have.index = index;
        continue;
      }
      const [x, y] = cell.split(',').map(Number) as [number, number];
      const s = new Sprite(tex);
      s.position.set(x * layer.cellSize, y * layer.cellSize);
      s.width = layer.cellSize;
      s.height = layer.cellSize;
      s.cullable = true;
      this.tiles.addChild(s);
      this.tileSprites.set(cell, { s, index });
    }
    for (const [cell, { s }] of this.tileSprites)
      if (!(cell in cells)) {
        s.destroy();
        this.tileSprites.delete(cell);
      }
  }

  private drawObjects(v: GameView) {
    const seen = new Set<string>();
    const fps = (id: string) => this.o.assetInfo(id)?.fps ?? 8;
    this.fxList.length = 0;
    for (const i of v.instances) {
      seen.add(i.id);
      if (!i.hidden && (i.crack > 0 || i.bar || i.say)) this.fxList.push(i);
      let s = this.sprites.get(i.id);
      if (!s) {
        s = new Sprite();
        s.anchor.set(0.5);
        s.cullable = true;
        this.sprites.set(i.id, s);
        this.objects.addChild(s);
      }
      this.updateSprite(s, i, v.time, fps);
    }
    for (const [id, s] of this.sprites)
      if (!seen.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
  }

  private updateSprite(s: Sprite, i: Instance, time: number, fps: (id: string) => number) {
    const look = i.anim?.assetId ?? i.lookId;
    let tex: Texture | null;
    if (!look) tex = this.textures.placeholder;
    else {
      const frame = i.anim ? i.anim.frame : (i.still ?? Math.floor(time * fps(look)));
      tex = this.textures.frame(look, frame);
    }
    s.visible = !i.hidden && tex !== null;
    if (!tex) return;
    if (s.texture !== tex) s.texture = tex;
    const flip = i.facing < 0 ? -1 : 1;
    s.scale.set((i.w / tex.width) * flip * i.pop, (i.h / tex.height) * i.pop);
    s.position.set(i.x + i.w / 2, i.y + i.h / 2);
    s.rotation = (i.rotation * Math.PI) / 180;
    s.alpha = i.alpha * i.opacity;
    s.tint = i.tint ?? 0xffffff;
    s.zIndex = i.layer;
  }

  private drawUI(v: GameView) {
    const seen = new Set<string>();
    for (const { el, box, lookId } of v.ui) {
      seen.add(el.id);
      let n = this.uiNodes.get(el.id);
      if (!n) {
        n = { box: new Graphics(), label: new Text({ text: '' }), img: new Sprite() };
        this.ui.addChild(n.box, n.img, n.label);
        this.uiNodes.set(el.id, n);
      }
      const font = FONTS[el.style.font];
      n.label.style = {
        fontFamily: font.family,
        fontWeight: font.weight,
        fontSize: el.style.size,
        fill: el.style.color,
        stroke: { color: '#15131c', width: Math.max(2, el.style.size / 8), join: 'round' },
      };
      n.label.text = el.type === 'image' || el.type === 'bar' || el.type === 'panel' ? '' : box.text;
      n.box.alpha = el.opacity;
      n.label.alpha = el.opacity;
      n.img.alpha = el.opacity;
      n.label.anchor.set(el.type === 'button' ? 0.5 : 0, el.type === 'button' ? 0.5 : 0);
      n.label.position.set(el.type === 'button' ? box.x + box.w / 2 : box.x, el.type === 'button' ? box.y + box.h / 2 : box.y);
      const tex = lookId ? this.textures.image(lookId) : null;
      n.img.visible = !!tex;
      if (tex) {
        n.img.texture = tex;
        n.img.position.set(box.x, box.y);
        n.img.width = box.w;
        n.img.height = box.h;
      }
      n.box.clear();
      if (el.type === 'button' && !tex)
        n.box.roundRect(box.x, box.y + 3, box.w, box.h, 10).fill('#15131c').roundRect(box.x, box.y, box.w, box.h, 10).fill(el.fill === '#5fe0b0' ? '#ff7a59' : el.fill).stroke({ color: '#15131c', width: 2 });
      else if (el.type === 'panel' && !tex) n.box.roundRect(box.x, box.y, box.w, box.h, 10).fill(el.fill);
      else if (el.type === 'bar')
        n.box
          .roundRect(box.x, box.y, box.w, box.h, Math.min(8, box.h / 2))
          .fill(el.track)
          .roundRect(box.x, box.y, box.w * (box.fill ?? 0), box.h, Math.min(8, box.h / 2))
          .fill(el.fill)
          .roundRect(box.x, box.y, box.w, box.h, Math.min(8, box.h / 2))
          .stroke({ color: '#15131c', width: 2 });
    }
    for (const [id, n] of this.uiNodes)
      if (!seen.has(id)) {
        n.box.destroy();
        n.label.destroy();
        n.img.destroy();
        this.uiNodes.delete(id);
      }
  }

  private drawPopups(v: GameView) {
    while (this.popups.length < v.texts.length) {
      const t = new Text({
        text: '',
        style: { fontFamily: FONTS.round.family, fontWeight: '800', fontSize: 34, fill: '#ffffff', stroke: { color: '#15131c', width: 6, join: 'round' }, align: 'center' },
      });
      t.anchor.set(0.5);
      this.popups.push(t);
      this.overlay.addChild(t);
    }
    this.popups.forEach((t, k) => {
      const p = v.texts[k];
      t.visible = !!p;
      if (p) {
        t.text = p.text;
        t.position.set(v.screen.w / 2, v.screen.h * 0.3 + k * 44);
      }
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.textures.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
