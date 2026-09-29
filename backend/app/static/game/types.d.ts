// Доменные типы игры. Подключаются из JS через JSDoc:
//   /** @type {import('./types').GameState} */
// Рантайм их не грузит; проверка — tsc --checkJs (см. docs/refactoring-map.md).

export type Vec2 = [number, number];

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
  dur: number;
  pts: number;
}

export type ObstacleKind = 'cone' | 'hay' | 'tire' | 'can' | 'barrier' | 'cones';

export interface ObstacleSpec {
  w: number;
  h: number;
  wt: number;
  tall?: boolean;
  long?: boolean;
}

export type TrickTable = Record<TrickKind, TrickSpec>;
export type ObstacleTable = Record<ObstacleKind, ObstacleSpec>;

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
  dur: number;
  dir: 1 | -1;
}

export interface BoardSnap {
  bx: number;
  bh: number;
  brot: number;
  bkick: number;
}

export interface CrashState extends BoardSnap {
  t: number;
  dur: number;
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
  air: boolean;
  airT: number;
  airDur: number;
  jumps: 0 | 1 | 2;
  onRamp: boolean;
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
  invuln: number;
  shake: number;
  lift: number;
  zoomOut: number;
  hist: Pose[];
  histAcc: number;
  lastInput: number;
  autoSeq: TrickKind[];
  autoDouble: number;
  autoAfter: TrickKind | null;
  nextFlourish: number;
  nextSpawnX: number;
  score: number;
  best: number;
  touched0: boolean;
  playT0: number;
  coachStage: 0 | 1 | 2 | 3;
  coachText: string | null;
  coachUntil: number;
  resultUntil: number;
}

// ---------------------------------------------------------------- road features

export interface Ramp {
  type: 'ramp';
  X0: number;
  X1: number;
  hr: number;
}

export interface FlyState {
  h: number;
  vh: number;
  vx: number;
  rot: number;
  vr: number;
}

export interface Obstacle {
  type: 'ob';
  kind: ObstacleKind;
  X: number;
  over: boolean;
  cleared: boolean;
  fly: FlyState | null;
}

export type Feature = Ramp | Obstacle;

export interface GroundInfo {
  h: number;
  slope: number;
}

export interface Crack {
  X: number;
  hit: [boolean, boolean];
}

// ---------------------------------------------------------------- effects

interface ParticleBase {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

export interface DustParticle extends ParticleBase {
  k: 0;
  img: CanvasImageSource;
  r0: number;
  r1: number;
  a: number;
}

export interface SparkParticle extends ParticleBase {
  k: 1;
}

export interface RingParticle extends ParticleBase {
  k: 2;
}

export type Particle = DustParticle | SparkParticle | RingParticle;

export type PopKind = 'trick' | 'pts' | 'crash';

export interface Pop {
  text: string;
  kind: PopKind;
  slot: number;
  right: boolean;
  t: number;
  dur: number;
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

// ================================================================
// ЦЕЛЕВОЙ КОНТРАКТ (этапы 3–5 docs/refactoring-map.md). В коде пока
// не используется; уточнять при реализации синхронно с картой.
// ================================================================

// ---------------------------------------------------------------- режимы игрока

// ground — колёса на поверхности (асфальт, рампа, стол); air — полёт;
// ride — параметрическое катание по конструкции (петля, рейл, дуга);
// crash — анимация падения.
export type PlayerMode = 'ground' | 'air' | 'ride' | 'crash';

// hit — врезался; bail — не докрутил трюк; fall — упал в яму/с рейла;
// stall — не дотянул петлю и сорвался.
export type CrashReason = 'hit' | 'bail' | 'fall' | 'stall';

export interface TargetCrashState extends CrashState {
  reason: CrashReason;
}

// ---------------------------------------------------------------- конструкции

// Единая «оболочка» для всех фич трассы: горячие циклы (спавн, отсечение,
// сортировка по глубине, масштабирование при resize) читают только общие
// поля — одна форма объекта. Параметры вида — в data, их читает только
// стратегия своего типа. После этапа 5 заменяет Feature/Ramp/Obstacle.
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
  over: boolean;
  cleared: boolean;
  fly: FlyState | null;
}

export interface LoopData {
  r: number;
  entry: number;
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
  s: number;
  v: number;
}

export interface SpawnContext {
  X: number;
  cowH: number;
  spdN: number;
  rand(min: number, max: number): number;
}

export interface SpawnPlan<TData> {
  data: TData;
  lengthCowH: number;
  gapAfterCowH: number;
}

export type CollideResult = 'clear' | 'over' | 'hit';

export type RideStep = 'ride' | 'exit' | 'fail';

// Катание по конструкции как по одной степени свободы s ∈ [0, length].
export interface RideSpec<TData> {
  tricks: boolean;
  canEnter(feat: TrackFeature<string, TData>, state: GameState): boolean;
  length(feat: TrackFeature<string, TData>): number;
  path(feat: TrackFeature<string, TData>, s: number): PathPoint;
  step(
    feat: TrackFeature<string, TData>,
    ride: RideState,
    dtS: number,
  ): RideStep;
}

// Что делает автопилот демо-режима перед конструкцией: за leadS секунд
// до x0 — действие (hold — зажать разгон, например перед петлёй).
export interface AutopilotHint {
  leadS: number;
  action: 'jump' | 'double' | 'hold' | 'none';
}

export interface MarkerSpec {
  label: string;
  leadS: number;
  heightCowH: number;
}

// Стратегия вида конструкции: FEATURE_TYPES[type] = FeatureTypeSpec.
// Добавить конструкцию = новая запись в таблице + рисовальщик.
export interface FeatureTypeSpec<TData = unknown> {
  type: string;
  weight: number;
  minGapBeforeCowH: number;
  plan(ctx: SpawnContext): SpawnPlan<TData>;
  ground?(feat: TrackFeature<string, TData>, X: number): GroundInfo | null;
  collide?(
    feat: TrackFeature<string, TData>,
    X: number,
    h: number,
  ): CollideResult;
  ride?: RideSpec<TData>;
  marker?(feat: TrackFeature<string, TData>): MarkerSpec | null;
  autopilot?(feat: TrackFeature<string, TData>): AutopilotHint;
  depth(feat: TrackFeature<string, TData>): number;
  draw(feat: TrackFeature<string, TData>, blurPx: number): void;
}

// ---------------------------------------------------------------- события модели

export interface GameEventMap {
  land: CustomEvent<{ impact: number }>;
  airborne: CustomEvent<{ from: 'jump' | 'launch' }>;
  trick: CustomEvent<{ kind: AirMove }>;
  crash: CustomEvent<{ reason: CrashReason; score: number }>;
  score: CustomEvent<{ points: number; mult: number; total: number }>;
  'ride-enter': CustomEvent<{ type: string }>;
  'ride-exit': CustomEvent<{ type: string; result: RideStep }>;
}

// ---------------------------------------------------------------- events

export interface RunEndDetail {
  score: number;
  best: number;
}

declare global {
  interface DocumentEventMap {
    'cowskate:run-end': CustomEvent<RunEndDetail>;
  }
}
