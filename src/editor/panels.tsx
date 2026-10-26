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
import { WarningsPanel, warningCount } from './warnings/WarningsPanel';
import { HelpMenu } from './help/HelpMenu';
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

/** Left sidebar: things you put into the world. */
export const LEFT_TABS: PanelTab[] = [
  { id: 'art', label: 'Art', render: (p) => <AssetBrowser {...p} /> },
  { id: 'presets', label: 'Presets', render: (p) => <ObjectPresetPanel {...p} /> },
  { id: 'tiles', label: 'Tiles', render: (p) => <TilePainter {...p} /> },
  { id: 'scenes', label: 'Scenes', render: (p) => <ScenesPanel {...p} /> },
];

/** Right sidebar: what things do. */
export const RIGHT_TABS: PanelTab[] = [
  { id: 'inspect', label: 'Inspect', render: (p) => <Inspector {...p} /> },
  { id: 'rules', label: 'Rules', render: (p) => <RulesPanel {...p} /> },
  { id: 'values', label: 'Values', render: (p) => <ValuesPanel {...p} /> },
  { id: 'screen', label: 'Screen', render: (p) => <UILayerEditor {...p} /> },
  { id: 'warnings', label: 'Warnings', badge: (p) => warningCount(p.project), render: (p) => <WarningsPanel {...p} /> },
];

CANVAS_OVERLAYS.push(UILayerOverlay);
INSPECTOR_SECTIONS.push(KindRulesSection);
RULES_TOOLBAR.push(RulePresetMenu);
PLAY_OVERLAYS.push(ShowMeOverlay);
TOP_BAR_EXTRAS.push(HelpMenu);
