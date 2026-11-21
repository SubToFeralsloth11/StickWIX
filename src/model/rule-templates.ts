import type { Action, ActionType, Condition, Trigger, TriggerType } from './schema';

const U = { unset: true as const };
const T = { t: 'unset' as const };

export interface Template<T> {
  label: string;
  /** One-line plain-English help (FR-038). */
  help: string;
  /** Menu section the template is listed under. */
  group: string;
  make: () => T;
}

/** Every trigger type with its menu label, help and a fresh value whose blanks are unset (FR-016). */
export const TRIGGERS: Record<TriggerType, Template<Trigger>> = {
  sceneStart: { group: 'Game', label: 'the scene starts', help: 'Runs once, right when this scene begins.', make: () => ({ type: 'sceneStart' }) },
  everyFrame: { group: 'Game', label: 'every frame (forever)', help: 'Runs 60 times a second, all the time. Like a "forever" loop.', make: () => ({ type: 'everyFrame' }) },
  every: { group: 'Time', label: 'every … seconds', help: 'Runs again and again, with this many seconds in between.', make: () => ({ type: 'every', seconds: { lit: 1 } }) },
  after: { group: 'Time', label: '… seconds have passed', help: 'Runs once, this many seconds after the scene starts.', make: () => ({ type: 'after', seconds: { lit: 3 } }) },
  key: { group: 'Keyboard', label: 'a key is pressed', help: 'Runs when a key goes down, is held, or comes back up.', make: () => ({ type: 'key', key: U, mode: 'pressed' }) },
  clicked: { group: 'Mouse', label: 'something is clicked', help: 'Runs when the player clicks (or right-clicks) an object or a button.', make: () => ({ type: 'clicked', target: T, button: 'left' }) },
  holdOn: { group: 'Mouse', label: 'something is held down for … seconds', help: 'Runs when the mouse is held on an object long enough, like mining a block.', make: () => ({ type: 'holdOn', target: T, seconds: { lit: 1 }, button: 'left' }) },
  letGo: { group: 'Mouse', label: 'something is let go', help: 'Runs when the mouse button comes up after pressing on an object.', make: () => ({ type: 'letGo', target: T }) },
  hover: { group: 'Mouse', label: 'the mouse moves onto something', help: 'Runs when the mouse pointer moves onto (or off) an object.', make: () => ({ type: 'hover', target: T, mode: 'enter' }) },
  mouse: { group: 'Mouse', label: 'a mouse button is pressed', help: 'Runs when a mouse button goes down, is held, or comes up, anywhere.', make: () => ({ type: 'mouse', button: 'left', mode: 'pressed' }) },
  wheel: { group: 'Mouse', label: 'the mouse wheel turns', help: 'Runs when the mouse wheel scrolls up or down, great for picking items.', make: () => ({ type: 'wheel', direction: 'up' }) },
  touches: { group: 'Objects', label: 'something touches something', help: 'Runs the moment two things start touching.', make: () => ({ type: 'touches', a: T, b: T }) },
  stopsTouching: { group: 'Objects', label: 'something stops touching something', help: 'Runs the moment two things stop touching.', make: () => ({ type: 'stopsTouching', a: T, b: T }) },
  created: { group: 'Objects', label: 'something is created', help: 'Runs when a new object appears during the game.', make: () => ({ type: 'created', target: T }) },
  destroyed: { group: 'Objects', label: 'something is destroyed', help: 'Runs when an object disappears.', make: () => ({ type: 'destroyed', target: T }) },
  leavesScene: { group: 'Objects', label: 'something leaves the scene', help: 'Runs when an object goes far off the edge of the scene.', make: () => ({ type: 'leavesScene', target: T }) },
  animEnds: { group: 'Objects', label: 'an animation finishes', help: 'Runs when an animation that plays once reaches its last frame.', make: () => ({ type: 'animEnds', target: T }) },
  sticker: { group: 'Objects', label: 'a sticker event happens', help: 'Runs when a sticker reports something, like "is collected" or "is broken".', make: () => ({ type: 'sticker', target: T, event: 'collected' }) },
  valueChanges: { group: 'Values', label: 'a value changes', help: 'Runs whenever a value goes up, down or is set.', make: () => ({ type: 'valueChanges', value: U }) },
  valueReaches: { group: 'Values', label: 'a value reaches an amount', help: 'Runs when a value gets to an amount, from above or below.', make: () => ({ type: 'valueReaches', value: U, amount: { lit: 10 } }) },
  message: { group: 'Messages', label: 'a message is sent', help: 'Runs when another rule sends this message. Lets rules talk to each other.', make: () => ({ type: 'message', name: U }) },
  becomes: { group: 'Checks', label: 'something becomes true', help: 'Runs the moment a check turns true, like "Hero is closer than 100 to Enemy".', make: () => ({ type: 'becomes', cond: { type: 'distance', a: T, b: T, op: 'lt', amount: { lit: 100 } } }) },
  whileTrue: { group: 'Checks', label: 'every frame while something is true', help: 'Runs 60 times a second for as long as a check stays true.', make: () => ({ type: 'whileTrue', cond: { type: 'mouseDown', button: 'left' } }) },
};

