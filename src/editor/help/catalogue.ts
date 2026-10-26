import { ACTIONS, CONDITIONS, TRIGGERS } from '@/model/rule-templates';
import { STICKERS } from '@/runtime/stickers';

export interface HelpEntry {
  /** e.g. "sticker:platformer", "field:platformer.speed", "trigger:touches". */
  id: string;
  title: string;
  /** One line of plain English (FR-038). */
  text: string;
}

/**
 * Every sticker, sticker setting, trigger, condition and action with its
 * one-line explanation. Built from the same modules the editor and runtime
 * use, so new parts can't ship without help text.
 */
export function helpCatalogue(): HelpEntry[] {
  const out: HelpEntry[] = [];
  for (const m of Object.values(STICKERS)) {
    out.push({ id: `sticker:${m.type}`, title: m.label, text: m.help });
    for (const f of m.fields) out.push({ id: `field:${m.type}.${f.key}`, title: `${m.label}: ${f.label}`, text: f.help });
  }
  for (const [k, t] of Object.entries(TRIGGERS)) out.push({ id: `trigger:${k}`, title: `When ${t.label}`, text: t.help });
  for (const [k, t] of Object.entries(CONDITIONS)) out.push({ id: `condition:${k}`, title: `Only if ${t.label}`, text: t.help });
  for (const [k, t] of Object.entries(ACTIONS)) out.push({ id: `action:${k}`, title: t.label, text: t.help });
  return out;
}
