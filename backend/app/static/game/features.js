import { clamp, compactInPlace, pick, rand, smooth, TAU } from './utils.js';
import {
  CLEAR_AFTER_LAND_COWH,
  MIN_FEAT_GAP_S,
  P_PATTERN,
  SPECIAL_EVERY_COWH,
  ZONE_BREATHE_S,
} from './constants.js';
import { cracks, ctx, feats, geometry, state } from './state.js';
import { CAM } from './camera.js';
import { META } from './assets.js';
import { on } from './events.js';
import { boardX, DPR, obPos, obZ, W, X1, xAt, yAt, zAt } from './layout.js';
import { zoneParams } from './difficulty.js';
import { FEATURE_TYPES } from './track/index.js';
import { bumpAt, enterCrash, enterRide } from './player.js';
import { poseMatrix } from './pose.js';
import { textSprite } from './sprites.js';

// ---------------------------------------------------------------- road features
// Движок не знает видов конструкций: всё видоспецифичное — в спеках
// FEATURE_TYPES (карта, этап 5, D3/D4). Здесь — оркестрация.
let featSeq = 0;
/**
 * Фабрика фич трассы: общая оболочка {id, type, x0, x1, data}. id
 * монотонный — для отладки и ключей.
 * @template {string} T
 * @template D
 * @param {T} type
 * @param {number} x0 мировой X левого края, px
 * @param {number} x1 мировой X правого края, px
 * @param {D} data параметры вида (в ростах коровы)
 * @returns {import('./types').TrackFeature<T, D>}
 */
export function createFeature(type, x0, x1, data) {
  return { id: ++featSeq, type, x0, x1, data };
}

// отладочный спавн: ?feat=<type> ставит эту конструкцию первой
const FEAT0 = new URLSearchParams(location.search).get('feat');
let feat0pending = !!(FEAT0 && FEATURE_TYPES[FEAT0]);

// выбор вида по весам таблицы FEATURE_TYPES с множителями зоны
// (weights из difficulty.params: 0 — вид на этой зоне не спавнится)
const SPECS = Object.values(FEATURE_TYPES);
const FALLBACK = FEATURE_TYPES.ob;
/**
 * @param {import('./types').ZoneParams} dp параметры текущей зоны
 * @returns {import('./types').FeatureTypeSpec}
 */
function pickSpec(dp) {
  let total = 0;
  for (const s of SPECS) total += s.weight * (dp.weights[s.type] ?? 1);
  let r = Math.random() * total;
  for (const s of SPECS) {
    r -= s.weight * (dp.weights[s.type] ?? 1);
    if (r <= 0) return s;
  }
  return FALLBACK;
}
/**
 * Выбор паттерна по весам (фаза 2): паттерн — данные, элементы идут
 * через обычный spec.plan в placeFeature.
 * @param {import('./types').SpawnPattern[]} pats допустимые на зоне
 * @returns {import('./types').SpawnPattern}
 */
function pickPattern(pats) {
  let total = 0;
  for (const p of pats) total += p.weight;
  let r = Math.random() * total;
  for (const p of pats) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return /** @type {import('./types').SpawnPattern} */ (pats.at(-1));
}
/** x0 последней спец-конструкции (для рейт-лимита). */
function lastSpecialX() {
  const horizon = state.nextSpawnX - SPECIAL_EVERY_COWH * geometry.cowH;
  for (let i = feats.length - 1; i >= 0; i--) {
    const f = feats[i];
    if (FEATURE_TYPES[f.type].special) return f.x0;
    if (f.x1 < horizon) break; // дальше только старые
  }
  return -Infinity;
}
/** Подписки модели трассы (вызывается из main при старте). */
export function initFeatures() {
  // чистая зона после приземления — ближние CLEAR_AFTER_LAND_COWH без конструкций
  on('land', () => {
    state.clearSpawnX = boardX() + CLEAR_AFTER_LAND_COWH * geometry.cowH;
  });
  // рубеж зоны — передышка: снимаем конструкции, которые ещё не
  // показались из-за правого края (видимые играются до конца), и даём
  // ZONE_BREATHE_S чистой трассы после баннера
  on('zone', () => {
    const Xb = boardX();
    compactInPlace(feats, (f) => f.x0 <= Xb || obPos(f.x0)[0] <= X1());
    const clear = Xb + ZONE_BREATHE_S * state.speed * geometry.cowH;
    state.clearSpawnX = Math.max(state.clearSpawnX, clear);
    state.nextSpawnX = Math.max(state.nextSpawnX, clear);
  });
}

