import { z } from 'zod';

/**
 * Wire validation for everything a client can send. This is the server's security
 * boundary: engine handlers trust shapes, so every object is `.strict()` (unknown keys
 * are rejected) and every number is a bounded integer.
 */

const ResourceSchema = z.enum(['metal', 'energy', 'crystal', 'biomass']);
const IdSchema = z.string().max(16);
const CountSchema = z.number().int().min(1).max(999);
const BagValueSchema = z.number().int().min(0).max(99);

const BagSchema = z
  .object({
    metal: BagValueSchema,
    energy: BagValueSchema,
    crystal: BagValueSchema,
    biomass: BagValueSchema,
  })
  .strict();

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chooseHomeBonus'), resource: ResourceSchema }).strict(),
  z.object({ type: z.literal('roll') }).strict(),
  z.object({ type: z.literal('discard'), resources: BagSchema }).strict(),
  z.object({ type: z.literal('movePirate'), to: IdSchema }).strict(),
  z.object({ type: z.literal('bankTrade'), give: ResourceSchema, get: ResourceSchema }).strict(),
  z.object({ type: z.literal('offerTrade'), give: BagSchema, want: BagSchema }).strict(),
  z.object({ type: z.literal('respondTrade'), accept: z.boolean() }).strict(),
  z.object({ type: z.literal('confirmTrade'), with: IdSchema }).strict(),
  z.object({ type: z.literal('cancelTrade') }).strict(),
  z.object({ type: z.literal('buildFleet'), at: IdSchema }).strict(),
  z.object({ type: z.literal('buildColony'), at: IdSchema }).strict(),
  z.object({ type: z.literal('buildStarbase'), at: IdSchema }).strict(),
  z
    .object({ type: z.literal('expand'), from: IdSchema, to: IdSchema, count: CountSchema })
    .strict(),
  z
    .object({
      type: z.literal('attack'),
      from: IdSchema,
      to: IdSchema,
      dice: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      moveIfConquered: CountSchema.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('fortify'), from: IdSchema, to: IdSchema, count: CountSchema })
    .strict(),
  z.object({ type: z.literal('endTurn') }).strict(),
]);

/** Trim, strip every Unicode "Other" code point (control, format, ...), then 1..20 chars. */
export const NicknameSchema = z
  .string()
  .transform((s) => s.replace(/\p{C}/gu, '').trim())
  .pipe(z.string().min(1).max(20));

export const RoomCodeSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/),
);

export const TokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

export const SettingsSchema = z
  .object({
    targetVp: z.union([z.literal(6), z.literal(8), z.literal(10)]),
    turnSeconds: z.union([z.literal(60), z.literal(90), z.literal(120)]),
  })
  .strict();

export type RoomSettings = z.infer<typeof SettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { targetVp: 8, turnSeconds: 90 };
