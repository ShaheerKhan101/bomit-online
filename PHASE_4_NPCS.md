# PHASE_4_NPCS.md
## Goal
Add **NPC bots** (server-controlled) with real pathfinding and strategic behavior to the deployed game.

---

## Requirements
- NPCs are entities controlled entirely by the server.
- NPCs use BFS pathfinding and a priority-based decision system.
- NPCs can:
  - navigate the grid intelligently using shortest-path routing
  - place bombs strategically (only when escape route is confirmed)
  - hunt players, destroy blocks to open paths, and avoid danger
- NPCs can die in explosions like players.
- NPC count: start with **1 bot**; optionally allow 2.

---

## Bot Architecture

### Danger Map (computed every bot tick)
- For each active bomb, run `computeExplosion` to get its blast tiles.
- Mark all blast tiles as **dangerous**, tagged with the bomb's `explodeAt` time.
- A tile is **safe** if no bomb's blast can reach it before the bot could escape.
- Chain explosions: if a bomb's blast hits another bomb, include that bomb's blast tiles too.

### BFS Pathfinding
- BFS from bot position; walls, blocks, and bombs are impassable.
- Grid is 13x11 (143 tiles) — BFS is trivially fast, no need for A*.
- Used for:
  - Finding nearest safe tile (flee)
  - Finding shortest path to a player (chase)
  - Finding reachable tiles after a hypothetical bomb placement (escape validation)
  - Finding nearest destructible block to clear

### Priority-Based Decision Loop
Every bot tick (~200ms), evaluate in order:

**Priority 1 — Survive:**
- If bot is on a dangerous tile, BFS to nearest safe tile and move toward it.
- This is non-negotiable and always overrides other priorities.

**Priority 2 — Attack:**
- If bot can place a bomb such that:
  - The bomb's blast zone covers the player's current tile (or likely tiles), AND
  - BFS confirms the bot has an escape route to a safe tile after placement
- Then place the bomb and begin escaping.
- Prefer positions where the blast overlaps with walls/corridors to cut off player escape routes (trap logic).

**Priority 3 — Chase:**
- BFS toward the nearest player.
- If the shortest path is blocked by destructible blocks, move to the block and bomb it open (with escape route confirmed).

**Priority 4 — Clear:**
- If no player is reachable, destroy nearby blocks to open the map.
- Pick blocks that are along the general direction toward a player.

### Trap Logic (what makes the bot feel smart)
- Before placing a bomb, check how many escape routes the player has from the blast zone.
- Prefer bomb placements at corridor junctions or against walls where the explosion limits player movement options.
- A bomb that cuts off 2+ escape routes is prioritized over one in open space.

---

## Difficulty Profiles

One bot class, three personalities. Difficulty changes **what the bot knows, how fast it thinks, and how it plays** — not just a speed slider.

### Easy Bot — "The Fumbler"
- **Tick rate:** 300ms (slow reactions)
- **Mistake rate:** 30% — nearly 1 in 3 moves is random instead of optimal
- **Pathfinding:** Uses BFS but only for fleeing (Priority 1). All other movement is random adjacent tile selection — no intelligent chasing.
- **Danger awareness:** Only reacts to bombs within Manhattan distance 1 (adjacent tiles). Doesn't account for chain explosions at all.
- **Bomb placement:** Random — drops a bomb if near a player (distance <= 2) with 20% chance per tick. Does NOT check for escape routes before placing. Can and will suicide occasionally.
- **Chase behavior:** None. Wanders randomly. If it happens to stumble near a player, it might bomb, but it doesn't hunt.
- **Trap logic:** None.
- **Bomb cooldown:** 3.5s (slow to re-bomb)
- **Feel:** A beginner opponent. Makes dumb mistakes, walks into explosions sometimes, but still moves and bombs enough to be a threat if you're not paying attention.

