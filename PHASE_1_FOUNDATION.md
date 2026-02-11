# PHASE_1_FOUNDATION.md
## Goal
Create a playable **Bomb It–style** single-device prototype in the browser:
- Top-down **tile grid**
- Player movement (4-dir)
- Place bomb
- Bomb explodes after timer
- Explosion destroys soft blocks and can kill the player

**No multiplayer yet. No NPCs yet. No hosting yet.**

---

## Tech Stack (Phase 1)
- Frontend: **Phaser 3** + **Vite** (JavaScript, not TypeScript for speed)
- No backend in Phase 1

---

## Hard Constraints
- Keep it **small and deterministic**:
  - Grid size: **13 x 11**
  - Tile size: **32px**
- Only these tile types:
  - `WALL` (indestructible)
  - `BLOCK` (destructible)
  - `EMPTY`
- Use **simple placeholder rectangles** if sprites are not available.

---

## Repo Structure
- `/public`
- `/src`
  - `main.js` (boot Phaser)
  - `GameScene.js` (all gameplay for now)
  - `map.js` (grid generation + constants)
  - `rules.js` (bomb/explosion helpers)
- `index.html`
- `vite.config.*`
- `package.json`

---

## Gameplay Rules (Phase 1)
### Map
- Border is all `WALL`.
- Internal `WALL` pattern: classic Bomberman style (every other tile).
- Random `BLOCK` fill, but keep spawn area clear:
  - Clear tiles near player spawn: `(1,1)`, `(2,1)`, `(1,2)`

### Player
- Spawn at `(1,1)`
- Movement: arrow keys or WASD
- One tile per step OR smooth movement snapped to grid (your choice; pick fastest)
- Collision: can’t enter `WALL` or `BLOCK`

### Bomb
- Player can place a bomb on their current tile if:
  - No bomb already there
  - Player has not exceeded max bombs (Phase 1: max bombs = 1)
- Bomb fuse: **2000ms**
- Bomb explosion:
  - Cross shape (center + up/down/left/right)
  - Power/radius: **2 tiles**
  - Explosion stops when it hits a `WALL`
  - If hits a `BLOCK`, it destroys it and stops propagation in that direction

### Death
- If player is on any explosion tile at detonation time: player “dies”
- On death: show a text “You Died — Press R to Restart”

---

## UI / Controls
- Movement: WASD + arrow keys
- Place bomb: Space
- Restart: R
- Show debug text: bombs count, position, state

---

## Acceptance Tests (must pass)
1) Player can move around empty tiles and is blocked by walls/blocks.
2) Space places a bomb; after ~2s it explodes.
3) Explosion destroys nearby blocks according to rules.
4) If player is in blast at explosion time, they die and can restart with R.
5) No console errors.

---

## Implementation Notes (speed tips)
- Represent map as a 2D array of ints.
- Render tiles as colored rectangles (Phaser Graphics) or sprites if quick.
- Keep bombs in a map keyed by `"x,y"` for fast lookups.
- Explosion can be a temporary overlay that lasts ~300ms.

---

## Deliverable
A working `npm run dev` experience with the Phase 1 rules above.


