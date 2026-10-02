// Паттерны трассы (продукт-план, фаза 2): готовые связки конструкций.
// Это данные, а не новые виды: каждый элемент проходит обычный spec.plan
// — движок типов паттерна не знает. Поля элемента:
//   type — вид из FEATURE_TYPES;
//   dataOverride — перезапись полей data после plan(); значение-массив —
//     случайный элемент (через pick, тот же поток Math.random);
//   gapAfterCowH — зазор ПОСЛЕ элемента в ростах коровы: число или
//     [min, max]; без него — плановый зазор вида.
// minZone — с какой зоны паттерн доступен; weight — вес в выборе.
/** @type {import('../types').SpawnPattern[]} */
export const PATTERNS = [
  // ритм «прыжок-прыжок»: два низких препятствия вплотную
  {
    id: 'pair',
    minZone: 2,
    weight: 3,
    items: [
      {
        type: 'ob',
        dataOverride: { kind: ['cone', 'hay', 'tire', 'can'] },
        gapAfterCowH: [3.2, 3.8],
      },
      {
        type: 'ob',
        dataOverride: { kind: ['cone', 'hay', 'tire', 'can'] },
      },
    ],
  },
  // «трюк, который надо докрутить»: вылет с кикера — препятствие стоит
  // в зоне приземления
  {
    id: 'kickgap',
    minZone: 2,
    weight: 3,
    items: [{ type: 'ramp', gapAfterCowH: [4.6, 5.6] }, { type: 'ob' }],
  },
  // цепь без пауз: три конуса в размеренном ритме — кормит комбо
  {
    id: 'ladder',
    minZone: 3,
    weight: 2,
    items: [
      { type: 'ob', dataOverride: { kind: 'cone' }, gapAfterCowH: 4.5 },
      { type: 'ob', dataOverride: { kind: 'cone' }, gapAfterCowH: 4.5 },
      { type: 'ob', dataOverride: { kind: 'cone' } },
    ],
  },
  // «туннель газа»: три препятствия подряд, за ними разбег к петле —
  // «ГАЗ» и прыжки одновременно (ширину разбега держит minGapBefore петли)
  {
    id: 'gasrun',
    minZone: 3,
    weight: 2,
    items: [
      {
        type: 'ob',
        dataOverride: { kind: ['cone', 'hay', 'tire', 'can'] },
        gapAfterCowH: [3.6, 4.4],
      },
      {
        type: 'ob',
        dataOverride: { kind: ['cone', 'hay', 'tire', 'can'] },
        gapAfterCowH: [3.6, 4.4],
      },
      {
        type: 'ob',
        dataOverride: { kind: ['cone', 'hay', 'tire', 'can'] },
      },
      { type: 'loop' },
    ],
  },
];
