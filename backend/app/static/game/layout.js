import { clamp } from './utils.js';
import { cracks, cv, feats, geometry, state } from './state.js';

// ---------------------------------------------------------------- layout
export let W = 1,
  H = 1,
  DPR = 1,
  perfScale = 1; // perfScale — динамическое разрешение под нагрузкой
/** @param {number} v */
export function setPerfScale(v) {
  perfScale = v;
}
/** @param {number} y @returns {number} глубина z по экранному y */
export const zAt = (y) => geometry.K / Math.max(1e-3, y - geometry.horizon);
/** @param {number} z @returns {number} экранный y по глубине z */
export const yAt = (z) => geometry.horizon + geometry.K / z;
/**
 * @param {number} X мировой X
 * @param {number} z
 * @returns {number} экранный x
 */
export const xAt = (X, z) => geometry.vx + (X - state.camX) / z;
/** @returns {number} центр доски в мире (глубина 1) */
export const boardX = () =>
  state.camX + (geometry.ox + 200 * geometry.s - geometry.vx);
// препятствия едут по полосе дороги: у доски z=1, вдали сжимаются к горизонту
/** @param {number} d расстояние до камеры @returns {number} глубина z */
export const obZ = (d) =>
  clamp(1 + (d - geometry.obD) / geometry.obL, 0.8, geometry.zEdge * 1.12);
/**
 * @param {number} X мировой X препятствия
 * @returns {import('./types').Vec3} экранные x, y и глубина z
 */
export const obPos = (X) => {
  const d = X - state.camX,
    z = obZ(d);
  return [geometry.vx + d / z, yAt(z), z];
};

// Только геометрия кадра и мировой масштаб (карта, этап 3): пересборку
// размеро-зависимых буферов вызывающий делает сам — buildSizeDependent()
// зовётся из main.js рядом с layout().
export function layout() {
  const cssW = Math.max(1, innerWidth),
    cssH = Math.max(1, innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2) * perfScale;
  const cap = 2.6e6;
  if (cssW * cssH * dpr * dpr > cap) dpr = Math.sqrt(cap / (cssW * cssH));
  DPR = Math.max(0.5, dpr);
  const oldCowH = geometry.cowH;
  W = Math.round(cssW * DPR);
  H = Math.round(cssH * DPR);
  cv.width = W;
  cv.height = H;

  // корова (в пикселях фото: макушка y=45, колёса y=591, ширина ~545)
  // на узких экранах корова меньше, левее и ниже — иначе она съедает всю дорогу впереди
  const narrow = W < H * 0.8;
  const s = Math.min((0.58 * H) / 546, ((narrow ? 0.4 : 0.86) * W) / 545);
  const cowH = 546 * s;
  const bottom = Math.min(
    H * (narrow ? 0.88 : 0.8),
    H * (narrow ? 0.64 : 0.54) + cowH * 0.5,
  );
  const top = bottom - cowH;
  const cx = W * (W > H * 1.25 ? 0.36 : narrow ? 0.27 : 0.44); // впереди коровы — место, чтобы видеть препятствия
  Object.assign(geometry, {
    s,
    cowH,
    u: cowH / 670,
    ox: cx - 312 * s,
    oy: top - 45 * s,
  });
  geometry.horizon = geometry.oy + 200 * s; // линия горизонта как на фото
  geometry.edgeY = geometry.oy + 329 * s; // дальний край дороги
  geometry.refY = geometry.oy + 537 * s; // линия контакта доски = глубина 1
  geometry.K = geometry.refY - geometry.horizon;
  geometry.vx = W * 0.5;
  geometry.zEdge = geometry.K / (geometry.edgeY - geometry.horizon);
  geometry.zBottom = geometry.K / (H * 1.2 - geometry.horizon);
  geometry.kR = 150 / cowH; // пикселей текстуры асфальта на мировую единицу
  geometry.kF = 60 / cowH; // … поля
  geometry.obD = geometry.ox + 200 * s - geometry.vx; // смещение доски от камеры — здесь z=1
  geometry.obL = W * 1.45; // шкала схода препятствий к горизонту (шире — входят в кадр крупнее)
  if (oldCowH) {
    // мир в пикселях — пересчитываем всё под новый масштаб
    const k = cowH / oldCowH;
    state.camX *= k;
    state.nextSpawnX *= k;
    for (const f of feats) {
      f.x0 *= k;
      f.x1 *= k;
    }
  }
  cracks.length = 0;
  if (!state.nextSpawnX)
    state.nextSpawnX = state.camX + (W * 1.05 - geometry.vx) + 4 * cowH;
}

/** @returns {number} левый край видимого мира */
export const X0 = () => -W * 0.12;
/** @returns {number} правый край видимого мира */
export const X1 = () => W * 1.12;
