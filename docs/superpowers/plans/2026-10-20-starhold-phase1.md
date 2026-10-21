# Starhold Phase 1 (Web, Space Theme) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A publish-ready browser game (a resource economy plus territorial conquest in space) for 2–4 players with live online rooms, bots, EN/HR, deployed via Docker/Render from a public GitHub repo.

**Architecture:** npm-workspaces TypeScript monorepo. `packages/engine` is a pure, seeded rules reducer (`applyAction(state, playerId, action)`); `packages/bots` picks actions from a player's filtered view; `apps/server` (Express + Socket.IO) holds rooms in memory and is the only authority; `apps/web` (React + Vite) renders the filtered view as an SVG galaxy and sends actions. Internal packages are consumed as TypeScript source (no per-package build); the server is bundled with esbuild for production.

**Tech Stack:** Node 22, TypeScript 5.6 (strict), Vitest 2.1, fast-check 3, zod 3, Socket.IO 4.8, Express 4.21, helmet 8, React 18.3, Vite 5.4, zustand 5, wouter 3, @testing-library/react 16, Playwright 1.48, ESLint 9 + typescript-eslint 8, Prettier 3, esbuild 0.24, tsx 4.

**Spec:** `docs/superpowers/specs/2026-10-20-starhold-design.md`

## Global Constraints

- Package manager is **npm workspaces** (pnpm is not installed on the dev machine; this replaces "pnpm" in spec §3 with no other change).
- Node 22, `"type": "module"` everywhere, TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- Package names: `@starhold/engine`, `@starhold/bots`, `@starhold/protocol`, `@starhold/i18n`, `@starhold/theme-space`, `@starhold/server`, `@starhold/web`.
- Never use the words "Risk" or "Catan" in UI copy, code identifiers, assets, or docs other than the spec.
- Engine is pure: no `Math.random`, no `Date`, no I/O, never mutates input state. All randomness via the seeded RNG in state.
- Every user-visible string goes through i18n keys present in **both** `en` and `hr`.
- Map sizes: 2p → radius 2 hexagon (19 sectors); 3–4p → radius 3 hexagon minus 6 corners (31 sectors). Nebulae: 1 (2p) / 2 (3–4p), centre always nebula. Trade stations: 2 (2p) / 3 (3–4p).
- Number pool: `[2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12]`; 6 and 8 never adjacent.
- Costs: fleet = metal+energy; colony = metal+energy+crystal+biomass; starbase = 3 metal + 2 crystal.
- Start: home = colony with 3 fleets; 1 of each resource.
- Production: claimed 1, colony 2, starbase 2. Bank 4:1, 3:1 with any owned trade station.
- 7: players with >7 cards discard floor(n/2); 30 s to choose, else random. Pirate cannot stay put, cannot go to a home sector.
- Combat: attacker 1..min(3, fleets−1) dice; defender min(2, fleets); starbase defender +1 on highest die; ties → defender. Conquest moves between diceUsed and fleets−1 (default max). Colony transfers; starbase → colony. First conquest per turn steals 1 random card.
- VP: colony 1, starbase 2; Largest Empire +2 (most sectors, ≥5, strict to take); Warlord +2 (first to 3 conquests of enemy sectors, strict to take). Target 6/8(default)/10. Round limit 60.
- Turn timer 60/90(default)/120 s; on expiry bot finishes the turn; 2 consecutive expiries or disconnect → AFK until any action/reconnect.
- Rooms: 5-char codes from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; max 500 rooms; 4 seats; 20 msgs/s per socket; nickname 1–20 chars trimmed, control chars stripped; empty room deleted after 30 min, finished after 15 min; bot move delay 600–1200 ms.
- Player colours (Okabe–Ito) + shapes by seat: 0 `#E69F00` circle, 1 `#56B4E9` square, 2 `#009E73` triangle, 3 `#CC79A7` diamond.
- License: proprietary "All rights reserved" (public source). Repo: `github.com/toma1203/starhold`, public.
- Production env vars: `PORT` (default 3000), `STARHOLD_STATIC_DIR` (optional override of the web build path). Test-only env vars: `STARHOLD_BOT_DELAY_MS`, `STARHOLD_TURN_SECONDS`, `STARHOLD_DISCARD_SECONDS`.

## Review Focus

1. **Player reloads the page mid-game** (token in localStorage) → lands back in their seat with full state, not on the home screen. Pinned by Task 17 test `rejoin after socket disconnect restores seat` and Task 19 test `boots into rejoin when session exists`.
2. **Non-active player acts out of turn / double-clicks an action** (stale UI, two tabs) → server rejects with `err.notYourTurn` / `err.wrongPhase`, state and version unchanged. Pinned by Task 16 test `rejects out-of-turn action without bumping version`.
3. **Everyone in a room is a bot except one human who closes the tab** → game keeps running under AFK bots without hot-looping, room is cleaned 30 min after last human leaves. Pinned by Task 16 test `all-human-AFK game advances on timers only and room expires`.
4. **Discard on 7 while the discarding player is disconnected** → resolved automatically after the discard timeout, game not stuck. Pinned by Task 16 test `discard timeout auto-discards for disconnected player`.
5. **Hostile/malformed socket payloads** (unknown action type, negative counts, huge strings, flood) → rejected by zod / rate limiter, no crash, other rooms unaffected. Pinned by Task 17 tests `malformed action is rejected` and `flooding socket is throttled`.

---

## File Map

```
package.json                    workspaces, root scripts
tsconfig.base.json              shared compiler options
vitest.workspace.ts             test projects
eslint.config.js  .prettierrc  .gitignore  .editorconfig  LICENSE  CHANGELOG.md  README.md
.github/workflows/ci.yml
Dockerfile  .dockerignore  render.yaml
packages/engine/src/
  types.ts        all engine types (contract for every other package)
  rng.ts          seeded PRNG
  hex.ts          axial geometry
  map.ts          galaxy generator
  costs.ts        cost tables + bag helpers
  game.ts         createGame, applyAction dispatcher, turn advance
  view.ts         viewFor, filterEventsFor
  rules/home.ts  rules/roll.ts  rules/pirates.ts  rules/build.ts
  rules/trade.ts  rules/military.ts  rules/turn.ts
  combat.ts       pure dice resolution
  scoring.ts      VP, awards, winner checks
  legal.ts        legalActions
  index.ts
  test/           *.test.ts, helpers.ts
packages/bots/src/   easy.ts normal.ts decide.ts eval.ts index.ts  test/
packages/protocol/src/ schemas.ts events.ts index.ts  test/
packages/i18n/src/  en.ts hr.ts index.ts  test/
themes/space/src/   theme.ts icons.tsx index.ts
apps/server/src/
  config.ts  codes.ts  sanitize.ts
  room.ts         one room: lobby + game loop + timers
  roomManager.ts  registry + cleanup
  socket.ts       Socket.IO handlers + rate limit
  http.ts         express app (helmet, healthz, static)
  index.ts        bootstrap
  test/
apps/web/
  index.html  vite.config.ts  public/(manifest.webmanifest, icons, og.png)
  src/main.tsx  App.tsx  routes.tsx
  src/net/socket.ts  src/net/session.ts
  src/store/gameStore.ts
  src/i18n/useT.ts
  src/audio/sfx.ts
  src/screens/ HomeScreen LobbyScreen GameScreen EndScreen
  src/pages/   RulesPage PrivacyPage CreditsPage NotFoundPage
  src/game/    GalaxyMap SectorHex ResourcePanel ActionBar PlayerList EventLog TurnTimer
               dialogs/(TradeDialog AttackDialog MoveDialog DiscardDialog HomeBonusPicker PirateHint)
  src/ui/      Toasts ErrorBoundary Button Dialog LanguageSwitch MuteToggle
  src/styles/  tokens.css app.css
  test/  e2e/(playwright.config.ts, game.spec.ts)
```

---

### Task 1: Monorepo scaffold, tooling, GitHub repo, CI skeleton

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.editorconfig`, `LICENSE`, `.github/workflows/ci.yml`
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`, `packages/engine/test/smoke.test.ts`

**Interfaces:**
- Produces: root scripts `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`; package template (`"exports": {".": "./src/index.ts"}`, `"type": "module"`, `"private": true`, scripts `typecheck: tsc --noEmit`, `test: vitest run`).

