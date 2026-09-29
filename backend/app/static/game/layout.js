import { clamp } from './utils.js';
import { cracks, cv, feats, G, S } from './state.js';
import { buildSizeDependent } from './sprites.js';

// ---------------------------------------------------------------- layout
export let W = 1,
  H = 1,
  DPR = 1,
  perfScale = 1; // perfScale — динамическое разрешение под нагрузкой
export function setPerfScale(v) {
  perfScale = v;
}
export const zAt = (y) => G.K / Math.max(1e-3, y - G.horizon);
export const yAt = (z) => G.horizon + G.K / z;
export const xAt = (X, z) => G.vx + (X - S.camX) / z;
export const boardX = () => S.camX + (G.ox + 200 * G.s - G.vx); // центр доски в мире (глубина 1)
// препятствия едут по полосе дороги: у доски z=1, вдали сжимаются к горизонту
export const obZ = (d) => clamp(1 + (d - G.obD) / G.obL, 0.8, G.zEdge * 1.12);
export const obPos = (X) => {
  const d = X - S.camX,
    z = obZ(d);
  return [G.vx + d / z, yAt(z), z];
};

export function layout() {
  const cssW = Math.max(1, innerWidth),
    cssH = Math.max(1, innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2) * perfScale;
  const cap = 2.6e6;
  if (cssW * cssH * dpr * dpr > cap) dpr = Math.sqrt(cap / (cssW * cssH));
  DPR = Math.max(0.5, dpr);
  const oldCowH = G.cowH;
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
  Object.assign(G, {
    s,
    cowH,
    u: cowH / 670,
    ox: cx - 312 * s,
    oy: top - 45 * s,
  });
  G.horizon = G.oy + 200 * s; // линия горизонта как на фото
  G.edgeY = G.oy + 329 * s; // дальний край дороги
  G.refY = G.oy + 537 * s; // линия контакта доски = глубина 1
  G.K = G.refY - G.horizon;
  G.vx = W * 0.5;
  G.zEdge = G.K / (G.edgeY - G.horizon);
  G.zBottom = G.K / (H * 1.2 - G.horizon);
  G.kR = 150 / cowH; // пикселей текстуры асфальта на мировую единицу
  G.kF = 60 / cowH; // … поля
  G.obD = G.ox + 200 * s - G.vx; // смещение доски от камеры — здесь z=1
  G.obL = W * 1.45; // шкала схода препятствий к горизонту (шире — входят в кадр крупнее)
  if (oldCowH) {
    // мир в пикселях — пересчитываем всё под новый масштаб
    const k = cowH / oldCowH;
    S.camX *= k;
    S.nextSpawnX *= k;
    for (const f of feats) {
      if (f.type === 'ramp') {
        f.X0 *= k;
        f.X1 *= k;
      } else f.X *= k;
    }
  }
  cracks.length = 0;
  if (!S.nextSpawnX) S.nextSpawnX = S.camX + (W * 1.05 - G.vx) + 4 * cowH;
  buildSizeDependent();
}

export const X0 = () => -W * 0.12,
  X1 = () => W * 1.12;
