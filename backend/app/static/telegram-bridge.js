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

  function toast(text) {
    var el = document.createElement('div');
    el.className = 'ui';
    el.textContent = text;
    el.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:50;' +
      'padding:8px 14px;border-radius:999px;background:rgba(10,14,26,.72);' +
      'border:1px solid rgba(255,255,255,.18);color:#eef2fb;' +
      'font:700 11px/1 "Unbounded",ui-rounded,"Segoe UI",system-ui,sans-serif;' +
      'letter-spacing:.08em;text-transform:uppercase;pointer-events:none;' +
      'opacity:0;transition:opacity .25s ease';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    }, 2200);
  }

  function submitScore(best) {
    if (!session && !initData) return; // нет идентичности — локальный заезд
    if (!(best > 0)) return;
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session,
        init_data: initData || null,
        score: best,
      }),
      keepalive: true,
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (!res) return;
        toast(
          res.is_new_best
            ? '🏆 Рекорд! #' + res.rank + ' в общем топе'
            : 'Счёт принят · #' + res.rank + ' в общем топе'
        );
      })
      .catch(function () { /* сеть мигнула — рекорд остался локально */ });
  }

  document.addEventListener('cowskate:run-end', function (e) {
    submitScore(e.detail && e.detail.best);
  });

  // ------------------------------------------------------------------ top
  var overlay = null;
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
      if (e.target === overlay || e.target.hasAttribute('data-close')) {
        overlay.style.display = 'none';
      }
      if (e.target.hasAttribute('data-share') && proxy) {
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
    var list = overlay.querySelector('[data-list]');
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
