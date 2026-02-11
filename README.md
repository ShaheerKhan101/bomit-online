# Bomb It Online

## How to Run (Phase 2 — Multiplayer)

**Terminal 1 — Start the game server:**
```
npm install
npm run server
```

**Terminal 2 — Start the client dev server:**
```
npm run dev
```

Open **two browser tabs** to `http://localhost:5173`.  
Enter the same room code in both tabs and click **Join**.

## Controls
- **Move**: WASD or Arrow keys
- **Place bomb**: Space

## Game Rules
- 2 players per room (room code based)
- Server is authoritative (positions, bombs, explosions, deaths)
- Bomb fuse: 2 seconds, blast radius: 2 tiles
- Round ends when one player dies (or draw if both die)
- Auto-restarts after 3 seconds

## Known Limitations (Phase 2)
- No NPCs yet
- Placeholder rectangle graphics (no sprites)
- No deployment — local only
- No client-side prediction (movement may feel slightly delayed on high latency)
