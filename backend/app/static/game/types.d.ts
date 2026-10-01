// Доменные типы игры. Подключаются из JS через JSDoc:
//   /** @type {import('./types').GameState} */
// Рантайм их не грузит; проверка — tsc --checkJs (см. docs/refactoring-map.md).

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- assets

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PivotRect extends Rect {
  pivot: Vec2;
}

export interface BoardRect extends Rect {
  axis: [Vec2, Vec2];
}

export interface CowMeta {
  base: Rect;
  ear: PivotRect;
  tag: PivotRect;
  board: BoardRect;
  contact: [Vec2, Vec2];
}

export type CowLayer = 'base' | 'board' | 'ear' | 'tag';
export type CowSources = Record<CowLayer, string>;
export type CowImages = Record<CowLayer, CanvasImageSource>;

// ---------------------------------------------------------------- constants

export type TrickKind = 'spin' | 'flip' | 'kick';
export type AirMove = TrickKind | 'double';
export type Action = 'jump' | TrickKind;

export interface TrickSpec {
  name: string;
  durationS: number;
  pts: number;
}

export type ObstacleKind =
  | 'cone'
  | 'hay'
  | 'tire'
  | 'can'
  | 'barrier'
  | 'cones';

export interface ObstacleSpec {
  w: number;
  h: number;
  wt: number;
  tall?: boolean;
  long?: boolean;
}

export type TrickTable = Record<TrickKind, TrickSpec>;
export type ObstacleTable = Record<ObstacleKind, ObstacleSpec>;
export type ObstacleEntry = [ObstacleKind, ObstacleSpec];

// ---------------------------------------------------------------- geometry

export interface Geometry {
  s: number;
  cowH: number;
  u: number;
  ox: number;
  oy: number;
  horizon: number;
  edgeY: number;
  refY: number;
  K: number;
  vx: number;
  zEdge: number;
  zBottom: number;
  kR: number;
  kF: number;
  obD: number;
  obL: number;
  skyOff: number;
  hg: CanvasGradient;
  rg: CanvasGradient;
}

export interface TextureSize {
  w: number;
  h: number;
}

// ---------------------------------------------------------------- cow

export interface Pose {
  x?: number;
  y: number;
  tilt: number;
  sq: number;
  spin?: number;
  roll?: number;
}

export interface WheelPoint {
  x: number;
  y: number;
  z: number;
}

export interface ActiveTrick {
  kind: TrickKind;
  t: number;
  durationS: number;
  dir: 1 | -1;
}

export interface BoardSnap {
  bx: number;
  bh: number;
  brot: number;
  bkick: number;
}

// hit — врезался; bail — не докрутил трюк; fall — упал в яму/с рейла;
// stall — не дотянул петлю и сорвался.
export type CrashReason = 'hit' | 'bail' | 'fall' | 'stall';

export interface CrashState extends BoardSnap {
  reason: CrashReason;
  t: number;
  durationS: number;
  r0: number;
  r1: number;
  bvx: number;
  bvh: number;
  bvr: number;
  bvk: number;
  snap: BoardSnap | null;
}

// ---------------------------------------------------------------- game state

export interface GameState {
  t: number;
  camX: number;
  speed: number;
  throttle: -1 | 0 | 1;
  boost: number;
  spdN: number;
  bob: number;
  bobV: number;
  tilt: number;
  tiltV: number;
  h: number;
  hV: number;
  // автомат режимов (карта, этап 4, D5): переходы — только через
  // enterGround/enterAir/enterCrash/enterRide в player.js
  mode: PlayerMode;
  airT: number;
  airDurationS: number;
  jumps: 0 | 1 | 2;
  isOnRamp: boolean;
  slope: number;
  sq: number;
  sqV: number;
  ear: number;
  earV: number;
  tag: number;
  tagV: number;
  spin: number;
  roll: number;
  kick: number;
  kickDrop: number;
  trick: ActiveTrick | null;
  trickQ: TrickKind | null;
  airTricks: AirMove[];
  airBonus: number;
  crash: CrashState | null;
  ride: RideState | null;
  invuln: number;
  shake: number;
  lift: number;
  zoomOut: number;
  hist: PoseRing;
  histAcc: number;
  lastInput: number;
  autoSeq: TrickKind[];
  autoDouble: number;
  autoAfter: TrickKind | null;
  nextFlourish: number;
  nextSpawnX: number;
  clearSpawnX: number;
  score: number;
  best: number;
  isTouched0: boolean;
  playT0: number;
  coachStage: 0 | 1 | 2 | 3;
  coachText: string | null;
  coachUntil: number;
  resultUntil: number;
}

// ---------------------------------------------------------------- road features

export interface FlyState {
  h: number;
  vh: number;
  vx: number;
  rot: number;
  vr: number;
}

export interface GroundInfo {
  h: number;
  slope: number;
}

