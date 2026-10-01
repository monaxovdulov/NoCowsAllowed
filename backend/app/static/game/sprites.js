import { META } from './assets.js';
import { clamp, lerp, mk, rand, rng, rr, smooth, TAU } from './utils.js';
import { OBS } from './constants.js';
import { bloomEl, bloomG, clouds, cssPost, ctx, geometry } from './state.js';
import { DPR, H, W } from './layout.js';

// ---------------------------------------------------------------- textures
/** @type {import('./types').TextureSize} */
export const RT = { w: 2048, h: 256 };
/** @type {import('./types').TextureSize} */
export const FT = { w: 2048, h: 256 };
/** @type {CanvasPattern} */
export let roadPat;
/** @type {CanvasPattern} */
export let fieldPat;

/**
 * @param {number} w
 * @param {number} h
 * @param {Float32Array} R
 * @param {Float32Array} Gc
 * @param {Float32Array} B
 * @returns {HTMLCanvasElement}
 */
function toCanvas(w, h, R, Gc, B) {
  const c = mk(w, h),
    g = c.getContext('2d'),
    img = g.createImageData(w, h),
    d = img.data;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    d[j] = R[i];
    d[j + 1] = Gc[i];
    d[j + 2] = B[i];
    d[j + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
/**
 * @param {Float32Array} buf
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
function vblur(buf, w, h) {
  const out = new Float32Array(buf.length);
  for (let y = 0; y < h; y++) {
    const a = ((y - 1 + h) % h) * w,
      b = y * w,
      c = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++)
      out[b + x] = buf[a + x] * 0.25 + buf[b + x] * 0.5 + buf[c + x] * 0.25;
  }
  return out;
}

// асфальт: горизонтальные «смазанные» полосы
/** @returns {HTMLCanvasElement} */
function makeRoadTex() {
  const { w, h } = RT,
    r = rng(11),
    L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const off = (r() - 0.5) * 6;
    const row = y * w;
    for (let x = 0; x < w; x++) L[row + x] = off;
    for (let k = 0; k < 64; k++) {
      const x0 = (r() * w) | 0,
        len = (14 + r() * r() * 520) | 0,
        q = r();
      const amp =
        q < 0.06 ? 14 + r() * 20 : q < 0.14 ? -(7 + r() * 9) : (r() - 0.5) * 9;
      for (let i = 0; i < len; i++)
        L[row + ((x0 + i) % w)] += amp * Math.sin((Math.PI * i) / len);
    }
  }
  const Lb = vblur(L, w, h);
  const R = new Float32Array(w * h),
    Gc = new Float32Array(w * h),
    B = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = Lb[i];
    R[i] = 36 + v;
    Gc[i] = 40 + v;
    B[i] = 55 + v * 1.1;
  }
  return toCanvas(w, h, R, Gc, B);
}

// поле: трава, смазанная скоростью
/** @returns {HTMLCanvasElement} */
function makeFieldTex() {
  const { w, h } = FT,
    r = rng(23);
  const pal = [
    [63, 79, 59],
    [77, 94, 73],
    [46, 59, 45],
    [86, 97, 63],
    [104, 108, 70],
    [36, 46, 31],
    [57, 72, 50],
    [70, 84, 62],
  ];
  const R = new Float32Array(w * h),
    Gc = new Float32Array(w * h),
    B = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = r() < 0.07 ? [30, 38, 27] : pal[(r() * pal.length) | 0];
    const o = (r() - 0.5) * 9,
      row = y * w;
    for (let x = 0; x < w; x++) {
      R[row + x] = base[0] + o;
      Gc[row + x] = base[1] + o;
      B[row + x] = base[2] + o * 0.6;
    }
    for (let k = 0; k < 30; k++) {
      const c = pal[(r() * pal.length) | 0],
        x0 = (r() * w) | 0,
        len = (30 + r() * r() * 800) | 0;
      const al = 0.3 + r() * 0.6,
        q = r(),
        br = q < 0.08 ? 1.35 : q < 0.16 ? 0.62 : 1;
      for (let i = 0; i < len; i++) {
        const win = Math.sin((Math.PI * i) / len) * al,
          j = row + ((x0 + i) % w);
        R[j] += (c[0] * br - R[j]) * win;
        Gc[j] += (c[1] * br - Gc[j]) * win;
        B[j] += (c[2] * br - B[j]) * win;
      }
    }
  }
  return toCanvas(w, h, vblur(R, w, h), vblur(Gc, w, h), vblur(B, w, h));
}

