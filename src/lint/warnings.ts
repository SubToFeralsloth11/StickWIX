import { allRules, ruleStates } from '../model/references';
import type { Kind, Project, Rule, Scene } from '../model/schema';
import { sentenceText } from '../model/sentence';
import type { Diagnostic } from '../runtime/types';

/** Where "Show me where" takes the user. */
export type WarningTarget =
  | { kind: 'object'; sceneId: string; id: string }
  | { kind: 'kind'; id: string }
  | { kind: 'rule'; id: string }
  | { kind: 'value'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'ui'; sceneId: string; id: string };

export interface Warning {
  /** Stable key (for React lists and dismiss state). */
  key: string;
  severity: 'warn' | 'error';
  message: string;
  target: WarningTarget;
}

const kindsById = (p: Project) => new Map(p.kinds.map((k) => [k.id, k]));

function hasSticker(k: Kind | undefined, type: string) {
  return !!k?.stickers.some((s) => s.type === type);
}

/** True when something solid lies anywhere below the object's feet, within the scene. */
function solidBelow(p: Project, scene: Scene, x: number, w: number, feet: number): boolean {
  const kinds = kindsById(p);
  const ts = p.tileSets.find((t) => t.id === scene.tileLayer.tileSetId);
  if (ts) {
    const c = scene.tileLayer.cellSize;
    const x0 = Math.floor(x / c);
    const x1 = Math.floor((x + w - 0.01) / c);
    for (const [key, index] of Object.entries(scene.tileLayer.cells)) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      if (cx < x0 || cx > x1 || (cy + 1) * c <= feet) continue;
      if (ts.solid[index] || ts.oneWay[index]) return true;
    }
  }
  return scene.objects.some((o) => {
    const k = kinds.get(o.kindId);
    if (!hasSticker(k, 'solid') || !k) return false;
    const ow = k.size.w * o.scaleX;
    const oh = k.size.h * o.scaleY;
    return o.x < x + w && o.x + ow > x && o.y + oh > feet;
  });
}

/** Values whose amount some rule (or a Health/Collectible mechanic via rules) can change. */
function changedValues(rules: Rule[]): Set<string> {
  const out = new Set<string>();
  for (const r of rules) for (const a of r.actions) if (a.type === 'changeValue' && !('unset' in a.value)) out.add(a.value.valueId);
  return out;
}

/** Kinds some rule reacts to being collected or touched (so collecting them "counts"). */
function rulesAboutKind(rules: Rule[], kindId: string): boolean {
  return rules.some((r) => JSON.stringify(r.trigger).includes(`"${kindId}"`));
}

/**
 * Common-mistake checks (FR-039). Pure: from the document plus the
 * diagnostics of the last Play. Every warning points somewhere to fix it.
 */
export function analyse(p: Project, lastRun: readonly Diagnostic[] = []): Warning[] {
  const out: Warning[] = [];
  const kinds = kindsById(p);
  const located = allRules(p);
  const rules = located.map((r) => r.rule);
  const states = ruleStates(p);
  const say = (r: Rule) => sentenceText(r, p);

  // Platformer hero with nothing solid below.
  for (const s of p.scenes)
    for (const o of s.objects) {
      const k = kinds.get(o.kindId);
      if (!hasSticker(k, 'platformer') || !k) continue;
      const w = k.size.w * o.scaleX;
      const feet = o.y + k.size.h * o.scaleY;
      if (!solidBelow(p, s, o.x, w, feet - 1))
        out.push({ key: `nofloor:${o.id}`, severity: 'warn', message: `${k.name} has nothing solid to stand on in ${s.name}, so it will fall out of the level. Paint solid tiles under it.`, target: { kind: 'object', sceneId: s.id, id: o.id } });
    }

  // Rules with empty blanks or deleted parts.
  for (const { rule } of located) {
    const st = states.get(rule.id)?.state;
    if (st === 'incomplete') out.push({ key: `blank:${rule.id}`, severity: 'warn', message: `This rule has a blank to fill in, so it doesn't run yet: "${say(rule)}"`, target: { kind: 'rule', id: rule.id } });
    if (st === 'broken') out.push({ key: `broken:${rule.id}`, severity: 'error', message: `This rule uses something that was deleted, so it doesn't run: "${say(rule)}"`, target: { kind: 'rule', id: rule.id } });
  }

  // A value shown on screen that no rule ever changes.
  const changed = changedValues(rules);
  for (const s of p.scenes)
    for (const u of s.ui)
      for (const m of u.text.matchAll(/\{([^{}]+)\}/g)) {
        const v = p.values.find((x) => x.name.toLowerCase() === m[1]!.trim().toLowerCase());
        if (v && !changed.has(v.id))
          out.push({ key: `static:${u.id}:${v.id}`, severity: 'warn', message: `${v.name} is shown on screen, but no rule ever changes it, so it will always say ${String(v.start)}.`, target: { kind: 'ui', sceneId: s.id, id: u.id } });
      }

  // Collectibles that nothing counts.
  for (const k of p.kinds) {
    if (!hasSticker(k, 'collectible')) continue;
    const placed = p.scenes.some((s) => s.objects.some((o) => o.kindId === k.id));
    if (placed && !rulesAboutKind(rules, k.id) && !k.rules.length)
      out.push({ key: `uncounted:${k.id}`, severity: 'warn', message: `${k.name} can be collected, but nothing counts it. Add a rule like "When any ${k.name} is collected → Score goes up by 1".`, target: { kind: 'kind', id: k.id } });
  }

  // Scenes bigger than the screen that never scroll.
  for (const s of p.scenes) {
    const big = s.width > p.settings.screenWidth || s.height > p.settings.screenHeight;
    const follows = s.objects.some((o) => hasSticker(kinds.get(o.kindId), 'cameraFollow'));
    if (big && s.objects.length && !follows)
      out.push({ key: `nocam:${s.id}`, severity: 'warn', message: `${s.name} is bigger than the screen, but nothing has the Camera Follow sticker, so the screen never scrolls.`, target: { kind: 'scene', id: s.id } });
  }

  // Problems seen in the last Play.
  for (const d of lastRun) {
    if (d.type === 'runaway') {
      const r = located.find((x) => x.rule.id === d.ruleId);
      if (r) out.push({ key: `runaway:${d.ruleId}`, severity: 'error', message: `Last Play, this rule kept setting itself off and was stopped: "${say(r.rule)}"`, target: { kind: 'rule', id: d.ruleId } });
    } else if (d.type === 'objectCap') {
      const k = kinds.get(d.kindId);
      if (k) out.push({ key: `cap:${d.kindId}`, severity: 'error', message: `Last Play, so many ${k.name} were created that StickWIX stopped making more (the limit is 1,000 at once).`, target: { kind: 'kind', id: d.kindId } });
    } else if (d.type === 'error') {
      out.push({ key: `err:${d.ruleId}`, severity: 'error', message: d.message, target: { kind: 'rule', id: d.ruleId } });
    }
  }
  return out;
}
