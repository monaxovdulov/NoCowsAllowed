import { TRICKS } from './constants.js';
import { emit, on } from './events.js';
import { playerMode, state } from './state.js';
import { writeBest } from './storage.js';

// ---------------------------------------------------------------- score
// Модель счёта и рекорда (карта, этап 3): DOM — в ui.js, всплывашки —
// в effects.js; оба слоя реагируют на событие 'score'.

/**
 * @param {number} pts очки (уже с учётом множителя комбо)
 * @param {number} [mult] множитель комбо — для показа «×N»
 */
export function addScore(pts, mult = 1) {
  state.score += pts;
  emit('score', { points: pts, mult, total: state.score });
  if (state.score > state.best) endRun();
}

/** Обновляет рекорд и шлёт событие конца заезда (счёт уходит в Telegram). */
export function endRun() {
  if (state.score > state.best) {
    state.best = state.score;
    writeBest(state.best);
    document.dispatchEvent(
      new CustomEvent('cowskate:run-end', {
        detail: { score: state.score, best: state.best },
      }),
    );
  }
}

/** Начисляет очки за трюки воздуха при приземлении. */
function award() {
  const list = state.airTricks,
    tricks = list.filter((k) => k !== 'double');
  let pts = state.airBonus;
  for (const k of list) pts += k === 'double' ? 30 : TRICKS[k].pts;
  state.airTricks = [];
  state.airBonus = 0;
  if (!pts || !playerMode()) return;
  const mult = Math.max(1, tricks.length);
  addScore(pts * mult, mult);
}

/** Подписывает счёт на события модели (композиция — в main.js). */
export function initScore() {
  on('land', award);
  on('obstacle-clear', () => {
    if (playerMode()) addScore(50);
  });
  on('crash', () => {
    if (!playerMode()) return;
    endRun();
    state.score = 0;
  });
}