// облака: кучевые из пуфов, плоское основание, голубоватая тень снизу
/**
 * @param {number} seed
 * @param {number} w
 * @param {number} h
 * @param {number} n
 * @param {boolean} [flat]
 * @returns {HTMLCanvasElement}
 */
function makeCloud(seed, w, h, n, flat) {
  const r = rng(seed),
    c = mk(w, h),
    g = c.getContext('2d');
  const base = h * (flat ? 0.7 : 0.86);
  const nb = flat ? 4 : 2 + ((r() * 2) | 0),
    bumps = [];
  for (let i = 0; i < nb; i++) {
    bumps.push({
      x: 0.24 + 0.52 * (nb === 1 ? 0.5 : i / (nb - 1)) + (r() - 0.5) * 0.12,
      s: 0.11 + r() * 0.07,
      a: flat ? 0.14 + r() * 0.08 : 0.34 + r() * 0.4,
    });
  }
  const cap = flat ? 0.34 : 0.8;
  const top = (u) => {
    let v = 0;
    for (const b of bumps)
      v += b.a * Math.exp(-((u - b.x) ** 2) / (2 * b.s * b.s));
    const ends =
      smooth(clamp((u - 0.06) / 0.14, 0, 1)) *
      smooth(clamp((0.94 - u) / 0.14, 0, 1));
    return Math.min(v, cap) * ends * h;
  };
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = 0.08 + (0.84 * (i + r())) / n,
      t = top(u);
    if (t < h * 0.07) continue;
    const rad = Math.max(h * 0.06, t * (0.38 + 0.2 * r()));
    const y = base - rad * 0.5 - r() * Math.max(0, t - rad * 1.2);
    puffs.push([u * w, y, rad, 0.72]);
  }
  const m = Math.round(n * 1.2);
  for (let i = 0; i < m; i++) {
    const u = 0.07 + (0.86 * (i + r() * 0.9)) / m,
      t = top(u);
    if (t < h * 0.17) continue;
    const rad =
      h * (0.04 + 0.045 * r()) * (0.7 + 0.9 * Math.min(1, t / (h * 0.45)));
    puffs.push([u * w, base - t + rad * 0.9, rad, 1]);
  }
  puffs.sort((a, b) => b[1] - a[1]);
  for (const [x, y, rad, lit] of puffs) {
    const gr = g.createRadialGradient(
      x - rad * 0.3,
      y - rad * 0.38,
      rad * 0.05,
      x,
      y,
      rad,
    );
    const v = Math.round(234 + 21 * lit);
    gr.addColorStop(0, `rgba(${v},${v},255,1)`);
    gr.addColorStop(0.5, `rgba(${v - 8},${v - 4},255,0.92)`);
    gr.addColorStop(0.78, 'rgba(228,238,252,0.55)');
    gr.addColorStop(1, 'rgba(222,233,250,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  }
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, base - h * 0.42, 0, base);
  sh.addColorStop(0, 'rgba(150,170,206,0)');
  sh.addColorStop(0.5, 'rgba(136,158,198,0.32)');
  sh.addColorStop(1, 'rgba(98,122,172,0.78)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  const small = mk(w / 4, h / 4);
  small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
  const out = mk(w, h),
    og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.globalAlpha = 0.92;
  og.drawImage(small, 0, 0, w, h);
  og.globalAlpha = 0.38;
  og.drawImage(c, 0, 0);
  return out;
}

/**
 * @param {string} color
 * @param {number} [size]
 * @returns {HTMLCanvasElement}
 */
function softDot(color, size = 64) {
  const c = mk(size, size),
    g = c.getContext('2d'),
    h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, color);
  gr.addColorStop(0.45, color.replace(/[\d.]+\)$/, '0.55)'));
  gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
