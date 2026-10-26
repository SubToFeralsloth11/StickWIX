import type { Action, ActionType, Condition, Trigger, TriggerType } from './schema';

const U = { unset: true as const };
const T = { t: 'unset' as const };

export interface Template<T> {
  label: string;
  /** One-line plain-English help (FR-038). */
  help: string;
  make: () => T;
}

/** Every trigger type with its menu label, help and a fresh value whose blanks are unset (FR-016). */
export const TRIGGERS: Record<TriggerType, Template<Trigger>> = {
  sceneStart: { label: 'the scene starts', help: 'Runs once, right when this scene begins.', make: () => ({ type: 'sceneStart' }) },
  every: { label: 'every … seconds', help: 'Runs again and again, with this many seconds in between.', make: () => ({ type: 'every', seconds: { lit: 1 } }) },
  after: { label: '… seconds have passed', help: 'Runs once, this many seconds after the scene starts.', make: () => ({ type: 'after', seconds: { lit: 3 } }) },
  key: { label: 'a key is pressed', help: 'Runs when a key goes down, is held, or comes back up.', make: () => ({ type: 'key', key: U, mode: 'pressed' }) },
  clicked: { label: 'something is clicked', help: 'Runs when the player clicks an object or a button.', make: () => ({ type: 'clicked', target: T }) },
  touches: { label: 'something touches something', help: 'Runs the moment two things start touching.', make: () => ({ type: 'touches', a: T, b: T }) },
  valueChanges: { label: 'a value changes', help: 'Runs whenever a value goes up, down or is set.', make: () => ({ type: 'valueChanges', value: U }) },
  valueReaches: { label: 'a value reaches an amount', help: 'Runs when a value gets to an amount, from above or below.', make: () => ({ type: 'valueReaches', value: U, amount: { lit: 10 } }) },
  created: { label: 'something is created', help: 'Runs when a new object appears during the game.', make: () => ({ type: 'created', target: T }) },
  destroyed: { label: 'something is destroyed', help: 'Runs when an object disappears.', make: () => ({ type: 'destroyed', target: T }) },
  leavesScene: { label: 'something leaves the scene', help: 'Runs when an object goes far off the edge of the scene.', make: () => ({ type: 'leavesScene', target: T }) },
  sticker: { label: 'a sticker event happens', help: 'Runs when a sticker reports something, like "is collected" or "runs out of health".', make: () => ({ type: 'sticker', target: T, event: 'collected' }) },
};

/** Condition types (FR-017). */
export const CONDITIONS: Record<Condition['type'], Template<Condition>> = {
  compare: { label: 'a value is …', help: 'Checks a value against an amount, like "Coins is at least 10".', make: () => ({ type: 'compare', value: U, op: 'ge', to: { lit: 1 } }) },
  count: { label: 'there are … left', help: 'Counts how many objects of a Kind are in the scene.', make: () => ({ type: 'count', kindId: U, op: 'eq', amount: { lit: 0 } }) },
  keyHeld: { label: 'a key is held', help: 'Checks that a key is being held down right now.', make: () => ({ type: 'keyHeld', key: U }) },
  touching: { label: 'something is touching something', help: 'Checks that two things are touching right now.', make: () => ({ type: 'touching', a: T, b: T }) },
  chance: { label: 'a random chance', help: 'Only happens some of the time, like a dice roll.', make: () => ({ type: 'chance', percent: { lit: 50 } }) },
};

/** Action types (FR-018). */
export const ACTIONS: Record<ActionType, Template<Action>> = {
  changeValue: { label: 'change a value', help: 'Adds to, takes away from, or sets a value like Score.', make: () => ({ type: 'changeValue', value: U, op: 'add', amount: { lit: 1 } }) },
  destroy: { label: 'make something disappear', help: 'Removes an object from the game.', make: () => ({ type: 'destroy', target: T }) },
  create: { label: 'create an object', help: 'Makes a new object appear somewhere.', make: () => ({ type: 'create', kindId: U, place: { atTarget: { t: 'unset' } } }) },
  moveTo: { label: 'move something to a place', help: 'Puts an object at a spot, or where another object is.', make: () => ({ type: 'moveTo', target: T, to: { at: { x: { lit: 0 }, y: { lit: 0 } } } }) },
  moveBy: { label: 'move something by a bit', help: 'Shifts an object by some pixels.', make: () => ({ type: 'moveBy', target: T, by: { x: { lit: 32 }, y: { lit: 0 } } }) },
  setSpeed: { label: 'set a speed', help: 'Makes an object move at a speed (pixels per second, sideways and down).', make: () => ({ type: 'setSpeed', target: T, speed: { x: { lit: 100 }, y: { lit: 0 } } }) },
  push: { label: 'push something', help: 'Gives an object a shove in a direction.', make: () => ({ type: 'push', target: T, direction: 'up', strength: { lit: 5 } }) },
  show: { label: 'show something', help: 'Makes a hidden object or screen item appear.', make: () => ({ type: 'show', target: T }) },
  hide: { label: 'hide something', help: 'Makes an object or screen item invisible (it stays in the game).', make: () => ({ type: 'hide', target: T }) },
  changeLook: { label: 'change a look', help: 'Swaps the picture of an object.', make: () => ({ type: 'changeLook', target: T, assetId: U }) },
  animate: { label: 'play an animation', help: 'Plays the frames of a look at a speed.', make: () => ({ type: 'animate', target: T, assetId: U, fps: { lit: 8 }, loop: true }) },
  showText: { label: 'show a message', help: 'Shows big text on the screen for a few seconds.', make: () => ({ type: 'showText', text: 'Well done!', seconds: { lit: 2 } }) },
  playSound: { label: 'play a sound', help: 'Plays a sound effect.', make: () => ({ type: 'playSound', assetId: U }) },
  wait: { label: 'wait', help: 'Pauses this rule for a moment before the next action.', make: () => ({ type: 'wait', seconds: { lit: 1 } }) },
  changeScene: { label: 'go to another scene', help: 'Switches to another level or screen. Values are kept.', make: () => ({ type: 'changeScene', sceneId: U }) },
  restartScene: { label: 'restart the scene', help: 'Starts this scene again from the beginning.', make: () => ({ type: 'restartScene' }) },
  shakeCamera: { label: 'shake the screen', help: 'Wobbles the screen for a moment, great for hits and explosions.', make: () => ({ type: 'shakeCamera', seconds: { lit: 0.4 } }) },
};
