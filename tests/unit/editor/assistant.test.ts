import { describe, expect, it } from 'vitest';
import { askAssistant } from '@/editor/help/assistant/Assistant';
import { analyse, editDistance } from '@/editor/help/assistant/nlp';

/** Real ways people ask, including typos and kid spelling; the top answer must be the right recipe. */
const CASES: [string, string][] = [
  ['when im holding on somthing for some amount of time it breaks', 'hold-break'],
  ['how do i make blocks break when i hold click like minecraft', 'hold-break'],
  ['minning dirt blocks', 'hold-break'],
  ['i cant animate my drawing and when i do they allways play', 'stop-autoplay'],
  ['i want diffrent animations for diffrent things', 'named-animations'],
  ['walk animation when moving and jump animation in the air', 'named-animations'],
  ['cursor lock when i click a button', 'cursor-lock'],
  ['lock the mouse like an fps', 'cursor-lock'],
  ['custom cusor', 'custom-cursor'],
  ['change the mouse pointer to a crosshair', 'custom-cursor'],
  ['right click to place a block on the grid', 'place-block'],
  ['build blocks where i click', 'place-block'],
  ['make a start button that goes to level 1', 'button-click'],
  ['double jump', 'double-jump'],
  ['jump twice in the air', 'double-jump'],
  ['health bar above enemy', 'health-bar'],
  ['countdown timer 60 seconds', 'timer'],
  ['scroll wheel to pick a block in the hotbar', 'mouse-wheel-hotbar'],
  ['blocks connected by glowing lines', 'block-board'],
  ['node editor for rules', 'block-board'],
  ['shoot bullets at the mouse', 'aim-at-mouse'],
  ['enemy chases the player', 'enemies'],
  ['speech bubble above npc', 'say-bubble'],
  ['explosion particles', 'particles'],
  ['zoom the camera in', 'camera'],
  ['pause the game when pressing p', 'pause'],
  ['if not touching the ground', 'not-condition'],
  ['tell other rules something happened', 'messages'],
  ['random number between 1 and 6', 'maths'],
  ['dig tiles in a terraria game', 'tiles-world'],
  ['object follows my mouse', 'follow-mouse'],
  ['animals walk around randomly', 'wander'],
  ['make the game full screen', 'slowmo-fullscreen'],
  ['share my game with friends', 'export'],
  ['lava kills you', 'hazard'],
  ['save high score', 'score'],
  ['cursor goes outside the game', 'cursor-lock'],
  ['sword swing animation when i press x', 'named-animations'],
  ['door to the next level', 'scenes'],
];

describe('"How do I…?" assistant', () => {
  it.each(CASES)('%s → %s', (q, id) => {
    expect(askAssistant(q)[0]?.id).toBe(id);
  });

  it('folds phrases and synonyms into shared concepts', () => {
    expect(analyse('press and hold to dig')).toEqual(['hold', 'break']);
    expect(analyse('mouse pointer')).toEqual(['cursor']);
  });

  it('measures typos with adjacent swaps as one edit', () => {
    expect(editDistance('cusor', 'cursor')).toBe(1);
    expect(editDistance('curosr', 'cursor')).toBe(1);
  });

  it('gives nothing for empty or meaningless questions', () => {
    expect(askAssistant('')).toEqual([]);
    expect(askAssistant('how do i')).toEqual([]);
  });
});
