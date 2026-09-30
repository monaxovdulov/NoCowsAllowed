// Кикер (невысокий трамплин-клин): ground — подъём по склону, с края —
// вылет в launch(). Хуков collide/ride нет — конструкция проезжаемая.
import { clamp } from '../utils.js';
import { ctx, G, S } from '../state.js';
import { boardX, obZ, X0, X1, yAt } from '../layout.js';

/**
 * @param {number[][]} pts
 * @param {string | CanvasGradient | CanvasPattern} style
 * @param {number} dx
 */
function fillPoly(pts, style, dx) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + dx, pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}
// трамплин: деревянный клин в перспективе (боковая стенка, настил, металлический край)
/**
 * @param {import('../types').RampFeature} f
 * @param {number} blur смаз по x в пикселях
 */
function drawRamp(f, blur) {
  const q = obZ(f.x0 - S.camX),
    zn = 0.8 * q,
    zf = 1.28 * q,
    hh = f.data.hr * G.cowH;
  /** @type {(X: number, h: number, z: number) => number[]} */
  const P = (X, h, z) => [G.vx + (X - S.camX) / z, yAt(z) - h / z];
  const A = P(f.x0, 0, zn),
    B = P(f.x1, hh, zn),
    C = P(f.x1, hh, zf),
    D = P(f.x0, 0, zf);
  const F = P(f.x1, 0, zn),
    Gp = P(f.x1, 0, zf);
  if (Math.max(B[0], F[0]) < X0() - 60 || Math.min(A[0], D[0]) > X1() + 60)
    return;
  const fa = clamp((G.zEdge * 1.12 - zf) * 2.4, 0, 1); // проступает из дали
  if (fa <= 0.02) return;
  const shadowLen = 0.35 * G.cowH;
  const shape = (dx, alpha) => {
    ctx.globalAlpha = alpha;
    fillPoly(
      [F, Gp, [Gp[0] + shadowLen / zf, Gp[1]], [F[0] + shadowLen / zn, F[1]]],
      'rgba(4,5,10,0.35)',
      dx,
    );
    fillPoly([F, B, C, Gp], '#5a391b', dx);
    const tg = ctx.createLinearGradient(A[0] + dx, A[1], B[0] + dx, B[1]);
    tg.addColorStop(0, '#8a5c2f');
    tg.addColorStop(1, '#cc9655');
    fillPoly([A, B, C, D], tg, dx);
    ctx.strokeStyle = 'rgba(70,42,18,0.55)';
    ctx.lineWidth = Math.max(1, 1.3 * G.u);
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const z = zn + ((zf - zn) * i) / 6,
        a = P(f.x0, 0, z),
        b = P(f.x1, hh, z);
      ctx.moveTo(a[0] + dx, a[1]);
      ctx.lineTo(b[0] + dx, b[1]);
    }
    ctx.stroke();
    const sg = ctx.createLinearGradient(0, B[1], 0, F[1]);
    sg.addColorStop(0, '#76491f');
    sg.addColorStop(1, '#4a2c12');
    fillPoly([A, F, B], sg, dx);
    ctx.strokeStyle = 'rgba(40,24,10,0.7)';
    ctx.lineWidth = Math.max(1, 2.2 * G.u);
    ctx.beginPath();
    for (const k of [0.4, 0.72]) {
      const t = P(f.x0 + (f.x1 - f.x0) * k, hh * k, zn),
        b = P(f.x0 + (f.x1 - f.x0) * k, 0, zn);
      ctx.moveTo(t[0] + dx, t[1]);
      ctx.lineTo(b[0] + dx, b[1]);
    }
    ctx.stroke();
    ctx.strokeStyle = '#dfe4ea';
    ctx.lineWidth = Math.max(1.5, 3.2 * G.u);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(B[0] + dx, B[1]);
    ctx.lineTo(C[0] + dx, C[1]);
    ctx.stroke();
  };
  shape((blur * 0.8) / q, 0.3 * fa);
  shape(0, fa);
  ctx.globalAlpha = 1;
}

/** @type {import('../types').FeatureTypeSpec<import('../types').RampData, 'ramp'>} */
export const rampSpec = {
  type: 'ramp',
  weight: 0, // базовая конструкция: выбор пока в spawnFeatures (0.24)
  minGapBeforeCowH: 12,
  plan(ctx) {
    return {
      data: { hr: 0.3 },
      lengthCowH: 1.15,
      gapAfterCowH: ctx.rand(12, 17) * Math.max(1, 0.8 * ctx.spdN),
    };
  },
  ground(feat, X) {
    if (X < feat.x0 || X > feat.x1) return null;
    const k = (X - feat.x0) / (feat.x1 - feat.x0);
    return {
      h: feat.data.hr * k,
      slope: (feat.data.hr * G.cowH) / (feat.x1 - feat.x0),
    };
  },
  autopilot(feat) {
    // покатушечная конструкция: действий не нужно, но для проверки
    // «есть ли место для флёртиша» отвечаем своим въездом
    return feat.x1 > boardX()
      ? { at: feat.x0, leadS: 0, action: 'none' }
      : null;
  },
  depth: (feat) => obZ(feat.x0 - S.camX) * 1.06,
  draw: drawRamp,
};
