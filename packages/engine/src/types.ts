export type Resource = 'metal' | 'energy' | 'crystal' | 'biomass';
export const RESOURCES: readonly Resource[] = ['metal', 'energy', 'crystal', 'biomass'];
export type ResourceBag = Record<Resource, number>;
export type PlayerId = string;
export type SectorId = string; // `${q},${r}`
export interface Hex {
  q: number;
  r: number;
}
export type SectorKind = 'resource' | 'nebula' | 'home';
export type Structure = 'none' | 'colony' | 'starbase';
export interface Sector {
  id: SectorId;
  hex: Hex;
  kind: SectorKind;
  resource: Resource | null;
  number: number | null;
  tradeStation: boolean;
  owner: PlayerId | null;
  fleets: number;
  structure: Structure;
}
export type BotLevel = 'easy' | 'normal';
export interface SeatConfig {
  id: PlayerId;
  name: string;
  isBot: boolean;
  botLevel: BotLevel | null;
}
export interface GameSettings {
  seats: SeatConfig[];
  targetVp: 6 | 8 | 10;
}
export interface PlayerState extends SeatConfig {
  seat: number;
  resources: ResourceBag;
  conquests: number;
  homeId: SectorId;
}
export type Phase = 'HOME_BONUS' | 'ROLL' | 'DISCARD' | 'PIRATE' | 'MAIN' | 'FINISHED';
export interface TradeOffer {
  from: PlayerId;
  give: ResourceBag;
  want: ResourceBag;
  accepted: PlayerId[];
  declined: PlayerId[];
}
export interface Awards {
  largestEmpire: PlayerId | null;
  warlord: PlayerId | null;
}
export interface GameState {
  settings: GameSettings;
  sectors: Record<SectorId, Sector>;
  sectorIds: SectorId[];
  players: PlayerState[];
  current: number;
  round: number;
  phase: Phase;
  dice: [number, number] | null;
  pirate: SectorId | null;
  pendingDiscards: Record<PlayerId, number>;
  offer: TradeOffer | null;
  conqueredThisTurn: boolean;
  awards: Awards;
  winner: PlayerId | null;
  endReason: 'target' | 'roundLimit' | null;
  rng: number;
}
export type Action =
  | { type: 'chooseHomeBonus'; resource: Resource }
  | { type: 'roll' }
  | { type: 'discard'; resources: ResourceBag }
  | { type: 'movePirate'; to: SectorId }
  | { type: 'bankTrade'; give: Resource; get: Resource }
  | { type: 'offerTrade'; give: ResourceBag; want: ResourceBag }
  | { type: 'respondTrade'; accept: boolean }
  | { type: 'confirmTrade'; with: PlayerId }
  | { type: 'cancelTrade' }
  | { type: 'buildFleet'; at: SectorId }
  | { type: 'buildColony'; at: SectorId }
  | { type: 'buildStarbase'; at: SectorId }
  | { type: 'expand'; from: SectorId; to: SectorId; count: number }
  | { type: 'attack'; from: SectorId; to: SectorId; dice: 1 | 2 | 3; moveIfConquered?: number }
  | { type: 'fortify'; from: SectorId; to: SectorId; count: number }
  | { type: 'endTurn' };
export type GameEvent =
  | { type: 'turnStarted'; player: PlayerId; round: number }
  | { type: 'homeBonus'; player: PlayerId; resource: Resource }
  | { type: 'diceRolled'; player: PlayerId; dice: [number, number] }
  | { type: 'produced'; gains: Record<PlayerId, ResourceBag> }
  | { type: 'discarded'; player: PlayerId; count: number }
  | { type: 'pirateMoved'; player: PlayerId; to: SectorId }
  | { type: 'stolen'; thief: PlayerId; victim: PlayerId; resource: Resource | null }
  | { type: 'bankTraded'; player: PlayerId; give: Resource; giveCount: number; get: Resource }
  | { type: 'tradeOffered'; offer: TradeOffer }
  | { type: 'tradeResponded'; player: PlayerId; accept: boolean }
  | { type: 'traded'; a: PlayerId; b: PlayerId; aGave: ResourceBag; bGave: ResourceBag }
  | { type: 'tradeCancelled' }
  | { type: 'built'; player: PlayerId; what: 'fleet' | 'colony' | 'starbase'; at: SectorId }
  | { type: 'expanded'; player: PlayerId; from: SectorId; to: SectorId; count: number }
  | {
      type: 'battle';
      attacker: PlayerId;
      defender: PlayerId;
      from: SectorId;
      to: SectorId;
      attackRoll: number[];
      defendRoll: number[];
      attackerLosses: number;
      defenderLosses: number;
      conquered: boolean;
    }
  | { type: 'fortified'; player: PlayerId; from: SectorId; to: SectorId; count: number }
  | { type: 'awardChanged'; award: keyof Awards; player: PlayerId | null }
  | { type: 'gameOver'; winner: PlayerId; reason: 'target' | 'roundLimit' };
export type ErrorCode =
  | 'err.notYourTurn'
  | 'err.wrongPhase'
  | 'err.insufficientResources'
  | 'err.invalidSector'
  | 'err.notOwned'
  | 'err.notAdjacent'
  | 'err.notConnected'
  | 'err.invalidCount'
  | 'err.invalidDice'
  | 'err.homeProtected'
  | 'err.noOffer'
  | 'err.invalidTrade'
  | 'err.gameOver';
/**
 * Runtime list of every ErrorCode. The Record type makes the compiler reject a missing or
 * unknown code, so this list can never drift from the union.
 */
const ERROR_CODE_SET: Record<ErrorCode, true> = {
  'err.notYourTurn': true,
  'err.wrongPhase': true,
  'err.insufficientResources': true,
  'err.invalidSector': true,
  'err.notOwned': true,
  'err.notAdjacent': true,
  'err.notConnected': true,
  'err.invalidCount': true,
  'err.invalidDice': true,
  'err.homeProtected': true,
  'err.noOffer': true,
  'err.invalidTrade': true,
  'err.gameOver': true,
};
export const ERROR_CODES: readonly ErrorCode[] = Object.keys(ERROR_CODE_SET) as ErrorCode[];
export type ActionResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ErrorCode };
export type Handler = (s: GameState, p: PlayerId, a: Action) => ActionResult;
/** What each rules/*.ts module exports; game.ts spreads these into its dispatch table. */
export type HandlerTable = Partial<Record<Action['type'], Handler>>;
