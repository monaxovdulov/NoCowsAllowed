// @ts-check
/* Cow Skate × Telegram: отправка рекордов, общий топ, share.
   Работает и в game-webview (карточка игры, ?s=session) и как Mini App
   (initData). Вне Telegram — тихий no-op, игра остаётся standalone. */
(function () {
  'use strict';

  var tg = (window.Telegram && window.Telegram.WebApp) || null;
  var proxy =
    window.TelegramGameProxy ||
    (window.Telegram && window.Telegram.Game && window.Telegram.Game.Proxy) ||
    null;
  var session = new URLSearchParams(location.search).get('s') || null;
  var initData = (tg && tg.initData) || '';
  var myId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user
    ? tg.initDataUnsafe.user.id
    : null;

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#0b0e17');
      tg.setBackgroundColor('#0b0e17');
      // Вертикальный свайп по умолчанию сворачивает приложение — в игре
      // это случайные закрытия на резких движениях.
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }
    } catch (e) { /* старые клиенты — просто играем */ }
  }

  // Фаза 0: один заезд — один POST со статистикой (дистанция, длительность,
  // причина конца, лучший множитель). Место в топе уходит в карточку
  // результата DOM-событием cowskate:rank — модули игры про Telegram не знают.
  /** @param {import('./game/types').RunEndDetail} d итоги заезда */
  function submitScore(d) {
    if (!session && !initData) return; // нет идентичности — локальный заезд
    if (!(d.score > 0)) return; // нулевые заезды в топ не несём
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session,
        init_data: initData || null,
        score: d.score,
        distance_m: Math.round(d.distM),
        duration_s: Math.ceil(d.durationS),
        crash_reason: d.crashReason || 'idle',
        max_mult: d.stats ? d.stats.maxMult : null,
      }),
      keepalive: true,
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (!res) return;
        document.dispatchEvent(
          new CustomEvent('cowskate:rank', {
            detail: { n: d.n, rank: res.rank, prevRank: res.prev_rank },
          })
        );
      })
      .catch(function () { /* сеть мигнула — заезд остался локально */ });
  }

  document.addEventListener('cowskate:run-end', function (e) {
    if (e.detail) submitScore(e.detail);
  });

  // ------------------------------------------------------------------ top
  /** @type {HTMLDivElement | null} */
  var overlay = null;
  /** @type {HTMLButtonElement | null} */
  var boardBtn = null;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:60;display:none;align-items:center;' +
      'justify-content:center;background:rgba(5,8,15,.82)';
    overlay.innerHTML =
      '<div class="ui" style="width:min(420px,92vw);max-height:78vh;display:flex;' +
      'flex-direction:column;border-radius:18px;border:1px solid rgba(255,255,255,.18);' +
      'background:rgba(10,14,26,.92);overflow:hidden">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12)">' +
      '<b style="font:800 13px/1 Unbounded,ui-rounded,sans-serif;letter-spacing:.1em;' +
      'text-transform:uppercase">🏆 Общий топ</b>' +
      '<div style="display:flex;gap:8px">' +
      (proxy
        ? '<button data-share style="cursor:pointer;border:1px solid rgba(255,216,74,.5);' +
          'background:rgba(255,216,74,.16);color:#ffd84a;border-radius:999px;' +
          'padding:6px 12px;font:700 10px/1 Unbounded,sans-serif;letter-spacing:.08em;' +
          'text-transform:uppercase">Поделиться</button>'
        : '') +
      '<button data-close style="cursor:pointer;border:1px solid rgba(255,255,255,.2);' +
      'background:transparent;color:#eef2fb;border-radius:999px;padding:6px 12px;' +
      'font:700 10px/1 Unbounded,sans-serif;letter-spacing:.08em;text-transform:uppercase">' +
      'Закрыть</button></div></div>' +
      '<div data-list style="overflow-y:auto;padding:10px 12px"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      var t = /** @type {HTMLElement} */ (e.target);
      if (t === overlay || t.hasAttribute('data-close')) {
        overlay.style.display = 'none';
      }
      if (t.hasAttribute('data-share') && proxy) {
        proxy.shareScore();
      }
    });

    boardBtn = document.createElement('button');
    boardBtn.className = 'ui';
    boardBtn.textContent = '🏆';
    boardBtn.title = 'Общий топ';
    boardBtn.style.cssText =
      'position:fixed;right:16px;top:calc(52px + env(safe-area-inset-top,0px));' +
      'z-index:40;width:40px;height:40px;border-radius:12px;cursor:pointer;' +
      'border:1px solid rgba(255,255,255,.18);background:rgba(10,14,26,.72);' +
      'color:#eef2fb;font-size:16px;display:grid;place-items:center';
    document.body.appendChild(boardBtn);
    boardBtn.addEventListener('click', openBoard);
  }

  function openBoard() {
    overlay.style.display = 'flex';
    var list = /** @type {HTMLElement} */ (
      overlay.querySelector('[data-list]')
    );
    list.innerHTML =
      '<div style="padding:18px;text-align:center;opacity:.6;' +
      'font:500 11px/1.6 Unbounded,sans-serif">Загрузка…</div>';
    fetch('/api/leaderboard?limit=50')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var rows = (data && data.entries) || [];
        if (!rows.length) {
          list.innerHTML =
            '<div style="padding:18px;text-align:center;opacity:.6;' +
            'font:500 11px/1.6 Unbounded,sans-serif">Пока пусто — будь первым!</div>';
          return;
        }
        list.innerHTML = rows
          .map(function (row) {
            var me = row.user_id === myId;
            var name = row.username
              ? '@' + row.username
              : row.first_name;
            return (
              '<div style="display:flex;align-items:center;gap:10px;padding:9px 8px;' +
              'border-radius:10px;' +
              (me ? 'background:rgba(255,216,74,.14);' : '') +
              'font:500 12px/1.2 Unbounded,ui-rounded,sans-serif">' +
              '<span style="width:30px;text-align:right;opacity:.55">' +
              row.position + '</span>' +
              '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;' +
              'white-space:nowrap">' +
              escapeHtml(name) + '</span>' +
              '<b style="color:#ffd84a;font-variant-numeric:tabular-nums">' +
              Number(row.score).toLocaleString('ru-RU') + '</b></div>'
            );
          })
          .join('');
      })
      .catch(function () {
        list.innerHTML =
          '<div style="padding:18px;text-align:center;opacity:.6;' +
          'font:500 11px/1.6 Unbounded,sans-serif">Не удалось загрузить топ.</div>';
      });
  }

  /** @param {string} s */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildOverlay);
  } else {
    buildOverlay();
  }
})();
