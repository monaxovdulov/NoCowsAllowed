import { TRICKS } from './constants.js';
import { emit, on } from './events.js';
import { playerMode, S } from './state.js';

// ---------------------------------------------------------------- score
// Модель счёта и рекорда (карта, этап 3): DOM — в ui.js, всплывашки —
// в effects.js; оба слоя реагируют на событие 'score'.

/**
 * @param {number} pts очки (уже с учётом множителя комбо)
 * @param {number} [mult] множитель комбо — для показа «×N»
 */
export function addScore(pts, mult = 1) {
  S.score += pts;
  emit('score', { points: pts, mult, total: S.score });
  if (S.score > S.best) endRun();
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
function award() {
  const list = S.airTricks,
    tricks = list.filter((k) => k !== 'double');
  let pts = S.airBonus;
  for (const k of list) pts += k === 'double' ? 30 : TRICKS[k].pts;
  S.airTricks = [];
  S.airBonus = 0;
  if (!pts || !playerMode()) return;
  const mult = Math.max(1, tricks.length);
  addScore(pts * mult, mult);
}

/** Подписывает счёт на события модели (композиция — в main.js). */
export function initScore() {
  on('land', award);
  on('crash', () => {
    if (!playerMode()) return;
    endRun();
    S.score = 0;
  });
}
