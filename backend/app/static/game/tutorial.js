// Туториал-гейты (gameplay-ux-plan §A): вместо бегущих подсказок игра
// встаёт на паузу — поверх замершей сцены карточка с объяснением и
// кнопками «Понял» (продолжить) и «Пропустить всё». Показанные гейты
// пишутся в localStorage и не всплывают снова — ни в этом заезде, ни в
// следующих сессиях.
//
// Пауза — state.isPaused: frame() в main.js пропускает update/render
// (canvas держит последний кадр), ввод глушится в ui.js. Условие гейта,
// пойманное в воздухе или на конструкции, ждёт в очереди — карточка
// открывается только на земле, чтобы застывший кадр выглядел естественно
// и обсуждаемая конструкция была видна с маркером.
import { on } from './events.js';
import { boardX } from './layout.js';
import { coachEl, feats, geometry, playerMode, state } from './state.js';
import { readTutored, writeTutored } from './storage.js';
import { FEATURE_TYPES } from './track/index.js';

const GAP_S = 0.9; // передышка между карточками — не стробить две подряд

/** @type {HTMLElement | null} */
const tutorEl = /** @type {HTMLElement | null} */ (
  document.getElementById('tutor')
);
const tutorTitle = /** @type {HTMLElement | null} */ (
  document.getElementById('tutorTitle')
);
const tutorText = /** @type {HTMLElement | null} */ (
  document.getElementById('tutorText')
);
const tutorOk = /** @type {HTMLElement | null} */ (
  document.getElementById('tutorOk')
);
const tutorSkip = /** @type {HTMLElement | null} */ (
  document.getElementById('tutorSkip')
);

/**
 * @typedef {object} Gate
 * @property {string} id
 * @property {string} title
 * @property {string} text
 * @property {((Xb: number, V: number) => boolean) | null} when условие
 *   показа: мировой X доски и скорость px/с → true = поставить в очередь.
 *   null — гейт ставит внешнее событие (enqueue из подписки).
 */

/**
 * Впереди (ближе leadS секунд по ходу) конструкция, чья подсказка
 * автопилота требует одно из перечисленных действий.
 * @param {number} Xb мировой X доски
 * @param {number} V скорость, px/с
 * @param {string[]} actions допустимые action из AutopilotHint
 * @param {number} leadS порог, секунды до конструкции
 */
function featAhead(Xb, V, actions, leadS) {
  for (const f of feats) {
    const hnt = FEATURE_TYPES[f.type].autopilot?.(f);
    if (
      hnt &&
      hnt.at > Xb &&
      (hnt.at - Xb) / V < leadS &&
      actions.includes(hnt.action)
    )
      return true;
  }
  return false;
}

/** @type {Gate[]} */
const GATES = [
  {
    id: 'start',
    title: 'Корова на скейте',
    text: 'Корова едет сама — твоя работа прыгать и делать трюки. Тап по экрану или кнопка «Прыжок» внизу.',
    when: () => true, // первый кадр, когда за рулём игрок
  },
  {
    id: 'ob',
    title: 'Препятствие!',
    text: 'Смотри на «!» над ним — тапни заранее, чтобы перепрыгнуть. За взятое +50.',
    when: (Xb, V) => featAhead(Xb, V, ['jump', 'double'], 1.7),
  },
  {
    id: 'double',
    title: 'Двойной прыжок',
    text: 'В воздухе можно тапнуть ещё раз — так берутся высокие и длинные препятствия «×2».',
    when: null, // встаёт в очередь по событию land — сразу после первого прыжка
  },
  {
    id: 'ramp',
    title: 'Трамплин!',
    text: 'В большом вылете жми кнопки трюков внизу — серия трюков за один прыжок умножает очки.',
    when: (Xb, V) => featAhead(Xb, V, ['none'], 2.6),
  },
  {
    id: 'loop',
    title: 'Мёртвая петля!',
    text: 'Обычной скорости не хватит — качай кнопку «ГАЗ» заранее и держи зажатой, чтобы разогнаться и проехать круг.',
    when: (Xb, V) => featAhead(Xb, V, ['hold'], 3.0),
  },
  {
    id: 'combo',
    title: 'Цепочка!',
    text: 'Делай действия без пауз — множитель растёт. Пауза сдаёт накопленное в счёт, упадёшь — несданное сгорит.',
    when: null, // встаёт в очередь по событию combo при n >= 3
  },
  {
    id: 'lives',
    title: 'Минус жизнь',
    text: 'Их три на заезд — колокольчики под счётом. Несданное комбо сгорело, но счёт остался.',
    when: null, // встаёт в очередь по событию life-lost
  },
];
/** @type {Map<string, Gate>} */
const byId = new Map(GATES.map((g) => [g.id, g]));

