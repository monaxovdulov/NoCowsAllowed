// ---------------------------------------------------------------- game constants
export const CRUISE = 4.2, MAXSPD = 7.6, MINSPD = 2.3;  // скорость в «ростах коровы» в секунду
export const GRAV = 7.6, OLLIE_V = 2.35, DOUBLE_V = 2.05;
export const AUTO_DELAY = 4.5;                           // через столько секунд без касаний рулит автопилот
export const TRICKS = {
  spin: { name: '360', dur: 0.5, pts: 100 },
  flip: { name: 'САЛЬТО', dur: 0.56, pts: 150 },
  kick: { name: 'КИКФЛИП', dur: 0.4, pts: 120 },
};
export const OBS = {            // ширина и высота — в ростах коровы
  cone: { w: 0.19, h: 0.24, wt: 3 },
  hay: { w: 0.42, h: 0.29, wt: 2 },
  tire: { w: 0.26, h: 0.26, wt: 2 },
  can: { w: 0.18, h: 0.3, wt: 2 },
  barrier: { w: 0.46, h: 0.31, wt: 1.4, tall: true },
  cones: { w: 0.85, h: 0.24, wt: 1.4, long: true },
};