- [ ] **Step 1: Write the smoke test** `packages/engine/test/smoke.test.ts`: `expect(ENGINE_VERSION).toBe('1.0.0')` importing from `../src/index.ts`.
- [ ] **Step 2: Run** `npx vitest run packages/engine` → FAIL (module missing / no vitest).
- [ ] **Step 3: Create root config.** `package.json` workspaces `["packages/*","themes/*","apps/*"]`, `engines.node ">=22"`, devDependencies at the Tech Stack versions; `typecheck` runs `npm run typecheck --workspaces --if-present`; `test` runs `vitest run`. `tsconfig.base.json`: target ES2022, module/moduleResolution `Bundler`, `allowImportingTsExtensions`, `noEmit`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, `jsx: react-jsx`, `skipLibCheck`. `vitest.workspace.ts` lists every package/app dir. ESLint flat config with typescript-eslint recommended + `no-console: ["error", {allow: ["warn","error"]}]` (server logger is exempted via its own file override). `.gitignore`: node_modules, dist, coverage, playwright-report, test-results, .env*. `LICENSE`: "Copyright (c) 2026 toma1203. All rights reserved." plus one paragraph: source is published for viewing only; no permission to copy, modify, distribute or host without written consent.
- [ ] **Step 4: Engine package** with `export const ENGINE_VERSION = '1.0.0'`. Run `npm install`, then `npx vitest run packages/engine` → PASS; `npm run lint && npm run typecheck` → exit 0.
- [ ] **Step 5: CI** `.github/workflows/ci.yml`: on push/PR, ubuntu-latest, Node 22, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`. (Build/e2e/docker jobs are added in Tasks 23–24.)
- [ ] **Step 6: Commit and publish repo**

```bash
git add -A && git commit -m "chore: scaffold npm-workspaces monorepo with lint, typecheck, tests, CI"
gh repo create toma1203/starhold --public --source . --remote origin --description "Online space strategy board game: build, trade, conquer." --push
```
Expected: repo URL printed; `gh run list --limit 1` shows CI queued/passing.

---

### Task 2: Engine types, seeded RNG, hex geometry

**Files:**
- Create: `packages/engine/src/types.ts`, `rng.ts`, `hex.ts`, `costs.ts`
- Test: `packages/engine/test/rng.test.ts`, `hex.test.ts`, `costs.test.ts`

**Interfaces:**
- Produces (exact; every later task depends on these names):

```ts
// types.ts
export type Resource = 'metal' | 'energy' | 'crystal' | 'biomass';
export const RESOURCES: readonly Resource[] = ['metal', 'energy', 'crystal', 'biomass'];
export type ResourceBag = Record<Resource, number>;
export type PlayerId = string;
export type SectorId = string;                 // `${q},${r}`
export interface Hex { q: number; r: number }
export type SectorKind = 'resource' | 'nebula' | 'home';
export type Structure = 'none' | 'colony' | 'starbase';
export interface Sector {
  id: SectorId; hex: Hex; kind: SectorKind;
  resource: Resource | null; number: number | null; tradeStation: boolean;
  owner: PlayerId | null; fleets: number; structure: Structure;
}
export type BotLevel = 'easy' | 'normal';
export interface SeatConfig { id: PlayerId; name: string; isBot: boolean; botLevel: BotLevel | null }
export interface GameSettings { seats: SeatConfig[]; targetVp: 6 | 8 | 10 }
export interface PlayerState extends SeatConfig { seat: number; resources: ResourceBag; conquests: number; homeId: SectorId }
export type Phase = 'HOME_BONUS' | 'ROLL' | 'DISCARD' | 'PIRATE' | 'MAIN' | 'FINISHED';
export interface TradeOffer { from: PlayerId; give: ResourceBag; want: ResourceBag; accepted: PlayerId[]; declined: PlayerId[] }
export interface Awards { largestEmpire: PlayerId | null; warlord: PlayerId | null }
export interface GameState {
  settings: GameSettings; sectors: Record<SectorId, Sector>; sectorIds: SectorId[];
  players: PlayerState[]; current: number; round: number; phase: Phase;
  dice: [number, number] | null; pirate: SectorId | null;
  pendingDiscards: Record<PlayerId, number>; offer: TradeOffer | null;
  conqueredThisTurn: boolean; awards: Awards;
  winner: PlayerId | null; endReason: 'target' | 'roundLimit' | null; rng: number;
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
  | { type: 'battle'; attacker: PlayerId; defender: PlayerId; from: SectorId; to: SectorId;
      attackRoll: number[]; defendRoll: number[]; attackerLosses: number; defenderLosses: number; conquered: boolean }
  | { type: 'fortified'; player: PlayerId; from: SectorId; to: SectorId; count: number }
  | { type: 'awardChanged'; award: keyof Awards; player: PlayerId | null }
  | { type: 'gameOver'; winner: PlayerId; reason: 'target' | 'roundLimit' };
export type ErrorCode =
  | 'err.notYourTurn' | 'err.wrongPhase' | 'err.insufficientResources' | 'err.invalidSector'
  | 'err.notOwned' | 'err.notAdjacent' | 'err.notConnected' | 'err.invalidCount'
  | 'err.invalidDice' | 'err.homeProtected' | 'err.noOffer' | 'err.invalidTrade' | 'err.gameOver';
export type ActionResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ErrorCode };
```

```ts
// rng.ts — mulberry32; state is a uint32 stored in GameState.rng
export function nextRandom(seed: number): [value: number, nextSeed: number]  // value in [0,1)
export function nextInt(seed: number, maxExclusive: number): [number, number]
export function rollDie(seed: number): [1|2|3|4|5|6, number]
export function shuffle<T>(seed: number, items: readonly T[]): [T[], number]   // Fisher–Yates
// hex.ts
export const hexId: (h: Hex) => SectorId
export const parseHexId: (id: SectorId) => Hex
export const HEX_DIRECTIONS: readonly Hex[]          // 6 axial directions
export function neighbors(h: Hex): Hex[]
export function distance(a: Hex, b: Hex): number
export function hexagon(radius: number): Hex[]       // all hexes with distance(0,0) <= radius
export function rotate60(h: Hex): Hex                // (q,r) -> (-r, q+r)
// costs.ts
export const COSTS: Record<'fleet'|'colony'|'starbase', ResourceBag>
export const emptyBag: () => ResourceBag
export const bagTotal: (b: ResourceBag) => number
export const hasAtLeast: (have: ResourceBag, need: ResourceBag) => boolean
export const addBag: (a: ResourceBag, b: ResourceBag) => ResourceBag
export const subBag: (a: ResourceBag, b: ResourceBag) => ResourceBag
export const numberWeight: (n: number) => number     // 6 - |7-n|, 0 for null/7
```

- [ ] **Step 1: Write failing tests.**
  - `rng.test.ts`: same seed → identical 1000-value sequence; `nextRandom` values in [0,1); `rollDie` over 6000 rolls from seed 1 hits each face 800–1200 times; `shuffle` is a permutation and deterministic per seed.
  - `hex.test.ts`: `hexagon(2).length === 19`, `hexagon(3).length === 37`; `neighbors({q:0,r:0})` has 6 unique entries each at distance 1; `distance({q:3,r:-1},{q:-1,r:3}) === 4`; `rotate60` applied 6× is identity; `parseHexId(hexId(h))` round-trips including negatives.
  - `costs.test.ts`: `COSTS.starbase` equals `{metal:3,energy:0,crystal:2,biomass:0}`; `hasAtLeast` true/false cases; `numberWeight(6)===5`, `numberWeight(2)===1`, `numberWeight(7)===0`.
- [ ] **Step 2: Run** `npx vitest run packages/engine` → FAIL (missing modules).
- [ ] **Step 3: Implement** the four files exactly per Interfaces (mulberry32 for `nextRandom`).
- [ ] **Step 4: Run** → PASS. `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `feat(engine): core types, seeded rng, hex geometry, cost tables`.

---

### Task 3: Galaxy map generator

**Files:**
- Create: `packages/engine/src/map.ts`
- Test: `packages/engine/test/map.test.ts`

**Interfaces:**
- Consumes: Task 2 `hex.ts`, `rng.ts`, types.
- Produces: `generateMap(playerCount: 2|3|4, seed: number): { sectors: Record<SectorId, Sector>; sectorIds: SectorId[]; homeIds: SectorId[]; seed: number }` — sectors unowned except nothing; homes have `kind:'home'`, `resource:null`, `number:null`, `owner:null` (createGame assigns owners). `HOME_POSITIONS: Record<2|3|4, Hex[]>`.

Fixed home positions (seat order):
- 2p: `(0,-2)`, `(0,2)`
- 3p: `(2,-3)`, `(1,2)`, `(-3,1)` (120° rotations)
- 4p: `(3,-1)`, `(-1,-2)`, `(-3,1)`, `(1,2)` (two 180° pairs; all distance 3 from centre, none corners, pairwise distance ≥3).

Algorithm (seeded, deterministic): tiles = `hexagon(r)` (minus corners for 3–4p) → centre = nebula, homes at fixed positions, extra nebula (3–4p) = random tile with distance ≥2 from every home → remaining tiles get resources from a shuffled balanced list (`RESOURCES` repeated, truncated to count) → numbers: shuffle the pool (concatenate a second shuffled pool if more tiles than 18), assign in tile order; if any two adjacent tiles both have 6 or 8, reshuffle numbers (max 1000 attempts, then deterministic swap repair) → choose trade stations as random resource tiles.

