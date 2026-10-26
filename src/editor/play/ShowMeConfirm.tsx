import { HelpTip } from '../help/HelpTip';

/** The rule Show-me will write, as a sentence, with confirm / edit / undo (FR-031). */
export function ShowMeConfirm(p: {
  sentence: string | null;
  canGeneralise: boolean;
  onlyThis: boolean;
  setOnlyThis: (v: boolean) => void;
  changes: number;
  onUndo: () => void;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="stack">
      <b>Here's your rule</b>
      {p.sentence ? (
        <div className="rule" style={{ margin: 0 }} data-testid="showme-sentence">
          <div className="sentence">{p.sentence}</div>
        </div>
      ) : (
        <div className="empty">Act out at least one change to make a rule.</div>
      )}
      {p.canGeneralise && (
        <label className="row">
          <input type="checkbox" checked={p.onlyThis} onChange={(e) => p.setOnlyThis(e.target.checked)} />
          Only this one, not every one of its Kind <HelpTip text='Off: "any Coin … that Coin" works for every coin. On: just the one you used.' />
        </label>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn go" disabled={!p.sentence} onClick={p.onConfirm} data-testid="showme-confirm">
          ✓ Add this rule
        </button>
        <button className="btn" disabled={!p.sentence} onClick={p.onEdit} title="Add it, stop playing and open it in the Rules tab">
          Add and edit
        </button>
        <button className="btn ghost" disabled={!p.changes} onClick={p.onUndo}>
          ↶ Undo last change
        </button>
      </div>
    </div>
  );
}
