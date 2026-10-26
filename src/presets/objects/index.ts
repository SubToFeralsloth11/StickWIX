import type { z } from 'zod';
import { Kind, Rule, Value, type Action, type Condition, type Target, type Trigger } from '../../model/schema';
import type { StickerType } from '../../model/sticker-settings';
import type { Genre, ObjectPreset } from '../types';

/**
 * Object presets (FR-025): ready-made Kinds with their stickers, game values
 * and rules. Ids here are local to each preset; insertion gives every one a
 * fresh id. Every rule is complete, so a dropped preset works straight away.
 */

type StickerInput = { id: string; type: StickerType; settings?: Record<string, unknown> };
type KindInput = Omit<z.input<typeof Kind>, 'stickers' | 'rules'> & { stickers?: StickerInput[]; rules?: Rule[] };

const self: Target = { t: 'self' };
const lit = (n: number) => ({ lit: n });

function rule(id: string, trigger: Trigger, actions: Action[], conditions: Condition[] = []): Rule {
  return Rule.parse({ id, trigger, actions, conditions: { join: 'all', items: conditions } });
}

function gameValue(id: string, name: string, start: number | boolean = 0, extra: Partial<Value> = {}): Value {
  return Value.parse({ id, name, scope: 'game', type: typeof start === 'boolean' ? 'bool' : 'number', start, ...extra });
}

const add = (valueId: string, amount: number | { ref: { valueId: string } }): Action => ({
  type: 'changeValue',
  value: { valueId },
  op: 'add',
  amount: typeof amount === 'number' ? lit(amount) : amount,
});

const sound = (assetId: string): Action => ({ type: 'playSound', assetId });

function preset(
  p: Omit<ObjectPreset, 'kinds' | 'values' | 'rules' | 'mainKindId'> & { kinds: KindInput[]; values?: Value[]; rules?: Rule[] },
): ObjectPreset {
  const kinds = p.kinds.map((k) => Kind.parse({ ...k, stickers: (k.stickers ?? []).map((s) => ({ settings: {}, ...s })) }));
  return { ...p, kinds, values: p.values ?? [], rules: p.rules ?? [], mainKindId: kinds[0]!.id };
}

const P: Genre = 'platformer';
const T: Genre = 'topdown';
const C: Genre = 'clicker';

