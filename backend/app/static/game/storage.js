// ---------------------------------------------------------------- storage
// Доступ к localStorage (карта, этап 6.3, B4): в приватных режимах и
// части WebView он недоступен — бросает SecurityError. Предупреждаем
// один раз за сессию и живём без персистентности рекорда.

const BEST_KEY = 'cow-skate-best';
let warned = false;
/** @param {unknown} error */
function warnStorage(error) {
  if (warned) return;
  warned = true;
  console.warn('localStorage недоступен — рекорд не сохраняется:', error);
}

/** @returns {number} сохранённый рекорд (0, если пусто или недоступен) */
export function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return Math.max(0, parseInt(raw ?? '', 10) || 0);
  } catch (error) {
    warnStorage(error);
    return 0;
  }
}

/** @param {number} v рекорд для сохранения */
export function writeBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch (error) {
    warnStorage(error);
  }
}

const CLOVER_KEY = 'cow-skate-clover';
/** @returns {number} кошелёк клевера — всего собрано за все заезды (фаза 3) */
export function readClover() {
  try {
    const raw = localStorage.getItem(CLOVER_KEY);
    return Math.max(0, parseInt(raw ?? '', 10) || 0);
  } catch (error) {
    warnStorage(error);
    return 0;
  }
}

/** @param {number} v всего собранных клеверов */
export function writeClover(v) {
  try {
    localStorage.setItem(CLOVER_KEY, String(v));
  } catch (error) {
    warnStorage(error);
  }
}

const TUT_KEY = 'cow-skate-tut';
/** @returns {Set<string>} ids уже показанных туториал-гейтов */
export function readTutored() {
  try {
    const saved = JSON.parse(localStorage.getItem(TUT_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (error) {
    warnStorage(error);
    return new Set();
  }
}

/** @param {Iterable<string>} ids показанные гейты */
export function writeTutored(ids) {
  try {
    localStorage.setItem(TUT_KEY, JSON.stringify([...ids]));
  } catch (error) {
    warnStorage(error);
  }
}
