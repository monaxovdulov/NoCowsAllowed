import { TRICKS } from './constants.js';
import {
  autoEl,
  bestEl,
  coachEl,
  ctaEl,
  cv,
  feats,
  G,
  hintEl,
  hudEl,
  playerMode,
  resultEl,
  S,
  scoreEl,
} from './state.js';
import { boardX } from './layout.js';
import { jump, trick } from './player.js';
import { popup } from './effects.js';

// ---------------------------------------------------------------- score
/** Визуальный «бамп» счётчика очков при начислении. */
export function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 200);
}
/** Обновляет рекорд и шлёт событие конца заезда (счёт уходит в Telegram). */
export function endRun() {
  if (S.score > S.best) {
    S.best = S.score;
    try {
      localStorage.setItem('cow-skate-best', String(S.best));
    } catch (e) {
      /* ок */
    }
    document.dispatchEvent(
      new CustomEvent('cowskate:run-end', {
        detail: { score: S.score, best: S.best },
      }),
    );
  }
}
/** Начисляет очки за трюки воздуха при приземлении. */
export function award() {
  const list = S.airTricks,
    tricks = list.filter((k) => k !== 'double');
  let pts = S.airBonus;
  for (const k of list) pts += k === 'double' ? 30 : TRICKS[k].pts;
  S.airTricks = [];
  S.airBonus = 0;
  if (!pts || !playerMode()) return;
  const mult = Math.max(1, tricks.length);
  pts *= mult;
  S.score += pts;
  bumpScore();
  if (S.score > S.best) endRun();
  popup(mult > 1 ? `+${pts}  ×${mult}` : `+${pts}`, 'pts');
}
const shown = { score: -1, best: -1, auto: null, cta: null, res: null };
/** Обновляет HUD по текущему стейту (вызывается каждый кадр из render). */
export function hud() {
  if (S.score !== shown.score) {
    scoreEl.textContent = S.score.toLocaleString('ru-RU');
    shown.score = S.score;
  }
  if (S.best !== shown.best) {
    bestEl.textContent = S.best.toLocaleString('ru-RU');
    shown.best = S.best;
  }
  const auto = !playerMode();
  if (auto !== shown.auto) {
    autoEl.hidden = !auto;
    hudEl.classList.toggle('dim', auto);
    shown.auto = auto;
  }
  const cta = auto && !S.touched0; // призыв виден только в демо до первого касания
  if (cta !== shown.cta) {
    ctaEl.classList.toggle('dim', !cta);
    shown.cta = cta;
  }
  const res = S.t < S.resultUntil;
  if (res !== shown.res) {
    resultEl.classList.toggle('dim', !res);
    shown.res = res;
  }
}

// карточка результата поверх крэша — замыкает петлю «заехал → упал → увидел счёт»
/** @param {number} sc очки заезда */
export function showResult(sc) {
  resultEl.innerHTML = `<b>Заезд: ${sc.toLocaleString('ru-RU')}</b><span>рекорд ${S.best.toLocaleString('ru-RU')}</span>`;
  resultEl.classList.remove('dim');
  S.resultUntil = S.t + 2.6;
}

// ---------------------------------------------------------------- coach (первый заезд)
/**
 * @param {string | null} text текст подсказки (null — скрыть)
 * @param {number} [dur] секунды показа (по умолчанию — до замены)
 */
export function setCoach(text, dur) {
  if (!text) {
    coachEl.classList.add('dim');
    S.coachText = null;
    S.coachUntil = 0;
    return;
  }
  if (S.coachText !== text) {
    S.coachText = text;
    coachEl.textContent = text;
  }
  coachEl.classList.remove('dim');
  S.coachUntil = dur ? S.t + dur : Infinity;
}
// подсказки по ситуации: прыжок у первого препятствия → двойной → трюки кнопками
export function coachStep() {
  if (S.coachText && S.coachUntil !== Infinity && S.t > S.coachUntil)
    setCoach(null);
  if (!playerMode()) {
    if (S.coachText) setCoach(null);
    return;
  } // в демо подсказок нет
  if (S.crash || S.coachStage > 2) return;
  if (S.coachStage === 0) {
    if (S.air) {
      S.coachStage = 1;
      setCoach('ЕЩЁ ТАП В ВОЗДУХЕ — ДВОЙНОЙ', 1.7);
    } else {
      const Xb = boardX(),
        V = Math.max(1, S.speed * G.cowH);
      const nx = /** @type {import('./types').Obstacle | undefined} */ (
        feats.find((f) => f.type === 'ob' && !f.fly && f.X > Xb)
      );
      if (nx && (nx.X - Xb) / V < 1.5) setCoach('ПРЫГАЙ!', Infinity);
      else if (S.coachText === 'ПРЫГАЙ!') setCoach(null);
    }
  } else if (S.coachStage === 1) {
    if (!S.air || S.jumps >= 2) {
      S.coachStage = 2;
      setCoach('КНОПКИ ВНИЗУ — ТРЮКИ ЗА ОЧКИ', 3);
    }
  } else if (S.t > S.coachUntil) S.coachStage = 3;
}

// ---------------------------------------------------------------- input
let holdTimer = 0,
  holding = false;
function touched() {
  if (!playerMode()) {
    S.score = 0;
    S.playT0 = S.t;
  } // новый заезд — с мягкого разгона
  S.touched0 = true;
  S.lastInput = S.t;
  S.autoSeq = [];
  S.autoDouble = 0;
  S.autoAfter = null;
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
    S.throttle = 1;
  }, 280);
});
const release = () => {
  clearTimeout(holdTimer);
  if (holding) {
    holding = false;
    S.throttle = 0;
  }
};
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('blur', () => {
  release();
  S.throttle = 0;
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
    S.throttle = 1;
    touched();
  } else if (k === 'ArrowLeft' || k === 'KeyA') {
    e.preventDefault();
    S.throttle = -1;
    touched();
  }
});
addEventListener('keyup', (e) => {
  const k = e.code;
  if ((k === 'ArrowRight' || k === 'KeyD') && S.throttle > 0) S.throttle = 0;
  if ((k === 'ArrowLeft' || k === 'KeyA') && S.throttle < 0) S.throttle = 0;
});
