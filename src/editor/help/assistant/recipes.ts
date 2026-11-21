/**
 * What the assistant knows how to explain. Each recipe has many ways people
 * ask for it (`examples`), which is what the matcher learns from, and steps
 * with a picture of what to click or what the rule should look like.
 * Rule pictures use [brackets] for blanks: "When [Hero] touches [any Coin]".
 */

export type Visual =
  | { where: string; then?: string }
  | { rule: string }
  | { sticker: string; settings?: [string, string][] }
  | { settings: [string, string][] }
  | { keys: string[] };

export interface Step {
  say: string;
  show?: Visual;
  /** Section the "Open" button jumps to (rail id, or 'inspect'). */
  open?: string;
}

export interface Recipe {
  id: string;
  title: string;
  /** One-line answer shown under the title. */
  why: string;
  examples: string[];
  keywords?: string;
  steps: Step[];
}

export const SECTION_NAMES: Record<string, string> = {
  art: 'Art', presets: 'Presets', tiles: 'Tiles', scenes: 'Scenes', rules: 'Rules', values: 'Values', screen: 'Screen', game: 'Game settings', warnings: 'Warnings', inspect: 'Inspector',
};

const selectKind = (name = 'the object'): Step => ({ say: `Click ${name} on the scene so the inspector on the right shows it.`, show: { where: 'inspect' }, open: 'inspect' });
const newRule = (when: string): Step => ({ say: `Open Rules, press "New rule" and pick "${when}".`, show: { where: 'rules', then: 'New rule' }, open: 'rules' });

