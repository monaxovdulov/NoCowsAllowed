import { META } from './assets.js';
import { clamp, DEG, fbm, nA, nC, nE, TAU } from './utils.js';
import {
  bloomEl, bloomG, CAM, canPatternTransform, clouds, ctx, cv, G, grainEl, PM, reduce, S,
} from './state.js';
import { boardX, DPR, H, W, X0, X1, xAt, yAt } from './layout.js';
import {
  bA, bAg, bB, bBg, bC, bCg, fieldPat, FT, GHOST_BLUR, ghostCv, grainPats, imgs, roadPat, RT,
  shadowImg, skyCv, streakCv, streaks, vigCv,
} from './sprites.js';
import { boardMatrix, curPose, poseMatrix, vib } from './player.js';
import { drawFeatures, drawFlying, drawMarkers, drawWarnings, groundInfo } from './features.js';
import { drawCracks, drawLines, drawParticles, drawPops } from './effects.js';
import { hud } from './ui.js';

function setT(m) {
  const c = CAM.multiply(m);
  ctx.setTransform(c.a, c.b, c.c, c.d, c.e, c.f);
}
function setCam() { ctx.setTransform(CAM.a, CAM.b, CAM.c, CAM.d, CAM.e, CAM.f); }

function drawSky() {
  // рисуем только видимый кусок неба — верх картинки почти всегда за кадром
  const inv = CAM.inverse(), pad = 16 * DPR;
  const p0 = inv.transformPoint(new DOMPoint(0, 0));
  const p1 = inv.transformPoint(new DOMPoint(W, H));
  const sx = clamp(p0.x + W * 0.12 - pad, 0, skyCv.width);
  const sy = clamp(p0.y + G.skyOff - pad, 0, skyCv.height);
  const sw = clamp(p1.x - p0.x + pad * 2, 0, skyCv.width - sx);
  const sh = clamp(p1.y - p0.y + pad * 2, 0, skyCv.height - sy);
  if (sw > 1 && sh > 1) ctx.drawImage(skyCv, sx, sy, sw, sh, sx - W * 0.12, sy - G.skyOff, sw, sh);
  for (const c of clouds) {
    const sc = c.scale * G.u * 1.05;
    const w = c.img.width * sc, h = c.img.height * sc;
    const LW = W * 1.24 + w + c.gap * W;           // у каждого облака свой цикл — небо не пустеет
    const x = ((((c.x % 1) + 1) % 1) * LW) - w - W * 0.12;
    const y = G.horizon * c.yN - h * 0.6;
    if (x + w < -W * 0.15 || x > W * 1.15 || y + h < -0.8 * G.cowH || y > H + 0.4 * G.cowH) continue;
    ctx.globalAlpha = c.alpha;
    ctx.drawImage(c.img, x, y, w, h);
  }
  ctx.globalAlpha = 1;
}

function ridge(color, par, amp0, amp1, freq, seedFn, offY) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const x0 = X0(), x1 = X1(), step = Math.max(4, 8 * DPR);
  ctx.moveTo(x0, G.horizon + 3);
  for (let x = x0; x <= x1 + step; x += step) {
    const wx = (x + S.camX * par) / (G.cowH * freq);
    const hh = (amp0 + amp1 * (fbm(seedFn, wx) * 0.5 + 0.5)) * G.cowH;
    ctx.lineTo(x, G.horizon - hh + offY);
  }
  ctx.lineTo(x1 + step, G.horizon + 3);
  ctx.closePath(); ctx.fill();
}

