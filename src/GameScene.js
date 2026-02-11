// GameScene.js — client renderer (reads server state, sends inputs)

import Phaser from "phaser";
import { COLS, ROWS, TILE, TILE_COLORS } from "./map.js";
import { EXPLOSION_DURATION } from "./rules.js";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.room = data.room;
  }

  create() {
    // Graphics layers
    this.tileGraphics = this.add.graphics();
    this.bombGraphics = this.add.graphics();
    this.explosionGraphics = this.add.graphics();
    this.playerGraphics = this.add.graphics();

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Movement cooldown (client-side rate limit to avoid spamming server)
    this.moveDelay = 120;
    this.lastMoveTime = 0;

    // Explosion visuals (transient, from server broadcast)
    this.explosions = [];

    // Status text (center of screen)
    this.statusText = this.add
      .text(
        (COLS * TILE) / 2,
        (ROWS * TILE) / 2,
        "",
        { fontSize: "20px", fill: "#ff4444", fontStyle: "bold", align: "center" }
      )
      .setOrigin(0.5)
      .setDepth(10);

    // Debug text
    this.debugText = this.add.text(4, ROWS * TILE + 4, "", {
      fontSize: "12px",
      fill: "#ffffff",
    });

    // Listen for explosion broadcasts from server
    this.room.onMessage("explosion", (message) => {
      this.explosions.push({
        tiles: message.tiles,
        createdAt: this.time.now,
      });
    });

    // Handle room errors / leave
    this.room.onError((code, message) => {
      console.error("Room error:", code, message);
      this.statusText.setText(`Error: ${message}`);
    });

    this.room.onLeave((code) => {
      console.log("Left room:", code);
      if (code > 1000) {
        this.statusText.setText("Disconnected from server");
      }
    });
  }

  update(time) {
    if (!this.room || !this.room.state) return;

    const state = this.room.state;

    // Update status text based on game state
    this.updateStatusText(state);

    // Handle input only during play
    if (state.status === "playing") {
      this.handleInput(time);
    }

    // Expire old explosions
    this.explosions = this.explosions.filter(
      (e) => this.time.now - e.createdAt < EXPLOSION_DURATION
    );

    // Render everything from server state
    this.drawTiles(state);
    this.drawBombs(state);
    this.drawExplosions();
    this.drawPlayers(state);
    this.updateDebug(state);
  }

  // --- STATUS ---
  updateStatusText(state) {
    if (state.status === "lobby") {
      this.statusText.setText("Waiting for opponent...");
      return;
    }

    if (state.status === "ended") {
      const result = state.result;
      if (result === "draw") {
        this.statusText.setText("Draw!");
      } else if (result === "disconnect") {
        this.statusText.setText("Opponent disconnected");
      } else if (state.players) {
        const myPlayer = state.players.get(this.room.sessionId);
        if (myPlayer) {
          const myIndex = myPlayer.playerIndex;
          const iWon =
            (result === "p1" && myIndex === 0) ||
            (result === "p2" && myIndex === 1);
          this.statusText.setText(iWon ? "You Win!" : "You Lose!");
        }
      }
      return;
    }

    // playing — clear status
    this.statusText.setText("");
  }

  // --- INPUT ---
  handleInput(time) {
    // Movement (rate-limited)
    if (time - this.lastMoveTime >= this.moveDelay) {
      let dir = null;
      if (this.cursors.left.isDown || this.wasd.left.isDown) dir = "left";
      else if (this.cursors.right.isDown || this.wasd.right.isDown) dir = "right";
      else if (this.cursors.up.isDown || this.wasd.up.isDown) dir = "up";
      else if (this.cursors.down.isDown || this.wasd.down.isDown) dir = "down";

      if (dir) {
        this.room.send("move", { dir });
        this.lastMoveTime = time;
      }
    }

    // Bomb
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.room.send("bomb", {});
    }
  }

  // --- DRAWING ---
  drawTiles(state) {
    this.tileGraphics.clear();
    const map = state.map;
    if (!map || map.length === 0) return;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = map[y * COLS + x];
        const color = TILE_COLORS[tile] || 0x404040;
        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
      }
    }
  }

  drawPlayers(state) {
    this.playerGraphics.clear();
    if (!state.players) return;
    state.players.forEach((player, sessionId) => {
      if (!player.alive) return;
      const isMe = sessionId === this.room.sessionId;
      const color = isMe ? 0x44bbff : 0xff4444;
      this.playerGraphics.fillStyle(color, 1);
      this.playerGraphics.fillRect(
        player.x * TILE + 4,
        player.y * TILE + 4,
        TILE - 8,
        TILE - 8
      );
    });
  }

  drawBombs(state) {
    this.bombGraphics.clear();
    if (!state.bombs) return;
    state.bombs.forEach((bomb) => {
      this.bombGraphics.fillStyle(0x111111, 1);
      this.bombGraphics.fillCircle(
        bomb.x * TILE + TILE / 2,
        bomb.y * TILE + TILE / 2,
        TILE / 3
      );
    });
  }

  drawExplosions() {
    this.explosionGraphics.clear();
    for (const explosion of this.explosions) {
      for (const t of explosion.tiles) {
        this.explosionGraphics.fillStyle(0xff4400, 0.7);
        this.explosionGraphics.fillRect(
          t.x * TILE + 2,
          t.y * TILE + 2,
          TILE - 4,
          TILE - 4
        );
      }
    }
  }

  updateDebug(state) {
    if (!state.players) { this.debugText.setText("Syncing..."); return; }
    const myPlayer = state.players.get(this.room.sessionId);
    if (!myPlayer) {
      this.debugText.setText("Waiting...");
      return;
    }
    this.debugText.setText(
      `Pos: (${myPlayer.x}, ${myPlayer.y})  Bombs: ${myPlayer.bombsAvailable}  Alive: ${myPlayer.alive}  Status: ${state.status}`
    );
  }
}
