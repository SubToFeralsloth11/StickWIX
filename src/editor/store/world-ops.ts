import { current, isDraft, type Draft } from 'immer';
import { newId, uniqueName } from '@/model/ids';
import { newScene } from '@/model/defaults';
import type { Kind, ObjectInstance, Project, Scene, Sticker, UIElement } from '@/model/schema';
import { CONTROLLER_TYPES, fillStickerSettings, type StickerType } from '@/model/sticker-settings';

/** Plain copy of a draft (drafts are proxies and cannot be structured-cloned). */
function snapshot<T>(value: T | Draft<T>): T {
  return (isDraft(value) ? current(value) : value) as T;
}

/**
 * Document edits used by the editor. Each takes an Immer draft so callers wrap
 * them in one `edit(label, ...)` step (one undo step per user action).
 */

type P = Draft<Project>;

export function sceneOf(p: P, sceneId: string): Draft<Scene> {
  const s = p.scenes.find((x) => x.id === sceneId);
  if (!s) throw new Error(`No scene ${sceneId}`);
  return s;
}

// ---------- Scenes (FR-006) ----------

export function addScene(p: P, name = 'Level'): string {
  const s = newScene(uniqueName(name, p.scenes.map((x) => x.name)), p.settings.screenWidth, p.settings.screenHeight);
  s.width = Math.max(p.settings.screenWidth * 2, s.width);
  p.scenes.push(s);
  return s.id;
}

export function renameScene(p: P, sceneId: string, name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  const s = sceneOf(p, sceneId);
  s.name = uniqueName(trimmed, p.scenes.filter((x) => x.id !== sceneId).map((x) => x.name));
}

export function moveScene(p: P, sceneId: string, toIndex: number) {
  const from = p.scenes.findIndex((s) => s.id === sceneId);
  if (from < 0) return;
  const [s] = p.scenes.splice(from, 1);
  p.scenes.splice(Math.max(0, Math.min(p.scenes.length, toIndex)), 0, s!);
}

/** Copies a scene with fresh ids for the scene, its objects, UI and rules. Rules pointing at copied objects are remapped. */
export function duplicateScene(p: P, sceneId: string): string {
  const src = sceneOf(p, sceneId);
  const copy: Scene = structuredClone(snapshot(src));
  const remap = new Map<string, string>();
  copy.id = newId('s');
  copy.name = uniqueName(`${src.name} copy`, p.scenes.map((x) => x.name), 40);
  for (const o of copy.objects) remap.set(o.id, (o.id = newId('o')));
  for (const u of copy.ui) remap.set(u.id, (u.id = newId('u')));
  for (const r of copy.rules) r.id = newId('r');
  copy.rules = JSON.parse(JSON.stringify(copy.rules), (k, v) => ((k === 'id' && remap.has(v)) ? remap.get(v) : v));
  const at = p.scenes.findIndex((s) => s.id === sceneId);
  p.scenes.splice(at + 1, 0, copy);
  return copy.id;
}

/** Deletes a scene; the last scene can't be deleted. The start scene moves to the first remaining one. */
export function deleteScene(p: P, sceneId: string): boolean {
  if (p.scenes.length <= 1) return false;
  p.scenes = p.scenes.filter((s) => s.id !== sceneId);
  if (p.startSceneId === sceneId) p.startSceneId = p.scenes[0]!.id;
  return true;
}

export function setStartScene(p: P, sceneId: string) {
  sceneOf(p, sceneId);
  p.startSceneId = sceneId;
}

export function resizeScene(p: P, sceneId: string, width: number, height: number) {
  const s = sceneOf(p, sceneId);
  s.width = Math.round(Math.min(20000, Math.max(p.settings.screenWidth, width)));
  s.height = Math.round(Math.min(20000, Math.max(p.settings.screenHeight, height)));
}

// ---------- Kinds & objects (FR-008, FR-009) ----------

export function addKind(p: P, name: string, lookId: string | null, w: number, h: number): string {
  const k: Kind = {
    id: newId('k'), name: uniqueName(name, p.kinds.map((x) => x.name)), lookId, size: { w, h },
    stickers: [], values: [], rules: [], layer: 0,
  };
  p.kinds.push(k);
  return k.id;
}

export function snapValue(v: number, grid: number | null) {
  return grid ? Math.round(v / grid) * grid : Math.round(v);
}