/** @returns {HTMLCanvasElement} */
function lineStrip() {
  const c = mk(256, 4),
    g = c.getContext('2d'),
    gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(236,243,255,0)');
  gr.addColorStop(0.12, 'rgba(236,243,255,1)');
  gr.addColorStop(0.55, 'rgba(236,243,255,0.45)');
  gr.addColorStop(1, 'rgba(236,243,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 1, 256, 2);
  return c;
}

// ---------------------------------------------------------------- obstacle sprites (рисуются один раз)
export const OBR = 520; // пикселей спрайта на рост коровы
/** @type {import('./types').ObstacleSprites} */
export const obSprites = {};
/**
 * @param {number} w ширина в ростах коровы
 * @param {number} h высота в ростах коровы
 * @param {(g: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @returns {import('./types').ObstacleSprite}
 */
function sprite(w, h, draw) {
  const pad = 8;
  const c = /** @type {import('./types').ObstacleSprite} */ (
    mk(w * OBR + pad * 2, h * OBR + pad * 2)
  );
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.translate(pad, pad);
  draw(g, w * OBR, h * OBR);
  c.pad = pad;
  return c;
}
/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} w
 * @param {number} h
 */
function coneTo(g, w, h) {
  const cx = w / 2,
    baseH = h * 0.08,
    bodyB = h - baseH * 0.55,
    tw = w * 0.14,
    bw = w * 0.78;
  rr(g, 0, h - baseH, w, baseH, baseH * 0.3);
  g.fillStyle = '#1b1d22';
  g.fill();
  const body = () => {
    g.beginPath();
    g.moveTo(cx - tw / 2, h * 0.03);
    g.lineTo(cx + tw / 2, h * 0.03);
    g.lineTo(cx + bw / 2, bodyB);
    g.lineTo(cx - bw / 2, bodyB);
    g.closePath();
  };
  const lg = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  lg.addColorStop(0, '#ff9a4a');
  lg.addColorStop(0.35, '#ff7a1f');
  lg.addColorStop(0.72, '#e2560c');
  lg.addColorStop(1, '#a93d06');
  body();
  g.fillStyle = lg;
  g.fill();
  g.save();
  body();
  g.clip();
  const sg = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.6, '#e9edf3');
  sg.addColorStop(1, '#aab1bc');
  g.fillStyle = sg;
  g.fillRect(0, h * 0.27, w, h * 0.11);
  g.fillRect(0, h * 0.53, w, h * 0.12);
  g.restore();
  g.fillStyle = '#c64a0a';
  g.fillRect(cx - tw / 2, h * 0.02, tw, h * 0.03);
}
// Таблица рисовальщиков препятствий — ключи 1:1 с OBS (карта, этап 5):
// новый вид препятствия = запись в OBS + запись здесь.
/** @type {Record<import('./types').ObstacleKind, (g: CanvasRenderingContext2D, w: number, h: number) => void>} */
const OB_PAINT = {
  cone: coneTo,
  cones: (g, w, h) => {
    const cw = OBS.cone.w * OBR;
    for (const f of [0, 0.5, 1]) {
      g.save();
      g.translate(f * (w - cw), 0);
      coneTo(g, cw, h);
      g.restore();
    }
  },
  hay: (g, w, h) => {
    const r = rng(71),
      fy = h * 0.2,
      fw = w * 0.93;
    g.beginPath();
    g.moveTo(w * 0.02, fy);
    g.lineTo(w * 0.09, 0);
    g.lineTo(w, 0);
    g.lineTo(fw, fy);
    g.closePath();
    g.fillStyle = '#e8c56c';
    g.fill();
    rr(g, 0, fy, fw, h - fy, h * 0.07);
    const lg = g.createLinearGradient(0, fy, 0, h);
    lg.addColorStop(0, '#d9ac45');
    lg.addColorStop(1, '#8f6a22');
    g.fillStyle = lg;
    g.fill();
    g.save();
    rr(g, 0, fy, fw, h - fy, h * 0.07);
    g.clip();
    const cols = [
      'rgba(246,219,130,.75)',
      'rgba(180,134,48,.7)',
      'rgba(232,196,98,.7)',
      'rgba(128,92,30,.6)',
    ];
    for (let i = 0; i < 520; i++) {
      const x = r() * fw,
        y = fy + r() * (h - fy),
        a = (r() - 0.5) * 0.9,
        l = 5 + r() * 14;
      g.strokeStyle = cols[(r() * cols.length) | 0];
      g.lineWidth = 1 + r() * 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.restore();
    g.fillStyle = 'rgba(92,60,20,.85)';
    for (const f of [0.3, 0.7]) {
      g.fillRect(fw * f - 3, fy, 6, h - fy);
      g.beginPath();
      g.moveTo(fw * f - 3, fy);
      g.lineTo(fw * f + w * 0.07 - 3, 0);
      g.lineTo(fw * f + w * 0.07 + 3, 0);
      g.lineTo(fw * f + 3, fy);
      g.closePath();
      g.fill();
    }
  },
  tire: (g, w, h) => {
    const cx = w / 2,
      cy = h / 2,
      R = h / 2,
      r1 = R * 0.58;
    const rg = g.createRadialGradient(
      cx - R * 0.3,
      cy - R * 0.3,
      R * 0.2,
      cx,
      cy,
      R,
    );
    rg.addColorStop(0, '#3a3c42');
    rg.addColorStop(1, '#141518');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = R * 0.07;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      g.lineTo(cx + Math.cos(a) * R * 0.99, cy + Math.sin(a) * R * 0.99);
      g.stroke();
    }
    const mg = g.createRadialGradient(
      cx - r1 * 0.3,
      cy - r1 * 0.3,
      0,
      cx,
      cy,
      r1,
    );
    mg.addColorStop(0, '#f1f3f6');
    mg.addColorStop(0.7, '#a7aeb8');
    mg.addColorStop(1, '#6c737d');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(cx, cy, r1, 0, TAU);
    g.fill();
    g.fillStyle = '#4c525b';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - 1.57;
      g.beginPath();
      g.arc(
        cx + Math.cos(a) * r1 * 0.55,
        cy + Math.sin(a) * r1 * 0.55,
        r1 * 0.1,
        0,
        TAU,
      );
      g.fill();
    }
    g.fillStyle = '#d9dde3';
    g.beginPath();
    g.arc(cx, cy, r1 * 0.22, 0, TAU);
    g.fill();
  },
  can: (g, w, h) => {
    const metal = (x0, x1) => {
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, '#89939f');
      lg.addColorStop(0.25, '#f3f6f9');
      lg.addColorStop(0.5, '#c4cbd4');
      lg.addColorStop(0.85, '#7d8692');
      lg.addColorStop(1, '#5b636e');
      return lg;
    };
    const bodyTop = h * 0.38,
      neckTop = h * 0.13;
    rr(g, w * 0.04, bodyTop, w * 0.92, h - bodyTop, w * 0.08);
    g.fillStyle = metal(w * 0.04, w * 0.96);
    g.fill();
    g.beginPath();
    g.moveTo(w * 0.3, neckTop + h * 0.09);
    g.lineTo(w * 0.7, neckTop + h * 0.09);
    g.lineTo(w * 0.96, bodyTop + h * 0.02);
    g.lineTo(w * 0.04, bodyTop + h * 0.02);
    g.closePath();
    g.fillStyle = metal(w * 0.04, w * 0.96);
    g.fill();
    g.fillStyle = metal(w * 0.3, w * 0.7);
    g.fillRect(w * 0.3, neckTop, w * 0.4, h * 0.1);
    rr(g, w * 0.22, neckTop - h * 0.05, w * 0.56, h * 0.06, h * 0.015);
    g.fillStyle = metal(w * 0.22, w * 0.78);
    g.fill();
    g.fillStyle = '#6b737e';
    g.fillRect(w * 0.43, neckTop - h * 0.09, w * 0.14, h * 0.045);
    g.fillStyle = 'rgba(58,64,74,.45)';
    g.fillRect(w * 0.04, h * 0.56, w * 0.92, h * 0.02);
    g.fillRect(w * 0.04, h * 0.88, w * 0.92, h * 0.02);
    g.strokeStyle = '#737c88';
    g.lineWidth = w * 0.06;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(
      w * 0.16,
      neckTop + h * 0.16,
      w * 0.12,
      Math.PI * 0.55,
      Math.PI * 1.45,
    );
    g.stroke();
    g.beginPath();
    g.arc(
      w * 0.84,
      neckTop + h * 0.16,
      w * 0.12,
      -Math.PI * 0.45,
      Math.PI * 0.45,
    );
    g.stroke();
  },
  barrier: (g, w, h) => {
    g.strokeStyle = '#3a3f49';
    g.lineWidth = w * 0.035;
    g.lineCap = 'round';
    for (const lx of [0.16, 0.84]) {
      g.beginPath();
      g.moveTo(w * (lx - 0.08), h);
      g.lineTo(w * lx, h * 0.3);
      g.lineTo(w * (lx + 0.08), h);
      g.stroke();
    }
    const by = h * 0.24,
      bh = h * 0.22;
    g.save();
    rr(g, 0, by, w, bh, bh * 0.2);
    g.clip();
    g.fillStyle = '#f4f5f7';
    g.fillRect(0, by, w, bh);
    g.fillStyle = '#d8262c';
    for (let x = -bh * 2; x < w + bh; x += bh * 1.2) {
      g.beginPath();
      g.moveTo(x, by + bh);
      g.lineTo(x + bh * 0.6, by + bh);
      g.lineTo(x + bh * 1.6, by);
      g.lineTo(x + bh, by);
      g.closePath();
      g.fill();
    }
    const lg = g.createLinearGradient(0, by, 0, by + bh);
    lg.addColorStop(0, 'rgba(255,255,255,.25)');
    lg.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = lg;
    g.fillRect(0, by, w, bh);
    g.restore();
    g.fillStyle = '#2b2e35';
    g.fillRect(w * 0.47, by - h * 0.08, w * 0.06, h * 0.08);
    const lamp = g.createRadialGradient(
      w * 0.5,
      by - h * 0.11,
      0,
      w * 0.5,
      by - h * 0.11,
      h * 0.09,
    );
    lamp.addColorStop(0, '#fff3b0');
    lamp.addColorStop(0.5, '#ffb81c');
    lamp.addColorStop(1, 'rgba(255,184,28,0)');
    g.fillStyle = lamp;
    g.beginPath();
    g.arc(w * 0.5, by - h * 0.11, h * 0.09, 0, TAU);
    g.fill();
  },
};
function buildObSprites() {
  for (const kind of /** @type {import('./types').ObstacleKind[]} */ (
    Object.keys(OB_PAINT)
  ))
    obSprites[kind] = sprite(OBS[kind].w, OBS[kind].h, OB_PAINT[kind]);
}

