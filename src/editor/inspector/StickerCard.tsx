import { useState } from 'react';
import type { Project, Sticker } from '@/model/schema';
import { keyName } from '@/model/sentence';
import { STICKERS } from '@/runtime/stickers';
import type { SettingField } from '@/runtime/types';
import type { Library } from '../assets/library';
import { HelpTip } from '../help/HelpTip';

export interface StickerCardProps {
  project: Project;
  lib: Library;
  sticker: Sticker;
  /** Per-object overrides for this sticker (when editing "just this one"). */
  overrides?: Record<string, unknown>;
  readOnly: boolean;
  onChange: (key: string, value: unknown) => void;
  onReset?: (key: string) => void;
  onRemove: () => void;
}

/** One sticker on a Kind: its plain-language settings as sliders, toggles and pickers (FR-013). */
export function StickerCard({ project, lib, sticker, overrides, readOnly, onChange, onReset, onRemove }: StickerCardProps) {
  const mod = STICKERS[sticker.type];
  return (
    <div className="sticker" data-testid={`sticker-${sticker.type}`}>
      <header>
        <span className={`cat ${mod.category}`}>{mod.category === 'controller' ? 'move' : mod.category}</span>
        <h5>{mod.label}</h5>
        <HelpTip text={mod.help} />
        {!readOnly && !overrides && (
          <button className="btn small ghost" onClick={onRemove} aria-label={`Remove ${mod.label}`} title="Remove sticker">
            ✕
          </button>
        )}
      </header>
      <div className="body">
        {mod.fields.map((f) => {
          const overridden = overrides !== undefined && f.key in overrides;
          const value = overridden ? overrides[f.key] : sticker.settings[f.key];
          return (
            <div key={f.key} className={`setting ${overridden ? 'overridden' : ''}`}>
              <Field field={f} value={value} project={project} lib={lib} disabled={readOnly} onChange={(v) => onChange(f.key, v)} />
              {overridden && onReset && (
                <button className="reset" onClick={() => onReset(f.key)}>
                  Use the same as the others
                </button>
              )}
            </div>
          );
        })}
        {mod.events?.length ? (
          <div className="dim" style={{ fontSize: 12 }}>
            Rules can use: {mod.events.map((e) => `"${e.phrase}"`).join(', ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Label({ field, children }: { field: SettingField; children?: React.ReactNode }) {
  return (
    <label>
      <span className="row" style={{ gap: 5 }}>
        {field.label} <HelpTip text={field.help} />
      </span>
      {children}
    </label>
  );
}

function Field({ field, value, project, lib, disabled, onChange }: { field: SettingField; value: unknown; project: Project; lib: Library; disabled: boolean; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  switch (field.kind) {
    case 'slider': {
      const v = draft ?? (typeof value === 'number' ? value : field.min);
      return (
        <>
          <Label field={field}>
            <b>
              {Math.round(v * 100) / 100}
              {field.unit ?? ''}
            </b>
          </Label>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={v}
            disabled={disabled}
            aria-label={field.label}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => {
              if (draft !== null) onChange(draft);
              setDraft(null);
            }}
            onKeyUp={() => {
              if (draft !== null) onChange(draft);
              setDraft(null);
            }}
            onBlur={() => {
              if (draft !== null) onChange(draft);
              setDraft(null);
            }}
          />
        </>
      );
    }
    case 'toggle':
      return (
        <label className="row" style={{ justifyContent: 'flex-start', gap: 8, color: 'var(--ink)' }}>
          <input type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {field.label} <HelpTip text={field.help} />
        </label>
      );
    case 'choice':
      return (
        <>
          <Label field={field} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 4 }} role="radiogroup" aria-label={field.label}>
            {field.options.map((o) => (
              <button key={String(o.value)} role="radio" aria-checked={value === o.value} className={`btn small ${value === o.value ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      );
    case 'kind':
      return (
        <>
          <Label field={field} />
          <select className="field" style={{ width: '100%' }} value={(value as string | null) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.label}>
            <option value="">{field.emptyLabel}</option>
            {project.kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </>
      );
    case 'look':
      return (
        <>
          <Label field={field} />
          <select className="field" style={{ width: '100%' }} value={(value as string | null) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.label}>
            <option value="">(none)</option>
            {lib.images().map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.frames > 1 ? ` (${i.frames} frames)` : ''}
              </option>
            ))}
          </select>
        </>
      );
    case 'sound':
      return (
        <>
          <Label field={field} />
          <select className="field" style={{ width: '100%' }} value={(value as string | null) ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={field.label}>
            <option value="">(no sound)</option>
            {lib.sounds().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      );
    case 'key':
      return (
        <>
          <Label field={field} />
          <KeyPicker value={String(value ?? '')} disabled={disabled} onChange={onChange} />
        </>
      );
  }
}

/** "Press a key" capture button; stores KeyboardEvent.code. */
export function KeyPicker({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (code: string) => void }) {
  const [listening, setListening] = useState(false);
  return (
    <button
      className={`btn small ${listening ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={(e) => {
        if (!listening) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.code !== 'Escape') onChange(e.code);
        setListening(false);
      }}
    >
      {listening ? 'Press a key…' : value ? keyName(value) : 'Choose a key'}
    </button>
  );
}
