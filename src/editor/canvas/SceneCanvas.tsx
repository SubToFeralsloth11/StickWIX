import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { Project, Scene } from '@/model/schema';
import { PixiRenderer } from '@/runtime/render/pixi-renderer';
import type { GameView } from '@/runtime/render/renderer';
import type { Library } from '../assets/library';
import { editorStore, useEditor } from '../store';
import { setUI, useUI, type Tool } from '../ui-state';
import * as ops from '../store/world-ops';
import { buildEditWorld, objectAt, objectBox } from './edit-view';
import { DROP_HANDLERS, readDragPayload } from './drop';
import { toast } from '../toast';

/** Extra layers drawn over the canvas (e.g. the screen UI layer editor). */
export interface OverlayProps {
  project: Project;
  scene: Scene;
  lib: Library;
  /** Scene px → viewport px. */
  toView: (x: number, y: number) => { x: number; y: number };
  zoom: number;
}
export const CANVAS_OVERLAYS: ComponentType<OverlayProps>[] = [];

type Drag =
  | { mode: 'pan'; sx: number; sy: number; cam: { x: number; y: number } }
  | { mode: 'move'; sx: number; sy: number; ids: string[] }
  | { mode: 'marquee'; sx: number; sy: number }
  | { mode: 'resize'; sx: number; sy: number; id: string; w: number; h: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number }
  | { mode: 'paint'; erase: boolean; last: { x: number; y: number }; cells: Map<string, { x: number; y: number }> }
  | { mode: 'rect'; from: { x: number; y: number }; to: { x: number; y: number } };

const TOOLS: { id: Tool; label: string; key: string; title: string }[] = [
  { id: 'select', label: '↖ Select', key: 'v', title: 'Select and move things (V)' },
  { id: 'brush', label: '✎ Paint', key: 'b', title: 'Paint tiles one by one (B)' },
  { id: 'rect', label: '▭ Fill box', key: 'r', title: 'Fill a rectangle with tiles (R)' },
  { id: 'erase', label: '⌫ Erase', key: 'e', title: 'Erase tiles (E)' },
];

