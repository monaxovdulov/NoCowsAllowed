import { clamp, DEG, lerp, nA, nB, nC, smooth } from './utils.js';
import { GRAV } from './constants.js';
import { G, reduce, S } from './state.js';
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
  S.shake = Math.max(0, S.shake - dt * 2.4);
  const apex =
    S.mode === 'air' && S.hV > 0 ? S.h + (S.hV * S.hV) / (2 * GRAV) : S.h;
  const hT = S.mode === 'air' ? lerp(S.h, apex, 0.6) : S.h;
  S.lift +=
    (Math.max(0, hT - 0.18) * G.cowH - S.lift) * (1 - Math.exp(-dt * 6));
  S.zoomOut +=
    (clamp((hT - 0.35) / 0.8, 0, 1) * 0.09 - S.zoomOut) *
    (1 - Math.exp(-dt * 3));
  const mul = reduce ? 0.15 : 1;
  const amp =
    mul * (0.0018 * S.spdN + 0.0016 * S.boost + S.shake * 0.011) * G.cowH;
  const t = S.t;
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
    0.004 * G.cowH * Math.sin(t * 0.9) * mul;
  const rot = mul * (0.0011 * S.spdN + S.shake * 0.004) * nC(t * 3.1);
  const zoom =
    1.035 + 0.04 * smooth(S.boost) + 0.012 * S.shake * mul - S.zoomOut;
  CAM = new DOMMatrix()
    .translate(W / 2, H / 2)
    .rotate(rot * DEG)
    .scale(zoom)
    .translate(-W / 2 + sx, -H / 2 + sy + S.lift);
}
