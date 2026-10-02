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
import {
  DOUBLE_V,
  GRAV,
  MAXSPD,
  MINSPD,
  OLLIE_V,
  PERFECT_WINDOW_S,
  TRICKS,
} from './constants.js';
import { emit } from './events.js';
import { autoDrives, feats, geometry, onFlat, reduce, state } from './state.js';
import { FEATURE_TYPES } from './track/index.js';
import { boardX } from './layout.js';
import { curPose, wheelsScreen } from './pose.js';
import { imgs } from './sprites.js';
import { puff, sparks } from './effects.js';

// ---------------------------------------------------------------- jumps & tricks
const ready = () => !!imgs && !!geometry.cowH;
/** @returns {number} секунды до касания земли при текущей вертикальной скорости */
function timeToLand() {
  return (
    (state.hV +
      Math.sqrt(Math.max(0, state.hV * state.hV + 2 * GRAV * state.h))) /
    GRAV
  );
}

// Переходы автомата режимов (карта, этап 4, D5): state.mode меняется только
// здесь, каждый переход публикует своё событие на шине.

/** @param {'jump' | 'launch'} from чем вызван взлёт */
function enterAir(from) {
  state.mode = 'air';
  state.trickEndT = -1; // в этом вылете трюков ещё не завершали
  emit('airborne', { from });
}
/**
 * @param {number} g высота поверхности под доской (росты коровы)
 * @param {number} impact скорость касания; 0 — возврат после крэша
 * @param {boolean} [perfect] трюки кончились за PERFECT_WINDOW_S до касания
 * @param {boolean} [dirty] последний трюк дожали при касании
 */
function enterGround(g, impact, perfect = false, dirty = false) {
  state.mode = 'ground';
  state.h = g;
  state.isOnRamp = g > 0.001;
  emit('land', { impact, perfect, dirty });
}
/**
 * @param {import('./types').CrashReason} reason причина падения
 */
export function enterCrash(reason) {
  if (state.mode === 'crash') return;
  // колёса снимаем до смены режима — поза с вибрацией, как на кадре крэша
  const w = wheelsScreen();
  // с конструкции — сразу: угол дуги уходит в roll, чтобы поза не прыгнула
  if (state.ride) {
    state.roll += state.ride.ang;
    state.ride = null;
  }
  state.mode = 'crash';
  state.crash = {
    reason,
    t: 0,
    durationS: 1.4,
    r0: state.roll,
    r1: Math.ceil((state.roll + Math.PI) / TAU) * TAU,
    bx: 0,
    bh: state.h,
    bvx: rand(1.2, 1.9),
    bvh: rand(1.6, 2.4),
    brot: state.tilt,
    bvr: rand(7, 11),
    bkick: state.kick,
    bvk: rand(10, 16),
    snap: null,
  };
  state.trick = null;
  state.trickQ = null;
  state.spin = 0;
  state.kick = 0;
  state.kickDrop = 0;
  state.isOnRamp = false;
  state.jumps = 0;
  state.airTricks = [];
  state.airBonus = 0;
  state.trickEndT = -1;
  state.autoSeq = [];
  state.autoDouble = 0;
  state.autoAfter = null;
  state.turbo = 0; // падение — накопленное турбо сгорает
  state.gasHeld = false;
  state.hV = Math.max(state.hV, 0) + 1.7;
  state.shake = 1.8;
  state.sqV -= 2;
  emit('crash', { reason, score: state.score, wheels: w });
}

// ---------------------------------------------------------------- ride
// Режим катания по конструкции (карта, этап 5, петля по gameplay-ux-plan §B):
// спека задаёт траекторию path(s) и интегрирует step(); двигатель только
// вешает позу на точку пути и ведёт камеру. Мир при этом прокручивается
// вслед за коровой — camX держит доску на экранном якоре.

/** @returns {number} секунды до конца текущей траектории ride */
function rideTimeLeft() {
  const ride = state.ride;
  if (!ride) return 0;
  const rs = FEATURE_TYPES[ride.feat.type].ride;
  return rs ? (rs.length(ride.feat) - ride.s) / Math.max(1, ride.v) : 0;
}

