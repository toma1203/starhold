export const ENGINE_VERSION = '1.0.0';

export * from './types.ts';
export * from './rng.ts';
export * from './hex.ts';
export * from './costs.ts';
export * from './map.ts';
export * from './state.ts';
export * from './view.ts';
export * from './game.ts';
export * from './clone.ts';
export { productionFor } from './rules/roll.ts';
export { startTurn, advanceTurn } from './rules/turn.ts';
export { beginPirates, randomDiscard, stealRandom } from './rules/pirates.ts';
