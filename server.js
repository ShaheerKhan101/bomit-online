// server.js — Colyseus authoritative game server + static file serving

import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import { Server, Room } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Schema, defineTypes, MapSchema, ArraySchema } from "@colyseus/schema";
import { EMPTY, WALL, BLOCK, GRID_PRESETS, POWERUP_FLAMETHROWER, POWERUP_RAYGUN, POWERUP_SHIELD, generateMap, computeSpawns } from "./src/map.js";
import { BOMB_FUSE, EXPLOSION_DURATION, DEFAULT_POWER, MAX_BOMBS, computeExplosion, computeFlamethrowerExplosion, computeRaygunExplosion, computeFlamethrowerShot, computeRaygunShot } from "./src/rules.js";
import { BotBrain } from "./src/bot.js";

// --- Express app for static files ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, "dist")));

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
    this.powerupType = 0;
    this.powerupUses = 0;
    this.hasShield = false;
    this.facing = "down";
    this.lives = 1;
    this.kills = 0;
    this.respawnAt = 0;
    this.spawnX = 0;
    this.spawnY = 0;
    this.invincibleUntil = 0;
  }
}
defineTypes(PlayerState, {
  x: "uint8",
  y: "uint8",
  alive: "boolean",
  bombsAvailable: "uint8",
  power: "uint8",
  playerIndex: "uint8",
  powerupType: "uint8",
  powerupUses: "uint8",
  hasShield: "boolean",
  facing: "string",
  lives: "uint8",
  kills: "uint16",
  respawnAt: "float64",
  spawnX: "uint8",
  spawnY: "uint8",
  invincibleUntil: "float64",
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

class NPCState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.alive = true;
    this.bombsAvailable = MAX_BOMBS;
    this.power = DEFAULT_POWER;
    this.difficulty = "medium";
    this.npcIndex = 0;
    this.powerupType = 0;
    this.powerupUses = 0;
    this.hasShield = false;
    this.facing = "down";
    this.lives = 1;
    this.kills = 0;
    this.respawnAt = 0;
    this.spawnX = 0;
    this.spawnY = 0;
    this.invincibleUntil = 0;
  }
}
defineTypes(NPCState, {
  x: "uint8",
  y: "uint8",
  alive: "boolean",
  bombsAvailable: "uint8",
  power: "uint8",
  difficulty: "string",
  npcIndex: "uint8",
  powerupType: "uint8",
  powerupUses: "uint8",
  hasShield: "boolean",
  facing: "string",
  lives: "uint8",
  kills: "uint16",
  respawnAt: "float64",
  spawnX: "uint8",
  spawnY: "uint8",
  invincibleUntil: "float64",
});

class GameState extends Schema {
  constructor() {
    super();
    this.cols = 13;
    this.rows = 11;
    this.map = new ArraySchema();
    this.players = new MapSchema();
    this.bombs = new MapSchema();
    this.npcs = new MapSchema();
    this.status = "lobby";
    this.result = "";
    this.gameMode = "classic";
    this.startingLives = 1;
    this.killTarget = 10;
  }
}
defineTypes(GameState, {
  cols: "uint8",
  rows: "uint8",
  map: ["uint8"],
  players: { map: PlayerState },
  bombs: { map: BombState },
  npcs: { map: NPCState },
  status: "string",
  result: "string",
  gameMode: "string",
  startingLives: "uint8",
  killTarget: "uint16",
});

// --- Helpers ---

function applyPowerup(entity, tileType) {
  if (tileType === POWERUP_FLAMETHROWER) {
    entity.powerupType = 1;
    entity.powerupUses = 3;
  } else if (tileType === POWERUP_RAYGUN) {
    entity.powerupType = 2;
    entity.powerupUses = 3;
  } else if (tileType === POWERUP_SHIELD) {
    entity.hasShield = true;
  }
}

// --- Game Room ---