export const OBJECT_PRESETS: ObjectPreset[] = [
  // ---------- Platformer ----------
  preset({
    id: 'platformer-hero',
    name: 'Platformer Hero',
    genres: [P],
    description: 'Runs with the arrow keys or WASD, jumps with Space, has 3 health and the camera follows it.',
    icon: 'builtin:img/hero',
    kinds: [
      {
        id: 'hero',
        name: 'Hero',
        lookId: 'builtin:img/hero',
        size: { w: 32, h: 32 },
        hitbox: { x: 6, y: 4, w: 20, h: 28 },
        stickers: [
          { id: 'hero-move', type: 'platformer', settings: { speed: 200, jumpHeight: 100, idleLook: 'builtin:img/hero', walkLook: 'builtin:img/hero_walk', jumpLook: 'builtin:img/hero_jump' } },
          { id: 'hero-health', type: 'health', settings: { max: 3 } },
          { id: 'hero-camera', type: 'cameraFollow' },
        ],
        rules: [
          rule('hero-jump', { type: 'sticker', target: self, event: 'jumps' }, [sound('builtin:sfx/jump')]),
          rule('hero-hurt', { type: 'sticker', target: self, event: 'hurt' }, [sound('builtin:sfx/hurt'), { type: 'shakeCamera', seconds: lit(0.2) }]),
        ],
      },
    ],
  }),
  preset({
    id: 'coin',
    name: 'Coin',
    genres: [P, T],
    description: 'A spinning coin. Touching it collects it and adds 1 to Score.',
    icon: 'builtin:img/coin',
    kinds: [
      {
        id: 'coin',
        name: 'Coin',
        lookId: 'builtin:img/coin',
        size: { w: 32, h: 32 },
        hitbox: { x: 6, y: 6, w: 20, h: 20 },
        stickers: [
          { id: 'coin-collect', type: 'collectible' },
          { id: 'coin-spin', type: 'animate', settings: { fps: 4 } },
        ],
        rules: [rule('coin-score', { type: 'sticker', target: self, event: 'collected' }, [add('score', 1)])],
      },
    ],
    values: [gameValue('score', 'Score')],
  }),
  preset({
    id: 'patrolling-enemy',
    name: 'Patrolling Enemy',
    genres: [P],
    description: 'A slime that walks back and forth, turns at ledges, falls and hurts the player.',
    icon: 'builtin:img/slime',
    kinds: [
      {
        id: 'slime',
        name: 'Slime',
        lookId: 'builtin:img/slime',
        size: { w: 32, h: 32 },
        hitbox: { x: 2, y: 12, w: 28, h: 20 },
        stickers: [
          { id: 'slime-fall', type: 'falls' },
          { id: 'slime-walk', type: 'patrol', settings: { distance: 96, speed: 50 } },
          { id: 'slime-hurt', type: 'hurts', settings: { knockback: 250 } },
          { id: 'slime-anim', type: 'animate', settings: { fps: 4 } },
        ],
      },
    ],
  }),
  preset({
    id: 'flying-enemy',
    name: 'Flying Enemy',
    genres: [P, T],
    description: 'A bee that flies up and down and hurts the player.',
    icon: 'builtin:img/bee',
    kinds: [
      {
        id: 'bee',
        name: 'Bee',
        lookId: 'builtin:img/bee',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 6, w: 24, h: 20 },
        stickers: [
          { id: 'bee-fly', type: 'patrol', settings: { axis: 'y', distance: 96, speed: 70, turnAtEdges: false } },
          { id: 'bee-hurt', type: 'hurts' },
          { id: 'bee-anim', type: 'animate', settings: { fps: 10 } },
        ],
      },
    ],
  }),
  preset({
    id: 'spikes',
    name: 'Spikes',
    genres: [P, T],
    description: 'Sharp spikes on the ground that hurt the player and knock them back.',
    icon: 'builtin:img/spikes',
    kinds: [
      {
        id: 'spikes',
        name: 'Spikes',
        lookId: 'builtin:img/spikes',
        size: { w: 32, h: 32 },
        hitbox: { x: 2, y: 16, w: 28, h: 16 },
        stickers: [{ id: 'spikes-hurt', type: 'hurts', settings: { knockback: 300 } }],
      },
    ],
  }),
  preset({
    id: 'moving-platform',
    name: 'Moving Platform',
    genres: [P],
    description: 'A platform that slides side to side and carries whoever stands on it. Jump up through it from below.',
    icon: 'builtin:img/platform',
    kinds: [
      {
        id: 'platform',
        name: 'Moving Platform',
        lookId: 'builtin:img/platform',
        size: { w: 96, h: 32 },
        hitbox: { x: 0, y: 0, w: 96, h: 16 },
        stickers: [
          { id: 'platform-solid', type: 'solid', settings: { oneWay: true } },
          { id: 'platform-move', type: 'patrol', settings: { distance: 160, speed: 60, turnAtEdges: false } },
        ],
      },
    ],
  }),
  preset({
    id: 'bouncing-rock',
    name: 'Bouncing Rock',
    genres: [P],
    description: 'A rock that falls, bounces off the ground and hurts the player.',
    icon: 'builtin:img/rock',
    kinds: [
      {
        id: 'rock',
        name: 'Bouncing Rock',
        lookId: 'builtin:img/rock',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 4, w: 24, h: 24 },
        stickers: [
          { id: 'rock-fall', type: 'falls' },
          { id: 'rock-bounce', type: 'bouncy', settings: { bounce: 0.9 } },
          { id: 'rock-hurt', type: 'hurts' },
        ],
      },
    ],
  }),
  preset({
    id: 'goal-flag',
    name: 'Goal Flag',
    genres: [P, T],
    description: 'A waving flag. When the player reaches it, it plays a fanfare and shows "You win!".',
    icon: 'builtin:img/flag',
    kinds: [
      {
        id: 'flag',
        name: 'Goal Flag',
        lookId: 'builtin:img/flag',
        size: { w: 32, h: 32 },
        stickers: [
          { id: 'flag-reach', type: 'collectible', settings: { disappear: false, sound: 'builtin:sfx/win' } },
          { id: 'flag-wave', type: 'animate', settings: { fps: 3 } },
        ],
        rules: [rule('flag-win', { type: 'sticker', target: self, event: 'collected' }, [{ type: 'showText', text: 'You win!', seconds: lit(3) }])],
      },
    ],
  }),
  preset({
    id: 'heart-pickup',
    name: 'Heart Pickup',
    genres: [P, T],
    description: 'A heart that gives one extra life when collected.',
    icon: 'builtin:img/heart',
    kinds: [
      {
        id: 'heart',
        name: 'Heart',
        lookId: 'builtin:img/heart',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 4, w: 24, h: 24 },
        stickers: [{ id: 'heart-collect', type: 'collectible', settings: { sound: 'builtin:sfx/powerup' } }],
        rules: [rule('heart-life', { type: 'sticker', target: self, event: 'collected' }, [add('lives', 1)])],
      },
    ],
    values: [gameValue('lives', 'Lives', 3, { min: 0 })],
  }),
  preset({
    id: 'crate',
    name: 'Crate',
    genres: [P, T],
    description: 'A solid wooden crate you can stand on. Drag it with the mouse to move it; it snaps to the grid.',
    icon: 'builtin:img/crate',
    kinds: [
      {
        id: 'crate',
        name: 'Crate',
        lookId: 'builtin:img/crate',
        size: { w: 32, h: 32 },
        stickers: [
          { id: 'crate-solid', type: 'solid' },
          { id: 'crate-drag', type: 'draggable', settings: { snapToGrid: true } },
        ],
      },
    ],
  }),
  preset({
    id: 'turret',
    name: 'Turret',
    genres: [P, T],
    description: 'Fires a fireball to the left every 2 seconds. Fireballs hurt the player and vanish after 3 seconds.',
    icon: 'builtin:img/cyclops',
    kinds: [
      {
        id: 'turret',
        name: 'Turret',
        lookId: 'builtin:img/cyclops',
        size: { w: 32, h: 32 },
        stickers: [{ id: 'turret-solid', type: 'solid' }],
        rules: [
          rule('turret-fire', { type: 'every', seconds: lit(2) }, [
            { type: 'create', kindId: 'turret-shot', place: { atTarget: self } },
            sound('builtin:sfx/shoot'),
          ]),
        ],
      },
      {
        id: 'turret-shot',
        name: 'Turret Fireball',
        lookId: 'builtin:img/fireball',
        size: { w: 20, h: 20 },
        stickers: [
          { id: 'shot-hurt', type: 'hurts', settings: { knockback: 150 } },
          { id: 'shot-anim', type: 'animate', settings: { fps: 10 } },
        ],
        rules: [
          rule('shot-fly', { type: 'created', target: self }, [
            { type: 'setSpeed', target: self, speed: { x: lit(-220), y: lit(0) } },
            { type: 'wait', seconds: lit(3) },
            { type: 'destroy', target: self },
          ]),
        ],
      },
    ],
  }),
  preset({
    id: 'bomb',
    name: 'Bomb',
    genres: [P, T],
    description: 'Falls to the ground and blows up 3 seconds after the level starts, shaking the camera. Hurts on touch.',
    icon: 'builtin:img/bomb',
    kinds: [
      {
        id: 'bomb',
        name: 'Bomb',
        lookId: 'builtin:img/bomb',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 6, w: 24, h: 26 },
        stickers: [
          { id: 'bomb-fall', type: 'falls' },
          { id: 'bomb-hurt', type: 'hurts', settings: { damage: 2, knockback: 400 } },
        ],
        rules: [
          rule('bomb-boom', { type: 'after', seconds: lit(3) }, [
            sound('builtin:sfx/break'),
            { type: 'shakeCamera', seconds: lit(0.4) },
            { type: 'destroy', target: self },
          ]),
        ],
      },
    ],
  }),

  // ---------- Top-down ----------
  preset({
    id: 'topdown-hero',
    name: 'Top-down Hero',
    genres: [T],
    description: 'A knight that walks in 8 directions with the arrow keys or WASD, has 5 health and the camera follows it.',
    icon: 'builtin:img/knight',
    kinds: [
      {
        id: 'knight',
        name: 'Knight',
        lookId: 'builtin:img/knight',
        size: { w: 32, h: 32 },
        hitbox: { x: 6, y: 6, w: 20, h: 24 },
        stickers: [
          { id: 'knight-move', type: 'topdown', settings: { speed: 170, walkLook: 'builtin:img/knight_walk' } },
          { id: 'knight-health', type: 'health', settings: { max: 5 } },
          { id: 'knight-camera', type: 'cameraFollow' },
        ],
        rules: [rule('knight-hurt', { type: 'sticker', target: self, event: 'hurt' }, [sound('builtin:sfx/hurt')])],
      },
    ],
  }),
  preset({
    id: 'chasing-ghost',
    name: 'Chasing Ghost',
    genres: [T],
    description: 'A ghost that chases the player when they come close and hurts them. Takes 2 hits to defeat.',
    icon: 'builtin:img/ghost',
    kinds: [
      {
        id: 'ghost',
        name: 'Ghost',
        lookId: 'builtin:img/ghost',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 4, w: 24, h: 24 },
        stickers: [
          { id: 'ghost-chase', type: 'chase', settings: { speed: 70, range: 220 } },
          { id: 'ghost-hurt', type: 'hurts', settings: { knockback: 220 } },
          { id: 'ghost-health', type: 'health', settings: { max: 2, invincibleMs: 300 } },
          { id: 'ghost-anim', type: 'animate', settings: { fps: 4 } },
        ],
        rules: [rule('ghost-gone', { type: 'sticker', target: self, event: 'outOfHealth' }, [sound('builtin:sfx/hit')])],
      },
    ],
  }),
  preset({
    id: 'patrolling-spider',
    name: 'Patrolling Spider',
    genres: [T],
    description: 'A spider that walks up and down a corridor and hurts the player.',
    icon: 'builtin:img/spider',
    kinds: [
      {
        id: 'spider',
        name: 'Spider',
        lookId: 'builtin:img/spider',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 6, w: 24, h: 22 },
        stickers: [
          { id: 'spider-walk', type: 'patrol', settings: { axis: 'y', distance: 128, speed: 60, turnAtEdges: false } },
          { id: 'spider-hurt', type: 'hurts' },
          { id: 'spider-anim', type: 'animate', settings: { fps: 6 } },
        ],
      },
    ],
  }),
  preset({
    id: 'treasure-chest',
    name: 'Treasure Chest',
    genres: [T],
    description: 'Opens the first time the player touches it and adds 10 to Gold.',
    icon: 'builtin:img/chest',
    kinds: [
      {
        id: 'chest',
        name: 'Treasure Chest',
        lookId: 'builtin:img/chest',
        size: { w: 32, h: 32 },
        stickers: [{ id: 'chest-touch', type: 'collectible', settings: { disappear: false, sound: null } }],
        values: [{ id: 'chest-opened', name: 'Opened', scope: 'object', type: 'bool', start: false }],
        rules: [
          rule(
            'chest-open',
            { type: 'sticker', target: self, event: 'collected' },
            [
              { type: 'changeValue', value: { valueId: 'chest-opened' }, op: 'set', amount: { lit: true } },
              { type: 'changeLook', target: self, assetId: 'builtin:img/chest_open' },
              sound('builtin:sfx/powerup'),
              add('gold', 10),
            ],
            [{ type: 'compare', value: { valueId: 'chest-opened' }, op: 'eq', to: { lit: false } }],
          ),
        ],
      },
    ],
    values: [gameValue('gold', 'Gold')],
  }),
  preset({
    id: 'locked-door',
    name: 'Locked Door',
    genres: [T, P],
    description: 'A solid door and its key. Collecting the key opens every door. Place the Key Kind somewhere to find.',
    icon: 'builtin:img/door',
    kinds: [
      {
        id: 'door',
        name: 'Door',
        lookId: 'builtin:img/door',
        size: { w: 32, h: 64 },
        stickers: [{ id: 'door-solid', type: 'solid' }],
        rules: [
          rule('door-open', { type: 'valueReaches', value: { valueId: 'keys' }, amount: lit(1) }, [
            sound('builtin:sfx/select'),
            { type: 'destroy', target: self },
          ]),
        ],
      },
      {
        id: 'key',
        name: 'Key',
        lookId: 'builtin:img/key',
        size: { w: 32, h: 32 },
        hitbox: { x: 4, y: 8, w: 24, h: 16 },
        stickers: [{ id: 'key-collect', type: 'collectible', settings: { sound: 'builtin:sfx/powerup' } }],
        rules: [rule('key-get', { type: 'sticker', target: self, event: 'collected' }, [add('keys', 1)])],
      },
    ],
    values: [gameValue('keys', 'Keys')],
  }),
  preset({
    id: 'gem',
    name: 'Gem',
    genres: [T, P],
    description: 'A sparkling gem. Collecting it adds 1 to Gems.',
    icon: 'builtin:img/gem',
    kinds: [
      {
        id: 'gem',
        name: 'Gem',
        lookId: 'builtin:img/gem',
        size: { w: 32, h: 32 },
        hitbox: { x: 6, y: 6, w: 20, h: 20 },
        stickers: [{ id: 'gem-collect', type: 'collectible' }],
        rules: [rule('gem-count', { type: 'sticker', target: self, event: 'collected' }, [add('gems', 1)])],
      },
    ],
    values: [gameValue('gems', 'Gems')],
  }),
  preset({
    id: 'health-potion',
    name: 'Health Potion',
    genres: [T],
    description: 'A potion that gives one extra life when collected.',
    icon: 'builtin:img/potion',
    kinds: [
      {
        id: 'potion',
        name: 'Health Potion',
        lookId: 'builtin:img/potion',
        size: { w: 32, h: 32 },
        hitbox: { x: 8, y: 4, w: 16, h: 24 },
        stickers: [{ id: 'potion-collect', type: 'collectible', settings: { sound: 'builtin:sfx/powerup' } }],
        rules: [rule('potion-life', { type: 'sticker', target: self, event: 'collected' }, [add('lives', 1)])],
      },
    ],
    values: [gameValue('lives', 'Lives', 3, { min: 0 })],
  }),

  // ---------- Clicker ----------
  preset({
    id: 'cookie',
    name: 'Cookie',
    genres: [C],
    description: 'A big cookie. Every click adds Per Click to Coins.',
    icon: 'builtin:img/cookie',
    kinds: [
      {
        id: 'cookie',
        name: 'Cookie',
        lookId: 'builtin:img/cookie',
        size: { w: 128, h: 128 },
        stickers: [{ id: 'cookie-click', type: 'clickable' }],
        rules: [rule('cookie-coins', { type: 'clicked', target: self }, [add('coins', { ref: { valueId: 'per-click' } })])],
      },
    ],
    values: [gameValue('coins', 'Coins', 0, { remember: true }), gameValue('per-click', 'Per Click', 1, { remember: true })],
  }),
  preset({
    id: 'upgrade-button',
    name: 'Upgrade Button',
    genres: [C],
    description: 'Click it to spend Upgrade Cost coins for +1 Per Click. Each upgrade costs 10 more.',
    icon: 'builtin:img/button_green',
    kinds: [
      {
        id: 'upgrade',
        name: 'Upgrade Button',
        lookId: 'builtin:img/button_green',
        size: { w: 96, h: 32 },
        stickers: [{ id: 'upgrade-click', type: 'clickable' }],
        rules: [
          rule(
            'upgrade-buy',
            { type: 'clicked', target: self },
            [
              { type: 'changeValue', value: { valueId: 'coins' }, op: 'subtract', amount: { ref: { valueId: 'cost' } } },
              add('per-click', 1),
              add('cost', 10),
              sound('builtin:sfx/powerup'),
            ],
            [{ type: 'compare', value: { valueId: 'coins' }, op: 'ge', to: { ref: { valueId: 'cost' } } }],
          ),
          rule(
            'upgrade-poor',
            { type: 'clicked', target: self },
            [sound('builtin:sfx/error'), { type: 'showText', text: 'You need {Upgrade Cost} coins', seconds: lit(1.5) }],
            [{ type: 'compare', value: { valueId: 'coins' }, op: 'lt', to: { ref: { valueId: 'cost' } } }],
          ),
        ],
      },
    ],
    values: [
      gameValue('coins', 'Coins', 0, { remember: true }),
      gameValue('per-click', 'Per Click', 1, { remember: true }),
      gameValue('cost', 'Upgrade Cost', 10, { remember: true }),
    ],
  }),
  preset({
    id: 'auto-clicker',
    name: 'Auto Clicker',
    genres: [C],
    description: 'A little helper that adds 1 coin every second. Place more helpers to earn faster.',
    icon: 'builtin:img/alien_yellow',
    kinds: [
      {
        id: 'helper',
        name: 'Helper',
        lookId: 'builtin:img/alien_yellow',
        size: { w: 32, h: 32 },
        stickers: [{ id: 'helper-anim', type: 'animate', settings: { fps: 4 } }],
        rules: [rule('helper-earn', { type: 'every', seconds: lit(1) }, [add('coins', 1)])],
      },
    ],
    values: [gameValue('coins', 'Coins', 0, { remember: true })],
  }),
  preset({
    id: 'falling-gold-coin',
    name: 'Falling Gold Coin',
    genres: [C, P],
    description: 'A big gold coin that falls. Click it before it lands to grab 5 Gold.',
    icon: 'builtin:img/coin_big',
    kinds: [
      {
        id: 'gold-coin',
        name: 'Gold Coin',
        lookId: 'builtin:img/coin_big',
        size: { w: 64, h: 64 },
        stickers: [
          { id: 'gold-fall', type: 'falls', settings: { gravity: 300, maxFall: 200 } },
          { id: 'gold-click', type: 'clickable', settings: { sound: 'builtin:sfx/coin' } },
        ],
        rules: [rule('gold-grab', { type: 'clicked', target: self }, [add('gold', 5), { type: 'destroy', target: self }])],
      },
    ],
    values: [gameValue('gold', 'Gold')],
  }),
  preset({
    id: 'coin-fountain',
    name: 'Coin Fountain',
    genres: [C],
    description: 'Drops a clickable gold coin every 2 seconds. Each coin you click adds 5 Gold.',
    icon: 'builtin:img/banner',
    kinds: [
      {
        id: 'fountain',
        name: 'Coin Fountain',
        lookId: 'builtin:img/banner',
        size: { w: 96, h: 32 },
        rules: [
          rule('fountain-drop', { type: 'every', seconds: lit(2) }, [
            { type: 'create', kindId: 'fountain-coin', place: { atTarget: self } },
          ]),
        ],
      },
      {
        id: 'fountain-coin',
        name: 'Fountain Coin',
        lookId: 'builtin:img/coin_big',
        size: { w: 64, h: 64 },
        stickers: [
          { id: 'fcoin-fall', type: 'falls', settings: { gravity: 300, maxFall: 200 } },
          { id: 'fcoin-click', type: 'clickable', settings: { sound: 'builtin:sfx/coin' } },
        ],
        rules: [rule('fcoin-grab', { type: 'clicked', target: self }, [add('gold', 5), { type: 'destroy', target: self }])],
      },
    ],
    values: [gameValue('gold', 'Gold')],
  }),
  preset({
    id: 'donut',
    name: 'Donut',
    genres: [C],
    description: 'A donut that wobbles when clicked and adds 1 to Donuts each time.',
    icon: 'builtin:img/donut',
    kinds: [
      {
        id: 'donut',
        name: 'Donut',
        lookId: 'builtin:img/donut',
        size: { w: 128, h: 128 },
        stickers: [{ id: 'donut-click', type: 'clickable', settings: { sound: 'builtin:sfx/select' } }],
        rules: [rule('donut-count', { type: 'clicked', target: self }, [add('donuts', 1), { type: 'shakeCamera', seconds: lit(0.1) }])],
      },
    ],
    values: [gameValue('donuts', 'Donuts')],
  }),
];