- [ ] **Step 1: Write failing tests** (run each over seeds 1..200 and player counts 2/3/4):
  - `sector count is 19/31/31`; `centre 0,0 is nebula`; `nebula count is 1/2/2`; `home count equals player count and homes are pairwise non-adjacent`; `every home is at distance 2 (2p) or 3 (3–4p) from centre`;
  - `resource counts differ by at most 1`; `every resource sector has a number in 2..12 except 7`; `no two adjacent sectors are both in {6,8}`; `trade station count is 2/3/3 and only on resource sectors`;
  - `same seed gives identical map`, `different seeds give different maps (seed 1 vs 2)`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `generateMap`** per algorithm above.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): balanced seeded galaxy generator`.

---

### Task 4: createGame, views, event filtering, test helpers

**Files:**
- Create: `packages/engine/src/game.ts` (createGame + `applyAction` dispatcher skeleton returning `err.wrongPhase` for unimplemented actions), `packages/engine/src/view.ts`, `packages/engine/test/helpers.ts`
- Modify: `packages/engine/src/index.ts` (re-export everything public)
- Test: `packages/engine/test/game.test.ts`, `view.test.ts`

**Interfaces:**
- Produces:
  - `createGame(settings: GameSettings, seed: number): GameState` — seats shuffled into turn order with the seeded RNG; each player owns their home (`structure:'colony'`, `fleets:3`), resources 1 each; `phase:'HOME_BONUS'`, `current:0`, `round:1`, `pirate:null`. Throws `Error('invalid seat count')` unless 2–4 seats with unique ids.
  - `applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult` — returns `err.gameOver` when `phase==='FINISHED'`; delegates to `rules/*` by `action.type` (later tasks fill the table `HANDLERS: Record<Action['type'], Handler>`, where `type Handler = (s: GameState, p: PlayerId, a: Action) => ActionResult`).
  - `currentPlayer(state): PlayerState`, `playerById(state, id): PlayerState`, `ownedSectors(state, id): Sector[]`.
  - `export interface PublicPlayer extends Omit<PlayerState,'resources'> { resources: ResourceBag | null; cardCount: number }`
  - `export interface PlayerView extends Omit<GameState,'players'|'rng'> { me: PlayerId | null; players: PublicPlayer[] }`
  - `export type ReadState = GameState | PlayerView` — every read-only helper in later tasks (`currentPlayer`, `ownedSectors`, `tradeRate`, `maxMovable`, `maxAttackDice`, `connectedOwned`, `victoryPoints`, `sectorCount`, `ranking`, `legalActions`) takes `ReadState`, so bots and the web client can call them on a view; only resource-reading helpers need `me`'s own bag (non-null in that player's view).
  - `viewFor(state: GameState, me: PlayerId | null): PlayerView` — only `me` sees their own `resources`; others `null`; `rng` removed.
  - `filterEventsFor(events: GameEvent[], me: PlayerId | null): GameEvent[]` — `stolen.resource` becomes `null` unless `me` is thief or victim; everything else unchanged.
  - `test/helpers.ts`: `makeGame(opts?: { players?: 2|3|4; seed?: number; targetVp?: 6|8|10 }): GameState` (seats `p1..pN`, names `P1..`), `withSector(state, id, patch: Partial<Sector>): GameState`, `withResources(state, playerId, bag: Partial<ResourceBag>): GameState`, `atPhase(state, phase, currentPlayerId?)`, `expectOk(result): {state, events}`, `expectErr(result, code)`.

- [ ] **Step 1: Write failing tests.**
  - `game.test.ts`: `createGame with 3 seats gives 3 players each owning exactly their home with 3 fleets`; `starting resources are 1 of each`; `turn order is a seeded permutation of seats (stable per seed)`; `rejects 1 or 5 seats and duplicate ids`; `applyAction on FINISHED returns err.gameOver`; `applyAction does not mutate input` (deep-freeze state before call).
  - `view.test.ts`: `viewFor hides other players' resources but keeps cardCount`; `viewFor(null) hides all`; `view has no rng key`; `filterEventsFor hides stolen resource from bystanders but not thief/victim`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per Interfaces (use `structuredClone` for copy-on-write in handlers).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): createGame, filtered player views, test helpers`.

---

### Task 5: Turn flow — home bonus, roll & production, end turn

**Files:**
- Create: `packages/engine/src/rules/home.ts`, `rules/roll.ts`, `rules/turn.ts`
- Modify: `packages/engine/src/game.ts` (register handlers)
- Test: `packages/engine/test/turn.test.ts`

**Interfaces:**
- Produces:
  - `startTurn(state: GameState): { state: GameState; events: GameEvent[] }` — exported from `rules/turn.ts`; sets `phase:'HOME_BONUS'`, `dice:null`, `conqueredThisTurn:false`, clears `offer`, emits `turnStarted`. (Task 10 adds the winner-at-start check and round limit here.)
  - `advanceTurn(state)` — moves `current` to next seat; when it wraps to 0, `round += 1`; then `startTurn`.
  - Handlers: `chooseHomeBonus` (HOME_BONUS only → +1 resource, `homeBonus` event, phase `ROLL`), `roll` (ROLL only → two `rollDie`, `diceRolled`; if sum≠7 apply production and go `MAIN`; if 7 → hand off to `beginPirates` from Task 6, temporarily go `MAIN`), `endTurn` (MAIN only → `advanceTurn`).
  - `productionFor(state, sum): Record<PlayerId, ResourceBag>` — sectors with `number===sum`, owned, not pirate: claimed 1, colony/starbase 2.

- [ ] **Step 1: Write failing tests** in `turn.test.ts`:
  - `chooseHomeBonus adds one resource and moves to ROLL`; `chooseHomeBonus by non-current player → err.notYourTurn`; `roll in HOME_BONUS → err.wrongPhase`;
  - `roll is deterministic per rng state`; `production pays 1 for claimed, 2 for colony, 2 for starbase` (set up sectors with `withSector` and force dice by choosing an rng seed found via helper `seedForSum(sum)` in helpers.ts that searches seeds until `rollDie×2` sums to the target);
  - `sector under pirate does not produce`; `unowned sectors produce nothing`; `produced event lists only players who gained`;
  - `endTurn passes to next player in HOME_BONUS and emits turnStarted`; `round increments after last seat`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** handlers and helpers; add `seedForSum` to `test/helpers.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): home bonus, dice production, turn rotation`.

---

### Task 6: Pirates — discard, move, steal

**Files:**
- Create: `packages/engine/src/rules/pirates.ts`
- Modify: `rules/roll.ts`, `game.ts`
- Test: `packages/engine/test/pirates.test.ts`

**Interfaces:**
- Produces:
  - `beginPirates(state): {state, events}` — sets `pendingDiscards[p] = floor(total/2)` for every player with total > 7; phase `DISCARD` if any pending, else `PIRATE`.
  - `discard` handler — allowed for any player with a pending entry (not only current) during `DISCARD`; bag total must equal the pending amount and be ≤ held, else `err.invalidCount`/`err.insufficientResources`; emits `discarded`; when none pending → `PIRATE`.
  - `randomDiscard(state, playerId): Action` — seeded random bag of the required size (used by server timeout); exported. Does not advance rng in returned state (pure suggestion using `state.rng` as seed).
  - `movePirate` handler — current player, `PIRATE` phase; target must exist, not `kind:'home'`, not equal current `pirate` (`err.invalidSector`); steals one random card (weighted by count) from target owner if owner ≠ mover and owner has cards; emits `pirateMoved` and `stolen`; phase `MAIN`.
  - `stealRandom(state, thief, victim): {state, events}` — exported for reuse by Task 9.

- [ ] **Step 1: Write failing tests**: `rolling 7 puts players over 7 cards into pendingDiscards with half rounded down` (9 cards → 4); `player with exactly 7 cards does not discard`; `non-current player can discard during DISCARD`; `wrong discard size → err.invalidCount`; `discarding more of a resource than held → err.insufficientResources`; `phase becomes PIRATE once all discards done`; `no discards needed → straight to PIRATE`; `pirate cannot target home or stay in place → err.invalidSector`; `moving pirate steals exactly one card from owner and emits stolen with resource`; `moving pirate onto own or empty sector steals nothing`; `randomDiscard returns a valid discard action for the pending amount`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): pirates on 7 with discards and stealing`.

---

### Task 7: Building and bank trade

**Files:**
- Create: `packages/engine/src/rules/build.ts`, `rules/trade.ts` (bank part)
- Modify: `game.ts`
- Test: `packages/engine/test/build.test.ts`, `bankTrade.test.ts`

**Interfaces:**
- Produces handlers (all: current player, `MAIN` phase):
  - `buildFleet {at}` — `at` owned by player (any structure, incl. home) → pay `COSTS.fleet`, `fleets+1`.
  - `buildColony {at}` — owned, `structure:'none'`, `kind !== 'home'` → pay, `structure:'colony'`.
  - `buildStarbase {at}` — owned, `structure:'colony'` (home allowed) → pay, `structure:'starbase'`.
  - `bankTrade {give, get}` — `give !== get`; rate = 3 if player owns any `tradeStation` sector else 4; pay rate × give, +1 get; emit `bankTraded` with `giveCount`.
  - `tradeRate(state, playerId): 3 | 4` exported.
- Every build emits `built`. Scoring/awards are recomputed in Task 10 (leave a call to `afterAction(state, events)` stub in `game.ts` that Task 10 fills; for now identity).

- [ ] **Step 1: Write failing tests**: per build — success deducts exact cost and changes sector; `insufficient resources → err.insufficientResources` with state untouched; `building on enemy/unowned → err.notOwned`; `colony on home or on existing colony → err.invalidSector`; `starbase on claimed sector → err.invalidSector`; `build outside MAIN → err.wrongPhase`; bank: `4:1 without station`, `3:1 with owned station`, `give===get → err.invalidTrade`, `not enough → err.insufficientResources`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): fleets, colonies, starbases and bank trading`.

---

### Task 8: Player-to-player trading

**Files:**
- Modify: `packages/engine/src/rules/trade.ts`, `game.ts`
- Test: `packages/engine/test/playerTrade.test.ts`

**Interfaces:**
- Produces handlers:
  - `offerTrade {give, want}` — current, MAIN; both bags non-negative integers, each total ≥1, no resource in both bags, offerer holds `give` → `offer = {from, give, want, accepted:[], declined:[]}` (replaces any existing offer); emits `tradeOffered`.
  - `respondTrade {accept}` — any non-offerer while `offer` exists (any phase while MAIN); `accept:true` requires responder holds `want` (`err.insufficientResources`); moves player between `accepted`/`declined` lists; emits `tradeResponded`.
  - `confirmTrade {with}` — offerer; `with` in `accepted`; re-check both still hold the bags; swaps; clears offer; emits `traded`.
  - `cancelTrade` — offerer; clears; emits `tradeCancelled`.
  - Offer is cleared automatically by `startTurn` (Task 5).

- [ ] **Step 1: Write failing tests**: `offer stores bags and emits tradeOffered`; `offer with overlapping resources → err.invalidTrade`; `offer with zero give → err.invalidTrade`; `offer not affordable → err.insufficientResources`; `offerer cannot respond`; `accept without resources → err.insufficientResources`; `confirm with non-acceptor → err.invalidTrade`; `confirm swaps exact bags`; `confirm fails if acceptor spent resources meanwhile → err.insufficientResources`; `respond without offer → err.noOffer`; `offer cleared on endTurn`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): player trade offers`.

---

### Task 9: Expansion, combat and fortify

**Files:**
- Create: `packages/engine/src/combat.ts`, `packages/engine/src/rules/military.ts`
- Modify: `game.ts`
- Test: `packages/engine/test/combat.test.ts`, `military.test.ts`

**Interfaces:**
- Produces:
  - `resolveBattle(attack: number[], defend: number[], defenderBonus: boolean): { attackerLosses: number; defenderLosses: number }` — sort both desc; if bonus, `defend[0] += 1`; compare pairwise up to `min(lengths)`; tie → attacker loses.
  - `expand {from,to,count}` — MAIN, current; `from` owned with fleets ≥2; `to` adjacent (`err.notAdjacent`), exists, `owner === null` (nebula allowed; else `err.invalidSector`); `1 ≤ count ≤ fleets−1` (`err.invalidCount`) → `to.owner = p`, `to.fleets = count`, `structure:'none'`; emits `expanded`.
  - `attack {from,to,dice,moveIfConquered?}` — MAIN, current; `from` owned, adjacent `to` owned by another player; `to.kind==='home'` → `err.homeProtected`; `1 ≤ dice ≤ min(3, from.fleets−1)` (`err.invalidDice`); defender dice = `min(2, to.fleets)`; rolls via rng; apply losses; if `to.fleets === 0`: move `m = clamp(moveIfConquered ?? (from.fleets−1), dice, from.fleets−1)` (if `from.fleets−1 < dice`, move `from.fleets−1`), transfer owner, starbase→colony, colony stays colony, `player.conquests += 1`; on first conquest of the turn steal via `stealRandom`; emits `battle` (+`stolen`).
  - `fortify {from,to,count}` — MAIN, current; both owned, `from !== to`, connected through owned sectors (BFS, `err.notConnected`); `1 ≤ count ≤ from.fleets−1`; moves; emits `fortified`; then `advanceTurn` (fortify ends the turn).
  - `maxMovable(state, sectorId): number` = `max(0, fleets−1)`; `maxAttackDice(state, sectorId): 0|1|2|3`.
  - `connectedOwned(state, playerId, from): Set<SectorId>`.

- [ ] **Step 1: Write failing tests.**
  - `combat.test.ts`: `[6,5,1] vs [6,4] → attacker 1 loss, defender 1 loss`; `[3] vs [2,2] → defender 1 loss`; `[5,5] vs [5] → attacker 1 loss`; `bonus turns [5] vs [5] with defender [4] into attacker loss`; `losses never exceed min(len)`.
  - `military.test.ts`: expand success; expand into owned/enemy → `err.invalidSector`; non-adjacent → `err.notAdjacent`; count 0 or = fleets → `err.invalidCount`; attack home → `err.homeProtected`; attack with dice > fleets−1 → `err.invalidDice`; attack own → `err.invalidSector`; deterministic battle via seeded state produces expected losses (use `seedForDice` helper added to helpers: search for a seed producing a given dice sequence); conquest transfers colony (VP moves) and downgrades starbase; conquest move respects `moveIfConquered` clamped to `[dice, fleets−1]`; first conquest in a turn steals one card, second doesn't; `conquests` increments only on enemy sector capture (not expand); fortify through connected chain succeeds and ends the turn; fortify across enemy sector → `err.notConnected`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): expansion, dice combat, conquest and fortify`.

---

### Task 10: Scoring, awards, victory, round limit

**Files:**
- Create: `packages/engine/src/scoring.ts`
- Modify: `game.ts` (`afterAction`), `rules/turn.ts` (start-of-turn checks)
- Test: `packages/engine/test/scoring.test.ts`

**Interfaces:**
- Produces:
  - `victoryPoints(state, playerId): number` — colonies 1, starbases 2 (home counts as its structure), +2 per award held.
  - `sectorCount(state, playerId): number`.
  - `updateAwards(state): { state; events }` — Largest Empire: if no holder, the unique leader with ≥5 sectors gets it; holder loses it to a player with strictly more sectors; holder below 5 loses it (then re-evaluate unique leader ≥5). Warlord: same logic with `conquests` and threshold 3. Emits `awardChanged` on any change.
  - `afterAction(state, events)` in `game.ts` — runs `updateAwards`; if `victoryPoints(current) >= targetVp` → `phase:'FINISHED'`, `winner`, `endReason:'target'`, emit `gameOver`.
  - `startTurn` additions: if the incoming current player already has ≥ target → finish (`target`); if `round > 60` → finish with `roundLimit`, winner = most VP, tiebreak more sectors, then more total fleets, then earlier seat.
  - `ranking(state): PlayerId[]` — same ordering used by round-limit and end screen.

- [ ] **Step 1: Write failing tests**: `fresh game: everyone has 1 VP`; `starbase counts 2`; `largest empire goes to first unique leader with 5 sectors`; `tie does not take the award from holder`; `strictly more takes it`; `holder dropping below 5 loses it`; `warlord at 3 conquests, transfer on strictly more`; `reaching target on own action finishes with winner`; `non-current player reaching target via award wins at start of their turn`; `round 61 ends game with roundLimit and ranking tiebreaks`; `actions after FINISHED → err.gameOver`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): victory points, awards and win conditions`.

---

### Task 11: legalActions and whole-game property tests

**Files:**
- Create: `packages/engine/src/legal.ts`
- Test: `packages/engine/test/legal.test.ts`, `packages/engine/test/properties.test.ts`

**Interfaces:**
- Produces: `legalActions(state: GameState | PlayerView, playerId: PlayerId): Action[]` — works on a view too (reads only public fields + own resources). Contents by phase:
  - HOME_BONUS (current): 4 × `chooseHomeBonus`.
  - ROLL (current): `roll`.
  - DISCARD: for a player with pending discards, **empty list** (discard choice is via `randomDiscard`/bot logic — documented).
  - PIRATE (current): one `movePirate` per valid target.
  - MAIN (current): affordable builds per valid sector; `bankTrade` per affordable (give,get) pair; `expand` per (from,to) with `count = maxMovable`; `attack` per (from,to) with `dice = maxAttackDice`; `fortify` per (from,to) connected pair with `count = maxMovable`; `endTurn`; `cancelTrade` if own offer exists; `confirmTrade` per acceptor. Trade offers are not enumerated.
  - Any phase while an `offer` exists, for a non-offerer who hasn't responded: `respondTrade {accept:false}` and, if affordable, `{accept:true}`.
  - Anyone else / FINISHED: `[]`.

- [ ] **Step 1: Write failing tests.**
  - `legal.test.ts`: `every action from legalActions applies ok` over 50 random mid-game states (states produced by playing random legal actions from seeds 1..50 for 0–200 steps); `endTurn always legal in MAIN for current`; `non-current player gets [] unless responding to a trade`.
  - `properties.test.ts` (fast-check, `numRuns: 300`, seed configurable via env `FC_SEED`): play a whole game choosing uniformly among `legalActions` for the current/pending player (use `randomDiscard` for discards, decline trades), capping at 20 000 actions; assert after every action: all resource counts ≥0; every owned sector fleets ≥1; unowned sectors have 0 fleets and structure `none`; home sectors always owned by their player; `pendingDiscards` only in DISCARD; VP equals recomputation; game reaches `FINISHED` with a winner.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `legalActions`**; fix any rule bugs the property test exposes (each fix gets a regression unit test in the owning test file).
- [ ] **Step 4: Run** `npx vitest run packages/engine` → PASS (all engine tests).
- [ ] **Step 5: Commit** `feat(engine): legal action enumeration and whole-game invariants`.

---

### Task 12: Bots (easy, normal) and tournament test

**Files:**
- Create: `packages/bots/package.json`, `tsconfig.json`, `src/eval.ts`, `src/easy.ts`, `src/normal.ts`, `src/decide.ts`, `src/index.ts`
- Test: `packages/bots/test/decide.test.ts`, `packages/bots/test/tournament.test.ts`

**Interfaces:**
- Consumes: engine `PlayerView`, `legalActions`, `Action`, `COSTS`, `numberWeight`, `RESOURCES`.
- Produces:
  - `decide(view: PlayerView, me: PlayerId, level: BotLevel, random: () => number): Action | null` — priority: (1) pending discard for me → discard action (keep resources needed for the cheapest affordable-next build; easy: random); (2) open offer I haven't answered → `respondTrade` (normal: accept iff `evalBag(get) − evalBag(give) > 0.5` and I can afford; easy: decline); (3) my turn → `chooseTurnAction`; (4) else `null`.
  - `easy.ts`: `chooseEasy(view, me, random)` — HOME_BONUS: resource held least; MAIN: 60% chance pick a random non-`endTurn` legal action that is a build/expand, otherwise `endTurn`; never attacks unless dice = 3; never fortifies.
  - `normal.ts`: `chooseNormal(view, me, random)` — scores each legal action with `eval.ts` and picks the best (ties broken by `random`); `endTurn` scores 0. Within 200 ms.
  - `eval.ts`: `sectorValue(sector) = numberWeight(number) × (structure==='none'?1:2)`; `evalBag(bag, view, me)` weights resources by scarcity in my production; `attackWinChance(attDice, defDice, bonus)` from a precomputed table (exact enumeration of dice outcomes, computed once at module load); action scores: colony/starbase = +10 per VP + production gain; fleet = +3 if any owned border sector (adjacent to enemy) has ≤ adjacent enemy fleets else +1; expand = 4 + `sectorValue(target)`; attack = `winChance × (sectorValue + 10×VP gained + award swing)` − 2 if win chance < 0.55 (skip below); pirate target = maximise leader's lost production, never self; bankTrade only if it immediately enables the highest-scoring build.

- [ ] **Step 1: Write failing tests.**
  - `decide.test.ts`: `returns null when nothing to do`; `discards exactly the pending amount`; `normal bot builds a colony when affordable on a 6/8 sector`; `normal bot does not attack with win chance < 0.55`; `bot never returns an action that applyAction rejects` (100 random states each level — states built by the engine with full `GameState`, bot sees `viewFor`); `attackWinChance(3,1,false) > 0.65` and `attackWinChance(1,2,false) < 0.3`.
  - `tournament.test.ts`: 200 seeded 2-player games normal vs easy (seat order alternating), driven by a loop that asks `decide` for every player with something to do; `normal wins ≥ 70%`; every game ends (≤20 000 actions). Mark with `{ timeout: 120_000 }`.
- [ ] **Step 2: Run** `npx vitest run packages/bots` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(bots): easy and normal AI players`.

---

### Task 13: Protocol schemas and typed socket events

**Files:**
- Create: `packages/protocol/package.json`, `src/schemas.ts`, `src/events.ts`, `src/index.ts`
- Test: `packages/protocol/test/schemas.test.ts`

**Interfaces:**
- Consumes: engine `Action`, `PlayerView`, `GameEvent`, `ErrorCode`, `BotLevel`.
- Produces:
  - `ActionSchema: z.ZodType<Action>` (discriminated union; bags are `z.object` of four `z.number().int().min(0).max(99)`; ids `z.string().max(16)`; counts `int 1..999`).
  - `NicknameSchema` (string, transform trim + strip `\p{C}`, then length 1..20), `RoomCodeSchema` (`/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/` after uppercase), `TokenSchema` (32 hex chars), `SettingsSchema` `{ targetVp: 6|8|10; turnSeconds: 60|90|120 }` with `export type RoomSettings = z.infer<typeof SettingsSchema>` (defaults `{targetVp: 8, turnSeconds: 90}`).
  - `type RoomPhase = 'LOBBY' | 'IN_GAME' | 'FINISHED'`
  - `interface SeatInfo { playerId: string; name: string; isBot: boolean; botLevel: BotLevel | null; connected: boolean; afk: boolean }`
  - `interface RoomInfo { code: string; phase: RoomPhase; hostId: string; seats: SeatInfo[]; settings: RoomSettings; you: string }`
  - `interface GameStatePayload { version: number; view: PlayerView; turnDeadline: number | null; discardDeadline: number | null }`
  - `type ServerError = { code: ErrorCode | RoomErrorCode }`, `RoomErrorCode = 'err.roomNotFound' | 'err.roomFull' | 'err.gameStarted' | 'err.notHost' | 'err.badRequest' | 'err.rateLimited' | 'err.serverFull' | 'err.notEnoughPlayers'`.
  - `type JoinAck = { ok: true; code: string; playerId: string; token: string } | { ok: false; error: RoomErrorCode }`
  - `interface ClientToServerEvents { 'room:create': (p: {name: string}, ack: (r: JoinAck) => void) => void; 'room:join': (p: {code: string; name: string}, ack) => void; 'room:rejoin': (p: {code: string; token: string}, ack) => void; 'room:leave': () => void; 'room:settings': (p: RoomSettings) => void; 'room:addBot': (p: {level: BotLevel}) => void; 'room:removeBot': (p: {playerId: string}) => void; 'room:start': () => void; 'room:rematch': () => void; 'game:action': (p: Action) => void }`
  - `interface ServerToClientEvents { 'room:state': (r: RoomInfo) => void; 'game:state': (g: GameStatePayload) => void; 'game:events': (e: GameEvent[]) => void; 'error': (e: ServerError) => void; 'room:closed': (p: {reason: 'expired' | 'serverRestart'}) => void }`

- [ ] **Step 1: Write failing tests**: `ActionSchema accepts every Action variant` (one sample each); `rejects unknown type`, `negative bag values`, `count 0`, `dice 4`, `extra-long ids`; `NicknameSchema trims and strips control chars`, `rejects empty after trim`, `rejects 21 chars`; `RoomCodeSchema uppercases and rejects ambiguous chars (O,0,I,1,L)`; a compile-time check file `test/types.test-d.ts` using `expectTypeOf<z.infer<typeof ActionSchema>>().toEqualTypeOf<Action>()`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Commit** `feat(protocol): zod schemas and typed socket events`.

---

### Task 14: i18n package (EN/HR)

**Files:**
- Create: `packages/i18n/package.json`, `src/en.ts`, `src/hr.ts`, `src/index.ts`
- Test: `packages/i18n/test/i18n.test.ts`

**Interfaces:**
- Produces:
  - `en` is the source dictionary: `export const en = { ... } as const` (flat dotted keys); `export type MessageKey = keyof typeof en`; `hr: Record<MessageKey, string>`.
  - `type Locale = 'en' | 'hr'`; `detectLocale(langs: readonly string[]): Locale` (first tag starting `hr` → `hr`, else `en`); `createT(locale): (key: MessageKey, params?: Record<string, string | number>) => string` — `{name}` interpolation; missing param left as `{name}`.
  - `plural(locale, n, forms: {one: string; few?: string; other: string})` — HR rules: one if n%10=1 && n%100≠11; few if n%10 in 2..4 && n%100 not in 12..14; else other.
  - Required key groups (implementer writes copy; HR must be natural Croatian): every `ErrorCode` and `RoomErrorCode`; `home.*` (title, tagline, nickname, create, join, code), `lobby.*` (copyLink, linkCopied, addBot, botEasy, botNormal, remove, start, waiting, settingsTarget, settingsTimer, host, you, needPlayers), `game.*` (phase names, roll, endTurn, build, buildFleet, buildColony, buildStarbase, bankTrade, offerTrade, accept, decline, confirm, cancel, attack, expand, fortify, dice, moveCount, discardTitle, discardHint, pirateHint, homeBonusTitle, yourTurn, waitingFor, timer, afk, disconnected, reconnecting, vp, cards, fleets, largestEmpire, warlord), `event.*` (one per GameEvent type), `end.*` (winner, rematch, home, ranking, reasonTarget, reasonRoundLimit), `pages.*` (rules sections, privacy, credits, notFound), `common.*` (close, back, language, mute, unmute, reload, somethingWrong), `theme.space.*` (resource names: metal=Metal/Metal… implementer: EN "Metal, Energy, Crystal, Biomass", HR "Metal, Energija, Kristali, Biomasa"; units: Fleet/Flota, Colony/Kolonija, Starbase/Zvjezdana baza, Pirates/Pirati, Nebula/Maglica, Home system/Matični sustav, Trade station/Trgovačka stanica).

- [ ] **Step 1: Write failing tests**: `hr has exactly the same keys as en`; `no value is empty`; `every engine ErrorCode has a key` (import the union via a runtime list `ERROR_CODES` exported from engine — add `export const ERROR_CODES: readonly ErrorCode[]` to engine `types.ts` in this step); `interpolates {name}`; `detectLocale(['hr-HR','en']) === 'hr'`, `detectLocale(['de']) === 'en'`; `HR plural: 1 flota, 2 flote, 5 flota, 11 flota, 21 flota, 22 flote`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(i18n): English and Croatian dictionaries`.

---

### Task 15: Server rooms — lobby lifecycle

**Files:**
- Create: `apps/server/package.json`, `tsconfig.json`, `src/config.ts`, `src/codes.ts`, `src/room.ts` (lobby half), `src/roomManager.ts`
- Test: `apps/server/test/lobby.test.ts`, `apps/server/test/roomManager.test.ts`

**Interfaces:**
- Consumes: protocol types, engine `createGame`, `SeatConfig`.
- Produces:
  - `config.ts`: `loadConfig(env = process.env): Config` with `{ port: number; botDelayMs: [number, number]; turnSecondsOverride: number | null; discardSeconds: number; emptyRoomTtlMs: 1_800_000; finishedRoomTtlMs: 900_000; maxRooms: 500; msgsPerSecond: 20 }` (`STARHOLD_BOT_DELAY_MS` single number sets both bounds; `STARHOLD_DISCARD_SECONDS` default 30).
  - `codes.ts`: `generateRoomCode(random: () => number, taken: (c: string) => boolean): string`, `generateToken(): string` (crypto 16 bytes hex), `generatePlayerId(): string` (8 chars base36, crypto).
  - `class Room` (constructor `(code: string, config: Config, hooks: RoomHooks)` where `interface RoomHooks { broadcast(room: Room): void; emitTo(playerId: string, event: keyof ServerToClientEvents, payload: unknown): void; now(): number }`):
    - `addHuman(name): { playerId; token } | { error: RoomErrorCode }` (`err.roomFull` at 4 seats, `err.gameStarted` if not LOBBY); first human = host.
    - `rejoin(token): string | null` → playerId; marks connected, clears AFK.
    - `markDisconnected(playerId)`, `isEmptyOfHumans(): boolean` (no connected humans).
    - `addBot(byPlayerId, level)`, `removeBot(byPlayerId, botId)`, `updateSettings(byPlayerId, settings)`, `start(byPlayerId)` — host only (`err.notHost`); start requires ≥2 seats (`err.notEnoughPlayers`); bot names `Bot Vega`, `Bot Orion`, `Bot Lyra` (first unused).
    - `leave(playerId)` — in LOBBY removes seat; in game marks disconnected + AFK; host transfers to the next connected human by seat.
    - `info(forPlayerId): RoomInfo`; `phase: RoomPhase`; `lastActivity: number`.
  - `class RoomManager` (`constructor(config, hooks)`): `create(): Room | { error: 'err.serverFull' }`, `get(code)`, `delete(code)`, `findByToken(code, token)`, `sweep(now)` — deletes rooms empty of connected humans for ≥ `emptyRoomTtlMs`, and FINISHED rooms idle ≥ `finishedRoomTtlMs`; returns deleted codes; `size`.

- [ ] **Step 1: Write failing tests**: lobby: `first human is host`; `fifth seat → err.roomFull`; `non-host addBot → err.notHost`; `bots get distinct names`; `start with one seat → err.notEnoughPlayers`; `start creates a game with seats as configured and phase IN_GAME`; `join after start → err.gameStarted`; `rejoin with valid token returns same playerId; invalid → null`; `host leaving lobby transfers host to next human`; manager: `codes are unique and match RoomCodeSchema`; `create beyond maxRooms → err.serverFull`; `sweep deletes empty room after 30 min but not after 29`; `sweep deletes finished room after 15 min`.
- [ ] **Step 2: Run** `npx vitest run apps/server` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): rooms, lobby lifecycle and sweeping`.

---

### Task 16: Server game loop — actions, versions, timers, AFK, bots

**Files:**
- Modify: `apps/server/src/room.ts` (game half)
- Test: `apps/server/test/gameLoop.test.ts`

**Interfaces:**
- Consumes: engine `applyAction`, `viewFor`, `filterEventsFor`, `randomDiscard`, `legalActions`; bots `decide`.
- Produces on `Room`:
  - `version: number` (starts 1 at game start, +1 per successful action).
  - `handleAction(playerId, action): { ok: true } | { ok: false; error: ErrorCode }` — on success: version++, broadcast `game:state` per player (`viewFor`) and `game:events` (`filterEventsFor`), reset that player's consecutive-timeout counter, clear their AFK, reschedule.
  - `schedule()` — single place that (re)arms timers after every state change: clears previous timers; if FINISHED → set phase FINISHED, record finish time; if DISCARD → for each pending bot/AFK/disconnected player schedule bot discard after bot delay; for connected humans set `discardDeadline = now + discardSeconds` and on expiry apply `randomDiscard`; if a bot/AFK/disconnected player must act (current player, or trade responder) → after random bot delay call `decide(view, id, level ?? 'normal', Math.random)` and `handleAction` it; if the current player is a connected human → `turnDeadline = now + turnSeconds*1000`; on expiry: counter++, if counter ≥2 mark AFK, then run bot moves for the rest of that turn.
  - Bot failure isolation: if `decide` throws or returns a rejected action, log a warning and apply `endTurn` (or `randomDiscard` in DISCARD; `respondTrade{accept:false}` for trade); never throw out of a timer.
  - `stateFor(playerId): GameStatePayload`.
  - `rematch(byPlayerId)` — host only, FINISHED → LOBBY with same seats (disconnected humans removed).
- Use `vi.useFakeTimers()` in tests; config with `botDelayMs: [10,10]`, `discardSeconds: 1`.

- [ ] **Step 1: Write failing tests** in `gameLoop.test.ts`:
  - `rejects out-of-turn action without bumping version` (Review Focus 2);
  - `successful action increments version and broadcasts filtered state to each player` (hooks spy: other player's view has `resources: null` for the actor);
  - `bot seat acts automatically after bot delay`;
  - `human turn timeout makes bot finish the turn and second timeout marks AFK`;
  - `AFK player is un-AFKed by any action`;
  - `discard timeout auto-discards for disconnected player` (Review Focus 4);
  - `bot throwing falls back to endTurn and loop continues`;
  - `all-human-AFK game advances on timers only and room expires` (Review Focus 3: one human + bots, human disconnects; advance fake time to finish or 50 rounds without unbounded timer count — assert `vi.getTimerCount() <= 3` throughout; after game FINISHED + 15 min, `manager.sweep` removes it);
  - `bots-only after humans leave: game reaches FINISHED within 20 000 actions`;
  - `rematch returns to LOBBY with same connected seats`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): authoritative game loop with timers, AFK and bots`.

---

### Task 17: Server transport — Socket.IO, HTTP, rate limiting

**Files:**
- Create: `apps/server/src/socket.ts`, `src/http.ts`, `src/log.ts`, `src/index.ts`
- Test: `apps/server/test/socket.test.ts`, `apps/server/test/http.test.ts`

**Interfaces:**
- Produces:
  - `createHttpApp(opts: { staticDir: string | null }): express.Express` — `helmet` with CSP `default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'`; `GET /healthz` → `200 {"status":"ok"}`; serves `staticDir` with SPA fallback to `index.html` for non-file GETs; `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.
  - `attachSocket(io: Server<ClientToServerEvents, ServerToClientEvents>, manager: RoomManager, config: Config): void` — every handler parses with protocol zod schemas (`err.badRequest` on failure); socket↔(room,player) binding stored in `socket.data`; token bucket per socket (`msgsPerSecond`, burst = same) → `err.rateLimited` and drop; on `disconnect` → `room.markDisconnected`; joins Socket.IO room per code; `hooks.emitTo` targets the player's current socket id.
  - `startServer(config): Promise<{ close(): Promise<void>; port: number }>` — http + io (`cors` disabled in prod, same origin), sweep interval 60 s; on SIGTERM emits `room:closed {reason:'serverRestart'}` to all, then closes.
  - `log.ts`: `log.info/warn/error(msg, fields?)` → single-line JSON to stdout/stderr (the only file allowed `console.*` beyond warn/error).
  - `index.ts`: `startServer(loadConfig())` with `staticDir` = `../web/dist` resolved from the bundle location (env `STARHOLD_STATIC_DIR` override).
  - `apps/server/package.json` scripts: `dev: tsx watch src/index.ts`, `build: esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --packages=external` with workspace packages bundled (mark only npm deps external via `--external:express --external:socket.io --external:helmet --external:zod`).

- [ ] **Step 1: Write failing tests** (real server on port 0 + `socket.io-client`):
  - `create → join → start → state received by both`;
  - `rejoin after socket disconnect restores seat` (Review Focus 1): disconnect client A, connect new socket, `room:rejoin` with token → ack same playerId, receives `room:state` and `game:state`;
  - `malformed action is rejected` (Review Focus 5): send `{type:'attack', dice: 9}` and `{type:'nope'}` → `error {code:'err.badRequest'}`, server still serves `/healthz`;
  - `flooding socket is throttled` (Review Focus 5): 100 actions in a tick → at least one `err.rateLimited`, other socket in another room still gets its own state updates;
  - `join unknown room → err.roomNotFound`;
  - `http.test.ts`: `/healthz 200 JSON`; `security headers present (content-security-policy, x-content-type-options)`; `unknown route serves index.html when staticDir set`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. Manual: `npm run dev -w @starhold/server` then `curl localhost:3000/healthz` → `{"status":"ok"}`.
- [ ] **Step 5: Commit and push** `feat(server): socket transport, http app, rate limiting` then `git push`.

---

### Task 18: Space theme package

**Files:**
- Create: `themes/space/package.json`, `src/theme.ts`, `src/icons.tsx`, `src/index.ts`
- Test: `themes/space/test/theme.test.ts`

**Interfaces:**
- Produces:
  - `interface Theme { id: 'space'; titleKey: MessageKey; resources: Record<Resource, { labelKey: MessageKey; color: string; Icon: ComponentType<{ size?: number }> }>; sectorFill: Record<Resource | 'nebula' | 'home', string>; players: { color: string; shape: 'circle'|'square'|'triangle'|'diamond' }[]; Icons: { Fleet; Colony; Starbase; Pirate; TradeStation; Dice } ; background: string }`
  - `export const spaceTheme: Theme` — colours from Global Constraints; resource colours: metal `#9AA5B1`, energy `#F2C94C`, crystal `#7FD3F7`, biomass `#6FCF97`; nebula `#3B2F5C`; home `#1F2A44`; background radial `#0B1020 → #05070F`.
  - `icons.tsx`: hand-authored inline SVG React components (no external assets), each `aria-hidden`, `viewBox="0 0 24 24"`, `currentColor` where appropriate.
- `themes/space/package.json` peer-depends on `react`.

- [ ] **Step 1: Write failing tests**: `spaceTheme has a label key for every resource present in i18n en`; `4 player styles with distinct colours and shapes`; `every icon renders an svg` (render with @testing-library/react, jsdom env for this project).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(theme-space): space theme data and SVG icons`.

---

### Task 19: Web app shell — routing, i18n, store, socket, home & lobby

**Files:**
- Create: `apps/web/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/routes.tsx`, `src/net/socket.ts`, `src/net/session.ts`, `src/store/gameStore.ts`, `src/i18n/useT.ts`, `src/ui/{Button,Dialog,Toasts,ErrorBoundary,LanguageSwitch}.tsx`, `src/styles/{tokens.css,app.css}`, `src/screens/{HomeScreen,LobbyScreen}.tsx`, `src/pages/NotFoundPage.tsx`
- Test: `apps/web/test/session.test.ts`, `gameStore.test.ts`, `HomeScreen.test.tsx`, `LobbyScreen.test.tsx`

**Interfaces:**
- Consumes: protocol events/types, i18n `createT`, `detectLocale`, theme.
- Produces:
  - `session.ts`: `saveSession(code, {playerId, token})`, `loadSession(code): {playerId, token} | null`, `clearSession(code)`, `loadNickname()/saveNickname(n)`, `loadLocale()/saveLocale(l)`, `loadMuted()/saveMuted(b)` — all `localStorage` access wrapped in try/catch, returning null/defaults on failure.
  - `socket.ts`: `createSocket(url?: string): Socket<ServerToClientEvents, ClientToServerEvents>` (same-origin default; `reconnectionAttempts: Infinity`, `reconnectionDelayMax: 5000`).
  - `gameStore.ts` (zustand): state `{ connection: 'connecting'|'online'|'offline'; room: RoomInfo | null; game: GameStatePayload | null; log: { id: number; event: GameEvent }[] (last 100); toasts: { id: number; key: MessageKey; params?: Record<string,string|number> }[]; locale: Locale; muted: boolean }`; actions `createRoom(name): Promise<string|null /* code */>`, `joinRoom(code, name)`, `rejoin(code): Promise<boolean>`, `leaveRoom()`, `sendAction(a: Action)`, `addBot(level)`, `removeBot(id)`, `updateSettings(s)`, `startGame()`, `rematch()`, `dismissToast(id)`, `setLocale(l)`, `setMuted(b)`. Ignores `game:state` with `version <=` current. On socket `connect` with a known room code, auto-calls `rejoin`. `bindSocket(socket)` called once in `main.tsx` (store is testable with a fake socket emitter).
  - `useT(): (key, params?) => string` reading `locale` from the store.
  - Routes (wouter): `/` Home, `/room/:code` Room (renders Lobby / Game / End by `room.phase`; if no session for code → shows nickname form then `joinRoom`), `/rules`, `/privacy`, `/credits`, fallback NotFound.
  - Home: nickname (saved), "Create room", code input + "Join"; nav links to rules/privacy/credits; LanguageSwitch.
  - Lobby: seat list with colour/shape, host badge, connected dot; host controls (add bot easy/normal, remove bot, target 6/8/10, timer 60/90/120, Start enabled when ≥2 seats); "Copy link" copies `location.origin + /room/CODE` (navigator.clipboard with fallback select-text) and toasts `lobby.linkCopied`.
  - `tokens.css`: dark space palette as CSS custom properties; responsive breakpoints at 360/768/1200 px; `prefers-reduced-motion` disables transitions.

- [ ] **Step 1: Write failing tests**: `session functions return null and do not throw when localStorage throws`; store: `ignores stale game:state versions`; `error event pushes toast with code key`; `boots into rejoin when session exists` (Review Focus 1: fake socket emits `connect`, store sends `room:rejoin` with saved token); `log keeps last 100 events`; Home: `create button disabled until nickname non-empty`, `join uppercases code`; Lobby: `host sees add-bot and start; non-host does not`, `start disabled with 1 seat`, `copy link writes room URL`.
- [ ] **Step 2: Run** `npx vitest run apps/web` → FAIL. **Step 3: Implement.** Vite dev proxy `/socket.io` → `http://localhost:3000` (ws: true).
- [ ] **Step 4: Run** → PASS. Manual: `npm run dev` (root script runs server + web concurrently via `npm-run-all2` or `concurrently`), open `http://localhost:5173`, create room, add bot, see lobby.
- [ ] **Step 5: Commit** `feat(web): app shell, i18n, store, home and lobby`.

