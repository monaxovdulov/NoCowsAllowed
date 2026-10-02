// ---------------------------------------------------------------- run
// Жизненный цикл заезда (продукт-план, фаза 0, PD1): заезд — сущность
// модели, владелец state.run. Старт — первый ввод из демо или после крэша
// (ui.js:touched → startRun); конец — крэш ('crash') или перехват
// автопилота ('idle'). Рекорд пишется и DOM-событие cowskate:run-end
// уходит ровно один раз — здесь; мост шлёт статистику на /api/score.
import { M_PER_COWH } from './constants.js';
import { emit, on } from './events.js';
import { playerMode, state } from './state.js';
import { writeBest } from './storage.js';

// Номер заезда в сессии: карточка результата и мост сверяют его, чтобы
// запоздалый ответ /api/score не попал в карточку следующего заезда.
let runN = 0;

/** Новый заезд: сброс счёта и мягкий разгон — на каждый заезд, не только первый. */
export function startRun() {
  runN += 1;
  state.run = {
    n: runN,
    t0: state.t,
    distM: 0,
    lives: 1, // фаза 1 (PD2) поднимет до RUN_LIVES
    stats: {
      tricks: 0,
      obstacles: 0,
      loops: 0,
      coins: 0,
      maxMult: 1,
      crashes: 0,
    },
  };
  state.score = 0;
  state.playT0 = state.t;
  emit('run-start', { n: runN });
}

/**
 * Закрывает заезд и публикует результат — ровно один раз на заезд.
 * @param {import('./types').RunEndReason} reason чем кончился
 * @param {import('./types').CrashReason | null} [crashReason] уточнение при crash
 */
export function endRun(reason, crashReason = null) {
  const run = state.run;
  if (!run) return;
  state.run = null;
  const score = state.score;
  const isNewBest = score > state.best;
  if (isNewBest) {
    state.best = score;
    writeBest(score);
  }
  /** @type {import('./types').RunEndDetail} */
  const detail = {
    n: run.n,
    score,
    best: state.best,
    isNewBest,
    distM: run.distM,
    durationS: state.t - run.t0,
    stats: run.stats,
    reason,
    crashReason,
  };
  emit('run-end', detail);
  document.dispatchEvent(new CustomEvent('cowskate:run-end', { detail }));
}

/**
 * Кадр заезда (вызов — main.js:update): метры и перехват автопилота.
 * @param {number} dt шаг кадра, секунды
 */
export function stepRun(dt) {
  const run = state.run;
  if (!run) return;
  if (state.mode !== 'crash') run.distM += state.speed * dt * M_PER_COWH;
  // 4.5 с без ввода → playerMode() ложь: заезд игрока кончился, дальше
  // едет демо — и счёт заезда не должен «висеть» незакрытым
  if (!playerMode()) endRun('idle');
}

/** Подписки статистики заезда на события модели (композиция — в main.js). */
export function initRun() {
  on('score', (d) => {
    const run = state.run;
    if (!run) return;
    run.stats.tricks += d.tricks;
    if (d.mult > run.stats.maxMult) run.stats.maxMult = d.mult;
  });
  on('obstacle-clear', () => {
    if (state.run) state.run.stats.obstacles += 1;
  });
  on('ride-exit', (d) => {
    if (state.run && d.result === 'exit' && d.ok) state.run.stats.loops += 1;
  });
  on('crash', (d) => {
    const run = state.run;
    if (!run) return;
    run.stats.crashes += 1;
    endRun('crash', d.reason);
  });
}