/** @param {import('./types').AnyFeature} feat конструкция с ride-спекой */
export function enterRide(feat) {
  if (state.mode !== 'ground' || !FEATURE_TYPES[feat.type].ride) return;
  state.mode = 'ride';
  state.ride = { feat, s: 0, v: state.speed, ang: 0, isAutoDone: false };
  state.isOnRamp = false;
  state.tilt = 0;
  state.tiltV = 0;
  state.h = 0;
  state.hV = 0;
  state.jumps = 1;
  state.trick = null;
  state.trickQ = null;
  state.airTricks = [];
  state.airBonus = 0;
  emit('ride-enter', { type: feat.type });
}

/**
 * Сход с траектории: exit — угол дуги переходит в roll, скорость вдоль
 * траектории становится скоростью заезда; высокий выход — в воздух по
 * касательной. fail — срыв с конструкции.
 * @param {import('./types').RideState} ride
 * @param {import('./types').PathPoint} p точка пути на момент схода
 * @param {import('./types').RideStep} res результат последнего шага спеки
 */
function exitRide(ride, p, res) {
  const v = ride.v,
    feat = ride.feat;
  state.roll += ride.ang;
  state.ride = null;
  emit('ride-exit', { type: feat.type, result: res, ok: v > 0 });
  if (res === 'fail') {
    enterCrash('stall');
    return;
  }
  state.speed = clamp(Math.abs(v), MINSPD, MAXSPD);
  if (Math.abs(p.h) < 0.06) {
    state.hV = 0;
    enterGround(0, 0);
  } else {
    state.hV = clamp(-v * Math.sin(p.angle), 0, 9);
    state.airT = 0;
    state.jumps = 1;
    state.airDurationS = timeToLand();
    state.airBonus += 40; // вылет с конструкции — как выход с рампы
    enterAir('launch');
  }
}

/** Кадр катания по траектории: спека двигает s, поза — по path(s).
 * @param {number} dt шаг, секунды
 */
function rideStep(dt) {
  const ride = /** @type {import('./types').RideState} */ (state.ride),
    rs = FEATURE_TYPES[ride.feat.type].ride;
  if (!rs) {
    exitRide(ride, { X: boardX(), h: 0, angle: 0 }, 'exit');
    return;
  }
  stepTrick(dt);
  // демо-автопилот делает один трюк на дуге — показывает, что можно
  if (autoDrives() && rs.tricks && !ride.isAutoDone && state.trick === null) {
    const left = rs.length(ride.feat);
    if (ride.s > left * 0.25 && ride.s < left * 0.75) {
      ride.isAutoDone = true;
      startTrick(pick(['spin', 'kick']), rideTimeLeft());
    }
  }
  const res = rs.step(ride.feat, ride, dt);
  const p = rs.path(ride.feat, ride.s);
  state.camX = p.X - (geometry.ox + 200 * geometry.s - geometry.vx);
  state.h = Math.max(0, p.h);
  ride.ang = p.angle;
  if (res !== 'ride') exitRide(ride, p, res);
}

/** @returns {boolean} получилось ли прыгнуть/сделать двойной */
export function jump() {
  if (!ready() || state.mode === 'crash') return false;
  if (state.mode === 'ground') {
    state.hV = OLLIE_V + (state.isOnRamp ? state.slope * state.speed * 0.5 : 0);
    state.airT = 0;
    state.jumps = 1;
    state.isOnRamp = false;
    state.airTricks = [];
    state.airBonus = 0;
    state.tiltV -= 2.6;
    state.sqV += 1.4;
    state.earV -= 3.2;
    state.tagV += 3.5;
    enterAir('jump');
  } else if (state.mode === 'air' && state.jumps < 2) {
    state.jumps = 2;
    state.hV = Math.max(state.hV, 0) * 0.3 + DOUBLE_V;
    state.airTricks.push('double');
    emit('trick', { kind: 'double' });
    state.tiltV -= 1.8;
    state.earV -= 2.6;
    state.tagV += 3;
    state.sqV += 1;
    emit('airborne', { from: 'double' });
  } else return false;
  state.airDurationS = state.airT + timeToLand();
  return true;
}
/**
 * @param {import('./types').TrickKind} kind
 * @param {number} [tl] секунд до конца окна трюка (в воздухе — до земли)
 */
