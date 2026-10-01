import { SRC } from './assets.js';
import { clamp, lerp, loadImg, smooth } from './utils.js';
import { CRUISE, MAXSPD, MINSPD } from './constants.js';
import { G, grainEl, hintEl, lines, reduce, S } from './state.js';
import { boardX, layout, perfScale, setPerfScale } from './layout.js';
import {
  buildSizeDependent,
  grainTiles,
  initAssets,
  initClouds,
  initShadow,
} from './sprites.js';
import { autopilot, physicsStep, stepGround, stepHistory } from './player.js';
import { stepCamera } from './camera.js';
import {
  checkObstacles,
  checkRideEntry,
  groundInfo,
  initFeatures,
  spawnFeatures,
  stepCracks,
  stepFlying,
} from './features.js';
import {
  initEffects,
  newLine,
  stepClouds,
  stepDust,
  stepLines,
  stepParticles,
} from './effects.js';
import { initScore } from './score.js';
import { render } from './render.js';
import { coachStep, initUi } from './ui.js';

// Подписки слоёв на события модели (карта, этап 3): порядок = порядок
// исполнения при emit — спавн-правила, эффекты, дальше счёт, потом DOM.
initFeatures();
initEffects();
initScore();
initUi();

// layout() только считает геометрию; буферы пересобираем здесь.
function relayout() {
  layout();
  buildSizeDependent();
}

// update() — оркестрация: шаги в прежнем порядке, по одной
// ответственности (карта, этап 4). Владельцы шагов — доменные модули.

/** Скорость и продвижение мира: разгон, крейсер, глушение после падения. */
function stepSpeed(dt) {
  S.t += dt;
  // мягкий старт заезда: ~14 с до крейсерской — время заметить препятствие и среагировать
  const rampT = S.playT0 ? smooth(clamp((S.t - S.playT0) / 14, 0, 1)) : 1;
  const cruise = lerp(3.3, CRUISE, rampT);
  const target =
    S.mode === 'crash'
      ? 1.3
      : S.throttle > 0
        ? MAXSPD
        : S.throttle < 0
          ? MINSPD
          : reduce
            ? 3.2
            : cruise;
  S.speed +=
    (target - S.speed) *
    (1 - Math.exp(-dt * (S.mode === 'crash' ? 3 : S.throttle > 0 ? 1.3 : 0.9)));
  S.boost = clamp((S.speed - CRUISE) / (MAXSPD - CRUISE), 0, 1);
  S.spdN = S.speed / CRUISE;
  S.camX += S.speed * G.cowH * dt;
  S.invuln = Math.max(0, S.invuln - dt);
}

/**
 * Физика с подшагами, потом столкновения, автопилот и подсказки.
 * @param {number} dt шаг кадра, секунды
 * @param {import('./types').GroundInfo} gi поверхность под доской
 */
function stepPhysics(dt, gi) {
  let rem = dt;
  while (rem > 1e-6) {
    const h = Math.min(rem, 1 / 240);
    physicsStep(h, gi.h);
    rem -= h;
  }
  checkObstacles();
  autopilot();
  coachStep();
}

/** @param {number} dt шаг кадра, секунды */
function update(dt) {
  stepSpeed(dt);
  spawnFeatures();
  const gi = groundInfo(boardX());
  stepGround(gi);
  checkRideEntry();
  stepPhysics(dt, gi);
  stepHistory(dt);
  stepCracks();
  stepFlying(dt);
  stepDust(dt);
  stepParticles(dt);
  stepLines(dt);
  stepClouds(dt);
  if (S.t > 9) hintEl.classList.add('dim');
  stepCamera(dt);
}

// ---------------------------------------------------------------- boot
let last = 0,
  emaFrame = 16.7,
  emaWork = 8,
  perfCool = 0;
/** @param {number} now метка requestAnimationFrame, мс */
function frame(now) {
  let dt = last ? (now - last) / 1000 : 1 / 60;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  const t0 = performance.now();
  update(Math.min(dt, 1 / 20));
  render();
  // динамическое разрешение: просадка кадров → снижаем DPR, есть запас → возвращаем чёткость
  emaWork += (performance.now() - t0 - emaWork) * 0.06;
  emaFrame += (Math.min(dt * 1000, 34) - emaFrame) * 0.06; // cap — не считаем паузы в фоне
  perfCool -= dt;
  if (S.t > 4 && perfCool <= 0) {
    if (emaFrame > 19 && perfScale > 0.55) {
      setPerfScale(Math.max(0.55, perfScale - 0.15));
      perfCool = 2.5;
      relayout();
    } else if (emaWork < 8 && emaFrame < 17.5 && perfScale < 1) {
      setPerfScale(Math.min(1, perfScale + 0.12));
      perfCool = 3;
      relayout();
    }
  }
  requestAnimationFrame(frame);
}

let resizeQueued = false;
addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    relayout();
  });
});

/*TEST_HOOK*/
Promise.all([
  loadImg(SRC.base),
  loadImg(SRC.board),
  loadImg(SRC.ear),
  loadImg(SRC.tag),
]).then(([base, board, ear, tag]) => {
  initAssets({ base, board, ear, tag });
  initClouds();
  relayout();
  initShadow();
  if (grainEl && grainTiles.length) {
    grainEl.style.backgroundImage = `url("${grainTiles[0].toDataURL()}")`;
  }
  for (let i = 0; i < 26; i++) lines.push(newLine(true));
  for (let i = 0; i < 60; i++) update(1 / 60); // прогрев: пыль и история уже есть
  requestAnimationFrame(frame);
});
