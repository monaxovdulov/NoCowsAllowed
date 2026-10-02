// ---------------------------------------------------------------- combo
// Комбо-цепь (продукт-план, фаза 1, PD3/PD4), владелец state.combo:
// каждое действие кладёт базу в горшок по текущему множителю и растит
// счётчик цепи n (mult = 1 + floor(n/3), потолок COMBO_MULT_MAX). Окно
// COMBO_WINDOW_S тикает только на ровном асфальте — в воздухе и на
// конструкциях цепь стоит, длинный полёт её не рвёт. Истёк → горшок
// сдаётся в счёт через addScore (вне заезда молчит), крэш — сжигает.
//
// Повтор одного трюка в цепи дешевеет (REPEAT_DECAY), разнообразие в
// вылете и «идеальное» приземление дороже — спам одного действия
// проигрывает миксу и точному таймингу.
import {
  COMBO_MULT_MAX,
  COMBO_WINDOW_S,
  PERFECT_BONUS,
  REPEAT_DECAY,
  TRICKS,
  VARIETY_BONUS,
} from './constants.js';
import { emit, on } from './events.js';
import { addScore } from './score.js';
import { onFlat, state } from './state.js';

// Откуда взлетели в текущем вылете: 'double' не перезаписывает — это
// продолжение того же прыжка. Нужен для действия «вылет с рампы».
/** @type {'jump' | 'launch'} */
let airFrom = 'jump';

/** Гасим цепь: горшок обработан (сдан или сгорел), повторы забываем. */
function drop() {
  const c = state.combo;
  c.pot = 0;
  c.n = 0;
  c.mult = 1;
  c.timer = 0;
  c.used = {};
}

/**
 * Одно действие цепи: база идёт в горшок по множителю на момент действия,
 * затем n поднимает множитель следующих.
 * @param {number} base базовые очки действия
 * @param {number} [nDelta] прирост счётчика цепи (двойной прыжок — 0)
 */
function feed(base, nDelta = 1) {
  const c = state.combo;
  c.pot += Math.round(base * c.mult);
  c.n += nDelta;
  c.mult = Math.min(COMBO_MULT_MAX, 1 + Math.floor(c.n / 3));
  c.timer = COMBO_WINDOW_S;
  emit('combo', { mult: c.mult, pot: c.pot, n: c.n });
}

/** Сдача горшка в счёт — только по таймауту цепи. */
function bank() {
  const c = state.combo;
  if (c.pot > 0) {
    addScore(c.pot, c.mult);
    emit('combo-bank', { points: c.pot, mult: c.mult });
  }
  drop();
}

/**
 * Кадр цепи (вызов — main.js:update): окно тикает только на ровном
 * ходу — в воздухе, на рампе и в ride цепь дождётся действия.
 * @param {number} dt шаг кадра, секунды
 */
export function stepCombo(dt) {
  const c = state.combo;
  if (c.n <= 0) return;
  if (onFlat()) c.timer -= dt;
  if (c.timer <= 0) bank();
}

/** Подписки цепи на события модели (композиция — в main.js). */
export function initCombo() {
  on('run-start', drop); // новый заезд — чистая цепь
  on('airborne', (d) => {
    // двойной прыжок — продолжение вылета, источник не меняем
    if (d.from !== 'double') airFrom = d.from;
  });
  on('ride-enter', () => {
    airFrom = 'jump'; // съехали с воздуха на дугу — «вылет» уже не наш
  });
  // препятствие взято: +25 к базе за пролёт впритык
  on('obstacle-clear', (d) => feed(d.close ? 75 : 50));
  // двойной прыжок кормит горшок, но цепь не растит
  on('trick', (d) => {
    if (d.kind === 'double') feed(30, 0);
  });
  // петля пройдена — жирное действие цепи
  on('ride-exit', (d) => {
    if (d.result === 'exit' && d.ok) feed(150, 2);
  });
  // приземление — главное действие цепи: трюки вылета с распадом
  // повторов + бонусы вылета (рампа, петля) + разнообразие + идеальность
  on('land', (d) => {
    const tricks = /** @type {import('./types').TrickKind[]} */ (
      state.airTricks.filter((k) => k !== 'double')
    );
    if (!tricks.length && !state.airBonus) return; // пустой хоп — мимо цепи
    const used = state.combo.used;
    let base = state.airBonus;
    for (const k of tricks) {
      base += TRICKS[k].pts * REPEAT_DECAY ** (used[k] || 0);
      used[k] = (used[k] || 0) + 1;
    }
    if (new Set(tricks).size >= 2) base *= VARIETY_BONUS;
    if (d.perfect) base *= PERFECT_BONUS;
    // дожатый трюк засчитывает очки, но цепь не растит
    feed(
      base,
      tricks.length - (d.dirty ? 1 : 0) + (airFrom === 'launch' ? 1 : 0),
    );
  });
  // рубеж зоны (фаза 2): +1 к живой цепи — награда за дистанцию;
  // мёртвую цепь рубеж не воскрешает (n=0 → бейдж «×1 +0» был бы мусором)
  on('zone', () => {
    if (state.combo.n > 0) feed(0, 1);
  });
  // крэш сжигает несданный горшок — жизни считает run.js
  on('crash', () => {
    if (state.combo.pot > 0) emit('combo-lost', { points: state.combo.pot });
    drop();
  });
}
