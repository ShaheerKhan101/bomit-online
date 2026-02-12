// map.js — grid constants, presets, and map generation

export const TILE = 32;

// Default dimensions (used as fallback)
export const COLS = 13;
export const ROWS = 11;

// Grid size presets
export const GRID_PRESETS = {
  small:  { cols: 11, rows: 9 },
  medium: { cols: 13, rows: 11 },
  large:  { cols: 17, rows: 13 },
  xl:     { cols: 21, rows: 15 },
};

// Tile types
export const EMPTY = 0;
export const WALL = 1;
export const BLOCK = 2;
export const POWERUP_FLAMETHROWER = 3;
export const POWERUP_RAYGUN = 4;
export const POWERUP_SHIELD = 5;

// Colors for rendering
export const TILE_COLORS = {
  [EMPTY]: 0x404040,
  [WALL]:  0x666666,
  [BLOCK]: 0xcc8844,
  [POWERUP_FLAMETHROWER]: 0xff6600,
  [POWERUP_RAYGUN]: 0x00ccff,
  [POWERUP_SHIELD]: 0x44ff44,
};

/**
 * Compute spawn positions for a given grid size.
 * Players get corners (top-left, bottom-right).
 * NPCs get remaining corners then mid-edges.
 */
export function computeSpawns(cols, rows) {
  return {
    players: [
      { x: 1, y: 1 },
      { x: cols - 2, y: rows - 2 },
    ],
    npcs: [
      { x: cols - 2, y: 1 },
      { x: 1, y: rows - 2 },
      { x: Math.floor(cols / 2), y: 1 },
      { x: Math.floor(cols / 2), y: rows - 2 },
    ],
  };
}

/**
 * Clear tiles around a spawn point so entities have room to move.
 */
function clearSpawnArea(grid, sx, sy, cols, rows) {
  grid[sy][sx] = EMPTY;
  const deltas = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  for (const { dx, dy } of deltas) {
    const nx = sx + dx;
    const ny = sy + dy;
    if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1) {
      grid[ny][nx] = EMPTY;
    }
  }
}

/**
 * Generate a Bomberman-style map of arbitrary size.
 * Returns { grid, hiddenPowerups }.
 * - grid: 2D array of tile types
 * - hiddenPowerups: 2D array of powerup types hidden under blocks (0 = none)
 */
export function generateMap(cols = COLS, rows = ROWS) {
  const grid = [];
  const hiddenPowerups = [];

  for (let y = 0; y < rows; y++) {
    const row = [];
    const pRow = [];
    for (let x = 0; x < cols; x++) {
      if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) {
        row.push(WALL);
      } else if (x % 2 === 0 && y % 2 === 0) {
        row.push(WALL);
      } else {
        row.push(Math.random() < 0.6 ? BLOCK : EMPTY);
      }
      pRow.push(0);
    }
    grid.push(row);
    hiddenPowerups.push(pRow);
  }

  // Clear all possible spawn areas (2 players + 4 NPCs)
  const spawns = computeSpawns(cols, rows);
  for (const s of [...spawns.players, ...spawns.npcs]) {
    clearSpawnArea(grid, s.x, s.y, cols, rows);
  }

  // Hide powerups under ~15% of blocks
  const powerupTypes = [POWERUP_FLAMETHROWER, POWERUP_RAYGUN, POWERUP_SHIELD];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] === BLOCK && Math.random() < 0.15) {
        hiddenPowerups[y][x] = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
      }
    }
  }

  return { grid, hiddenPowerups };
}
