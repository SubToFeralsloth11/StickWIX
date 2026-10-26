import { newId, uniqueName } from '../model/ids';
import { allRules, type RuleOwner } from '../model/references';
import { Project, type Kind, type ObjectInstance, type ProjectInput, type Rule } from '../model/schema';
import type { ObjectPreset, RulePreset } from './types';

/**
 * Turns shipped presets into normal, fully editable project content (FR-027):
 * everything is deep-copied with fresh ids and every internal reference is
 * pointed at the copies, so nothing links back to the preset.
 */

/** Keys whose string value is the id of something in the document. */
const REF_KEYS = new Set([
  'id', 'kindId', 'valueId', 'sceneId', 'startSceneId', 'tileSetId',
  // Sticker settings that name a Kind.
  'collectedBy', 'target', 'projectile',
  // Asset references (built-in keys are never remapped).
  'assetId', 'lookId', 'sound', 'idleLook', 'walkLook', 'jumpLook', 'backgroundMusic',
]);

/** Old id → fresh id. Refuses an id twice, which would make the remap ambiguous. */
class IdMap extends Map<string, string> {
  fresh(id: string, prefix: string) {
    if (this.has(id)) throw new Error(`Preset uses the id "${id}" twice`);
    this.set(id, newId(prefix));
  }
}

/** Deep copy with every reference (and every override map key) remapped. */
function remap<T>(node: T, ids: Map<string, string>): T {
  return copy(node, ids, false) as T;
}

function copy(node: unknown, ids: Map<string, string>, inOverrides: boolean): unknown {
  if (Array.isArray(node)) return node.map((x) => copy(x, ids, false));
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && REF_KEYS.has(k)) out[k] = ids.get(v) ?? v;
    else if (inOverrides && (k === 'stickers' || k === 'values') && v && typeof v === 'object' && !Array.isArray(v))
      // Object overrides are keyed by sticker id / value id.
      out[k] = Object.fromEntries(Object.entries(v).map(([key, val]) => [ids.get(key) ?? key, copy(val, ids, false)]));
    else out[k] = copy(v, ids, k === 'overrides');
  }
  return out;
}

function mapKind(ids: IdMap, k: Kind) {
  ids.fresh(k.id, 'k');
  for (const s of k.stickers) ids.fresh(s.id, 'st');
  for (const v of k.values) ids.fresh(v.id, 'v');
}

/** A starter game as a brand-new project (FR-024): every id fresh, created now. */
export function instantiateStarter(input: ProjectInput): Project {
  const doc = Project.parse(input);
  const ids = new IdMap();
  ids.fresh(doc.id, 'p');
  for (const s of doc.scenes) {
    ids.fresh(s.id, 's');
    for (const o of s.objects) {
      ids.fresh(o.id, 'o');
      for (const st of o.overrides.addStickers ?? []) ids.fresh(st.id, 'st');
    }
    for (const u of s.ui) ids.fresh(u.id, 'u');
  }
  for (const k of doc.kinds) mapKind(ids, k);
  for (const v of doc.values) ids.fresh(v.id, 'v');
  for (const { rule } of allRules(doc)) ids.fresh(rule.id, 'r');
  for (const t of doc.tileSets) ids.fresh(t.id, 't');
  for (const a of doc.assets) ids.fresh(a.id, 'a');
  const out = remap(doc, ids);
  out.createdAt = out.updatedAt = new Date().toISOString();
  out.tourCompleted = false;
  return Project.parse(out);
}

/** Rewrites `{Old name}` placeholders after a copied value was renamed to avoid a clash. */
function renamePlaceholders(rules: Rule[], renamed: Map<string, string>) {
  if (!renamed.size) return;
  for (const r of rules)
    for (const a of r.actions)
      if (a.type === 'showText')
        a.text = a.text.replace(/\{([^{}]+)\}/g, (m, name: string) => {
          const to = renamed.get(name.trim().toLowerCase());
          return to ? `{${to}}` : m;
        });
}

/**
 * Copies an object preset into `project` (mutated in place, so it works inside
 * an Immer recipe): its Kinds, game values and rules get fresh ids, clashing
 * names get a numeric suffix ("Coin 2"), nothing existing is reused, and one
 * object of the main Kind is placed with its top-left corner at (x, y).
 */
export function insertObjectPreset(
  project: Project,
  preset: ObjectPreset,
  at: { sceneId: string; x: number; y: number },
): { kindIds: string[]; objectIds: string[] } {
  const scene = project.scenes.find((s) => s.id === at.sceneId);
  if (!scene) throw new Error(`Unknown scene ${at.sceneId}`);
  const ids = new IdMap();
  for (const k of preset.kinds) {
    mapKind(ids, k);
    for (const r of k.rules) ids.fresh(r.id, 'r');
  }
  for (const v of preset.values) ids.fresh(v.id, 'v');
  for (const r of preset.rules) ids.fresh(r.id, 'r');

  const kinds = remap(preset.kinds, ids);
  const values = remap(preset.values, ids);
  const rules = remap(preset.rules, ids);

  const kindNames = project.kinds.map((k) => k.name);
  for (const k of kinds) {
    k.name = uniqueName(k.name, kindNames, 40);
    kindNames.push(k.name);
  }
  const valueNames = project.values.map((v) => v.name);
  const renamed = new Map<string, string>();
  for (const v of values) {
    const name = uniqueName(v.name, valueNames, 30);
    if (name !== v.name) renamed.set(v.name.toLowerCase(), name);
    v.name = name;
    valueNames.push(name);
  }
  renamePlaceholders([...rules, ...kinds.flatMap((k) => k.rules)], renamed);

  project.kinds.push(...kinds);
  project.values.push(...values);
  project.rules.push(...rules);
  const obj: ObjectInstance = {
    id: newId('o'),
    kindId: ids.get(preset.mainKindId)!,
    x: at.x,
    y: at.y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    layer: 0,
    overrides: {},
  };
  scene.objects.push(obj);
  return { kindIds: kinds.map((k) => k.id), objectIds: [obj.id] };
}

/**
 * Appends a copy of a rule preset to the game, a scene or a Kind. Its blanks
 * stay unset, so the rule is `incomplete` until the child fills them in.
 */
export function insertRulePreset(project: Project, preset: RulePreset, owner: RuleOwner): string {
  const list =
    owner.type === 'game'
      ? project.rules
      : owner.type === 'scene'
        ? project.scenes.find((s) => s.id === owner.id)?.rules
        : project.kinds.find((k) => k.id === owner.id)?.rules;
  if (!list) throw new Error(`Unknown ${owner.type} ${owner.id ?? ''}`);
  const rule = structuredClone(preset.rule);
  rule.id = newId('r');
  list.push(rule);
  return rule.id;
}
