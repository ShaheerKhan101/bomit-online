// map.js — grid constants and map generation

export const COLS = 13;
export const ROWS = 11;
export const TILE = 32;

// Tile types
export const EMPTY = 0;
export const WALL = 1;
export const BLOCK = 2;

// Colors for rendering
export const TILE_COLORS = {
  [EMPTY]: 0x404040,
  [WALL]:  0x666666,
  [BLOCK]: 0xcc8844,
};

/**
 * Generate a 13x11 Bomberman-style map.
 * - Border is WALL
 * - Internal walls at every-other position (even col & even row)
 * - Random BLOCKs elsewhere (~60% fill)
 * - Spawn area near (1,1) kept clear: (1,1), (2,1), (1,2)
 */
export function generateMap() {
  const grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) {
        // Border wall
        row.push(WALL);
      } else if (x % 2 === 0 && y % 2 === 0) {
        // Classic internal wall pattern
        row.push(WALL);
      } else {
        // Random block or empty
        row.push(Math.random() < 0.6 ? BLOCK : EMPTY);
      }
    }
    grid.push(row);
  }

  // Clear spawn area around (1,1) — P1
  grid[1][1] = EMPTY;
  grid[1][2] = EMPTY;
  grid[2][1] = EMPTY;

  // Clear spawn area around (11,9) — P2
  grid[9][11] = EMPTY;
  grid[9][10] = EMPTY;
  grid[8][11] = EMPTY;

  return grid;
}

