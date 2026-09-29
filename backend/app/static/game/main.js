import { META, SRC } from './assets.js';
import { clamp, DEG, lerp, loadImg, nA, nB, nC, rand, smooth } from './utils.js';
import { CRUISE, GRAV, MAXSPD, MINSPD } from './constants.js';
import { clouds, cracks, feats, G, grainEl, hintEl, lines, parts, pops, reduce, S, setCAM } from './state.js';
import { boardX, H, layout, perfScale, setPerfScale, W, xAt, zAt } from './layout.js';
import { grainTiles, initAssets, initClouds, initShadow } from './sprites.js';
import { autopilot, bumpAt, curPose, launch, physicsStep, poseMatrix, wheelsScreen } from './player.js';
import { checkObstacles, groundInfo, spawnFeatures } from './features.js';
import { newLine, puff } from './effects.js';
import { render } from './render.js';
import { coachStep } from './ui.js';

function update(dt) {
  S.t += dt;
  // мягкий старт заезда: ~14 с до крейсерской — время заметить препятствие и среагировать
  const rampT = S.playT0 ? smooth(clamp((S.t - S.playT0) / 14, 0, 1)) : 1;
  const cruise = lerp(3.3, CRUISE, rampT);
  const target = S.crash ? 1.3 : S.throttle > 0 ? MAXSPD : S.throttle < 0 ? MINSPD : (reduce ? 3.2 : cruise);
  S.speed += (target - S.speed) * (1 - Math.exp(-dt * (S.crash ? 3 : S.throttle > 0 ? 1.3 : 0.9)));
  S.boost = clamp((S.speed - CRUISE) / (MAXSPD - CRUISE), 0, 1);
  S.spdN = S.speed / CRUISE;
  const V = S.speed * G.cowH;
  S.camX += V * dt;
  S.invuln = Math.max(0, S.invuln - dt);

  spawnFeatures();
  const gi = groundInfo(boardX());
  if (!S.crash && !S.air) {
    if (gi.h > 0.001) { S.h = gi.h; S.onRamp = true; S.slope = gi.slope; }
    else if (S.onRamp) { S.onRamp = false; S.h = 0; launch(); }
    else S.h = 0;
  }

  let rem = dt;
  while (rem > 1e-6) { const h = Math.min(rem, 1 / 240); physicsStep(h, gi.h); rem -= h; }

  checkObstacles();
  autopilot();
  coachStep();

  // история для призраков (фиксированный шаг 1/60)
  S.histAcc += dt;
  while (S.histAcc >= 1 / 60) {
    S.histAcc -= 1 / 60;
    S.hist.unshift(curPose());
    if (S.hist.length > 14) S.hist.pop();
  }

  // швы на асфальте → удары по колёсам
  const zB = G.zBottom, farX = S.camX + (W * 1.3 - G.vx) * G.zEdge;
  let last = cracks.length ? cracks[cracks.length - 1].X : S.camX + W * 0.6 * zB;
  while (last < farX) { last += rand(5, 13) * G.cowH; cracks.push({ X: last, hit: [false, false] }); }
  while (cracks.length && xAt(cracks[0].X, G.zEdge) < -W * 0.3) cracks.shift();
  const restM = poseMatrix({ y: S.bob, tilt: S.tilt, sq: S.sq });
  for (let i = 0; i < 2; i++) {
    const p = restM.transformPoint(new DOMPoint(META.contact[i][0], META.contact[i][1]));
    const Xw = S.camX + (p.x - G.vx) * zAt(p.y);
    for (const c of cracks) if (!c.hit[i] && Xw >= c.X) { c.hit[i] = true; bumpAt(i, rand(0.6, 1)); }
  }

  // сбитые препятствия летят
  for (const f of feats) {
    const q = f.fly;
    if (!q) continue;
    q.vh -= GRAV * dt; q.h += q.vh * dt; q.rot += q.vr * dt;
    f.X += q.vx * G.cowH * dt;
    if (q.h <= 0) { q.h = 0; q.vh = Math.abs(q.vh) > 0.7 ? -q.vh * 0.35 : 0; q.vr *= 0.55; q.vx *= 0.5; }
  }

  // пыль из-под колёс
  if (!S.air && !S.onRamp && !S.crash) {
    const rate = 16 * S.spdN;
    const w = wheelsScreen();
    for (let i = 0; i < 2; i++) if (Math.random() < rate * dt) puff(w[i].x, w[i].y, w[i].z, 1, 0.55 + 0.4 * S.boost);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max) { parts.splice(i, 1); continue; }
    if (p.k === 0) {
      p.vx += (-V / p.z - p.vx) * (1 - Math.exp(-dt * 2.4));
      p.vy += (0.03 * G.cowH - p.vy) * (1 - Math.exp(-dt * 2));
    } else if (p.k === 1) {
      p.vy += 6.5 * G.cowH * dt;
    } else {
      p.vx = -V * 0.35;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (parts.length > 460) parts.splice(0, parts.length - 460);
  for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t >= pops[i].dur) pops.splice(i, 1); }

  // линии скорости
  const nLines = reduce ? 10 : 26;
  while (lines.length < nLines) lines.push(newLine(true));
  for (const l of lines) {
    l.x -= (V * l.sp * (0.55 + 0.9 * S.boost)) * dt / W;
    if (l.x + l.len < -0.05) Object.assign(l, newLine(false));
  }

  // облака
  for (const c of clouds) {
    const w = c.img.width * c.scale * G.u * 1.05;
    c.x -= ((c.drift + c.par * S.speed) * G.cowH * dt) / (W * 1.24 + w + c.gap * W);
  }

  if (S.t > 9) hintEl.classList.add('dim');

  // камера: тряска, зум от скорости, подъём за коровой в большом прыжке
  S.shake = Math.max(0, S.shake - dt * 2.4);
  const apex = S.air && S.hV > 0 ? S.h + S.hV * S.hV / (2 * GRAV) : S.h;
  const hT = S.air ? lerp(S.h, apex, 0.6) : S.h;
  S.lift += (Math.max(0, hT - 0.18) * G.cowH - S.lift) * (1 - Math.exp(-dt * 6));
  S.zoomOut += (clamp((hT - 0.35) / 0.8, 0, 1) * 0.09 - S.zoomOut) * (1 - Math.exp(-dt * 3));
  const mul = reduce ? 0.15 : 1;
  const amp = mul * (0.0018 * S.spdN + 0.0016 * S.boost + S.shake * 0.011) * G.cowH;
  const t = S.t;
  const sx = amp * (Math.sin(t * 21.3) * 0.45 + Math.sin(t * 34.7 + 1.3) * 0.25 + nA(t * 9) * 0.5);
  const sy = amp * (Math.sin(t * 27.1 + 0.7) * 0.45 + Math.sin(t * 41.9 + 2.1) * 0.25 + nB(t * 9) * 0.5)
    + 0.004 * G.cowH * Math.sin(t * 0.9) * mul;
  const rot = mul * (0.0011 * S.spdN + S.shake * 0.004) * nC(t * 3.1);
  const zoom = 1.035 + 0.04 * smooth(S.boost) + 0.012 * S.shake * mul - S.zoomOut;
  setCAM(new DOMMatrix().translate(W / 2, H / 2).rotate(rot * DEG).scale(zoom)
    .translate(-W / 2 + sx, -H / 2 + sy + S.lift));
}

