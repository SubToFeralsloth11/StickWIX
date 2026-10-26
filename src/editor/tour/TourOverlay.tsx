import { useEffect, useLayoutEffect, useState } from 'react';
import { useEditor } from '../store';
import { useUI } from '../ui-state';
import { advance, TOUR_STEPS, type TourContext } from './steps';
import { endTour, setTourStep, useTour } from './tour-state';

/**
 * Highlights the exact element the current step needs and moves on only when
 * the user has done it (US7 #1). Skippable; restartable from Help.
 */
export function TourOverlay() {
  const project = useEditor((s) => s.project);
  const { playing, rightTab, leftTab } = useUI();
  const { projectId, step, showMeRules } = useTour();
  const active = !!project && projectId === project.id;
  const ctx: TourContext = { project, playing, showMeRules, rightTab, leftTab };
  const next = active ? advance(TOUR_STEPS, step, ctx) : step;
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (active && next !== step) {
      if (next >= TOUR_STEPS.length) void endTour();
      else setTourStep(next);
    }
  }, [active, next, step]);

  const current = active ? TOUR_STEPS[Math.min(next, TOUR_STEPS.length - 1)] : undefined;
  const selector = current?.target(ctx);

  // Follow the target element as panels open, scroll and resize.
  useLayoutEffect(() => {
    if (!selector) return;
    let raf = 0;
    const tick = () => {
      const el = [...document.querySelectorAll(selector)].find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
      const r = el?.getBoundingClientRect() ?? null;
      setBox((b) => (b && r && b.x === r.x && b.y === r.y && b.width === r.width && b.height === r.height ? b : r));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selector]);

  if (!current) return null;
  const pad = 6;
  // Big targets (the canvas, a panel): sit in their bottom-right corner so the card never hides the toolbars above.
  const big = !!box && box.height > window.innerHeight * 0.4;
  const cardLeft = box ? (big ? Math.max(12, box.right - 340) : Math.min(window.innerWidth - 340, Math.max(12, box.x))) : window.innerWidth / 2 - 160;
  const below = box ? box.bottom + 14 + 200 < window.innerHeight : true;
  const cardTop = box ? (big ? Math.max(12, box.bottom - 230) : below ? box.bottom + 14 : Math.max(12, box.top - 214)) : 80;
  return (
    <>
      {box && <div className="tour-spot" style={{ left: box.x - pad, top: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />}
      <div className="tour-card" role="dialog" aria-label="Guided tour" style={{ left: cardLeft, top: cardTop }} data-testid="tour-card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <small style={{ fontWeight: 800 }}>
            Step {Math.min(next, TOUR_STEPS.length - 1) + 1} of {TOUR_STEPS.length}
          </small>
          <button className="btn small" onClick={() => void endTour()}>
            Skip tour
          </button>
        </div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
      </div>
    </>
  );
}