function startTrick(kind, tl = timeToLand()) {
  const T = TRICKS[kind];
  state.trick = {
    kind,
    t: 0,
    durationS: clamp(tl - 0.06, 0.28, T.durationS),
    dir: /** @type {1 | -1} */ (Math.random() < 0.5 ? 1 : -1),
  };
  state.earV -= 1.5;
  state.tagV += rand(-3, 3);
}
/** @param {import('./types').TrickKind} kind */
export function trick(kind) {
  if (!ready() || state.mode === 'crash') return;
  // на конструкции трюки без прыжка — доска прижата к траектории
  if (state.mode === 'ride') {
    const rs = state.ride && FEATURE_TYPES[state.ride.feat.type].ride;
    if (!rs || !rs.tricks) return;
    if (state.trick) {
      state.trickQ = kind;
      return;
    }
    startTrick(kind, rideTimeLeft());
    return;
  }
  if (state.mode !== 'air' && !jump()) return;
  if (state.trick) {
    state.trickQ = kind;
    return;
  }
  startTrick(kind);
}
function finishTrick() {
  const tr = state.trick;
  if (!tr) return;
  state.spin = 0;
  state.roll = 0;
  state.kick = 0;
  state.kickDrop = 0;
  state.airTricks.push(tr.kind);
  state.trickEndT = state.airT; // момент завершения — для «идеального» land
  if (state.mode === 'ride') state.airBonus += 100; // трюк на конструкции дороже
  emit('trick', { kind: tr.kind });
  state.trick = null;
  if (state.trickQ) {
    const q = state.trickQ;
    state.trickQ = null;
    const tl = state.mode === 'ride' ? rideTimeLeft() : timeToLand();
    if (tl > 0.3) startTrick(q, tl);
  }
}
/** @param {number} dt шаг, секунды */
function stepTrick(dt) {
  const tr = state.trick;
  if (!tr) return;
  tr.t += dt;
  const p = clamp(tr.t / tr.durationS, 0, 1),
    e = easeInOut(p);
  if (tr.kind === 'spin') state.spin = TAU * e * tr.dir;
  else if (tr.kind === 'flip') state.roll = -TAU * e;
  else {
    state.kick = TAU * e;
    state.kickDrop = Math.sin(Math.PI * p) * 46;
  }
  if (p >= 1) finishTrick();
}
/** слетели с конструкции — вылет в воздух */
export function launch() {
  state.airT = 0;
  state.jumps = 1;
  state.hV = Math.min(3.9, 2.2 + 1.25 * state.spdN);
  state.airTricks = [];
  state.airBonus = 40;
  state.airDurationS = timeToLand();
  state.tiltV -= 1.2;
  state.earV -= 3;
  state.tagV += 3;
  state.shake = Math.min(1.8, state.shake + 0.45);
  enterAir('launch');
  if (autoDrives()) {
    const seqs = /** @type {import('./types').TrickKind[][]} */ (
      state.airDurationS > 0.95
        ? [
            ['spin', 'kick'],
            ['flip', 'kick'],
            ['kick', 'spin'],
            ['flip'],
            ['spin', 'flip'],
          ]
        : [['flip'], ['spin'], ['kick']]
    );
    state.autoSeq = pick(seqs).slice();
  }
}
/** @param {number} g высота земли под доской (росты коровы) */
function land(g) {
  // недокрученный к касанию трюк дожимаем — очки за него есть, но цепь
  // его не засчитывает (combo.js читает dirty из события land)
  const dirty = !!state.trick;
  if (state.trick) {
    if (state.trick.t / state.trick.durationS > 0.8) finishTrick();
    else {
      state.h = g;
      enterCrash('bail');
      return;
    }
  }
  // «идеальное» приземление: последний трюк завершился раньше, чем за
  // PERFECT_WINDOW_S до касания — дожатый трюк идеальным не считается
  const perfect =
    !dirty &&
    state.trickEndT >= 0 &&
    state.airT - state.trickEndT >= PERFECT_WINDOW_S;
  state.trickQ = null;
  const impact = -state.hV;
  state.hV = 0;
  state.jumps = 0;
  state.airT = 0;
  state.sqV -= impact * 1.3;
  state.bobV += impact * 0.1;
  state.tiltV += 0.5;
  state.shake = Math.min(1.8, state.shake + 0.5 + 0.22 * impact);
  state.earV -= 3.4;
  state.tagV += (Math.random() < 0.5 ? -1 : 1) * 4.5;
  enterGround(g, impact, perfect, dirty);
}

