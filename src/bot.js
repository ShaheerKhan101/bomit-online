// bot.js — NPC bot AI with BFS pathfinding, danger awareness, and priority-based decisions

import { WALL, BLOCK } from "./map.js";
import { BOMB_FUSE, DEFAULT_POWER, computeExplosion, computeFlamethrowerExplosion, computeRaygunExplosion, computeFlamethrowerShot, computeRaygunShot } from "./rules.js";

// --- Difficulty configurations ---

const DIFFICULTY = {
  easy: {
    tickRate: 300,
    mistakeRate: 0.20,
    useBfsForChase: false,
    useBfsForAttack: false,
    dangerAwareness: "adjacent",
    chainAwareness: false,
    escapeCheck: true,
    trapLogic: false,
    chaseEnabled: false,
    chaseRange: Infinity,
    bombCooldown: 3500,
    bombChanceNearPlayer: 0.20,
    nearPlayerDist: 2,
    seekPowerups: false,
  },
  medium: {
    tickRate: 200,
    mistakeRate: 0.15,
    useBfsForChase: true,
    useBfsForAttack: true,
    dangerAwareness: "full",
    chainAwareness: false,
    escapeCheck: true,
    trapLogic: false,
    chaseEnabled: true,
    chaseRange: 5,
    bombCooldown: 2500,
    bombChanceNearPlayer: 1.0,
    nearPlayerDist: 0,
    seekPowerups: true,
  },
  hard: {
    tickRate: 150,
    mistakeRate: 0.05,
    useBfsForChase: true,
    useBfsForAttack: true,
    dangerAwareness: "full",
    chainAwareness: true,
    escapeCheck: true,
    trapLogic: true,
    chaseEnabled: true,
    chaseRange: Infinity,
    bombCooldown: 2000,
    bombChanceNearPlayer: 1.0,
    nearPlayerDist: 0,
    seekPowerups: true,
  },
};

// --- Helpers ---

const DIRS = [
  { dx: 0, dy: -1, name: "up" },
  { dx: 0, dy: 1, name: "down" },
  { dx: -1, dy: 0, name: "left" },
  { dx: 1, dy: 0, name: "right" },
];

function manhattanDist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function isPassable(tile) {
  return tile !== WALL && tile !== BLOCK;
}

