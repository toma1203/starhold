# Changelog

## 1.0.0 — 2026-10-21

First public release.

- Online space strategy game for 2 to 4 commanders on a hexagonal galaxy: 19 sectors for two players, 31 for three or four, with nebulae and trade stations.
- Full rules: dice production, pirates on a 7 with discards, bank and player trading, building fleets, colonies and starbases, expanding, dice combat with conquest, fortifying, and the Largest Empire and Warlord awards; victory target of 6, 8 or 10 points and a 60-round limit.
- Live multiplayer over Socket.IO with five-letter room codes, invite links, rejoin after reload or disconnect, and host transfer.
- Easy and Normal bots, plus an automatic bot that finishes the turn when the timer (60, 90 or 120 seconds) runs out or a player is away.
- Server-authoritative engine with per-player filtered state, input validation, rate limiting and a strict content security policy.
- English and Croatian interface, with in-game rules, privacy and credits pages.
- Responsive interface for phones and desktops, installable as a PWA, sound effects with a mute toggle, and keyboard and screen reader support.
- End screen with the final ranking and a rematch option.
- Production Docker image, Render blueprint (`render.yaml`) and a health check at `/healthz`.
- Continuous integration: lint, typecheck, unit and integration tests, build, Playwright end-to-end games, and a Docker build and smoke test.