// ---------------------------------------------------------------- size-dependent buffers
/** @type {HTMLCanvasElement} */
export let skyCv;
/** @type {HTMLCanvasElement} */
export let vigCv;
/** @type {HTMLCanvasElement} */
export let bA;
/** @type {HTMLCanvasElement} */
export let bB;
/** @type {HTMLCanvasElement} */
export let bC;
/** @type {CanvasRenderingContext2D} */
export let bAg;
/** @type {CanvasRenderingContext2D} */
export let bBg;
/** @type {CanvasRenderingContext2D} */
export let bCg;
/** @type {CanvasPattern[]} */
export let grainPats = [];
/** @type {HTMLCanvasElement[]} */
export let grainTiles = [];

// небо уходит высоко вверх: камера поднимается за коровой на трамплинах
function buildSky() {
  geometry.skyOff = Math.ceil(H * 1.05);
  const oY = geometry.skyOff;
  const sh = Math.max(4, Math.ceil(geometry.horizon + oY + 6 * DPR));
  skyCv = mk(W * 1.24, sh);
  const g = skyCv.getContext('2d'),
    sw = skyCv.width;
  const total = oY + geometry.horizon,
    f = (y) => clamp(y / total, 0, 1);
  const lg = g.createLinearGradient(0, 0, 0, total);
  lg.addColorStop(0, '#244a9a');
  lg.addColorStop(f(oY), '#4673c6');
  lg.addColorStop(f(oY + geometry.horizon * 0.45), '#6792d9');
  lg.addColorStop(f(oY + geometry.horizon * 0.82), '#98b9e8');
  lg.addColorStop(1, '#bcd0ec');
  g.fillStyle = lg;
  g.fillRect(0, 0, sw, sh);
  const sun = g.createRadialGradient(
    sw * 0.1,
    oY - geometry.horizon * 0.25,
    0,
    sw * 0.1,
    oY - geometry.horizon * 0.25,
    sw * 0.75,
  );
  sun.addColorStop(0, 'rgba(255,252,240,0.38)');
  sun.addColorStop(1, 'rgba(255,252,240,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, sw, sh);
  const dark = g.createLinearGradient(
    sw,
    oY,
    sw * 0.45,
    oY + geometry.horizon * 0.6,
  );
  dark.addColorStop(0, 'rgba(22,40,92,0.3)');
  dark.addColorStop(1, 'rgba(22,40,92,0)');
  g.fillStyle = dark;
  g.fillRect(0, 0, sw, sh);
  const r = rng(5);
  for (let i = 0; i < 11; i++) {
    const x = r() * sw,
      y =
        oY +
        geometry.horizon * (0.08 + r() * 0.55) -
        (i > 6 ? r() * oY * 0.8 : 0);
    const rx = sw * (0.08 + r() * 0.16),
      ry = geometry.horizon * (0.012 + r() * 0.02);
    g.save();
    g.translate(x, y);
    g.scale(rx, ry);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    cg.addColorStop(0, `rgba(235,242,252,${0.22 + r() * 0.2})`);
    cg.addColorStop(1, 'rgba(235,242,252,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.fill();
    g.restore();
  }
}

// виньетка + тёмный правый низ, как на фото (при DOM-посте её рисует CSS-слой .vig)
function buildVignette() {
  if (cssPost) {
    vigCv = null;
    return;
  }
  vigCv = mk(W, H);
  const v = vigCv.getContext('2d'),
    R = Math.hypot(W, H) * 0.5;
  const rg = v.createRadialGradient(
    W * 0.47,
    H * 0.45,
    R * 0.3,
    W * 0.47,
    H * 0.45,
    R * 1.08,
  );
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(0.62, 'rgba(6,8,20,0.26)');
  rg.addColorStop(1, 'rgba(3,4,12,0.72)');
  v.fillStyle = rg;
  v.fillRect(0, 0, W, H);
  const br = v.createLinearGradient(W * 0.5, H * 0.45, W, H);
  br.addColorStop(0, 'rgba(0,0,0,0)');
  br.addColorStop(1, 'rgba(2,3,8,0.5)');
  v.fillStyle = br;
  v.fillRect(0, 0, W, H);
  const tl = v.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, H) * 0.55);
  tl.addColorStop(0, 'rgba(255,246,225,0.10)');
  tl.addColorStop(1, 'rgba(255,246,225,0)');
  v.fillStyle = tl;
  v.fillRect(0, 0, W, H);
}

