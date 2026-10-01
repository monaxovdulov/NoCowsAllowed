import {
  autoEl,
  bestEl,
  coachEl,
  ctaEl,
  cv,
  hintEl,
  hudEl,
  playerMode,
  resultEl,
  state,
  scoreEl,
} from './state.js';
import { on } from './events.js';
import { jump, trick } from './player.js';

// ---------------------------------------------------------------- score
/** Визуальный «бамп» счётчика очков при начислении. */
function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 200);
}
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
  if (state.isPaused) return;
  const keyAct = {
    Space: 'jump',
    ArrowUp: 'jump',
    KeyW: 'jump',
    KeyQ: 'spin',
    Digit1: 'spin',
    KeyE: 'flip',
    Digit2: 'flip',
    KeyR: 'kick',
    Digit3: 'kick',
  }[k];
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
