import type { ReactNode } from 'react';
import type { Project } from '@/model/schema';
import type { Library } from './assets/library';
import { AssetBrowser } from './assets/AssetBrowser';
import { ScenesPanel } from './scenes/ScenesPanel';
import { TilePainter } from './tiles/TilePainter';
import { Inspector } from './inspector/Inspector';

export interface PanelProps {
  project: Project;
  lib: Library;
}

export interface PanelTab {
  id: string;
  label: string;
  /** Small count shown on the tab (e.g. number of warnings). */
  badge?: (p: PanelProps) => number;
  render: (p: PanelProps) => ReactNode;
}

/** Left sidebar: things you put into the world. */
export const LEFT_TABS: PanelTab[] = [
  { id: 'art', label: 'Art', render: (p) => <AssetBrowser {...p} /> },
  { id: 'tiles', label: 'Tiles', render: (p) => <TilePainter {...p} /> },
  { id: 'scenes', label: 'Scenes', render: (p) => <ScenesPanel {...p} /> },
];

/** Right sidebar: what things do. */
export const RIGHT_TABS: PanelTab[] = [{ id: 'inspect', label: 'Inspect', render: (p) => <Inspector {...p} /> }];
