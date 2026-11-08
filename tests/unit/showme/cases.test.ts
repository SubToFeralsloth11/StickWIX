import { describe, expect, it } from 'vitest';
import { Project, type Rule } from '@/model/schema';
import { sentenceText } from '@/model/sentence';
import { createGame, type Game } from '@/runtime/game';
import { describeEvent, worldFacts } from '@/showme/facts';
import { generalise } from '@/showme/generalise';
import { ShowMeSession, type Intent } from '@/showme/session';
import { toRule } from '@/showme/to-rule';
import { project, type Spec } from '../../fixtures/build';

const FLOOR = ['....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '....................', '####################'];

/** Plays `act`, opens Show-me, picks the event described as `pick`, acts out `intents`, and returns the rule. */
function teach(spec: Spec, act: (g: Game) => void, pick: string, intents: (g: Game) => Intent[], onlyThis = false) {
  const p = project(spec);
  const g = createGame(p, { seed: 1 });
  act(g);
  const s = new ShowMeSession(g);
  const world = g.scene.world;
  const ev = s.events.find((e) => describeEvent(e.event, p, world) === pick);
  if (!ev) throw new Error(`No "${pick}" in: ${s.events.map((e) => describeEvent(e.event, p, world)).join(' | ')}`);
  s.pick(ev);
  for (const i of intents(g)) s.log(i);
  const facts = worldFacts(world);
  const gen = generalise(ev.event, facts, onlyThis);
  const rule = toRule('shown', gen.trigger, gen, s.intents, facts)!;
  s.close();
  return { p, rule };
}

/** The project with the taught rule added to the first scene, for the "next Play" check. */
function withRule(p: Project, rule: Rule) {
  const q = structuredClone(p);
  q.scenes[0]!.rules.push(rule);
  return Project.parse(q);
}

const clickAt = (g: Game, x: number, y: number) => {
  g.input.mouseDown(x, y);
  g.run(1);
  g.input.mouseUp(x, y);
  g.run(1);
};

describe('Show-me scripted cases (SC-005)', () => {
  const platformer: Spec = {
    tiles: FLOOR,
    kinds: [
      { id: 'hero', name: 'Hero', stickers: [{ type: 'platformer' }] },
      { id: 'coin', name: 'Coin' },
      { id: 'flag', name: 'Flag' },
      { id: 'slime', name: 'Slime' },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 20, y: 288 },
      { id: 'c1', kind: 'coin', x: 100, y: 288 },
      { id: 'c2', kind: 'coin', x: 200, y: 288 },
      { id: 'f', kind: 'flag', x: 500, y: 288 },
      { id: 'e', kind: 'slime', x: 400, y: 288 },
    ],
    values: [{ id: 'score', name: 'Score', start: 0 }, { id: 'lives', name: 'Lives', start: 3 }],
    extraScenes: [{ id: 's2', name: 'Level 2' }],
  };
  const walkInto = (id: string) => (g: Game) => {
    const h = g.scene.world.get('h')!;
    const t = g.scene.world.get(id)!;
    h.x = t.x - 20;
    g.run(2);
  };

  it('1. platformer: collect coins', () => {
    const { p, rule } = teach(platformer, walkInto('c1'), 'Hero touched Coin', () => [
      { type: 'destroy', instId: 'c1' },
      { type: 'value', valueId: 'score', op: 'add', amount: 1 },
    ]);
    expect(sentenceText(rule, p)).toBe('When Hero touches any Coin → that Coin disappears and Score goes up by 1.');
    // Next Play: every coin is collectable.
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.input.keyDown('ArrowRight');
    g.run(90);
    expect(g.scene.world.byKind('coin')).toHaveLength(0);
    expect(g.values.get('score')).toBe(2);
  });

  it('2. platformer: reach the flag to go to the next level', () => {
    const { p, rule } = teach(platformer, walkInto('f'), 'Hero touched Flag', () => [{ type: 'scene', sceneId: 's2' }]);
    expect(sentenceText(rule, p)).toBe('When Hero touches Flag → go to scene Level 2.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.scene.world.get('h')!.x = 480;
    g.run(3);
    expect(g.scene.scene.id).toBe('s2');
  });

  it('3. platformer: a sound when Space is pressed', () => {
    const { p, rule } = teach(platformer, (g) => {
      g.input.keyDown('Space');
      g.run(2);
    }, 'Space was pressed', () => [{ type: 'sound', assetId: 'builtin:sfx/jump' }]);
    expect(sentenceText(rule, p)).toBe('When Space is pressed → play sound Jump.');
  });

  it('4. platformer: touching the slime costs a life and sends the hero back', () => {
    const { p, rule } = teach(platformer, walkInto('e'), 'Hero touched Slime', () => [
      { type: 'value', valueId: 'lives', op: 'subtract', amount: 1 },
      { type: 'move', instId: 'h', x: 20, y: 288 },
    ]);
    expect(sentenceText(rule, p)).toBe('When Hero touches Slime → Lives goes down by 1 and Hero moves to 20, 288.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.scene.world.get('h')!.x = 390;
    g.run(2);
    expect(g.values.get('lives')).toBe(2);
    expect(g.scene.world.get('h')!.x).toBeLessThan(40);
  });

  const topdown: Spec = {
    kinds: [
      { id: 'knight', name: 'Knight', stickers: [{ type: 'topdown' }] },
      { id: 'gem', name: 'Gem' },
      { id: 'key', name: 'Key' },
      { id: 'door', name: 'Door' },
      { id: 'ghost', name: 'Ghost' },
    ],
    objects: [
      { id: 'k', kind: 'knight', x: 100, y: 100 },
      { id: 'g1', kind: 'gem', x: 200, y: 100 },
      { id: 'g2', kind: 'gem', x: 300, y: 100 },
      { id: 'key1', kind: 'key', x: 100, y: 200 },
      { id: 'd', kind: 'door', x: 500, y: 100 },
      { id: 'gh1', kind: 'ghost', x: 400, y: 300 },
      { id: 'gh2', kind: 'ghost', x: 450, y: 300 },
    ],
    values: [{ id: 'gems', name: 'Gems', start: 0 }],
  };
  const knightTo = (id: string) => (g: Game) => {
    const k = g.scene.world.get('k')!;
    const t = g.scene.world.get(id)!;
    k.x = t.x;
    k.y = t.y;
    g.run(2);
  };

  it('5. top-down: pick up gems', () => {
    const { p, rule } = teach(topdown, knightTo('g1'), 'Knight touched Gem', () => [
      { type: 'destroy', instId: 'g1' },
      { type: 'value', valueId: 'gems', op: 'add', amount: 1 },
    ]);
    expect(sentenceText(rule, p)).toBe('When Knight touches any Gem → that Gem disappears and Gems goes up by 1.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.input.keyDown('ArrowRight');
    g.run(90);
    expect(g.values.get('gems')).toBe(2);
  });

  it('6. top-down: the key hides the door', () => {
    const { p, rule } = teach(topdown, knightTo('key1'), 'Knight touched Key', () => [
      { type: 'destroy', instId: 'key1' },
      { type: 'visibility', instId: 'd', hidden: true },
    ]);
    expect(sentenceText(rule, p)).toBe('When Knight touches Key → Key disappears and Door hides.');
  });

  it('7. top-down: a ghost touching the knight, "only this one" ghost', () => {
    const { p, rule } = teach(topdown, knightTo('gh1'), 'Knight touched Ghost', () => [{ type: 'move', instId: 'k', x: 64, y: 64 }], true);
    expect(sentenceText(rule, p)).toBe('When Knight touches Ghost → Knight moves to 64, 64.');
    expect(rule.trigger).toMatchObject({ type: 'touches', b: { t: 'object', id: 'gh1' } });
  });

  const clicker: Spec = {
    kinds: [
      { id: 'cookie', name: 'Cookie', w: 128, h: 128 },
      { id: 'coin', name: 'Coin' },
    ],
    objects: [{ id: 'ck', kind: 'cookie', x: 256, y: 116 }],
    values: [{ id: 'coins', name: 'Coins', start: 0 }],
    ui: [{ id: 'reset', name: 'Reset', type: 'button', x: 16, y: 16, text: 'Reset' }],
  };

  it('8. clicker: clicking the cookie earns coins (two presses merge)', () => {
    const { p, rule } = teach(clicker, (g) => clickAt(g, 320, 180), 'Cookie was clicked', () => [
      { type: 'value', valueId: 'coins', op: 'add', amount: 1 },
      { type: 'value', valueId: 'coins', op: 'add', amount: 1 },
    ]);
    expect(sentenceText(rule, p)).toBe('When Cookie is clicked → Coins goes up by 2.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    clickAt(g, 320, 180);
    clickAt(g, 320, 180);
    expect(g.values.get('coins')).toBe(4);
  });

  it('9. clicker: a button resets coins and drops a coin', () => {
    const { p, rule } = teach(clicker, (g) => clickAt(g, 30, 30), 'Reset was clicked', () => [
      { type: 'value', valueId: 'coins', op: 'set', amount: 0 },
      { type: 'create', kindId: 'coin', x: 300, y: 40 },
    ]);
    expect(sentenceText(rule, p)).toBe('When Reset is clicked → Coins becomes 0 and create a Coin at 300, 40.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.values.set('coins', 9);
    clickAt(g, 30, 30);
    expect(g.values.get('coins')).toBe(0);
    expect(g.scene.world.byKind('coin')).toHaveLength(1);
  });

  it('10. clicker: when coins change, the cookie changes its look', () => {
    const { p, rule } = teach(
      clicker,
      (g) => {
        g.values.set('coins', 5);
        g.run(1);
      },
      'Coins changed to 5',
      () => [{ type: 'look', instId: 'ck', assetId: 'builtin:img/donut' }],
    );
    expect(sentenceText(rule, p)).toBe('When Coins changes → Cookie looks like Donut.');
    const g = createGame(withRule(p, rule), { seed: 1 });
    g.values.set('coins', 1);
    expect(g.scene.world.get('ck')!.lookId).toBe('builtin:img/donut');
  });
});
