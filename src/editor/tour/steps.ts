import { ruleStates } from '@/model/references';
import type { Project } from '@/model/schema';

/** What tour steps can look at to decide they are done. */
export interface TourContext {
  project: Project | null;
  playing: boolean;
  /** Rules added through Show-me since the tour started. */
  showMeRules: number;
  rightTab: string;
  leftTab: string;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the element to highlight (may depend on where the user is). */
  target: (ctx: TourContext) => string;
  /** The step is finished when this holds; the tour only moves on then (US7 #1). */
  done: (ctx: TourContext) => boolean;
  /** Which of the four ideas this step teaches. */
  teaches?: 'preset' | 'sticker' | 'rule' | 'showme';
}

const start = (p: Project) => p.scenes.find((s) => s.id === p.startSceneId) ?? p.scenes[0]!;
const placedKinds = (p: Project) => new Set(start(p).objects.map((o) => o.kindId));
const kindsWith = (p: Project, type: string) => p.kinds.filter((k) => placedKinds(p).has(k.id) && k.stickers.some((s) => s.type === type));

function solidTiles(p: Project): number {
  const s = start(p);
  const ts = p.tileSets.find((t) => t.id === s.tileLayer.tileSetId);
  if (!ts) return 0;
  return Object.values(s.tileLayer.cells).filter((i) => ts.solid[i] || ts.oneWay[i]).length;
}

/** The guided first game: a tiny platformer using a preset, a sticker, a sentence rule and Show-me (FR-037). */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'ground',
    title: 'Paint the ground',
    body: 'Pick "Fill box", choose a solid tile (marked ■) in the Tiles tab, then drag across the bottom of the scene. Paint at least 6 tiles.',
    target: (c) => (c.leftTab === 'tiles' ? '[data-tour="canvas"]' : '[data-tour="tool-rect"]'),
    done: (c) => !!c.project && solidTiles(c.project) >= 6,
  },
  {
    id: 'hero',
    title: 'Add a hero from Presets',
    body: 'Open the Presets tab and drag the "Platformer Hero" onto the scene, just above your ground. Presets come ready to play.',
    target: (c) => (c.leftTab === 'presets' ? '[data-tour="canvas"]' : '[data-tour="tab-presets"]'),
    done: (c) => !!c.project && kindsWith(c.project, 'platformer').length > 0,
    teaches: 'preset',
  },
  {
    id: 'coin',
    title: 'Add a coin',
    body: 'Open the Art tab and drag a Coin onto the scene, somewhere the hero can reach.',
    target: (c) => (c.leftTab === 'art' ? '[data-tour="art-panel"]' : '[data-tour="tab-art"]'),
    done: (c) => !!c.project && c.project.kinds.some((k) => placedKinds(c.project!).has(k.id) && (k.lookId ?? '').includes('coin')),
  },
  {
    id: 'sticker',
    title: 'Stick on a sticker',
    body: 'With the coin selected, press "Add a sticker" and choose Collectible. Now the hero can pick it up.',
    target: (c) => (c.rightTab === 'inspect' ? '[data-tour="add-sticker"]' : '[data-tour="tab-inspect"]'),
    done: (c) => !!c.project && kindsWith(c.project, 'collectible').length > 0,
    teaches: 'sticker',
  },
  {
    id: 'rule',
    title: 'Write a sentence rule',
    body: 'Open Rules, press "New rule", pick "a sticker event happens", then "change a value". Click the yellow blanks: When any Coin is collected → Score goes up by 1 (use "New value…" to make Score).',
    target: (c) => (c.rightTab === 'rules' ? '[data-tour="rules-panel"]' : '[data-tour="tab-rules"]'),
    done: (c) => {
      if (!c.project) return false;
      const states = ruleStates(c.project);
      return [...c.project.rules, ...c.project.scenes.flatMap((s) => s.rules), ...c.project.kinds.flatMap((k) => k.rules)].some(
        (r) => states.get(r.id)?.state === 'ok' && r.actions.some((a) => a.type === 'changeValue'),
      );
    },
    teaches: 'rule',
  },
  {
    id: 'play',
    title: 'Play it!',
    body: 'Press Play. Run with the arrow keys and jump with Space. Grab the coin!',
    target: () => '[data-tour="play"]',
    done: (c) => c.playing,
  },
  {
    id: 'showme',
    title: 'Teach a rule with Show-me',
    body: 'While playing, press F2 (or "Show me"). Pick something that just happened, like "Space was pressed", show what should happen (pick a sound or press + on a value), then press "Add this rule".',
    target: (c) => (c.playing ? '[data-tour="show-me"]' : '[data-tour="play"]'),
    done: (c) => c.showMeRules > 0,
    teaches: 'showme',
  },
  {
    id: 'finish',
    title: 'You made a game!',
    body: 'Press Stop to get back to editing. Your new rule is in the Rules tab. Keep adding things, and use Help to see this tour again.',
    target: (c) => (c.playing ? '[data-tour="stop"]' : '[data-tour="rules-panel"], [data-tour="tab-rules"]'),
    done: (c) => !c.playing,
  },
];

/** Moves past every finished step, but never skips one that isn't done. */
export function advance(steps: readonly TourStep[], index: number, ctx: TourContext): number {
  let i = index;
  while (i < steps.length && steps[i]!.done(ctx)) i++;
  return i;
}
