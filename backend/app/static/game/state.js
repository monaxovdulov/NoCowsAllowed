import { AUTO_DELAY, CRUISE } from './constants.js';

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
/** @type {HTMLElement} */
export const scoreEl = /** @type {HTMLElement} */ (
  document.getElementById('score')
);
/** @type {HTMLElement} */
export const bestEl = /** @type {HTMLElement} */ (
  document.getElementById('best')
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
export const G = {
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
export let CAM = new DOMMatrix(); // камера (тряска, зум, подъём за коровой)
export const PM = new DOMMatrix(); // переиспользуемая матрица для паттернов
export const canPatternTransform =
  typeof CanvasPattern !== 'undefined' &&
  'setTransform' in CanvasPattern.prototype;
/** @param {DOMMatrix} m */
export function setCAM(m) {
  CAM = m;
}

/** @type {import('./types').GameState} */
export const S = {
  t: 0,
  camX: 90000 + Math.random() * 5000,
  speed: CRUISE,
  throttle: 0,
  boost: 0,
  spdN: 1,
  bob: 0,
  bobV: 0,
  tilt: 0,
  tiltV: 0,
  h: 0,
  hV: 0,
  air: false,
  airT: 0,
  airDur: 0.6,
  jumps: 0,
  onRamp: false,
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
  crash: null,
  invuln: 0,
  shake: 0,
  lift: 0,
  zoomOut: 0,
  hist: [],
  histAcc: 0,
  lastInput: -100,
  autoSeq: [],
  autoDouble: 0,
  autoAfter: null,
  nextFlourish: 2.5,
  nextSpawnX: 0,
  score: 0,
  best: 0,
  touched0: false,
  playT0: 0, // первый ввод и начало первого заезда
  coachStage: 0,
  coachText: null,
  coachUntil: 0, // микро-обучение в первом заезде
  resultUntil: 0, // карточка результата после крэша
};
try {
  S.best = Math.max(
    0,
    parseInt(localStorage.getItem('cow-skate-best'), 10) || 0,
  );
} catch (e) {
  /* без рекорда */
}
/** @type {import('./types').Cloud[]} */
export const clouds = [];
/** @type {import('./types').Particle[]} */
export const parts = [];
/** @type {import('./types').SpeedLine[]} */
export const lines = [];
/** @type {import('./types').Crack[]} */
export const cracks = [];
/** @type {import('./types').Feature[]} */
export const feats = [];
/** @type {import('./types').Pop[]} */
export const pops = [];
/** @returns {boolean} игрок управляет сам (false — автопилот демо-режима) */
export const playerMode = () => S.t - S.lastInput <= AUTO_DELAY;