function drawGround() {
  const hz = G.horizon, K = G.K, x0 = X0(), x1 = X1(), yEnd = H * 1.2;
  const bMin = Math.max(1, Math.round(1.5 * DPR));
  const zFar = 18, yTex = hz + K / zFar;
  ctx.fillStyle = '#7e90ab';
  ctx.fillRect(x0, hz - 1, x1 - x0, yTex - hz + 2);
  if (!canPatternTransform) {
    const g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#5b6c62'); g.addColorStop((G.edgeY - hz) / (H - hz) - 0.001, '#3c4a3a');
    g.addColorStop((G.edgeY - hz) / (H - hz), '#3a4658'); g.addColorStop(1, '#1b1e2b');
    ctx.fillStyle = g; ctx.fillRect(x0, yTex, x1 - x0, yEnd - yTex);
    return;
  }
  const uR = (((S.camX * G.kR) % RT.w) + RT.w) % RT.w;
  const uF = (((S.camX * G.kF) % FT.w) + FT.w) % FT.w;
  const bMax = Math.max(bMin, Math.round(22 * DPR));
  // полосы растут к низу: ошибка линейной аппроксимации проекции ≈ band²/(4(y−hz)) px
  // — держим её субпиксельной (≤0.3px), поэтому кадр рисует ~50 полос вместо сотен
  for (let y = Math.floor(yTex); y < yEnd;) {
    const bnd = clamp(Math.round(Math.sqrt(1.2 * (y - hz))), bMin, bMax);
    const zA = K / (y - hz), zB = K / (y + bnd - hz), z = (zA + zB) * 0.5;
    const road = y + bnd * 0.5 >= G.edgeY;
    const k = road ? G.kR : G.kF, kv = road ? 110 : 34;
    const T = road ? RT : FT, pat = road ? roadPat : fieldPat, u0 = road ? uR : uF;
    const a = 1 / (k * z), vA = zA * kv, vB = zB * kv;
    const d = bnd / (vB - vA);
    PM.a = a; PM.b = 0; PM.c = 0; PM.d = d; PM.e = G.vx - u0 * a; PM.f = y - d * (vA % T.h);
    pat.setTransform(PM);
    ctx.fillStyle = pat;
    ctx.fillRect(x0, y, x1 - x0, bnd);
    y += bnd;
  }
}

function drawGroundOverlays() {
  const hz = G.horizon, x0 = X0(), x1 = X1(), w = x1 - x0, yEnd = H * 1.2;
  const fh = G.edgeY - hz;
  ctx.fillStyle = G.hg; ctx.fillRect(x0, hz - 1, w, fh + 2);
  ctx.fillStyle = G.rg; ctx.fillRect(x0, G.edgeY, w, yEnd - G.edgeY);
  const zE = G.zEdge;
  const yS0 = yAt(zE * 1.07), yS1 = G.edgeY;
  ctx.fillStyle = 'rgba(92,90,80,0.5)'; ctx.fillRect(x0, yS0, w, yS1 - yS0);
  const yL = yAt(zE * 0.975), th = Math.max(1, 0.011 * G.cowH / zE);
  ctx.fillStyle = 'rgba(214,220,228,0.32)'; ctx.fillRect(x0, yL - th / 2, w, th);
}

function repeatAt(z, P, off, fn) {
  const k0 = Math.floor((S.camX + (X0() - G.vx) * z - off) / P) - 1;
  const k1 = Math.ceil((S.camX + (X1() - G.vx) * z - off) / P) + 1;
  for (let k = k0; k <= k1; k++) fn(k, xAt(k * P + off, z));
}

function drawDashes() {
  const z = 1.72, yC = yAt(z), hh = Math.max(1.5, G.K * 0.05 / (z * z));
  const V = S.speed * G.cowH, blur = V / z / 40, L = 2.3 * G.cowH / z;
  repeatAt(z, 6.2 * G.cowH, 0, (k, x) => {
    const xa = x - blur / 2, xb = x + L + blur / 2;
    if (xb < X0() || xa > X1()) return;
    const f = clamp(blur / (xb - xa), 0.001, 0.49);
    const g = ctx.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, 'rgba(218,222,228,0)'); g.addColorStop(f, 'rgba(218,222,228,0.42)');
    g.addColorStop(1 - f, 'rgba(218,222,228,0.42)'); g.addColorStop(1, 'rgba(218,222,228,0)');
    ctx.fillStyle = g; ctx.fillRect(xa, yC - hh / 2, xb - xa, hh);
  });
}

