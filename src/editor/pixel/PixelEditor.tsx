import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { create } from 'zustand';
import { newId, uniqueName } from '@/model/ids';
import type { Asset, Project } from '@/model/schema';
import { getAsset, putAsset } from '@/storage/db';
import { putBlobUrl, type Library } from '../assets/library';
import { editorStore } from '../store';
import { toast } from '../toast';
import { PixelDoc, linePoints } from './canvas-model';
import { blitRgba, decodePng, encodeStripPng } from './png';

/** Which drawing the pixel editor has open: null = closed, 'new' = a fresh drawing, else a drawn asset id. */
export const usePixelEditor = create<{ open: string | null }>(() => ({ open: null }));

export function openPixelEditor(assetId?: string) {
  usePixelEditor.setState({ open: assetId ?? 'new' });
}

const closePixelEditor = () => usePixelEditor.setState({ open: null });

export const SIZES = [8, 16, 24, 32, 48, 64, 96, 128];

/** Kid-friendly palette: 4 rows of 8. */
export const PALETTE = [
  '#000000', '#3b3b3b', '#7a7a7a', '#bdbdbd', '#ffffff', '#5d3a1a', '#8d5524', '#c68642',
  '#e0ac69', '#ffdbac', '#b71c1c', '#f44336', '#ff8a80', '#e91e63', '#f48fb1', '#9c27b0',
  '#ce93d8', '#3f51b5', '#2196f3', '#81d4fa', '#00bcd4', '#009688', '#1b5e20', '#4caf50',
  '#aed581', '#cddc39', '#ffeb3b', '#fff59d', '#ffc107', '#ff9800', '#ff5722', '#ffccbc',
];

type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'eyedropper';
const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'pencil', label: 'Pencil', icon: '✏️', key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: '🧽', key: 'E' },
  { id: 'fill', label: 'Fill', icon: '🪣', key: 'G' },
  { id: 'line', label: 'Line', icon: '📏', key: 'L' },
  { id: 'eyedropper', label: 'Pick a colour', icon: '💧', key: 'I' },
];
const TOOL_KEYS: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', i: 'eyedropper' };

/** Mounted with the Art tab's tools; shows the editor while one is open. */
export function PixelEditorHost({ project, lib }: { project: Project; lib: Library }) {
  const open = usePixelEditor((s) => s.open);
  if (!open) return null;
  const asset = open === 'new' ? null : project.assets.find((a) => a.id === open && a.kind === 'image' && a.source === 'drawn');
  if (asset === undefined) return null;
  return <PixelEditor key={open} project={project} lib={lib} asset={asset as Extract<Asset, { kind: 'image' }> | null} onClose={closePixelEditor} />;
}

/** Board size on screen: whole-number zoom that fits about 440 px. */
const fitZoom = (w: number, h: number) => Math.max(2, Math.floor(440 / Math.max(w, h)));

