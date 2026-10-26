import type { CompareOp, Condition, Rule } from '../../model/schema';
import type { Scalar } from '../values';
import { evalNum, evalOperand, readValue, resolveTarget, type Binding, type RuleHost } from './host';

export function compare(a: Scalar, op: CompareOp, b: Scalar): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'lt': return a < b;
      case 'le': return a <= b;
      case 'gt': return a > b;
      case 'ge': return a >= b;
    }
  }
  // Text and true/false only compare for (in)equality, case-insensitively for text.
  const norm = (x: Scalar) => (typeof x === 'string' ? x.trim().toLowerCase() : String(x));
  if (op === 'eq') return norm(a) === norm(b);
  if (op === 'ne') return norm(a) !== norm(b);
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && compare(na, op, nb);
}

export function checkCondition(c: Condition, b: Binding, host: RuleHost): boolean {
  switch (c.type) {
    case 'compare': {
      if ('unset' in c.value) return false;
      const left = readValue(c.value, b, host);
      const right = evalOperand(c.to, b, host);
      return left !== undefined && right !== null && compare(left, c.op, right);
    }
    case 'count': {
      const n = evalNum(c.amount, b, host);
      if (typeof c.kindId !== 'string' || n === null) return false;
      const live = host.world.byKind(c.kindId).length;
      return compare(live, c.op, n);
    }
    case 'keyHeld':
      return typeof c.key === 'string' && host.input.held.has(c.key);
    case 'touching': {
      const as = resolveTarget(c.a, b, host);
      const bs = resolveTarget(c.b, b, host);
      return as.some((x) => bs.some((y) => x !== y && host.world.touching(x, y)));
    }
    case 'chance': {
      const p = evalNum(c.percent, b, host);
      return p !== null && host.rng() * 100 < p;
    }
  }
}

/** Joined with "and" (all) or "or" (any); no conditions = always true. */
export function checkConditions(conds: Rule['conditions'], b: Binding, host: RuleHost): boolean {
  if (!conds.items.length) return true;
  return conds.join === 'all'
    ? conds.items.every((c) => checkCondition(c, b, host))
    : conds.items.some((c) => checkCondition(c, b, host));
}
