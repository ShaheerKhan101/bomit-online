// rules.js — bomb and explosion helpers

import { WALL, BLOCK } from './map.js';

export const BOMB_FUSE = 2000;    // ms
export const EXPLOSION_DURATION = 300; // ms
export const DEFAULT_POWER = 2;   // blast radius in tiles
export const MAX_BOMBS = 1;

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

// Perpendicular directions for flamethrower
const PERP = [
  { dx: 0, dy: -1, perpDx: 1, perpDy: 0 },
  { dx: 0, dy: 1, perpDx: 1, perpDy: 0 },
  { dx: -1, dy: 0, perpDx: 0, perpDy: 1 },
  { dx: 1, dy: 0, perpDx: 0, perpDy: 1 },
];

function dedup(arr) {
  const seen = new Set();
  return arr.filter(({ x, y }) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Standard bomb explosion.
 * Extends in 4 cardinal directions up to `power` tiles.
 * Stops at WALL (not included). Stops at BLOCK (included, destroyed).
 */
export function computeExplosion(grid, bx, by, power, cols, rows) {
  const tiles = [{ x: bx, y: by }];
  const destroyed = [];

  for (const { dx, dy } of DIRS) {
    for (let i = 1; i <= power; i++) {
      const nx = bx + dx * i;
      const ny = by + dy * i;

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;

      const tile = grid[ny][nx];
      if (tile === WALL) break;

      tiles.push({ x: nx, y: ny });

      if (tile === BLOCK) {
        destroyed.push({ x: nx, y: ny });
        break;
      }
    }
  }

  return { tiles, destroyed };
}

/**
 * Flamethrower explosion.
 * Power=5, plus 1-tile perpendicular expansion at each blast tile.
 */
export function computeFlamethrowerExplosion(grid, bx, by, cols, rows) {
  const base = computeExplosion(grid, bx, by, 5, cols, rows);
  const extraTiles = [];
  const extraDestroyed = [];

  for (const { dx, dy, perpDx, perpDy } of PERP) {
    for (let i = 1; i <= 5; i++) {
      const tx = bx + dx * i;
      const ty = by + dy * i;
      if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) break;
      if (grid[ty][tx] === WALL) break;

      for (const sign of [-1, 1]) {
        const px = tx + perpDx * sign;
        const py = ty + perpDy * sign;
        if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
        if (grid[py][px] === WALL) continue;
        extraTiles.push({ x: px, y: py });
        if (grid[py][px] === BLOCK) {
          extraDestroyed.push({ x: px, y: py });
        }
      }

      if (grid[ty][tx] === BLOCK) break;
    }
  }

  return {
    tiles: dedup([...base.tiles, ...extraTiles]),
    destroyed: dedup([...base.destroyed, ...extraDestroyed]),
  };
}

/**
 * Raygun explosion.
 * Goes to edge of map in all 4 directions. Passes through blocks
 * (blocks are destroyed but explosion continues). Only walls stop it.
 */
export function computeRaygunExplosion(grid, bx, by, cols, rows) {
  const tiles = [{ x: bx, y: by }];
  const destroyed = [];
  const maxPower = Math.max(cols, rows);

  for (const { dx, dy } of DIRS) {
    for (let i = 1; i <= maxPower; i++) {
      const nx = bx + dx * i;
      const ny = by + dy * i;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;

      const tile = grid[ny][nx];
      if (tile === WALL) break;

      tiles.push({ x: nx, y: ny });
      if (tile === BLOCK) {
        destroyed.push({ x: nx, y: ny });
        // Does NOT break — passes through blocks
      }
    }
  }

  return { tiles, destroyed };
}

// --- Direction map for single-direction weapon shots ---

export const DIR_MAP = {
  up:    { dx: 0, dy: -1 },
  down:  { dx: 0, dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Raygun shot — single direction, passes through blocks, stops at walls.
 */
export function computeRaygunShot(grid, x, y, dir, cols, rows) {
  const { dx, dy } = DIR_MAP[dir] || DIR_MAP.down;
  const tiles = [];
  const destroyed = [];
  const maxRange = Math.max(cols, rows);

  for (let i = 1; i <= maxRange; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;

    const tile = grid[ny][nx];
    if (tile === WALL) break;

    tiles.push({ x: nx, y: ny });
    if (tile === BLOCK) {
      destroyed.push({ x: nx, y: ny });
    }
  }

  return { tiles, destroyed };
}

/**
 * Flamethrower shot — single direction, power=5, 1-tile perpendicular spread.
 */
export function computeFlamethrowerShot(grid, x, y, dir, cols, rows) {
  const { dx, dy } = DIR_MAP[dir] || DIR_MAP.down;
  const perpDx = dx === 0 ? 1 : 0;
  const perpDy = dy === 0 ? 1 : 0;
  const tiles = [];
  const destroyed = [];

  for (let i = 1; i <= 5; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;

    const tile = grid[ny][nx];
    if (tile === WALL) break;

    tiles.push({ x: nx, y: ny });

    for (const sign of [-1, 1]) {
      const px = nx + perpDx * sign;
      const py = ny + perpDy * sign;
      if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
      if (grid[py][px] === WALL) continue;
      tiles.push({ x: px, y: py });
      if (grid[py][px] === BLOCK) {
        destroyed.push({ x: px, y: py });
      }
    }

    if (tile === BLOCK) {
      destroyed.push({ x: nx, y: ny });
      break;
    }
  }

  return { tiles: dedup(tiles), destroyed: dedup(destroyed) };
}