/** Condition types (FR-017). */
export const CONDITIONS: Record<Condition['type'], Template<Condition>> = {
  compare: { group: 'Values', label: 'a value is …', help: 'Checks a value against an amount, like "Coins is at least 10".', make: () => ({ type: 'compare', value: U, op: 'ge', to: { lit: 1 } }) },
  numCompare: { group: 'Values', label: 'a number is … (anything)', help: 'Compares any two numbers: positions, speeds, the mouse, maths...', make: () => ({ type: 'numCompare', a: { prop: { of: T, p: 'y' } }, op: 'gt', b: { lit: 100 } }) },
  count: { group: 'Objects', label: 'there are … left', help: 'Counts how many objects of a Kind are in the scene.', make: () => ({ type: 'count', kindId: U, op: 'eq', amount: { lit: 0 } }) },
  touching: { group: 'Objects', label: 'something is touching something', help: 'Checks that two things are touching right now.', make: () => ({ type: 'touching', a: T, b: T }) },
  distance: { group: 'Objects', label: 'something is near something', help: 'Checks how far apart two objects are, in pixels.', make: () => ({ type: 'distance', a: T, b: T, op: 'lt', amount: { lit: 100 } }) },
  onGround: { group: 'Objects', label: 'something is on the ground', help: 'Checks that an object is standing on something.', make: () => ({ type: 'onGround', target: T }) },
  visible: { group: 'Objects', label: 'something can be seen', help: 'Checks that an object is not hidden.', make: () => ({ type: 'visible', target: T }) },
  exists: { group: 'Objects', label: 'something is in the scene', help: 'Checks that an object (or one of a Kind) is still around.', make: () => ({ type: 'exists', target: T }) },
  playing: { group: 'Objects', label: 'something is playing an animation', help: 'Checks which animation an object is playing.', make: () => ({ type: 'playing', target: T, anim: U }) },
  tileAt: { group: 'Objects', label: 'a tile is solid or empty', help: 'Checks the tile at a spot, like "is there a block under the mouse".', make: () => ({ type: 'tileAt', place: { atMouse: { snap: { lit: 0 } } }, solid: false }) },
  keyHeld: { group: 'Keyboard', label: 'a key is held', help: 'Checks that a key is being held down right now.', make: () => ({ type: 'keyHeld', key: U }) },
  mouseDown: { group: 'Mouse', label: 'a mouse button is held', help: 'Checks that a mouse button is down right now.', make: () => ({ type: 'mouseDown', button: 'left' }) },
  mouseOver: { group: 'Mouse', label: 'the mouse is over something', help: 'Checks that the pointer is on top of an object.', make: () => ({ type: 'mouseOver', target: T }) },
  cursorLocked: { group: 'Mouse', label: 'the pointer is locked', help: 'Checks that the mouse pointer is captured by the game.', make: () => ({ type: 'cursorLocked' }) },
  chance: { group: 'Random', label: 'a random chance', help: 'Only happens some of the time, like a dice roll.', make: () => ({ type: 'chance', percent: { lit: 50 } }) },
};

