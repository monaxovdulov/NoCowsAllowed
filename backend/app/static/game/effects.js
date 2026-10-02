import {
  clamp,
  compactInPlace,
  easeOutBack,
  lerp,
  pick,
  rand,
  TAU,
} from './utils.js';
import { TRICKS } from './constants.js';
import { on } from './events.js';
import {
  clouds,
  cracks,
  ctx,
  geometry,
  lines,
  onFeature,
  onFlat,
  parts,
  pops,
  reduce,
  state,
} from './state.js';
import { CAM } from './camera.js';
import { DPR, H, W, xAt, yAt } from './layout.js';
import { poseMatrix, wheelsScreen } from './pose.js';
import { dustImg, fireImg, lineImg, textSprite, woodImg } from './sprites.js';

/**
 * @param {boolean} init полоса по всему экрану (true) или справа за краем
 * @returns {import('./types').SpeedLine}
 */
export function newLine(init) {
  const front = Math.random() < 0.3;
  const edge = Math.random() < 0.5;
  const yN = front
    ? edge
      ? rand(0.02, 0.2)
      : rand(0.88, 0.99)
    : Math.random() < 0.6
      ? edge
        ? rand(0.02, 0.4)
        : rand(0.6, 0.99)
      : rand(0, 1);
  return {
    x: init ? rand(-0.2, 1.3) : rand(1.02, 1.5),
    yN,
    len: rand(0.12, 0.5),
    th: rand(0.8, 2.2),
    a: rand(0.03, 0.12),
    sp: rand(1.3, 2.8),
    front,
  };
}

// ---------------------------------------------------------------- particles, popups
// Фабрики частиц — единая форма Particle (карта, этап 5, S2).
// Порядок rand() в литералах — часть детерминизма, не переставлять.
/**
 * @param {number} x
 * @param {number} y
 * @param {number} z глубина точки спавна
 * @param {number} strength сила разлёта
 * @param {CanvasImageSource} [img]
 * @returns {import('./types').Particle}
 */
export function createDust(x, y, z, strength, img) {
  const V = state.speed * geometry.cowH;
  return {
    kind: 'dust',
    img: img || dustImg,
    x: x + rand(-6, 6) * geometry.u,
    y: y - rand(0, 8) * geometry.u,
    z,
    vx: (-rand(0.05, 0.35) * V) / z,
    vy: -rand(0.04, 0.26) * geometry.cowH * strength,
    life: 0,
    max: rand(0.45, 1.1),
    r0: (rand(3, 8) * geometry.u) / z,
    r1: ((rand(24, 60) * geometry.u) / z) * (0.5 + strength * 0.5),
    a: rand(0.1, 0.24) * Math.min(1.4, 0.6 + strength * 0.4),
  };
}
/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {import('./types').Particle}
 */
export function createSpark(x, y, z) {
  const V = state.speed * geometry.cowH;
  return {
    kind: 'spark',
    img: null,
    x,
    y: y - 2 * geometry.u,
    z,
    vx: (-rand(0.2, 0.9) * V) / z + rand(-80, 80) * geometry.u,
    vy: -rand(0.25, 1.5) * geometry.cowH,
    life: 0,
    max: rand(0.18, 0.45),
    r0: 0,
    r1: 0,
    a: 0,
  };
}
/**
 * Турбо-пламя за кормой коровы: короткоживущий оранжевый блоб,
 * уносится назад потоком. Спавнится кадрами, пока turbo > 0.
 * @param {number} x
 * @param {number} y
 * @param {number} z глубина точки спавна
 * @returns {import('./types').Particle}
 */
function createFlame(x, y, z) {
  const V = state.speed * geometry.cowH;
  return {
    kind: 'flame',
    img: fireImg,
    x: x + rand(-5, 5) * geometry.u,
    y: y + rand(-5, 3) * geometry.u,
    z,
    vx: (-rand(0.55, 0.95) * V) / z - rand(20, 60) * geometry.u,
    vy: -rand(0.1, 0.55) * geometry.cowH,
    life: 0,
    max: rand(0.14, 0.3),
    r0: ((rand(9, 16) * geometry.u) / z) * (0.55 + 0.75 * state.turbo),
    r1: 0,
    a: rand(0.5, 0.85),
  };
}
/**
 * @param {number} x
 * @param {number} y
 * @returns {import('./types').Particle}
 */
