// ------------------------------------------------------------ difficulty
// Кривая сложности заезда (продукт-план, фаза 2): зона растёт с метрами —
// zone = 1 + floor(distM / ZONE_M). params(zone) — чистая функция номера
// зоны: скорость, зазоры, веса видов и доступные паттерны. Подъём зоны —
// событие 'zone' (передышка спавна — features.js, +1 к цепи — combo.js,
// баннер и тон сцены — ui.js); сброс зоны на новый заезд идёт молча.
import { ZONE_M } from './constants.js';
import { emit } from './events.js';
import { state } from './state.js';
import { PATTERNS } from './track/patterns.js';

// ?zone=N — отладочный старт сразу в зоне N (как ?feat=)
const ZONE0 = Math.max(
  1,
  parseInt(new URLSearchParams(location.search).get('zone') || '', 10) || 1,
);

/**
 * Параметры зоны — чистая функция (таблица фазы 2 в продукт-плане):
 * крейсер +0.3 cowH/с за зону (потолок 6.0), зазоры ×0.93 (пол 0.65),
 * потолок газа +0.3 (потолок 9.0).
 * weights — множители spec.weight на зоне (0 — вид не спавнится, нет
 * ключа — вес вида как в спеке); доступность видов препятствий режет
 * сама спека по ctx.zone.
 * @param {number} zone номер зоны (>= 1)
 * @returns {import('./types').ZoneParams}
 */
export function params(zone) {
  return {
    cruise: Math.min(6.0, 4.2 + 0.3 * (zone - 1)),
    maxSpd: Math.min(9.0, 7.6 + 0.3 * (zone - 1)),
    gapK: Math.max(0.65, 0.93 ** (zone - 1)),
    weights: { loop: zone >= 2 ? 1 : 0 },
    patterns: PATTERNS.filter((p) => p.minZone <= zone),
  };
}

// текущие параметры — кэш на кадр-уровень, пересчёт при смене зоны
let cur = params(ZONE0);
/** @returns {import('./types').ZoneParams} параметры текущей зоны */
export const zoneParams = () => cur;

/** @returns {number} номер зоны по дистанции заезда (в демо — базовая) */
const zoneNow = () => ZONE0 + Math.floor((state.run?.distM ?? 0) / ZONE_M);

/**
 * Кадр кривой сложности (вызов — main.js:update после stepRun, до
 * спавна): подъём публикует 'zone', падение (конец заезда) — молча.
 */
export function stepDifficulty() {
  const z = zoneNow();
  if (z === state.zone) return;
  const rising = z > state.zone;
  state.zone = z;
  cur = params(z);
  if (rising) emit('zone', { zone: z });
}
