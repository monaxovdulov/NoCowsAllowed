// ---------------------------------------------------------------- utils
export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;
/**
 * @param {number} v
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export const lerp = (a, b, t) => a + (b - a) * t;
/** @param {number} t @returns {number} */
export const smooth = (t) => t * t * (3 - 2 * t);
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export const rand = (a, b) => a + Math.random() * (b - a);
/**
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
/** @param {number} t @returns {number} */
export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** @param {number} t @returns {number} */
export const easeOutBack = (t) =>
  1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

/**
 * @param {number} seed
 * @returns {() => number} mulberry32
 */
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement}
 */
export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
/**
 * @param {number} seed
 * @returns {(x: number) => number}
 */
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
/**
 * @param {(x: number) => number} n
 * @param {number} x
 * @returns {number}
 */
export const fbm = (n, x) =>
  n(x) * 0.6 + n(x * 2.13 + 17.3) * 0.28 + n(x * 4.37 + 41.1) * 0.12;

// ---------------------------------------------------------------- структуры
/**
 * Кольцевой буфер фиксированной ёмкости (карта, этап 6.2): push в хвост
 * и shift с головы — O(1), at(0) — старейший элемент. При переполнении
 * затирается старейший — так hist держит 14 свежих поз без unshift/pop.
 * @template T
 * @param {number} cap ёмкость (> 0)
 * @returns {import('./types').Ring<T>}
 */
export function makeRing(cap) {
  /** @type {unknown[]} */
  const buf = new Array(cap);
  let head = 0,
    size = 0;
  return {
    get length() {
      return size;
    },
    /** @param {number} i @returns {T | undefined} */
    at(i) {
      return i >= 0 && i < size
        ? /** @type {T} */ (buf[(head + i) % cap])
        : undefined;
    },
    /** @param {T} v */
    push(v) {
      if (size === cap) {
        buf[head] = v;
        head = (head + 1) % cap;
      } else {
        buf[(head + size) % cap] = v;
        size++;
      }
    },
    /** @returns {T | undefined} старейший элемент */
    shift() {
      let v;
      if (size) {
        v = /** @type {T} */ (buf[head]);
        buf[head] = undefined;
        head = (head + 1) % cap;
        size--;
      }
      return v;
    },
    clear() {
      buf.fill(undefined);
      head = 0;
      size = 0;
    },
    *[Symbol.iterator]() {
      for (let i = 0; i < size; i++)
        yield /** @type {T} */ (buf[(head + i) % cap]);
    },
  };
}

/**
 * Удаление элементов из горячего массива без аллокаций (карта, этап 6.2):
 * однопроходная компактизация сдвигом влево, порядок сохраняется.
 * @template T
 * @param {T[]} arr
 * @param {(v: T, i: number) => boolean} keep false — выкинуть элемент
 */
export function compactInPlace(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (keep(v, i)) arr[w++] = v;
  }
  arr.length = w;
}
// createImageBitmap декодирует картинку вне главного потока и рисуется быстрее
/**
 * @param {string} src
 * @returns {Promise<CanvasImageSource>}
 */
export const loadImg = (src) => {
  /**
   * @returns {Promise<HTMLImageElement>}
   */
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
/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
