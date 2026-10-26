import type { ProjectInput } from '../model/schema';
import clicker from './starter/clicker.json';
import platformer from './starter/platformer.json';
import topdown from './starter/topdown.json';
import type { StarterPreset } from './types';

export { GENRES, type Genre, type ObjectPreset, type RulePreset, type StarterPreset } from './types';
export { OBJECT_PRESETS } from './objects';
export { RULE_PRESETS } from './rules';
export { insertObjectPreset, insertRulePreset, instantiateStarter } from './insert';

/**
 * The three starter games (FR-024). JSON infers plain strings where the schema
 * wants literals, hence the casts; `instantiateStarter` validates every document.
 */
export const STARTERS: StarterPreset[] = [
  {
    id: 'platformer',
    name: 'Platformer Adventure',
    genre: 'platformer',
    description: 'Run, jump over slimes and spikes, grab coins and reach the flag in two levels.',
    controls: 'Arrows or WASD to run, Space to jump.',
    icon: 'builtin:img/hero',
    project: platformer as unknown as ProjectInput,
  },
  {
    id: 'topdown',
    name: 'Dungeon Quest',
    genre: 'topdown',
    description: 'Explore a dungeon, fight ghosts with fireballs, find the key and collect all 5 gems.',
    controls: 'Arrows or WASD to walk, Space to throw a fireball.',
    icon: 'builtin:img/knight',
    project: topdown as unknown as ProjectInput,
  },
  {
    id: 'clicker',
    name: 'Cookie Clicker',
    genre: 'clicker',
    description: 'Click the cookie for coins, buy bigger clicks and helpers, and reach 100 coins.',
    controls: 'Click the cookie and the shop buttons.',
    icon: 'builtin:img/cookie',
    project: clicker as unknown as ProjectInput,
  },
];
