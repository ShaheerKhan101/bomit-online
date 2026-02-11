# PHASE_4_NPCS.md
## Goal
Add **NPC bots** (server-controlled) to the deployed game.

---

## Requirements
- NPCs are entities controlled entirely by the server.
- NPCs follow simple rules (no advanced AI required).
- NPCs can:
  - move around grid
  - place bombs sometimes
- NPCs can die in explosions like players.
- NPC count: start with **1 bot**; optionally allow 2.

---

## Simplest Bot Behavior (Tier 1 Rules)
Every 200ms (or on server tick):
1) If bot is in danger (a bomb will explode affecting its tile within ~800ms):
   - move to a random adjacent safe tile if available
2) Else:
   - 60% chance: move randomly to a valid adjacent tile
   - 40% chance: if line-of-sight or near a player (Manhattan distance <= 3), attempt to move closer
3) Bomb placement:
   - If within distance <= 2 of a player OR blocked by destructible blocks nearby:
     - 20% chance to drop a bomb
   - Enforce cooldown (e.g., 2.5s) and max bombs (1)

---

## Danger Computation (Simple)
- For each bomb, compute its blast tiles (same as explosion) ahead of time.
- Mark tiles as dangerous if explosion will occur soon.
- Bot avoids dangerous tiles when possible.

---

## State Updates
- Add `npcs` to server state with fields:
  - id, x, y, alive, cooldowns
- Clients render NPCs like players (different color).

---

## Acceptance Tests (must pass)
1) With 1 human player, at least 1 NPC spawns and moves around.
2) NPC can place bombs and can die.
3) NPC behavior is consistent for both clients (server-controlled).
4) Bots appear and behave the same for both players on the deployed version.

---

## Non-Goals (keep scope tight)
- No advanced bot pathfinding
- No accounts/login
- No matchmaking ladder
- No persistent stats/DB

---

## Deliverable
- Working NPCs on the deployed game
- README updated with NPC info

