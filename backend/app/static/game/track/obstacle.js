// Препятствие: перепрыгнуть (`collide`), сбитое — летит обломком
// (`step`, `drawFlying`), маркер-подсказка над спрайтом и значок у края.
import { clamp, rand } from '../utils.js';
import { GRAV, OBS } from '../constants.js';
import { ctx, G, playerMode, S } from '../state.js';
import { boardX, obPos, X0, X1 } from '../layout.js';
import { glowImg, OBR, obSprites, shadowImg } from '../sprites.js';
import { addScore } from '../score.js';

const OBS_ENTRIES = /** @type {import('../types').ObstacleEntry[]} */ (
  Object.entries(OBS)
);
const OBS_TOTAL = OBS_ENTRIES.reduce((a, [, o]) => a + o.wt, 0);

/** @param {import('../types').ObstacleFeature} f центр по мировой оси */
const mid = (f) => (f.x0 + f.x1) / 2;

/**
 * Отбросить обломок: задаёт fly-полёт и встряхивает камеру.
 * @param {import('../types').ObstacleFeature} f
 * @param {number} power
 */
function knock(f, power) {
  f.data.fly = {
    h: 0.02,
    vh: rand(1.6, 2.6) * power,
    vx: rand(0.7, 1.5) * power,
    rot: 0,
    vr: rand(-13, 13) * power,
  };
  S.shake = Math.min(1.8, S.shake + 0.4);
}

/**
 * @param {import('../types').ObstacleKind} kind
 * @param {number} x
 * @param {number} y
 * @param {number} rot
 * @param {number} blur
 * @param {number} zs
 * @param {number} [al]
 */
function drawObSprite(kind, x, y, rot, blur, zs, al) {
  const spr = obSprites[kind],
    sc = (G.cowH * (zs || 1)) / OBR,
    a = al === undefined ? 1 : al;
  const w = spr.width * sc,
    h = spr.height * sc,
    p = spr.pad * sc;
  if (rot) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y - (h - 2 * p) / 2);
    ctx.rotate(rot);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  const x0 = x - w / 2,
    y0 = y - h + p;
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.13 * (4 - i) * a;
    ctx.drawImage(spr, x0 + (blur * i) / 3, y0, w, h);
  }
  ctx.globalAlpha = a;
  ctx.drawImage(spr, x0, y0, w, h);
}
/**
 * @param {number} x
 * @param {number} y
 * @param {number} rx
 * @param {number} ry
 * @param {number} a
 */
function groundShadow(x, y, rx, ry, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx / 64, ry / 64);
  ctx.globalAlpha = a;
  ctx.drawImage(shadowImg, -64, -64);
  ctx.restore();
}
// тёплое свечение под препятствием — отделяет тёмный спрайт от тёмного асфальта
/**
 * @param {number} x
 * @param {number} y
 * @param {number} rx
 * @param {number} ry
 * @param {number} a
 */
function groundGlow(x, y, rx, ry, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx / 64, ry / 64);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = a;
  ctx.drawImage(glowImg, -64, -64);
  ctx.restore();
}

/** @type {import('../types').FeatureTypeSpec<import('../types').ObstacleData, 'ob'>} */
export const obstacleSpec = {
  type: 'ob',
  weight: 76,
  minGapBeforeCowH: 7.5,
  plan(ctx) {
    let r = ctx.rand(0, OBS_TOTAL);
    /** @type {import('../types').ObstacleKind} */
    let kind = 'cone';
    for (const [k, o] of OBS_ENTRIES) {
      r -= o.wt;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const o = OBS[kind];
    return {
      data: { kind, over: false, cleared: false, fly: null },
      lengthCowH: o.w,
      gapAfterCowH: ctx.rand(7.5, 13) * Math.max(1, 0.8 * ctx.spdN),
    };
  },
  collide(feat, X, h) {
    const d = feat.data,
      o = OBS[d.kind],
      hb = 0.2 * G.cowH;
    if (d.fly) return 'clear';
    if (X + hb > feat.x0 && X - hb < feat.x1) {
      if (S.mode === 'crash' || S.invuln > 0) {
        if (h < o.h) knock(feat, 0.7);
        return 'clear';
      }
      if (h < o.h * 0.85) {
        knock(feat, 1);
        return 'hit';
      }
      d.over = true;
      return 'over';
    }
    if (d.over && !d.cleared && X - hb >= feat.x1) {
      d.cleared = true;
      // очки за взятое препятствие — сразу, а не при приземлении: быстрый отклик учит лучше
      if (playerMode()) addScore(50);
    }
    return 'clear';
  },
  step(feat, dt) {
    const q = feat.data.fly;
    if (!q) return;
    q.vh -= GRAV * dt;
    q.h += q.vh * dt;
    q.rot += q.vr * dt;
    const dX = q.vx * G.cowH * dt;
    feat.x0 += dX;
    feat.x1 += dX;
    if (q.h <= 0) {
      q.h = 0;
      q.vh = Math.abs(q.vh) > 0.7 ? -q.vh * 0.35 : 0;
      q.vr *= 0.55;
      q.vx *= 0.5;
    }
  },
  autopilot(feat) {
    const o = OBS[feat.data.kind],
      Xb = boardX(),
      hb = 0.2 * G.cowH,
      dbl = !!(o.long || o.tall);
    if (feat.data.fly || feat.x1 <= Xb - hb) return null;
    return {
      at: mid(feat),
      leadS: dbl ? 0.5 : 0.3,
      action: dbl ? 'double' : 'jump',
    };
  },
  marker(feat) {
    const d = feat.data;
    if (d.fly || d.over) return null;
    const o = OBS[d.kind],
      dbl = !!(o.long || o.tall);
    return {
      label: dbl ? '×2' : '!',
      leadS: dbl ? 0.5 : 0.3,
      heightCowH: o.h + 0.06,
      icon: obSprites[d.kind],
    };
  },
  depth: (feat) => (feat.data.fly ? 0 : obPos(mid(feat))[2]),
  draw(feat, blur) {
    const d = feat.data;
    if (d.fly) return;
    const o = OBS[d.kind],
      [x, y, z] = obPos(mid(feat));
    if (x < X0() - G.cowH || x > X1() + G.cowH) return;
    const a = clamp((G.zEdge * 1.12 - z) * 2.4, 0, 1); // проступают из дали
    if (a <= 0.02) return;
    ctx.globalAlpha = 1;
    groundGlow(
      x,
      y - (0.01 * G.cowH) / z,
      (o.w * G.cowH * 0.85) / z,
      (0.09 * G.cowH) / z,
      0.2 * a,
    );
    groundShadow(
      x + (0.03 * G.cowH) / z,
      y,
      (o.w * G.cowH * 0.62) / z,
      (0.035 * G.cowH) / z,
      0.55 * a,
    );
    drawObSprite(d.kind, x, y, 0, blur / z, 1 / z, a);
  },
  drawFlying(feat) {
    const d = feat.data;
    if (!d.fly) return;
    const [x, y, z] = obPos(mid(feat));
    if (x < X0() - G.cowH || x > X1() + G.cowH) return;
    groundShadow(
      x,
      y,
      (OBS[d.kind].w * G.cowH * 0.5) / (z * (1 + d.fly.h * 2)),
      (0.03 * G.cowH) / z,
      0.4,
    );
    drawObSprite(
      d.kind,
      x,
      y - (d.fly.h * G.cowH) / z,
      d.fly.rot || 0.001,
      0,
      1 / z,
    );
  },
};