// ---------------------------------------------------------------- boot
let last = 0, emaFrame = 16.7, emaWork = 8, perfCool = 0;
function frame(now) {
  let dt = last ? (now - last) / 1000 : 1 / 60;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  const t0 = performance.now();
  update(Math.min(dt, 1 / 20));
  render();
  // динамическое разрешение: просадка кадров → снижаем DPR, есть запас → возвращаем чёткость
  emaWork += (performance.now() - t0 - emaWork) * 0.06;
  emaFrame += (Math.min(dt * 1000, 34) - emaFrame) * 0.06;   // cap — не считаем паузы в фоне
  perfCool -= dt;
  if (S.t > 4 && perfCool <= 0) {
    if (emaFrame > 19 && perfScale > 0.55) {
      setPerfScale(Math.max(0.55, perfScale - 0.15)); perfCool = 2.5; layout();
    } else if (emaWork < 8 && emaFrame < 17.5 && perfScale < 1) {
      setPerfScale(Math.min(1, perfScale + 0.12)); perfCool = 3; layout();
    }
  }
  requestAnimationFrame(frame);
}

let resizeQueued = false;
addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; layout(); });
});

/*TEST_HOOK*/
Promise.all([loadImg(SRC.base), loadImg(SRC.board), loadImg(SRC.ear), loadImg(SRC.tag)]).then(([base, board, ear, tag]) => {
  initAssets({ base, board, ear, tag });
  initClouds();
  layout();
  initShadow();
  if (grainEl && grainTiles.length) {
    grainEl.style.backgroundImage = `url("${grainTiles[0].toDataURL()}")`;
  }
  for (let i = 0; i < 26; i++) lines.push(newLine(true));
  for (let i = 0; i < 60; i++) update(1 / 60); // прогрев: пыль и история уже есть
  requestAnimationFrame(frame);
});
