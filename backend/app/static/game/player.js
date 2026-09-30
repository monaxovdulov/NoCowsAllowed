import {
  clamp,
  easeInOut,
  lerp,
  nB,
  nC,
  nD,
  pick,
  rand,
  smooth,
  TAU,
} from './utils.js';
import { DOUBLE_V, GRAV, OLLIE_V, TRICKS } from './constants.js';
import { emit } from './events.js';
import { feats, G, onFlat, playerMode, reduce, S } from './state.js';
import { FEATURE_TYPES } from './track/index.js';
import { boardX } from './layout.js';
import { curPose, wheelsScreen } from './pose.js';
import { imgs } from './sprites.js';
import { puff, sparks } from './effects.js';

// ---------------------------------------------------------------- jumps & tricks
const ready = () => !!imgs && !!G.cowH;
/** @returns {number} секунды до касания земли при текущей вертикальной скорости */
function timeToLand() {
  return (S.hV + Math.sqrt(Math.max(0, S.hV * S.hV + 2 * GRAV * S.h))) / GRAV;
}

// Переходы автомата режимов (карта, этап 4, D5): S.mode меняется только
// здесь, каждый переход публикует своё событие на шине.

/** @param {'jump' | 'launch'} from чем вызван взлёт */
function enterAir(from) {
  S.mode = 'air';
  emit('airborne', { from });
}
/**
 * @param {number} g высота поверхности под доской (росты коровы)
 * @param {number} impact скорость касания; 0 — возврат после крэша
 */
function enterGround(g, impact) {
  S.mode = 'ground';
  S.h = g;
  S.onRamp = g > 0.001;
  emit('land', { impact });
}
/**
 * @param {import('./types').CrashReason} reason причина падения
 */
export function enterCrash(reason) {
  if (S.mode === 'crash') return;
  // колёса снимаем до смены режима — поза с вибрацией, как на кадре крэша
  const w = wheelsScreen();
  S.mode = 'crash';
  S.crash = {
    reason,
    t: 0,
    dur: 1.4,
    r0: S.roll,
    r1: Math.ceil((S.roll + Math.PI) / TAU) * TAU,
    bx: 0,
    bh: S.h,
    bvx: rand(1.2, 1.9),
    bvh: rand(1.6, 2.4),
    brot: S.tilt,
    bvr: rand(7, 11),
    bkick: S.kick,
    bvk: rand(10, 16),
    snap: null,
  };
  S.trick = null;
  S.trickQ = null;
  S.spin = 0;
  S.kick = 0;
  S.kickDrop = 0;
  S.onRamp = false;
  S.jumps = 0;
  S.airTricks = [];
  S.airBonus = 0;
  S.autoSeq = [];
  S.autoDouble = 0;
  S.autoAfter = null;
  S.hV = Math.max(S.hV, 0) + 1.7;
  S.shake = 1.8;
  S.sqV -= 2;
  emit('crash', { reason, score: S.score, wheels: w });
}