class GameRoom extends Room {
  onCreate(options) {
    this.setState(new GameState());
    this.maxClients = 2;
    this.grid = null;
    this.hiddenPowerups = null;
    this.bombIdCounter = 0;
    this.playerLastMove = {};
    this.npcLastMove = {};
    this.botBrains = {};
    this.moveDelay = 120;
    this.respawnQueue = [];
    this.restartVotes = new Set();

    // Read room options
    const presetName = options.gridSize || "medium";
    const preset = GRID_PRESETS[presetName] || GRID_PRESETS.medium;
    this.roomCols = preset.cols;
    this.roomRows = preset.rows;
    this.botCount = Math.min(Math.max(parseInt(options.botCount) || 1, 0), 4);
    this.botDifficulty = ["easy", "medium", "hard"].includes(options.botDifficulty)
      ? options.botDifficulty : "medium";

    // Game mode options
    this.gameMode = ["classic", "lives", "kills"].includes(options.gameMode)
      ? options.gameMode : "classic";
    this.startingLives = [1, 2, 3, 5].includes(parseInt(options.startingLives))
      ? parseInt(options.startingLives) : (this.gameMode === "lives" ? 3 : 1);
    this.killTarget = [5, 10, 15, 20].includes(parseInt(options.killTarget))
      ? parseInt(options.killTarget) : 10;

    this.state.gameMode = this.gameMode;
    this.state.startingLives = this.startingLives;
    this.state.killTarget = this.killTarget;

    this.setSimulationInterval((dt) => this.tick(dt), 60);

    this.onMessage("move", (client, message) => {
      this.handleMove(client, message);
    });

    this.onMessage("bomb", (client) => {
      this.handleBomb(client);
    });

    this.onMessage("fire", (client) => {
      this.handleWeaponFire(client);
    });

    this.onMessage("restart", (client) => {
      this.restartVotes.add(client.sessionId);
      const needed = this.state.players.size;
      this.broadcast("restartVote", { current: this.restartVotes.size, needed });
      if (this.restartVotes.size >= needed && needed > 0) {
        this.restartVotes.clear();
        this.startGame();
      }
    });

    console.log(`Room created: ${this.roomId} (code: ${options.roomCode || "none"}, grid: ${this.roomCols}x${this.roomRows}, bots: ${this.botCount} ${this.botDifficulty}, mode: ${this.gameMode})`);
  }

