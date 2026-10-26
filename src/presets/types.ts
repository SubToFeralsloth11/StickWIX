import type { Kind, ProjectInput, Rule, Value } from '../model/schema';

/** Shipped, read-only presets (data-model.md "Preset"). Inserted copies keep no link to them (FR-027). */

export const GENRES = ['platformer', 'topdown', 'clicker'] as const;
export type Genre = (typeof GENRES)[number];

/** A complete game to start from (FR-024). */
export interface StarterPreset {
  id: string;
  name: string;
  genre: Genre;
  description: string;
  /** How to play, shown on the starter card. */
  controls: string;
  /** Built-in image key for the card. */
  icon: string;
  project: ProjectInput;
}

/** Kinds bundled with their game values and rules (FR-025). */
export interface ObjectPreset {
  id: string;
  name: string;
  genres: Genre[];
  description: string;
  /** Built-in image key for the palette. */
  icon: string;
  kinds: Kind[];
  /** Game-wide values the preset's rules use. */
  values: Value[];
  /** Game rules; Kind rules live inside `kinds`. */
  rules: Rule[];
  /** The Kind placed where the preset is dropped. */
  mainKindId: string;
}

/** A rule with unset blanks for the child to fill in (FR-026). */
export interface RulePreset {
  id: string;
  name: string;
  genres: Genre[];
  description: string;
  rule: Rule;
}
