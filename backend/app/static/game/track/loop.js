// Мёртвая петля (gameplay-ux-plan §B): ride-конструкция — корова катит по
// внутренней поверхности кольца. Траектория параметрическая: дуга s ∈
// [0, 2πR]; гравитация честная (тангенциальная составляющая −g·sinθ),
// в верхней трети дуги действует магнитная помощь (ASSIST < 1) — рельс
// держит доску. Не добрал скорость — откат назад и мягкий выход без
// крэша (повторный заезд запрещён флагом data.tried).
import { clamp, TAU } from '../utils.js';
import { GRAV } from '../constants.js';
import { ctx, G, S } from '../state.js';
import { boardX, obZ, X0, X1, yAt } from '../layout.js';

const R = 1.0; // радиус петли, cowH: кольцо 2 роста — читается, вход ~5.2 cowH/с
const PAD = 0.5; // ровная полка до/после круга, cowH
const ASSIST = 0.55; // ослабление g в верхней трети — «магнитная» помощь рельса
const TOP0 = 2.05,
  TOP1 = TAU - 2.05; // дуга верхней трети (рад от нижней точки)

/** @param {import('../types').LoopFeature} f @returns {number} мировой X входа (низ круга) */
const entryX = (f) => f.x0 + f.data.entry * G.cowH;

/**
 * Точка дуги в экранных координатах для стенки глубиной z и радиуса k·R.
 * θ = 0 — низ петли, θ = π — верх.
 * @type {(th: number, z: number, k: number, Xc: number, rPx: number) => number[]}
 */
const arcPt = (th, z, k, Xc, rPx) => {
  const r = (rPx * k) / z;
  return [
    G.vx + (Xc - S.camX) / z + r * Math.sin(th),
    yAt(z) - rPx / z - r * Math.cos(th),
  ];
};

// две стенки кольца в перспективе + шпалы между ними, опоры и бортик
/**
 * @param {import('../types').LoopFeature} f
 * @param {number} blur смаз по x в пикселях
 */
function drawLoop(f, blur) {
  const Xc = entryX(f),
    rPx = f.data.r * G.cowH,
    q = obZ(Xc - S.camX),
    zn = 0.8 * q,
    zf = 1.28 * q;
  const a = (th, z, k) => arcPt(th, z, k, Xc, rPx);
  // отсечение: вся конструкция за кадром
  if (
    G.vx + (Xc + rPx - S.camX) / zn < X0() - 80 ||
    G.vx + (Xc - rPx - S.camX) / zf > X1() + 80
  )
    return;
  const fa = clamp((G.zEdge * 1.12 - zf) * 2.4, 0, 1);
  if (fa <= 0.02) return;
  /** @param {number} dx @param {number} alpha */
  const shape = (dx, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // тень-пятно под конструкцией
    ctx.fillStyle = 'rgba(4,5,10,0.3)';
    ctx.beginPath();
    ctx.ellipse(
      G.vx + (Xc - S.camX) / zn + dx,
      yAt(zn),
      (rPx * 1.3) / zn,
      0.09 * G.cowH,
      0,
      0,
      TAU,
    );
    ctx.fill();
    // опоры: по две стойки на стенку под боковые точки дуги
    ctx.strokeStyle = '#4a2c12';
    ctx.lineWidth = Math.max(1.2, 4 * G.u);
    ctx.beginPath();
    for (const z of [zn, zf])
      for (const th of [Math.PI * 0.62, Math.PI * 1.38]) {
        const p = a(th, z, 1);
        ctx.moveTo(p[0] + dx, p[1]);
        ctx.lineTo(p[0] + dx, yAt(z));
      }
    ctx.stroke();
    // шпалы: радиальные связи между стенками
    ctx.strokeStyle = 'rgba(70,42,18,0.8)';
    ctx.lineWidth = Math.max(1, 2.6 * G.u);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * TAU,
        p0 = a(th, zn, 0.93),
        p1 = a(th, zf, 0.93);
      ctx.moveTo(p0[0] + dx, p0[1]);
      ctx.lineTo(p1[0] + dx, p1[1]);
    }
    ctx.stroke();
    // кольцевое полотно: внешний и внутренний край обеих стенок
    for (const [z, shade] of /** @type {[number, string][]} */ ([
      [zf, '#6b451f'],
      [zn, '#8a5c2f'],
    ]))
      for (const k of [1.08, 0.86]) {
        ctx.strokeStyle = shade;
        ctx.lineWidth = Math.max(1.2, (k > 1 ? 4.6 : 3.6) * G.u);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const p = a((i / 40) * TAU, z, k);
          if (i) ctx.lineTo(p[0] + dx, p[1]);
          else ctx.moveTo(p[0] + dx, p[1]);
        }
        ctx.stroke();
      }
    // металлический бортик ближней стенки
    ctx.strokeStyle = '#dfe4ea';
    ctx.lineWidth = Math.max(1.5, 3.4 * G.u);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = a((i / 40) * TAU, zn, 0.97);
      if (i) ctx.lineTo(p[0] + dx, p[1]);
      else ctx.moveTo(p[0] + dx, p[1]);
    }
    ctx.stroke();
  };
  shape((blur * 0.8) / q, 0.3 * fa);
  shape(0, fa);
  ctx.globalAlpha = 1;
}

