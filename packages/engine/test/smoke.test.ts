import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index.ts';

describe('engine package', () => {
  it('exposes its version', () => {
    expect(ENGINE_VERSION).toBe('1.0.0');
  });
});
