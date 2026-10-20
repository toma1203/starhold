import { expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { Action } from '@starhold/engine';
import type { ActionSchema } from '../src/index.ts';

// Compile-time only: `npm run typecheck` must see this file (tsconfig includes test/).
expectTypeOf<z.infer<typeof ActionSchema>>().toEqualTypeOf<Action>();