function buildBombSet(bombs) {
  const set = new Set();
  bombs.forEach((bomb) => {
    set.add(`${bomb.x},${bomb.y}`);
  });
  return set;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- BotBrain class ---

export class BotBrain {
  constructor(npcId, difficulty, cols, rows) {
    this.npcId = npcId;
    this.config = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    this.cols = cols;
    this.rows = rows;
    this.elapsed = 0;
    this.lastBombTime = 0;

    // Anti-oscillation: commit to a direction for a few ticks
    this.lastDir = null;
    this.commitTicks = 0;

    // Post-bomb flee: remember where we just placed a bomb
    this.fleeBombPos = null;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  getExplosionTiles(grid, bx, by, powerupType, power) {
    if (powerupType === 1) {
      return computeFlamethrowerExplosion(grid, bx, by, this.cols, this.rows);
    } else if (powerupType === 2) {
      return computeRaygunExplosion(grid, bx, by, this.cols, this.rows);
    }
    return computeExplosion(grid, bx, by, power, this.cols, this.rows);
  }

  update(dt, npc, grid, bombs, alivePlayers, now) {
    this.elapsed += dt;
    if (this.elapsed < this.config.tickRate) return null;
    this.elapsed = Math.min(this.elapsed - this.config.tickRate, this.config.tickRate * 2);

    if (!npc.alive) return null;

    const dangerMap = this.buildDangerMap(grid, bombs);

    // Priority 1: Survive — ALWAYS runs first, never skipped by mistakes
    const fleeAction = this.prioritySurvive(npc, grid, bombs, dangerMap);
    if (fleeAction) {
      this.lastDir = fleeAction.dir;
      this.commitTicks = 0; // Don't commit during flee, re-evaluate each tick
      this.fleeBombPos = null;
      return fleeAction;
    }

    // Post-bomb flee: keep moving away from our own bomb until safe distance
    if (this.fleeBombPos) {
      const distToBomb = manhattanDist(npc.x, npc.y, this.fleeBombPos.x, this.fleeBombPos.y);
      if (distToBomb <= 2) {
        const step = this.bfs(grid, npc.x, npc.y, bombs, (x, y) => {
          return dangerMap[y][x] === null && manhattanDist(x, y, this.fleeBombPos.x, this.fleeBombPos.y) > 2;
        });
        if (step) {
          this.lastDir = step.dir;
          return { type: "move", dir: step.dir };
        }
      }
      this.fleeBombPos = null;
    }

    // Direction commitment: reduce oscillation by sticking with a direction
    if (this.commitTicks > 0 && this.lastDir) {
      this.commitTicks--;
      const d = DIRS.find(d => d.name === this.lastDir);
      if (d) {
        const nx = npc.x + d.dx;
        const ny = npc.y + d.dy;
        const bombSet = buildBombSet(bombs);
        if (this.inBounds(nx, ny) && isPassable(grid[ny][nx])
            && !bombSet.has(`${nx},${ny}`) && dangerMap[ny][nx] === null) {
          return { type: "move", dir: this.lastDir };
        }
      }
      // Can't continue committed direction, fall through to new decision
      this.commitTicks = 0;
    }

    // Mistake roll (only for non-survival actions)
    if (Math.random() < this.config.mistakeRate) {
      const move = this.randomMove(npc, grid, bombs);
      if (move) this.lastDir = move.dir;
      return move;
    }

    // Priority 2: Attack
    if (this.config.useBfsForAttack) {
      const attackAction = this.priorityAttack(npc, grid, bombs, alivePlayers, dangerMap, now);
      if (attackAction) return attackAction;
    } else {
      const easyBomb = this.easyBombLogic(npc, alivePlayers, now);
      if (easyBomb) return easyBomb;
    }

    // Priority 2.5: Seek Powerups
    if (this.config.seekPowerups) {
      const seekAction = this.prioritySeekPowerup(npc, grid, bombs, dangerMap);
      if (seekAction) return seekAction;
    }

    // Priority 3: Chase
    if (this.config.chaseEnabled) {
      const chaseAction = this.priorityChase(npc, grid, bombs, alivePlayers, dangerMap);
      if (chaseAction) return chaseAction;
    }

    // Priority 4: Clear
    const clearAction = this.priorityClear(npc, grid, bombs, alivePlayers, dangerMap, now);
    if (clearAction) return clearAction;

    const move = this.randomMove(npc, grid, bombs);
    if (move) this.lastDir = move.dir;
    return move;
  }

  // --- Danger Map ---

  buildDangerMap(grid, bombs) {
    const dangerMap = [];
    for (let y = 0; y < this.rows; y++) {
      dangerMap[y] = new Array(this.cols).fill(null);
    }

    const bombList = [];
    bombs.forEach((bomb) => {
      bombList.push({ x: bomb.x, y: bomb.y, explodeAt: bomb.explodeAt, power: DEFAULT_POWER });
    });

    if (this.config.chainAwareness) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const bombA of bombList) {
          const blastA = computeExplosion(grid, bombA.x, bombA.y, bombA.power, this.cols, this.rows).tiles;
          for (const bombB of bombList) {
            if (bombA === bombB) continue;
            for (const t of blastA) {
              if (t.x === bombB.x && t.y === bombB.y) {
                const earlierTime = Math.min(bombA.explodeAt, bombB.explodeAt);
                if (earlierTime < bombB.explodeAt) {
                  bombB.explodeAt = earlierTime;
                  changed = true;
                }
                break;
              }
            }
          }
        }
      }
    }

    for (const bomb of bombList) {
      const { tiles } = computeExplosion(grid, bomb.x, bomb.y, bomb.power, this.cols, this.rows);
      for (const t of tiles) {
        if (dangerMap[t.y][t.x] === null || dangerMap[t.y][t.x] > bomb.explodeAt) {
          dangerMap[t.y][t.x] = bomb.explodeAt;
        }
      }
    }

    return dangerMap;
  }

  // --- BFS ---

  bfs(grid, startX, startY, bombs, goalFn) {
    const bombSet = buildBombSet(bombs);
    const visited = new Set();
    visited.add(`${startX},${startY}`);

    const queue = [{ x: startX, y: startY, firstStep: null }];

    while (queue.length > 0) {
      const cur = queue.shift();

      if (cur.firstStep !== null && goalFn(cur.x, cur.y)) {
        return cur.firstStep;
      }

      for (const d of DIRS) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        const key = `${nx},${ny}`;

        if (!this.inBounds(nx, ny)) continue;
        if (visited.has(key)) continue;
        if (!isPassable(grid[ny][nx])) continue;
        if (bombSet.has(key)) continue;

        visited.add(key);
        queue.push({
          x: nx,
          y: ny,
          firstStep: cur.firstStep || { x: nx, y: ny, dir: d.name },
        });
      }
    }

    return null;
  }

  bfsFlood(grid, startX, startY, bombs, excludeBombAt) {
    const bombSet = buildBombSet(bombs);
    const visited = new Map();
    visited.set(`${startX},${startY}`, 0);

    const queue = [{ x: startX, y: startY, dist: 0 }];

    while (queue.length > 0) {
      const cur = queue.shift();

      for (const d of DIRS) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        const key = `${nx},${ny}`;

        if (!this.inBounds(nx, ny)) continue;
        if (visited.has(key)) continue;
        if (!isPassable(grid[ny][nx])) continue;
        if (excludeBombAt && nx === excludeBombAt.x && ny === excludeBombAt.y) continue;
        if (bombSet.has(key) && !(excludeBombAt && nx === excludeBombAt.x && ny === excludeBombAt.y)) continue;

        visited.set(key, cur.dist + 1);
        queue.push({ x: nx, y: ny, dist: cur.dist + 1 });
      }
    }

    return visited;
  }

  // --- Escape validation ---

  canEscapeAfterBomb(npc, grid, bombs, bx, by) {
    const blastTiles = this.getExplosionTiles(grid, bx, by, npc.powerupType || 0, npc.power).tiles;
    const blastSet = new Set();
    for (const t of blastTiles) {
      blastSet.add(`${t.x},${t.y}`);
    }

    const reachable = this.bfsFlood(grid, npc.x, npc.y, bombs, { x: bx, y: by });

    for (const [key, dist] of reachable) {
      if (!blastSet.has(key)) {
        const timeToReach = (dist + 1) * this.config.tickRate;
        if (timeToReach < BOMB_FUSE) {
          return true;
        }
      }
    }

    return false;
  }

  // --- Trap scoring (hard only) ---

  scoreTrapPlacement(grid, bombs, bx, by, npc, alivePlayers) {
    const blastTiles = this.getExplosionTiles(grid, bx, by, npc.powerupType || 0, npc.power).tiles;
    const blastSet = new Set();
    for (const t of blastTiles) {
      blastSet.add(`${t.x},${t.y}`);
    }

    let score = 0;

    for (const player of alivePlayers) {
      const reachable = this.bfsFlood(grid, player.x, player.y, bombs, null);

      let safeTilesReachable = 0;
      for (const [key, dist] of reachable) {
        if (!blastSet.has(key)) {
          if (dist * 120 < BOMB_FUSE) {
            safeTilesReachable++;
          }
        }
      }

      if (safeTilesReachable === 0) score += 100;
      else if (safeTilesReachable <= 2) score += 50;
      else if (safeTilesReachable <= 5) score += 20;

      if (blastSet.has(`${player.x},${player.y}`)) score += 30;
    }

    return score;
  }

  // --- Priority 1: Survive ---

  prioritySurvive(npc, grid, bombs, dangerMap) {
    const myDanger = dangerMap[npc.y][npc.x];

    if (this.config.dangerAwareness === "adjacent") {
      if (myDanger === null) {
        let nearbyDanger = false;
        for (const d of DIRS) {
          const nx = npc.x + d.dx;
          const ny = npc.y + d.dy;
          if (this.inBounds(nx, ny) && dangerMap[ny][nx] !== null) {
            nearbyDanger = true;
            break;
          }
        }
        if (!nearbyDanger) return null;
      }
    } else {
      if (myDanger === null) return null;
    }

    const step = this.bfs(grid, npc.x, npc.y, bombs, (x, y) => dangerMap[y][x] === null);
    if (step) return { type: "move", dir: step.dir };
    return null;
  }

  // --- Weapon fire (instant) ---

  tryWeaponFire(npc, grid, alivePlayers) {
    if (!npc.powerupType || npc.powerupType === 0 || npc.powerupUses <= 0) return null;

    const directions = ["up", "down", "left", "right"];
    for (const dir of directions) {
      let result;
      if (npc.powerupType === 1) {
        result = computeFlamethrowerShot(grid, npc.x, npc.y, dir, this.cols, this.rows);
      } else if (npc.powerupType === 2) {
        result = computeRaygunShot(grid, npc.x, npc.y, dir, this.cols, this.rows);
      }
      if (!result) continue;

      for (const player of alivePlayers) {
        for (const t of result.tiles) {
          if (t.x === player.x && t.y === player.y) {
            return { type: "fire", dir };
          }
        }
      }
    }

    return null;
  }

  // --- Priority 2: Attack ---

  priorityAttack(npc, grid, bombs, alivePlayers, dangerMap, now) {
    // Try weapon fire first (instant, no cooldown)
    const fireAction = this.tryWeaponFire(npc, grid, alivePlayers);
    if (fireAction) return fireAction;

    if (now - this.lastBombTime < this.config.bombCooldown) return null;
    if (npc.bombsAvailable <= 0) return null;

    const blastTiles = this.getExplosionTiles(grid, npc.x, npc.y, npc.powerupType || 0, npc.power).tiles;
    let hitsPlayer = false;
    for (const player of alivePlayers) {
      for (const t of blastTiles) {
        if (t.x === player.x && t.y === player.y) {
          hitsPlayer = true;
          break;
        }
      }
      if (hitsPlayer) break;
    }

    if (!hitsPlayer) return null;

    if (this.config.escapeCheck) {
      if (!this.canEscapeAfterBomb(npc, grid, bombs, npc.x, npc.y)) return null;
    }

    if (this.config.trapLogic) {
      const score = this.scoreTrapPlacement(grid, bombs, npc.x, npc.y, npc, alivePlayers);
      if (score < 10) return null;
    }

    this.lastBombTime = now;
    this.fleeBombPos = { x: npc.x, y: npc.y };
    this.commitTicks = 0;
    return { type: "bomb" };
  }

  // --- Easy bomb logic ---

  easyBombLogic(npc, alivePlayers, now) {
    if (now - this.lastBombTime < this.config.bombCooldown) return null;
    if (npc.bombsAvailable <= 0) return null;

    for (const player of alivePlayers) {
      const d = manhattanDist(npc.x, npc.y, player.x, player.y);
      if (d <= this.config.nearPlayerDist) {
        if (Math.random() < this.config.bombChanceNearPlayer) {
          this.lastBombTime = now;
          this.fleeBombPos = { x: npc.x, y: npc.y };
          return { type: "bomb" };
        }
      }
    }

    return null;
  }

  // --- Priority 2.5: Seek Powerups ---

  prioritySeekPowerup(npc, grid, bombs, dangerMap) {
    const step = this.bfs(grid, npc.x, npc.y, bombs, (x, y) => {
      const tile = grid[y][x];
      return tile >= 3 && tile <= 5;
    });

    if (step && dangerMap[step.y][step.x] === null) {
      this.lastDir = step.dir;
      this.commitTicks = 2;
      return { type: "move", dir: step.dir };
    }
    return null;
  }

  // --- Priority 3: Chase ---

  priorityChase(npc, grid, bombs, alivePlayers, dangerMap) {
    let nearestPlayer = null;
    let nearestDist = Infinity;
    for (const player of alivePlayers) {
      const d = manhattanDist(npc.x, npc.y, player.x, player.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestPlayer = player;
      }
    }

    if (!nearestPlayer) return null;
    if (nearestDist > this.config.chaseRange) return null;

    const step = this.bfs(grid, npc.x, npc.y, bombs, (x, y) => x === nearestPlayer.x && y === nearestPlayer.y);

    if (step && dangerMap[step.y][step.x] === null) {
      this.lastDir = step.dir;
      this.commitTicks = 2;
      return { type: "move", dir: step.dir };
    }

    return null;
  }

  // --- Priority 4: Clear blocks ---

  priorityClear(npc, grid, bombs, alivePlayers, dangerMap, now) {
    let nearestPlayer = null;
    let nearestDist = Infinity;
    for (const player of alivePlayers) {
      const d = manhattanDist(npc.x, npc.y, player.x, player.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestPlayer = player;
      }
    }

    // Check adjacent tiles for destructible blocks
    const hasAdjacentBlock = DIRS.some(d => {
      const nx = npc.x + d.dx;
      const ny = npc.y + d.dy;
      return this.inBounds(nx, ny) && grid[ny][nx] === BLOCK;
    });

    if (hasAdjacentBlock && npc.bombsAvailable > 0 && (now - this.lastBombTime >= this.config.bombCooldown)) {
      if (!this.config.escapeCheck || this.canEscapeAfterBomb(npc, grid, bombs, npc.x, npc.y)) {
        this.lastBombTime = now;
        this.fleeBombPos = { x: npc.x, y: npc.y };
        this.commitTicks = 0;
        return { type: "bomb" };
      }
    }

    // BFS to a tile adjacent to a block
    const step = this.bfs(grid, npc.x, npc.y, bombs, (x, y) => {
      for (const d of DIRS) {
        const bx = x + d.dx;
        const by = y + d.dy;
        if (this.inBounds(bx, by) && grid[by][bx] === BLOCK) return true;
      }
      return false;
    });

    if (step && dangerMap[step.y][step.x] === null) {
      this.lastDir = step.dir;
      this.commitTicks = 2;
      return { type: "move", dir: step.dir };
    }

    return null;
  }

  // --- Random move ---

  randomMove(npc, grid, bombs) {
    const bombSet = buildBombSet(bombs);
    const dirs = shuffle([...DIRS]);

    // Determine the reverse of last direction to deprioritize it
    const reverseMap = { up: "down", down: "up", left: "right", right: "left" };
    const reverseDir = this.lastDir ? reverseMap[this.lastDir] : null;

    let fallback = null;
    for (const d of dirs) {
      const nx = npc.x + d.dx;
      const ny = npc.y + d.dy;
      if (!this.inBounds(nx, ny)) continue;
      if (!isPassable(grid[ny][nx])) continue;
      if (bombSet.has(`${nx},${ny}`)) continue;
      // Prefer any direction over reversing
      if (d.name === reverseDir) {
        fallback = { type: "move", dir: d.name };
        continue;
      }
      return { type: "move", dir: d.name };
    }

    return fallback;
  }
}