export interface Crack {
  X: number;
  isHit: [boolean, boolean];
}

// Кольцевой буфер фиксированной ёмкости (utils.makeRing): FIFO,
// at(0) — старейший элемент; переполнение затирает старейший.
export interface Ring<T> extends Iterable<T> {
  readonly length: number;
  at(i: number): T | undefined;
  push(v: T): void;
  shift(): T | undefined;
  clear(): void;
}

// Алиасы для callsite-приведений makeRing(...) — в одну строку
// (переносы строки, начинающейся с `import(`, ломают build-standalone.py).
export type PoseRing = Ring<Pose>;
export type CrackRing = Ring<Crack>;

// ---------------------------------------------------------------- effects

export type ParticleKind = 'dust' | 'spark' | 'ring';

// Единая мономорфная форма частицы (карта, этап 5, S2): все поля
// присутствуют всегда — стабильная hidden class. Создаётся только
// фабриками createDust/createSpark/createRing в effects.js.
export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  // dust: спрайт и радиус разрастания; у spark/ring — null/0
  img: CanvasImageSource | null;
  r0: number;
  r1: number;
  a: number;
}

export type PopKind = 'trick' | 'pts' | 'crash';

export interface Pop {
  text: string;
  kind: PopKind;
  slot: number;
  right: boolean;
  t: number;
  durationS: number;
  x: number;
  y: number;
}

export interface SpeedLine {
  x: number;
  yN: number;
  len: number;
  th: number;
  a: number;
  sp: number;
  front: boolean;
}

export interface Cloud {
  img: HTMLCanvasElement;
  x: number;
  gap: number;
  yN: number;
  scale: number;
  par: number;
  drift: number;
  alpha: number;
}

export interface Streak {
  x: number;
  y: number;
  c: [number, number, number];
  w: number;
  f: number;
  ph: number;
  base: number;
}

export type ObstacleSprite = HTMLCanvasElement & { pad: number };
export type ObstacleSprites = Partial<Record<ObstacleKind, ObstacleSprite>>;

// ---------------------------------------------------------------- режимы игрока

// ground — колёса на поверхности (асфальт, рампа, стол); air — полёт;
// ride — параметрическое катание по конструкции (петля, рейл, дуга);
// crash — анимация падения.
export type PlayerMode = 'ground' | 'air' | 'ride' | 'crash';

// ---------------------------------------------------------------- конструкции

// Единая «оболочка» для всех фич трассы: горячие циклы (спавн, отсечение,
// сортировка по глубине, масштабирование при resize) читают только общие
// поля — одна форма объекта. Параметры вида — в data, их читает только
// стратегия своего типа.
// Правило единиц: x0/x1 — мировые пиксели (масштабируются в layout()),
// всё в data — в «ростах коровы» (cowH) и не масштабируется.
export interface TrackFeature<TType extends string = string, TData = unknown> {
  id: number;
  type: TType;
  x0: number;
  x1: number;
  data: TData;
}

export interface RampData {
  hr: number;
}

export interface ObstacleData {
  kind: ObstacleKind;
  isOver: boolean;
  isCleared: boolean;
  fly: FlyState | null;
}

export type RampFeature = TrackFeature<'ramp', RampData>;
export type ObstacleFeature = TrackFeature<'ob', ObstacleData>;
export type LoopFeature = TrackFeature<'loop', LoopData>;
export type AnyFeature = RampFeature | ObstacleFeature | LoopFeature;

export interface LoopData {
  // радиус петли и дистанция от x0 до точки входа (низ круга), cowH
  r: number;
  entry: number;
  // попытка уже была: повторный заезд в ту же петлю не предлагаем
  isTried: boolean;
}

export interface RailData {
  h: number;
}

// Точка траектории катания: мировой X, высота над асфальтом (cowH),
// угол касательной (рад, 0 — горизонтально, π — вверх ногами).
export interface PathPoint {
  X: number;
  h: number;
  angle: number;
}

export interface RideState {
  feat: TrackFeature;
  // пройденная длина дуги и скорость вдоль неё (cowH и cowH/с)
  s: number;
  v: number;
  // текущий угол касательной для позы (рад, canvas-знак)
  ang: number;
  // демо-автопилот уже исполнил трюк на дуге
  isAutoDone: boolean;
}

export interface SpawnContext {
  X: number;
  cowH: number;
  spdN: number;
  rand(min: number, max: number): number;
}

export interface SpawnPlan<TData> {
  data: TData;
  // длина конструкции в ростах коровы: x1 = x0 + lengthCowH * cowH
  lengthCowH: number;
  // зазор до следующей конструкции в ростах коровы (от x1)
  gapAfterCowH: number;
}

export type CollideResult = 'clear' | 'over' | 'hit';

export type RideStep = 'ride' | 'exit' | 'fail';

