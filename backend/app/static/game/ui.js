import {
  autoEl,
  bestEl,
  coachEl,
  ctaEl,
  cv,
  feats,
  geometry,
  hintEl,
  hudEl,
  playerMode,
  resultEl,
  state,
  scoreEl,
} from './state.js';
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
/** @type {{score: number, best: number, auto: boolean | null, cta: boolean | null, res: boolean | null}} */
const shown = { score: -1, best: -1, auto: null, cta: null, res: null };
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
// подсказки по ситуации: прыжок у первого препятствия → двойной → трюки кнопками
export function coachStep() {
  if (
    state.coachText &&
    state.coachUntil !== Infinity &&
    state.t > state.coachUntil
  )
    setCoach(null);
  if (!playerMode()) {
    if (state.coachText) setCoach(null);
    return;
  } // в демо подсказок нет
  if (state.mode === 'crash' || state.coachStage > 2) return;
  if (state.coachStage === 0) {
    if (state.mode === 'air') {
      state.coachStage = 1;
      setCoach('ЕЩЁ ТАП В ВОЗДУХЕ — ДВОЙНОЙ', 1.7);
    } else {
      const Xb = boardX(),
        V = Math.max(1, state.speed * geometry.cowH);
      // ближайшая прыгаемая конструкция — по подсказке её спеки
      let jumpAt = Infinity;
      for (const f of feats) {
        const hnt = FEATURE_TYPES[f.type].autopilot?.(f);
        if (
          hnt &&
          (hnt.action === 'jump' || hnt.action === 'double') &&
          hnt.at > Xb
        ) {
          jumpAt = hnt.at;
          break;
        }
      }
      if ((jumpAt - Xb) / V < 1.5) setCoach('ПРЫГАЙ!', Infinity);
      else if (state.coachText === 'ПРЫГАЙ!') setCoach(null);
    }
  } else if (state.coachStage === 1) {
    if (state.mode !== 'air' || state.jumps >= 2) {
      state.coachStage = 2;
      setCoach('КНОПКИ ВНИЗУ — ТРЮКИ ЗА ОЧКИ', 3);
    }
  } else if (state.t > state.coachUntil) state.coachStage = 3;
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
  holding = false;
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
  hintEl.classList.add('dim');
}
/** @param {import('./types').Action} a действие кнопки/клавиши */
function act(a) {
  touched();
  if (a === 'jump') jump();
  else trick(a);
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  act('jump');
  clearTimeout(holdTimer);
  holding = false;
  holdTimer = setTimeout(() => {
    holding = true;
    state.throttle = 1;
  }, 280);
});
const release = () => {
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
    touched();
  } else if (k === 'ArrowLeft' || k === 'KeyA') {
    e.preventDefault();
    state.throttle = -1;
    touched();
  }
});
addEventListener('keyup', (e) => {
  const k = e.code;
  if ((k === 'ArrowRight' || k === 'KeyD') && state.throttle > 0)
    state.throttle = 0;
  if ((k === 'ArrowLeft' || k === 'KeyA') && state.throttle < 0)
    state.throttle = 0;
});