---

### Task 20: Galaxy map rendering and selection

**Files:**
- Create: `apps/web/src/game/GalaxyMap.tsx`, `SectorHex.tsx`, `apps/web/src/game/geometry.ts`, `apps/web/src/game/selection.ts`
- Test: `apps/web/test/geometry.test.ts`, `selection.test.ts`, `GalaxyMap.test.tsx`

**Interfaces:**
- Consumes: `PlayerView`, `legalActions`, theme.
- Produces:
  - `geometry.ts`: `hexToPixel(h: Hex, size: number): {x, y}` (pointy-top), `hexCorners(center, size): string` (SVG points), `mapBounds(sectors, size): {minX,minY,width,height}`.
  - `selection.ts`: `type Intent = { kind: 'expand'|'attack'|'fortify'; from: SectorId; to: SectorId } | { kind: 'build'; at: SectorId } | { kind: 'pirate'; to: SectorId }`; `intentsFor(view, me, selected: SectorId | null, clicked: SectorId): Intent[]` derived from `legalActions` (attack/expand/fortify from selected → clicked; pirate when phase PIRATE; build options when clicking own sector in MAIN); `highlightTargets(view, me, selected): Set<SectorId>`.
  - `GalaxyMap` props `{ view: PlayerView; me: string; selected: SectorId | null; onSectorClick(id: SectorId): void }`: SVG with viewBox from `mapBounds`; pan by pointer drag, zoom by wheel/pinch (clamped 0.6×–3×), "reset view" button; each `SectorHex` shows fill by resource/nebula/home, number token (6/8 in red-ish emphasis), trade station icon, owner colour ring + shape marker, fleet count badge, structure icon, pirate icon; keyboard: each hex is `role="button"`, `tabIndex=0`, `aria-label` like "Crystal 8, yours, 3 fleets, colony", Enter/Space = click; highlighted targets get a pulsing outline (static outline under reduced motion).

