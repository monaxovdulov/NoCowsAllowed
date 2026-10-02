// Реестр видов конструкций (карта, этап 5, D4): добавить вид =
// + запись здесь. Движок не знает типов — диспетчит по этой таблице.
import { rampSpec } from './ramp.js';
import { obstacleSpec } from './obstacle.js';
import { loopSpec } from './loop.js';
import { coinsSpec } from './coins.js';

/** @type {Record<string, import('../types').FeatureTypeSpec>} */
export const FEATURE_TYPES = {
  ramp: rampSpec,
  ob: obstacleSpec,
  loop: loopSpec,
  coins: coinsSpec,
};