export const RECIPES: Recipe[] = [
  {
    id: 'hold-break',
    title: 'Break a block by holding the mouse on it',
    why: 'Give the block the Breakable sticker (or use a "held down for" rule). It cracks while you hold and breaks when time runs out.',
    examples: [
      'hold mouse on block for some time and it breaks', 'mine blocks like minecraft', 'how do i dig dirt', 'break block when clicking long enough',
      'press and hold to destroy', 'mining with a pickaxe', 'blocks break after holding', 'make 2d minecraft breaking', 'hold click to break', 'chop tree by holding',
    ],
    steps: [
      selectKind('the Block'),
      { say: 'Press "Add sticker" and choose Breakable.', show: { sticker: 'Breakable', settings: [['Time to break', '1 s'], ['Mouse button', 'Left'], ['Reach', '0 = anywhere'], ['Show cracks', 'on']] } },
      { say: 'Optional: set "Drops" to an item Kind (like Dirt Item) so breaking leaves something to pick up, and "Reach" so you must stand close.' },
      { say: 'Want something extra when it breaks? Make a rule with the sticker event.', show: { rule: 'When [any Block] [is broken] → [Blocks] goes up by [1]' }, open: 'rules' },
      { say: 'Prefer a rule instead of the sticker? Use "something is held down for … seconds".', show: { rule: 'When [any Block] is held down with the [left mouse button] for [1] seconds → [that Block] disappears' } },
    ],
  },
  {
    id: 'place-block',
    title: 'Place blocks on a grid with the mouse',
    why: 'Create the block at "the mouse, snapped to a grid" when you right-click (or click).',
    examples: [
      'place blocks where i click', 'build like minecraft', 'right click to put a block', 'put block on grid at mouse', 'spawn block at cursor snapped',
      'building blocks in a sandbox game', 'how to stack blocks', 'create object at mouse position',
    ],
    steps: [
      { say: 'In Game settings, make sure "Use the right button" is on so the browser menu does not pop up.', show: { settings: [['Use the right button', 'on']] }, open: 'game' },
      newRule('a mouse button is pressed'),
      { say: 'Set it to the right button, then add "create an object" and pick "the mouse, snapped to a grid" for the place. Use your block size (like 32).', show: { rule: 'When the [right mouse button] is [pressed] → create a [Block] at [the mouse] on a [32] px grid' } },
      { say: 'Stop blocks stacking in one spot: add a check "the mouse is over something" and flip it with ¬ (NOT).', show: { rule: 'When the [right mouse button] is [pressed], only if [NOT] the mouse is over [any Block] → create a [Block] at [the mouse] on a [32] px grid' } },
      { say: 'Building with tiles instead? Use "place or remove a tile" (tile -1 removes).', show: { rule: 'When the [right mouse button] is [pressed] → the tile at [the mouse] becomes tile [3]' } },
    ],
  },
  {
    id: 'ghost-block',
    title: 'Show where the block will go (ghost block / highlight)',
    why: 'An object with Follow Mouse snapped to the grid and some see-through acts as a preview.',
    examples: ['show outline where block will be placed', 'highlight block under mouse', 'ghost block preview', 'selection box follows mouse on grid'],
    steps: [
      { say: 'Draw or pick an outline picture and place one on the scene.', show: { where: 'art' }, open: 'art' },
      selectKind('the outline'),
      { say: 'Add the Follow Mouse sticker and set Snap to grid to your block size.', show: { sticker: 'Follow Mouse', settings: [['Snap to grid', '32 px'], ['Smoothing', '0']] } },
      { say: 'In Appearance, turn on "Clicks pass through" (Follow Mouse does it for you) and add some See-through.', show: { settings: [['See-through', '50%'], ['Clicks pass through', 'on']] } },
    ],
  },
  {
    id: 'custom-cursor',
    title: 'Use a custom mouse cursor',
    why: 'Game settings → Pointer → "My own picture", or a rule "the mouse pointer becomes …".',
    examples: [
      'custom cursor', 'change the mouse pointer to my picture', 'crosshair cursor', 'hide the mouse', 'make the cursor a sword', 'own cursor image',
      'mouse icon change', 'replace arrow with picture', 'invisible cursor',
    ],
    steps: [
      { say: 'Open Game settings.', show: { where: 'game' }, open: 'game' },
      { say: 'Under Mouse, set Pointer to "My own picture" and choose the picture and size. Crosshair, hand and hidden are there too.', show: { settings: [['Pointer', 'My own picture'], ['Pointer picture', 'Crosshair'], ['Pointer size', '32px']] } },
      { say: 'To change it during the game (for example over a button), use a rule.', show: { rule: 'When the mouse moves [onto] [Shop Button] → the mouse pointer becomes [a pointing hand]' }, open: 'rules' },
      { say: 'Want the pointer to be a real object (it can animate or bump into things)? Give an object Follow Mouse and turn on "Hide the real pointer".', show: { sticker: 'Follow Mouse', settings: [['Hide the real pointer', 'on']] } },
    ],
  },
  {
    id: 'cursor-lock',
    title: 'Lock the mouse cursor inside the game',
    why: 'Turn on "Lock the pointer" in Game settings, or use the "lock the mouse pointer" action.',
    examples: [
      'cursor lock', 'lock the mouse', 'capture mouse like fps game', 'stop mouse leaving the window', 'pointer lock when clicking button', 'mouse look',
      'trap the cursor', 'button that locks cursor', 'mouse goes outside the game window',
    ],
    steps: [
      { say: 'Easiest: Game settings → Mouse → "Lock the pointer". Clicking the game captures the mouse; Esc frees it.', show: { settings: [['Lock the pointer', 'on']] }, open: 'game' },
      { say: 'Or lock it from a button: make a screen button, then a rule.', show: { rule: 'When [Start Button] is clicked → lock the mouse pointer' }, open: 'screen' },
      { say: 'While locked, read how far the mouse moved with "the mouse movement x / y" in any number blank (great for turning a camera or aiming).', show: { rule: 'When every frame (forever) → [Gun]\'s [turn (degrees)] [goes up by] [the mouse movement x]' } },
      { say: 'Check it with "the pointer is locked" and unlock with "unlock the mouse pointer".' },
    ],
  },
  {
    id: 'named-animations',
    title: 'Different animations for different things (walk, jump, mine…)',
    why: 'Give the Kind named animations, then play them from rules or let the Animator sticker switch them.',
    examples: [
      'different animations for different things', 'walk animation and jump animation', 'play animation when moving', 'animation when mining',
      'switch animation', 'animations for each action', 'run cycle', 'idle animation', 'attack animation', 'my drawing has frames how do i use them',
      'sword swing animation when pressing a key', 'play a punch animation',
    ],
    steps: [
      { say: 'Draw a look with several frames for each animation (the pixel editor has a frames strip).', show: { where: 'art' }, open: 'art' },
      selectKind('your character'),
      { say: 'In Animations, press "Add animation" for each one, name it and pick its look, speed and loop.', show: { settings: [['walk', 'Hero walk · 8 fps · loop'], ['jump', 'Hero jump · 10 fps'], ['mine', 'Hero mine · 12 fps · loop']] } },
      { say: 'Let it switch by itself: add the Animator sticker and choose which animation plays when standing, moving, going up and falling.', show: { sticker: 'Animator', settings: [['Standing', 'idle'], ['Moving', 'walk'], ['Going up', 'jump'], ['Falling', 'fall']] } },
      { say: 'Or play one from any rule.', show: { rule: 'When [any Block] is held down with the [left mouse button] for [0.1] seconds → [Hero] plays its [mine] animation' }, open: 'rules' },
    ],
  },
  {
    id: 'stop-autoplay',
    title: 'Stop animations from always playing',
    why: 'Turn off "Flip through frames by itself" in the Kind\'s Appearance. It then stays on frame 0 until something plays an animation.',
    examples: [
      'my animation always plays', 'stop the frames from playing', 'only animate sometimes', 'animation plays all the time', 'freeze on first frame',
      'how to pause an animation', 'show one frame only', 'animate only when walking',
    ],
    steps: [
      selectKind(),
      { say: 'In Appearance, turn off "Flip through frames by itself".', show: { settings: [['Flip through frames by itself', 'off']] } },
      { say: 'Start and stop it with rules: "play one of its animations", "stop animating", or "show a frame".', show: { rule: 'When [Right] is [released] → [Hero] stops animating' }, open: 'rules' },
      { say: 'Blocks with several pictures (grass, dirt, stone in one strip) can pick their picture with "show a frame".', show: { rule: 'When [any Block] is created → [that Block] shows frame [( a random number from [0] to [2] )]' } },
    ],
  },
  {
    id: 'button-click',
    title: 'Make a button that does something',
    why: 'Add a Button on the Screen layer, then a rule "When [button] is clicked".',
    examples: ['make a button', 'make a main menu', 'start button', 'menu button that goes to next scene', 'click a button to do something', 'play button on title screen', 'shop button'],
    steps: [
      { say: 'Open Screen and press "＋ Button". Name it and change the words.', show: { where: 'screen', then: '＋ Button' }, open: 'screen' },
      newRule('something is clicked'),
      { say: 'Pick your button in the first blank, then add what it does.', show: { rule: 'When [Start Button] is clicked → go to scene [Level 1]' } },
      { say: 'Hide it after: add "hide something" and choose the button.' },
    ],
  },
  {
    id: 'right-click',
    title: 'Use the right mouse button',
    why: 'Turn on "Use the right button" in Game settings, then use "is right-clicked" or "a mouse button is pressed".',
    examples: ['right click', 'detect right mouse button', 'right click on object', 'secondary click', 'right click menu stops it'],
    steps: [
      { say: 'Game settings → Mouse → "Use the right button" (stops the browser menu).', show: { settings: [['Use the right button', 'on']] }, open: 'game' },
      { say: 'On an object: make a "something is clicked" rule and change "is clicked" to "is right-clicked".', show: { rule: 'When [any Chest] [is right-clicked] → [that Chest] looks like [Chest open]' }, open: 'rules' },
      { say: 'Anywhere: "a mouse button is pressed" and pick the right button.', show: { rule: 'When the [right mouse button] is [pressed] → play sound [Click]' } },
    ],
  },
  {
    id: 'mouse-wheel-hotbar',
    title: 'Pick an item or block with the mouse wheel or number keys (hotbar)',
    why: 'Keep the chosen slot in a value and change it with "the mouse wheel turns" or key rules.',
    examples: ['hotbar', 'select block with scroll wheel', 'choose which block to place', 'inventory slots', 'switch weapon with mouse wheel', 'number keys select item'],
    steps: [
      { say: 'Make a value called Slot that starts at 1, with min 1 and max 9.', show: { where: 'values', then: 'New value' }, open: 'values' },
      { say: 'Scroll changes it.', show: { rule: 'When the mouse wheel turns [up] → [Slot] [goes up by] [1]' }, open: 'rules' },
      { say: 'Number keys set it.', show: { rule: 'When [2] is [pressed] → [Slot] [becomes] [2]' } },
      { say: 'Place the chosen block with a check on Slot.', show: { rule: 'When the [right mouse button] is [pressed], only if [Slot] [is] [2] → create a [Stone] at [the mouse] on a [32] px grid' } },
      { say: 'Show it: add a Panel and Text on the Screen layer, with "{Slot}" in the text.', open: 'screen' },
    ],
  },
  {
    id: 'hover',
    title: 'Do something when the mouse moves over an object',
    why: 'Use the trigger "the mouse moves onto something" (and "off").',
    examples: ['hover over object', 'mouse over highlight', 'when cursor touches object', 'tooltip on hover', 'glow when mouse is over'],
    steps: [
      newRule('the mouse moves onto something'),
      { say: 'Pick the object and an action, like a tint.', show: { rule: 'When the mouse moves [onto] [any Block] → [that Block] is tinted [#ffd166]' } },
      { say: 'Make a second rule with "off" to put it back.', show: { rule: 'When the mouse moves [off] [any Block] → [that Block] is tinted [no colour (normal)]' } },
    ],
  },
  {
    id: 'follow-mouse',
    title: 'Make an object follow the mouse',
    why: 'The Follow Mouse sticker, or "move something to the mouse" in an every-frame rule.',
    examples: ['object follows mouse', 'stick object to cursor', 'move to mouse position', 'drag with mouse', 'flashlight follows mouse'],
    steps: [
      selectKind(),
      { say: 'Add the Follow Mouse sticker. Smoothing makes it trail behind; Snap jumps cell by cell.', show: { sticker: 'Follow Mouse', settings: [['Smoothing', '0.2'], ['Snap to grid', '0 px']] } },
      { say: 'Only towards it, at a speed? Use "send something towards a place".', show: { rule: 'When every frame (forever) → [Bee] heads towards [the mouse] at speed [120]' }, open: 'rules' },
    ],
  },
  {
    id: 'aim-at-mouse',
    title: 'Aim or turn towards the mouse',
    why: 'The Point At sticker turns an object to face the mouse (or the nearest enemy).',
    examples: ['aim gun at mouse', 'rotate towards cursor', 'turret points at enemy', 'face the mouse', 'look at mouse', 'shoot where i click'],
    steps: [
      selectKind('the gun or turret'),
      { say: 'Add the Point At sticker. Leave "Points at" on The mouse, or pick a Kind for the nearest one.', show: { sticker: 'Point At', settings: [['Points at', 'The mouse'], ['Picture angle', '0°']] } },
      { say: 'Shooting at the mouse: set the Shooter sticker\'s Aim to "At the mouse".', show: { sticker: 'Shooter', settings: [['Aim', 'At the mouse'], ['Fire with', 'Mouse click'], ['Hold to keep firing', 'on']] } },
    ],
  },
  {
    id: 'shoot',
    title: 'Shoot bullets',
    why: 'The Shooter sticker fires a projectile Kind; give the bullet Hurts so it does damage.',
    examples: ['shoot bullets', 'fire a gun', 'throw fireballs', 'shoot lasers with space', 'shotgun spread', 'auto fire when holding'],
    steps: [
      { say: 'Make a Bullet Kind (any small picture) and give it Hurts and Lifetime.', show: { sticker: 'Lifetime', settings: [['Lives for', '2 s'], ['Fade out', 'on']] } },
      selectKind('the player'),
      { say: 'Add Shooter, choose the Bullet as projectile, and set how it fires.', show: { sticker: 'Shooter', settings: [['Projectile', 'Bullet'], ['Fire with', 'A key: X'], ['Shots at once', '3'], ['Fan width', '15°'], ['Hold to keep firing', 'on']] } },
    ],
  },
  {
    id: 'double-jump',
    title: 'Double jump',
    why: 'Platformer Controller → Air jumps = 1 (2 for triple).',
    examples: ['double jump', 'jump twice', 'jump in the air', 'triple jump', 'multi jump'],
    steps: [selectKind('the player'), { say: 'In the Platformer Controller sticker, set Air jumps.', show: { sticker: 'Platformer Controller', settings: [['Air jumps', '1'], ['Jump height', '72 px']] } }],
  },
  {
    id: 'health-bar',
    title: 'Show a health bar',
    why: 'Health sticker → "Health bar" for one above the object; a Bar on the Screen layer for a HUD.',
    examples: ['health bar', 'show hp', 'hearts display', 'progress bar', 'energy meter', 'boss health bar', 'stamina bar'],
    steps: [
      selectKind('the enemy or player'),
      { say: 'In the Health sticker, turn on "Health bar". It shows above the object and changes colour as it drops.', show: { sticker: 'Health', settings: [['Health', '5'], ['Health bar', 'on']] } },
      { say: 'For a bar fixed on the screen: Screen → "＋ Bar", choose the value it shows and when it is full.', show: { settings: [['Shows', 'Lives'], ['full at', '3'], ['Box', '200 × 24']] }, open: 'screen' },
    ],
  },
  {
    id: 'score',
    title: 'Keep score and show it',
    why: 'Make a value, change it in rules, and show it with {Score} in a screen text.',
    examples: ['add score', 'points when collecting coins', 'count coins', 'show the score on screen', 'money counter', 'variables', 'save high score', 'remember best score between plays'],
    steps: [
      { say: 'Values → New value, call it Score.', show: { where: 'values', then: 'New value' }, open: 'values' },
      { say: 'Change it in a rule.', show: { rule: 'When [Hero] touches [any Coin] → [that Coin] disappears and [Score] [goes up by] [1]' }, open: 'rules' },
      { say: 'Show it: Screen → "＋ Text" and write "Score: {Score}".', open: 'screen' },
      { say: 'Keep a best score between plays: tick "Remember between plays" on the value.' },
    ],
  },
  {
    id: 'timer',
    title: 'Timers, countdowns and repeating things',
    why: 'Use "every … seconds", "… seconds have passed", or a value that goes down each second.',
    examples: ['countdown timer', 'do something every second', 'after 5 seconds', 'time limit', 'repeat forever', 'wait then do something', 'delay'],
    steps: [
      { say: 'Repeat: "every … seconds".', show: { rule: 'When every [1] second pass → [Time] [goes down by] [1]' }, open: 'rules' },
      { say: 'End when it hits zero.', show: { rule: 'When [Time] reaches [0] → go to scene [Game Over]' } },
      { say: 'Wait inside a rule: add the "wait" action between actions.', show: { rule: 'When [Door] is clicked → show ["Opening…"] for [1] second, wait [1] second, and go to scene [Level 2]' } },
    ],
  },
  {
    id: 'every-frame',
    title: 'Run something all the time (forever loop)',
    why: 'Use "every frame (forever)" or "every frame while something is true".',
    examples: ['forever loop', 'run every frame', 'keep checking', 'update loop', 'continuously', 'while key is held keep moving'],
    steps: [
      newRule('every frame (forever)'),
      { say: 'Anything you add runs 60 times a second.', show: { rule: 'When every frame (forever) → [Sun] turns by [1] degrees' } },
      { say: 'Only while something is true: "every frame while something is true".', show: { rule: 'When a frame passes while the [left mouse button] is held → [Hero] heads towards [the mouse] at speed [150]' } },
    ],
  },
  {
    id: 'becomes-true',
    title: 'React when something becomes true (getting close, health low…)',
    why: 'The trigger "something becomes true" fires the moment any check turns true.',
    examples: ['when player gets close to enemy', 'when health is low', 'detect distance', 'when near', 'trigger when condition becomes true', 'proximity'],
    steps: [
      newRule('something becomes true'),
      { say: 'Click the check to change it; "something is near something" is set up for you.', show: { rule: 'When it becomes true that the distance from [Hero] to [any Zombie] [is less than] [100] → play sound [Hurt]' } },
    ],
  },
  {
    id: 'not-condition',
    title: 'Only do something if something is NOT true',
    why: 'Add a check with "＋ only if", then press ¬ on it to flip it.',
    examples: ['if not', 'unless', 'only if not touching', 'otherwise', 'else', 'when not on ground', 'invert condition'],
    steps: [
      { say: 'On a rule, press "＋ only if" and choose a check.', open: 'rules' },
      { say: 'Press the ¬ button next to the check. It now says NOT.', show: { rule: 'When [Space] is [pressed], only if [NOT] [Hero] is on the ground → [Hero] is pushed [up] with strength [3]' } },
      { say: 'Several checks? Click "all must be true" to switch to "any can be true".' },
    ],
  },
  {
    id: 'messages',
    title: 'Make rules talk to each other (messages / broadcast)',
    why: 'One rule does "send a message"; others start with "a message is sent".',
    examples: ['broadcast', 'send a message to other rules', 'trigger another rule', 'when one thing happens tell others', 'event between objects'],
    steps: [
      { say: 'In the first rule, add "send a message" and type a name.', show: { rule: 'When [Lives] reaches [0] → send the message ["game over"]' }, open: 'rules' },
      { say: 'Other rules wait for it.', show: { rule: 'When the message ["game over"] is sent → [every Enemy] disappears' } },
    ],
  },
  {
    id: 'maths',
    title: 'Use maths, positions, distance and random numbers',
    why: 'Every number blank can use readings (mouse x, an object\'s x, distance) and maths.',
    examples: ['math', 'random number', 'distance between objects', 'player x position', 'calculate damage', 'round a number', 'mouse position', 'angle'],
    steps: [
      { say: 'Click any number blank. Under it you will find "The mouse, time and camera", "Something about an object" and "Maths and random".', open: 'rules' },
      { say: 'Example: spawn a coin at a random spot.', show: { rule: 'When every [2] seconds pass → create a [Coin] at [( a random number from [0] to [900] )] , [100]' } },
      { say: 'Wrap a number in maths with "do maths with this number"; click the + to change it to −, ×, ÷ and more.', show: { rule: 'When [any Enemy] [is hurt] → [Score] [goes up by] [( [Combo] × [10] )]' } },
      { say: 'Compare any two numbers with the check "a number is … (anything)".', show: { rule: 'When every frame (forever), only if [Hero]\'s [y] [is more than] [600] → restart this scene' } },
    ],
  },
  {
    id: 'spawner',
    title: 'Keep spawning enemies or items',
    why: 'The Spawner sticker makes a Kind every few seconds, up to a limit.',
    examples: ['spawn enemies', 'monster spawner', 'keep creating objects', 'rain drops falling', 'generate items', 'wave of enemies'],
    steps: [
      selectKind('the spawner object'),
      { say: 'Add the Spawner sticker and pick what it makes.', show: { sticker: 'Spawner', settings: [['Makes', 'Zombie'], ['Every', '3 s'], ['At most', '10'], ['Spread', '64 px']] } },
      { say: 'Or with a rule: "create an object" inside "every … seconds".', show: { rule: 'When every [3] seconds pass → create a [Zombie] at [Cave]\'s position' }, open: 'rules' },
    ],
  },
  {
    id: 'wander',
    title: 'Make animals or villagers wander around',
    why: 'The Wander sticker walks randomly; add Falls for gravity in side-view games.',
    examples: ['animals walk randomly', 'npc wander', 'random movement', 'roam around', 'pig walks around'],
    steps: [selectKind('the animal'), { say: 'Add Wander (and Falls if it should fall).', show: { sticker: 'Wander', settings: [['Speed', '50'], ['Change mind every', '2 s'], ['Moves', 'Sideways']] } }],
  },
  {
    id: 'say-bubble',
    title: 'Speech bubbles and talking characters',
    why: 'Use "say something in a bubble".',
    examples: ['speech bubble', 'character talks', 'npc dialogue', 'say hello', 'text above head'],
    steps: [{ say: 'Add the action to any rule.', show: { rule: 'When [Hero] touches [Villager] → [Villager] says ["Hi! Want to trade?"] for [3] seconds' }, open: 'rules' }],
  },
  {
    id: 'particles',
    title: 'Explosions, sparks and screen effects',
    why: 'Use "burst sparks", "flash the screen" and "shake the screen".',
    examples: ['explosion effect', 'particles', 'sparks when breaking', 'screen flash when hit', 'screen shake', 'confetti when winning'],
    steps: [
      { say: 'Add effects to any rule.', show: { rule: 'When [any Bomb] is destroyed → burst [30] [#ff7a59] sparks at [that Bomb]\'s position, shake the screen for [0.4] seconds, and flash the screen [#ffffff] for [0.2] seconds' }, open: 'rules' },
    ],
  },
  {
    id: 'camera',
    title: 'Camera: follow, zoom and move',
    why: 'Camera Follow sticker, or rules "camera follows", "zoom the camera" and "move the camera".',
    examples: ['camera follow player', 'zoom in', 'zoom out', 'move the camera', 'scrolling level', 'camera on boss'],
    steps: [
      selectKind('the player'),
      { say: 'Add the Camera Follow sticker.', show: { sticker: 'Camera Follow', settings: [['Smoothness', '0.15'], ['Stay inside the scene', 'on']] } },
      { say: 'Starting zoom is in Game settings; rules can change it while playing.', show: { rule: 'When [Hero] touches [Boss Room] → zoom the camera to [70] %, and the camera follows [Boss]' }, open: 'game' },
    ],
  },
  {
    id: 'glide',
    title: 'Move smoothly to a spot (glide)',
    why: 'Use "glide something to a place" with a time in seconds.',
    examples: ['glide', 'move smoothly', 'slide to position', 'tween', 'animate movement'],
    steps: [{ say: 'Add the action.', show: { rule: 'When [Card] is clicked → [Card] glides to [the mouse] in [0.5] seconds' }, open: 'rules' }],
  },
  {
    id: 'rotate-size-color',
    title: 'Change size, turn, colour or see-through',
    why: 'Use "change something\'s x, y, size, turn…", "turn something" and "tint something a colour".',
    examples: ['make object bigger', 'rotate object', 'change colour', 'make transparent', 'fade out', 'grow when eating', 'shrink'],
    steps: [
      { say: 'Any property: pick it in the second blank.', show: { rule: 'When [Hero] touches [any Mushroom] → [Hero]\'s [size %] [becomes] [150]' }, open: 'rules' },
      { say: 'Colours and see-through.', show: { rule: 'When [Ghost] is clicked → [Ghost] is tinted [#b78cff] and [Ghost]\'s [see-through %] [becomes] [60]' } },
      { say: 'Kind-wide defaults (tint, see-through, layer) are in the inspector\'s Appearance section.', open: 'inspect' },
    ],
  },
  {
    id: 'scenes',
    title: 'Levels, menus and game over screens',
    why: 'Add scenes, then switch with "go to another scene".',
    examples: ['next level', 'door to the next level', 'portal to another world', 'title screen', 'game over screen', 'go to level 2', 'win screen', 'restart level when dying'],
    steps: [
      { say: 'Use the scene tabs above the canvas: "+" adds a scene.', show: { where: 'scenes' }, open: 'scenes' },
      { say: 'Switch with a rule.', show: { rule: 'When [Hero] touches [Door] → go to scene [Level 2]' }, open: 'rules' },
      { say: 'Losing: "restart the scene" or go to a Game Over scene.', show: { rule: 'When [Hero] [runs out of health] → go to scene [Game Over]' } },
    ],
  },
  {
    id: 'sound-music',
    title: 'Sounds, music and volume',
    why: 'Use "play a sound", "play music", "set the volume"; default music is in Game settings.',
    examples: ['play a sound', 'background music', 'change music', 'mute', 'volume', 'stop the music'],
    steps: [
      { say: 'Default music and volume: Game settings → Sound.', open: 'game' },
      { say: 'From rules.', show: { rule: 'When [Hero] touches [Boss Room] → play music [Action], and set the volume to [80] %' }, open: 'rules' },
      { say: 'Import your own MP3/WAV in Art → Import.', open: 'art' },
    ],
  },
  {
    id: 'pause',
    title: 'Pause the game with a key',
    why: 'Game settings → Keys → Pause key.',
    examples: ['pause the game', 'pause key', 'press p to pause', 'pause menu'],
    steps: [{ say: 'Set the pause key. Pressing it freezes the game and shows "Paused".', show: { settings: [['Pause key', 'P']] }, open: 'game' }],
  },
  {
    id: 'slowmo-fullscreen',
    title: 'Slow motion and full screen',
    why: 'Use "slow motion / fast forward" and "full screen".',
    examples: ['slow motion', 'speed up the game', 'bullet time', 'full screen button', 'make game fullscreen'],
    steps: [
      { say: 'Slow motion.', show: { rule: 'When [Shift] is [pressed] → the game runs at [30] % speed' }, open: 'rules' },
      { say: 'Full screen from a button.', show: { rule: 'When [Fullscreen Button] is clicked → full screen [toggle]' } },
    ],
  },
  {
    id: 'tiles-world',
    title: 'Dig and build in a tile world',
    why: 'Paint the world with Tiles, then use "place or remove a tile" and "a tile is solid or empty".',
    examples: ['dig tiles', 'remove tile at mouse', 'tile mining', 'terraria digging', 'change tile when clicked', 'is there a tile here'],
    steps: [
      { say: 'Paint ground with a tile set.', show: { where: 'tiles' }, open: 'tiles' },
      { say: 'Dig: remove the tile under the mouse while holding.', show: { rule: 'When a frame passes while the [left mouse button] is held → the tile at [the mouse] becomes tile [-1]' }, open: 'rules' },
      { say: 'Build only on empty cells.', show: { rule: 'When the [right mouse button] is [pressed], only if the tile at [the mouse] is [empty] → the tile at [the mouse] becomes tile [2]' } },
    ],
  },
  {
    id: 'drag',
    title: 'Drag objects with the mouse',
    why: 'The Draggable sticker.',
    examples: ['drag objects', 'drag and drop', 'pick up with mouse and move', 'puzzle pieces drag'],
    steps: [selectKind(), { say: 'Add Draggable. "is dropped" fires when you let go.', show: { sticker: 'Draggable', settings: [['Snap to grid', 'on']] } }],
  },
  {
    id: 'wrap-edges',
    title: 'Wrap around the edges or stay inside',
    why: 'Wrap Around sticker (Asteroids) or Stay In Scene sticker.',
    examples: ['wrap around screen', 'come out other side', 'stay inside the screen', 'stop leaving the level', 'asteroids edges'],
    steps: [selectKind(), { say: 'Add Wrap Around, or Stay In Scene to keep it in.', show: { sticker: 'Wrap Around', settings: [['Edges', 'All edges']] } }],
  },
  {
    id: 'collect',
    title: 'Collect items and coins',
    why: 'The Collectible sticker on the item, plus a rule to count it.',
    examples: ['collect coins', 'pick up items', 'collectible', 'loot drops', 'gather gems'],
    steps: [
      selectKind('the coin'),
      { say: 'Add Collectible.', show: { sticker: 'Collectible', settings: [['Collected by', 'Hero'], ['Sound', 'Coin']] } },
      { say: 'Count it.', show: { rule: 'When [any Coin] [is collected] → [Coins] [goes up by] [1]' }, open: 'rules' },
    ],
  },
  {
    id: 'enemies',
    title: 'Enemies that hurt and chase',
    why: 'Hurts, Health, Patrol or Chase stickers.',
    examples: ['enemy that hurts player', 'zombie chases player', 'enemy patrols', 'take damage', 'monster attack'],
    steps: [
      selectKind('the enemy'),
      { say: 'Add Hurts Player (and Chase or Patrol to move it).', show: { sticker: 'Chase', settings: [['Chases', 'Hero'], ['Speed', '90'], ['Notice distance', '200 px']] } },
      { say: 'Give the player Health so it takes several hits.', show: { sticker: 'Health', settings: [['Health', '3'], ['Health bar', 'on']] } },
    ],
  },
  {
    id: 'block-board',
    title: 'See rules as blocks connected by glowing lines',
    why: 'Rules → "Block board" shows every rule as When → checks → actions with glowing wires.',
    examples: ['block coding', 'node editor', 'connected blocks with lines', 'visual scripting', 'blueprints', 'string blocks', 'glowing lines between blocks', 'more technical view'],
    steps: [
      { say: 'Open Rules and press "⧉ Block board".', show: { where: 'rules', then: 'Block board' }, open: 'rules' },
      { say: 'Every blank works the same as in sentences. Use "＋ check" and "＋ action" blocks to grow a rule; ↑ ↓ change the order actions run.' },
    ],
  },
  {
    id: 'show-me',
    title: 'Teach a rule by acting it out (Show-me)',
    why: 'Press F2 while playing, pick what happened, then do what should happen.',
    examples: ['show me', 'record a rule', 'act it out', 'teach the game', 'make rules without typing'],
    steps: [
      { say: 'Press Play, then F2 right after the thing happens (like touching a coin).', show: { keys: ['▶ Play', 'F2'] } },
      { say: 'Pick the event, then drag, delete or change things in the frozen game. StickWIX writes the rule.' },
    ],
  },
  {
    id: 'draw-art',
    title: 'Draw your own art or import pictures',
    why: 'Art → Draw opens the pixel editor (with frames); Import takes PNG files.',
    examples: ['draw my own character', 'pixel art editor', 'import png', 'custom sprite', 'make a skin', 'upload picture'],
    steps: [
      { say: 'Open Art and press Draw (or Import).', show: { where: 'art' }, open: 'art' },
      { say: 'Add frames in the frames strip to make animations; then give the Kind named animations.' },
    ],
  },
  {
    id: 'export',
    title: 'Share or export your game',
    why: 'Export → "Export game" makes one HTML file that plays anywhere.',
    examples: ['export game', 'share with friends', 'publish', 'download my game', 'make html file'],
    steps: [{ say: 'Press Export in the top bar and choose "Export game". Send the .html file to anyone.', show: { keys: ['Export', 'Export game'] } }],
  },
  {
    id: 'find',
    title: 'Find anything quickly',
    why: 'Ctrl/⌘ K opens search; number keys 1–9 jump between sections; ? shows all shortcuts.',
    examples: ['where is', 'how to find settings', 'keyboard shortcuts', 'navigate', 'search the editor', 'cant find the button'],
    steps: [{ say: 'Press Ctrl/⌘ K and type what you are looking for (a section, an object, a scene or an action).', show: { keys: ['Ctrl/⌘', 'K'] } }, { say: 'Press ? for every shortcut.', show: { keys: ['?'] } }],
  },
  {
    id: 'hazard',
    title: 'Lava, spikes and traps that hurt or kill',
    why: 'Give the hazard the Hurts Player sticker, or restart the scene when the player touches it.',
    examples: ['lava kills you', 'spikes hurt the player', 'touch lava and die', 'deadly trap', 'fall in water and restart', 'poison floor'],
    steps: [
      selectKind('the lava or spikes'),
      { say: 'Add Hurts Player (and Solid if you can stand on it). With Health on the player it takes a life; without, it is defeated.', show: { sticker: 'Hurts Player', settings: [['Damage', '1'], ['Knockback', '200']] } },
      { say: 'Instant restart instead:', show: { rule: 'When [Hero] touches [any Lava] → burst [20] [#ff7a59] sparks at [Hero]\'s position, and restart this scene' }, open: 'rules' },
    ],
  },
  {
    id: 'push-bounce',
    title: 'Knockback, launch pads and bouncing',
    why: 'Use "push something", or the Bouncy sticker.',
    examples: ['bounce pad', 'trampoline', 'knockback when hit', 'launch player up', 'spring jump'],
    steps: [{ say: 'Push on touch.', show: { rule: 'When [Hero] touches [any Spring] → [Hero] is pushed [up] with strength [9]' }, open: 'rules' }],
  },
  {
    id: 'moving-platform',
    title: 'Moving platforms',
    why: 'Solid + Patrol stickers on the platform.',
    examples: ['moving platform', 'elevator', 'platform that moves back and forth', 'lift'],
    steps: [selectKind('the platform'), { say: 'Add Solid and Patrol.', show: { sticker: 'Patrol', settings: [['Distance', '128 px'], ['Direction', 'Up and down']] } }],
  },
  {
    id: 'layers',
    title: 'Put things in front or behind',
    why: 'Inspector → Appearance → Layer (higher is in front), or change "layer" with a rule.',
    examples: ['bring to front', 'send behind', 'layer order', 'draw on top', 'background objects behind player'],
    steps: [selectKind(), { say: 'Set Layer in Appearance. Higher numbers draw in front.', show: { settings: [['Layer', '2']] } }],
  },
];
