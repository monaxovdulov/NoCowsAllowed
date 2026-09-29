import { clamp, rand, smooth, TAU } from './utils.js';
import { OBS } from './constants.js';
import { CAM, ctx, feats, G, playerMode, S } from './state.js';
import { boardX, DPR, obPos, obZ, W, X0, X1, yAt } from './layout.js';
import { glowImg, OBR, obSprites, shadowImg } from './sprites.js';
import { crash } from './player.js';
import { popup } from './effects.js';
import { bumpScore, endRun } from './ui.js';

// ---------------------------------------------------------------- road features
const OBS_ENTRIES = Object.entries(OBS);
const OBS_TOTAL = OBS_ENTRIES.reduce((a, [, o]) => a + o.wt, 0);
export function spawnFeatures() {
  // на узких экранах спавним глубже — за видимым краем дороги, чтобы препятствия подъезжали издалека
  const ahead = S.camX + Math.max(W * 1.5 - G.vx, G.zEdge * 1.15 * (W - G.vx) + 2 * G.cowH);
  while (S.nextSpawnX < ahead) {
    const X = S.nextSpawnX;
    if (Math.random() < 0.24) {
      const f = { type: 'ramp', X0: X, X1: X + 1.15 * G.cowH, hr: 0.3 };
      feats.push(f);
      S.nextSpawnX = f.X1 + rand(12, 17) * G.cowH * Math.max(1, 0.8 * S.spdN);
    } else {
      let r = Math.random() * OBS_TOTAL, kind = 'cone';
      for (const [k, o] of OBS_ENTRIES) { r -= o.wt; if (r <= 0) { kind = k; break; } }
      const w = OBS[kind].w * G.cowH;
      feats.push({ type: 'ob', kind, X: X + w / 2, over: false, cleared: false, fly: null });
      S.nextSpawnX = X + w + rand(7.5, 13) * G.cowH * Math.max(1, 0.8 * S.spdN);
    }
  }
  for (let i = feats.length - 1; i >= 0; i--) {
    const f = feats[i], end = f.type === 'ramp' ? f.X1 : f.X + OBS[f.kind].w * G.cowH;
    if (G.vx + (end - S.camX) < -W * 0.5) feats.splice(i, 1);
  }
}
export function groundInfo(X) {
  for (const f of feats) {
    if (f.type === 'ramp' && X >= f.X0 && X <= f.X1) {
      const k = (X - f.X0) / (f.X1 - f.X0);
      return { h: f.hr * k, slope: f.hr * G.cowH / (f.X1 - f.X0) };
    }
  }
  return { h: 0, slope: 0 };
}
function knock(f, power) {
  f.fly = { h: 0.02, vh: rand(1.6, 2.6) * power, vx: rand(0.7, 1.5) * power, rot: 0, vr: rand(-13, 13) * power };
  S.shake = Math.min(1.8, S.shake + 0.4);
}
export function checkObstacles() {
  const Xb = boardX(), hb = 0.2 * G.cowH;
  for (const f of feats) {
    if (f.type !== 'ob' || f.fly) continue;
    const o = OBS[f.kind], half = o.w * G.cowH / 2;
    const over = Xb + hb > f.X - half && Xb - hb < f.X + half;
    if (over) {
      if (S.crash || S.invuln > 0) { if (S.h < o.h) knock(f, 0.7); continue; }
      if (S.h < o.h * 0.85) { knock(f, 1); crash(); } else f.over = true;
    } else if (f.over && !f.cleared && Xb - hb >= f.X + half) {
      f.cleared = true;
      // очки за взятое препятствие — сразу, а не при приземлении: быстрый отклик учит лучше
      if (playerMode()) { S.score += 50; bumpScore(); popup('+50', 'pts'); if (S.score > S.best) endRun(); }
    }
  }
}

