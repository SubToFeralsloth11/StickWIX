import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { create } from 'zustand';
import { newId, uniqueName } from '@/model/ids';
import { deleteAssetFromProject } from '@/model/asset-references';
import type { Asset, Project } from '@/model/schema';
import { getAsset, putAsset } from '@/storage/db';
import { putBlobUrl, type Library } from '../assets/library';
import { editorStore } from '../store';
import { toast } from '../toast';
import { PixelDoc, boxPoints, linePoints } from './canvas-model';
import { blitRgba, decodePng, encodeStripPng } from './png';

type ImageAsset = Extract<Asset, { kind: 'image' }>;
/** One animation being drawn; index 0 is the drawing itself, the rest are saved as linked assets. */
type Anim = { name: string; doc: PixelDoc; assetId: string | null };

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

type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'box' | 'eyedropper';
const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'pencil', label: 'Pencil', icon: '✏️', key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: '🧽', key: 'E' },
  { id: 'fill', label: 'Fill', icon: '🪣', key: 'G' },
  { id: 'line', label: 'Line', icon: '📏', key: 'L' },
  { id: 'box', label: 'Hollow box', icon: '⬜', key: 'R' },
  { id: 'eyedropper', label: 'Pick a colour', icon: '💧', key: 'I' },
];
const TOOL_KEYS: Record<string, Tool> = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', r: 'box', i: 'eyedropper' };

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
  const animsRef = useRef<Anim[] | null>(asset ? null : [{ name: 'Main', doc: new PixelDoc(32, 32), assetId: null }]);
  /** Linked animation assets this drawing had when opened, so deleted ones can be removed on save. */
  const loadedExtras = useRef<string[]>([]);
  const [sel, setSel] = useState(0);
  const [newAnim, setNewAnim] = useState('');
  const [copyTargetRaw, setCopyTarget] = useState(-1);
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
        const load = async (a: ImageAsset) => {
          const stored = await getAsset(project.id, a.id);
          const url = lib.url(a.id);
          const blob = stored ?? (url ? await fetch(url).then((r) => r.blob()) : null);
          if (!blob) throw new Error('missing');
          const { data, width, height } = await decodePng(blob);
          return PixelDoc.fromStrip(data, width, height, a.frames.count, a.frames.fps);
        };
        const extras = project.assets.filter((a): a is ImageAsset => a.kind === 'image' && a.animOf === asset.id);
        const docs = await Promise.all([asset, ...extras].map(load));
        if (!live) return;
        loadedExtras.current = extras.map((a) => a.id);
        animsRef.current = [{ name: 'Main', doc: docs[0]!, assetId: asset.id }, ...extras.map((a, i) => ({ name: a.animName ?? a.name, doc: docs[i + 1]!, assetId: a.id }))];
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

  const anims = animsRef.current;
  const doc = anims?.[sel]?.doc ?? null;
  const copyTarget = anims && copyTargetRaw !== sel && copyTargetRaw >= 0 && copyTargetRaw < anims.length ? copyTargetRaw : sel === 0 ? 1 : 0;

  const addAnim = () => {
    const n = newAnim.trim().slice(0, 30);
    if (!anims || !n || anims.some((a) => a.name.toLowerCase() === n.toLowerCase())) return;
    const main = anims[0]!.doc;
    anims.push({ name: n, doc: new PixelDoc(main.w, main.h, main.fps), assetId: null });
    setNewAnim('');
    setSel(anims.length - 1);
  };

  const removeAnim = () => {
    if (!anims || sel === 0) return;
    anims.splice(sel, 1);
    setSel(0);
  };

  /** Copies this animation's current frame (or all its frames) to the end of another animation. */
  const copyFramesTo = (target: number, all: boolean) => {
    const to = anims?.[target];
    if (!doc || !to || target === sel) return;
    to.doc.select(to.doc.frames.length - 1);
    to.doc.insertFrames(all ? doc.frames : [doc.frames[doc.current]!], doc.w, doc.h);
    toast(`Copied ${all ? `${doc.frames.length} frame${doc.frames.length === 1 ? '' : 's'}` : 'frame'} to "${to.name}".`);
    rerender();
  };

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
      for (const [x, y] of (tool === 'box' ? boxPoints : linePoints)(x0, y0, x1, y1)) {
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
    if (tool === 'line' || tool === 'box') {
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
    if (tool === 'line' || tool === 'box') setLinePreview([s.start[0], s.start[1], x, y, s.erase]);
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
    if (tool === 'line' || tool === 'box') {
      doc.beginStroke();
      doc[tool](s.start[0], s.start[1], s.last[0], s.last[1], s.erase ? null : color);
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
    if (!anims || !trimmed || saving) return;
    setSaving(true);
    try {
      const mainId = asset?.id ?? newId('a');
      const saved: ImageAsset[] = [];
      for (const [i, a] of anims.entries()) {
        const strip = a.doc.exportStrip();
        const blob = await encodeStripPng(strip);
        const id = i === 0 ? mainId : (a.assetId ?? newId('a'));
        await putAsset(project.id, id, blob);
        putBlobUrl(project.id, id, blob);
        saved.push(
          i === 0
            ? { id, name: trimmed, kind: 'image', source: 'drawn', mime: 'image/png', frames: strip.frames }
            : { id, name: `${trimmed} (${a.name})`.slice(0, 60), kind: 'image', source: 'drawn', mime: 'image/png', frames: strip.frames, animOf: mainId, animName: a.name },
        );
      }
      const gone = loadedExtras.current.filter((id) => !saved.some((s) => s.id === id));
      editorStore.getState().edit(asset ? `Edit drawing "${trimmed}"` : `Draw "${trimmed}"`, (d) => {
        for (const next of saved) {
          const i = d.assets.findIndex((a) => a.id === next.id);
          if (i >= 0) d.assets[i] = next;
          else d.assets.push(next);
        }
        for (const id of gone) deleteAssetFromProject(d, id);
        // Kinds wearing this drawing get each extra as a named animation.
        for (const k of d.kinds) {
          if (k.lookId !== mainId) continue;
          for (const s of saved.slice(1)) {
            const have = k.animations.find((x) => x.name.toLowerCase() === s.animName!.toLowerCase());
            if (have) {
              have.lookId = s.id;
              have.fps = s.frames.fps;
            } else if (k.animations.length < 40) k.animations.push({ id: newId('a'), name: s.animName!, lookId: s.id, fps: s.frames.fps, loop: true });
          }
        }
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
                  style={{ width: doc.w * zoom, height: doc.h * zoom, backgroundSize: `${zoom * 2}px ${zoom * 2}px`, touchAction: 'none' }}
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
                  <span className="muted">Animations</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {anims!.map((a, i) => (
                      <button key={a.name} className={`btn small${i === sel ? ' primary' : ''}`} onClick={() => setSel(i)} aria-pressed={i === sel}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <form
                    className="row"
                    style={{ gap: 4 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      addAnim();
                    }}
                  >
                    <input className="field grow" value={newAnim} maxLength={30} placeholder="walk, jump, mine…" onChange={(e) => setNewAnim(e.target.value)} aria-label="New animation name" />
                    <button className="btn small" disabled={!newAnim.trim()}>
                      + Add
                    </button>
                  </form>
                  {sel > 0 && (
                    <button className="btn small danger" onClick={removeAnim}>
                      Delete "{anims![sel]!.name}"
                    </button>
                  )}
                  <span className="dim" style={{ fontSize: 12 }}>
                    Each extra one becomes a named animation on every Kind that wears this drawing.
                  </span>
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
                  {anims!.length > 1 && (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 4, fontSize: 13 }}>
                      <span className="muted">Copy to</span>
                      <select className="field" value={copyTarget} onChange={(e) => setCopyTarget(Number(e.target.value))} aria-label="Animation to copy frames to">
                        {anims!.map((a, i) =>
                          i === sel ? null : (
                            <option key={a.name} value={i}>
                              {a.name}
                            </option>
                          ),
                        )}
                      </select>
                      <button className="btn small" onClick={() => copyFramesTo(copyTarget, false)} title="Add a copy of this frame to the end of that animation">
                        This frame
                      </button>
                      <button className="btn small" onClick={() => copyFramesTo(copyTarget, true)} title="Add copies of every frame here to the end of that animation">
                        All frames
                      </button>
                    </div>
                  )}
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