// ---------------------------------------------------------------- crash
/** @param {number} dt шаг, секунды */
function crashStep(dt) {
  const c = /** @type {import('./types').CrashState} */ (state.crash);
  c.t += dt;
  // корова: подброс и кувырок вперёд
  state.hV -= GRAV * dt;
  state.h += state.hV * dt;
  if (state.h <= 0) {
    if (state.hV < -0.9) {
      state.hV = -state.hV * 0.32;
      state.sqV -= 1.4;
      state.shake = Math.min(1.8, state.shake + 0.3);
      const w = wheelsScreen();
      puff(w[1].x, w[1].y, w[1].z, 8, 1.2);
    } else state.hV = 0;
    state.h = 0;
  }
  const k = clamp(c.t / 0.95, 0, 1);
  state.roll = lerp(c.r0, c.r1, 1 - (1 - k) ** 3);
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
    c.bh = lerp(s0.bh, state.h, u);
    c.brot = lerp(s0.brot, Math.round(s0.brot / TAU) * TAU + state.tilt, u);
    c.bkick = lerp(s0.bkick, Math.round(s0.bkick / TAU) * TAU, u);
  }
  if (c.t >= c.durationS) {
    state.crash = null;
    state.roll = 0;
    state.invuln = 1.1;
    state.sqV -= 1;
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
  if (state.mode !== 'ground') return;
  if (gi.h > 0.001) {
    state.h = gi.h;
    state.isOnRamp = true;
    state.slope = gi.slope;
  } else if (state.isOnRamp) {
    state.isOnRamp = false;
    state.h = 0;
    launch();
  } else state.h = 0;
}

// ---------------------------------------------------------------- history
/** История поз для призраков (фиксированный шаг 1/60). @param {number} dt */
export function stepHistory(dt) {
  state.histAcc += dt;
  while (state.histAcc >= 1 / 60) {
    state.histAcc -= 1 / 60;
    state.hist.push(curPose()); // кольцо само вытесняет самую старую позу
  }
}

// ---------------------------------------------------------------- autopilot
export function autopilot() {
  if (!autoDrives() || state.mode === 'crash') return;
  if (state.mode === 'air') {
    if (state.autoDouble && state.airT >= state.autoDouble && state.jumps < 2) {
      state.autoDouble = 0;
      jump();
      if (state.autoAfter && !state.trick) {
        startTrick(state.autoAfter);
      }
      state.autoAfter = null;
    }
    if (
      !state.trick &&
      state.autoSeq.length &&
      state.airT > 0.05 &&
      timeToLand() > 0.36
    ) {
      const tk = state.autoSeq.shift();
      if (tk) startTrick(tk);
    }
    return;
  }
  // ground: решения по конструкциям; ride/crash — вне зоны автопилота
  if (state.mode !== 'ground') return;
  const Xb = boardX(),
    V = state.speed * geometry.cowH;
  state.throttle = 0; // в демо газом владеет автопилот
  state.gasHeld = false;
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
        state.autoDouble = 0.25;
        if (Math.random() < 0.5) state.autoAfter = pick(['spin', 'kick']);
      } else if (hint.action === 'jump') {
        jump();
        if (Math.random() < 0.5) startTrick(pick(['kick', 'spin']));
      } else {
        state.throttle = 1; // hold — зажать разгон
        state.gasHeld = true; // демо держит «ГАЗ» — качает как игрок
      }
      return;
    }
  }
  const room = !hint || (hint.at - Xb) / V > 1.6;
  if (room && state.t > state.nextFlourish) {
    state.nextFlourish = state.t + rand(3, 5.5);
    const r = Math.random();
    if (r < 0.28) {
      jump();
      startTrick('kick');
    } else if (r < 0.54) {
      jump();
      startTrick('spin');
    } else if (r < 0.86) {
      jump();
      state.autoDouble = 0.24;
      state.autoAfter = 'flip';
    } else jump();
  }
}