// трамплин: деревянный клин в перспективе (боковая стенка, настил, металлический край)
function fillPoly(pts, style, dx) {
  ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1]);
  ctx.closePath(); ctx.fillStyle = style; ctx.fill();
}
function drawRamp(f, blur) {
  const q = obZ(f.X0 - S.camX), zn = 0.8 * q, zf = 1.28 * q, hh = f.hr * G.cowH;
  const P = (X, h, z) => [G.vx + (X - S.camX) / z, yAt(z) - h / z];
  const A = P(f.X0, 0, zn), B = P(f.X1, hh, zn), C = P(f.X1, hh, zf), D = P(f.X0, 0, zf);
  const F = P(f.X1, 0, zn), Gp = P(f.X1, 0, zf);
  if (Math.max(B[0], F[0]) < X0() - 60 || Math.min(A[0], D[0]) > X1() + 60) return;
  const fa = clamp((G.zEdge * 1.12 - zf) * 2.4, 0, 1);   // проступает из дали
  if (fa <= 0.02) return;
  const shadowLen = 0.35 * G.cowH;
  const shape = (dx, alpha) => {
    ctx.globalAlpha = alpha;
    fillPoly([F, Gp, [Gp[0] + shadowLen / zf, Gp[1]], [F[0] + shadowLen / zn, F[1]]], 'rgba(4,5,10,0.35)', dx);
    fillPoly([F, B, C, Gp], '#5a391b', dx);
    const tg = ctx.createLinearGradient(A[0] + dx, A[1], B[0] + dx, B[1]);
    tg.addColorStop(0, '#8a5c2f'); tg.addColorStop(1, '#cc9655');
    fillPoly([A, B, C, D], tg, dx);
    ctx.strokeStyle = 'rgba(70,42,18,0.55)'; ctx.lineWidth = Math.max(1, 1.3 * G.u);
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const z = zn + (zf - zn) * i / 6, a = P(f.X0, 0, z), b = P(f.X1, hh, z);
      ctx.moveTo(a[0] + dx, a[1]); ctx.lineTo(b[0] + dx, b[1]);
    }
    ctx.stroke();
    const sg = ctx.createLinearGradient(0, B[1], 0, F[1]);
    sg.addColorStop(0, '#76491f'); sg.addColorStop(1, '#4a2c12');
    fillPoly([A, F, B], sg, dx);
    ctx.strokeStyle = 'rgba(40,24,10,0.7)'; ctx.lineWidth = Math.max(1, 2.2 * G.u);
    ctx.beginPath();
    for (const k of [0.4, 0.72]) {
      const t = P(f.X0 + (f.X1 - f.X0) * k, hh * k, zn), b = P(f.X0 + (f.X1 - f.X0) * k, 0, zn);
      ctx.moveTo(t[0] + dx, t[1]); ctx.lineTo(b[0] + dx, b[1]);
    }
    ctx.stroke();
    ctx.strokeStyle = '#dfe4ea'; ctx.lineWidth = Math.max(1.5, 3.2 * G.u); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(B[0] + dx, B[1]); ctx.lineTo(C[0] + dx, C[1]); ctx.stroke();
  };
  shape(blur * 0.8 / q, 0.3 * fa);
  shape(0, fa);
  ctx.globalAlpha = 1;
}

function drawObSprite(kind, x, y, rot, blur, zs, al) {
  const spr = obSprites[kind], sc = G.cowH * (zs || 1) / OBR, a = al === undefined ? 1 : al;
  const w = spr.width * sc, h = spr.height * sc, p = spr.pad * sc;
  if (rot) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y - (h - 2 * p) / 2); ctx.rotate(rot);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h); ctx.restore();
    return;
  }
  const x0 = x - w / 2, y0 = y - h + p;
  for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.13 * (4 - i) * a; ctx.drawImage(spr, x0 + blur * i / 3, y0, w, h); }
  ctx.globalAlpha = a; ctx.drawImage(spr, x0, y0, w, h);
}
function groundShadow(x, y, rx, ry, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx / 64, ry / 64);
  ctx.globalAlpha = a; ctx.drawImage(shadowImg, -64, -64); ctx.restore();
}
// тёплое свечение под препятствием — отделяет тёмный спрайт от тёмного асфальта
function groundGlow(x, y, rx, ry, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx / 64, ry / 64);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = a; ctx.drawImage(glowImg, -64, -64); ctx.restore();
}
export function drawFeatures() {
  const blur = S.speed * G.cowH / 45;
  const items = [];                                     // дальние рисуем первыми
  for (const f of feats) {
    if (f.type === 'ramp') { items.push({ z: obZ(f.X0 - S.camX) * 1.06, f }); continue; }
    if (f.fly) continue;
    const [x, y, z] = obPos(f.X);
    if (x < X0() - G.cowH || x > X1() + G.cowH) continue;
    items.push({ z, f, x, y });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) {
    const f = it.f;
    if (f.type === 'ramp') { drawRamp(f, blur); continue; }
    const o = OBS[f.kind], z = it.z;
    const a = clamp((G.zEdge * 1.12 - z) * 2.4, 0, 1);  // проступают из дали
    if (a <= 0.02) continue;
    ctx.globalAlpha = 1;
    groundGlow(it.x, it.y - 0.01 * G.cowH / z, o.w * G.cowH * 0.85 / z, 0.09 * G.cowH / z, 0.2 * a);
    groundShadow(it.x + 0.03 * G.cowH / z, it.y, o.w * G.cowH * 0.62 / z, 0.035 * G.cowH / z, 0.55 * a);
    drawObSprite(f.kind, it.x, it.y, 0, blur / z, 1 / z, a);
  }
  ctx.globalAlpha = 1;
}
export function drawFlying() {
  for (const f of feats) {
    if (!f.fly) continue;
    const [x, y, z] = obPos(f.X);
    if (x < X0() - G.cowH || x > X1() + G.cowH) continue;
    groundShadow(x, y, OBS[f.kind].w * G.cowH * 0.5 / (z * (1 + f.fly.h * 2)), 0.03 * G.cowH / z, 0.4);
    drawObSprite(f.kind, x, y - f.fly.h * G.cowH / z, f.fly.rot || 0.001, 0, 1 / z);
  }
}

