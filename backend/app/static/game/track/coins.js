// Клевер — четырёхлистники (продукт-план, фаза 3): первая коллекция.
// Коллектибл, а не препятствие: collide помечает собранные и всегда
// возвращает 'clear' — сбить клевер нельзя. Формы россыпи (data.shape):
//   line — 5 клеверов низко над асфальтом: собираются просто ездой;
//   arc — 5 по параболе прыжка (со 2-й зоны — двойного): «прыгай здесь»;
//     если прямо перед нами стоит кикер (паттерн ставит вплотную) — дуга
//     идёт по параболе его вылета;
//   loopTop — золотой клевер в верхней точке петли (паттерн ставит сразу
//     за loop): берётся только проездом через вершину.
// Якорь у обеих «чужих» форм — предыдущая конструкция: plan читает
// feats.at(-1) и при малом зазоре строит точки от её геометрии (dx < 0 —
// часть россыпи лежит ДО нашего x0, внутри хозяина).
// Сбор — событие 'coin': очки в цепь (combo.js), статистика заезда
// (run.js), искры и попап «ПОВЕЗЛО!» (effects.js), кошелёк HUD (ui.js).
import { clamp } from '../utils.js';
import {
  COIN_HIT_H,
  COIN_HIT_X,
  COIN_LINE_H,
  COIN_N,
  COIN_STEP_COWH,
  CRUISE,
  DOUBLE_V,
  GRAV,
  OLLIE_V,
} from '../constants.js';
import { emit } from '../events.js';
import { ctx, feats, geometry, state } from '../state.js';
import { boardX, obPos, X0, X1 } from '../layout.js';
import { cloverGoldImg, cloverImg, glowImg, OBR } from '../sprites.js';

// якорная конструкция считается «хозяином» только вплотную — больше
// зазора нет ни у одного планового gapAfter, связь ставит паттерн
const HOST_GAP_COWH = 6;

/**
 * Парабола прыжка → COIN_N точек дуги, равномерно по времени полёта.
 * Интегрируем шагами — так «двойной» вписывается естественно: в момент
 * dblAt скорость перезаряжается ровно как в player.js:jump().
 * @param {number} v0 вертикальная скорость вылета, cowH/с
 * @param {number} h0 высота кромки вылета, cowH
 * @param {number} spd скорость по трассе, cowH/с
 * @param {number} dblAt момент двойного прыжка, с (0 — обычный)
 * @returns {import('../types').Vec2[]} [dxCowH, hCowH] от точки вылета
 */
function jumpArc(v0, h0, spd, dblAt) {
  const dt = 1 / 240;
  /** @type {number[]} */
  const xs = [];
  /** @type {number[]} */
  const hs = [];
  let t = 0,
    h = h0,
    v = v0;
  while (h > 0 || t === 0) {
    t += dt;
    v -= GRAV * dt;
    if (dblAt > 0 && t >= dblAt) {
      v = Math.max(v, 0) * 0.3 + DOUBLE_V; // как state.hV в jump()
      dblAt = 0;
    }
    h += v * dt;
    xs.push(spd * t);
    hs.push(h);
  }
  /** @type {import('../types').Vec2[]} */
  const pts = [];
  for (let i = 0; i < COIN_N; i++) {
    const k = Math.floor(((i + 0.5) / COIN_N) * xs.length);
    pts.push([xs[k], Math.max(0.06, hs[k])]);
  }
  return pts;
}