/** @type {Set<string>} ids уже показанных гейтов */
const shown = new Set();
/** @type {Gate[]} сработавшие условия, ждут земли */
const queue = [];
/** @type {Gate | null} открытая сейчас карточка */
let active = null,
  cooldownUntil = 0;

/** @returns {boolean} все гейты показаны — обучение завершено */
const done = () => GATES.every((g) => shown.has(g.id));

const persist = () => writeTutored(shown);

/** @param {string} id поставить гейт в очередь, если новый и ещё не ждёт */
function enqueue(id) {
  const g = byId.get(id);
  if (g && !shown.has(id) && g !== active && !queue.includes(g)) queue.push(g);
}

/** @param {Gate} g открыть карточку и заморозить мир */
function openGate(g) {
  if (!tutorEl || !tutorTitle || !tutorText || !tutorOk) return;
  active = g;
  shown.add(g.id);
  persist();
  // тикер-тренер под карточкой не нужен
  coachEl.classList.add('dim');
  state.coachText = null;
  state.coachUntil = 0;
  tutorTitle.textContent = g.title;
  tutorText.textContent = g.text;
  tutorEl.classList.add('on');
  state.isPaused = true;
  tutorOk.focus(); // Space/Enter теперь кликают «Понял», а не прыгают
}

function closeGate() {
  active = null;
  if (tutorEl) tutorEl.classList.remove('on');
  state.isPaused = false;
  cooldownUntil = state.t + GAP_S;
  // фокус со скрытой кнопки убираем — иначе пробел «дожмёт» невидимую «Понял»
  if (
    document.activeElement === tutorOk ||
    document.activeElement === tutorSkip
  )
    /** @type {HTMLElement} */ (document.activeElement).blur();
}

function skipAll() {
  for (const g of GATES) shown.add(g.id);
  queue.length = 0;
  persist();
  closeGate();
}

/** Кадровый шаг очереди гейтов — зовётся из update() рядом с тренером. */
export function tutorialStep() {
  if (!tutorEl || done() || !playerMode() || state.isPaused) return;
  const Xb = boardX(),
    V = Math.max(1, state.speed * geometry.cowH);
  for (const g of GATES) {
    if (!g.when || shown.has(g.id) || g === active || queue.includes(g))
      continue;
    if (g.when(Xb, V)) queue.push(g);
  }
  if (!queue.length || state.mode !== 'ground' || state.t < cooldownUntil)
    return;
  openGate(/** @type {Gate} */ (queue.shift()));
}

/** Подписки и кнопки карточки (композиция — в main.js). */
export function initTutorial() {
  if (!tutorEl || !tutorOk || !tutorSkip) return;
  for (const id of readTutored()) shown.add(id);
  // ?tut=reset — переиграть обучение (ручная проверка)
  if (new URLSearchParams(location.search).get('tut') === 'reset') {
    shown.clear();
    persist();
  }
  tutorOk.addEventListener('click', closeGate);
  tutorSkip.addEventListener('click', skipAll);
  // Escape на открытом диалоге = «Понял»
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && active) closeGate();
  });
  // двойной прыжок учим в момент первого настоящего приземления
  on('land', (d) => {
    if (d.impact > 0.4 && playerMode()) enqueue('double');
  });
  // фаза 1: цепь впервые выросла до ×2 (три действия) — объясняем правила
  on('combo', (d) => {
    if (d.n >= 3 && playerMode()) enqueue('combo');
  });
  on('life-lost', () => {
    if (playerMode()) enqueue('lives');
  });
}