/**
 * @param {number} dt шаг, секунды
 * @param {number} g высота земли под доской (росты коровы)
 */
export function physicsStep(dt, g) {
  // подвеска
  state.bobV += (-760 * state.bob - 17 * state.bobV) * dt;
  state.bob += state.bobV * dt;
  // наклон: на земле — покачивание, на трамплине — по склону, в воздухе — нос вверх, потом выравнивание
  let tt;
  if (state.mode === 'crash') tt = 0;
  else if (state.mode === 'air') {
    const ph = state.airT / Math.max(0.3, state.airDurationS);
    tt =
      ph < 0.32
        ? -0.17
        : lerp(-0.17, 0.04, smooth(clamp((ph - 0.32) / 0.58, 0, 1)));
  } else if (state.isOnRamp) tt = -Math.atan(state.slope);
  else
    tt =
      0.007 * Math.sin(state.t * 1.7) +
      0.006 * nB(state.t * 0.8) +
      0.004 * state.boost * Math.sin(state.t * 5.3);
  const kT = state.mode === 'air' ? 190 : 300;
  state.tiltV += (-kT * (state.tilt - tt) - 13 * state.tiltV) * dt;
  state.tilt += state.tiltV * dt;
  // приседание
  state.sqV += (-420 * (state.sq - 1) - 15 * state.sqV) * dt;
  state.sq += state.sqV * dt;
  state.sq = clamp(state.sq, 0.84, 1.1);
  // ухо на ветру
  const flutter =
    (Math.sin(state.t * 14.3) * 0.5 +
      Math.sin(state.t * 31.7 + 1.1) * 0.22 +
      nD(state.t * 7) * 0.55) *
    0.03 *
    (0.55 + 0.45 * state.spdN) *
    (reduce ? 0.5 : 1);
  const earT =
    0.04 + 0.06 * state.boost + (state.mode === 'air' ? 0.08 : 0) + flutter;
  state.earV += (-150 * (state.ear - earT) - 7 * state.earV) * dt;
  state.ear = clamp(state.ear + state.earV * dt, -0.3, 0.34);
  // бирка-маятник, которую отдувает назад
  const wind =
    20 *
    state.spdN *
    state.spdN *
    (1 + 0.28 * Math.sin(state.t * 19.1) + 0.25 * nC(state.t * 6.3));
  state.tagV +=
    (-72 * Math.sin(state.tag) +
      wind * Math.cos(state.tag) * 0.9 -
      2.4 * state.tagV) *
    dt;
  state.tag = clamp(state.tag + state.tagV * dt, -1.2, 1.3);

  if (state.mode === 'crash') {
    crashStep(dt);
    return;
  }
  if (state.mode === 'ride') {
    rideStep(dt);
    return;
  }
  if (state.mode === 'air') {
    state.airT += dt;
    state.hV -= GRAV * dt;
    state.h += state.hV * dt;
    stepTrick(dt);
    if (state.h <= g && state.hV < 0) land(g);
  }
}

/**
 * @param {number} i колесо (0 — заднее, 1 — переднее)
 * @param {number} strength сила удара
 */
export function bumpAt(i, strength) {
  if (!onFlat()) return;
  state.bobV -= 0.11 * strength;
  state.tiltV += (i === 1 ? -1.3 : 0.9) * strength;
  state.shake = Math.min(1.6, state.shake + 0.35 * strength);
  state.earV -= 1.5 * strength;
  state.tagV += rand(-2.5, 2.5) * strength;
  const w = wheelsScreen()[i];
  puff(w.x, w.y, w.z, 7, 1.1 * strength);
  if (Math.random() < 0.45) sparks(w.x, w.y, w.z, 4);
}