### Medium Bot — "The Hunter"
- **Tick rate:** 200ms (moderate reactions)
- **Mistake rate:** 15% — mostly makes good decisions with occasional slip-ups
- **Pathfinding:** Full BFS for all priorities (flee, attack, chase, clear). Finds shortest paths to players and safe tiles.
- **Danger awareness:** Reacts to all bombs on the map. Computes full blast zones. Does NOT account for chain explosions.
- **Bomb placement:** Strategic — only places a bomb if BFS confirms an escape route to a safe tile. Will bomb toward players and to clear blocking paths.
- **Chase behavior:** Active. BFS toward nearest player when within Manhattan distance <= 5. Below that range, defaults to clearing blocks in the player's general direction.
- **Trap logic:** None — places bombs where they'll hit, but doesn't evaluate whether the player can escape the blast.
- **Bomb cooldown:** 2.5s
- **Feel:** A competent opponent. Hunts you down, uses bombs purposefully, and rarely kills itself. But it doesn't predict your movement or try to corner you — you can outmaneuver it with good positioning.

### Hard Bot — "The Tactician"
- **Tick rate:** 150ms (fast reactions)
- **Mistake rate:** 5% — almost always optimal
- **Pathfinding:** Full BFS for all priorities. Additionally runs BFS from the *player's* position to evaluate player escape routes before placing bombs.
- **Danger awareness:** Full blast zone computation INCLUDING chain explosions. If bomb A's blast hits bomb B, the bot knows bomb B's blast tiles are also dangerous.
- **Bomb placement:** Tactical — only places a bomb if:
  1. Escape route for the bot is confirmed, AND
  2. The bomb limits the player's escape options (trap logic active)
  - Prefers placements at corridor junctions, against walls, or where blast lines intersect with other bombs for chain setups.
- **Chase behavior:** Always active if any path to a player exists, regardless of distance. Will aggressively clear blocks along the shortest route to the player.
- **Trap logic:** Full. Before bombing, counts how many safe tiles the player can reach after the explosion. Prioritizes bomb spots that reduce player escape routes to 1-2 options. Will set up "corridor traps" — bombing one end of a hallway to force the player toward a dead end.
- **Chain awareness:** Will intentionally place bombs near existing bombs to create larger blast zones and cut off more escape routes.
- **Bomb cooldown:** 2.0s (aggressive re-bombing)
- **Feel:** Oppressive. Actively herds you into corners, sets up traps, and punishes poor positioning. You need to think ahead to survive — the bot certainly is.

### Parameter Summary Table

| Parameter              | Easy    | Medium  | Hard    |
|------------------------|---------|---------|---------|
| Tick rate              | 300ms   | 200ms   | 150ms   |
| Mistake rate           | 30%     | 15%     | 5%      |
| Flee pathfinding       | BFS     | BFS     | BFS     |
| Chase pathfinding      | None    | BFS     | BFS     |
| Chase activation range | N/A     | dist<=5 | Always  |
| Danger awareness       | Adjacent only | Full blast | Full + chains |
| Escape route check     | No      | Yes     | Yes     |
| Trap logic             | No      | No      | Yes     |
| Chain bomb awareness   | No      | No      | Yes     |
| Bomb cooldown          | 3.5s    | 2.5s    | 2.0s    |

---

## State Updates
- Add `npcs` to server state with fields:
  - id, x, y, alive, bombsAvailable, power, difficulty, cooldowns
- Clients render NPCs like players (different color/sprite).
- Bot logic runs entirely on the server — clients just render.

---

## Acceptance Tests (must pass)
1) With 1 human player, at least 1 NPC spawns and moves around the grid using pathfinding.
2) NPC places bombs strategically and can die in explosions.
3) NPC never places a bomb without a confirmed escape route (no suicides).
4) NPC actively chases and engages players, not just random wandering.
5) NPC behavior is consistent for both clients (server-controlled).
6) Bots appear and behave the same for both players on the deployed version.
7) Bot flees from danger zones before bombs explode.

---

## Non-Goals (keep scope tight)
- No minimax / game tree search
- No neural nets or learning
- No accounts/login
- No matchmaking ladder
- No persistent stats/DB

---

## Deliverable
- Working NPC bots with BFS pathfinding on the deployed game
- Bot difficulty configurable via parameters
- README updated with NPC info
