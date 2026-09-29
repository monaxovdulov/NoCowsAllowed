// ---------------------------------------------------------------- utils
export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const easeOutBack = (t) =>
  1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

export function rng(seed) {
  // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function noise1(seed) {
  const r = rng(seed),
    N = 512,
    v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = r() * 2 - 1;
  return (x) => {
    const xf = Math.floor(x),
      f = x - xf,
      i = ((xf % N) + N) % N,
      j = (i + 1) % N;
    return v[i] + (v[j] - v[i]) * f * f * (3 - 2 * f);
  };
}
export const nA = noise1(1),
  nB = noise1(2),
  nC = noise1(3),
  nD = noise1(4),
  nE = noise1(5);
export const fbm = (n, x) =>
  n(x) * 0.6 + n(x * 2.13 + 17.3) * 0.28 + n(x * 4.37 + 41.1) * 0.12;
// createImageBitmap декодирует картинку вне главного потока и рисуется быстрее
export const loadImg = (src) => {
  const plain = () =>
    new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  if (!window.createImageBitmap || !window.fetch) return plain();
  return fetch(src)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
    .catch(plain);
};
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
