# PHASE_2_MULTIPLAYER.md
## Goal
Turn the Phase 1 game into a **2-player online game** with room-based play.
- Authoritative server
- Client sends inputs only
- Both players see the same map, bombs, explosions, and win/lose outcome

---

## Tech Stack (Phase 2)
- Client: Phaser 3 + Vite (from Phase 1)
- Server: **Node.js + Colyseus**
- Transport: Colyseus WebSocket
- State: in-memory (no DB)

---

## Hard Constraints
- Keep it **2 players max** per room.
- Keep the gameplay rules the same as Phase 1 unless explicitly changed here.
- Server must be authoritative for:
  - positions
  - bomb placement/timers
  - explosions
  - block destruction
  - deaths / round end

---

## Architecture
### Client Responsibilities
- Render state received from server
- Collect local input
- Send input messages to server:
  - `move` (direction)
  - `bomb` (place bomb)

### Server Responsibilities
- Own and update the canonical state
- Validate moves (collision checks)
- Enforce bomb rules
- Run bomb timers and explosion resolution
- Broadcast state updates (Colyseus state sync)

---

## Room / Match Flow
### Joining
- Room join uses a **room code** (string).
- First user creates/joins room code => becomes Player 1.
- Second user joins same room code => becomes Player 2.
- If a third tries to join: reject with “room full”.

### Round Start
- On both players present, server starts round:
  - assigns spawns: P1 `(1,1)`, P2 `(11,9)` (or symmetric)
  - map is generated once server-side, then synced to clients
- Clients must NOT generate their own map.

### Round End
- If one player dies, other wins.
- If both die in same explosion tick: draw.
- Pressing `R` on either client requests restart; server restarts only if:
  - both have requested restart OR implement a 3-second auto-reset after showing result (choose simplest)

---

## State Shape (Colyseus)
Define a Colyseus Schema roughly like:
- `map`: array of tile ints length (13*11)
- `players`: map by sessionId => { x, y, alive, bombsAvailable, power }
- `bombs`: map by id => { x, y, ownerId, explodeAt }
- `explosions`: transient list of tiles with expiry (optional; can be event-based too)
- `status`: "lobby" | "playing" | "ended"
- `result`: "p1" | "p2" | "draw" | null

(Exact schema is up to implementation, but must cover these.)

---

## Message Protocol
Client -> Server
- `join` { roomCode }
- `move` { dir: "up"|"down"|"left"|"right" }
- `bomb` {}
- `restart` {}

Server -> Client (via state sync + optional messages)
- State sync is primary
- Optional `toast` or `error` messages for room full, etc.

---

## Timing / Ticks
- Server tick: 10–20 Hz is enough.
- Bomb fuse uses server time.
- Explosion overlay lasts ~250–400ms (visual only).

---

## Acceptance Tests (must pass)
1) Two browsers can join the same room code and see both players.
2) Player movement is validated by server (can’t walk through walls/blocks).
3) Bombs placed by either player detonate consistently for both.
4) Block destruction is identical for both clients (server decides).
5) Win/lose/draw is consistent for both.
6) A third client cannot join the same room.

---

## Deliverable
A single repo that can be run locally:
- `npm install`
- `npm run dev` (client)
- `npm run server` (server)
Or a combined script if preferred.

Keep it simple and documented in README with exact commands.

