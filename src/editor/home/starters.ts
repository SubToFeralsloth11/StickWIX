import type { Project } from '@/model/schema';

export interface Starter {
  id: string;
  name: string;
  description: string;
  color: string;
  thumb: string;
  create(name: string): Project;
}

/** Starter games offered in the New game dialog (filled from src/presets once the preset layer lands). */
export const STARTERS: Starter[] = [];
