import {
  autoEl,
  bestEl,
  boostEl,
  cloverTotalEl,
  coachEl,
  comboEl,
  comboMultEl,
  comboPotEl,
  comboTimerEl,
  ctaEl,
  cv,
  distEl,
  feats,
  gasEl,
  geometry,
  hintEl,
  hudEl,
  livesEl,
  playerMode,
  resultEl,
  state,
  scoreEl,
  turboBarEl,
  zoneEl,
} from './state.js';
import {
  COMBO_WINDOW_S,
  RUN_LIVES,
  TURBO_PUMP,
  ZONE_BANNER_S,
} from './constants.js';
import { clamp } from './utils.js';
import { on } from './events.js';
import { boardX } from './layout.js';
import { readClover, writeClover } from './storage.js';
import { FEATURE_TYPES } from './track/index.js';
import { jump, trick } from './player.js';
import { endRun, startRun } from './run.js';

// ---------------------------------------------------------------- score
/** Визуальный «бамп» счётчика очков при начислении. */
function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 200);
}
// Тон сцены по зонам (фаза 2): день → закат → сумерки → ночь, циклом
// с пятой. CSS-фильтр на #scene — sprites.js не трогаем. Переход —
// transition в стилях canvas.
const ZONE_TINTS = [
  'none', // день
  'sepia(0.32) saturate(1.35) hue-rotate(-12deg) brightness(0.96)', // закат
  'hue-rotate(-24deg) saturate(0.85) brightness(0.8)', // сумерки
  'hue-rotate(-38deg) saturate(0.55) brightness(0.58) contrast(1.05)', // ночь
];
let zoneUntil = 0; // state.t, до которого висит баннер «ЗОНА N»
// кошелёк клевера (фаза 3): всего собрано за все заезды, живёт в
// localStorage 'cow-skate-clover' — серверная синхронизация будет в фазе 5
let cloverWallet = readClover();
/** @type {{score: number, best: number, dist: number, clover: number, auto: boolean | null, cta: boolean | null, res: boolean | null, boost: boolean | null, lives: number, cOn: boolean | null, cMult: number, cPot: number, zone: number}} */
const shown = {
  score: -1,
  best: -1,
  dist: -1,
  clover: -1,
  auto: null,
  cta: null,
  res: null,
  boost: null,
  lives: -1,
  cOn: null,
  cMult: 1,
  cPot: 0,
  zone: 0,
};
/** Обновляет HUD по текущему стейту (вызывается каждый кадр из render). */
export function hud() {
  if (state.score !== shown.score) {
    scoreEl.textContent = state.score.toLocaleString('ru-RU');
    shown.score = state.score;
  }
  if (state.best !== shown.best) {
    bestEl.textContent = state.best.toLocaleString('ru-RU');
    shown.best = state.best;
  }
  // дистанция текущего заезда — мелко под счётом, перерисовка по метру
  const dist = state.run ? Math.floor(state.run.distM) : -1;
  if (dist !== shown.dist) {
    distEl.hidden = dist < 0;
    distEl.textContent = dist < 0 ? '' : `${dist.toLocaleString('ru-RU')} м`;
    shown.dist = dist;
  }
  // кошелёк клевера — общий накопленный баланс, показываем всегда
  if (cloverWallet !== shown.clover) {
    cloverTotalEl.textContent = cloverWallet.toLocaleString('ru-RU');
    shown.clover = cloverWallet;
  }
  // колокольчики жизней — только в заезде, гаснут по одной при крэше
  const lives = state.run ? state.run.lives : -1;
  if (lives !== shown.lives) {
    livesEl.hidden = lives < 0;
    for (let i = 0; i < RUN_LIVES; i++)
      livesEl.children[i].classList.toggle('off', i >= lives);
    shown.lives = lives;
  }
  // бейдж комбо-цепи: виден, пока цепь жива; цвет растёт с множителем
  const c = state.combo,
    cOn = c.n > 0;
  if (cOn !== shown.cOn) {
    comboEl.hidden = !cOn;
    shown.cOn = cOn;
  }
  if (c.mult !== shown.cMult) {
    comboMultEl.textContent = `×${c.mult}`;
    // пульс бейджа при росте множителя (сброс цепи не анимируем)
    if (c.mult > shown.cMult) {
      comboEl.classList.remove('bump');
      void comboEl.offsetWidth;
      comboEl.classList.add('bump');
    }
    comboEl.classList.toggle('hot', c.mult >= 4 && c.mult < 6);
    comboEl.classList.toggle('max', c.mult >= 6);
    shown.cMult = c.mult;
  }
  if (c.pot !== shown.cPot) {
    comboPotEl.textContent = `+${c.pot.toLocaleString('ru-RU')}`;
    shown.cPot = c.pot;
  }
  if (cOn)
    comboTimerEl.style.transform = `scaleX(${clamp(c.timer / COMBO_WINDOW_S, 0, 1)})`;
  // тон сцены следует за номером зоны — включая отладочный ?zone=N и
  // молчаливый сброс на новый заезд (они идут мимо события 'zone')
  if (state.zone !== shown.zone) {
    cv.style.filter = ZONE_TINTS[(state.zone - 1) % ZONE_TINTS.length];
    shown.zone = state.zone;
  }
  if (zoneUntil && state.t > zoneUntil) {
    zoneEl.classList.add('dim');
    zoneUntil = 0;
  }
  const auto = !playerMode();
  if (auto !== shown.auto) {
    autoEl.hidden = !auto;
    hudEl.classList.toggle('dim', auto);
    shown.auto = auto;
  }
  const cta = auto && !state.isTouched0; // призыв виден только в демо до первого касания
  if (cta !== shown.cta) {
    ctaEl.classList.toggle('dim', !cta);
    shown.cta = cta;
  }
  const res = state.t < state.resultUntil;
  if (res !== shown.res) {
    resultEl.classList.toggle('dim', !res);
    shown.res = res;
  }
  // временный блок «ГАЗ»+шкала: на подходе к boost-конструкции и внутри неё
  let boost = false;
  const rf = state.ride?.feat;
  if (rf && FEATURE_TYPES[rf.type].needsBoost) boost = true;
  else if (state.mode !== 'crash') {
    const V = Math.max(1, state.speed * geometry.cowH),
      Xb = boardX();
    for (const f of feats) {
      const spec = FEATURE_TYPES[f.type];
      // marker() != null уже значит «конструкция ждёт действия» (не isTried)
      if (!spec.needsBoost || !spec.marker?.(f)) continue;
      const t = (f.x0 - Xb) / V;
      // запас по хвосту: x0 — край конструкции, вход петли глубже
      if (t > -0.6 && t < 4) {
        boost = true;
        break;
      }
    }
  }
  if (state.mode === 'crash') boost = false;
  if (boost !== shown.boost) {
    boostEl.classList.toggle('dim', !boost);
    if (!boost) state.turbo = 0; // блок скрылся — запас «исчезает»
    shown.boost = boost;
  }
  turboBarEl.style.height = `${Math.round(state.turbo * 100)}%`;
}

