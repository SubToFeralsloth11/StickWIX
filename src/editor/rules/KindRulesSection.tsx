import { allRules } from '@/model/references';
import { sentenceText } from '@/model/sentence';
import type { KindSectionProps } from '../inspector/Inspector';
import { setUI } from '../ui-state';

/** In the inspector: which rules mention this Kind, with a jump to the Rules tab. */
export function KindRulesSection({ project, kind }: KindSectionProps) {
  const mentions = allRules(project).filter(({ rule, owner }) => (owner.type === 'kind' && owner.id === kind.id) || JSON.stringify(rule).includes(`"${kind.id}"`));
  return (
    <div className="section">
      <h4>Rules about {kind.name}</h4>
      {mentions.length === 0 ? (
        <div className="dim">None yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--mut)', fontSize: 13 }}>
          {mentions.slice(0, 6).map(({ rule }) => (
            <li key={rule.id}>
              <button className="btn ghost small" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setUI({ rightTab: 'rules', focusRuleId: rule.id })}>
                {sentenceText(rule, project)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn small" style={{ marginTop: 6 }} onClick={() => setUI({ rightTab: 'rules' })}>
        Open the rules
      </button>
    </div>
  );
}
