import { META } from './assets.js';
import { DEG, nE } from './utils.js';
import { geometry, onFlat, reduce, state } from './state.js';
import { zAt } from './layout.js';

// ---------------------------------------------------------------- pose → matrix
/** @type {import('./types').Vec2} */
const PIV = [200, 540]; // центр доски в координатах фото — вокруг него наклон
/** @type {import('./types').Vec2} */
const CEN = [300, 330]; // центр коровы — вокруг него сальто и 360
/**
 * @param {import('./types').Pose} p
 * @returns {DOMMatrix}
 */
export function poseMatrix(p) {
  const sqX = 1 + (1 - p.sq) * 0.55;
  const m = new DOMMatrix()
    .translate(
      geometry.ox + PIV[0] * geometry.s + (p.x || 0),
      geometry.oy + PIV[1] * geometry.s + p.y * geometry.cowH,
    )
    .rotate(p.tilt * DEG)
    .scale(geometry.s * sqX, geometry.s * p.sq)
    .translate(CEN[0] - PIV[0], CEN[1] - PIV[1]);
  if (p.roll) m.rotateSelf(p.roll * DEG);
  if (p.spin) {
    let c = Math.cos(p.spin);
    if (Math.abs(c) < 0.03) c = c < 0 ? -0.03 : 0.03;
    m.scaleSelf(c, 1);
  }
  return m.translateSelf(-CEN[0], -CEN[1]);
}
/** @returns {import('./types').Pose} текущая поза коровы */
export const curPose = () => ({
  y: state.bob + vib() - state.h,
  tilt: state.tilt,
  sq: state.sq,
  spin: state.spin,
  // на ride-конструкции к кувырку добавляется угол касательной дуги
  roll: state.roll + (state.ride ? state.ride.ang : 0),
});
/**
 * @param {DOMMatrix} m
 * @param {number} ang
 * @param {number} drop
 * @returns {DOMMatrix}
 */
function kickT(m, ang, drop) {
  const [a, b] = META.board.axis,
    cx = (a[0] + b[0]) / 2,
    cy = (a[1] + b[1]) / 2;
  const al = Math.atan2(b[1] - a[1], b[0] - a[0]) * DEG;
  let k = Math.cos(ang);
  if (Math.abs(k) < 0.04) k = k < 0 ? -0.04 : 0.04;
  return m
    .translate(0, drop)
    .translate(cx, cy)
    .rotate(al)
    .scale(1, k)
    .rotate(-al)
    .translate(-cx, -cy);
}
/** @param {DOMMatrix} m @returns {DOMMatrix} */
export function boardMatrix(m) {
  const c = state.crash;
  if (c)
    return kickT(
      poseMatrix({
        x: c.bx * geometry.cowH,
        y: state.bob - c.bh,
        tilt: c.brot,
        sq: 1,
      }),
      c.bkick,
      0,
    );
  return state.kick || state.kickDrop
    ? kickT(m, state.kick, state.kickDrop)
    : m;
}
/** @returns {number} вибрация подвески на ходу */
export function vib() {
  if (!onFlat()) return 0;
  const t = state.t,
    a = (reduce ? 0.35 : 1) * 0.0016 * state.spdN;
  return (
    a *
    (Math.sin(t * 47.1) * 0.5 +
      Math.sin(t * 73.3 + 1.1) * 0.3 +
      nE(t * 38) * 0.6)
  );
}
/** @returns {import('./types').WheelPoint[]} колёса в экранных координатах */
export function wheelsScreen() {
  const m = poseMatrix({
    y: state.bob + vib() - state.h,
    tilt: state.tilt,
    sq: state.sq,
  });
  return META.contact.map(([x, y]) => {
    const p = m.transformPoint(new DOMPoint(x, y));
    return { x: p.x, y: p.y, z: zAt(Math.max(p.y, geometry.horizon + 5)) };
  });
}