/** The pixel editor (FR-033): draw multi-frame sprites 8×8 to 128×128 and save them as a look. */
export function PixelEditor({ project, lib, asset, onClose }: { project: Project; lib: Library; asset: Extract<Asset, { kind: 'image' }> | null; onClose: () => void }) {
  const docRef = useRef<PixelDoc | null>(asset ? null : new PixelDoc(32, 32));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#000000');
  const [recent, setRecent] = useState<string[]>([]);
  const [onion, setOnion] = useState(true);
  const [zoom, setZoom] = useState(() => fitZoom(asset?.frames.w ?? 32, asset?.frames.h ?? 32));
  const [name, setName] = useState(() => asset?.name ?? uniqueName('My drawing', project.assets.map((a) => a.name), 60));
  const [saving, setSaving] = useState(false);
  const board = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  /** Active pointer stroke: last pixel, erase mode, and the line start for the line tool. */
  const stroke = useRef<{ last: [number, number]; erase: boolean; start: [number, number] } | null>(null);
  const [linePreview, setLinePreview] = useState<[number, number, number, number, boolean] | null>(null);

  // Load an existing drawing back into frames.
  useEffect(() => {
    if (!asset) return;
    let live = true;
    void (async () => {
      try {
        const stored = await getAsset(project.id, asset.id);
        const url = lib.url(asset.id);
        const blob = stored ?? (url ? await fetch(url).then((r) => r.blob()) : null);
        if (!blob) throw new Error('missing');
        const { data, width, height } = await decodePng(blob);
        if (!live) return;
        docRef.current = PixelDoc.fromStrip(data, width, height, asset.frames.count, asset.frames.fps);
        rerender();
      } catch {
        if (!live) return;
        toast(`"${asset.name}" could not be opened for editing.`, { error: true });
        onClose();
      }
    })();
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = docRef.current;

  // Redraw the board: onion skin, current frame, line preview.
  useEffect(() => {
    const c = board.current;
    if (!doc || !c) return;
    c.width = doc.w;
    c.height = doc.h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, doc.w, doc.h);
    const skin = onion ? doc.onionSkin() : null;
    if (skin) blitRgba(ctx, skin, doc.w, doc.h);
    blitRgba(ctx, doc.frames[doc.current]!, doc.w, doc.h);
    if (linePreview) {
      const [x0, y0, x1, y1, erase] = linePreview;
      for (const [x, y] of linePoints(x0, y0, x1, y1)) {
        if (erase) ctx.clearRect(x, y, 1, 1);
        else {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  });

  // Animated preview at the chosen speed.
  const fps = doc?.fps ?? 8;
  useEffect(() => {
    if (!doc) return;
    let f = 0;
    const draw = () => {
      const c = preview.current;
      if (!c) return;
      c.width = doc.w;
      c.height = doc.h;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, doc.w, doc.h);
      blitRgba(ctx, doc.frames[f % doc.frames.length]!, doc.w, doc.h);
      f++;
    };
    draw();
    const t = setInterval(draw, 1000 / fps);
    return () => clearInterval(t);
  }, [doc, fps]);

  const chooseColor = (c: string) => {
    setColor(c);
    setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 8));
  };

  const cell = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * doc!.w), Math.floor(((e.clientY - r.top) / r.height) * doc!.h)];
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!doc || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    // Take focus off the name field so tool keys and Ctrl+Z reach the editor.
    e.currentTarget.parentElement?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = cell(e);
    const erase = e.button === 2 || tool === 'eraser';
    if (tool === 'eyedropper' && !erase) {
      const picked = doc.pick(x, y);
      if (picked) chooseColor(picked);
      setTool('pencil');
      return;
    }
    if (tool === 'fill' && !erase) {
      doc.fill(x, y, color);
      rerender();
      return;
    }
    stroke.current = { last: [x, y], erase, start: [x, y] };
    if (tool === 'line') {
      setLinePreview([x, y, x, y, erase]);
      return;
    }
    doc.beginStroke();
    if (erase) doc.erase(x, y);
    else doc.pencil(x, y, color);
    rerender();
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!doc || !s) return;
    const [x, y] = cell(e);
    if (x === s.last[0] && y === s.last[1]) return;
    if (tool === 'line') setLinePreview([s.start[0], s.start[1], x, y, s.erase]);
    else {
      // Join samples with a line so fast strokes have no gaps.
      doc.line(s.last[0], s.last[1], x, y, s.erase ? null : color);
      rerender();
    }
    s.last = [x, y];
  };

  const onUp = () => {
    const s = stroke.current;
    stroke.current = null;
    if (!doc || !s) return;
    if (tool === 'line') {
      doc.beginStroke();
      doc.line(s.start[0], s.start[1], s.last[0], s.last[1], s.erase ? null : color);
      setLinePreview(null);
      rerender();
    } else if (!s.erase && tool === 'pencil') setRecent((r) => [color, ...r.filter((x) => x !== color)].slice(0, 8));
  };

  const act = (fn: (d: PixelDoc) => void) => {
    if (!doc) return;
    fn(doc);
    rerender();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return; // Let the dialog close.
    // Keep the main editor's shortcuts (undo, delete, nudge) out of the drawing.
    e.stopPropagation();
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      act((d) => (k === 'y' || e.shiftKey ? d.redo() : d.undo()));
    } else if (!mod && !e.altKey && TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
  };

  const resize = (w: number, h: number) => {
    act((d) => d.resize(w, h));
    setZoom(fitZoom(w, h));
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!doc || !trimmed || saving) return;
    setSaving(true);
    try {
      const strip = doc.exportStrip();
      const blob = await encodeStripPng(strip);
      const id = asset?.id ?? newId('a');
      await putAsset(project.id, id, blob);
      putBlobUrl(project.id, id, blob);
      editorStore.getState().edit(asset ? `Edit drawing "${trimmed}"` : `Draw "${trimmed}"`, (d) => {
        const next: Asset = { id, name: trimmed, kind: 'image', source: 'drawn', mime: 'image/png', frames: strip.frames };
        const i = d.assets.findIndex((a) => a.id === id);
        if (i >= 0) d.assets[i] = next;
        else d.assets.push(next);
      });
      toast(asset ? `Saved "${trimmed}".` : `Saved "${trimmed}" to My art. Drag it onto the scene to use it.`);
      onClose();
    } catch (err) {
      toast(`Your drawing could not be saved: ${err instanceof Error ? err.message : String(err)}`, { error: true });
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="dialog wide" aria-describedby={undefined} onKeyDown={onKey} data-testid="pixel-editor">
          <Dialog.Title asChild>
            <h2>{asset ? `Edit "${asset.name}"` : 'Draw a picture'}</h2>
          </Dialog.Title>
          {!doc ? (
            <p className="muted">Opening your drawing…</p>
          ) : (
            <div className="pixel">
              <div className="tools" role="toolbar" aria-label="Drawing tools">
                {TOOLS.map((t) => (
                  <button key={t.id} className={`btn icon${tool === t.id ? ' on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id}>
                    {t.icon}
                  </button>
                ))}
                <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--line)' }} />
                <button className="btn icon" onClick={() => act((d) => d.undo())} disabled={!doc.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                  ↶
                </button>
                <button className="btn icon" onClick={() => act((d) => d.redo())} disabled={!doc.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
                  ↷
                </button>
                <button className="btn icon" onClick={() => setZoom((z) => Math.min(64, z + 1))} title="Zoom in" aria-label="Zoom in">
                  ＋
                </button>
                <button className="btn icon" onClick={() => setZoom((z) => Math.max(1, z - 1))} title="Zoom out" aria-label="Zoom out">
                  －
                </button>
              </div>

              <div className="canvas-wrap" tabIndex={-1} style={{ outline: 'none' }}>
                <canvas
                  ref={board}
                  className="board"
                  style={{ width: doc.w * zoom, height: doc.h * zoom, touchAction: 'none' }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label="Drawing board. Left click draws, right click erases."
                  data-testid="pixel-board"
                />
              </div>

              <div className="stack" style={{ overflowY: 'auto' }}>
                <label className="stack" style={{ gap: 4 }}>
                  <span className="muted">Name</span>
                  <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Drawing name" />
                </label>

                <div className="stack" style={{ gap: 4 }}>
                  <span className="muted">Colours</span>
                  <div className="swatches">
                    {PALETTE.map((c) => (
                      <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => chooseColor(c)} title={c} aria-label={`Colour ${c}`} />
                    ))}
                  </div>
                  <div className="row">
                    <input type="color" value={color} onChange={(e) => chooseColor(e.target.value)} aria-label="Pick any colour" />
                    <span className="dim" style={{ fontSize: 12 }}>
                      Any colour
                    </span>
                  </div>
                  {recent.length > 0 && (
                    <>
                      <span className="dim" style={{ fontSize: 12 }}>
                        Recent
                      </span>
                      <div className="swatches">
                        {recent.map((c) => (
                          <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} title={c} aria-label={`Recent colour ${c}`} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="row">
                  <span className="muted">Size</span>
                  <select className="field" value={doc.w} onChange={(e) => resize(Number(e.target.value), doc.h)} aria-label="Width in pixels">
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  ×
                  <select className="field" value={doc.h} onChange={(e) => resize(doc.w, Number(e.target.value))} aria-label="Height in pixels">
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="stack" style={{ gap: 4 }}>
                  <span className="muted">Frames</span>
                  <div className="frames">
                    {doc.frames.map((f, i) => (
                      <FrameThumb key={i} data={f} w={doc.w} h={doc.h} on={i === doc.current} version={doc.version} onClick={() => act((d) => d.select(i))} label={`Frame ${i + 1}`} />
                    ))}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <button className="btn small" onClick={() => act((d) => d.addFrame())} title="Add an empty frame">
                      + New
                    </button>
                    <button className="btn small" onClick={() => act((d) => d.duplicateFrame())} title="Copy this frame">
                      Copy
                    </button>
                    <button className="btn small" onClick={() => act((d) => d.moveFrame(d.current, d.current - 1))} disabled={doc.current === 0} title="Move this frame earlier" aria-label="Move frame left">
                      ◀
                    </button>
                    <button className="btn small" onClick={() => act((d) => d.moveFrame(d.current, d.current + 1))} disabled={doc.current === doc.frames.length - 1} title="Move this frame later" aria-label="Move frame right">
                      ▶
                    </button>
                    <button className="btn small danger" onClick={() => act((d) => d.deleteFrame())} disabled={doc.frames.length <= 1} title="Delete this frame">
                      Delete
                    </button>
                  </div>
                  <label className="row" style={{ fontSize: 13 }}>
                    <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} />
                    Onion skin (see the last frame faintly)
                  </label>
                </div>

                <div className="stack" style={{ gap: 4 }}>
                  <label className="row" style={{ fontSize: 13 }}>
                    <span className="muted">Speed</span>
                    <input type="range" min={1} max={24} value={doc.fps} onChange={(e) => act((d) => (d.fps = Number(e.target.value)))} aria-label="Frames per second" className="grow" />
                    <span>{doc.fps} fps</span>
                  </label>
                  <canvas ref={preview} style={{ width: 96, height: 96, objectFit: 'contain', imageRendering: 'pixelated', background: 'var(--bg2)', borderRadius: 8 }} aria-label="Animation preview" />
                </div>
              </div>
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void save()} disabled={!doc || !name.trim() || saving} data-testid="pixel-save">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FrameThumb({ data, w, h, on, version, onClick, label }: { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number; on: boolean; version: number; onClick: () => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = w;
    c.height = h;
    c.getContext('2d')!.putImageData(new ImageData(data, w, h), 0, 0);
  }, [data, w, h, version]);
  return <canvas ref={ref} className={on ? 'on' : undefined} onClick={onClick} role="button" aria-label={label} aria-pressed={on} />;
}