function drawPoles() {
  const z = G.zEdge * 2.05, yb = yAt(z);
  const V = S.speed * G.cowH, blur = V / z / 45;
  const h = 2.2 * G.cowH / z, w = 0.05 * G.cowH / z, P = 7.6 * G.cowH;
  const top = yb - h, sag = 0.1 * G.cowH / z;
  ctx.strokeStyle = 'rgba(38,48,66,0.5)'; ctx.lineWidth = Math.max(1, 0.8 * DPR);
  const xs = [];
  repeatAt(z, P, P * 0.37, (k, x) => xs.push(x));
  for (let j = 0; j < 2; j++) {
    const yy = top + h * (0.04 + j * 0.05);
    ctx.beginPath();
    for (let i = 0; i + 1 < xs.length; i++) {
      ctx.moveTo(xs[i], yy);
      ctx.quadraticCurveTo((xs[i] + xs[i + 1]) / 2, yy + sag * 2, xs[i + 1], yy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#3f4b62';
  const al = clamp((w / (w + blur)) * 1.5, 0.25, 1);
  for (const x of xs) {
    ctx.globalAlpha = al;
    ctx.fillRect(x - (w + blur) / 2, top, w + blur, h);
    ctx.fillRect(x - (w * 3.2 + blur) / 2, top + h * 0.03, w * 3.2 + blur, Math.max(1, w * 0.5));
  }
  ctx.globalAlpha = 1;
}

function drawPosts() {
  const z = G.zEdge * 0.985, yb = yAt(z);
  const V = S.speed * G.cowH, blur = V / z / 45;
  const h = 0.16 * G.cowH / z, w = 0.02 * G.cowH / z;
  const al = clamp((w / (w + blur)) * 1.6, 0.18, 0.85);
  repeatAt(z, 3.7 * G.cowH, 0.8 * G.cowH, (k, x) => {
    const xl = x - (w + blur) / 2, ww = w + blur;
    ctx.globalAlpha = al;
    ctx.fillStyle = '#e4e8ee'; ctx.fillRect(xl, yb - h, ww, h);
    ctx.fillStyle = '#16181e'; ctx.fillRect(xl, yb - h, ww, h * 0.26);
    ctx.fillStyle = '#ff9a3c'; ctx.fillRect(xl, yb - h * 0.2, ww, h * 0.06);
  });
  ctx.globalAlpha = 1;
}

function drawShadow() {
  const g = S.crash ? 0 : groundInfo(boardX()).h;
  const m = poseMatrix({ y: S.bob + vib() - g, tilt: S.onRamp ? S.tilt : S.tilt * 0.5, sq: 1 });
  const a = m.transformPoint(new DOMPoint(80, 488)), b = m.transformPoint(new DOMPoint(318, 598));
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.62, wid = 0.05 * G.cowH;
  const k = 1 - clamp((S.h - g) / 0.5, 0, 0.7);
  const draw = (sx, sy, al) => {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x)); ctx.scale(sx / 64, sy / 64);
    ctx.globalAlpha = al; ctx.drawImage(shadowImg, -64, -64);
    ctx.restore();
  };
  setCam();
  draw(len * 1.25 * k, wid * 2.4 * k, 0.32 * k);
  draw(len * k, wid * k, 0.7 * k);
}

function star(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawCow() {
  const pose = curPose(), m = poseMatrix(pose);
  const sp = clamp(S.spdN, 0.5, 2);
  const busy = S.trick || S.crash || Math.abs(S.roll) > 0.01;
  // полосы смаза
  if (streaks.length && streakCv) {
    setT(m);
    const t = S.t, fade = busy ? 0.25 : 1;
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      const len = (60 + 150 * s.w * s.base) * (0.45 + 0.55 * sp) * (0.62 + 0.38 * Math.sin(t * s.f + s.ph));
      ctx.globalAlpha = clamp((0.1 + 0.2 * s.w) * (0.55 + 0.45 * sp), 0, 0.6) * fade;
      ctx.drawImage(streakCv, 0, i * 4 + 1, 128, 2, s.x - len, s.y - 1.2, len, 2.6);
    }
  }
  // призраки
  const GN = 4, spacing = (0.05 + 0.035 * S.boost) * G.cowH * sp;
  for (let i = GN; i >= 1; i--) {
    const h = S.hist[Math.min(S.hist.length - 1, i * 2)];
    if (!h) continue;
    setT(poseMatrix({ ...h, x: -i * spacing }));
    ctx.globalAlpha = 0.2 * (1 - i / (GN + 1)) * (0.55 + 0.45 * sp) * (busy ? 0.4 : 1);
    ctx.drawImage(ghostCv, META.base.x - GHOST_BLUR, META.base.y);
  }
  ctx.globalAlpha = 1;
  // доска, потом корова поверх (копыта стоят на деке)
  setT(boardMatrix(m));
  ctx.drawImage(imgs.board, META.board.x, META.board.y);
  setT(m);
  ctx.drawImage(imgs.base, META.base.x, META.base.y);
  const ep = META.ear.pivot;
  setT(m.translate(ep[0], ep[1]).rotate(S.ear * DEG).translate(-ep[0], -ep[1]));
  ctx.drawImage(imgs.ear, META.ear.x, META.ear.y);
  const tp = META.tag.pivot;
  setT(m.translate(tp[0], tp[1]).rotate((S.tag - S.tilt) * DEG).translate(-tp[0], -tp[1]));
  ctx.drawImage(imgs.tag, META.tag.x, META.tag.y);
  // звёздочки над головой после падения
  const c = S.crash;
  if (c && c.t > 0.3) {
    setCam();
    const hm = poseMatrix({ y: S.bob - S.h, tilt: S.tilt, sq: S.sq });
    const hp = hm.transformPoint(new DOMPoint(430, 30));
    const a = clamp((c.dur - c.t) / 0.3, 0, 1) * clamp((c.t - 0.3) / 0.15, 0, 1);
    ctx.globalAlpha = a; ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = 'rgba(60,40,0,.7)';
    ctx.lineWidth = Math.max(1, 1.5 * G.u); ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const an = S.t * 7 + i * TAU / 3;
      star(hp.x + Math.cos(an) * 0.13 * G.cowH, hp.y + Math.sin(an) * 0.035 * G.cowH, 0.03 * G.cowH);
    }
    ctx.globalAlpha = 1;
  }
}

