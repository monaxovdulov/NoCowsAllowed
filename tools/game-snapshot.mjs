#!/usr/bin/env node
// Детерминированный снапшот игры (карта рефакторинга, этап 1, раздел 0).
//
// Прогоняет backend/app/static/index.html в headless-chromium с виртуальными
// часами: seeded Math.random, ручные кадры rAF с шагом 1/60, виртуальные
// setTimeout/setInterval, фиксированный performance.now. Ввод — реальные
// DOM-события (pointerdown/KeyboardEvent) на заданных кадрах.
//
// Каждый вьюпорт прогоняется дважды: хэши двух прогонов обязаны совпасть
// (самопроверка детерминизма), затем сравниваются с tools/game-snapshot.json.
//
//   node tools/game-snapshot.mjs            # проверка (exit 1 при расхождении)
//   node tools/game-snapshot.mjs --update   # перезаписать эталон
//
// Chromium не скачивается: playwright-core@1.62 ждёт ревизию
// chromium_headless_shell-1234, которая уже есть в ~/.cache/ms-playwright.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'backend', 'app', 'static');
const BASELINE = path.join(ROOT, 'tools', 'game-snapshot.json');
const UPDATE = process.argv.includes('--update');

const SEED = 0x51ca7e;
const FRAME_MS = 1000 / 60;

// ---------------------------------------------------------------- сценарий
// Кадры — абсолютные; ввод диспатчится до шага кадра. Фазы по документу:
// демо → прыжок → двойной + 360 → разгон → сальто → долгий заезд → демо.
const SCRIPT = [
  { run: 360, label: 'demo' }, // 6 с автопилота
  { act: 'tap' },
  { run: 8 },
  { act: 'release' },
  { run: 92, label: 'jump' },
  { act: 'tap' },
  { run: 6 },
  { act: 'release' },
  { run: 21 }, // ~0.35 с в воздухе
  { act: 'tap' },
  { run: 6 },
  { act: 'release' }, // двойной прыжок
  { run: 10 },
  { act: 'spin' },
  { run: 100, label: 'double-360' },
  { act: 'tap' }, // зажали: через 280 мс включится разгон
  { run: 150, label: 'boost' },
  { act: 'release' },
  { run: 60 },
  { act: 'flip' },
  { run: 90, label: 'flip' },
  { run: 720, label: 'run' }, // долгий заезд
  { run: 420, label: 'back-to-demo' }, // 7 с тишины → AUTO_DELAY → автопилот
];

// Прогон туториал-гейтов: без засеянного localStorage. Шаги без флага
// tutor не кликают карточку — чекпоинты gate-*/gate-open фиксируют
// открытую карточку и замороженную сцену; шаги с tutor кликают «Понял»
// по каждой открывшейся карточке и игра идёт дальше.
const TUTOR_SCRIPT = [
  { run: 30 },
  { act: 'tap' },
  { run: 200, label: 'gate-start' }, // «Корова на скейте» висит открытой
  { run: 90, tutor: true }, // «Понял» → секунда игры
  { act: 'tap' },
  { run: 300, tutor: true }, // прыжок → приземление: «double»/«ob» прокликиваются
  { act: 'tap' },
  { run: 300, tutor: true },
  { run: 900, tutor: true, label: 'mid' },
  { run: 400, label: 'gate-open' }, // следующий гейт остаётся открытым
  { run: 700, tutor: true, label: 'end' },
];