// карточка результата поверх крэша — замыкает петлю «заехал → упал → увидел счёт».
// Место в топе приходит позже (cowskate:rank) — дописывается в [data-rank].
let cardRun = 0; // заезд, чья карточка на экране — отсекает чужой rank
/**
 * @param {number} n
 * @returns {string} «N трюк/трюка/трюков»
 */
function tricksWord(n) {
  const t10 = n % 10,
    t100 = n % 100;
  const w =
    t10 === 1 && t100 !== 11
      ? 'трюк'
      : t10 >= 2 && t10 <= 4 && (t100 < 10 || t100 >= 20)
        ? 'трюка'
        : 'трюков';
  return `${n} ${w}`;
}
/** @param {import('./types').RunEndDetail} d итоги заезда */
function showResult(d) {
  cardRun = d.n;
  const stat = [`${Math.floor(d.distM).toLocaleString('ru-RU')} м`];
  if (d.stats.maxMult > 1) stat.push(`×${d.stats.maxMult}`);
  if (d.stats.tricks) stat.push(tricksWord(d.stats.tricks));
  const crown = d.isNewBest ? '<span class="newBest">Новый рекорд!</span>' : '';
  resultEl.innerHTML = `<b>Заезд: ${d.score.toLocaleString('ru-RU')}</b>${crown}<span>${stat.join(' · ')}</span><span data-rank></span>`;
  resultEl.classList.remove('dim');
  state.resultUntil = state.t + 3.5;
}

