import { register } from './registry';
import type { ReactNode } from 'react';
import type { Project } from '@/model/schema';
import type { Library } from './assets/library';
import { AssetBrowser } from './assets/AssetBrowser';
import { ObjectPresetPanel } from './assets/ObjectPresetPanel';
import { ScenesPanel } from './scenes/ScenesPanel';
import { TilePainter } from './tiles/TilePainter';
import { Inspector, INSPECTOR_SECTIONS } from './inspector/Inspector';
import { RulesPanel, RULES_TOOLBAR } from './rules/RulesPanel';
import { RulePresetMenu } from './rules/RulePresetMenu';
import { ValuesPanel } from './values/ValuesPanel';
import { UILayerEditor, UILayerOverlay } from './ui-layer/UILayerEditor';
import { CANVAS_OVERLAYS } from './canvas/SceneCanvas';
import { KindRulesSection } from './rules/KindRulesSection';
import { PLAY_OVERLAYS } from './play/PlayView';
import { ShowMeOverlay } from './play/ShowMeOverlay';
import { ASSET_TOOLS } from './assets/asset-tools';
import { ArtTools } from './pixel/ArtTools';
import { WarningsPanel, warningCount } from './warnings/WarningsPanel';
import { HelpMenu } from './help/HelpMenu';
import { GameSettingsPanel } from './settings/GameSettingsPanel';
import { TOP_BAR_EXTRAS } from './topbar';

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

export type SectionGroup = 'build' | 'logic' | 'game' | 'check';

/** A section on the activity rail; opens in the drawer beside it. */
export interface Section extends PanelTab {
  group: SectionGroup;
  /** One line under the drawer title (and in the command palette). */
  hint: string;
  /** Shorter label for the narrow rail. */
  short?: string;
}

export const SECTION_GROUPS: { id: SectionGroup; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'logic', label: 'Logic' },
  { id: 'game', label: 'Game' },
  { id: 'check', label: 'Check' },
];

/** Every section on the rail, in rail order (number keys 1-9 follow this order). */
export const SECTIONS: Section[] = [
  { id: 'art', group: 'build', label: 'Art', hint: 'Pictures to drag into your scene', render: (p) => <AssetBrowser {...p} /> },
  { id: 'presets', group: 'build', label: 'Presets', hint: 'Ready-to-play things: heroes, enemies, coins', render: (p) => <ObjectPresetPanel {...p} /> },
  { id: 'tiles', group: 'build', label: 'Tiles', hint: 'Paint ground, walls and platforms', render: (p) => <TilePainter {...p} /> },
  { id: 'scenes', group: 'build', label: 'Scenes', hint: 'Levels and screens of your game', render: (p) => <ScenesPanel {...p} /> },
  { id: 'rules', group: 'logic', label: 'Rules', hint: 'When something happens, do something', render: (p) => <RulesPanel {...p} /> },
  { id: 'values', group: 'logic', label: 'Values', hint: 'Score, lives, timers and other numbers', render: (p) => <ValuesPanel {...p} /> },
  { id: 'screen', group: 'logic', label: 'Screen', hint: 'Text, buttons and bars on top of the game', render: (p) => <UILayerEditor {...p} /> },
  { id: 'game', group: 'game', label: 'Game settings', short: 'Game', hint: 'Screen size, cursor and how the whole game behaves', render: (p) => <GameSettingsPanel {...p} /> },
  { id: 'warnings', group: 'check', label: 'Warnings', hint: 'Things that need fixing before you share', badge: (p) => warningCount(p.project), render: (p) => <WarningsPanel {...p} /> },
];

/** The contextual inspector: always shows what is selected. */
export const INSPECT_TAB: PanelTab = { id: 'inspect', label: 'Inspect', render: (p) => <Inspector {...p} /> };

register(CANVAS_OVERLAYS, 'ui-layer', UILayerOverlay);
register(INSPECTOR_SECTIONS, 'kind-rules', KindRulesSection);
register(RULES_TOOLBAR, 'rule-presets', RulePresetMenu);
register(PLAY_OVERLAYS, 'show-me', ShowMeOverlay);
register(ASSET_TOOLS, 'art-tools', ArtTools);
register(TOP_BAR_EXTRAS, 'help-menu', HelpMenu);