export function placeObject(p: P, sceneId: string, kindId: string, x: number, y: number, grid: number | null = null): string {
  const s = sceneOf(p, sceneId);
  const top = s.objects.reduce((m, o) => Math.max(m, o.layer), 0);
  const o: ObjectInstance = {
    id: newId('o'), kindId, x: snapValue(x, grid), y: snapValue(y, grid), rotation: 0, scaleX: 1, scaleY: 1,
    layer: s.objects.length ? top + 1 : 0, overrides: {},
  };
  s.objects.push(o);
  return o.id;
}

function objectsIn(p: P, sceneId: string, ids: readonly string[]) {
  const set = new Set(ids);
  return sceneOf(p, sceneId).objects.filter((o) => set.has(o.id));
}

export function moveObjects(p: P, sceneId: string, ids: readonly string[], dx: number, dy: number, grid: number | null = null) {
  for (const o of objectsIn(p, sceneId, ids)) {
    o.x = snapValue(o.x + dx, grid);
    o.y = snapValue(o.y + dy, grid);
  }
}

export function setObjectTransform(p: P, sceneId: string, id: string, t: Partial<Pick<ObjectInstance, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>>) {
  const o = objectsIn(p, sceneId, [id])[0];
  if (!o) return;
  if (t.x !== undefined) o.x = t.x;
  if (t.y !== undefined) o.y = t.y;
  if (t.rotation !== undefined) o.rotation = ((t.rotation % 360) + 360) % 360;
  if (t.scaleX !== undefined) o.scaleX = Math.max(0.05, Math.min(50, t.scaleX));
  if (t.scaleY !== undefined) o.scaleY = Math.max(0.05, Math.min(50, t.scaleY));
}

export function duplicateObjects(p: P, sceneId: string, ids: readonly string[], offset = 16): string[] {
  const s = sceneOf(p, sceneId);
  const top = s.objects.reduce((m, o) => Math.max(m, o.layer), 0);
  return objectsIn(p, sceneId, ids).map((o, i) => {
    const c: ObjectInstance = structuredClone(snapshot(o));
    c.id = newId('o');
    c.x += offset;
    c.y += offset;
    c.layer = top + 1 + i;
    s.objects.push(c);
    return c.id;
  });
}

export function deleteObjects(p: P, sceneId: string, ids: readonly string[]) {
  const set = new Set(ids);
  const s = sceneOf(p, sceneId);
  s.objects = s.objects.filter((o) => !set.has(o.id));
}

/** Brings objects to the front or sends them to the back, keeping their relative order. */
export function layerObjects(p: P, sceneId: string, ids: readonly string[], where: 'front' | 'back') {
  const s = sceneOf(p, sceneId);
  const set = new Set(ids);
  const rest = s.objects.filter((o) => !set.has(o.id)).sort((a, b) => a.layer - b.layer);
  const moving = s.objects.filter((o) => set.has(o.id)).sort((a, b) => a.layer - b.layer);
  const order = where === 'front' ? [...rest, ...moving] : [...moving, ...rest];
  order.forEach((o, i) => (o.layer = i));
}

/** Objects whose box intersects the rectangle (marquee multi-select). */
export function objectsInRect(p: Project, sceneId: string, r: { x: number; y: number; w: number; h: number }): string[] {
  const s = p.scenes.find((x) => x.id === sceneId);
  if (!s) return [];
  const kinds = new Map(p.kinds.map((k) => [k.id, k]));
  return s.objects
    .filter((o) => {
      const k = kinds.get(o.kindId);
      if (!k) return false;
      const w = k.size.w * o.scaleX;
      const h = k.size.h * o.scaleY;
      return o.x < r.x + r.w && o.x + w > r.x && o.y < r.y + r.h && o.y + h > r.y;
    })
    .map((o) => o.id);
}

// ---------- Stickers (FR-011..013) ----------

export type AddStickerResult = { ok: true; id: string } | { ok: false; conflict: Sticker };

/** Adds a sticker to a Kind. A second controller is refused with the existing one, so the UI can offer to replace it (FR-012). */
export function addSticker(p: P, kindId: string, type: StickerType, opts: { replace?: boolean } = {}): AddStickerResult {
  const k = p.kinds.find((x) => x.id === kindId);
  if (!k) throw new Error(`No Kind ${kindId}`);
  if (CONTROLLER_TYPES.includes(type)) {
    const existing = k.stickers.find((s) => CONTROLLER_TYPES.includes(s.type));
    if (existing) {
      if (!opts.replace) return { ok: false, conflict: structuredClone(snapshot(existing)) as Sticker };
      k.stickers = k.stickers.filter((s) => s.id !== existing.id);
    }
  }
  const s = { id: newId('st'), type, settings: fillStickerSettings(type, {}) as Record<string, unknown> };
  k.stickers.push(s);
  return { ok: true, id: s.id };
}