- [ ] **Step 1: Write failing tests**: geometry: `hexToPixel(0,0)=(0,0)`, neighbours at distance `√3·size`; selection: `selecting own sector with 3 fleets highlights adjacent empty and enemy non-home sectors`, `enemy home is never highlighted`, `PIRATE phase highlights all non-home sectors except current pirate`, `intentsFor returns attack for enemy target and expand for empty`; GalaxyMap: `renders one button per sector`, `aria-label includes number and owner`, `Enter on hex calls onSectorClick`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): interactive SVG galaxy map`.

---

### Task 21: Game screen — panels, actions, dialogs

**Files:**
- Create: `apps/web/src/screens/GameScreen.tsx`, `src/game/{ResourcePanel,ActionBar,PlayerList,EventLog,TurnTimer}.tsx`, `src/game/dialogs/{TradeDialog,AttackDialog,MoveDialog,DiscardDialog,HomeBonusPicker,PirateHint}.tsx`, `src/game/eventText.ts`
- Test: `apps/web/test/GameScreen.test.tsx`, `dialogs.test.tsx`, `eventText.test.ts`

**Interfaces:**
- Consumes: store (`game`, `room`, `sendAction`), `intentsFor`, `COSTS`, `tradeRate`, `maxMovable`, `maxAttackDice`, i18n.
- Produces:
  - Layout: desktop = map centre, right sidebar (PlayerList, EventLog), bottom bar (ResourcePanel + ActionBar); mobile (<768 px) = map full width, bottom sheet with tabs (Actions / Players / Log).
  - `ActionBar`: phase-aware primary button (Roll / End turn), build buttons for the selected own sector showing cost and disabled with reason tooltip when unaffordable, Bank trade, Offer trade; all disabled when not my turn, with "Waiting for {name}".
  - `HomeBonusPicker`: modal-less inline chooser with 4 resource buttons during my HOME_BONUS.
  - `DiscardDialog`: shown when `pendingDiscards[me] > 0`; steppers per resource, confirm enabled when sum = required; shows countdown to `discardDeadline`.
  - `PirateHint`: banner during my PIRATE phase.
  - `AttackDialog` (for attack intent): dice selector 1..max (default max), move-on-conquest slider (default max), shows win chance using bots' `attackWinChance`; confirm sends `attack`. After result, shows rolled dice from the `battle` event.
  - `MoveDialog` (expand/fortify): count slider 1..max (default max); fortify notes "ends your turn".
  - `TradeDialog`: tabs Bank (give/get pickers with live rate) and Players (two bag steppers); offer status list (accepted/declined per player; confirm buttons); incoming offer card for others with Accept/Decline.
  - `PlayerList`: colour/shape, name, VP, card count, fleets total, award badges, AFK/disconnected markers, current-turn highlight.
  - `TurnTimer`: seconds left from `turnDeadline` (uses `Date.now()`), warning style ≤10 s.
  - `eventText(event, view, t): string` — localized one-liners for every `GameEvent` type.
  - Error toasts from server codes; connection banner when `connection !== 'online'` (`game.reconnecting`).

- [ ] **Step 1: Write failing tests** (render GameScreen with a store seeded from `viewFor(makeGame(...))`-like fixtures — export a `fixtures.ts` in `apps/web/test` that builds views via the engine): `shows Roll only for current player in ROLL`; `HomeBonusPicker sends chooseHomeBonus`; `DiscardDialog confirm disabled until exact sum`; `AttackDialog sends chosen dice and move count`; `build colony button disabled with insufficient resources`; `incoming trade offer shows Accept and Decline to non-offerer`; `eventText covers every GameEvent type in both locales without missing keys` (iterate sample events; output must not contain '{').
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. Manual: full game vs 3 bots in the browser at desktop and 375 px width.
- [ ] **Step 5: Commit and push** `feat(web): game screen with actions, trading and combat dialogs`.

---

### Task 22: End screen, static pages, PWA, sound, accessibility polish

**Files:**
- Create: `apps/web/src/screens/EndScreen.tsx`, `src/pages/{RulesPage,PrivacyPage,CreditsPage}.tsx`, `src/audio/sfx.ts`, `src/ui/MuteToggle.tsx`, `apps/web/public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `public/favicon.svg`, `public/og.png`, `apps/web/scripts/make-icons.mjs`
- Modify: `apps/web/index.html` (meta description, theme-color, manifest link, OG/Twitter tags, `lang` set at runtime)
- Test: `apps/web/test/EndScreen.test.tsx`, `pages.test.tsx`, `sfx.test.ts`

