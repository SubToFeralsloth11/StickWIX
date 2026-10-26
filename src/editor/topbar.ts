import type { ComponentType } from 'react';
import type { Project } from '@/model/schema';
import type { PanelProps } from './panels';

/** Extra top-bar controls (Help menu, ...). */
export const TOP_BAR_EXTRAS: ComponentType<PanelProps>[] = [];

/** Export menu entries (game export, project file). */
export const EXPORT_ACTIONS: ComponentType<PanelProps>[] = [];

/** "Export a backup" from the can't-save status; set by the project-file slice. */
export const BACKUP_ACTION: { run?: (project: Project) => void } = {};