// буферы свечения
function buildGlowBuffers() {
  bA = mk(W / 4, H / 4);
  bB = mk(W / 16, H / 16);
  bAg = bA.getContext('2d');
  bBg = bB.getContext('2d');
  if (bloomG) {
    bloomEl.width = Math.max(1, W >> 2);
    bloomEl.height = Math.max(1, H >> 2);
    bloomG.imageSmoothingQuality = 'high';
    bC = null;
    bCg = null;
  } else {
    bC = mk(W / 4, H / 4);
    bCg = bC.getContext('2d');
    bCg.imageSmoothingQuality = 'high';
  }
}

// статичные градиенты земли — зависят только от геометрии кадра
function buildGroundGrads() {
  const yEnd = H * 1.2;
  geometry.hg = ctx.createLinearGradient(
    0,
    geometry.horizon,
    0,
    geometry.edgeY,
  );
  geometry.hg.addColorStop(0, 'rgba(160,180,210,0.86)');
  geometry.hg.addColorStop(0.18, 'rgba(128,148,178,0.45)');
  geometry.hg.addColorStop(0.6, 'rgba(90,106,130,0.12)');
  geometry.hg.addColorStop(1, 'rgba(60,70,90,0)');
  geometry.rg = ctx.createLinearGradient(0, geometry.edgeY, 0, yEnd);
  const mid = clamp(
    (geometry.refY - geometry.cowH * 0.12 - geometry.edgeY) /
      (yEnd - geometry.edgeY),
    0.05,
    0.95,
  );
  geometry.rg.addColorStop(0, 'rgba(96,120,150,0.42)');
  geometry.rg.addColorStop(mid * 0.7, 'rgba(60,76,100,0.14)');
  geometry.rg.addColorStop(mid, 'rgba(0,0,0,0)');
  geometry.rg.addColorStop(1, 'rgba(4,5,10,0.5)');
}