/** @returns {boolean} получилось ли прыгнуть/сделать двойной */
export function jump() {
  if (!ready() || S.mode === 'crash') return false;
  if (S.mode === 'ground') {
    S.hV = OLLIE_V + (S.onRamp ? S.slope * S.speed * 0.5 : 0);
    S.airT = 0;
    S.jumps = 1;
    S.onRamp = false;
    S.airTricks = [];
    S.airBonus = 0;
    S.tiltV -= 2.6;
    S.sqV += 1.4;
    S.earV -= 3.2;
    S.tagV += 3.5;
    enterAir('jump');
  } else if (S.mode === 'air' && S.jumps < 2) {
    S.jumps = 2;
    S.hV = Math.max(S.hV, 0) * 0.3 + DOUBLE_V;
    S.airTricks.push('double');
    emit('trick', { kind: 'double' });
    S.tiltV -= 1.8;
    S.earV -= 2.6;
    S.tagV += 3;
    S.sqV += 1;
    emit('airborne', { from: 'double' });
  } else return false;
  S.airDur = S.airT + timeToLand();
  return true;
}
/** @param {import('./types').TrickKind} kind */
function startTrick(kind) {
  const T = TRICKS[kind];
  S.trick = {
    kind,
    t: 0,
    dur: clamp(timeToLand() - 0.06, 0.28, T.dur),
    dir: /** @type {1 | -1} */ (Math.random() < 0.5 ? 1 : -1),
  };
  S.earV -= 1.5;
  S.tagV += rand(-3, 3);
}
/** @param {import('./types').TrickKind} kind */
export function trick(kind) {
  if (!ready() || S.mode === 'crash') return;
  if (S.mode !== 'air' && !jump()) return;
  if (S.trick) {
    S.trickQ = kind;
    return;
  }
  startTrick(kind);
}
function finishTrick() {
  const tr = S.trick;
  if (!tr) return;
  S.spin = 0;
  S.roll = 0;
  S.kick = 0;
  S.kickDrop = 0;
  S.airTricks.push(tr.kind);
  emit('trick', { kind: tr.kind });
  S.trick = null;
  if (S.trickQ) {
    const q = S.trickQ;
    S.trickQ = null;
    if (timeToLand() > 0.3) startTrick(q);
  }
}
function stepTrick(dt) {
  const tr = S.trick;
  if (!tr) return;
  tr.t += dt;
  const p = clamp(tr.t / tr.dur, 0, 1),
    e = easeInOut(p);
  if (tr.kind === 'spin') S.spin = TAU * e * tr.dir;
  else if (tr.kind === 'flip') S.roll = -TAU * e;
  else {
    S.kick = TAU * e;
    S.kickDrop = Math.sin(Math.PI * p) * 46;
  }
  if (p >= 1) finishTrick();
}
/** слетели с конструкции — вылет в воздух */
export function launch() {
  S.airT = 0;
  S.jumps = 1;
  S.hV = Math.min(3.9, 2.2 + 1.25 * S.spdN);
  S.airTricks = [];
  S.airBonus = 40;
  S.airDur = timeToLand();
  S.tiltV -= 1.2;
  S.earV -= 3;
  S.tagV += 3;
  S.shake = Math.min(1.8, S.shake + 0.45);
  enterAir('launch');
  if (!playerMode()) {
    const seqs = /** @type {import('./types').TrickKind[][]} */ (
      S.airDur > 0.95
        ? [
            ['spin', 'kick'],
            ['flip', 'kick'],
            ['kick', 'spin'],
            ['flip'],
            ['spin', 'flip'],
          ]
        : [['flip'], ['spin'], ['kick']]
    );
    S.autoSeq = pick(seqs).slice();
  }
}
/** @param {number} g высота земли под доской (росты коровы) */
function land(g) {
  if (S.trick) {
    if (S.trick.t / S.trick.dur > 0.8) finishTrick();
    else {
      S.h = g;
      enterCrash('bail');
      return;
    }
  }
  S.trickQ = null;
  const impact = -S.hV;
  S.hV = 0;
  S.jumps = 0;
  S.airT = 0;
  S.sqV -= impact * 1.3;
  S.bobV += impact * 0.1;
  S.tiltV += 0.5;
  S.shake = Math.min(1.8, S.shake + 0.5 + 0.22 * impact);
  S.earV -= 3.4;
  S.tagV += (Math.random() < 0.5 ? -1 : 1) * 4.5;
  enterGround(g, impact);
}

