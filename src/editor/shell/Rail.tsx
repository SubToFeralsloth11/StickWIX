import { Fragment } from 'react';
import { SECTIONS, SECTION_GROUPS, type PanelProps } from '../panels';
import { setUI, useUI } from '../ui-state';
import { Icon } from './icons';
import { MOD, toggleSection } from './actions';

/** The activity rail: one button per section, grouped Build / Logic / Game / Check. */
export function Rail(props: PanelProps) {
  const section = useUI((s) => s.section);
  return (
    <nav className="rail" aria-label="Sections">
      {SECTION_GROUPS.map((g) => {
        const items = SECTIONS.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <Fragment key={g.id}>
            <div className="rail-group">{g.label}</div>
            {items.map((s) => {
              const n = s.badge?.(props) ?? 0;
              const num = SECTIONS.indexOf(s) + 1;
              const on = section === s.id;
              return (
                <button
                  key={s.id}
                  className={`rail-btn g-${s.group} ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleSection(s.id)}
                  title={`${s.label}: ${s.hint}${num <= 9 ? ` (${num})` : ''}`}
                  data-tour={`tab-${s.id}`}
                  data-section={s.id}
                >
                  <Icon name={s.id} size={21} />
                  <span className="rail-label">{s.short ?? s.label}</span>
                  {n > 0 && <span className="count">{n}</span>}
                </button>
              );
            })}
          </Fragment>
        );
      })}
      <span className="grow" />
      <button className="rail-btn small" onClick={() => setUI({ overlay: 'palette' })} title={`Find anything (${MOD} K)`} aria-label="Find anything">
        <Icon name="search" size={19} />
      </button>
      <button className="rail-btn small" onClick={() => setUI({ overlay: 'shortcuts' })} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
        <Icon name="keyboard" size={19} />
      </button>
    </nav>
  );
}

/** The wide drawer beside the rail showing the open section. */
export function Drawer(props: PanelProps) {
  const section = useUI((s) => s.section);
  const current = SECTIONS.find((s) => s.id === section);
  if (!current) return null;
  return (
    <aside className={`drawer drawer-${current.group}`} aria-label={current.label} data-section={current.id}>
      <header className="drawer-head">
        <span className="drawer-icon">
          <Icon name={current.id} size={18} />
        </span>
        <div className="grow">
          <h2>{current.label}</h2>
          <p>{current.hint}</p>
        </div>
        <button className="btn ghost icon" onClick={() => setUI({ section: null })} aria-label="Close panel" title="Close panel ([)">
          <Icon name="chevronLeft" size={18} />
        </button>
      </header>
      <div className="panel-body" role="region" aria-label={`${current.label} panel`} key={current.id}>
        {current.render(props)}
      </div>
    </aside>
  );
}
