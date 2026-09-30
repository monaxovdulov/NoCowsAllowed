import { clamp, rand, smooth, TAU } from './utils.js';
import { cracks, ctx, feats, G, S } from './state.js';
import { CAM } from './camera.js';
import { META } from './assets.js';
import { boardX, DPR, obZ, W, xAt, yAt, zAt } from './layout.js';
import { FEATURE_TYPES } from './track/index.js';
import { bumpAt, enterCrash } from './player.js';
import { poseMatrix } from './pose.js';

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

export function spawnFeatures() {
  // на узких экранах спавним глубже — за видимым краем дороги, чтобы препятствия подъезжали издалека
  const ahead =
    S.camX + Math.max(W * 1.5 - G.vx, G.zEdge * 1.15 * (W - G.vx) + 2 * G.cowH);
  while (S.nextSpawnX < ahead) {
    const X = S.nextSpawnX;
    let type = Math.random() < 0.24 ? 'ramp' : 'ob';
    if (feat0pending) {
      type = /** @type {string} */ (FEAT0);
      feat0pending = false;
    }
    const plan = FEATURE_TYPES[type].plan({
      X,
      cowH: G.cowH,
      spdN: S.spdN,
      rand,
    });
    const f = createFeature(type, X, X + plan.lengthCowH * G.cowH, plan.data);
    // реестр стирает вид: на границе спавна приводим к известному объединению
    feats.push(
      /** @type {import('./types').AnyFeature} */ (/** @type {unknown} */ (f)),
    );
    S.nextSpawnX = f.x1 + plan.gapAfterCowH * G.cowH;
  }
  for (let i = feats.length - 1; i >= 0; i--) {
    const f = feats[i];
    if (G.vx + (f.x1 - S.camX) < -W * 0.5) feats.splice(i, 1);
  }
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
export function checkObstacles() {
  const Xb = boardX();
  for (const f of feats)
    if (FEATURE_TYPES[f.type].collide?.(f, Xb, S.h) === 'hit')
      enterCrash('hit');
}
/** Швы на асфальте → удары по колёсам. */
export function stepCracks() {
  const zB = G.zBottom,
    farX = S.camX + (W * 1.3 - G.vx) * G.zEdge;
  let last = cracks.length
    ? cracks[cracks.length - 1].X
    : S.camX + W * 0.6 * zB;
  while (last < farX) {
    last += rand(5, 13) * G.cowH;
    cracks.push({
      X: last,
      hit: /** @type {[boolean, boolean]} */ ([false, false]),
    });
  }
  while (cracks.length && xAt(cracks[0].X, G.zEdge) < -W * 0.3) cracks.shift();
  const restM = poseMatrix({ y: S.bob, tilt: S.tilt, sq: S.sq });
  for (let i = 0; i < 2; i++) {
    const p = restM.transformPoint(
      new DOMPoint(META.contact[i][0], META.contact[i][1]),
    );
    const Xw = S.camX + (p.x - G.vx) * zAt(p.y);
    for (const c of cracks)
      if (!c.hit[i] && Xw >= c.X) {
        c.hit[i] = true;
        bumpAt(i, rand(0.6, 1));
      }
  }
}
/** Сбитые препятствия летят и отскакивают. @param {number} dt */
export function stepFlying(dt) {
  for (const f of feats) FEATURE_TYPES[f.type].step?.(f, dt);
}

export function drawFeatures() {
  const blur = (S.speed * G.cowH) / 45;
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const V = Math.max(1, S.speed * G.cowH),
    Xb = boardX();
  for (const f of feats) {
    const mk = FEATURE_TYPES[f.type].marker?.(f);
    if (!mk) continue;
    const mid = (f.x0 + f.x1) / 2,
      t = (mid - Xb) / V;
    if (t <= 0 || t > 2.6) continue;
    const z = obZ(mid - S.camX);
    const p = CAM.transformPoint(
      new DOMPoint(
        G.vx + (mid - S.camX) / z,
        yAt(z) - (mk.heightCowH * G.cowH) / z,
      ),
    );
    if (p.x < -24 * DPR || p.x > W + 24 * DPR) continue;
    const urgent = t < mk.leadS + 0.35;
    const a = smooth(clamp((2.6 - t) / 0.9, 0, 1));
    const s = (urgent ? 15 : 12) * DPR;
    const bob = (0.5 + 0.5 * Math.sin(S.t * (urgent ? 13 : 7))) * s * 0.35;
    ctx.globalAlpha = a;
    ctx.fillStyle = urgent ? '#ff5a4a' : '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x + s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x, p.y - bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,26,.92)';
    ctx.font = `800 ${(s * 1.05).toFixed(1)}px Unbounded, "Arial Black", system-ui, sans-serif`;
    ctx.fillText(mk.label, p.x, p.y - bob - s * 1.14);
  }
  ctx.globalAlpha = 1;
}

// значок у правого края: конструкция ещё за кадром, кольцо заполняется к моменту прыжка
export function drawWarnings() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const V = S.speed * G.cowH,
    Xb = boardX(),
    r = Math.max(14 * DPR, 0.06 * G.cowH);
  for (const f of feats) {
    const mk = FEATURE_TYPES[f.type].marker?.(f);
    if (!mk) continue;
    const mid = (f.x0 + f.x1) / 2,
      t = (mid - Xb) / V,
      lead = mk.leadS;
    const z = obZ(mid - S.camX);
    const edge = CAM.transformPoint(
      new DOMPoint(G.vx + (f.x0 - S.camX) / z, yAt(z)),
    );
    if (t > lead + 1.3 || t < 0) continue;
    const fadeIn = smooth(clamp((lead + 1.3 - t) / 0.35, 0, 1)); // появился заранее
    const fadeOut = smooth(clamp((t - lead + 0.2) / 0.14, 0, 1)); // гаснет сразу после момента прыжка
    const seen = smooth(clamp((edge.x - W * 0.68) / (W * 0.08), 0, 1)); // конструкция уже хорошо видна — значок не нужен
    const a = fadeIn * fadeOut * seen;
    if (a <= 0.01) continue;
    const x = W - r - 14 * DPR,
      y = CAM.transformPoint(new DOMPoint(0, G.refY - 0.16 * G.cowH)).y;
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
      ctx.font = `800 ${(r * 0.62).toFixed(1)}px Unbounded, "Arial Black", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = r * 0.16;
      ctx.strokeStyle = 'rgba(8,10,22,.85)';
      ctx.fillStyle = '#ffd84a';
      ctx.strokeText(mk.label, x - r * 1.75, y);
      ctx.fillText(mk.label, x - r * 1.75, y);
    }
  }
  ctx.globalAlpha = 1;
}
