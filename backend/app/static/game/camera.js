import { clamp, DEG, lerp, nA, nB, nC, smooth } from './utils.js';
import { GRAV } from './constants.js';
import { geometry, reduce, state } from './state.js';
import { H, W } from './layout.js';

// Камера владеет своей матрицей (карта, этап 4): читатели импортируют
// живой биндинг CAM, пишет его только stepCamera.
/** Матрица камеры кадра: тряска, зум от скорости, подъём за коровой. */
export let CAM = new DOMMatrix();

/**
 * Тряска, зум от скорости, подъём за коровой в большом прыжке.
 * @param {number} dt шаг кадра, секунды
 */
export function stepCamera(dt) {
  state.shake = Math.max(0, state.shake - dt * 2.4);
  const apex =
    state.mode === 'air' && state.hV > 0
      ? state.h + (state.hV * state.hV) / (2 * GRAV)
      : state.h;
  const hT = state.mode === 'air' ? lerp(state.h, apex, 0.6) : state.h;
  state.lift +=
    (Math.max(0, hT - 0.18) * geometry.cowH - state.lift) *
    (1 - Math.exp(-dt * 6));
  state.zoomOut +=
    (clamp((hT - 0.35) / 0.8, 0, 1) * 0.09 - state.zoomOut) *
    (1 - Math.exp(-dt * 3));
  const mul = reduce ? 0.15 : 1;
  const amp =
    mul *
    (0.0018 * state.spdN + 0.0016 * state.boost + state.shake * 0.011) *
    geometry.cowH;
  const t = state.t;
  const sx =
    amp *
    (Math.sin(t * 21.3) * 0.45 +
      Math.sin(t * 34.7 + 1.3) * 0.25 +
      nA(t * 9) * 0.5);
  const sy =
    amp *
      (Math.sin(t * 27.1 + 0.7) * 0.45 +
        Math.sin(t * 41.9 + 2.1) * 0.25 +
        nB(t * 9) * 0.5) +
    0.004 * geometry.cowH * Math.sin(t * 0.9) * mul;
  const rot = mul * (0.0011 * state.spdN + state.shake * 0.004) * nC(t * 3.1);
  const zoom =
    1.035 +
    0.04 * smooth(state.boost) +
    0.012 * state.shake * mul -
    state.zoomOut;
  CAM = new DOMMatrix()
    .translate(W / 2, H / 2)
    .rotate(rot * DEG)
    .scale(zoom)
    .translate(-W / 2 + sx, -H / 2 + sy + state.lift);
}