/**
 * Одна конструкция на трассе: место с учётом зазоров (minGapBefore вида
 * и защита «полёт олли − 0.25 с» при текущей скорости), план вида, фича
 * и точка следующего спавна. Элемент паттерна (item) перезаписывает
 * поля data и зазор после него; рейт-лимит спец-конструкций на элементы
 * паттерна не действует — связка сама владеет своим ритмом.
 * @param {import('./types').FeatureTypeSpec} spec выбранный вид
 * @param {number} minGapPx защитный зазор до предыдущей конструкции, px
 * @param {import('./types').ZoneParams} dp параметры текущей зоны
 * @param {boolean} forced форс-спавн ?feat= — веса и рейт-лимиты молчат
 * @param {import('./types').PatternItem} [item] элемент паттерна
 */
function placeFeature(spec, minGapPx, dp, forced, item) {
  const prevX1 = feats.length ? feats[feats.length - 1].x1 : -Infinity;
  let X = Math.max(
    state.nextSpawnX,
    prevX1 + spec.minGapBeforeCowH * geometry.cowH,
    prevX1 + minGapPx,
  );
  // не больше одной спец-конструкции на SPECIAL_EVERY_COWH ростов
  if (
    !forced &&
    !item &&
    spec.special &&
    X - lastSpecialX() < SPECIAL_EVERY_COWH * geometry.cowH
  ) {
    spec = FALLBACK;
    X = Math.max(
      state.nextSpawnX,
      prevX1 + spec.minGapBeforeCowH * geometry.cowH,
      prevX1 + minGapPx,
    );
  }
  const plan = spec.plan({
    X,
    cowH: geometry.cowH,
    spdN: state.spdN,
    zone: state.zone,
    gapK: dp.gapK,
    rand,
  });
  if (item?.dataOverride) {
    /** @type {Record<string, unknown>} */
    const over = {};
    for (const [k, v] of Object.entries(item.dataOverride))
      over[k] = Array.isArray(v) ? pick(v) : v;
    Object.assign(/** @type {Record<string, unknown>} */ (plan.data), over);
  }
  const f = createFeature(
    spec.type,
    X,
    X + plan.lengthCowH * geometry.cowH,
    plan.data,
  );
  // реестр стирает вид: на границе спавна приводим к известному объединению
  feats.push(
    /** @type {import('./types').AnyFeature} */ (/** @type {unknown} */ (f)),
  );
  const gapCowH =
    item?.gapAfterCowH === undefined
      ? plan.gapAfterCowH
      : Array.isArray(item.gapAfterCowH)
        ? rand(item.gapAfterCowH[0], item.gapAfterCowH[1])
        : item.gapAfterCowH;
  // gapK зоны умножается здесь — одна точка для плановых и паттерновых
  // зазоров (план фазы 2), сами спеки gapK не применяют
  state.nextSpawnX = f.x1 + gapCowH * dp.gapK * geometry.cowH;
}

