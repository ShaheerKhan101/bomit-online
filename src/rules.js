// rules.js — bomb and explosion helpers

import { COLS, ROWS, WALL, BLOCK, EMPTY } from './map.js';

export const BOMB_FUSE = 2000;    // ms
export const EXPLOSION_DURATION = 300; // ms
export const DEFAULT_POWER = 2;   // blast radius in tiles
export const MAX_BOMBS = 1;

/**
 * Compute the set of tiles affected by an explosion at (bx, by).
 * Returns an array of {x, y} objects.
 * Also returns a list of blocks to destroy.
 *
 * Rules:
 * - Center tile always included
 * - Extends in 4 cardinal directions up to `power` tiles
 * - Stops at WALL (wall tile NOT included)
 * - Stops at BLOCK (block tile IS included, then stops)
 */
export function computeExplosion(grid, bx, by, power = DEFAULT_POWER) {
  const tiles = [{ x: bx, y: by }];
  const destroyed = [];

  const dirs = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 },  // right
  ];

  for (const { dx, dy } of dirs) {
    for (let i = 1; i <= power; i++) {
      const nx = bx + dx * i;
      const ny = by + dy * i;

      // Out of bounds
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) break;

      const tile = grid[ny][nx];

      if (tile === WALL) {
        // Stop, don't include wall
        break;
      }

      tiles.push({ x: nx, y: ny });

      if (tile === BLOCK) {
        // Include block tile in explosion, mark for destruction, stop
        destroyed.push({ x: nx, y: ny });
        break;
      }
    }
  }

  return { tiles, destroyed };
}