**Interfaces:**
- Produces:
  - `EndScreen`: winner banner, reason (`end.reasonTarget` / `end.reasonRoundLimit`), ranking table from engine `ranking` (VP, sectors, conquests), Rematch (host) and Home buttons.
  - `RulesPage`: full rules in EN/HR from i18n keys (`pages.rules.*`), mirrors spec §2 (own wording).
  - `PrivacyPage`: states exactly: nickname held in server memory only while the room exists; a random token, nickname, language and mute preference stored in the browser's localStorage; no accounts, analytics, ads or tracking cookies; server logs contain no nicknames; contact via GitHub issues `github.com/toma1203/starhold/issues`.
  - `CreditsPage`: author, tech list, statement that all art and sound are original.
  - `sfx.ts`: `playSfx(name: 'dice'|'build'|'battle'|'conquer'|'turn'|'victory'): void` — WebAudio-synthesized (oscillator/noise envelopes), lazily creates AudioContext on first user gesture, no-op when muted or AudioContext unavailable; store triggers sounds from incoming events.
  - `make-icons.mjs`: renders `favicon.svg` to the PNG sizes with `sharp` (devDependency) — run once, PNGs committed.
  - Accessibility pass: visible focus rings, all buttons labelled, dialogs trap focus and close on Escape, colour contrast ≥ 4.5:1 for text (tokens), live region (`aria-live="polite"`) announcing "your turn" and battle results.