// ---------------------------------------------------------------- crash
/** @param {number} dt шаг, секунды */
function crashStep(dt) {
  const c = S.crash;
  c.t += dt;
  // корова: подброс и кувырок вперёд
  S.hV -= GRAV * dt;
  S.h += S.hV * dt;
  if (S.h <= 0) {
    if (S.hV < -0.9) {
      S.hV = -S.hV * 0.32;
      S.sqV -= 1.4;
      S.shake = Math.min(1.8, S.shake + 0.3);
      const w = wheelsScreen();
      puff(w[1].x, w[1].y, w[1].z, 8, 1.2);
    } else S.hV = 0;
    S.h = 0;
  }
  const k = clamp(c.t / 0.95, 0, 1);
  S.roll = lerp(c.r0, c.r1, 1 - (1 - k) ** 3);
  // доска улетает вперёд, кувыркаясь, потом возвращается под копыта
  if (c.t < 0.95) {
    c.bvh -= GRAV * dt;
    c.bh += c.bvh * dt;
    if (c.bh <= 0) {
      c.bh = 0;
      c.bvh = Math.abs(c.bvh) > 0.8 ? -c.bvh * 0.38 : 0;
      c.bvr *= 0.5;
      c.bvk *= 0.5;
    }
    c.bx += c.bvx * dt;
    c.bvx *= Math.exp(-dt * 1.6);
    c.brot += c.bvr * dt;
    c.bkick += c.bvk * dt;
    c.snap = { bx: c.bx, bh: c.bh, brot: c.brot, bkick: c.bkick };
  } else {
    const u = smooth(clamp((c.t - 0.95) / 0.32, 0, 1)),
      s0 = c.snap || { bx: 0, bh: 0, brot: 0, bkick: 0 };
    c.bx = lerp(s0.bx, 0, u);
    c.bh = lerp(s0.bh, S.h, u);
    c.brot = lerp(s0.brot, Math.round(s0.brot / TAU) * TAU + S.tilt, u);
    c.bkick = lerp(s0.bkick, Math.round(s0.bkick / TAU) * TAU, u);
  }
  if (c.t >= c.dur) {
    S.crash = null;
    S.roll = 0;
    S.invuln = 1.1;
    S.sqV -= 1;
    enterGround(0, 0);
  }
}

// ---------------------------------------------------------------- ground
/**
 * Опора под доской в режиме ground: конструкция несёт — едем по её
 * поверхности, съехали с края — вылет.
 * @param {import('./types').GroundInfo} gi поверхность под доской
 */
export function stepGround(gi) {
  if (S.mode !== 'ground') return;
  if (gi.h > 0.001) {
    S.h = gi.h;
    S.onRamp = true;
    S.slope = gi.slope;
  } else if (S.onRamp) {
    S.onRamp = false;
    S.h = 0;
    launch();
  } else S.h = 0;
}

// ---------------------------------------------------------------- history
/** История поз для призраков (фиксированный шаг 1/60). @param {number} dt */
export function stepHistory(dt) {
  S.histAcc += dt;
  while (S.histAcc >= 1 / 60) {
    S.histAcc -= 1 / 60;
    S.hist.unshift(curPose());
    if (S.hist.length > 14) S.hist.pop();
  }
}

// ---------------------------------------------------------------- autopilot
export function autopilot() {
  if (playerMode() || S.mode === 'crash') return;
  if (S.mode === 'air') {
    if (S.autoDouble && S.airT >= S.autoDouble && S.jumps < 2) {
      S.autoDouble = 0;
      jump();
      if (S.autoAfter && !S.trick) {
        startTrick(S.autoAfter);
      }
      S.autoAfter = null;
    }
    if (!S.trick && S.autoSeq.length && S.airT > 0.05 && timeToLand() > 0.36)
      startTrick(S.autoSeq.shift());
    return;
  }
  // ground: решения по конструкциям; ride/crash — вне зоны автопилота
  if (S.mode !== 'ground') return;
  const Xb = boardX(),
    V = S.speed * G.cowH;
  S.throttle = 0; // в демо газом владеет автопилот
  // ближайшая конструкция с подсказкой: спека знает свою актуальность
  /** @type {import('./types').AutopilotHint | null} */
  let hint = null;
  for (const f of feats) {
    const hnt = FEATURE_TYPES[f.type].autopilot?.(f);
    if (hnt) {
      hint = hnt;
      break;
    }
  }
  if (hint && hint.action !== 'none') {
    const t = (hint.at - Xb) / V;
    if (t <= hint.leadS && t > -0.05) {
      if (hint.action === 'double') {
        jump();
        S.autoDouble = 0.25;
        if (Math.random() < 0.5) S.autoAfter = pick(['spin', 'kick']);
      } else if (hint.action === 'jump') {
        jump();
        if (Math.random() < 0.5) startTrick(pick(['kick', 'spin']));
      } else S.throttle = 1; // hold — зажать разгон
      return;
    }
  }
  const room = !hint || (hint.at - Xb) / V > 1.6;
  if (room && S.t > S.nextFlourish) {
    S.nextFlourish = S.t + rand(3, 5.5);
    const r = Math.random();
    if (r < 0.28) {
      jump();
      startTrick('kick');
    } else if (r < 0.54) {
      jump();
      startTrick('spin');
    } else if (r < 0.86) {
      jump();
      S.autoDouble = 0.24;
      S.autoAfter = 'flip';
    } else jump();
  }
}