export function removeSticker(p: P, kindId: string, stickerId: string) {
  const k = p.kinds.find((x) => x.id === kindId);
  if (!k) return;
  k.stickers = k.stickers.filter((s) => s.id !== stickerId);
  for (const sc of p.scenes) for (const o of sc.objects) if (o.kindId === kindId && o.overrides.stickers) delete o.overrides.stickers[stickerId];
}

/** Sets a sticker setting on the Kind, or as a per-object override when `objectId` is given (FR-009). */
export function setStickerSetting(p: P, kindId: string, stickerId: string, key: string, value: unknown, at?: { sceneId: string; objectId: string }) {
  const k = p.kinds.find((x) => x.id === kindId);
  const st = k?.stickers.find((s) => s.id === stickerId);
  if (!k || !st) return;
  const filled = fillStickerSettings(st.type, { ...st.settings, [key]: value }) as Record<string, unknown>;
  if (!at) {
    st.settings = filled;
    return;
  }
  const o = objectsIn(p, at.sceneId, [at.objectId])[0];
  if (!o) return;
  o.overrides.stickers ??= {};
  o.overrides.stickers[stickerId] ??= {};
  o.overrides.stickers[stickerId]![key] = filled[key];
}

/** Removes one per-object override so the Kind default applies again. */
export function clearOverride(p: P, sceneId: string, objectId: string, stickerId: string, key: string) {
  const o = objectsIn(p, sceneId, [objectId])[0];
  const bag = o?.overrides.stickers?.[stickerId];
  if (!o || !bag) return;
  delete bag[key];
  if (!Object.keys(bag).length) delete o.overrides.stickers![stickerId];
  if (o.overrides.stickers && !Object.keys(o.overrides.stickers).length) delete o.overrides.stickers;
}

// ---------- Tiles (FR-007) ----------

const cellKey = (x: number, y: number) => `${x},${y}`;

export function paintTiles(p: P, sceneId: string, cells: readonly { x: number; y: number }[], tileIndex: number) {
  const layer = sceneOf(p, sceneId).tileLayer;
  for (const c of cells) layer.cells[cellKey(c.x, c.y)] = tileIndex;
}

export function eraseTiles(p: P, sceneId: string, cells: readonly { x: number; y: number }[]) {
  const layer = sceneOf(p, sceneId).tileLayer;
  for (const c of cells) delete layer.cells[cellKey(c.x, c.y)];
}

/** Every cell in the rectangle between two corner cells, inclusive. */
export function rectCells(a: { x: number; y: number }, b: { x: number; y: number }) {
  const out: { x: number; y: number }[] = [];
  for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++)
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) out.push({ x, y });
  return out;
}

/** Cells on a straight line (brush strokes between two pointer samples never leave gaps). */
export function lineCells(a: { x: number; y: number }, b: { x: number; y: number }) {
  const out: { x: number; y: number }[] = [];
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let i = 0; i <= n; i++) out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) });
  return out;
}

export function setTileSolid(p: P, tileSetId: string, index: number, solid: boolean, oneWay = false) {
  const ts = p.tileSets.find((t) => t.id === tileSetId);
  if (!ts) return;
  while (ts.solid.length < ts.count) ts.solid.push(false);
  while (ts.oneWay.length < ts.count) ts.oneWay.push(false);
  ts.solid[index] = solid;
  ts.oneWay[index] = solid && oneWay;
}

export function assignTileSet(p: P, sceneId: string, tileSetId: string) {
  sceneOf(p, sceneId).tileLayer.tileSetId = tileSetId;
}

// ---------- UI layer (FR-010) ----------

export function addUIElement(p: P, sceneId: string, type: UIElement['type'], init: Partial<UIElement> = {}): string {
  const s = sceneOf(p, sceneId);
  const base = type === 'text' ? 'Text' : type === 'button' ? 'Button' : 'Image';
  const el: UIElement = {
    id: newId('u'), name: uniqueName(init.name ?? base, s.ui.map((u) => u.name)), type, x: 16, y: 16, anchor: 'tl',
    text: type === 'image' ? '' : type === 'button' ? 'Click me' : 'Score: {Score}',
    style: { size: 24, color: '#ffffff', font: 'round' }, hidden: false, ...init,
  };
  s.ui.push(el);
  return el.id;
}