- [ ] **Step 1: Write failing tests**: `EndScreen shows winner and Rematch only for host`; `RulesPage renders in hr and en without raw keys`; `PrivacyPage mentions localStorage and no analytics` (by i18n key presence); `playSfx is a no-op when AudioContext is undefined`; `dialogs close on Escape`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, run `node apps/web/scripts/make-icons.mjs`. **Step 4: Run** → PASS. Manual: Lighthouse (Chrome DevTools) on `vite preview` — Accessibility ≥ 90, PWA installable, Best Practices ≥ 90.
- [ ] **Step 5: Commit** `feat(web): end screen, rules/privacy/credits pages, PWA, sound, a11y`.

---

### Task 23: End-to-end tests with Playwright

**Files:**
- Create: `apps/web/test/e2e/playwright.config.ts`, `apps/web/test/e2e/game.spec.ts`
- Modify: root `package.json` (`e2e` script), `.github/workflows/ci.yml` (add `build` and `e2e` jobs; install browsers with `npx playwright install --with-deps chromium`)

**Interfaces:**
- Consumes: `npm run build` output; server reads `STARHOLD_BOT_DELAY_MS=0`, `STARHOLD_TURN_SECONDS=3`, `STARHOLD_DISCARD_SECONDS=1`, `STARHOLD_STATIC_DIR=apps/web/dist`.
- Produces: Playwright `webServer` starting `node apps/server/dist/index.js` on port 4173 with those env vars; projects `chromium-desktop` and `chromium-mobile` (Pixel 5 device).

