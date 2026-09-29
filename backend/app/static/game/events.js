// ---------------------------------------------------------------- events
// Шина событий модели (карта рефакторинга, этап 3, D6): платформенный
// EventTarget доставляет событие синхронно в порядке подписки, поэтому
// emit() эквивалентен прямому вызову подписчиков на месте — порядок
// побочных эффектов и последовательность Math.random не меняются.

/** @type {EventTarget} */
export const bus = new EventTarget();

/**
 * @template {keyof import('./types').GameEventMap} K
 * @param {K} type имя события
 * @param {import('./types').EventDetail<K>} detail полезная нагрузка
 */
export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * @template {keyof import('./types').GameEventMap} K
 * @param {K} type имя события
 * @param {(detail: import('./types').EventDetail<K>) => void} fn подписчик
 */
export function on(type, fn) {
  bus.addEventListener(type, (e) => fn(/** @type {CustomEvent} */ (e).detail));
}
