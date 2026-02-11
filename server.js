// server.js — Colyseus authoritative game server + static file serving

import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import { Server, Room } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Schema, defineTypes, MapSchema, ArraySchema } from "@colyseus/schema";
import { COLS, ROWS, EMPTY, WALL, BLOCK, generateMap } from "./src/map.js";
import { BOMB_FUSE, EXPLOSION_DURATION, DEFAULT_POWER, MAX_BOMBS, computeExplosion } from "./src/rules.js";

// --- Express app for static files ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve built client from /dist
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback — serve index.html for any non-API route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// --- Schema Definitions ---

class PlayerState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.alive = true;
    this.bombsAvailable = MAX_BOMBS;
    this.power = DEFAULT_POWER;
    this.playerIndex = 0;
  }
}
defineTypes(PlayerState, {
  x: "uint8",
  y: "uint8",
  alive: "boolean",
  bombsAvailable: "uint8",
  power: "uint8",
  playerIndex: "uint8",
});

class BombState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.ownerId = "";
    this.explodeAt = 0;
  }
}
defineTypes(BombState, {
  x: "uint8",
  y: "uint8",
  ownerId: "string",
  explodeAt: "float64",
});

class GameState extends Schema {
  constructor() {
    super();
    this.map = new ArraySchema();
    this.players = new MapSchema();
    this.bombs = new MapSchema();
    this.status = "lobby";
    this.result = "";
  }
}
defineTypes(GameState, {
  map: ["uint8"],
  players: { map: PlayerState },
  bombs: { map: BombState },
  status: "string",
  result: "string",
});

// --- Spawn positions ---
const SPAWNS = [
  { x: 1, y: 1 },
  { x: 11, y: 9 },
];

// --- Game Room ---

class GameRoom extends Room {
  onCreate(options) {
    this.setState(new GameState());
    this.maxClients = 2;
    this.grid = null;
    this.bombIdCounter = 0;
    this.playerLastMove = {};
    this.moveDelay = 120; // ms between moves per player

    // Start simulation loop (always runs, checks status inside)
    this.setSimulationInterval((dt) => this.tick(dt), 60);

    // Message handlers
    this.onMessage("move", (client, message) => {
      this.handleMove(client, message);
    });

    this.onMessage("bomb", (client) => {
      this.handleBomb(client);
    });

    this.onMessage("restart", (client) => {
      // handled by auto-restart timer
    });

    console.log(`Room created: ${this.roomId} (code: ${options.roomCode || "none"})`);
  }

  onJoin(client, options) {
    const playerIndex = this.state.players.size;
    const spawn = SPAWNS[playerIndex];

    const player = new PlayerState();
    player.x = spawn.x;
    player.y = spawn.y;
    player.alive = true;
    player.bombsAvailable = MAX_BOMBS;
    player.power = DEFAULT_POWER;
    player.playerIndex = playerIndex;

    this.state.players.set(client.sessionId, player);
    console.log(`Player ${playerIndex + 1} joined: ${client.sessionId}`);

    if (this.state.players.size === 2) {
      this.startGame();
    }
  }

