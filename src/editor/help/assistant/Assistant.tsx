import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState, type ReactNode } from 'react';
import { setUI, useUI } from '../../ui-state';
import { openSection } from '../../shell/actions';
import { Matcher } from './nlp';
import { RECIPES, SECTION_NAMES, type Recipe, type Visual } from './recipes';
import '../../features.css';

const matcher = new Matcher(
  RECIPES.map((r) => ({
    id: r.id,
    fields: [
      { text: r.title, weight: 3 },
      ...r.examples.map((e) => ({ text: e, weight: 2 })),
      { text: r.why, weight: 1 },
      { text: r.keywords ?? '', weight: 2 },
      // Steps count a little, so questions about details still find the recipe that explains them.
      ...r.steps.map((st) => ({ text: st.say, weight: 0.5 })),
    ],
  })),
);

/** Ranks recipes for a question; exported for tests. */
export const askAssistant = (q: string) => matcher.rank(q);

const STARTERS = [
  'hold the mouse on a block to break it',
  'different animations for walking and jumping',
  'custom cursor and lock the mouse',
  'place blocks on a grid',
  'show a health bar',
  'blocks connected with glowing lines',
];

/** "When [Hero] touches [any Coin] → ..." as words and blank chips, like a real rule. */
function RulePicture({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/).filter(Boolean);
  return (
    <div className="vis-sentence sentence">
      {parts.map((p, i) =>
        p.startsWith('[') ? (
          <span key={i} className="blank">
            {p.slice(1, -1)}
          </span>
        ) : (
          p
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((w, j) =>
              i === 0 && j === 0 && w === 'When' ? (
                <span key={`${i}-${j}`} className="blank" style={{ borderBottomColor: 'var(--clay)' }}>
                  When
                </span>
              ) : (
                <span key={`${i}-${j}`} className={/^[,.%)']/.test(w) ? 'w punct' : 'w'}>
                  {w}
                </span>
              ),
            )
        ),
      )}
    </div>
  );
}

function Picture({ v }: { v: Visual }): ReactNode {
  if ('where' in v)
    return (
      <div className="vis-where">
        <span className="rail-pill">{SECTION_NAMES[v.where] ?? v.where}</span>
        {v.then && (
          <>
            <span className="arrow">→</span>
            <span className="btn small primary" aria-hidden>
              {v.then}
            </span>
          </>
        )}
      </div>
    );
  if ('rule' in v) return <RulePicture text={v.rule} />;
  if ('sticker' in v)
    return (
      <div className="vis-sticker">
        <div className="sticker-top">
          <span className="cat gameplay">sticker</span> {v.sticker}
        </div>
        {v.settings && <KeyValues rows={v.settings} />}
      </div>
    );
  if ('settings' in v) return <KeyValues rows={v.settings} />;
  return (
    <div className="vis-keys">
      {v.keys.map((k, i) => (
        <span key={i} className="kbd">
          {k}
        </span>
      ))}
    </div>
  );
}

function KeyValues({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="vis-kv">
      {rows.map(([k, val]) => (
        <span key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{val}</dd>
        </span>
      ))}
    </dl>
  );
}

function go(section: string) {
  setUI({ overlay: null });
  if (section === 'inspect') setUI({ inspectorOpen: true });
  else openSection(section);
}

function RecipeView({ r, confidence }: { r: Recipe; confidence: number | null }) {
  return (
    <div className="assist-main" data-testid="assistant-answer">
      {confidence !== null && (
        <div className="assist-match">{confidence > 0.6 ? 'Best match' : confidence > 0.3 ? 'Probably this' : 'Closest idea (try other words for a better match)'}</div>
      )}
      <h3>{r.title}</h3>
      <p className="why">{r.why}</p>
      <ol className="steps">
        {r.steps.map((s, i) => (
          <li key={i} className="step">
            <span className="step-num">{i + 1}</span>
            <div className="step-text">
              <p>{s.say}</p>
              {s.show && (
                <div className="step-visual">
                  <Picture v={s.show} />
                </div>
              )}
              {s.open && (
                <button className="btn small" style={{ marginTop: 6 }} onClick={() => go(s.open!)}>
                  Open {SECTION_NAMES[s.open] ?? s.open} →
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "How do I…?": type what you want to make, get visual steps. Works fully offline. */
export function Assistant() {
  const open = useUI((s) => s.overlay === 'assistant');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const ranked = useMemo(() => (query.trim() ? askAssistant(query) : []), [query]);
  const currentId = picked && (ranked.some((r) => r.id === picked) || !query.trim()) ? picked : ranked[0]?.id;
  const current = RECIPES.find((r) => r.id === currentId);
  const conf = ranked.find((r) => r.id === currentId)?.confidence ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setUI({ overlay: null })}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="assist" aria-describedby={undefined} data-testid="assistant">
          <div className="assist-head">
            <Dialog.Title asChild>
              <h2>How do I…?</h2>
            </Dialog.Title>
            <span className="muted">Say what you want to make in your own words. Spelling doesn't matter.</span>
            <div className="assist-input">
              <input
                className="field"
                autoFocus
                value={query}
                placeholder="e.g. when I hold the mouse on a block it breaks"
                aria-label="What are you trying to do?"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                }}
              />
              <Dialog.Close asChild>
                <button className="btn">Close</button>
              </Dialog.Close>
            </div>
            {!query && (
              <div className="assist-chips">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => setQuery(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="assist-body">
            {current ? (
              <RecipeView r={current} confidence={query.trim() ? conf : null} />
            ) : (
              <div className="assist-empty">{query.trim() ? 'No idea yet. Try describing it differently, like "make the player shoot" or "change the cursor".' : 'Type a question, or pick an idea on the right.'}</div>
            )}
            <aside className="assist-side">
              <h4>{query.trim() ? 'Other matches' : 'Popular'}</h4>
              {(query.trim() ? ranked.map((r) => RECIPES.find((x) => x.id === r.id)!) : RECIPES.slice(0, 12)).map((r) => (
                <button key={r.id} className={r.id === currentId ? 'on' : ''} onClick={() => setPicked(r.id)}>
                  {r.title}
                </button>
              ))}
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
