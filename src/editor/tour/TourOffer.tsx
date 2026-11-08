import { useEffect } from 'react';
import { putProject } from '@/storage/db';
import { openProject } from '../App';
import { currentManifest, loadManifest } from '../assets/library';
import { blankProject } from '../home/new-project';
import { toast } from '../toast';
import { endTour, loadTour, startTour, useTour } from './tour-state';

/** First launch: offers the skippable guided build (FR-037). */
export function TourOffer() {
  const { loaded, seen } = useTour();
  useEffect(() => {
    void loadTour();
    void loadManifest();
  }, []);
  if (!loaded || seen) return null;
  const start = async () => {
    await loadManifest();
    const p = blankProject('My First Game', currentManifest());
    try {
      await putProject(p);
      await startTour(p.id);
      openProject(p.id);
    } catch {
      toast("This browser won't let StickWIX store games. Try a normal (not private) window.", { error: true });
    }
  };
  return (
    <div className="pcard" style={{ borderColor: 'var(--sun)', marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 16 }} data-testid="tour-offer">
      <div style={{ fontSize: 40 }}>🧭</div>
      <div className="grow">
        <h3>New here? Build your first game with a guide</h3>
        <span className="muted">About 10 minutes: paint a level, add a hero, write a rule, then teach one with Show-me.</span>
      </div>
      <button className="btn primary" onClick={() => void start()} data-testid="start-tour">
        Start the tour
      </button>
      <button className="btn ghost" onClick={() => void endTour()}>
        No thanks
      </button>
    </div>
  );
}