// ---------------------------------------------------------------- coach (первый заезд)
/**
 * @param {string | null} text текст подсказки (null — скрыть)
 * @param {number} [durationS] секунды показа (по умолчанию — до замены)
 */
function setCoach(text, durationS) {
  if (!text) {
    coachEl.classList.add('dim');
    state.coachText = null;
    state.coachUntil = 0;
    return;
  }
  if (state.coachText !== text) {
    state.coachText = text;
    coachEl.textContent = text;
  }
  coachEl.classList.remove('dim');
  state.coachUntil = durationS ? state.t + durationS : Infinity;
}
// Тикер-тренер сокращён до гашения по таймеру: пошаговое обучение
// первого заезда — на пауза-гейтах (tutorial.js), здесь остаются только
// короткие советы по событию (сейчас — после пустого крэша).
export function coachStep() {
  if (state.coachText && (state.t > state.coachUntil || !playerMode()))
    setCoach(null);
}

// ---------------------------------------------------------------- подписки
// DOM-реакции на события модели (композиция — в main.js).
export function initUi() {
  on('score', () => bumpScore());
  // баннер рубежа зоны — «ЗОНА N» по центру на ZONE_BANNER_S секунд
  on('zone', (d) => {
    zoneEl.textContent = `ЗОНА ${d.zone}`;
    zoneEl.classList.add('dim'); // перезапуск анимации
    void zoneEl.offsetWidth;
    zoneEl.classList.remove('dim');
    zoneUntil = state.t + ZONE_BANNER_S;
  });
  on('run-end', (d) => {
    if (d.reason === 'crash') showResult(d);
  });
  // место в общем топе приходит асинхронно из /api/score (telegram-bridge)
  document.addEventListener('cowskate:rank', (e) => {
    const { n, rank, prevRank } = e.detail;
    if (n !== cardRun) return; // ответ за прошлый заезд — карточка уже другая
    const rankEl = resultEl.querySelector('[data-rank]');
    if (rankEl)
      rankEl.textContent =
        prevRank && prevRank !== rank
          ? `#${rank} в общем топе (было #${prevRank})`
          : `#${rank} в общем топе`;
  });
  on('crash', (d) => {
    if (!playerMode()) return;
    setCoach(d.score < 60 ? 'СМОТРИ НА «!» И ПРЫГАЙ ЗАРАНЕЕ' : null, 3.2);
  });
  // кошелёк клевера: собранный лист — сразу в накопленный баланс
  on('coin', () => {
    cloverWallet += 1;
    writeClover(cloverWallet);
  });
}

// ---------------------------------------------------------------- input
let holdTimer = 0,
  holding = false,
  holdPid = -1, // pointerId касания на canvas — чужие пальцы не снимают холд
  gasPid = -1;