export function createRing(x, y) {
  return {
    kind: 'ring',
    img: null,
    x,
    y,
    z: 1,
    vx: 0,
    vy: 0,
    life: 0,
    max: 0.45,
    r0: 0,
    r1: 0,
    a: 0,
  };
}
/**
 * @param {number} x
 * @param {number} y
 * @param {number} z глубина точки спавна
 * @param {number} n число частиц
 * @param {number} strength сила разлёта
 * @param {CanvasImageSource} [img]
 */
export function puff(x, y, z, n, strength, img) {
  if (reduce) n = Math.ceil(n * 0.4);
  for (let i = 0; i < n; i++) parts.push(createDust(x, y, z, strength, img));
}
/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} n
 */
export function sparks(x, y, z, n) {
  if (reduce) return;
  for (let i = 0; i < n; i++) parts.push(createSpark(x, y, z));
}
/**
 * @param {number} x
 * @param {number} y
 */
export function ring(x, y) {
  parts.push(createRing(x, y));
}
/**
 * @param {string} text
 * @param {import('./types').PopKind} kind
 */
export function popup(text, kind) {
  if (!geometry.cowH) return;
  const m = poseMatrix({ y: state.bob - state.h, tilt: 0, sq: 1 });
  const nose = CAM.transformPoint(m.transformPoint(new DOMPoint(580, 120)));
  const head = CAM.transformPoint(m.transformPoint(new DOMPoint(400, 40)));
  const right = W - nose.x > 0.5 * geometry.cowH; // справа от морды есть место — пишем там, иначе над головой
  const used = new Set(pops.map((q) => q.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  pops.push({
    text,
    kind,
    slot,
    right,
    t: 0,
    durationS: kind === 'pts' ? 1.35 : 1.05,
    x: right
      ? Math.min(nose.x + 0.36 * geometry.cowH, W - 0.3 * geometry.cowH)
      : clamp(head.x, W * 0.3, W * 0.7),
    y: right ? head.y + 0.05 * geometry.cowH : head.y - 0.12 * geometry.cowH,
  });
}

// ---------------------------------------------------------------- update-шаги
/** Пыль из-под колёс на ровном ходу. @param {number} dt */
export function stepDust(dt) {
  if (!onFlat()) return;
  const rate = 16 * state.spdN;
  const w = wheelsScreen();
  for (let i = 0; i < 2; i++)
    if (Math.random() < rate * dt)
      puff(w[i].x, w[i].y, w[i].z, 1, 0.55 + 0.4 * state.boost);
}
const MAX_PARTS = 460; // верхний предел живых частиц — старейшие срезаются
/** Частицы и всплывающие подписи. @param {number} dt */
export function stepParticles(dt) {
  const V = state.speed * geometry.cowH;
  // турбо-жжение: огонь из-под кормы, пока запас turbo расходуется
  if (state.turbo > 0.05 && state.mode !== 'crash' && !reduce) {
    const w = wheelsScreen();
    parts.push(
      createFlame(
        w[0].x - 0.22 * geometry.cowH,
        w[0].y - 0.35 * geometry.cowH,
        w[0].z * 0.95,
      ),
    );
  }
  compactInPlace(parts, (p) => {
    p.life += dt;
    if (p.life >= p.max) return false;
    if (p.kind === 'dust') {
      p.vx += (-V / p.z - p.vx) * (1 - Math.exp(-dt * 2.4));
      p.vy += (0.03 * geometry.cowH - p.vy) * (1 - Math.exp(-dt * 2));
    } else if (p.kind === 'spark') {
      p.vy += 6.5 * geometry.cowH * dt;
    } else {
      p.vx = -V * 0.35;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return true;
  });
  if (parts.length > MAX_PARTS) {
    // срез головы без аллокации: хвост массива сдвигаем в начало
    parts.copyWithin(0, parts.length - MAX_PARTS);
    parts.length = MAX_PARTS;
  }
  compactInPlace(pops, (p) => {
    p.t += dt;
    return p.t < p.durationS;
  });
}
/** Линии скорости. @param {number} dt */
export function stepLines(dt) {
  const V = state.speed * geometry.cowH;
  const nLines = reduce ? 10 : 26;
  while (lines.length < nLines) lines.push(newLine(true));
  for (const l of lines) {
    l.x -= (V * l.sp * (0.55 + 0.9 * state.boost) * dt) / W;
    if (l.x + l.len < -0.05) Object.assign(l, newLine(false));
  }
}
/** Облака: параллакс плюс собственный дрейф. @param {number} dt */
export function stepClouds(dt) {
  for (const c of clouds) {
    const w = c.img.width * c.scale * geometry.u * 1.05;
    c.x -=
      ((c.drift + c.par * state.speed) * geometry.cowH * dt) /
      (W * 1.24 + w + c.gap * W);
  }
}

export function drawCracks() {
  const V = state.speed * geometry.cowH,
    zE = geometry.zEdge * 0.99,
    zB = geometry.zBottom;
  const yE = yAt(zE),
    yB = yAt(zB);
  const cw = 0.016 * geometry.cowH,
    blur = V / 150;
  ctx.fillStyle = '#06070c';
  ctx.globalAlpha = (0.5 * cw) / (cw + blur);
  for (const c of cracks) {
    const xe = xAt(c.X, zE),
      xb = xAt(c.X, zB);
    if (Math.max(xe, xb) < -W * 0.2 || Math.min(xe, xb) > W * 1.2) continue;
    const we = (cw + blur) / zE,
      wb = (cw + blur) / zB;
    ctx.beginPath();
    ctx.moveTo(xe - we / 2, yE);
    ctx.lineTo(xe + we / 2, yE);
    ctx.lineTo(xb + wb / 2, yB);
    ctx.lineTo(xb - wb / 2, yB);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** @param {boolean} front передний (true) или задний план */
export function drawLines(front) {
  ctx.globalCompositeOperation = 'screen';
  const k =
    (reduce ? 0.4 : 1) * (0.45 + 1.3 * state.boost) * (0.8 + 0.2 * state.spdN);
  for (const l of lines) {
    if (l.front !== front) continue;
    ctx.globalAlpha = clamp(l.a * k, 0, 0.5);
    ctx.drawImage(lineImg, l.x * W, l.yN * H, l.len * W, l.th * DPR * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function drawParticles() {
  for (const p of parts) {
    const t = p.life / p.max;
    if (p.kind === 'dust') {
      if (!p.img) continue;
      const r = lerp(p.r0, p.r1, Math.sqrt(t));
      const stretch = Math.abs(p.vx) * 0.02;
      ctx.globalAlpha = p.a * (1 - t) ** 1.4;
      ctx.drawImage(
        p.img,
        p.x - r - stretch * 0.3,
        p.y - r,
        r * 2 + stretch,
        r * 2,
      );
    } else if (p.kind === 'ring') {
      const rx = geometry.cowH * 0.34 * (0.35 + 1.3 * t);
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.strokeStyle = '#f4f8ff';
      ctx.lineWidth = Math.max(1.5, 4 * geometry.u * (1 - t));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, rx * 0.26, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const p of parts) {
    const t = p.life / p.max;
    if (p.kind === 'flame') {
      // огонь затухает и сжимается к концу жизни
      if (!p.img) continue;
      const r = p.r0 * (1 - t) ** 0.6;
      ctx.globalAlpha = p.a * (1 - t);
      ctx.drawImage(p.img, p.x - r, p.y - r, r * 2, r * 2);
      continue;
    }
    if (p.kind !== 'spark') continue;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = t < 0.4 ? '#fff4d6' : '#ffb14e';
    ctx.lineWidth = Math.max(1, 1.6 * geometry.u);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- подписки
// Реакции на события модели (композиция — в main.js). Порядок регистрации
// задаёт порядок исполнения: эффекты идут первыми, как раньше шли
// прямые вызовы из player.js.
// последний показанный множитель цепи — для попапа «×N» при росте
let comboMultSeen = 1;

export function initEffects() {
  on('airborne', (d) => {
    const w = wheelsScreen();
    if (d.from === 'jump') {
      puff(w[0].x, w[0].y, w[0].z, 10, 1.3);
      puff(w[1].x, w[1].y, w[1].z, 6, 1.0);
    } else if (d.from === 'double') {
      const x = (w[0].x + w[1].x) / 2,
        y = (w[0].y + w[1].y) / 2;
      ring(x, y + 0.03 * geometry.cowH);
      puff(x, y, 1, 8, 0.8);
    } else {
      puff(w[1].x, w[1].y, 1, 8, 1.1, woodImg);
    }
  });
  on('trick', (d) => {
    popup(d.kind === 'double' ? 'ДВОЙНОЙ' : TRICKS[d.kind].name, 'trick');
  });
  on('land', (d) => {
    if (onFeature() || d.impact <= 0) return;
    // оценка приземления (фаза 1): идеально — трюк кончился заранее,
    // нечисто — дожали при касании
    if (d.perfect) popup('ИДЕАЛЬНО', 'trick');
    else if (d.dirty) popup('НЕЧИСТО', 'pts');
    const w = wheelsScreen(),
      k = clamp(d.impact / 2.4, 0.6, 1.8);
    for (const p of w) {
      puff(p.x, p.y, p.z, Math.round(14 * k), 1.5 * k);
      sparks(p.x, p.y, p.z, Math.round(6 * k));
    }
  });
  on('crash', (d) => {
    popup(pick(['БАМ!', 'ОЙ!', 'МУУУ!']), 'crash');
    for (const p of d.wheels) {
      puff(p.x, p.y, p.z, 16, 1.8);
      sparks(p.x, p.y, p.z, 8);
    }
  });
  // комбо-цепь: рост множителя, сдача горшка, сгорание при крэше
  on('combo', (d) => {
    if (d.mult > comboMultSeen) popup(`×${d.mult}`, 'trick');
    comboMultSeen = d.mult;
  });
  on('combo-bank', (d) => {
    comboMultSeen = 1;
    popup(`КОМБО +${d.points.toLocaleString('ru-RU')}`, 'pts');
  });
  on('combo-lost', (d) => {
    comboMultSeen = 1;
    popup(`−${d.points.toLocaleString('ru-RU')}`, 'crash');
  });
  on('life-lost', (d) => {
    popup(
      d.lives > 0 ? `ЖИЗНЕЙ ОСТАЛОСЬ: ${d.lives}` : 'ПОСЛЕДНЕЕ ПАДЕНИЕ!',
      'crash',
    );
  });
  on('obstacle-clear', (d) => {
    if (d.close) popup('ВПРИТЫК', 'trick');
  });
  on('ride-exit', (d) => {
    if (d.result === 'fail') return; // срыв — попап покажет crash
    popup(d.ok ? 'ПЕТЛЯ!' : 'НЕ ДОТЯНУЛ!', d.ok ? 'trick' : 'pts');
  });
}

export function drawPops() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const lh = 0.12 * geometry.cowH,
    top = H * 0.13 + lh * 0.5;
  for (const q of pops) {
    const k = q.t / q.durationS,
      a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const sc = q.t < 0.2 ? Math.max(0.01, easeOutBack(q.t / 0.2)) : 1;
    const size =
      (q.kind === 'crash' ? 0.13 : q.kind === 'pts' ? 0.075 : 0.092) *
      geometry.cowH;
    const y = q.right
      ? clamp(q.y, top, H * 0.45) + q.slot * lh
      : Math.max(top + q.slot * lh, q.y - q.slot * lh);
    // текст — кэшированный спрайт: strokeText каждый кадр слишком дорогой
    const spr = textSprite(
      q.text,
      size,
      q.kind === 'crash' ? '#ff5a4a' : q.kind === 'pts' ? '#ffd84a' : '#ffffff',
      'rgba(8,10,22,0.8)',
      size * 0.17,
    );
    ctx.save();
    ctx.translate(q.x, y - k * 0.06 * geometry.cowH);
    ctx.scale(sc, sc);
    ctx.rotate(q.kind === 'crash' ? -0.09 : -0.04);
    ctx.globalAlpha = a;
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
