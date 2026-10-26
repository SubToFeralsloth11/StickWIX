import { Rule, type Action, type Condition, type Trigger } from '../../model/schema';
import type { Genre, RulePreset } from '../types';

/**
 * Rule presets (FR-026): common sentences with their key blanks left unset
 * (highlighted in the editor). An inserted copy is `incomplete` until the
 * child fills every blank, then it runs like any other rule.
 */

const U = { unset: true } as const;
const anything = { t: 'unset' } as const;
const lit = (n: number) => ({ lit: n });

function preset(
  id: string,
  name: string,
  genres: Genre[],
  description: string,
  trigger: Trigger,
  actions: Action[],
  conditions: Condition[] = [],
): RulePreset {
  return { id, name, genres, description, rule: Rule.parse({ id: `rule-${id}`, trigger, actions, conditions: { join: 'all', items: conditions } }) };
}

const P: Genre = 'platformer';
const T: Genre = 'topdown';
const C: Genre = 'clicker';

export const RULE_PRESETS: RulePreset[] = [
  preset(
    'collect-points',
    'Collect for points',
    [P, T],
    'When something is collected, add 1 to a value like Score.',
    { type: 'sticker', target: anything, event: 'collected' },
    [{ type: 'changeValue', value: U, op: 'add', amount: lit(1) }],
  ),
  preset(
    'touch-lose-life',
    'Touch to lose a life',
    [P, T],
    'When two things touch, take 1 away from a value like Lives and play an ouch sound.',
    { type: 'touches', a: anything, b: anything },
    [
      { type: 'changeValue', value: U, op: 'subtract', amount: lit(1) },
      { type: 'playSound', assetId: 'builtin:sfx/hurt' },
    ],
  ),
  preset(
    'buy-upgrade',
    'Buy upgrade',
    [C],
    'When a button is clicked and you have enough coins, pay the cost and get 1 more of an upgrade.',
    { type: 'clicked', target: anything },
    [
      { type: 'changeValue', value: U, op: 'subtract', amount: U },
      { type: 'changeValue', value: U, op: 'add', amount: lit(1) },
      { type: 'playSound', assetId: 'builtin:sfx/powerup' },
    ],
    [{ type: 'compare', value: U, op: 'ge', to: U }],
  ),
  preset(
    'reach-flag-win',
    'Reach the flag to win',
    [P, T],
    'When the player touches the flag, cheer, show "You win!" and go to another scene.',
    { type: 'touches', a: anything, b: anything },
    [
      { type: 'playSound', assetId: 'builtin:sfx/win' },
      { type: 'showText', text: 'You win!', seconds: lit(2) },
      { type: 'wait', seconds: lit(2) },
      { type: 'changeScene', sceneId: U },
    ],
  ),
  preset(
    'spawn-every',
    'Spawn every few seconds',
    [P, T, C],
    'Every few seconds, create a new object at a spot you choose.',
    { type: 'every', seconds: U },
    [{ type: 'create', kindId: U, place: { at: { x: U, y: U } } }],
  ),
  preset(
    'game-over',
    'Game over when lives reach 0',
    [P, T],
    'When a value like Lives reaches 0, show "Game over" and go to another scene.',
    { type: 'valueReaches', value: U, amount: lit(0) },
    [
      { type: 'playSound', assetId: 'builtin:sfx/lose' },
      { type: 'showText', text: 'Game over', seconds: lit(2) },
      { type: 'wait', seconds: lit(2) },
      { type: 'changeScene', sceneId: U },
    ],
  ),
  preset(
    'timer-countdown',
    'Timer countdown',
    [P, T, C],
    'Every second, take 1 away from a value like Time left.',
    { type: 'every', seconds: lit(1) },
    [{ type: 'changeValue', value: U, op: 'subtract', amount: lit(1) }],
  ),
  preset(
    'click-score',
    'Click to score',
    [C],
    'When something is clicked, add 1 to a value like Coins.',
    { type: 'clicked', target: anything },
    [{ type: 'changeValue', value: U, op: 'add', amount: lit(1) }],
  ),
  preset(
    'key-sound',
    'Press key to play sound',
    [P, T, C],
    'When a key is pressed, play a sound.',
    { type: 'key', key: U, mode: 'pressed' },
    [{ type: 'playSound', assetId: U }],
  ),
  preset(
    'enemy-points',
    'Enemy defeated gives points',
    [P, T],
    'When an enemy runs out of health, add 10 to a value like Score.',
    { type: 'sticker', target: anything, event: 'outOfHealth' },
    [{ type: 'changeValue', value: U, op: 'add', amount: lit(10) }],
  ),
  preset(
    'fall-restart',
    'Restart when falling off',
    [P],
    'When the player falls out of the scene, start the scene again.',
    { type: 'leavesScene', target: anything },
    [{ type: 'playSound', assetId: 'builtin:sfx/lose' }, { type: 'restartScene' }],
  ),
  preset(
    'start-text',
    'Show text on start',
    [P, T, C],
    'When the scene starts, show a message for a few seconds. Change the words to anything you like.',
    { type: 'sceneStart' },
    [{ type: 'showText', text: 'Ready? Go!', seconds: U }],
  ),
  preset(
    'auto-earn',
    'Earn every second',
    [C],
    'Every second, add an amount (like Auto) to a value like Coins.',
    { type: 'every', seconds: lit(1) },
    [{ type: 'changeValue', value: U, op: 'add', amount: U }],
  ),
  preset(
    'goal-win',
    'Win at a goal',
    [P, T, C],
    'When a value reaches a goal amount, cheer and go to another scene.',
    { type: 'valueReaches', value: U, amount: U },
    [
      { type: 'playSound', assetId: 'builtin:sfx/win' },
      { type: 'showText', text: 'You did it!', seconds: lit(2) },
      { type: 'wait', seconds: lit(2) },
      { type: 'changeScene', sceneId: U },
    ],
  ),
  preset(
    'key-opens',
    'Key opens a door',
    [T, P],
    'When a key is collected, the door disappears.',
    { type: 'sticker', target: anything, event: 'collected' },
    [
      { type: 'destroy', target: anything },
      { type: 'playSound', assetId: 'builtin:sfx/select' },
    ],
  ),
  preset(
    'jump-pad',
    'Jump pad',
    [P],
    'When the player touches a pad, launch them up into the air.',
    { type: 'touches', a: anything, b: anything },
    [
      { type: 'push', target: anything, direction: 'up', strength: lit(9) },
      { type: 'playSound', assetId: 'builtin:sfx/bounce' },
    ],
  ),
];
