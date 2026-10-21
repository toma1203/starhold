import { describe, expect, it } from 'vitest';
import { legalActions } from '@starhold/engine';
import { legalActionsFor } from '../src/game/legalCache.ts';
import { inPhase, makeState, viewOf } from './mapFixtures.ts';

describe('legalActionsFor', () => {
  const view = viewOf(inPhase(makeState(3, 1), 'MAIN', 0), 'p1');

  it('matches the engine', () => {
    expect(legalActionsFor(view, 'p1')).toEqual(legalActions(view, 'p1'));
    expect(legalActionsFor(view, 'p2')).toEqual(legalActions(view, 'p2'));
  });

  it('computes once per view and player', () => {
    expect(legalActionsFor(view, 'p1')).toBe(legalActionsFor(view, 'p1'));
    expect(legalActionsFor(view, 'p2')).not.toBe(legalActionsFor(view, 'p1'));
  });

  it('a new view object gets fresh results', () => {
    const next = viewOf(inPhase(makeState(3, 1), 'ROLL', 0), 'p1');
    expect(legalActionsFor(next, 'p1')).toEqual([{ type: 'roll' }]);
    expect(legalActionsFor(view, 'p1')).not.toEqual([{ type: 'roll' }]);
  });
});
