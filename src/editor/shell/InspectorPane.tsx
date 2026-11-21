import { useRef } from 'react';
import { INSPECT_TAB, type PanelProps } from '../panels';
import { useEditor } from '../store';
import { clampInspector, INSPECTOR_MAX, INSPECTOR_MIN, setUI, useUI } from '../ui-state';
import { Icon } from './icons';

/** What the inspector is looking at, for its header. */
function useSelectionLabel(props: PanelProps): string {
  const selection = useEditor((s) => s.selection);
  if (!selection.length) return 'Nothing selected';
  if (selection.length > 1) return `${selection.length} selected`;
  const sel = selection[0]!;
  if (sel.kind === 'kind') return props.project.kinds.find((k) => k.id === sel.id)?.name ?? 'Kind';
  if (sel.kind === 'object') {
    for (const s of props.project.scenes) {
      const o = s.objects.find((x) => x.id === sel.id);
      if (o) return props.project.kinds.find((k) => k.id === o.kindId)?.name ?? 'Object';
    }
    return 'Object';
  }
  return sel.kind.charAt(0).toUpperCase() + sel.kind.slice(1);
}

/** Right-hand contextual inspector: always shows the selection; collapsible and resizable. */
export function InspectorPane(props: PanelProps) {
  const open = useUI((s) => s.inspectorOpen);
  const width = useUI((s) => s.inspectorWidth);
  const label = useSelectionLabel(props);
  const drag = useRef<{ x: number; w: number } | null>(null);

  if (!open)
    return (
      <aside className="inspector collapsed">
        <button className="insp-reopen" onClick={() => setUI({ rightTab: 'inspect' })} data-tour="tab-inspect" aria-label="Show inspector" title="Show inspector (])">
          <Icon name="chevronLeft" size={16} />
          <span>Inspect</span>
        </button>
      </aside>
    );

  const resize = (w: number) => setUI({ inspectorWidth: clampInspector(w) });
  return (
    <aside className="inspector" style={{ width }} data-testid="inspector-pane">
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        aria-valuemin={INSPECTOR_MIN}
        aria-valuemax={INSPECTOR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, w: width };
          document.body.classList.add('resizing');
        }}
        onPointerMove={(e) => drag.current && resize(drag.current.w + drag.current.x - e.clientX)}
        onPointerUp={() => {
          drag.current = null;
          document.body.classList.remove('resizing');
        }}
        onDoubleClick={() => resize(360)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const step = e.shiftKey ? 64 : 16;
          resize(width + (e.key === 'ArrowLeft' ? step : -step));
        }}
      />
      <header className="insp-head">
        <button className="insp-title" onClick={() => setUI({ rightTab: 'inspect' })} data-tour="tab-inspect">
          <Icon name="inspect" size={16} />
          <span className="insp-kicker">Inspect</span>
          <span className="insp-what">{label}</span>
        </button>
        <button className="btn ghost icon" onClick={() => setUI({ inspectorOpen: false })} aria-label="Hide inspector" title="Hide inspector (])">
          <Icon name="chevronRight" size={18} />
        </button>
      </header>
      <div className="panel-body" role="region" aria-label="Inspector" data-testid="inspector-body">
        {INSPECT_TAB.render(props)}
      </div>
    </aside>
  );
}
