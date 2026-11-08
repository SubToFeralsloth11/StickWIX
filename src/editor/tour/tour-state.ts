import { create } from 'zustand';
import { getPref, setPref } from '@/storage/db';

export interface TourState {
  /** The tour is running for this project. */
  projectId: string | null;
  step: number;
  /** Rules added through Show-me since the tour started. */
  showMeRules: number;
  /** The first-launch offer was answered (start or skip). */
  seen: boolean;
  loaded: boolean;
}

const PREF = 'tour';

export const useTour = create<TourState>(() => ({ projectId: null, step: 0, showMeRules: 0, seen: false, loaded: false }));

/** Persists the tour; resolves once written (a failed write only means the offer may show again). */
function save(): Promise<void> {
  const { projectId, step, showMeRules, seen } = useTour.getState();
  return setPref(PREF, { projectId, step, showMeRules, seen }).catch(() => {});
}

export async function loadTour() {
  const saved = (await getPref<Partial<TourState>>(PREF).catch(() => undefined)) ?? {};
  useTour.setState({ projectId: saved.projectId ?? null, step: saved.step ?? 0, showMeRules: saved.showMeRules ?? 0, seen: !!saved.seen, loaded: true });
}

/** Starts (or restarts from Help) the guided build on a project. */
export function startTour(projectId: string): Promise<void> {
  useTour.setState({ projectId, step: 0, showMeRules: 0, seen: true });
  return save();
}

/** Skip or quit: remembered, so the offer doesn't come back; Help can restart it. */
export function endTour(): Promise<void> {
  useTour.setState({ projectId: null, step: 0, showMeRules: 0, seen: true });
  return save();
}

export function setTourStep(step: number) {
  if (useTour.getState().step === step) return;
  useTour.setState({ step });
  void save();
}

export function noteShowMeRule() {
  if (!useTour.getState().projectId) return;
  useTour.setState((s) => ({ showMeRules: s.showMeRules + 1 }));
  void save();
}