/** Action types (FR-018). */
export const ACTIONS: Record<ActionType, Template<Action>> = {
  changeValue: { group: 'Values', label: 'change a value', help: 'Adds to, takes away from, or sets a value like Score.', make: () => ({ type: 'changeValue', value: U, op: 'add', amount: { lit: 1 } }) },
  destroy: { group: 'Objects', label: 'make something disappear', help: 'Removes an object from the game.', make: () => ({ type: 'destroy', target: T }) },
  create: { group: 'Objects', label: 'create an object', help: 'Makes a new object appear somewhere (even at the mouse, snapped to a grid).', make: () => ({ type: 'create', kindId: U, place: { atTarget: { t: 'unset' } } }) },
  clone: { group: 'Objects', label: 'copy an object', help: 'Makes an exact copy of an object, with its values, in the same spot.', make: () => ({ type: 'clone', target: T }) },
  show: { group: 'Objects', label: 'show something', help: 'Makes a hidden object or screen item appear.', make: () => ({ type: 'show', target: T }) },
  hide: { group: 'Objects', label: 'hide something', help: 'Makes an object or screen item invisible (it stays in the game).', make: () => ({ type: 'hide', target: T }) },
  moveTo: { group: 'Motion', label: 'move something to a place', help: 'Puts an object at a spot, at the mouse, or where another object is.', make: () => ({ type: 'moveTo', target: T, to: { at: { x: { lit: 0 }, y: { lit: 0 } } } }) },
  moveBy: { group: 'Motion', label: 'move something by a bit', help: 'Shifts an object by some pixels.', make: () => ({ type: 'moveBy', target: T, by: { x: { lit: 32 }, y: { lit: 0 } } }) },
  glide: { group: 'Motion', label: 'glide something to a place', help: 'Slides an object smoothly to a spot over some seconds.', make: () => ({ type: 'glide', target: T, to: { atMouse: { snap: { lit: 0 } } }, seconds: { lit: 1 } }) },
  headTowards: { group: 'Motion', label: 'send something towards a place', help: 'Makes an object move towards a spot (like the mouse) at a speed.', make: () => ({ type: 'headTowards', target: T, to: { atMouse: { snap: { lit: 0 } } }, speed: { lit: 200 } }) },
  setSpeed: { group: 'Motion', label: 'set a speed', help: 'Makes an object move at a speed (pixels per second, sideways and down).', make: () => ({ type: 'setSpeed', target: T, speed: { x: { lit: 100 }, y: { lit: 0 } } }) },
  push: { group: 'Motion', label: 'push something', help: 'Gives an object a shove in a direction.', make: () => ({ type: 'push', target: T, direction: 'up', strength: { lit: 5 } }) },
  turn: { group: 'Motion', label: 'turn something', help: 'Rotates an object by some degrees.', make: () => ({ type: 'turn', target: T, degrees: { lit: 15 } }) },
  pointTowards: { group: 'Motion', label: 'point something towards a place', help: 'Rotates an object so it points at the mouse or another object.', make: () => ({ type: 'pointTowards', target: T, to: { atMouse: { snap: { lit: 0 } } } }) },
  face: { group: 'Motion', label: 'face left or right', help: 'Flips an object to look left, right, or the other way.', make: () => ({ type: 'face', target: T, dir: 'flip' }) },
  setProp: { group: 'Motion', label: "change something's x, y, size, turn…", help: 'Changes any property of an object: position, speed, turn, size, see-through, layer, frame.', make: () => ({ type: 'setProp', target: T, p: 'size', op: 'set', amount: { lit: 100 } }) },
  changeLook: { group: 'Looks', label: 'change a look', help: 'Swaps the picture of an object.', make: () => ({ type: 'changeLook', target: T, assetId: U }) },
  playAnim: { group: 'Looks', label: 'play one of its animations', help: 'Plays a named animation of the object, like "walk" or "mine".', make: () => ({ type: 'playAnim', target: T, anim: U }) },
  stopAnim: { group: 'Looks', label: 'stop animating', help: 'Freezes the object on the frame it is showing.', make: () => ({ type: 'stopAnim', target: T }) },
  setFrame: { group: 'Looks', label: 'show a frame', help: 'Shows one frame of the look (the first is 0). Great for blocks with several pictures.', make: () => ({ type: 'setFrame', target: T, frame: { lit: 0 } }) },
  animate: { group: 'Looks', label: 'play the frames of a look', help: 'Plays the frames of any look at a speed.', make: () => ({ type: 'animate', target: T, assetId: U, fps: { lit: 8 }, loop: true }) },
  tint: { group: 'Looks', label: 'tint something a colour', help: 'Colours an object, or puts it back to normal.', make: () => ({ type: 'tint', target: T, color: '#ff5d8f' }) },
  say: { group: 'Looks', label: 'say something in a bubble', help: 'Shows a speech bubble above an object.', make: () => ({ type: 'say', target: T, text: 'Hello!', seconds: { lit: 2 } }) },
  showText: { group: 'Screen', label: 'show a message', help: 'Shows big text on the screen for a few seconds.', make: () => ({ type: 'showText', text: 'Well done!', seconds: { lit: 2 } }) },
  setText: { group: 'Screen', label: 'change the text of a screen item', help: 'Changes what a text or button on the screen says.', make: () => ({ type: 'setText', target: T, text: 'Score: {Score}' }) },
  shakeCamera: { group: 'Screen', label: 'shake the screen', help: 'Wobbles the screen for a moment, great for hits and explosions.', make: () => ({ type: 'shakeCamera', seconds: { lit: 0.4 } }) },
  flashScreen: { group: 'Screen', label: 'flash the screen', help: 'Flashes a colour over the whole screen.', make: () => ({ type: 'flashScreen', color: '#ffffff', seconds: { lit: 0.3 } }) },
  burst: { group: 'Screen', label: 'burst sparks', help: 'Throws little coloured sparks out of a spot, like breaking a block.', make: () => ({ type: 'burst', place: { atTarget: { t: 'unset' } }, color: '#ffd166', count: { lit: 12 } }) },
  zoomCamera: { group: 'Screen', label: 'zoom the camera', help: 'Zooms in or out (100% is normal).', make: () => ({ type: 'zoomCamera', percent: { lit: 150 } }) },
  cameraFollow: { group: 'Screen', label: 'camera follows something', help: 'Makes the camera follow a different object.', make: () => ({ type: 'cameraFollow', target: T }) },
  cameraMoveTo: { group: 'Screen', label: 'move the camera', help: 'Moves the camera to a spot (it stops following).', make: () => ({ type: 'cameraMoveTo', to: { at: { x: { lit: 0 }, y: { lit: 0 } } } }) },
  fullscreen: { group: 'Screen', label: 'full screen', help: 'Turns full screen on, off, or switches it.', make: () => ({ type: 'fullscreen', mode: 'toggle' }) },
  share: { group: 'Screen', label: 'share a message', help: 'Opens the phone or browser share menu with a message, or copies it.', make: () => ({ type: 'share', text: 'I scored {Score}!' }) },
  lockCursor: { group: 'Mouse', label: 'lock the mouse pointer', help: 'Captures the pointer inside the game (Esc frees it).', make: () => ({ type: 'lockCursor' }) },
  unlockCursor: { group: 'Mouse', label: 'unlock the mouse pointer', help: 'Lets the pointer leave the game again.', make: () => ({ type: 'unlockCursor' }) },
  setCursor: { group: 'Mouse', label: 'change the mouse pointer', help: 'Hides the pointer or makes it a crosshair, hand or picture.', make: () => ({ type: 'setCursor', style: 'crosshair' }) },
  cursorLook: { group: 'Mouse', label: 'give the pointer a picture', help: 'Uses any picture as the mouse pointer.', make: () => ({ type: 'cursorLook', assetId: U }) },
  playSound: { group: 'Sound', label: 'play a sound', help: 'Plays a sound effect.', make: () => ({ type: 'playSound', assetId: U }) },
  playMusic: { group: 'Sound', label: 'play music', help: 'Starts looping music (replaces any music playing).', make: () => ({ type: 'playMusic', assetId: U }) },
  stopMusic: { group: 'Sound', label: 'stop the music', help: 'Stops the music.', make: () => ({ type: 'stopMusic' }) },
  stopSounds: { group: 'Sound', label: 'stop all sounds', help: 'Silences every sound effect playing right now.', make: () => ({ type: 'stopSounds' }) },
  setVolume: { group: 'Sound', label: 'set the volume', help: 'Makes everything louder or quieter (100% is normal).', make: () => ({ type: 'setVolume', percent: { lit: 50 } }) },
  sendMessage: { group: 'Control', label: 'send a message', help: 'Starts every rule that waits for this message.', make: () => ({ type: 'sendMessage', name: U }) },
  wait: { group: 'Control', label: 'wait', help: 'Pauses this rule for a moment before the next action.', make: () => ({ type: 'wait', seconds: { lit: 1 } }) },
  waitDone: { group: 'Control', label: 'wait for the steps above to finish', help: 'Waits until glides, once-only animations, speech bubbles and screen text above it end.', make: () => ({ type: 'waitDone' }) },
  waitUntil: { group: 'Control', label: 'wait until something is true', help: 'Pauses this rule until a check is true, like "Score is 10" or "Hero is on the ground".', make: () => ({ type: 'waitUntil', cond: { type: 'onGround', target: T } }) },
  together: { group: 'Control', label: 'at the same time, also do…', help: 'Actions after this start right away, beside the ones before, each side with its own waits.', make: () => ({ type: 'together' }) },
  timeScale: { group: 'Control', label: 'slow motion / fast forward', help: 'Changes how fast the whole game runs (100% is normal).', make: () => ({ type: 'timeScale', percent: { lit: 50 } }) },
  changeScene: { group: 'Control', label: 'go to another scene', help: 'Switches to another level or screen. Values are kept.', make: () => ({ type: 'changeScene', sceneId: U }) },
  restartScene: { group: 'Control', label: 'restart the scene', help: 'Starts this scene again from the beginning.', make: () => ({ type: 'restartScene' }) },
  setTile: { group: 'Tiles', label: 'place or remove a tile', help: 'Puts a tile at a spot (tile -1 removes it). Build and dig in tile worlds.', make: () => ({ type: 'setTile', place: { atMouse: { snap: { lit: 0 } } }, tile: { lit: -1 } }) },
};

/** Templates grouped by menu section, in first-seen order. */
export function grouped<T>(all: Record<string, Template<T>>): [string, [string, Template<T>][]][] {
  const out = new Map<string, [string, Template<T>][]>();
  for (const [k, t] of Object.entries(all)) {
    const list = out.get(t.group) ?? [];
    list.push([k, t]);
    out.set(t.group, list);
  }
  return [...out];
}
