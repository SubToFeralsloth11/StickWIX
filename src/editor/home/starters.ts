import { builtinAssetUrl } from '@/assets/manifest';
import type { Project } from '@/model/schema';
import { STARTERS as PRESETS, instantiateStarter, type Genre } from '@/presets';

export interface Starter {
  id: string;
  name: string;
  description: string;
  color: string;
  thumb: string;
  create(name: string): Project;
}

const COLOR: Record<Genre, string> = { platformer: '#4caf50', topdown: '#7e57c2', clicker: '#ff9800' };

/** Starter games offered in the New game dialog (FR-024): each makes a brand-new copy of a shipped preset. */
export const STARTERS: Starter[] = PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  description: `${preset.description} ${preset.controls}`,
  color: COLOR[preset.genre],
  // 'builtin:img/hero' → 'img/hero.png' (built-in images follow this file convention).
  thumb: builtinAssetUrl(`${preset.icon.slice('builtin:'.length)}.png`),
  create(name) {
    const p = instantiateStarter(preset.project);
    p.name = name.trim().slice(0, 60) || preset.name;
    return p;
  },
}));