let grainFlip = 0;
function post() {
  // свечение: даунсэмпл → ^4 (оставляем светлое) → апсэмпл → screen
  bAg.globalCompositeOperation = 'copy'; bAg.drawImage(cv, 0, 0, bA.width, bA.height);
  bBg.globalCompositeOperation = 'copy'; bBg.drawImage(bA, 0, 0, bB.width, bB.height);
  bBg.globalCompositeOperation = 'multiply'; bBg.drawImage(bA, 0, 0, bB.width, bB.height);
  bBg.drawImage(bB, 0, 0);
  if (bloomG) {
    // блум, виньетку и зерно докладывает композитор (слои #bloom, .vig, .grain)
    bloomG.globalCompositeOperation = 'copy';
    bloomG.drawImage(bB, 0, 0, bloomEl.width, bloomEl.height);
    if (grainEl && !reduce && (grainFlip = (grainFlip + 1) & 1) === 0) {
      grainEl.style.transform =
        `translate3d(${(Math.random() * 160) | 0}px, ${(Math.random() * 160) | 0}px, 0)`;
    }
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bCg.globalCompositeOperation = 'copy'; bCg.drawImage(bB, 0, 0, bC.width, bC.height);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.42;
  ctx.drawImage(bC, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.drawImage(vigCv, 0, 0);
  const pat = grainPats[(S.t * 24 | 0) % grainPats.length];
  if (pat && canPatternTransform) {
    PM.a = 1; PM.b = 0; PM.c = 0; PM.d = 1;
    PM.e = reduce ? 0 : (Math.random() * 160) | 0; PM.f = reduce ? 0 : (Math.random() * 160) | 0;
    pat.setTransform(PM);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.075;
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

export function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  setCam();
  drawSky();
  ridge('#7085a9', 0.0008, 0.006, 0.055, 2.4, nA, 0);
  ridge('#4a5d80', 0.0018, 0.004, 0.03, 1.1, nE, 0.5 * DPR);
  ridge('#1c273d', 0.004, 0.008, 0.024, 0.18, nC, 1.5 * DPR);
  drawGround();
  drawGroundOverlays();
  drawPoles();
  drawCracks();
  drawDashes();
  drawPosts();
  drawFeatures();
  drawLines(false);
  drawShadow();
  drawCow();
  setCam();
  drawFlying();
  drawParticles();
  drawLines(true);
  drawMarkers();
  drawWarnings();
  drawPops();
  post();
  hud();
}
