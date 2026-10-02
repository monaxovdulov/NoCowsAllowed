// ---------------------------------------------------------------- game constants
export const CRUISE = 4.2,
  MAXSPD = 7.6,
  MINSPD = 2.3; // скорость в «ростах коровы» в секунду
export const GRAV = 7.6,
  OLLIE_V = 2.35,
  DOUBLE_V = 2.05;
// Турбо-машинг: тап по кнопке «ГАЗ» качает запас turbo (0..1), запас горит
// в добавку к целевой скорости и в тангенциальное ускорение на ride-дуге.
export const TURBO_PUMP = 0.16, // запаса за один тап
  TURBO_HOLD = 0.9, // запаса в секунду при зажатой кнопке/клавише
  TURBO_DRAIN = 0.34, // расход запаса в секунду (полная шкала ≈ 3 с буста)
  TURBO_EXTRA = 2.6, // +cowH/с к целевой скорости при полной шкале
  TURBO_RIDE_ACC = 5.4; // cowH/с² вдоль траектории ride при полной шкале
export const AUTO_DELAY_S = 4.5; // через столько секунд без касаний рулит автопилот
export const M_PER_COWH = 1.5; // метров в «росте коровы» — шкала дистанции заезда
export const SPECIAL_EVERY_COWH = 36; // не чаще одной спец-конструкции на столько ростов коровы
export const CLEAR_AFTER_LAND_COWH = 7; // чистая зона спавна после приземления
/** @type {import('./types').TrickTable} */
export const TRICKS = {
  spin: { name: '360', durationS: 0.5, pts: 100 },
  flip: { name: 'САЛЬТО', durationS: 0.56, pts: 150 },
  kick: { name: 'КИКФЛИП', durationS: 0.4, pts: 120 },
};
/** @type {import('./types').ObstacleTable} */
export const OBS = {
  // ширина и высота — в ростах коровы
  cone: { w: 0.19, h: 0.24, wt: 3 },
  hay: { w: 0.42, h: 0.29, wt: 2 },
  tire: { w: 0.26, h: 0.26, wt: 2 },
  can: { w: 0.18, h: 0.3, wt: 2 },
  barrier: { w: 0.46, h: 0.31, wt: 1.4, tall: true },
  cones: { w: 0.85, h: 0.24, wt: 1.4, long: true },
};
