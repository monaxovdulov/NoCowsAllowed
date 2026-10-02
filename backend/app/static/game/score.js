import { TRICKS } from './constants.js';
import { emit, on } from './events.js';
import { state } from './state.js';

// ---------------------------------------------------------------- score
// Модель счёта (карта, этап 3): DOM — в ui.js, всплывашки — в effects.js;
// оба слоя реагируют на событие 'score'. Рекорд и завершение заезда — в
// run.js (фаза 0): счёт пишется только внутри заезда.

/**
 * @param {number} pts очки (уже с учётом множителя комбо)
 * @param {number} [mult] множитель комбо — для показа «×N»
 * @param {number} [tricks] приземлённые трюки в этом начислении — статистика заезда
 */
export function addScore(pts, mult = 1, tricks = 0) {
  if (!state.run) return; // демо и промежуток между заездами не считают
  state.score += pts;
  emit('score', { points: pts, mult, total: state.score, tricks });
}

/** Начисляет очки за трюки воздуха при приземлении. */
function award() {
  const list = state.airTricks,
    tricks = list.filter((k) => k !== 'double');
  let pts = state.airBonus;
  for (const k of list) pts += k === 'double' ? 30 : TRICKS[k].pts;
  state.airTricks = [];
  state.airBonus = 0;
  if (!pts) return;
  const mult = Math.max(1, tricks.length);
  addScore(pts * mult, mult, tricks.length);
}

/** Подписывает счёт на события модели (композиция — в main.js). */
export function initScore() {
  on('land', award);
  on('obstacle-clear', () => addScore(50));
}