  onLeave(client) {
    console.log(`Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
    delete this.playerLastMove[client.sessionId];

    if (this.state.status === "playing") {
      this.state.status = "ended";
      this.state.result = "disconnect";
      this.clock.setTimeout(() => {
        this.state.status = "lobby";
        this.state.result = "";
        this.state.bombs.clear();
      }, 2000);
    }
  }

  startGame() {
    // Generate map server-side
    this.grid = generateMap();

    // Flatten 2D grid to 1D ArraySchema
    this.state.map.clear();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        this.state.map.push(this.grid[y][x]);
      }
    }

    // Reset players to spawns
    let idx = 0;
    this.state.players.forEach((player) => {
      const spawn = SPAWNS[idx];
      player.x = spawn.x;
      player.y = spawn.y;
      player.alive = true;
      player.bombsAvailable = MAX_BOMBS;
      player.power = DEFAULT_POWER;
      player.playerIndex = idx;
      idx++;
    });

    // Clear bombs
    this.state.bombs.clear();
    this.bombIdCounter = 0;
    this.playerLastMove = {};

    this.state.status = "playing";
    this.state.result = "";

    console.log("Game started!");
  }

  tick(dt) {
    if (this.state.status !== "playing") return;

    const now = Date.now();

    // Check bomb timers
    const toExplode = [];
    this.state.bombs.forEach((bomb, id) => {
      if (now >= bomb.explodeAt) {
        toExplode.push(id);
      }
    });

    for (const id of toExplode) {
      const bomb = this.state.bombs.get(id);
      this.detonateBomb(bomb);

      // Return bomb slot to owner
      const owner = this.state.players.get(bomb.ownerId);
      if (owner) {
        owner.bombsAvailable++;
      }

      this.state.bombs.delete(id);
    }

    // Check win condition after all explosions
    if (toExplode.length > 0) {
      this.checkWinCondition();
    }
  }

  detonateBomb(bomb) {
    const { tiles, destroyed } = computeExplosion(this.grid, bomb.x, bomb.y, DEFAULT_POWER);

    // Destroy blocks in internal grid and synced state
    for (const d of destroyed) {
      this.grid[d.y][d.x] = EMPTY;
      this.state.map[d.y * COLS + d.x] = EMPTY;
    }

    // Check if any player is caught in blast
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      for (const t of tiles) {
        if (t.x === player.x && t.y === player.y) {
          player.alive = false;
          break;
        }
      }
    });

    // Chain explosions: check if any other bomb is in the blast
    const chainsToExplode = [];
    this.state.bombs.forEach((otherBomb, id) => {
      for (const t of tiles) {
        if (t.x === otherBomb.x && t.y === otherBomb.y) {
          chainsToExplode.push(id);
          break;
        }
      }
    });

    // Broadcast explosion event for client visuals
    this.broadcast("explosion", { tiles });

    // Detonate chained bombs
    for (const id of chainsToExplode) {
      const chainBomb = this.state.bombs.get(id);
      if (chainBomb) {
        const owner = this.state.players.get(chainBomb.ownerId);
        if (owner) owner.bombsAvailable++;
        this.state.bombs.delete(id);
        this.detonateBomb(chainBomb);
      }
    }
  }

  checkWinCondition() {
    const players = [];
    this.state.players.forEach((player, sessionId) => {
      players.push({ sessionId, player });
    });

    if (players.length < 2) return;

    const alive = players.filter(p => p.player.alive);

    if (alive.length === 0) {
      // Both dead = draw
      this.state.status = "ended";
      this.state.result = "draw";
      this.scheduleRestart();
    } else if (alive.length === 1) {
      // One alive = winner
      const winner = alive[0].player.playerIndex === 0 ? "p1" : "p2";
      this.state.status = "ended";
      this.state.result = winner;
      this.scheduleRestart();
    }
  }

  scheduleRestart() {
    this.clock.setTimeout(() => {
      if (this.state.players.size === 2) {
        this.startGame();
      } else {
        this.state.status = "lobby";
        this.state.result = "";
      }
    }, 3000);
  }

  handleMove(client, message) {
    if (this.state.status !== "playing") return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive) return;

    // Rate limit
    const now = Date.now();
    const lastMove = this.playerLastMove[client.sessionId] || 0;
    if (now - lastMove < this.moveDelay) return;

    const { dir } = message;
    let dx = 0, dy = 0;
    if (dir === "up") dy = -1;
    else if (dir === "down") dy = 1;
    else if (dir === "left") dx = -1;
    else if (dir === "right") dx = 1;
    else return;

    const nx = player.x + dx;
    const ny = player.y + dy;

    // Bounds
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;

    // Collision with walls/blocks
    const tile = this.grid[ny][nx];
    if (tile === WALL || tile === BLOCK) return;

    // Collision with bombs
    let blocked = false;
    this.state.bombs.forEach((bomb) => {
      if (bomb.x === nx && bomb.y === ny) blocked = true;
    });
    if (blocked) return;

    player.x = nx;
    player.y = ny;
    this.playerLastMove[client.sessionId] = now;
  }

  handleBomb(client) {
    if (this.state.status !== "playing") return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive) return;
    if (player.bombsAvailable <= 0) return;

    // Check if bomb already at this position
    let occupied = false;
    this.state.bombs.forEach((bomb) => {
      if (bomb.x === player.x && bomb.y === player.y) occupied = true;
    });
    if (occupied) return;

    const bomb = new BombState();
    bomb.x = player.x;
    bomb.y = player.y;
    bomb.ownerId = client.sessionId;
    bomb.explodeAt = Date.now() + BOMB_FUSE;

    const id = `b${this.bombIdCounter++}`;
    this.state.bombs.set(id, bomb);
    player.bombsAvailable--;
  }
}

// --- Boot Server ---

const port = Number(process.env.PORT || 2567);

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("game", GameRoom).filterBy(["roomCode"]);

gameServer.listen(port).then(() => {
  console.log(`🎮 Bomb It server listening on http://localhost:${port}`);
});
