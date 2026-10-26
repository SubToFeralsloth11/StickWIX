import type { Project, Value } from '../model/schema';
import type { Instance, RuntimeEvent } from './types';

export type Scalar = number | string | boolean;

/** Storage for "Remember between plays" values (localStorage in exported games). */
export interface RememberAdapter {
  load(name: string): Scalar | undefined;
  save(name: string, v: Scalar): void;
}

/** localStorage-backed adapter keyed `stickwix:<projectId>:<valueName>`. */
export function localStorageRemember(projectId: string, storage: Storage = localStorage): RememberAdapter {
  const key = (name: string) => `stickwix:${projectId}:${name}`;
  return {
    load(name) {
      try {
        const raw = storage.getItem(key(name));
        return raw === null ? undefined : (JSON.parse(raw) as Scalar);
      } catch {
        return undefined;
      }
    },
    save(name, v) {
      try {
        storage.setItem(key(name), JSON.stringify(v));
      } catch {
        // Storage full or blocked: the game keeps running with in-memory values.
      }
    },
  };
}

export function coerce(def: Value, v: unknown): Scalar {
  if (def.type === 'number') {
    let n = typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : Number.parseFloat(String(v));
    if (!Number.isFinite(n)) n = 0;
    if (def.min !== undefined) n = Math.max(def.min, n);
    if (def.max !== undefined) n = Math.min(def.max, n);
    return n;
  }
  if (def.type === 'bool') return typeof v === 'string' ? v === 'true' : Boolean(v);
  return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
}

/**
 * Game-wide values plus access to per-object values (which live on the
 * Instance). Every change fires `valueChanged`; remembered values persist.
 */
export class Values {
  readonly defs = new Map<string, Value>();
  readonly game = new Map<string, Scalar>();

  constructor(
    project: Project,
    private readonly emit: (e: RuntimeEvent) => void,
    private readonly remember: RememberAdapter | null,
  ) {
    for (const v of project.values) this.defs.set(v.id, v);
    for (const k of project.kinds) for (const v of k.values) this.defs.set(v.id, v);
    for (const v of project.values) {
      // Remembered values are restored by name, so they survive newer exports;
      // saved names that no longer exist are simply never read.
      const saved = v.remember ? this.remember?.load(v.name) : undefined;
      this.game.set(v.id, coerce(v, saved !== undefined ? saved : v.start));
    }
  }

  isObjectValue(valueId: string) {
    return this.defs.get(valueId)?.scope === 'object';
  }

  byName(name: string): Value | undefined {
    const n = name.trim().toLowerCase();
    for (const v of this.defs.values()) if (v.scope === 'game' && v.name.toLowerCase() === n) return v;
    return undefined;
  }

  /** Reads a value; per-object values need the instance. Missing → the value's start. */
  get(valueId: string, inst?: Instance): Scalar | undefined {
    const def = this.defs.get(valueId);
    if (!def) return undefined;
    if (def.scope === 'game') return this.game.get(valueId);
    return inst?.values.get(valueId) ?? def.start;
  }

  set(valueId: string, v: unknown, inst?: Instance) {
    const def = this.defs.get(valueId);
    if (!def) return;
    const next = coerce(def, v);
    const from = this.get(valueId, inst);
    if (def.scope === 'game') this.game.set(valueId, next);
    else if (inst) inst.values.set(valueId, next);
    else return;
    if (def.remember && def.scope === 'game') this.remember?.save(def.name, next);
    if (from !== next) this.emit({ type: 'valueChanged', valueId, objectId: def.scope === 'object' ? inst?.id : undefined, from, to: next });
  }

  /** Replaces `{Value Name}` placeholders with current game values. */
  format(template: string): string {
    return template.replace(/\{([^{}]+)\}/g, (m, name: string) => {
      const def = this.byName(name);
      if (!def) return m;
      const v = this.game.get(def.id);
      return typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
    });
  }
}
