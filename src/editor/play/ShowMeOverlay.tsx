import { useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '@/model/ids';
import { TRIGGERS } from '@/model/rule-templates';
import type { Trigger } from '@/model/schema';
import { keyName, sentenceText } from '@/model/sentence';
import type { Instance } from '@/runtime/types';
import { describeEvent, worldFacts } from '@/showme/facts';
import { generalise, type Generalised } from '@/showme/generalise';
import { ShowMeSession, type Intent } from '@/showme/session';
import { toRule } from '@/showme/to-rule';
import { FrameImg } from '../assets/AssetBrowser';
import { editorStore } from '../store';
import { addRule } from '../store/rule-ops';
import { setUI } from '../ui-state';
import { toast } from '../toast';
import { noteShowMeRule } from '../tour/tour-state';
import { RESERVED_KEYS, type PlayOverlayProps } from './PlayView';
import { ShowMeConfirm } from './ShowMeConfirm';

type Saved = { inst: Instance; x: number; y: number; hidden: boolean; lookId: string | null };

/**
 * Show-me (US4): freeze Play, pick what just happened, act out what should
 * happen in the frozen world, and get a sentence rule. Acted-out changes are
 * only shown, never applied for real, and are undone when the session ends.
 */
export function ShowMeOverlay({ game, project, lib, scale, stop }: PlayOverlayProps) {
  const key = project.settings.showMeKey || 'F2';
  const [session, setSession] = useState<ShowMeSession | null>(null);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [onlyThis, setOnlyThis] = useState(false);
  const [manual, setManual] = useState<Trigger | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Instance | null>(null);
  const [ghosts, setGhosts] = useState<{ kindId: string; x: number; y: number }[]>([]);
  const saved = useRef(new Map<string, Saved>());
  const drag = useRef<{ inst: Instance; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [overBin, setOverBin] = useState(false);
  const binRef = useRef<HTMLDivElement>(null);
  const world = game.scene.world;
  const cam = game.scene.camera;

  const open = () => {
    if (session) return;
    setSession(new ShowMeSession(game));
    setOnlyThis(false);
    setManual(null);
    setNotice(null);
  };

  const remember = (inst: Instance) => {
    if (!saved.current.has(inst.id)) saved.current.set(inst.id, { inst, x: inst.x, y: inst.y, hidden: inst.hidden, lookId: inst.lookId });
  };
  const revert = () => {
    for (const s of saved.current.values()) Object.assign(s.inst, { x: s.x, y: s.y, hidden: s.hidden, lookId: s.lookId });
    saved.current.clear();
    setGhosts([]);
    game.render();
  };
  const close = () => {
    revert();
    session?.close();
    setSession(null);
    setPicked(null);
  };

  useEffect(() => {
    RESERVED_KEYS.add(key);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      e.preventDefault();
      if (session) close();
      else open();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && session) {
        e.preventDefault(); // keep Escape from also stopping Play
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onEsc, true);
    return () => {
      RESERVED_KEYS.delete(key);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onEsc, true);
    };
  });

  const log = (i: Intent | { what: string }) => {
    session?.log(i);
    if ('what' in i) setNotice(i.what);
    refresh();
  };

  const facts = useMemo(() => worldFacts(world), [world]);
  const gen: Generalised | null = session?.trigger ? generalise(session.trigger.event, facts, onlyThis) : manual ? { trigger: manual, bound: new Map(), canGeneralise: false } : null;
  const rule = session && gen ? toRule(newId('r'), gen.trigger, gen, session.intents, facts) : null;

  const toWorld = (e: React.PointerEvent | React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale + cam.x, y: (e.clientY - r.top) / scale + cam.y };
  };
  const inBin = (e: React.PointerEvent) => {
    const b = binRef.current?.getBoundingClientRect();
    return !!b && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
  };

  const confirm = (thenEdit: boolean) => {
    if (!rule) return;
    const sceneId = game.scene.scene.id;
    let id = '';
    editorStore.getState().edit('Rule from Show-me', (d) => void (id = addRule(d, { type: 'scene', id: sceneId }, rule.trigger, rule.actions[0]!)));
    editorStore.getState().edit('Rule from Show-me', (d) => {
      const r = d.scenes.find((s) => s.id === sceneId)!.rules.find((x) => x.id === id)!;
      r.actions = structuredClone(rule.actions);
    });
    setUI({ focusRuleId: id, rightTab: 'rules' });
    toast('New rule added. It works from the next Play.');
    noteShowMeRule();
    close();
    if (thenEdit) stop();
  };

  if (!session)
    return (
      <div className="play-hud" style={{ top: -46 }}>
        <button className="btn" onClick={open} data-testid="show-me" data-tour="show-me" title={`Freeze the game and show StickWIX what should happen (${keyName(key)})`}>
          ✋ Show me <span className="kbd">{keyName(key)}</span>
        </button>
      </div>
    );

  const values = [
    ...project.values.filter((v) => v.type === 'number').map((v) => ({ def: v, inst: undefined as Instance | undefined })),
    ...(session.trigger ? subjects(session.trigger.event) : []).flatMap((id) => {
      const inst = world.instances.get(id);
      const k = project.kinds.find((x) => x.id === inst?.kindId);
      return (k?.values ?? []).filter((v) => v.type === 'number').map((v) => ({ def: v, inst }));
    }),
  ];
  const pending = (valueId: string, objectId?: string) => {
    const it = session.intents.filter((i): i is Extract<Intent, { type: 'value' }> => i.type === 'value' && i.valueId === valueId && i.objectId === objectId).pop();
    return it;
  };

  return (
    <>
      <div className="showme-frame" />
      {/* Interaction layer over the frozen game: drag things to move them or into the bin. */}
      <div
        style={{ position: 'absolute', inset: 0, cursor: 'grab', zIndex: 8 }}
        data-testid="showme-layer"
        onPointerDown={(e) => {
          if (!session.trigger && !manual) {
            setNotice('First pick what just happened on the right.');
            return;
          }
          const p = toWorld(e);
          const inst = world.topmostAt(p.x, p.y);
          if (!inst) {
            log({ what: 'Tiles and the background can\u2019t be changed by a rule. Drag objects instead.' });
            return;
          }
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          remember(inst);
          drag.current = { inst, ox: p.x - inst.x, oy: p.y - inst.y, sx: e.clientX, sy: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
          if (!d.moved) return;
          const p = toWorld(e);
          d.inst.x = p.x - d.ox;
          d.inst.y = p.y - d.oy;
          setOverBin(inBin(e));
          game.render();
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setOverBin(false);
          if (!d) return;
          if (!d.moved) {
            setPicked(d.inst);
            return;
          }
          if (inBin(e)) {
            const s = saved.current.get(d.inst.id)!;
            Object.assign(d.inst, { x: s.x, y: s.y, hidden: true });
            log({ type: 'destroy', instId: d.inst.id });
          } else log({ type: 'move', instId: d.inst.id, x: d.inst.x, y: d.inst.y });
          game.render();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const kindId = e.dataTransfer.getData('application/x-stickwix-kind');
          const k = project.kinds.find((x) => x.id === kindId);
          if (!k) return;
          const p = toWorld(e);
          const at = { x: p.x - k.size.w / 2, y: p.y - k.size.h / 2 };
          setGhosts((g) => [...g, { kindId, ...at }]);
          log({ type: 'create', kindId, ...at });
        }}
      >
        {ghosts.map((g, i) => {
          const k = project.kinds.find((x) => x.id === g.kindId)!;
          const url = k.lookId ? lib.url(k.lookId) : undefined;
          return (
            <div key={i} style={{ position: 'absolute', left: (g.x - cam.x) * scale, top: (g.y - cam.y) * scale, width: k.size.w * scale, height: k.size.h * scale, opacity: 0.85, outline: '2px dashed var(--mint)' }}>
              {url && <FrameImg url={url} frames={lib.info(k.lookId!)?.frames ?? 1} />}
            </div>
          );
        })}
        {picked && (
          <div className="pop" style={{ position: 'absolute', left: Math.min((picked.x - cam.x + picked.w) * scale, 600), top: (picked.y - cam.y) * scale, zIndex: 9 }} onPointerDown={(e) => e.stopPropagation()}>
            <h6>{project.kinds.find((k) => k.id === picked.kindId)?.name}</h6>
            <button
              className="opt"
              onClick={() => {
                remember(picked);
                const hidden = !picked.hidden;
                picked.hidden = hidden;
                log({ type: 'visibility', instId: picked.id, hidden });
                setPicked(null);
                game.render();
              }}
            >
              {picked.hidden ? 'Show it' : 'Hide it'}
            </button>
            <h6>Change its look</h6>
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {lib.images().filter((i) => i.category !== 'background' && i.category !== 'ui').map((img) => (
                <button
                  key={img.id}
                  className="opt"
                  onClick={() => {
                    remember(picked);
                    picked.lookId = img.id;
                    log({ type: 'look', instId: picked.id, assetId: img.id });
                    setPicked(null);
                    game.render();
                  }}
                >
                  <FrameImg url={img.url} frames={img.frames} />
                  {img.name}
                </button>
              ))}
            </div>
            <button className="btn small" onClick={() => setPicked(null)}>
              Close
            </button>
          </div>
        )}
      </div>
      <div ref={binRef} className={`bin ${overBin ? 'hot' : ''}`} style={{ zIndex: 9 }} title="Drop an object here to make it disappear" data-testid="showme-bin">
        🗑
      </div>

      <div className="showme-side" style={{ position: 'fixed', top: 52, zIndex: 20, width: 360 }} data-testid="showme-panel">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>✋ Show me</h3>
          <button className="btn small" onClick={close}>
            Cancel
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>The game is frozen. Teach it a rule in three steps.</p>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="step-n">1</span>
          <div className="grow">
            <b>What just happened?</b>
            {session.events.length === 0 && !manual && (
              <>
                <p className="muted">Nothing happened in the last 2 seconds. Pick what should start the rule:</p>
                {Object.entries(TRIGGERS).map(([k, t]) => (
                  <button key={k} className="event-row" onClick={() => setManual(t.make())}>
                    When {t.label}
                  </button>
                ))}
              </>
            )}
            {manual && <div className="event-row on">When {Object.values(TRIGGERS).find((t) => t.make().type === manual.type)?.label} (fill in the blanks after)</div>}
            <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 6 }}>
              {session.events.map((ev, i) => (
                <button
                  key={i}
                  className={`event-row ${session.trigger === ev ? 'on' : ''}`}
                  onClick={() => {
                    session.pick(ev);
                    refresh();
                  }}
                  data-testid="showme-event"
                >
                  {describeEvent(ev.event, project, world)}
                  <time>{Math.max(0, game.totalTime - ev.t).toFixed(1)}s ago</time>
                </button>
              ))}
            </div>
          </div>
        </div>

        {(session.trigger || manual) && (
          <div className="row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <span className="step-n">2</span>
            <div className="grow stack">
              <b>Now show what should happen</b>
              <span className="muted" style={{ fontSize: 12.5 }}>Drag things on the game: into the 🗑 to remove them, or to a new spot. Click one to hide it or change its look.</span>
              <div className="section" style={{ marginBottom: 0 }}>
                <h4>Make a new one appear (drag onto the game)</h4>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))' }}>
                  {project.kinds.map((k) => (
                    <div key={k.id} className="tile-btn" draggable onDragStart={(e) => e.dataTransfer.setData('application/x-stickwix-kind', k.id)} title={k.name}>
                      {k.lookId && lib.url(k.lookId) ? <FrameImg url={lib.url(k.lookId)!} frames={lib.info(k.lookId)?.frames ?? 1} /> : '?'}
                    </div>
                  ))}
                </div>
              </div>
              {values.length > 0 && (
                <div className="section" style={{ marginBottom: 0 }}>
                  <h4>Change a value</h4>
                  {values.map(({ def, inst }) => {
                    const cur = Number(game.values.get(def.id, inst) ?? 0);
                    const p = pending(def.id, inst?.id);
                    const next = !p ? cur : p.op === 'set' ? Number(p.amount) : p.op === 'add' ? cur + Number(p.amount) : cur - Number(p.amount);
                    const label = inst ? `that ${project.kinds.find((k) => k.id === inst.kindId)?.name}'s ${def.name}` : def.name;
                    return (
                      <div key={def.id + (inst?.id ?? '')} className="row" style={{ marginBottom: 4 }}>
                        <span className="grow">
                          {label}: <b>{cur}</b>
                          {p && <b style={{ color: 'var(--mint)' }}> → {next}</b>}
                        </span>
                        <button className="btn small" onClick={() => log({ type: 'value', valueId: def.id, objectId: inst?.id, op: 'subtract', amount: 1 })} aria-label={`${label} down`}>
                          −
                        </button>
                        <button className="btn small" onClick={() => log({ type: 'value', valueId: def.id, objectId: inst?.id, op: 'add', amount: 1 })} aria-label={`${label} up`} data-testid={`showme-plus-${def.name}`}>
                          ＋
                        </button>
                        <input
                          className="field"
                          style={{ width: 56 }}
                          type="number"
                          placeholder="set"
                          aria-label={`Set ${label}`}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const n = Number(e.currentTarget.value);
                            if (Number.isFinite(n) && e.currentTarget.value !== '') log({ type: 'value', valueId: def.id, objectId: inst?.id, op: 'set', amount: n });
                            e.currentTarget.value = '';
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="row">
                <select className="field grow" value="" aria-label="Play a sound" onChange={(e) => e.target.value && log({ type: 'sound', assetId: e.target.value })}>
                  <option value="">🔊 Play a sound…</option>
                  {lib.sounds().filter((s) => s.category !== 'music').map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select className="field grow" value="" aria-label="Go to a scene" onChange={(e) => e.target.value && log({ type: 'scene', sceneId: e.target.value })}>
                  <option value="">🎬 Go to scene…</option>
                  {project.scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {notice && (
                <div className="warn" role="status">
                  <p>{notice}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {gen && (
          <div className="row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
            <span className="step-n">3</span>
            <div className="grow">
              <ShowMeConfirm
                sentence={rule ? sentenceText(rule, project, { asset: lib.name }) : null}
                canGeneralise={gen.canGeneralise}
                onlyThis={onlyThis}
                setOnlyThis={setOnlyThis}
                changes={session.intents.length}
                onUndo={() => {
                  const last = session.undo();
                  if (last?.type === 'create') setGhosts((g) => g.slice(0, -1));
                  if (last && 'instId' in last) {
                    const s = saved.current.get(last.instId);
                    if (s && !session.intents.some((i) => 'instId' in i && i.instId === last.instId)) {
                      Object.assign(s.inst, { x: s.x, y: s.y, hidden: s.hidden, lookId: s.lookId });
                      saved.current.delete(last.instId);
                      game.render();
                    }
                  }
                  refresh();
                }}
                onConfirm={() => confirm(false)}
                onEdit={() => confirm(true)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function subjects(e: ShowMeSession['events'][number]['event']): string[] {
  switch (e.type) {
    case 'touch':
      return [e.a, e.b];
    case 'clicked':
      return e.ui ? [] : [e.id];
    case 'created':
    case 'destroyed':
    case 'leavesScene':
    case 'sticker':
      return [e.id];
    case 'valueChanged':
      return e.objectId ? [e.objectId] : [];
    default:
      return [];
  }
}