/** @type {import('../types').FeatureTypeSpec<import('../types').CoinsData, 'coins'>} */
export const coinsSpec = {
  type: 'coins',
  weight: 12, // редкая россыпь — коллекция, а не основа ритма
  minGapBeforeCowH: 2.5,
  plan(ctx) {
    // конструкция прямо перед нами — якорь форм: паттерн ставит клевер
    // вплотную за кикером (дуга вылета) или петлёй (золотой на вершине)
    const prev = feats.at(-1),
      prevGap = prev ? (ctx.X - prev.x1) / ctx.cowH : Infinity;
    /** @type {import('../types').CoinsShape} */
    let shape = 'line';
    /** @type {import('../types').Vec2[]} */
    let pts;
    let dbl = false;
    const spd = Math.max(1, ctx.spdN) * CRUISE;
    if (prev && prev.type === 'loop' && prevGap < HOST_GAP_COWH) {
      // вершина петли: θ=π над точкой входа — X входа, h = 2r
      const d = /** @type {import('../types').LoopData} */ (prev.data);
      pts = [[(prev.x0 + d.entry * ctx.cowH - ctx.X) / ctx.cowH, 2 * d.r]];
      shape = 'loopTop';
    } else if (prev && prev.type === 'ramp' && prevGap < HOST_GAP_COWH) {
      // дуга над кикером — по параболе вылета от его кромки
      const d = /** @type {import('../types').RampData} */ (prev.data);
      const launch = Math.min(3.9, 2.2 + 1.25 * ctx.spdN); // как в launch()
      pts = jumpArc(launch, d.hr, spd, 0).map(([x, h]) => [x - prevGap, h]);
      shape = 'arc';
    } else if (prev && ctx.rand(0, 1) < 0.4) {
      // «прыгай здесь»: с зоны 2 — по параболе двойного прыжка
      dbl = ctx.zone >= 2;
      pts = jumpArc(OLLIE_V, 0, spd, dbl ? 0.25 : 0);
      shape = 'arc';
    } else {
      pts = [];
      for (let i = 0; i < COIN_N; i++)
        pts.push([i * COIN_STEP_COWH, COIN_LINE_H]);
    }
    return {
      data: { shape, n: pts.length, pts, taken: pts.map(() => false), dbl },
      lengthCowH: Math.max(0.4, pts[pts.length - 1][0] + 0.4),
      gapAfterCowH: ctx.rand(8, 13) * Math.max(1, 0.8 * ctx.spdN),
    };
  },
  // точка сбора — тот же кадровый collide, что и у препятствий, но
  // хитбокс по точкам россыпи и 'hit' не бывает никогда
  collide(feat, X, h) {
    const d = feat.data,
      cowH = geometry.cowH,
      hb = COIN_HIT_X * cowH;
    if (
      X < feat.x0 + d.pts[0][0] * cowH - hb ||
      X > feat.x0 + d.pts[d.n - 1][0] * cowH + hb
    )
      return 'clear';
    for (let i = 0; i < d.n; i++) {
      if (d.taken[i]) continue;
      const [dx, ch] = d.pts[i],
        Xc = feat.x0 + dx * cowH;
      if (Math.abs(X - Xc) >= hb || Math.abs(h - ch) >= COIN_HIT_H) continue;
      d.taken[i] = true;
      const [x, y, z] = obPos(Xc);
      emit('coin', {
        x,
        y: y - (ch * cowH) / z,
        z,
        gold: d.shape === 'loopTop',
        full: d.taken.every(Boolean),
      });
    }
    return 'clear';
  },
  autopilot(feat) {
    const d = feat.data;
    if (feat.x1 <= boardX() || d.taken.every(Boolean)) return null;
    if (d.shape === 'arc') {
      // прыжок к началу дуги — пролетели старт, хинт уже не нужен
      const at = feat.x0 + d.pts[0][0] * geometry.cowH;
      if (at <= boardX()) return null;
      return { at, leadS: 0.07, action: d.dbl ? 'double' : 'jump' };
    }
    // линия собирается ездой, золотой — дугой петли: флёртиш на подходе
    // не нужен, конструкция отвечает своим въездом
    return { at: feat.x0, leadS: 0, action: 'none' };
  },
  depth: (feat) => obPos((feat.x0 + feat.x1) / 2)[2],
  draw(feat, blur) {
    const d = feat.data,
      cowH = geometry.cowH,
      img = d.shape === 'loopTop' ? cloverGoldImg : cloverImg;
    for (let i = 0; i < d.n; i++) {
      if (d.taken[i]) continue;
      const [dx, ch] = d.pts[i],
        [x, y, z] = obPos(feat.x0 + dx * cowH);
      if (x < X0() - cowH || x > X1() + cowH) continue;
      const a = clamp((geometry.zEdge * 1.12 - z) * 2.4, 0, 1); // проступают из дали
      if (a <= 0.02) continue;
      const sc = cowH / OBR / z,
        w = img.width * sc,
        hh = img.height * sc,
        // вращение вокруг вертикали — сжатие по X синусом; лёгкий покач
        sqz = 0.2 + 0.8 * Math.abs(Math.cos(state.t * 2.7 + i * 1.9)),
        bob = Math.sin(state.t * 2.2 + i * 1.3) * 0.02 * cowH,
        cy = y - (ch * cowH) / z - bob / z;
      // свечение под клевером — отделяет спрайт от тёмного асфальта
      ctx.save();
      ctx.translate(x, cy);
      ctx.scale((w * 0.72) / 64, (hh * 0.72) / 64);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.32 * a;
      ctx.drawImage(glowImg, -64, -64);
      ctx.restore();
      ctx.save();
      ctx.translate(x, cy);
      ctx.scale(sqz, 1);
      // смаз движения — как у препятствий
      ctx.globalAlpha = 0.26 * a;
      ctx.drawImage(img, -w / 2 + blur / z, -hh / 2, w, hh);
      ctx.globalAlpha = a;
      ctx.drawImage(img, -w / 2, -hh / 2, w, hh);
      ctx.restore();
    }
  },
};