  onJoin(client, options) {
    const playerIndex = this.state.players.size;
    const spawns = computeSpawns(this.roomCols, this.roomRows);
    const spawn = spawns.players[playerIndex];

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
    this.restartVotes.delete(client.sessionId);

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
    this.restartVotes = new Set();
    this.broadcast("restartVote", { current: 0, needed: 0 });

    const cols = this.roomCols;
    const rows = this.roomRows;

    this.state.cols = cols;
    this.state.rows = rows;

    // Generate map
    const { grid, hiddenPowerups } = generateMap(cols, rows);
    this.grid = grid;
    this.hiddenPowerups = hiddenPowerups;

    // Flatten 2D grid to 1D ArraySchema and count blocks
    this.state.map.clear();
    this.blockCount = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.state.map.push(this.grid[y][x]);
        if (this.grid[y][x] === BLOCK) this.blockCount++;
      }
    }

    // Late-game state
    this.lateGameActive = false;
    this.lateGameStartedAt = 0;
    this.lastPowerupDrop = 0;
    this.lastShrink = 0;
    this.shrinkRing = 1;

    // Reset players to spawns
    const spawns = computeSpawns(cols, rows);
    let idx = 0;
    this.state.players.forEach((player) => {
      const spawn = spawns.players[idx];
      player.x = spawn.x;
      player.y = spawn.y;
      player.alive = true;
      player.bombsAvailable = MAX_BOMBS;
      player.power = DEFAULT_POWER;
      player.playerIndex = idx;
      player.powerupType = 0;
      player.powerupUses = 0;
      player.hasShield = false;
      player.facing = "down";
      player.spawnX = spawn.x;
      player.spawnY = spawn.y;
      player.kills = 0;
      player.invincibleUntil = 0;
      player.respawnAt = 0;
      // Lives: classic=1, lives=configured, kills=255 (effectively infinite)
      player.lives = this.gameMode === "kills" ? 255
        : this.gameMode === "lives" ? this.startingLives : 1;
      idx++;
    });

    // Clear bombs and NPCs
    this.state.bombs.clear();
    this.state.npcs.clear();
    this.bombIdCounter = 0;
    this.playerLastMove = {};
    this.npcLastMove = {};
    this.botBrains = {};
    this.respawnQueue = [];

    // Spawn NPCs
    for (let i = 0; i < this.botCount; i++) {
      const spawn = spawns.npcs[i];
      const npcId = `npc_${i}`;

      const npc = new NPCState();
      npc.x = spawn.x;
      npc.y = spawn.y;
      npc.alive = true;
      npc.bombsAvailable = MAX_BOMBS;
      npc.power = DEFAULT_POWER;
      npc.difficulty = this.botDifficulty;
      npc.npcIndex = i;
      npc.facing = "down";
      npc.spawnX = spawn.x;
      npc.spawnY = spawn.y;
      npc.kills = 0;
      npc.invincibleUntil = 0;
      npc.respawnAt = 0;
      npc.lives = this.gameMode === "kills" ? 255
        : this.gameMode === "lives" ? this.startingLives : 1;

      this.state.npcs.set(npcId, npc);
      this.botBrains[npcId] = new BotBrain(npcId, this.botDifficulty, cols, rows);
    }

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
      if (!bomb) continue; // Already chain-detonated
      this.detonateBomb(bomb);

      const owner = this.state.players.get(bomb.ownerId)
        || this.state.npcs.get(bomb.ownerId);
      if (owner) {
        owner.bombsAvailable++;
      }

      this.state.bombs.delete(id);
    }

    // Process respawns
    this.respawnQueue = this.respawnQueue.filter(entry => {
      if (now >= entry.respawnAt) {
        const entity = entry.isNpc
          ? this.state.npcs.get(entry.entityId)
          : this.state.players.get(entry.entityId);
        if (entity && !entity.alive && entity.lives > 0) {
          entity.alive = true;
          entity.x = entity.spawnX;
          entity.y = entity.spawnY;
          entity.respawnAt = 0;
          entity.hasShield = false;
          entity.powerupType = 0;
          entity.powerupUses = 0;
          entity.bombsAvailable = MAX_BOMBS;
          entity.invincibleUntil = now + 1500;
        }
        return false;
      }
      return true;
    });

    // Late-game events (powerup drops + shrinking border)
    if (this.lateGameActive) this.tickLateGame(now);

    // Check win condition every tick (respawns change alive counts)
    this.checkWinCondition();

    this.updateBots(dt);
  }

  killEntity(entity, entityId, isNpc, killerId) {
    const now = Date.now();

    // Invincibility check
    if (entity.invincibleUntil > now) return;

    // Shield absorb
    if (entity.hasShield) {
      entity.hasShield = false;
      this.broadcast("shieldAbsorb", { entityId });
      return;
    }

    entity.alive = false;

    // Credit the kill
    if (killerId && killerId !== entityId) {
      const killer = this.state.players.get(killerId)
        || this.state.npcs.get(killerId);
      if (killer) {
        killer.kills++;
      }
    }

    // Classic mode: permanent death
    if (this.gameMode === "classic") {
      entity.lives = 0;
      return;
    }

    // Decrement lives
    entity.lives--;

    if (entity.lives <= 0) return; // Permanently dead

    // Schedule respawn
    const delay = this.gameMode === "kills" ? 1500 : 2000;
    entity.respawnAt = now + delay;
    this.respawnQueue.push({
      entityId,
      respawnAt: entity.respawnAt,
      isNpc,
    });
  }

  detonateBomb(bomb) {
    const cols = this.roomCols;
    const rows = this.roomRows;
    const owner = this.state.players.get(bomb.ownerId)
      || this.state.npcs.get(bomb.ownerId);

    // Bombs always use standard explosion (weapons handle their own patterns)
    const power = owner ? owner.power : DEFAULT_POWER;
    const { tiles, destroyed } = computeExplosion(this.grid, bomb.x, bomb.y, power, cols, rows);

    // Destroy blocks — reveal hidden powerups
    for (const d of destroyed) {
      const hidden = this.hiddenPowerups[d.y][d.x];
      if (hidden > 0) {
        this.grid[d.y][d.x] = hidden;
        this.state.map[d.y * cols + d.x] = hidden;
        this.hiddenPowerups[d.y][d.x] = 0;
      } else {
        this.grid[d.y][d.x] = EMPTY;
        this.state.map[d.y * cols + d.x] = EMPTY;
      }
    }
    this.blockCount -= destroyed.length;
    if (this.blockCount <= 0 && !this.lateGameActive) {
      this.lateGameActive = true;
      this.lateGameStartedAt = Date.now();
    }

    // Kill entities in blast
    this.state.players.forEach((player, sessionId) => {
      if (!player.alive) return;
      for (const t of tiles) {
        if (t.x === player.x && t.y === player.y) {
          this.killEntity(player, sessionId, false, bomb.ownerId);
          break;
        }
      }
    });

    this.state.npcs.forEach((npc, npcId) => {
      if (!npc.alive) return;
      for (const t of tiles) {
        if (t.x === npc.x && t.y === npc.y) {
          this.killEntity(npc, npcId, true, bomb.ownerId);
          break;
        }
      }
    });

    // Chain explosions
    const chainsToExplode = [];
    this.state.bombs.forEach((otherBomb, id) => {
      for (const t of tiles) {
        if (t.x === otherBomb.x && t.y === otherBomb.y) {
          chainsToExplode.push(id);
          break;
        }
      }
    });

    this.broadcast("explosion", { tiles });

    for (const id of chainsToExplode) {
      const chainBomb = this.state.bombs.get(id);
      if (chainBomb) {
        const chainOwner = this.state.players.get(chainBomb.ownerId)
          || this.state.npcs.get(chainBomb.ownerId);
        if (chainOwner) chainOwner.bombsAvailable++;
        this.state.bombs.delete(id);
        this.detonateBomb(chainBomb);
      }
    }
  }

  handleWeaponFire(client) {
    if (this.state.status !== "playing") return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive) return;
    if (player.powerupType === 0 || player.powerupUses <= 0) return;

    this.fireWeapon(player, client.sessionId, false);
  }

  handleNpcWeaponFire(npcId, npc) {
    if (!npc.alive) return;
    if (npc.powerupType === 0 || npc.powerupUses <= 0) return;

    this.fireWeapon(npc, npcId, true);
  }

  fireWeapon(entity, entityId, isNpc) {
    const cols = this.roomCols;
    const rows = this.roomRows;
    const dir = entity.facing;

    let result;
    let weaponType;
    if (entity.powerupType === 1) {
      result = computeFlamethrowerShot(this.grid, entity.x, entity.y, dir, cols, rows);
      weaponType = "flamethrower";
    } else if (entity.powerupType === 2) {
      result = computeRaygunShot(this.grid, entity.x, entity.y, dir, cols, rows);
      weaponType = "raygun";
    } else {
      return;
    }

    const { tiles, destroyed } = result;

    // Decrement uses
    entity.powerupUses--;
    if (entity.powerupUses <= 0) {
      entity.powerupType = 0;
      entity.powerupUses = 0;
    }

    // Destroy blocks, reveal powerups
    for (const d of destroyed) {
      const hidden = this.hiddenPowerups[d.y][d.x];
      if (hidden > 0) {
        this.grid[d.y][d.x] = hidden;
        this.state.map[d.y * this.roomCols + d.x] = hidden;
        this.hiddenPowerups[d.y][d.x] = 0;
      } else {
        this.grid[d.y][d.x] = EMPTY;
        this.state.map[d.y * this.roomCols + d.x] = EMPTY;
      }
    }
    this.blockCount -= destroyed.length;
    if (this.blockCount <= 0 && !this.lateGameActive) {
      this.lateGameActive = true;
      this.lateGameStartedAt = Date.now();
    }

    // Kill entities in affected tiles
    this.state.players.forEach((p, sid) => {
      if (!p.alive || sid === entityId) return;
      for (const t of tiles) {
        if (t.x === p.x && t.y === p.y) {
          this.killEntity(p, sid, false, entityId);
          break;
        }
      }
    });

    this.state.npcs.forEach((npc, nid) => {
      if (!npc.alive || nid === entityId) return;
      for (const t of tiles) {
        if (t.x === npc.x && t.y === npc.y) {
          this.killEntity(npc, nid, true, entityId);
          break;
        }
      }
    });

    // Chain-detonate any bombs hit
    const chainsToExplode = [];
    this.state.bombs.forEach((bomb, id) => {
      for (const t of tiles) {
        if (t.x === bomb.x && t.y === bomb.y) {
          chainsToExplode.push(id);
          break;
        }
      }
    });

    this.broadcast("weaponFire", { tiles, weaponType, dir, originX: entity.x, originY: entity.y });

    for (const id of chainsToExplode) {
      const chainBomb = this.state.bombs.get(id);
      if (chainBomb) {
        const chainOwner = this.state.players.get(chainBomb.ownerId)
          || this.state.npcs.get(chainBomb.ownerId);
        if (chainOwner) chainOwner.bombsAvailable++;
        this.state.bombs.delete(id);
        this.detonateBomb(chainBomb);
      }
    }
  }

  tickLateGame(now) {
    const cols = this.roomCols;
    const rows = this.roomRows;

    // Periodic powerup drops every 8 seconds
    if (now - this.lastPowerupDrop >= 8000) {
      this.lastPowerupDrop = now;

      // Count existing powerups on map (cap at 5)
      let powerupsOnMap = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (this.grid[y][x] >= POWERUP_FLAMETHROWER) powerupsOnMap++;
        }
      }

      if (powerupsOnMap < 5) {
        // Collect empty tiles
        const empties = [];
        for (let y = 1; y < rows - 1; y++) {
          for (let x = 1; x < cols - 1; x++) {
            if (this.grid[y][x] === EMPTY) empties.push({ x, y });
          }
        }
        if (empties.length > 0) {
          const spot = empties[Math.floor(Math.random() * empties.length)];
          const types = [POWERUP_FLAMETHROWER, POWERUP_RAYGUN, POWERUP_SHIELD];
          const pType = types[Math.floor(Math.random() * types.length)];
          this.grid[spot.y][spot.x] = pType;
          this.state.map[spot.y * cols + spot.x] = pType;
          this.broadcast("powerupDrop", { x: spot.x, y: spot.y });
        }
      }
    }

    // Shrinking border — starts 30s after late game begins
    if (now - this.lateGameStartedAt >= 30000 && now - this.lastShrink >= 3000) {
      const ring = this.shrinkRing;
      // Stop if playable area would be less than 5x5
      const playableW = cols - 2 * (ring + 1);
      const playableH = rows - 2 * (ring + 1);
      if (playableW < 5 || playableH < 5) return;

      this.lastShrink = now;
      const shrinkTiles = [];

      // Top and bottom edges of this ring
      for (let x = ring; x < cols - ring; x++) {
        if (this.grid[ring][x] !== WALL) shrinkTiles.push({ x, y: ring });
        if (this.grid[rows - 1 - ring][x] !== WALL) shrinkTiles.push({ x, y: rows - 1 - ring });
      }
      // Left and right edges (excluding corners already covered)
      for (let y = ring + 1; y < rows - 1 - ring; y++) {
        if (this.grid[y][ring] !== WALL) shrinkTiles.push({ x: ring, y });
        if (this.grid[y][cols - 1 - ring] !== WALL) shrinkTiles.push({ x: cols - 1 - ring, y });
      }

      // Convert tiles to walls
      for (const t of shrinkTiles) {
        this.grid[t.y][t.x] = WALL;
        this.state.map[t.y * cols + t.x] = WALL;
      }

      // Kill entities on shrunk tiles
      this.state.players.forEach((player, sessionId) => {
        if (!player.alive) return;
        for (const t of shrinkTiles) {
          if (t.x === player.x && t.y === player.y) {
            this.killEntity(player, sessionId, false, null);
            break;
          }
        }
      });
      this.state.npcs.forEach((npc, npcId) => {
        if (!npc.alive) return;
        for (const t of shrinkTiles) {
          if (t.x === npc.x && t.y === npc.y) {
            this.killEntity(npc, npcId, true, null);
            break;
          }
        }
      });

      // Detonate bombs on shrunk tiles
      const bombsToDetonate = [];
      this.state.bombs.forEach((bomb, id) => {
        for (const t of shrinkTiles) {
          if (t.x === bomb.x && t.y === bomb.y) {
            bombsToDetonate.push(id);
            break;
          }
        }
      });
      for (const id of bombsToDetonate) {
        const bomb = this.state.bombs.get(id);
        if (bomb) {
          const owner = this.state.players.get(bomb.ownerId)
            || this.state.npcs.get(bomb.ownerId);
          if (owner) owner.bombsAvailable++;
          this.state.bombs.delete(id);
          this.detonateBomb(bomb);
        }
      }

      this.broadcast("shrink", { tiles: shrinkTiles });
      this.shrinkRing++;
    }
  }

  checkWinCondition() {
    if (this.gameMode === "kills") {
      return this.checkKillsWin();
    }
    return this.checkLastStandingWin();
  }

  checkLastStandingWin() {
    const entities = [];

    this.state.players.forEach((player, sessionId) => {
      // Entity is "out" if dead with no lives remaining and not respawning
      const isOut = !player.alive && player.lives <= 0;
      entities.push({ id: sessionId, out: isOut, isNpc: false, playerIndex: player.playerIndex });
    });

    this.state.npcs.forEach((npc, npcId) => {
      const isOut = !npc.alive && npc.lives <= 0;
      entities.push({ id: npcId, out: isOut, isNpc: true });
    });

    if (entities.length < 2) return;

    const remaining = entities.filter(e => !e.out);

    if (remaining.length === 0) {
      this.endGame("draw");
    } else if (remaining.length === 1) {
      const winner = remaining[0];
      this.endGame(winner.isNpc ? "npc" : (winner.playerIndex === 0 ? "p1" : "p2"));
    }
  }

  checkKillsWin() {
    let winner = null;

    this.state.players.forEach((player, sessionId) => {
      if (player.kills >= this.killTarget) {
        if (!winner || player.kills > winner.kills) {
          winner = { isNpc: false, playerIndex: player.playerIndex, kills: player.kills };
        }
      }
    });

    this.state.npcs.forEach((npc, npcId) => {
      if (npc.kills >= this.killTarget) {
        if (!winner || npc.kills > winner.kills) {
          winner = { isNpc: true, id: npcId, kills: npc.kills };
        }
      }
    });

    if (winner) {
      this.endGame(winner.isNpc ? "npc" : (winner.playerIndex === 0 ? "p1" : "p2"));
    }
  }

  endGame(result) {
    this.state.status = "ended";
    this.state.result = result;
    this.scheduleRestart();
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

    player.facing = dir;

    const nx = player.x + dx;
    const ny = player.y + dy;

    if (nx < 0 || nx >= this.roomCols || ny < 0 || ny >= this.roomRows) return;

    const tile = this.grid[ny][nx];
    if (tile === WALL || tile === BLOCK) return;

    let blocked = false;
    this.state.bombs.forEach((bomb) => {
      if (bomb.x === nx && bomb.y === ny) blocked = true;
    });
    if (blocked) return;

    player.x = nx;
    player.y = ny;
    this.playerLastMove[client.sessionId] = now;

    // Powerup pickup
    const tileAtNew = this.grid[ny][nx];
    if (tileAtNew >= 3 && tileAtNew <= 5) {
      applyPowerup(player, tileAtNew);
      this.grid[ny][nx] = EMPTY;
      this.state.map[ny * this.roomCols + nx] = EMPTY;
    }
  }

  handleBomb(client) {
    if (this.state.status !== "playing") return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive) return;
    if (player.bombsAvailable <= 0) return;

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

  updateBots(dt) {
    if (this.state.status !== "playing") return;

    const now = Date.now();

    const alivePlayers = [];
    this.state.players.forEach((player, sessionId) => {
      if (player.alive) {
        alivePlayers.push({ x: player.x, y: player.y, id: sessionId });
      }
    });

    this.state.npcs.forEach((npc, npcId) => {
      if (!npc.alive) return;

      const brain = this.botBrains[npcId];
      if (!brain) return;

      const action = brain.update(dt, npc, this.grid, this.state.bombs, alivePlayers, now);
      if (!action) return;

      if (action.type === "move") {
        this.handleNpcMove(npcId, npc, action.dir, now);
      } else if (action.type === "bomb") {
        this.handleNpcBomb(npcId, npc, now);
      } else if (action.type === "fire") {
        npc.facing = action.dir;
        this.handleNpcWeaponFire(npcId, npc);
      }
    });
  }

  handleNpcMove(npcId, npc, dir, now) {
    const lastMove = this.npcLastMove[npcId] || 0;
    if (now - lastMove < this.moveDelay) return;

    let dx = 0, dy = 0;
    if (dir === "up") dy = -1;
    else if (dir === "down") dy = 1;
    else if (dir === "left") dx = -1;
    else if (dir === "right") dx = 1;
    else return;

    npc.facing = dir;

    const nx = npc.x + dx;
    const ny = npc.y + dy;

    if (nx < 0 || nx >= this.roomCols || ny < 0 || ny >= this.roomRows) return;

    const tile = this.grid[ny][nx];
    if (tile === WALL || tile === BLOCK) return;

    let blocked = false;
    this.state.bombs.forEach((bomb) => {
      if (bomb.x === nx && bomb.y === ny) blocked = true;
    });
    if (blocked) return;

    npc.x = nx;
    npc.y = ny;
    this.npcLastMove[npcId] = now;

    // Powerup pickup
    const tileAtNew = this.grid[ny][nx];
    if (tileAtNew >= 3 && tileAtNew <= 5) {
      applyPowerup(npc, tileAtNew);
      this.grid[ny][nx] = EMPTY;
      this.state.map[ny * this.roomCols + nx] = EMPTY;
    }
  }

  handleNpcBomb(npcId, npc, now) {
    if (npc.bombsAvailable <= 0) return;

    let occupied = false;
    this.state.bombs.forEach((bomb) => {
      if (bomb.x === npc.x && bomb.y === npc.y) occupied = true;
    });
    if (occupied) return;

    const bomb = new BombState();
    bomb.x = npc.x;
    bomb.y = npc.y;
    bomb.ownerId = npcId;
    bomb.explodeAt = Date.now() + BOMB_FUSE;

    const id = `b${this.bombIdCounter++}`;
    this.state.bombs.set(id, bomb);
    npc.bombsAvailable--;
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
  console.log(`Bomb It server listening on http://localhost:${port}`);
});