- [ ] **Step 1: Write the e2e specs**: `solo vs 3 bots reaches end screen` (create room, add 3 normal bots, target 6, start, the human idles so timers hand turns to the bot; expect EndScreen within 180 s); `friend joins via copied link` (two browser contexts; context B opens `/room/CODE`, enters nickname, both see 2 seats; host starts; B sees the map); `reload mid-game returns to the same seat` (reload page A; expect game screen and own name highlighted); `language switch to HR changes UI text`.
- [ ] **Step 2: Run** `npm run build && npm run e2e` → expect failures only from real bugs; fix them (each with a unit test in the owning package).
- [ ] **Step 3: Run** `npm run e2e` → all PASS on both projects.
- [ ] **Step 4: Commit and push** `test: end-to-end games with Playwright, CI build+e2e jobs`; confirm `gh run watch` green.

---

### Task 24: Production packaging, docs, release

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `render.yaml`, `README.md`, `CHANGELOG.md`, `docs/screenshots/*.png`
- Modify: `.github/workflows/ci.yml` (add `docker` job: `docker build -t starhold .` then run container and `curl -f localhost:3000/healthz`), all `package.json` versions → `1.0.0`

**Interfaces:**
- Produces:
  - `Dockerfile`: stage `build` (`node:22-alpine`, `npm ci`, `npm run build` → web dist + server bundle), stage `runtime` (`node:22-alpine`, `NODE_ENV=production`, copy `apps/server/dist`, `apps/web/dist`, and production `node_modules` from `npm ci --omit=dev --workspace @starhold/server`), `USER node`, `EXPOSE 3000`, `HEALTHCHECK` curl-free via `node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, `CMD ["node","apps/server/dist/index.js"]`.
  - `render.yaml`: one `web` service, `runtime: docker`, `plan: free`, `healthCheckPath: /healthz`, `autoDeploy: true`, env `NODE_VERSION` not needed (docker).
  - `README.md`: EN first, then HR section; badges (CI); screenshots (desktop game, mobile game, lobby — captured via Playwright script `apps/web/test/e2e/screenshots.spec.ts` tagged `@screenshots`, excluded from default e2e); "How to play" summary + link to in-app rules; local dev (`npm install`, `npm run dev`); tests; deploy to Render in 3 steps (create account → New → Blueprint → pick `toma1203/starhold`); free-plan sleep note; architecture overview; license notice.
  - `CHANGELOG.md` with `## 1.0.0 — 2026-10-xx` feature list.

- [ ] **Step 1: Write CI docker job** (it is the test for this task; Docker is not installed locally).
- [ ] **Step 2: Implement** Dockerfile, `.dockerignore` (node_modules, dist, .git, test-results, playwright-report, docs/screenshots), `render.yaml`, README, CHANGELOG, screenshots (`npx playwright test --grep @screenshots`).
- [ ] **Step 3: Verify locally:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` → all exit 0; `NODE_ENV=production node apps/server/dist/index.js` + `curl localhost:3000/healthz` → ok and the game loads at `http://localhost:3000`.
- [ ] **Step 4: Commit, push, verify CI** `chore: production Dockerfile, Render blueprint, README, changelog`; `git push`; `gh run watch` → all jobs (lint, typecheck, test, build, e2e, docker) green.
- [ ] **Step 5: Tag release** `git tag -a v1.0.0 -m "Starhold 1.0.0" && git push origin v1.0.0` and `gh release create v1.0.0 --title "Starhold 1.0.0" --notes-file CHANGELOG.md`.
