import { AUTO_DELAY, CRUISE } from './constants.js';

// ---------------------------------------------------------------- DOM, canvas
export const cv = document.getElementById('scene');
export const ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
export const bloomEl = document.getElementById('bloom');
export const grainEl = document.querySelector('.grain');
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
export const hintEl = document.getElementById('hint');
export const hudEl = document.getElementById('hud');
export const scoreEl = document.getElementById('score');
export const bestEl = document.getElementById('best');
export const autoEl = document.getElementById('auto');
export const ctaEl = document.getElementById('cta');
const ctaMain = document.getElementById('ctaMain');
export const coachEl = document.getElementById('coach');
export const resultEl = document.getElementById('result');
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

export const G = {}; // геометрия кадра
export let CAM = new DOMMatrix(); // камера (тряска, зум, подъём за коровой)
export const PM = new DOMMatrix(); // переиспользуемая матрица для паттернов
export const canPatternTransform =
  typeof CanvasPattern !== 'undefined' &&
  'setTransform' in CanvasPattern.prototype;
export function setCAM(m) {
  CAM = m;
}

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
export const clouds = [],
  parts = [],
  lines = [],
  cracks = [],
  feats = [],
  pops = [];
export const playerMode = () => S.t - S.lastInput <= AUTO_DELAY;
