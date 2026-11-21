import type { Action } from '../../model/schema';
import type { Instance } from '../types';
import { centerOf, evalNum, evalOperand, placeAt, placePoint, propOf, resolveTarget, setPropOf, valueOwner, type Binding, type RuleHost } from './host';

/** Strength 1 = 100 px/s of push. */
const PUSH_UNIT = 100;

function targets(a: { target: Parameters<typeof resolveTarget>[0] }, b: Binding, host: RuleHost): Instance[] {
  return resolveTarget(a.target, b, host);
}

/** What the actions run so far are still doing; "wait for the steps above to finish" waits on it. */
export interface Busy {
  /** Game time the timed effects (glides, bubbles, screen text, shakes, flashes) end. */
  until: number;
  /** Objects playing a once-only animation started by this run. */
  anims: Instance[];
}

/**
 * Runs one action. Returns seconds to wait for `wait`, otherwise null.
 * Actions that change the world fire their own triggers through the host
 * (created/destroyed/valueChanged), which dispatch immediately. Timed effects
 * are recorded in `busy` when given.
 */
export function runAction(a: Action, b: Binding, host: RuleHost, busy?: Busy): number | null {
  const lasts = (s: number) => {
    if (busy) busy.until = Math.max(busy.until, host.time + s);
  };
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
        if (i.anim?.assetId === a.assetId && !i.anim.done && i.anim.fps === fps) continue; // already playing: don't restart every frame
        i.anim = { assetId: a.assetId, fps, loop: a.loop, t: 0, frame: 0 };
        i.still = null;
        if (!a.loop) busy?.anims.push(i);
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
      if (s !== null && s > 0) {
        host.showText(host.values.format(a.text), s);
        lasts(s);
      }
      return null;
    }
    case 'playSound':
      if (typeof a.assetId === 'string') host.playSound(a.assetId);
      return null;
    case 'wait': {
      const s = evalNum(a.seconds, b, host);
      return s !== null && s > 0 ? s : null;
    }
    // Flow steps; the interpreter handles them.
    case 'waitDone':
    case 'waitUntil':
    case 'together':
      return null;
    case 'changeScene':
      if (typeof a.sceneId === 'string') host.requestScene(a.sceneId);
      return null;
    case 'restartScene':
      host.requestScene(null);
      return null;
    case 'shakeCamera': {
      const s = evalNum(a.seconds, b, host);
      if (s !== null && s > 0) {
        host.camera.shake(s);
        lasts(s);
      }
      return null;
    }
    case 'share':
      host.share(host.values.format(a.text));
      return null;
    case 'playAnim':
      if (typeof a.anim !== 'string') return null;
      for (const i of targets(a, b, host)) {
        host.world.playAnim(i, a.anim);
        if (i.anim && !i.anim.loop && !i.anim.done) busy?.anims.push(i);
      }
      return null;
    case 'stopAnim':
      for (const i of targets(a, b, host)) {
        i.still = i.anim ? i.anim.frame : (i.still ?? 0);
        i.anim = null;
      }
      return null;
    case 'setFrame': {
      const f = evalNum(a.frame, b, host);
      if (f !== null) for (const i of targets(a, b, host)) setPropOf(i, 'frame', f);
      return null;
    }
    case 'setProp': {
      const n = evalNum(a.amount, b, host);
      if (n === null) return null;
      for (const i of targets(a, b, host)) {
        const cur = propOf(i, a.p, host);
        setPropOf(i, a.p, a.op === 'set' ? n : a.op === 'add' ? cur + n : cur - n);
      }
      return null;
    }
    case 'turn': {
      const d = evalNum(a.degrees, b, host);
      if (d !== null) for (const i of targets(a, b, host)) setPropOf(i, 'rotation', i.rotation + d);
      return null;
    }
    case 'pointTowards':
      for (const i of targets(a, b, host)) {
        const p = placePoint(a.to, b, host);
        const c = centerOf(i);
        if (p && (p.x !== c.x || p.y !== c.y)) setPropOf(i, 'rotation', (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI);
      }
      return null;
    case 'face':
      for (const i of targets(a, b, host)) i.facing = a.dir === 'flip' ? -i.facing : a.dir === 'left' ? -1 : 1;
      return null;
    case 'tint':
      for (const i of targets(a, b, host)) i.tint = a.color;
      return null;
    case 'glide': {
      const s = evalNum(a.seconds, b, host);
      if (s === null) return null;
      for (const i of targets(a, b, host)) {
        const p = placeAt(a.to, i.w, i.h, b, host);
        if (!p) continue;
        if (s <= 0) {
          i.x = p.x;
          i.y = p.y;
          i.glide = null;
        } else {
          i.glide = { fx: i.x, fy: i.y, tx: p.x, ty: p.y, t: 0, dur: s };
          lasts(s);
        }
      }
      return null;
    }
    case 'headTowards': {
      const v = evalNum(a.speed, b, host);
      if (v === null) return null;
      for (const i of targets(a, b, host)) {
        const p = placePoint(a.to, b, host);
        if (!p) continue;
        const c = centerOf(i);
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < 1e-6) continue;
        i.vx = ((p.x - c.x) / d) * v;
        i.vy = ((p.y - c.y) / d) * v;
        i.dir = { x: (p.x - c.x) / d, y: (p.y - c.y) / d };
        if (Math.abs(i.vx) > 1e-6) i.facing = i.vx < 0 ? -1 : 1;
        i.body ||= i.solid === 'none';
      }
      return null;
    }
    case 'say': {
      const s = evalNum(a.seconds, b, host);
      if (s === null) return null;
      for (const i of targets(a, b, host)) i.say = s > 0 && a.text ? { text: host.values.format(a.text), until: host.time + s } : null;
      if (s > 0 && a.text) lasts(s);
      return null;
    }
    case 'clone':
      for (const src of targets(a, b, host))
        host.world.spawn(src.kindId, src.x, src.y, (c) => {
          c.values = new Map(src.values);
          c.lookId = src.lookId;
          c.anim = src.anim ? { ...src.anim } : null;
          c.still = src.still;
          c.rotation = src.rotation;
          c.facing = src.facing;
          c.tint = src.tint;
          c.opacity = src.opacity;
          c.layer = src.layer;
          c.hidden = src.hidden;
          c.w = src.w;
          c.h = src.h;
          c.hit = { ...src.hit };
          c.vx = src.vx;
          c.vy = src.vy;
        });
      return null;
    case 'sendMessage':
      if (typeof a.name === 'string') host.message(a.name);
      return null;
    case 'lockCursor':
    case 'unlockCursor':
      host.lockPointer(a.type === 'lockCursor');
      return null;
    case 'setCursor':
      host.setCursor(a.style);
      return null;
    case 'cursorLook':
      if (typeof a.assetId === 'string') host.setCursorLook(a.assetId);
      return null;
    case 'playMusic':
      if (typeof a.assetId === 'string') host.music(a.assetId);
      return null;
    case 'stopMusic':
      host.music(null);
      return null;
    case 'stopSounds':
      host.stopSounds();
      return null;
    case 'setVolume': {
      const v = evalNum(a.percent, b, host);
      if (v !== null) host.setVolume(Math.min(2, Math.max(0, v / 100)));
      return null;
    }
    case 'zoomCamera': {
      const v = evalNum(a.percent, b, host);
      if (v !== null && v > 0) host.camera.zoom = Math.min(8, Math.max(0.1, v / 100));
      return null;
    }
    case 'cameraFollow': {
      const t = targets(a, b, host)[0];
      if (t) host.follow(t.id);
      return null;
    }
    case 'cameraMoveTo': {
      const p = placePoint(a.to, b, host);
      if (!p) return null;
      host.follow(null);
      host.camera.centerOn(p.x, p.y);
      return null;
    }
    case 'flashScreen': {
      const s = evalNum(a.seconds, b, host);
      if (s !== null && s > 0) {
        host.flash(a.color, s);
        lasts(s);
      }
      return null;
    }
    case 'burst': {
      const n = evalNum(a.count, b, host);
      const p = placePoint(a.place, b, host);
      if (n !== null && p) host.world.burst(p.x, p.y, a.color, Math.min(200, Math.max(0, Math.round(n))));
      return null;
    }
    case 'fullscreen':
      host.fullscreen(a.mode);
      return null;
    case 'timeScale': {
      const v = evalNum(a.percent, b, host);
      if (v !== null) host.timeScale = Math.min(10, Math.max(0, v / 100));
      return null;
    }
    case 'setText':
      if (a.target.t === 'ui') host.ui.setText(a.target.id, a.text);
      return null;
    case 'setTile': {
      const p = placePoint(a.place, b, host);
      const t = evalNum(a.tile, b, host);
      if (p && t !== null) host.world.setTileAtPoint(p.x, p.y, Math.round(t));
      return null;
    }
  }
}