export function SceneCanvas({ project, lib }: { project: Project; lib: Library }) {
  const sceneId = useEditor((s) => s.sceneId);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const { tool, tileIndex, snap, playing } = useUI();
  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const viewport = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<PixiRenderer | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [cam, setCam] = useState({ x: -32, y: -32 });
  /** The camera as drawn: the renderer snaps it to whole scene pixels, so overlays and hit-testing must too. */
  const shownCam = useMemo(() => ({ x: Math.round(cam.x), y: Math.round(cam.y) }), [cam]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Pointer-down position in client and scene pixels; drag deltas come from client movement so layout shifts can't move things. */
  const down = useRef<{ cx: number; cy: number; x: number; y: number } | null>(null);
  const libRef = useRef(lib);
  libRef.current = lib;
  const cell = scene.tileLayer.cellSize;
  const grid = snap ? cell : null;
  const selectedIds = useMemo(() => selection.filter((s) => s.kind === 'object').map((s) => s.id), [selection]);

  // One renderer for the canvas's lifetime.
  useEffect(() => {
    let r: PixiRenderer | null = null;
    let dead = false;
    void PixiRenderer.create(host.current!, {
      screen: { w: 800, h: 600 },
      pixelArt: project.settings.pixelArt,
      textureUrl: (id) => libRef.current.url(id),
      assetInfo: (id) => libRef.current.info(id),
      onTextureLoad: () => setTick((t) => t + 1),
    }).then((x) => {
      if (dead) x.destroy();
      else setRenderer((r = x));
    });
    return () => {
      dead = true;
      r?.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = viewport.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    renderer?.resize(size.w / zoom, size.h / zoom);
  }, [renderer, size, zoom]);

  const world = useMemo(() => buildEditWorld(project, scene, lib.info), [project, scene, lib]);

  // Draw on any change (no animation loop while editing).
  useEffect(() => {
    if (!renderer || playing) return;
    const moving = drag?.mode === 'move' && cursor ? { dx: cursor.x - drag.sx, dy: cursor.y - drag.sy, ids: new Set(drag.ids) } : null;
    const resizing = drag?.mode === 'resize' && cursor ? drag : null;
    const instances = [...world.all()].map((i) => {
      if (moving?.ids.has(i.id)) return { ...i, x: ops.snapValue(i.x + moving.dx, grid), y: ops.snapValue(i.y + moving.dy, grid) };
      if (resizing && resizing.id === i.id && cursor) {
        const w = Math.max(4, ops.snapValue(resizing.w + cursor.x - resizing.sx, grid));
        const h = Math.max(4, ops.snapValue(resizing.h + cursor.y - resizing.sy, grid));
        return { ...i, w, h, hit: { x: 0, y: 0, w, h } };
      }
      return i;
    });
    const view: GameView = {
      project,
      scene,
      tileSet: project.tileSets.find((t) => t.id === scene.tileLayer.tileSetId),
      screen: { w: size.w / zoom, h: size.h / zoom },
      camera: { x: shownCam.x, y: shownCam.y, offset: { x: 0, y: 0 } },
      time: 0,
      instances,
      ui: [],
      texts: [],
      frozen: false,
    };
    renderer.render(view);
  }, [renderer, world, project, scene, shownCam, zoom, size, drag, cursor, grid, tick, playing]);

  const toScene = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewport.current!.getBoundingClientRect();
      return { x: shownCam.x + (clientX - r.left) / zoom, y: shownCam.y + (clientY - r.top) / zoom };
    },
    [shownCam, zoom],
  );
  const toView = useCallback((x: number, y: number) => ({ x: (x - shownCam.x) * zoom, y: (y - shownCam.y) * zoom }), [shownCam, zoom]);
  const cellAt = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / cell), y: Math.floor(p.y / cell) });

  // Tool keys + space-to-pan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || useUI.getState().playing) return;
      if (e.code === 'Space') {
        setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (hit) setUI({ tool: hit.id });
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const edit = editorStore.getState().edit;
  const select = editorStore.getState().select;

  /** Scene point under the pointer, measured from where the press started (stable even if the canvas moved on screen). */
  const dragPoint = (e: React.PointerEvent) => {
    const d = down.current;
    return d ? { x: d.x + (e.clientX - d.cx) / zoom, y: d.y + (e.clientY - d.cy) / zoom } : toScene(e.clientX, e.clientY);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (playing) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toScene(e.clientX, e.clientY);
    down.current = { cx: e.clientX, cy: e.clientY, x: p.x, y: p.y };
    setCursor(p);
    if (e.button === 1 || e.button === 2 || spaceHeld) {
      setDrag({ mode: 'pan', sx: e.clientX, sy: e.clientY, cam });
      return;
    }
    const handle = (e.target as HTMLElement).dataset.handle;
    if (handle && selectedIds.length === 1 && !readOnly) {
      const o = scene.objects.find((x) => x.id === selectedIds[0]);
      const k = project.kinds.find((x) => x.id === o?.kindId);
      if (o) {
        const b = objectBox(o, k);
        setDrag(handle === 'rotate' ? { mode: 'rotate', id: o.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : { mode: 'resize', sx: p.x, sy: p.y, id: o.id, w: b.w, h: b.h });
      }
      return;
    }
    if (tool === 'select') {
      const hit = objectAt(project, scene, p.x, p.y);
      if (hit) {
        let ids = selectedIds;
        if (e.shiftKey) ids = ids.includes(hit) ? ids.filter((x) => x !== hit) : [...ids, hit];
        else if (!ids.includes(hit)) ids = [hit];
        select(ids.map((id) => ({ kind: 'object', id })));
        if (!readOnly && ids.includes(hit)) setDrag({ mode: 'move', sx: p.x, sy: p.y, ids });
      } else {
        if (!e.shiftKey) select([]);
        setDrag({ mode: 'marquee', sx: p.x, sy: p.y });
      }
      return;
    }
    if (readOnly) return;
    if (tool === 'rect') {
      const c = cellAt(p);
      setDrag({ mode: 'rect', from: c, to: c });
      return;
    }
    if (tool === 'brush' || tool === 'erase') {
      const c = cellAt(p);
      setDrag({ mode: 'paint', erase: tool === 'erase', last: c, cells: new Map([[`${c.x},${c.y}`, c]]) });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = dragPoint(e);
    setCursor(p);
    if (!drag) return;
    if (drag.mode === 'pan') setCam({ x: drag.cam.x - (e.clientX - drag.sx) / zoom, y: drag.cam.y - (e.clientY - drag.sy) / zoom });
    else if (drag.mode === 'paint') {
      const c = cellAt(p);
      const cells = new Map(drag.cells);
      for (const x of ops.lineCells(drag.last, c)) cells.set(`${x.x},${x.y}`, x);
      setDrag({ ...drag, last: c, cells });
    } else if (drag.mode === 'rect') setDrag({ ...drag, to: cellAt(p) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = dragPoint(e);
    down.current = null;
    const d = drag;
    setDrag(null);
    if (!d) return;
    const sid = scene.id;
    switch (d.mode) {
      case 'move': {
        const dx = p.x - d.sx;
        const dy = p.y - d.sy;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) edit(d.ids.length > 1 ? `Move ${d.ids.length} objects` : 'Move object', (dr) => ops.moveObjects(dr, sid, d.ids, dx, dy, grid));
        break;
      }
      case 'marquee': {
        const r = { x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) };
        if (r.w > 2 || r.h > 2) {
          const ids = ops.objectsInRect(project, sid, r);
          const keep = e.shiftKey ? selectedIds : [];
          select([...new Set([...keep, ...ids])].map((id) => ({ kind: 'object', id })));
        }
        break;
      }
      case 'resize': {
        const o = scene.objects.find((x) => x.id === d.id);
        const k = project.kinds.find((x) => x.id === o?.kindId);
        if (!o || !k) break;
        const w = Math.max(4, ops.snapValue(d.w + p.x - d.sx, grid));
        const h = Math.max(4, ops.snapValue(d.h + p.y - d.sy, grid));
        edit('Resize object', (dr) => ops.setObjectTransform(dr, sid, d.id, { scaleX: w / k.size.w, scaleY: h / k.size.h }));
        break;
      }
      case 'rotate': {
        let deg = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
        if (snap || e.shiftKey) deg = Math.round(deg / 15) * 15;
        edit('Rotate object', (dr) => ops.setObjectTransform(dr, sid, d.id, { rotation: deg }));
        break;
      }
      case 'paint': {
        const cells = [...d.cells.values()];
        if (!scene.tileLayer.tileSetId && !d.erase) {
          toast('Pick a tile set in the Tiles tab first.');
          break;
        }
        edit(d.erase ? 'Erase tiles' : 'Paint tiles', (dr) => (d.erase ? ops.eraseTiles(dr, sid, cells) : ops.paintTiles(dr, sid, cells, tileIndex)));
        break;
      }
      case 'rect': {
        if (!scene.tileLayer.tileSetId) {
          toast('Pick a tile set in the Tiles tab first.');
          break;
        }
        const cells = ops.rectCells(d.from, d.to);
        edit('Fill tiles', (dr) => ops.paintTiles(dr, sid, cells, tileIndex));
        break;
      }
      case 'pan':
        break;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const before = toScene(e.clientX, e.clientY);
      const z = Math.min(4, Math.max(0.15, zoom * Math.exp(-e.deltaY * 0.0025)));
      const r = viewport.current!.getBoundingClientRect();
      setZoom(z);
      setCam({ x: before.x - (e.clientX - r.left) / z, y: before.y - (e.clientY - r.top) / z });
    } else setCam((c) => ({ x: c.x + e.deltaX / zoom, y: c.y + e.deltaY / zoom }));
  };

  // Ctrl/⌘-wheel must not zoom the whole page.
  useEffect(() => {
    const el = viewport.current!;
    const stop = (e: WheelEvent) => (e.ctrlKey || e.metaKey) && e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const payload = readDragPayload(e);
    if (!payload || readOnly) return;
    const handler = DROP_HANDLERS[payload.type];
    if (!handler) return;
    const ids = handler(payload, toScene(e.clientX, e.clientY), { project, sceneId: scene.id, snap: grid });
    if (ids && ids.length) {
      select(ids.map((id) => ({ kind: 'object', id })));
      setUI({ tool: 'select', rightTab: 'inspect' });
    }
  };

  const fit = () => {
    const z = Math.min(size.w / (scene.width + 64), size.h / (scene.height + 64), 2);
    setZoom(z);
    setCam({ x: -(size.w / z - scene.width) / 2, y: -(size.h / z - scene.height) / 2 });
  };

  const kinds = new Map(project.kinds.map((k) => [k.id, k]));
  const sceneTL = toView(0, 0);
  const screen = project.settings;
  const sel = selectedIds.map((id) => scene.objects.find((o) => o.id === id)).filter((o) => !!o);
  const moveDelta = drag?.mode === 'move' && cursor ? { x: cursor.x - drag.sx, y: cursor.y - drag.sy } : null;
  const ghost =
    drag?.mode === 'rect'
      ? [{ x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y), w: Math.abs(drag.to.x - drag.from.x) + 1, h: Math.abs(drag.to.y - drag.from.y) + 1 }]
      : drag?.mode === 'paint'
        ? [...drag.cells.values()].slice(0, 600).map((c) => ({ x: c.x, y: c.y, w: 1, h: 1 }))
        : (tool === 'brush' || tool === 'erase' || tool === 'rect') && cursor
          ? [{ ...cellAt(cursor), w: 1, h: 1 }]
          : [];
  const vpClass = `viewport ${drag?.mode === 'pan' || spaceHeld ? 'pan' : tool !== 'select' ? 'paint' : ''}`;

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Canvas tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={`btn small ${tool === t.id ? 'on' : ''}`} onClick={() => setUI({ tool: t.id, ...(t.id !== 'select' ? { leftTab: 'tiles' } : {}) })} title={t.title} data-tour={`tool-${t.id}`}>
            {t.label}
          </button>
        ))}
        <span className="sep" style={{ width: 1.5, height: 20, background: 'var(--line)' }} />
        <label className="row" title="Line things up with the tile grid">
          <input type="checkbox" checked={snap} onChange={(e) => setUI({ snap: e.target.checked })} /> Snap to grid
        </label>
        {sel.length > 0 && tool === 'select' && !readOnly && (
          <>
            <span className="grow" />
            <span className="muted">{sel.length} selected</span>
            <button className="btn small" onClick={() => edit('Bring to front', (d) => ops.layerObjects(d, scene.id, selectedIds, 'front'))}>
              Bring to front
            </button>
            <button className="btn small" onClick={() => edit('Send to back', (d) => ops.layerObjects(d, scene.id, selectedIds, 'back'))}>
              Send to back
            </button>
            <button
              className="btn small"
              onClick={() => {
                let ids: string[] = [];
                edit('Duplicate', (d) => void (ids = ops.duplicateObjects(d, scene.id, selectedIds)));
                select(ids.map((id) => ({ kind: 'object', id })));
              }}
            >
              Duplicate
            </button>
            <button
              className="btn small danger"
              onClick={() => {
                edit(selectedIds.length > 1 ? `Delete ${selectedIds.length} objects` : 'Delete object', (d) => ops.deleteObjects(d, scene.id, selectedIds));
                select([]);
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
      <div
        ref={viewport}
        className={vpClass}
        data-testid="scene-canvas"
        data-tour="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag && setCursor(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div ref={host} style={{ position: 'absolute', inset: 0 }} />
        <div className="overlay">
          {/* Outside the scene is dimmed; the scene edge is outlined. */}
          <div style={{ position: 'absolute', left: sceneTL.x, top: sceneTL.y, width: scene.width * zoom, height: scene.height * zoom, boxShadow: '0 0 0 2px #ffffff40, 0 0 0 99999px #15131cc0' }} />
          {(snap || tool !== 'select') && (
            <div
              style={{
                position: 'absolute', left: sceneTL.x, top: sceneTL.y, width: scene.width * zoom, height: scene.height * zoom, opacity: 0.35,
                backgroundImage: 'linear-gradient(#ffffff30 1px, transparent 1px), linear-gradient(90deg, #ffffff30 1px, transparent 1px)',
                backgroundSize: `${cell * zoom}px ${cell * zoom}px`,
              }}
            />
          )}
          <div className="screen-frame" style={{ left: sceneTL.x, top: sceneTL.y, width: screen.screenWidth * zoom, height: screen.screenHeight * zoom }}>
            <span>Screen ({screen.screenWidth}×{screen.screenHeight})</span>
          </div>
          {ghost.map((g, i) => {
            const v = toView(g.x * cell, g.y * cell);
            return <div key={i} className="tile-ghost" style={{ left: v.x, top: v.y, width: g.w * cell * zoom, height: g.h * cell * zoom, borderColor: tool === 'erase' ? 'var(--rose)' : undefined }} />;
          })}
          {sel.map((o) => {
            const b = objectBox(o, kinds.get(o.kindId));
            const v = toView(b.x + (moveDelta?.x ?? 0), b.y + (moveDelta?.y ?? 0));
            const w = b.w * zoom;
            const h = b.h * zoom;
            return (
              <div key={o.id} className="sel-box" style={{ left: v.x - 2, top: v.y - 2, width: w + 4, height: h + 4, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined }}>
                {sel.length === 1 && !readOnly && !moveDelta && (
                  <>
                    <div className="handle" data-handle="resize" style={{ right: -7, bottom: -7, cursor: 'nwse-resize' }} title="Drag to resize" />
                    <div className="handle rot-handle" data-handle="rotate" style={{ left: '50%', top: -22, marginLeft: -6, cursor: 'grab' }} title="Drag to rotate" />
                  </>
                )}
              </div>
            );
          })}
          {drag?.mode === 'marquee' && cursor && (
            <div
              className="marquee"
              style={{
                left: Math.min(toView(drag.sx, 0).x, toView(cursor.x, 0).x), top: Math.min(toView(0, drag.sy).y, toView(0, cursor.y).y),
                width: Math.abs(cursor.x - drag.sx) * zoom, height: Math.abs(cursor.y - drag.sy) * zoom,
              }}
            />
          )}
          {CANVAS_OVERLAYS.map((O, i) => (
            <O key={i} project={project} scene={scene} lib={lib} toView={toView} zoom={zoom} />
          ))}
        </div>
        {scene.objects.length === 0 && Object.keys(scene.tileLayer.cells).length === 0 && !playing && (
          <div className="empty" style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', background: '#15131ce0', maxWidth: 380, pointerEvents: 'none' }}>
            Drag art from the <b>Art</b> tab onto the scene, or paint ground with the <b>Paint</b> tool.
          </div>
        )}
        <div className="zoomer">
          <button className="btn small ghost" onClick={() => setZoom((z) => Math.max(0.15, z / 1.25))} aria-label="Zoom out">
            −
          </button>
          <span style={{ minWidth: 44, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
          <button className="btn small ghost" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} aria-label="Zoom in">
            ＋
          </button>
          <button className="btn small ghost" onClick={fit} title="Show the whole scene">
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
