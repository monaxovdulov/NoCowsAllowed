import { AUTO_DELAY_S, CRUISE } from './constants.js';
import { readBest } from './storage.js';
import { makeRing } from './utils.js';

// ---------------------------------------------------------------- DOM, canvas
/** @type {HTMLCanvasElement} */
export const cv = /** @type {HTMLCanvasElement} */ (
  document.getElementById('scene')
);
export const ctx = /** @type {CanvasRenderingContext2D} */ (
  cv.getContext('2d', { alpha: false, desynchronized: true })
);
/** @type {HTMLCanvasElement} */
export const bloomEl = /** @type {HTMLCanvasElement} */ (
  document.getElementById('bloom')
);
/** @type {HTMLElement} */
export const grainEl = /** @type {HTMLElement} */ (
  document.querySelector('.grain')
);
// Пост-эффекты DOM-слоями: смешивание делает композитор бесплатно.
// Старые WebView без mix-blend-mode — запасной путь внутри canvas.
export const cssPost =
  typeof CSS !== 'undefined' &&
  !!CSS.supports &&
  CSS.supports('mix-blend-mode', 'screen') &&
  CSS.supports('mix-blend-mode', 'overlay');
export const bloomG = cssPost && bloomEl ? bloomEl.getContext('2d') : null;
if (!cssPost) {
  if (bloomEl) bloomEl.style.display = 'none';
  if (grainEl) grainEl.style.display = 'none';
}
/** @type {HTMLElement} */
export const hintEl = /** @type {HTMLElement} */ (
  document.getElementById('hint')
);
/** @type {HTMLElement} */
export const hudEl = /** @type {HTMLElement} */ (
  document.getElementById('hud')
);
/** @type {HTMLElement} счёт: плашка-контейнер (bump при начислении) */
export const scoreEl = /** @type {HTMLElement} */ (
  document.getElementById('score')
);
/** @type {HTMLElement} сданный счёт — число внутри .score */
export const scoreNumEl = /** @type {HTMLElement} */ (
  document.getElementById('scoreNum')
);
/** @type {HTMLElement} несданный горшок цепи — «+N» рядом со счётом */
export const scorePotEl = /** @type {HTMLElement} */ (
  document.getElementById('scorePot')
);
/** @type {HTMLButtonElement} кнопка прыжка в пэде — подсветка «ещё раз» */
export const jumpEl = /** @type {HTMLButtonElement} */ (
  document.querySelector('.pad [data-act="jump"]')
);
/** @type {HTMLElement} */
export const bestEl = /** @type {HTMLElement} */ (
  document.getElementById('best')
);
/** @type {HTMLElement} */
export const distEl = /** @type {HTMLElement} */ (
  document.getElementById('dist')
);
/** @type {HTMLElement} кошелёк клевера в HUD — вся плашка (для bump) */
export const cloverEl = /** @type {HTMLElement} */ (
  document.getElementById('clover')
);
/** @type {HTMLElement} счётчик кошелька клевера в HUD (фаза 3) */
export const cloverTotalEl = /** @type {HTMLElement} */ (
  document.getElementById('cloverTotal')
);
/** @type {HTMLElement} */
export const autoEl = /** @type {HTMLElement} */ (
  document.getElementById('auto')
);
/** @type {HTMLElement} */
export const ctaEl = /** @type {HTMLElement} */ (
  document.getElementById('cta')
);
/** @type {HTMLElement} */
const ctaMain = /** @type {HTMLElement} */ (document.getElementById('ctaMain'));
/** @type {HTMLElement} */
export const coachEl = /** @type {HTMLElement} */ (
  document.getElementById('coach')
);
/** @type {HTMLElement} */
export const resultEl = /** @type {HTMLElement} */ (
  document.getElementById('result')
);
/** @type {HTMLElement} временная кнопка+шкала турбо у boost-конструкций */
export const boostEl = /** @type {HTMLElement} */ (
  document.getElementById('boost')
);
/** @type {HTMLButtonElement} */
export const gasEl = /** @type {HTMLButtonElement} */ (
  document.getElementById('gas')
);
/** @type {HTMLElement} заполнение шкалы турбо */
export const turboBarEl = /** @type {HTMLElement} */ (
  document.getElementById('turboBar')
);
/** @type {HTMLElement} сердечки жизней заезда */
export const livesEl = /** @type {HTMLElement} */ (
  document.getElementById('lives')
);
/** @type {HTMLElement} бейдж комбо-цепи */
export const comboEl = /** @type {HTMLElement} */ (
  document.getElementById('combo')
);
/** @type {HTMLElement} множитель цепи в бейдже */
export const comboMultEl = /** @type {HTMLElement} */ (
  document.getElementById('comboMult')
);
/** @type {HTMLElement} горшок цепи в бейдже */
export const comboPotEl = /** @type {HTMLElement} */ (
  document.getElementById('comboPot')
);
/** @type {HTMLElement} полоска окна цепи в бейдже */
export const comboTimerEl = /** @type {HTMLElement} */ (
  document.getElementById('comboTimer')
);
/** @type {HTMLElement} баннер «ЗОНА N» на рубеже сложности */
export const zoneEl = /** @type {HTMLElement} */ (
  document.getElementById('zone')
);
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
export let reduce = mqReduce.matches;
if (mqReduce.addEventListener)
  mqReduce.addEventListener('change', (e) => {
    reduce = e.matches;
  });