// зерно
function buildGrain() {
  grainPats = [];
  grainTiles = [];
  for (let k = 0; k < 3; k++) {
    const c = mk(160, 160),
      gg = c.getContext('2d'),
      img = gg.createImageData(160, 160),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const q = 128 + (Math.random() - 0.5) * 150;
      d[i] = d[i + 1] = d[i + 2] = q;
      d[i + 3] = 255;
    }
    gg.putImageData(img, 0, 0);
    grainTiles.push(c);
    grainPats.push(ctx.createPattern(c, 'repeat'));
  }
}

export function buildSizeDependent() {
  buildSky();
  buildVignette();
  buildGlowBuffers();
  buildGroundGrads();
  buildGrain();
}

/** @type {import('./types').CowImages} */
export let imgs;
/** @type {HTMLCanvasElement} */
export let ghostCv;
/** @type {HTMLCanvasElement} */
export let streakCv;
/** @type {import('./types').Streak[]} */
export let streaks = [];
/** @type {HTMLCanvasElement} */
export let dustImg;
/** @type {HTMLCanvasElement} */
export let woodImg;
/** @type {HTMLCanvasElement} */
export let lineImg;
/** @type {HTMLCanvasElement} */
export let shadowImg;
/** @type {HTMLCanvasElement} */
export let glowImg;