function touched() {
  // перехват автопилота мог случиться между тиками stepRun — закрываем
  // заезд здесь, чтобы ввод честно начинал новый
  if (state.run && !playerMode()) endRun('idle');
  if (!state.run) startRun(); // первый ввод из демо или рестарт после крэша
  state.isTouched0 = true;
  state.lastInput = state.t;
  state.autoSeq = [];
  state.autoDouble = 0;
  state.autoAfter = null;
  state.gasHeld = false; // если автопилот держал «ГАЗ» — перехват снимает
  hintEl.classList.add('dim');
}
/** Тап по «ГАЗ»: мгновенная подкачка; удержание качает в stepSpeed. */
function pumpTurbo() {
  touched();
  state.turbo = Math.min(1, state.turbo + TURBO_PUMP);
}
gasEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  gasPid = e.pointerId;
  gasEl.setPointerCapture(e.pointerId); // pointerup придёт на кнопку
  pumpTurbo();
  state.gasHeld = true; // после pumpTurbo: touched() сбрасывает флаг
  gasEl.classList.add('on');
});
/** @param {PointerEvent} e отпуск/отмена пальца на кнопке «ГАЗ» */
const gasOff = (e) => {
  if (e.pointerId !== gasPid) return;
  gasPid = -1;
  state.gasHeld = false;
  gasEl.classList.remove('on');
};
gasEl.addEventListener('pointerup', gasOff);
gasEl.addEventListener('pointercancel', gasOff);
/** @param {import('./types').Action} a действие кнопки/клавиши */
function act(a) {
  // пауза туториала: сцену не трогаем — резюм только кнопкой карточки,
  // чтобы текст успели прочитать, а не промахнуть тапом
  if (state.isPaused) return;
  touched();
  if (a === 'jump') jump();
  else trick(a);
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.isPaused) return;
  holdPid = e.pointerId;
  act('jump');
  clearTimeout(holdTimer);
  holding = false;
  holdTimer = setTimeout(() => {
    holding = true;
    state.throttle = 1;
  }, 280);
});
/** @param {PointerEvent} [e] отпуск пальца; чужой pointerId игнорируем */
const release = (e) => {
  if (e && holdPid >= 0 && e.pointerId !== holdPid) return;
  holdPid = -1;
  clearTimeout(holdTimer);
  if (holding) {
    holding = false;
    state.throttle = 0;
  }
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('blur', () => {
  release();
  state.throttle = 0;
});
const padBtns = /** @type {NodeListOf<HTMLElement>} */ (
  document.querySelectorAll('.pad [data-act]')
);
for (const b of padBtns) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    act(/** @type {import('./types').Action} */ (b.dataset.act));
    b.classList.add('on');
    setTimeout(() => b.classList.remove('on'), 160);
  });
  b.addEventListener('click', (e) => {
    if (e.detail === 0)
      act(/** @type {import('./types').Action} */ (b.dataset.act));
  }); // Enter/пробел на кнопке
}
addEventListener('keydown', (e) => {
  const k = e.code;
  const t = /** @type {HTMLElement | null} */ (e.target);
  if (t && t.closest && t.closest('button') && (k === 'Space' || k === 'Enter'))
    return;
  if (state.isPaused) return;
  const keyAct =
    /** @type {Record<string, import('./types').Action | undefined>} */ ({
      Space: 'jump',
      ArrowUp: 'jump',
      KeyW: 'jump',
      KeyQ: 'spin',
      Digit1: 'spin',
      KeyE: 'flip',
      Digit2: 'flip',
      KeyR: 'kick',
      Digit3: 'kick',
    })[k];
  if (keyAct) {
    e.preventDefault();
    if (!e.repeat) act(keyAct);
  } else if (k === 'ArrowRight' || k === 'KeyD') {
    e.preventDefault();
    state.throttle = 1;
    if (!e.repeat) pumpTurbo();
    else touched();
    state.gasHeld = true; // зажатый газ качает турбо в stepSpeed
  } else if (k === 'ArrowLeft' || k === 'KeyA') {
    e.preventDefault();
    state.throttle = -1;
    touched();
  }
});
addEventListener('keyup', (e) => {
  const k = e.code;
  if (k === 'ArrowRight' || k === 'KeyD') {
    state.gasHeld = false;
    if (state.throttle > 0) state.throttle = 0;
  }
  if ((k === 'ArrowLeft' || k === 'KeyA') && state.throttle < 0)
    state.throttle = 0;
});