export function spawnFeatures() {
  // на узких экранах спавним глубже — за видимым краем дороги, чтобы препятствия подъезжали издалека
  const ahead =
    state.camX +
    Math.max(
      W * 1.5 - geometry.vx,
      geometry.zEdge * 1.15 * (W - geometry.vx) + 2 * geometry.cowH,
    );
  const dp = zoneParams(),
    minGapPx = MIN_FEAT_GAP_S * state.speed * geometry.cowH;
  while (state.nextSpawnX < ahead) {
    if (state.nextSpawnX < state.clearSpawnX)
      state.nextSpawnX = state.clearSpawnX;
    // форс-спавн через ?feat= обходит веса и рейт-лимиты
    const forced = feat0pending
      ? FEATURE_TYPES[/** @type {string} */ (FEAT0)]
      : null;
    feat0pending = false;
    // там, где зоне доступны паттерны, слот с шансом P_PATTERN — связка
    const pat =
      !forced && dp.patterns.length > 0 && Math.random() < P_PATTERN
        ? pickPattern(dp.patterns)
        : null;
    if (pat) {
      for (const item of pat.items)
        placeFeature(FEATURE_TYPES[item.type], minGapPx, dp, false, item);
    } else {
      placeFeature(forced || pickSpec(dp), minGapPx, dp, !!forced);
    }
  }
  // ушедшие за левый край конструкции — компактизация на месте, без splice
  compactInPlace(feats, (f) => geometry.vx + (f.x1 - state.camX) >= -W * 0.5);
}
/**
 * @param {number} X мировой X
 * @returns {import('./types').GroundInfo} высота и наклон поверхности
 */
export function groundInfo(X) {
  for (const f of feats) {
    const gi = FEATURE_TYPES[f.type].ground?.(f, X);
    if (gi) return gi;
  }
  return { h: 0, slope: 0 };
}
/**
 * Вход в ride-режим: конструкция сама решает через ride.canEnter(feat, state).
 * Вызывается после stepGround — доска на поверхности, режим актуален.
 */
export function checkRideEntry() {
  if (state.mode !== 'ground') return;
  for (const f of feats) {
    const rs = FEATURE_TYPES[f.type].ride;
    if (rs && rs.canEnter(f, state)) {
      enterRide(f);
      return;
    }
  }
}
export function checkObstacles() {
  const Xb = boardX();
  for (const f of feats)
    if (FEATURE_TYPES[f.type].collide?.(f, Xb, state.h) === 'hit')
      enterCrash('hit');
}
/** Швы на асфальте → удары по колёсам. */
export function stepCracks() {
  const zB = geometry.zBottom,
    farX = state.camX + (W * 1.3 - geometry.vx) * geometry.zEdge;
  const tail = cracks.at(cracks.length - 1);
  let last = tail ? tail.X : state.camX + W * 0.6 * zB;
  while (last < farX) {
    last += rand(5, 13) * geometry.cowH;
    cracks.push({
      X: last,
      isHit: /** @type {[boolean, boolean]} */ ([false, false]),
    });
  }
  while (cracks.length) {
    const first = cracks.at(0); // самый старый шов — левее всех
    if (!first || xAt(first.X, geometry.zEdge) >= -W * 0.3) break;
    cracks.shift();
  }
  const restM = poseMatrix({ y: state.bob, tilt: state.tilt, sq: state.sq });
  for (let i = 0; i < 2; i++) {
    const p = restM.transformPoint(
      new DOMPoint(META.contact[i][0], META.contact[i][1]),
    );
    const Xw = state.camX + (p.x - geometry.vx) * zAt(p.y);
    for (const c of cracks)
      if (!c.isHit[i] && Xw >= c.X) {
        c.isHit[i] = true;
        bumpAt(i, rand(0.6, 1));
      }
  }
}
/** Сбитые препятствия летят и отскакивают. @param {number} dt */
export function stepFlying(dt) {
  for (const f of feats) FEATURE_TYPES[f.type].step?.(f, dt);
}

export function drawFeatures() {
  const blur = (state.speed * geometry.cowH) / 45;
  /** @type {{z: number, f: import('./types').AnyFeature}[]} */
  const items = []; // дальние рисуем первыми
  for (const f of feats) {
    const spec = FEATURE_TYPES[f.type];
    if (!spec.draw || !spec.depth) continue;
    items.push({ z: spec.depth(f), f });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) FEATURE_TYPES[it.f.type].draw?.(it.f, blur);
  ctx.globalAlpha = 1;
}
export function drawFlying() {
  for (const f of feats) FEATURE_TYPES[f.type].drawFlying?.(f);
}