// Катание по конструкции как по одной степени свободы s ∈ [0, length].
export interface RideSpec<TData, TType extends string = string> {
  tricks: boolean;
  canEnter(feat: TrackFeature<TType, TData>, state: GameState): boolean;
  length(feat: TrackFeature<TType, TData>): number;
  path(feat: TrackFeature<TType, TData>, s: number): PathPoint;
  step(
    feat: TrackFeature<TType, TData>,
    ride: RideState,
    dtS: number,
  ): RideStep;
}

// Что делает автопилот демо-режима перед конструкцией: за leadS секунд
// до at (мировой X точки срабатывания) — действие (hold — зажать разгон,
// например перед петлёй). null = конструкция для автопилота уже позади.
export interface AutopilotHint {
  at: number;
  leadS: number;
  action: 'jump' | 'double' | 'hold' | 'none';
}

export interface MarkerSpec {
  label: string;
  leadS: number;
  heightCowH: number;
  // миниатюра для значка у правого края (кольцо-таймер)
  icon?: CanvasImageSource;
}

// Стратегия вида конструкции: FEATURE_TYPES[type] = FeatureTypeSpec.
// Добавить конструкцию = новая запись в таблице + рисовальщик.
export interface FeatureTypeSpec<
  TData = unknown,
  TType extends string = string,
> {
  type: TType;
  // вес в выборе вида при спавне (относительный, не обязан суммироваться)
  weight: number;
  // минимальный зазор до предыдущей конструкции в ростах коровы
  minGapBeforeCowH: number;
  // «спец-конструкция»: рейт-лимит SPECIAL_EVERY_COWH между такими
  special?: boolean;
  plan(ctx: SpawnContext): SpawnPlan<TData>;
  ground?(feat: TrackFeature<TType, TData>, X: number): GroundInfo | null;
  collide?(
    feat: TrackFeature<TType, TData>,
    X: number,
    h: number,
  ): CollideResult;
  ride?: RideSpec<TData, TType>;
  // кадровый апдейт фичи (например, сбитый обломок в полёте)
  step?(feat: TrackFeature<TType, TData>, dt: number): void;
  marker?(feat: TrackFeature<TType, TData>): MarkerSpec | null;
  autopilot?(feat: TrackFeature<TType, TData>): AutopilotHint | null;
  depth?(feat: TrackFeature<TType, TData>): number;
  draw?(feat: TrackFeature<TType, TData>, blurPx: number): void;
  // отрисовка отдельным проходом поверх коровы (обломок в полёте)
  drawFlying?(feat: TrackFeature<TType, TData>): void;
}

// ---------------------------------------------------------------- события модели

export interface GameEventMap {
  // приземление на поверхность (impact = -hV в момент касания; 0 — возврат
  // после крэша, не настоящее приземление)
  land: CustomEvent<{ impact: number }>;
  // взлетели: jump — олли, double — второй прыжок в воздухе, launch — вылет с конструкции
  airborne: CustomEvent<{ from: 'jump' | 'double' | 'launch' }>;
  // трюк завершён (включая 'double' — всплывает «ДВОЙНОЙ»)
  trick: CustomEvent<{ kind: AirMove }>;
  // падение: score — счёт на момент крэша, wheels — колёса в экранных
  // координатах (сняты до установки mode='crash', чтобы вибрация совпала)
  crash: CustomEvent<{
    reason: CrashReason;
    score: number;
    wheels: WheelPoint[];
  }>;
  // очки начислены: points — уже с множителем, total — счёт после начисления
  score: CustomEvent<{ points: number; mult: number; total: number }>;
  // заезд на траекторию ride-конструкции (петля и т.п.)
  'ride-enter': CustomEvent<{ type: string }>;
  // сход с траектории: result 'exit' — доехал; ok=false — откатился назад
  // (недобор скорости без крэша); result 'fail' — срыв → будет crash
  'ride-exit': CustomEvent<{ type: string; result: RideStep; ok: boolean }>;
}

// Тип полезной нагрузки события по его имени (для emit/on в events.js).
export type EventDetail<K extends keyof GameEventMap> =
  GameEventMap[K] extends CustomEvent<infer D> ? D : never;

// ---------------------------------------------------------------- events

export interface RunEndDetail {
  score: number;
  best: number;
}

// ---------------------------------------------------------------- telegram

// Минимальный контракт Telegram для telegram-bridge.js: WebApp (Mini App)
// и Game.Proxy (карточка игры). Проверки вида typeof в мосте остаются —
// поля опциональны, потому что старые клиенты их не дают.
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id?: number } };
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?(): void;
}

export interface TelegramGameProxy {
  shareScore(): void;
}

declare global {
  interface DocumentEventMap {
    'cowskate:run-end': CustomEvent<RunEndDetail>;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Game?: { Proxy?: TelegramGameProxy };
    };
    TelegramGameProxy?: TelegramGameProxy;
  }
}
