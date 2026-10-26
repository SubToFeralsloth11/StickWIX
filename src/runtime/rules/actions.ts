import type { Action, Place } from '../../model/schema';
import type { Instance } from '../types';
import { evalNum, evalOperand, resolveTarget, valueOwner, type Binding, type RuleHost } from './host';

/** Strength 1 = 100 px/s of push. */
const PUSH_UNIT = 100;

/** Where a Place blank points, as the top-left for an object of size w×h. */
function placeAt(p: Place, w: number, h: number, b: Binding, host: RuleHost): { x: number; y: number } | null {
  if ('at' in p) {
    const x = evalNum(p.at.x, b, host);
    const y = evalNum(p.at.y, b, host);
    return x === null || y === null ? null : { x, y };
  }
  const t = resolveTarget(p.atTarget, b, host)[0];
  return t ? { x: t.x + t.w / 2 - w / 2, y: t.y + t.h / 2 - h / 2 } : null;
}

function targets(a: { target: Parameters<typeof resolveTarget>[0] }, b: Binding, host: RuleHost): Instance[] {
  return resolveTarget(a.target, b, host);
}

/**
 * Runs one action. Returns seconds to wait for `wait`, otherwise null.
 * Actions that change the world fire their own triggers through the host
 * (created/destroyed/valueChanged), which dispatch immediately.
 */
export function runAction(a: Action, b: Binding, host: RuleHost): number | null {
  switch (a.type) {
    case 'moveTo':
      for (const i of targets(a, b, host)) {
        const p = placeAt(a.to, i.w, i.h, b, host);
        if (p) {
          i.x = p.x;
          i.y = p.y;
        }
      }
      return null;
    case 'moveBy': {
      const dx = evalNum(a.by.x, b, host);
      const dy = evalNum(a.by.y, b, host);
      if (dx === null || dy === null) return null;
      for (const i of targets(a, b, host)) {
        i.x += dx;
        i.y += dy;
      }
      return null;
    }
    case 'setSpeed': {
      const vx = evalNum(a.speed.x, b, host);
      const vy = evalNum(a.speed.y, b, host);
      if (vx === null || vy === null) return null;
      for (const i of targets(a, b, host)) {
        i.vx = vx;
        i.vy = vy;
        if (vx || vy) i.body ||= i.solid === 'none';
      }
      return null;
    }
    case 'push': {
      const s = evalNum(a.strength, b, host);
      if (s === null) return null;
      const v = s * PUSH_UNIT;
      for (const i of targets(a, b, host)) {
        if (a.direction === 'up') {
          i.vy = -v;
          i.grounded = false;
        } else if (a.direction === 'down') i.vy = v;
        else {
          i.vx = a.direction === 'left' ? -v : v;
          i.stun = Math.max(i.stun, 0.15);
        }
        i.body ||= i.solid === 'none';
      }
      return null;
    }
    case 'create': {
      if (typeof a.kindId !== 'string') return null;
      const kind = host.world.kinds.get(a.kindId);
      if (!kind) return null;
      const p = placeAt(a.place, kind.size.w, kind.size.h, b, host);
      if (p) host.world.spawn(a.kindId, p.x, p.y);
      return null;
    }
    case 'destroy':
      if (a.target.t === 'ui') host.ui.setHidden(a.target.id, true);
      for (const i of targets(a, b, host)) host.world.destroy(i);
      return null;
    case 'show':
    case 'hide': {
      const hidden = a.type === 'hide';
      if (a.target.t === 'ui') host.ui.setHidden(a.target.id, hidden);
      for (const i of targets(a, b, host)) i.hidden = hidden;
      return null;
    }
    case 'changeLook':
      if (typeof a.assetId !== 'string') return null;
      if (a.target.t === 'ui') host.ui.setLook(a.target.id, a.assetId);
      for (const i of targets(a, b, host)) {
        i.lookId = a.assetId;
        i.anim = null;
      }
      return null;
    case 'animate': {
      const fps = evalNum(a.fps, b, host);
      if (typeof a.assetId !== 'string' || fps === null || fps <= 0) return null;
      for (const i of targets(a, b, host)) {
        i.lookId = a.assetId;
        i.anim = { assetId: a.assetId, fps, loop: a.loop, t: 0, frame: 0 };
      }
      return null;
    }
    case 'changeValue': {
      if ('unset' in a.value) return null;
      const amount = evalOperand(a.amount, b, host);
      if (amount === null) return null;
      const owner = valueOwner(a.value, b, host);
      if (host.values.isObjectValue(a.value.valueId) && !owner) return null;
      const cur = host.values.get(a.value.valueId, owner);
      let next: unknown = amount;
      if (a.op !== 'set') {
        const n = typeof amount === 'number' ? amount : Number(amount);
        next = (typeof cur === 'number' ? cur : Number(cur) || 0) + (a.op === 'add' ? n : -n);
      }
      host.values.set(a.value.valueId, next, owner);
      return null;
    }
    case 'showText': {
      const s = evalNum(a.seconds, b, host);
      if (s !== null && s > 0) host.showText(host.values.format(a.text), s);
      return null;
    }
    case 'playSound':
      if (typeof a.assetId === 'string') host.playSound(a.assetId);
      return null;
    case 'wait': {
      const s = evalNum(a.seconds, b, host);
      return s !== null && s > 0 ? s : null;
    }
    case 'changeScene':
      if (typeof a.sceneId === 'string') host.requestScene(a.sceneId);
      return null;
    case 'restartScene':
      host.requestScene(null);
      return null;
    case 'shakeCamera': {
      const s = evalNum(a.seconds, b, host);
      if (s !== null && s > 0) host.camera.shake(s);
      return null;
    }
  }
}