/**
 * @param {number} dt шаг, секунды
 * @param {number} g высота земли под доской (росты коровы)
 */
export function physicsStep(dt, g) {
  // подвеска
  S.bobV += (-760 * S.bob - 17 * S.bobV) * dt;
  S.bob += S.bobV * dt;
  // наклон: на земле — покачивание, на трамплине — по склону, в воздухе — нос вверх, потом выравнивание
  let tt;
  if (S.mode === 'crash') tt = 0;
  else if (S.mode === 'air') {
    const ph = S.airT / Math.max(0.3, S.airDur);
    tt =
      ph < 0.32
        ? -0.17
        : lerp(-0.17, 0.04, smooth(clamp((ph - 0.32) / 0.58, 0, 1)));
  } else if (S.onRamp) tt = -Math.atan(S.slope);
  else
    tt =
      0.007 * Math.sin(S.t * 1.7) +
      0.006 * nB(S.t * 0.8) +
      0.004 * S.boost * Math.sin(S.t * 5.3);
  const kT = S.mode === 'air' ? 190 : 300;
  S.tiltV += (-kT * (S.tilt - tt) - 13 * S.tiltV) * dt;
  S.tilt += S.tiltV * dt;
  // приседание
  S.sqV += (-420 * (S.sq - 1) - 15 * S.sqV) * dt;
  S.sq += S.sqV * dt;
  S.sq = clamp(S.sq, 0.84, 1.1);
  // ухо на ветру
  const flutter =
    (Math.sin(S.t * 14.3) * 0.5 +
      Math.sin(S.t * 31.7 + 1.1) * 0.22 +
      nD(S.t * 7) * 0.55) *
    0.03 *
    (0.55 + 0.45 * S.spdN) *
    (reduce ? 0.5 : 1);
  const earT = 0.04 + 0.06 * S.boost + (S.mode === 'air' ? 0.08 : 0) + flutter;
  S.earV += (-150 * (S.ear - earT) - 7 * S.earV) * dt;
  S.ear = clamp(S.ear + S.earV * dt, -0.3, 0.34);
  // бирка-маятник, которую отдувает назад
  const wind =
    20 *
    S.spdN *
    S.spdN *
    (1 + 0.28 * Math.sin(S.t * 19.1) + 0.25 * nC(S.t * 6.3));
  S.tagV +=
    (-72 * Math.sin(S.tag) + wind * Math.cos(S.tag) * 0.9 - 2.4 * S.tagV) * dt;
  S.tag = clamp(S.tag + S.tagV * dt, -1.2, 1.3);

  if (S.mode === 'crash') {
    crashStep(dt);
    return;
  }
  if (S.mode === 'air') {
    S.airT += dt;
    S.hV -= GRAV * dt;
    S.h += S.hV * dt;
    stepTrick(dt);
    if (S.h <= g && S.hV < 0) land(g);
  }
}

/**
 * @param {number} i колесо (0 — заднее, 1 — переднее)
 * @param {number} strength сила удара
 */
export function bumpAt(i, strength) {
  if (!onFlat()) return;
  S.bobV -= 0.11 * strength;
  S.tiltV += (i === 1 ? -1.3 : 0.9) * strength;
  S.shake = Math.min(1.6, S.shake + 0.35 * strength);
  S.earV -= 1.5 * strength;
  S.tagV += rand(-2.5, 2.5) * strength;
  const w = wheelsScreen()[i];
  puff(w.x, w.y, w.z, 7, 1.1 * strength);
  if (Math.random() < 0.45) sparks(w.x, w.y, w.z, 4);
}