// мягкая тень — один спрайт вместо радиального градиента на каждый кадр
/** @returns {HTMLCanvasElement} */
function makeShadow() {
  const c = mk(128, 128),
    g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(3,4,9,1)');
  gr.addColorStop(0.55, 'rgba(3,4,9,0.55)');
  gr.addColorStop(1, 'rgba(3,4,9,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}
export const GHOST_BLUR = 40;

function buildCowCaches() {
  const b = META.base;
  const full = mk(b.w, b.h),
    g = full.getContext('2d');
  g.drawImage(imgs.board, META.board.x - b.x, META.board.y - b.y);
  g.drawImage(imgs.base, 0, 0);
  g.drawImage(imgs.ear, META.ear.x - b.x, META.ear.y - b.y);
  g.drawImage(imgs.tag, META.tag.x - b.x, META.tag.y - b.y);

  // размытая копия для призрачного шлейфа (смаз только назад)
  ghostCv = mk(b.w + GHOST_BLUR, b.h);
  const gg = ghostCv.getContext('2d'),
    n = 12;
  gg.globalCompositeOperation = 'lighter';
  gg.globalAlpha = 1 / n;
  for (let i = 0; i < n; i++)
    gg.drawImage(full, GHOST_BLUR - (i * GHOST_BLUR) / (n - 1), 0);

  // полосы смаза от заднего края силуэта (как размытый зад коровы на фото)
  try {
    const d = g.getImageData(0, 0, b.w, b.h).data;
    for (let y = 0; y < b.h; y += 2) {
      let x0 = -1;
      for (let x = 0; x < b.w; x++)
        if (d[(y * b.w + x) * 4 + 3] > 115) {
          x0 = x;
          break;
        }
      if (x0 < 0) continue;
      let r = 0,
        gr = 0,
        bl = 0,
        k = 0;
      for (let x = x0; x < Math.min(b.w, x0 + 8); x++) {
        const i = (y * b.w + x) * 4;
        if (d[i + 3] > 100) {
          r += d[i];
          gr += d[i + 1];
          bl += d[i + 2];
          k++;
        }
      }
      if (!k) continue;
      const sy = y + b.y;
      const wgt = sy < 150 ? 0.32 : sy < 470 ? 1 : 0.6;
      streaks.push({
        x: x0 + b.x + 4,
        y: sy,
        c: [(r / k) | 0, (gr / k) | 0, (bl / k) | 0],
        w: wgt * (0.6 + Math.random() * 0.4),
        f: rand(2.5, 9),
        ph: rand(0, TAU),
        base: rand(0.55, 1),
      });
    }
    streakCv = mk(128, streaks.length * 4);
    const sg = streakCv.getContext('2d');
    streaks.forEach((s, i) => {
      const [r, gg2, bb] = s.c;
      const lg = sg.createLinearGradient(0, 0, 128, 0);
      lg.addColorStop(0, `rgba(${r},${gg2},${bb},0)`);
      lg.addColorStop(0.72, `rgba(${r},${gg2},${bb},0.5)`);
      lg.addColorStop(1, `rgba(${r},${gg2},${bb},1)`);
      sg.fillStyle = lg;
      sg.fillRect(0, i * 4, 128, 4);
    });
  } catch (error) {
    // B4: getImageData может кинуть (tainted canvas) — не глотаем молча
    console.warn('полосы смаза отключены:', error);
    streaks = [];
  }
}

export function initClouds() {
  const r = rng(99);
  const sprites = [
    makeCloud(1, 900, 330, 46),
    makeCloud(2, 700, 260, 36),
    makeCloud(3, 520, 200, 28),
    makeCloud(4, 380, 150, 20),
    makeCloud(6, 1100, 260, 52, true),
    makeCloud(7, 620, 240, 32),
    makeCloud(8, 460, 170, 24),
    makeCloud(9, 820, 220, 40, true),
  ];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const depth = clamp((i / (N - 1)) * 0.9 + r() * 0.12, 0, 1); // 0 — высоко и близко, 1 — у горизонта
    clouds.push({
      img: sprites[(i * 5) % sprites.length],
      x: r(),
      gap: 0.1 + r() * 0.8,
      yN: 0.03 + depth * 0.8,
      scale: lerp(1.3, 0.3, depth) * (0.8 + r() * 0.4),
      par: lerp(0.012, 0.0025, depth),
      drift: lerp(0.018, 0.005, depth),
      alpha: lerp(1, 0.7, depth),
    });
  }
  for (let i = 0; i < 7; i++) {
    // облака выше кадра — видны, когда камера взлетает
    clouds.push({
      img: sprites[(i * 3 + 1) % sprites.length],
      x: r(),
      gap: 0.2 + r() * 0.8,
      yN: -0.15 - r() * 1.2,
      scale: 1.2 + r() * 0.5,
      par: 0.014,
      drift: 0.02,
      alpha: 1,
    });
  }
  clouds.sort((a, b) => b.yN - a.yN);
}

/** @param {import('./types').CowImages} loaded декодированные слои коровы */
export function initAssets(loaded) {
  imgs = loaded;
  roadPat = ctx.createPattern(makeRoadTex(), 'repeat');
  fieldPat = ctx.createPattern(makeFieldTex(), 'repeat');
  dustImg = softDot('rgba(170,166,164,1)');
  woodImg = softDot('rgba(186,140,86,1)');
  glowImg = softDot('rgba(255,214,90,1)');
  lineImg = lineStrip();
  buildObSprites();
  buildCowCaches();
}
export function initShadow() {
  shadowImg = makeShadow();
}
