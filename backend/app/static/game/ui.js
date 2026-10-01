import {
  autoEl,
  bestEl,
  boostEl,
  coachEl,
  ctaEl,
  cv,
  feats,
  gasEl,
  geometry,
  hintEl,
  hudEl,
  playerMode,
  resultEl,
  state,
  scoreEl,
  turboBarEl,
} from './state.js';
import { TURBO_PUMP } from './constants.js';
import { on } from './events.js';
import { boardX } from './layout.js';
import { FEATURE_TYPES } from './track/index.js';
import { jump, trick } from './player.js';

// ---------------------------------------------------------------- score
/** Визуальный «бамп» счётчика очков при начислении. */
function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 200);
}
/** @type {{score: number, best: number, auto: boolean | null, cta: boolean | null, res: boolean | null, boost: boolean | null}} */
const shown = {
  score: -1,
  best: -1,
  auto: null,
  cta: null,
  res: null,
  boost: null,
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

// карточка результата поверх крэша — замыкает петлю «заехал → упал → увидел счёт»
/** @param {number} sc очки заезда */
function showResult(sc) {
  resultEl.innerHTML = `<b>Заезд: ${sc.toLocaleString('ru-RU')}</b><span>рекорд ${state.best.toLocaleString('ru-RU')}</span>`;
  resultEl.classList.remove('dim');
  state.resultUntil = state.t + 2.6;
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
  on('crash', (d) => {
    if (!playerMode()) return;
    showResult(d.score);
    setCoach(d.score < 60 ? 'СМОТРИ НА «!» И ПРЫГАЙ ЗАРАНЕЕ' : null, 3.2);
  });
}

// ---------------------------------------------------------------- input
let holdTimer = 0,
  holding = false,
  holdPid = -1, // pointerId касания на canvas — чужие пальцы не снимают холд
  gasPid = -1;
function touched() {
  if (!playerMode()) {
    state.score = 0;
    state.playT0 = state.t;
  } // новый заезд — с мягкого разгона
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