// маркер над приближающимся препятствием — виден, пока спрайт ещё мелкий;
// «×2» — длинные/высокие, где нужен двойной прыжок; краснеет к моменту прыжка
export function drawMarkers() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const V = Math.max(1, S.speed * G.cowH), Xb = boardX();
  for (const f of feats) {
    if (f.type !== 'ob' || f.fly || f.over) continue;
    const o = OBS[f.kind], t = (f.X - Xb) / V;
    if (t <= 0 || t > 2.6) continue;
    const z = obZ(f.X - S.camX);
    const p = CAM.transformPoint(new DOMPoint(
      G.vx + (f.X - S.camX) / z, yAt(z) - (o.h + 0.06) * G.cowH / z));
    if (p.x < -24 * DPR || p.x > W + 24 * DPR) continue;
    const lead = o.long || o.tall ? 0.5 : 0.3;
    const urgent = t < lead + 0.35;
    const a = smooth(clamp((2.6 - t) / 0.9, 0, 1));
    const s = (urgent ? 15 : 12) * DPR;
    const bob = (0.5 + 0.5 * Math.sin(S.t * (urgent ? 13 : 7))) * s * 0.35;
    ctx.globalAlpha = a;
    ctx.fillStyle = urgent ? '#ff5a4a' : '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x + s, p.y - bob - s * 1.9);
    ctx.lineTo(p.x, p.y - bob);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,14,26,.92)';
    ctx.font = `800 ${(s * 1.05).toFixed(1)}px Unbounded, "Arial Black", system-ui, sans-serif`;
    ctx.fillText(o.long || o.tall ? '×2' : '!', p.x, p.y - bob - s * 1.14);
  }
  ctx.globalAlpha = 1;
}

// значок у правого края: препятствие ещё за кадром, кольцо заполняется к моменту прыжка
export function drawWarnings() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const V = S.speed * G.cowH, Xb = boardX(), r = Math.max(14 * DPR, 0.06 * G.cowH);
  for (const f of feats) {
    if (f.type !== 'ob' || f.fly || f.over) continue;
    const o = OBS[f.kind], t = (f.X - Xb) / V, lead = o.long || o.tall ? 0.5 : 0.3;
    const z = obZ(f.X - S.camX);
    const edge = CAM.transformPoint(new DOMPoint(G.vx + (f.X - S.camX - o.w * G.cowH / 2) / z, yAt(z)));
    if (t > lead + 1.3 || t < 0) continue;
    const fadeIn = smooth(clamp((lead + 1.3 - t) / 0.35, 0, 1));        // появился заранее
    const fadeOut = smooth(clamp((t - lead + 0.2) / 0.14, 0, 1));       // гаснет сразу после момента прыжка
    const seen = smooth(clamp((edge.x - W * 0.68) / (W * 0.08), 0, 1)); // препятствие уже хорошо видно — значок не нужен
    const a = fadeIn * fadeOut * seen;
    if (a <= 0.01) continue;
    const x = W - r - 14 * DPR, y = CAM.transformPoint(new DOMPoint(0, G.refY - 0.16 * G.cowH)).y;
    const prog = clamp(1 - (t - lead) / 1.3, 0, 1), now = t <= lead + 0.06;
    ctx.globalAlpha = a;
    ctx.fillStyle = now ? 'rgba(255,216,74,.9)' : 'rgba(10,14,26,.62)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + prog * TAU); ctx.stroke();
    const spr = obSprites[f.kind], k = (r * 1.25) / Math.max(spr.width, spr.height);
    ctx.drawImage(spr, x - spr.width * k / 2, y - spr.height * k / 2, spr.width * k, spr.height * k);
    if (o.long || o.tall) {
      ctx.font = `800 ${(r * 0.62).toFixed(1)}px Unbounded, "Arial Black", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = r * 0.16; ctx.strokeStyle = 'rgba(8,10,22,.85)'; ctx.fillStyle = '#ffd84a';
      ctx.strokeText('×2', x - r * 1.75, y); ctx.fillText('×2', x - r * 1.75, y);
    }
  }
  ctx.globalAlpha = 1;
}