/** Ближний рельс поверх коровы — она едет внутри кольца, за ним. */
function drawLoopFront(f) {
  const Xc = entryX(f),
    rPx = f.data.r * G.cowH,
    zn = 0.8 * obZ(Xc - S.camX);
  if (
    G.vx + (Xc + rPx - S.camX) / zn < X0() - 60 ||
    G.vx + (Xc - rPx - S.camX) / zn > X1() + 60
  )
    return;
  const a = (th) => arcPt(th, zn, 1.08, Xc, rPx);
  ctx.strokeStyle = '#a5713b';
  ctx.lineWidth = Math.max(1.4, 4.6 * G.u);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const p = a((i / 40) * TAU);
    if (i) ctx.lineTo(p[0], p[1]);
    else ctx.moveTo(p[0], p[1]);
  }
  ctx.stroke();
}

/** @type {import('../types').FeatureTypeSpec<import('../types').LoopData, 'loop'>} */
export const loopSpec = {
  type: 'loop',
  weight: 6,
  minGapBeforeCowH: 15, // разбег перед петлёй без конструкций
  special: true,
  plan(ctx) {
    return {
      data: { r: R, entry: R + PAD, tried: false },
      lengthCowH: 2 * (R + PAD),
      // за выездом — чистая зона приземления
      gapAfterCowH: ctx.rand(18, 24) * Math.max(1, 0.8 * ctx.spdN),
    };
  },
  ride: {
    tricks: true,
    canEnter(feat, st) {
      const Xb = boardX();
      return (
        st.mode === 'ground' &&
        !feat.data.tried &&
        Xb >= entryX(feat) &&
        // только в момент пересечения входа: приземлился позже — проехал мимо
        Xb < entryX(feat) + 0.4 * G.cowH
      );
    },
    length: (feat) => TAU * feat.data.r,
    path(feat, s) {
      const th = s / feat.data.r;
      return {
        X: entryX(feat) + feat.data.r * G.cowH * Math.sin(th),
        h: feat.data.r * (1 - Math.cos(th)),
        angle: -th, // касательная в canvas-угле: вверх — против часовой
      };
    },
    step(feat, ride, dt) {
      const th = ride.s / feat.data.r,
        g = GRAV * (th > TOP0 && th < TOP1 ? ASSIST : 1);
      ride.v -= g * Math.sin(th) * dt;
      ride.s += ride.v * dt;
      // прошёл круг или откатился назад через вход — конструкция «used»
      if (ride.s >= TAU * feat.data.r || (ride.s < 0 && ride.v < 0)) {
        feat.data.tried = true;
        return 'exit';
      }
      return 'ride';
    },
  },
  marker: (feat) =>
    feat.data.tried || S.ride?.feat === feat
      ? null
      : { label: 'ГАЗ', leadS: 1.5, heightCowH: 1.1 },
  autopilot(feat) {
    if (feat.data.tried || boardX() > entryX(feat)) return null;
    // зажать разгон заранее — к входу нужна скорость выше крейсерской
    return { at: entryX(feat), leadS: 1.7, action: 'hold' };
  },
  depth: (feat) => obZ(entryX(feat) - S.camX) * 1.06,
  draw: drawLoop,
  drawFlying: drawLoopFront,
};