const VIEWPORTS = [
  {
    name: 'desktop-1280x720',
    context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    coarse: false,
    tutored: true,
  },
  {
    name: 'mobile-390x780',
    context: {
      viewport: { width: 390, height: 780 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    },
    coarse: true,
    tutored: true,
  },
  {
    name: 'tutorial-390x780',
    context: {
      viewport: { width: 390, height: 780 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    coarse: true,
    tutored: false,
    script: TUTOR_SCRIPT,
  },
];

// ---------------------------------------------------------------- init-хук
// Выполняется в странице до любого её кода (addInitScript).
const initHook = ({ seed, coarse, tutored }) => {
  // обычные сценарии не должны вставать на туториал-паузы: помечаем все
  // гейты пройденными (туториал прогоняется отдельным вьюпортом)
  if (tutored) {
    try {
      localStorage.setItem(
        'cow-skate-tut',
        JSON.stringify(['start', 'ob', 'double', 'ramp', 'loop']),
      );
    } catch (e) {
      /* storage недоступен — тогда гейты просто не встанут */
    }
  }

  // mulberry32 — тот же генератор, что в game/utils.js (rng)
  let rs = seed | 0;
  Math.random = () => {
    rs = (rs + 0x6d2b79f5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // pointer: coarse эмулируется нестабильно — форсируем через matchMedia
  if (coarse) {
    const realMM = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      if (/pointer:\s*coarse/.test(q)) {
        return {
          matches: true,
          media: q,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent: () => false,
        };
      }
      return realMM(q);
    };
  }

  // ---- виртуальное время: часы, таймеры и rAF двигает только __vt.step
  let vNow = 0;
  const rafQ = [];
  const timers = new Map();
  let tSeq = 0;

  window.requestAnimationFrame = (cb) => (rafQ.push(cb), rafQ.length);
  window.cancelAnimationFrame = (id) => {
    rafQ[id - 1] = undefined;
  };
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = ++tSeq;
    timers.set(id, { at: vNow + ms, fn, args, iv: 0 });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = ++tSeq;
    timers.set(id, { at: vNow + (ms || 1), fn, args, iv: ms || 1 });
    return id;
  };
  window.clearInterval = (id) => timers.delete(id);
  Object.defineProperty(performance, 'now', { value: () => vNow });
  Date.now = () => vNow;

  window.__vt = {
    now: () => vNow,
    // Один кадр: часы → истекшие таймеры → очередь rAF.
    step(ms) {
      vNow += ms;
      const due = [];
      for (const [id, t] of timers) if (t.at <= vNow) due.push([id, t]);
      due.sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, t] of due) {
        if (!timers.has(id)) continue;
        if (t.iv) t.at = vNow + t.iv;
        else timers.delete(id);
        t.fn(...t.args);
      }
      const q = rafQ.splice(0, rafQ.length);
      for (const cb of q) if (cb) cb(vNow);
      return vNow;
    },
    // сигнал конца boot: игра встала в rAF-цикл (последняя строка boot .then)
    queued: () => rafQ.reduce((n, cb) => n + (cb ? 1 : 0), 0),
  };

  // Ввод как у пользователя: pointerdown на canvas, клавиши на window.
  window.__act = (name) => {
    const cv = document.getElementById('scene');
    const pointer = (type) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
      });
    const key = (code, type) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true }));
    if (name === 'tap') cv.dispatchEvent(pointer('pointerdown'));
    else if (name === 'release') window.dispatchEvent(pointer('pointerup'));
    else if (name === 'jump') key('Space', 'keydown');
    else if (name === 'spin') key('KeyQ', 'keydown');
    else if (name === 'flip') key('KeyE', 'keydown');
    else if (name === 'kick') key('KeyR', 'keydown');
    else if (name === 'gasOn') key('ArrowRight', 'keydown');
    else if (name === 'gasOff') key('ArrowRight', 'keyup');
    else if (name === 'brakeOn') key('ArrowLeft', 'keydown');
    else if (name === 'brakeOff') key('ArrowLeft', 'keyup');
  };

  // Снимок: SHA-256 пикселей обоих canvas + состояние HUD.
  window.__snap = async () => {
    const px = async (id) => {
      const c = document.getElementById(id);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      const buf = await crypto.subtle.digest('SHA-256', d.data);
      return Array.from(new Uint8Array(buf), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    };
    const el = (id) => document.getElementById(id);
    const [scene, bloom] = await Promise.all([px('scene'), px('bloom')]);
    return {
      scene,
      bloom,
      hud: {
        score: el('score').textContent,
        best: el('best').textContent,
        autoHidden: el('auto').hidden,
        hudClass: el('hud').className,
        ctaClass: el('cta').className,
        coachText: el('coach').textContent,
        coachClass: el('coach').className,
        resultHtml: el('result').innerHTML,
        resultClass: el('result').className,
        hintClass: el('hint').className,
        tutorClass: el('tutor').className,
        tutorTitle: el('tutorTitle').textContent,
      },
    };
  };
};

