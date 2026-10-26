import { useMemo } from 'react';
import { analyse, type Warning, type WarningTarget } from '@/lint/warnings';
import type { PanelProps } from '../panels';
import { editorStore } from '../store';
import { setUI, useUI } from '../ui-state';

/** Takes the user to the thing a warning is about. */
export function showWhere(t: WarningTarget) {
  const st = editorStore.getState();
  switch (t.kind) {
    case 'object':
      st.setScene(t.sceneId);
      st.select([{ kind: 'object', id: t.id }]);
      setUI({ rightTab: 'inspect', tool: 'select' });
      break;
    case 'kind':
      st.select([{ kind: 'kind', id: t.id }]);
      setUI({ rightTab: 'inspect' });
      break;
    case 'rule':
      setUI({ rightTab: 'rules', focusRuleId: t.id });
      break;
    case 'value':
      setUI({ rightTab: 'values' });
      break;
    case 'scene':
      st.setScene(t.id);
      st.select([]);
      setUI({ rightTab: 'inspect' });
      break;
    case 'ui':
      st.setScene(t.sceneId);
      setUI({ rightTab: 'screen', uiSelection: t.id });
      break;
  }
}

export function useWarnings(project: PanelProps['project']): Warning[] {
  const lastRun = useUI((s) => s.lastRun);
  return useMemo(() => analyse(project, lastRun), [project, lastRun]);
}

/** Common mistakes, refreshed after every edit and after Stop (FR-039). */
export function WarningsPanel({ project }: PanelProps) {
  const warnings = useWarnings(project);
  if (!warnings.length)
    return (
      <div className="empty" data-testid="no-warnings">
        ✓ Nothing looks wrong. Press Play and try your game!
      </div>
    );
  return (
    <div data-testid="warnings">
      {warnings.map((w) => (
        <div key={w.key} className={`warn ${w.severity === 'error' ? 'error' : ''}`} data-testid="warning">
          <p>{w.message}</p>
          <button className="btn small" onClick={() => showWhere(w.target)}>
            Show me where
          </button>
        </div>
      ))}
    </div>
  );
}

/** Tab badge: number of warnings (computed the same way as the panel). */
export function warningCount(project: PanelProps['project']) {
  return analyse(project, useUI.getState().lastRun).length;
}