// маркер над приближающейся конструкцией — виден, пока спрайт ещё мелкий;
// «×2» — длинные/высокие, где нужен двойной прыжок; краснеет к моменту прыжка
export function drawMarkers() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const V = Math.max(1, state.speed * geometry.cowH),
    Xb = boardX();
  for (const f of feats) {
    const mk = FEATURE_TYPES[f.type].marker?.(f);
    if (!mk) continue;
    const mid = (f.x0 + f.x1) / 2,
      t = (mid - Xb) / V;
    if (t <= 0 || t > 2.6) continue;
    const z = obZ(mid - state.camX);
    const p = CAM.transformPoint(
      new DOMPoint(
        geometry.vx + (mid - state.camX) / z,
        yAt(z) - (mk.heightCowH * geometry.cowH) / z,
      ),
    );
    if (p.x < -24 * DPR || p.x > W + 24 * DPR) continue;
    const urgent = t < mk.leadS + 0.35;
    const a = smooth(clamp((2.6 - t) / 0.9, 0, 1));
    const s = (urgent ? 15 : 12) * DPR;
    const bob = (0.5 + 0.5 * Math.sin(state.t * (urgent ? 13 : 7))) * s * 0.35;
    ctx.globalAlpha = a;
    ctx.fillStyle = urgent ? '#ff5a4a' : '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x + s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x, p.y - bob);
    ctx.closePath();
    ctx.fill();
    // подпись — кэшированный спрайт, fillText каждый кадр не нужен
    const spr = textSprite(mk.label, s * 1.05, 'rgba(10,14,26,.92)');
    ctx.drawImage(
      spr,
      p.x - spr.width / 2,
      p.y - bob - s * 1.14 - spr.height / 2,
    );
  }
  ctx.globalAlpha = 1;
}

// значок у правого края: конструкция ещё за кадром, кольцо заполняется к моменту прыжка
export function drawWarnings() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const V = state.speed * geometry.cowH,
    Xb = boardX(),
    r = Math.max(14 * DPR, 0.06 * geometry.cowH);
  for (const f of feats) {
    const mk = FEATURE_TYPES[f.type].marker?.(f);
    if (!mk) continue;
    const mid = (f.x0 + f.x1) / 2,
      t = (mid - Xb) / V,
      lead = mk.leadS;
    const z = obZ(mid - state.camX);
    const edge = CAM.transformPoint(
      new DOMPoint(geometry.vx + (f.x0 - state.camX) / z, yAt(z)),
    );
    if (t > lead + 1.3 || t < 0) continue;
    const fadeIn = smooth(clamp((lead + 1.3 - t) / 0.35, 0, 1)); // появился заранее
    const fadeOut = smooth(clamp((t - lead + 0.2) / 0.14, 0, 1)); // гаснет сразу после момента прыжка
    const seen = smooth(clamp((edge.x - W * 0.68) / (W * 0.08), 0, 1)); // конструкция уже хорошо видна — значок не нужен
    const a = fadeIn * fadeOut * seen;
    if (a <= 0.01) continue;
    const x = W - r - 14 * DPR,
      y = CAM.transformPoint(
        new DOMPoint(0, geometry.refY - 0.16 * geometry.cowH),
      ).y;
    const prog = clamp(1 - (t - lead) / 1.3, 0, 1),
      now = t <= lead + 0.06;
    ctx.globalAlpha = a;
    ctx.fillStyle = now ? 'rgba(255,216,74,.9)' : 'rgba(10,14,26,.62)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffd84a';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
    ctx.stroke();
    if (mk.icon) {
      const spr = /** @type {HTMLCanvasElement} */ (mk.icon),
        k = (r * 1.25) / Math.max(spr.width, spr.height);
      ctx.drawImage(
        spr,
        x - (spr.width * k) / 2,
        y - (spr.height * k) / 2,
        spr.width * k,
        spr.height * k,
      );
    }
    if (mk.label !== '!') {
      const spr = textSprite(
        mk.label,
        r * 0.62,
        '#ffd84a',
        'rgba(8,10,22,.85)',
        r * 0.16,
      );
      ctx.drawImage(spr, x - r * 1.75 - spr.width / 2, y - spr.height / 2);
    }
  }
  ctx.globalAlpha = 1;
}
