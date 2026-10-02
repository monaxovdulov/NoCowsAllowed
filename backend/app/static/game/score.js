import { emit } from './events.js';
import { state } from './state.js';

// ---------------------------------------------------------------- score
// Модель счёта (карта, этап 3): DOM — в ui.js, всплывашки — в effects.js;
// оба слоя реагируют на событие 'score'. Начисление за действия с фазы 1
// идёт через комбо-цепь (combo.js) — сюда попадает только сданный горшок.
// Рекорд и завершение заезда — в run.js (фаза 0): счёт пишется только
// внутри заезда.

/**
 * @param {number} pts очки (уже с учётом множителя цепи)
 * @param {number} [mult] множитель цепи на момент сдачи — для показа «×N»
 */
export function addScore(pts, mult = 1) {
  if (!state.run) return; // демо и промежуток между заездами не считают
  state.score += pts;
  emit('score', { points: pts, mult, total: state.score });
}