// ---------------------------------------------------------------- http-сервер
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(STATIC, rel || 'index.html');
    if (!file.startsWith(STATIC)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

// ---------------------------------------------------------------- прогон
async function runViewport(browser, origin, vp) {
  const context = await browser.newContext(vp.context);
  await context.addInitScript(initHook, {
    seed: SEED,
    coarse: vp.coarse,
    tutored: vp.tutored,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // сеть герметична: наружу (fonts/telegram) не ходим — абортим
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return u.startsWith(origin) ? route.continue() : route.abort();
  });

  await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
  // ждём конца boot-цепочки: после requestAnimationFrame(frame) прогрев
  // (initAssets, layout, 60×update) уже отработал — кадровая петля детерминирована.
  // Поллим из node: waitForFunction сам встаёт в нашу очередь rAF.
  for (let i = 0; i < 400; i++) {
    const ready = await page.evaluate(
      () => window.__vt && window.__vt.queued() > 0,
    );
    if (ready) break;
    if (i === 399) throw new Error('boot не завершился за ~20 с');
    await new Promise((r) => {
      setTimeout(r, 50);
    });
  }

  let frame = 0;
  const checkpoints = [];
  for (const step of vp.script || SCRIPT) {
    if (step.act) await page.evaluate((a) => window.__act(a), step.act);
    if (step.run) {
      frame += step.run;
      await page.evaluate(
        ({ n, dt, tutor }) => {
          for (let i = 0; i < n; i++) {
            window.__vt.step(dt);
            // туториал-прогон: открытую карточку закрываем «Понял»
            if (
              tutor &&
              document.getElementById('tutor').classList.contains('on')
            )
              document.getElementById('tutorOk').click();
          }
        },
        { n: step.run, dt: FRAME_MS, tutor: !!step.tutor },
      );
    }
    if (step.label) {
      const snap = await page.evaluate(() => window.__snap());
      checkpoints.push({ label: step.label, frame, ...snap });
    }
  }
  if (errors.length) throw new Error(`pageerror: ${errors.join(' | ')}`);
  const dims = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return { w: c.width, h: c.height };
  });
  await context.close();
  return { canvas: dims, checkpoints };
}

function diffRun(base, got) {
  const diffs = [];
  const n = Math.max(base.checkpoints.length, got.checkpoints.length);
  for (let i = 0; i < n; i++) {
    const a = base.checkpoints[i],
      b = got.checkpoints[i];
    if (!a || !b) {
      diffs.push(`checkpoint[${i}]: ${a ? 'лишний' : 'нет'} в прогоне`);
      continue;
    }
    for (const k of ['scene', 'bloom']) {
      if (a[k] !== b[k])
        diffs.push(
          `${b.label || i}@${b.frame}: ${k} ${a[k].slice(0, 12)}… → ${b[k].slice(0, 12)}…`,
        );
    }
    if (JSON.stringify(a.hud) !== JSON.stringify(b.hud))
      diffs.push(`${b.label || i}@${b.frame}: hud отличается`);
  }
  return diffs;
}

// ---------------------------------------------------------------- main
async function main() {
  const server = await serveStatic();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--disable-gpu'],
  });
  try {
    const result = { seed: SEED, frameMs: FRAME_MS, viewports: {} };
    for (const vp of VIEWPORTS) {
      // двойной прогон: детерминизм проверяется до сравнения с эталоном
      const [run1, run2] = [
        await runViewport(browser, origin, vp),
        await runViewport(browser, origin, vp),
      ];
      const selfDiff = diffRun(run1, run2);
      if (selfDiff.length) {
        console.error(`[${vp.name}] недетерминизм (прогон 1 vs 2):`);
        for (const d of selfDiff) console.error(`  ${d}`);
        process.exitCode = 2;
        return;
      }
      result.viewports[vp.name] = run1;
      console.log(
        `[${vp.name}] детерминизм ок, ${run1.checkpoints.length} чекпоинтов`,
      );
    }

    if (UPDATE) {
      await writeFile(BASELINE, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`эталон записан: ${path.relative(ROOT, BASELINE)}`);
      return;
    }

    let baseline;
    try {
      baseline = JSON.parse(await readFile(BASELINE, 'utf8'));
    } catch {
      console.error(
        `нет эталона ${path.relative(ROOT, BASELINE)} — запусти с --update`,
      );
      process.exitCode = 2;
      return;
    }

    let bad = 0;
    for (const vp of VIEWPORTS) {
      const want = baseline.viewports?.[vp.name];
      if (!want) {
        console.error(`[${vp.name}] нет в эталоне`);
        bad++;
        continue;
      }
      const diffs = diffRun(want, result.viewports[vp.name]);
      if (diffs.length) {
        bad++;
        console.error(`[${vp.name}] расхождение с эталоном:`);
        for (const d of diffs) console.error(`  ${d}`);
      } else {
        console.log(`[${vp.name}] совпадает с эталоном`);
      }
    }
    if (bad) process.exitCode = 1;
    else console.log('снапшот совпал');
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