if (matchMedia('(pointer: coarse)').matches) {
  hintEl.textContent =
    'Тап по экрану — прыжок, ещё тап в воздухе — двойной · зажми — разгон';
  ctaMain.textContent = 'Тапни — прыгнуть';
}

// Геометрия кадра: все поля создаются сразу (стабильная форма объекта),
// значения пересчитывает layout() при resize.
/** @type {import('./types').Geometry} */
export const geometry = {
  s: 0,
  cowH: 0,
  u: 0,
  ox: 0,
  oy: 0,
  horizon: 0,
  edgeY: 0,
  refY: 0,
  K: 0,
  vx: 0,
  zEdge: 0,
  zBottom: 0,
  kR: 0,
  kF: 0,
  obD: 0,
  obL: 0,
  skyOff: 0,
  hg: null,
  rg: null,
};
export const PM = new DOMMatrix(); // переиспользуемая матрица для паттернов
export const canPatternTransform =
  typeof CanvasPattern !== 'undefined' &&
  'setTransform' in CanvasPattern.prototype;

/** @type {import('./types').GameState} */
export const state = {
  t: 0,
  camX: 90000 + Math.random() * 5000,
  speed: CRUISE,
  throttle: 0,
  turbo: 0,
  gasHeld: false,
  boost: 0,
  spdN: 1,
  bob: 0,
  bobV: 0,
  tilt: 0,
  tiltV: 0,
  h: 0,
  hV: 0,
  mode: 'ground',
  airT: 0,
  airDurationS: 0.6,
  jumps: 0,
  isOnRamp: false,
  slope: 0,
  sq: 1,
  sqV: 0,
  ear: 0.05,
  earV: 0,
  tag: 0.25,
  tagV: 0,
  spin: 0,
  roll: 0,
  kick: 0,
  kickDrop: 0,
  trick: null,
  trickQ: null,
  airTricks: [],
  airBonus: 0,
  trickEndT: -1,
  combo: { pot: 0, n: 0, mult: 1, timer: 0, used: {} },
  crash: null,
  ride: null,
  invuln: 0,
  shake: 0,
  lift: 0,
  zoomOut: 0,
  // кольцо поз для призраков: at(0) — самая старая, ёмкость отрезает хвост
  hist: /** @type {import('./types').PoseRing} */ (makeRing(14)),
  histAcc: 0,
  lastInput: -100,
  autoSeq: [],
  autoDouble: 0,
  autoAfter: null,
  nextFlourish: 2.5,
  nextSpawnX: 0,
  clearSpawnX: 0,
  score: 0,
  best: 0,
  run: null,
  zone: 1, // зона сложности — ведёт difficulty.js (фаза 2)
  isTouched0: false,
  playT0: 0, // первый ввод и начало первого заезда
  coachText: null,
  coachUntil: 0, // короткие советы тренера (обучение — гейты tutorial.js)
  isPaused: false, // открыта карточка туториала: мир заморожен (tutorial.js)
  resultUntil: 0, // карточка результата после крэша
};
state.best = readBest();
/** @type {import('./types').Cloud[]} */
export const clouds = [];
/** @type {import('./types').Particle[]} */
export const parts = [];
/** @type {import('./types').SpeedLine[]} */
export const lines = [];
export const cracks = /** @type {import('./types').CrackRing} */ (makeRing(64)); // швов в кадре единицы — ёмкость с большим запасом
/** @type {import('./types').AnyFeature[]} */
export const feats = [];
/** @type {import('./types').Pop[]} */
export const pops = [];
// ?bot=1 — баланс-прогон (tools/game-snapshot.mjs --balance): автопилот
// играет «за игрока» — заезд живёт и очки капают. В проде флага нет.
export const BOT_DRIVE =
  new URLSearchParams(location.search).get('bot') === '1';
/** @returns {boolean} игрок управляет сам (false — автопилот демо-режима) */
export const playerMode = () =>
  BOT_DRIVE || state.t - state.lastInput <= AUTO_DELAY_S;
/** @returns {boolean} коровой рулит автопилот (демо или баланс-бот) */
export const autoDrives = () => BOT_DRIVE || !playerMode();
/** @returns {boolean} катимся по ровному асфальту (не по конструкции) */
export const onFlat = () => state.mode === 'ground' && !state.isOnRamp;
/** @returns {boolean} катимся по поверхности конструкции */
export const onFeature = () => state.mode === 'ground' && state.isOnRamp;
