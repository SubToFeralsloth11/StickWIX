/**
 * Offline understanding for the "How do I…?" assistant. No network, no model:
 * the question is normalised (contractions, punctuation), multi-word phrases
 * and synonyms are folded into shared concepts ("mine", "dig", "break a block"
 * → `break`), misspellings are corrected against the known vocabulary, and the
 * result is ranked against every recipe with BM25 plus phrase (bigram) and
 * concept bonuses.
 */

const STOP = new Set(
  ('a an the to of and or i im me my mine? we you your it its is are be am was were do does did doing can could should would will ' +
    'want wanna need trying try tried how what way ways there their them they this that these those in on at for with into onto from ' +
    'so if then just like some any something thing things stuff get got make makes making made let lets have has had please help ' +
    'game games stickwix about also really very much more one when where which who why while by up out as not but im ive id possible ' +
    'able know tell show using use used new still only own whenever every each')
    .split(' ')
    .filter((w) => !w.endsWith('?')),
);
// "every", "when", "up", "out" carry meaning in some phrases; phrases run before stop words are dropped.

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan'?t\b/g, 'can not'],
  [/\bwon'?t\b/g, 'will not'],
  [/\b(\w+)n't\b/g, '$1 not'],
  [/\b(\w+)'(s|re|ve|ll|d|m)\b/g, '$1'],
];

/**
 * Multi-word phrases and synonyms → one concept token. Phrases are matched on
 * the normalised text first (longest first), single words after stemming.
 */
const CONCEPTS: Record<string, string[]> = {
  break: ['break', 'mine', 'mining', 'dig', 'digging', 'destroy block', 'smash', 'crack', 'chop', 'breakable', 'pickaxe', 'pick axe', 'harvest'],
  hold: ['hold', 'holding', 'held', 'hold down', 'press and hold', 'long press', 'keep pressing', 'keep clicking', 'for some time', 'amount of time', 'for a while', 'long click'],
  place: ['place', 'placing', 'build', 'building', 'put block', 'put down', 'spawn block', 'stack'],
  block: ['block', 'blocks', 'brick', 'dirt', 'stone', 'cube', 'minecraft', 'terraria', 'sandbox', 'voxel'],
  tile: ['tile', 'tiles', 'tilemap', 'tile map', 'grid world', 'ground tile'],
  grid: ['grid', 'snap', 'snapping', 'snapped', 'align', 'line up'],
  cursor: ['cursor', 'pointer', 'mouse pointer', 'mouse icon', 'crosshair', 'cross hair', 'reticle', 'aim icon', 'mouse arrow', 'arrow'],
  lock: ['lock', 'locked', 'capture', 'confine', 'outside the game', 'leave the window', 'leaves the window', 'goes outside', 'grab mouse', 'pointer lock', 'mouse lock', 'fps mouse', 'cursor lock'],
  hide: ['hide', 'hidden', 'invisible', 'disappear', 'vanish', 'remove', 'delete', 'get rid'],
  show: ['show', 'appear', 'visible', 'reveal', 'unhide'],
  animation: ['animation', 'animations', 'animate', 'animated', 'anim', 'frames', 'frame', 'flipbook', 'flip book', 'walk cycle', 'sprite sheet', 'spritesheet', 'moving picture'],
  always: ['always', 'all the time', 'constantly', 'forever', 'keeps playing', 'nonstop', 'automatically', 'by itself'],
  stop: ['stop', 'stops', 'pause', 'freeze', 'halt', 'still'],
  different: ['different', 'separate', 'various', 'multiple', 'several', 'each', 'per', 'specific', 'certain'],
  walk: ['walk', 'walking', 'run', 'running', 'moving', 'move animation', 'idle', 'standing'],
  button: ['button', 'buttons', 'menu button', 'ui button', 'start button', 'play button', 'menu', 'main menu', 'title screen'],
  click: ['click', 'clicked', 'clicking', 'tap', 'tapped', 'press on', 'mouse press', 'left click'],
  rightclick: ['right click', 'right clicked', 'right clicking', 'rightclick', 'right mouse', 'right button', 'secondary click'],
  mouse: ['mouse', 'mice', 'trackpad', 'touchpad'],
  wheel: ['wheel', 'scroll', 'scrolling', 'scroll wheel', 'mouse wheel'],
  hover: ['hover', 'hovering', 'mouse over', 'mouseover', 'moves onto', 'roll over', 'rollover'],
  follow: ['follow', 'follows', 'following', 'track', 'chase', 'stick to', 'attached'],
  camera: ['camera', 'view', 'viewport', 'scroll screen', 'screen follow'],
  zoom: ['zoom', 'zoomed', 'closer', 'magnify'],
  shake: ['shake', 'shaking', 'wobble', 'rumble', 'screen shake'],
  jump: ['jump', 'jumping', 'hop', 'leap'],
  double: ['double', 'twice', 'two times', 'air jump', 'multi jump', 'triple'],
  gravity: ['gravity', 'fall', 'falling', 'drop down'],
  platformer: ['platformer', 'platform game', 'mario', 'side scroller', 'sidescroller'],
  topdown: ['top down', 'topdown', 'zelda', 'rpg', 'birds eye'],
  shoot: ['shoot', 'shooting', 'shot', 'fire', 'firing', 'bullet', 'bullets', 'gun', 'projectile', 'laser', 'arrow shot'],
  enemy: ['enemy', 'enemies', 'monster', 'monsters', 'zombie', 'mob', 'mobs', 'baddie', 'villain', 'creature'],
  health: ['health', 'hp', 'hearts', 'lives', 'life', 'hit points', 'damage', 'hurt'],
  bar: ['bar', 'progress bar', 'meter', 'gauge', 'health bar', 'loading bar'],
  score: ['score', 'points', 'coins', 'money', 'counter', 'count', 'tally'],
  value: ['value', 'values', 'variable', 'variables', 'var', 'number', 'stat', 'stats', 'store', 'remember'],
  save: ['save', 'saving', 'remember between', 'high score', 'highscore', 'keep after', 'persist', 'best score'],
  text: ['text', 'label', 'words', 'message on screen', 'display', 'writing', 'caption', 'hud'],
  say: ['say', 'speech', 'speech bubble', 'talk', 'dialogue', 'dialog', 'chat bubble', 'npc talk'],
  sound: ['sound', 'sounds', 'sfx', 'noise', 'audio', 'effect sound'],
  music: ['music', 'song', 'soundtrack', 'background music', 'bgm', 'tune'],
  volume: ['volume', 'louder', 'quieter', 'mute'],
  scene: ['scene', 'scenes', 'level', 'levels', 'stage', 'world', 'room', 'screen change', 'next level'],
  over: ['game over', 'lose', 'losing', 'die', 'dies', 'death', 'dead', 'respawn', 'restart', 'try again'],
  win: ['win', 'winning', 'victory', 'finish', 'goal', 'complete level', 'beat'],
  timer: ['timer', 'countdown', 'count down', 'seconds', 'time limit', 'clock', 'stopwatch', 'delay', 'later', 'wait'],
  every: ['every', 'repeat', 'repeatedly', 'loop', 'again and again', 'each second', 'interval'],
  frame: ['every frame', 'each frame', 'continuously', 'tick', 'update loop', 'forever loop'],
  random: ['random', 'randomly', 'chance', 'dice', 'luck', 'percent'],
  spawn: ['spawn', 'spawner', 'create', 'creates', 'generate', 'appear new', 'clone', 'copy', 'duplicate'],
  collect: ['collect', 'collectible', 'pick up', 'pickup', 'grab item', 'item', 'items', 'loot', 'inventory'],
  touch: ['touch', 'touches', 'touching', 'collide', 'collision', 'hit', 'bump', 'overlap', 'contact'],
  untouch: ['stop touching', 'stops touching', 'leave', 'leaves', 'exit', 'no longer touching'],
  key: ['key', 'keys', 'keyboard', 'press', 'pressed', 'wasd', 'arrow keys', 'spacebar', 'space bar'],
  message: ['message', 'broadcast', 'signal', 'event', 'tell other', 'communicate', 'trigger other rule'],
  condition: ['if', 'only if', 'condition', 'check', 'unless', 'not', 'otherwise', 'else', 'becomes true', 'while'],
  math: ['math', 'maths', 'calculate', 'add', 'multiply', 'divide', 'equation', 'formula', 'round', 'distance', 'angle'],
  position: ['position', 'x position', 'y position', 'coordinate', 'coordinates', 'location'],
  attack: ['attack', 'attacks', 'swing', 'sword', 'punch', 'slash', 'kick', 'melee'],
  hazard: ['lava', 'spike', 'spikes', 'trap', 'traps', 'acid', 'poison', 'fire pit', 'kill', 'kills', 'killed', 'deadly', 'instant death'],
  rotate: ['rotate', 'rotation', 'turn', 'spin', 'spinning', 'angle', 'face', 'point at', 'aim', 'aiming', 'look at'],
  size: ['size', 'bigger', 'smaller', 'grow', 'shrink', 'scale', 'resize'],
  color: ['color', 'colour', 'tint', 'red', 'flash color', 'recolor'],
  transparent: ['transparent', 'see through', 'opacity', 'fade', 'ghost', 'alpha'],
  particle: ['particle', 'particles', 'sparks', 'explosion', 'explode', 'burst', 'confetti', 'effect'],
  glide: ['glide', 'slide', 'smooth move', 'tween', 'move smoothly', 'ease'],
  drag: ['drag', 'dragging', 'drag and drop', 'draggable', 'pick up with mouse'],
  wander: ['wander', 'roam', 'random walk', 'patrol', 'walk around', 'animals'],
  fullscreen: ['fullscreen', 'full screen', 'whole screen', 'maximize'],
  slowmo: ['slow motion', 'slowmo', 'slow down time', 'speed up time', 'bullet time', 'time scale'],
  wrap: ['wrap', 'wrap around', 'other side', 'asteroids', 'pac man', 'pacman', 'teleport edge'],
  edge: ['edge', 'edges', 'border', 'boundary', 'bounds', 'stay inside', 'leave screen', 'off screen'],
  draw: ['draw', 'drawing', 'paint', 'pixel art', 'pixel editor', 'my own picture', 'custom art', 'sprite', 'costume', 'skin'],
  import: ['import', 'upload', 'png', 'mp3', 'wav', 'my own sound', 'my own image'],
  export: ['export', 'share', 'publish', 'html', 'send to friend', 'download game', 'post online'],
  rule: ['rule', 'rules', 'code', 'coding', 'script', 'scripting', 'logic', 'program', 'blocks', 'block coding', 'scratch'],
  board: ['block board', 'node', 'nodes', 'graph', 'wires', 'lines', 'connected', 'visual scripting', 'blueprint', 'flowchart', 'glowing'],
  showme: ['show me', 'showme', 'act out', 'record', 'teach'],
  pausegame: ['pause menu', 'pause key', 'pause game', 'pause button', 'paused'],
  settings: ['settings', 'options', 'preferences', 'config', 'setup'],
  resolution: ['screen size', 'resolution', 'window size', 'aspect', 'widescreen', 'portrait'],
  undo: ['undo', 'redo', 'mistake', 'go back', 'revert'],
  find: ['find', 'search', 'look for', 'where is', 'navigate', 'shortcut', 'shortcuts', 'hotkey', 'hotkeys'],
  hotbar: ['hotbar', 'hot bar', 'slot', 'slots', 'select item', 'selected block', 'choose block', 'which block'],
  door: ['door', 'portal', 'teleport', 'exit door', 'warp'],
  ladder: ['ladder', 'climb', 'climbing', 'wall'],
  moving: ['moving platform', 'elevator', 'lift', 'moves back and forth', 'back and forth'],
  speed: ['speed', 'faster', 'slower', 'velocity', 'quick', 'fast', 'slow'],
  push: ['push', 'knockback', 'knock back', 'bounce', 'launch', 'shove', 'trampoline', 'spring'],
  layer: ['layer', 'layers', 'in front', 'behind', 'front', 'back', 'z order', 'draw order'],
};

/** Very small English stemmer: enough to fold plurals and -ing/-ed forms together. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) {
    const b = w.slice(0, -3);
    return /(.)\1$/.test(b) && !/(ll|ss)$/.test(b) ? b.slice(0, -1) : b;
  }
  if (w.endsWith('ed') && w.length > 4) {
    const b = w.slice(0, -2);
    return /(.)\1$/.test(b) && !/(ll|ss)$/.test(b) ? b.slice(0, -1) : b;
  }
  if (w.endsWith('es') && /(sh|ch|x|ss|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

export function normalise(text: string): string {
  let s = ` ${text.toLowerCase()} `;
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  return s
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PhraseRule {
  words: string[];
  concept: string;
}

const PHRASES: PhraseRule[] = [];
const WORD_CONCEPT = new Map<string, string>();
for (const [concept, list] of Object.entries(CONCEPTS))
  for (const p of list) {
    const words = normalise(p).split(' ').map(stem);
    if (words.length > 1) PHRASES.push({ words, concept });
    else if (!WORD_CONCEPT.has(words[0]!)) WORD_CONCEPT.set(words[0]!, concept);
  }
PHRASES.sort((a, b) => b.words.length - a.words.length);

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps), capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length]![b.length]!;
}

/** Turns text into concept tokens, correcting misspellings against `vocab` (stemmed words seen anywhere). */
export function analyse(text: string, vocab?: Set<string>): string[] {
  const raw = normalise(text).split(' ').filter(Boolean);
  // Spelling first, so "minning" and "curser" still join their phrases and concepts.
  const words = raw.map((w) => {
    const s = stem(w);
    if (!vocab || vocab.has(s) || STOP.has(w) || /^\d+$/.test(w) || s.length < 4) return s;
    let best = s;
    let bestD = s.length >= 7 ? 2 : 1;
    for (const v of vocab) {
      // Typos almost always keep the first letter; this stops "sword" turning into "word".
      if (v[0] !== s[0] || Math.abs(v.length - s.length) > bestD) continue;
      const dist = editDistance(s, v, bestD);
      if (dist < bestD || (dist === bestD && best === s && dist <= (s.length >= 7 ? 2 : 1))) {
        best = v;
        bestD = dist;
      }
    }
    return best;
  });
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const hit = PHRASES.find((p) => p.words.every((w, k) => words[i + k] === w));
    if (hit) {
      out.push(hit.concept);
      i += hit.words.length;
      continue;
    }
    const w = words[i]!;
    const c = WORD_CONCEPT.get(w);
    if (c) out.push(c);
    else if (!STOP.has(raw[i] ?? w) && !STOP.has(w)) out.push(w);
    i++;
  }
  return out;
}

export interface Doc {
  id: string;
  /** Weighted texts: the title and example questions count most. */
  fields: { text: string; weight: number }[];
}

interface Indexed {
  id: string;
  tf: Map<string, number>;
  bigrams: Set<string>;
  len: number;
}

export interface Ranked {
  id: string;
  score: number;
  /** 0..1, how sure the match is (top score relative to a strong match). */
  confidence: number;
}

/** BM25 index over recipes, with spelling correction against everything the recipes say. */
export class Matcher {
  private docs: Indexed[] = [];
  private df = new Map<string, number>();
  private avg = 1;
  readonly vocab = new Set<string>();

  constructor(docs: Doc[]) {
    for (const list of Object.values(CONCEPTS)) for (const p of list) for (const w of normalise(p).split(' ')) if (w.length >= 4) this.vocab.add(stem(w));
    for (const d of docs) for (const f of d.fields) for (const w of normalise(f.text).split(' ')) if (w.length >= 4 && !STOP.has(w)) this.vocab.add(stem(w));
    for (const d of docs) {
      const tf = new Map<string, number>();
      const bigrams = new Set<string>();
      let len = 0;
      for (const f of d.fields) {
        const toks = analyse(f.text);
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + f.weight);
        for (let i = 1; i < toks.length; i++) bigrams.add(`${toks[i - 1]} ${toks[i]}`);
        len += toks.length * f.weight;
      }
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ id: d.id, tf, bigrams, len });
    }
    this.avg = this.docs.reduce((n, d) => n + d.len, 0) / Math.max(1, this.docs.length);
  }

  rank(query: string, limit = 6): Ranked[] {
    const q = analyse(query, this.vocab);
    if (!q.length) return [];
    const uniq = [...new Set(q)];
    const qBigrams = new Set<string>();
    for (let i = 1; i < q.length; i++) qBigrams.add(`${q[i - 1]} ${q[i]}`);
    const N = this.docs.length;
    const k1 = 1.4;
    const b = 0.6;
    const scored = this.docs.map((d) => {
      let s = 0;
      let covered = 0;
      for (const t of uniq) {
        const f = d.tf.get(t);
        if (!f) continue;
        covered++;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avg)));
      }
      for (const bg of qBigrams) if (d.bigrams.has(bg)) s += 1.5;
      // Reward recipes that explain most of what was asked, not one word of it.
      s *= 0.6 + 0.4 * (covered / uniq.length);
      return { id: d.id, score: s };
    });
    scored.sort((x, y) => y.score - x.score);
    const top = scored[0]?.score ?? 0;
    return scored
      .filter((r) => r.score > 0 && r.score >= top * 0.25)
      .slice(0, limit)
      .map((r) => ({ ...r, confidence: Math.min(1, r.score / 9) }));
  }
}
