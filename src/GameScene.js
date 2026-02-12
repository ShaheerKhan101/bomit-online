// GameScene.js — client renderer with pixel art sprites

import Phaser from "phaser";
import { TILE, TILE_COLORS, POWERUP_FLAMETHROWER, POWERUP_RAYGUN, POWERUP_SHIELD } from "./map.js";
import { EXPLOSION_DURATION } from "./rules.js";
import { generateTextures } from "./sprites.js";
import { SoundManager } from "./audio.js";

const NPC_THEMES = ["green", "purple", "orange", "yellow"];
const THEME_COLORS = { blue: 0x2266cc, red: 0xcc2222, green: 0x22aa44, purple: 0x8833cc, orange: 0xcc8822, yellow: 0xcccc22 };

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.room = data.room;
  }

  getDimensions() {
    if (this.room && this.room.state) {
      return {
        cols: this.room.state.cols || 13,
        rows: this.room.state.rows || 11,
      };
    }
    return { cols: 13, rows: 11 };
  }

  create() {
    generateTextures(this);

    // Sound manager
    this.soundMgr = new SoundManager();

    // Graphics layers
    this.tileGraphics = this.add.graphics();
    this.explosionGraphics = this.add.graphics();
    this.weaponGraphics = this.add.graphics().setDepth(8);

    // Sprite tracking
    this.playerSprites = {};
    this.npcSprites = {};
    this.bombSprites = {};
    this.shieldIndicators = {};

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.moveDelay = 120;
    this.lastMoveTime = 0;

    // Explosion and weapon visuals
    this.explosions = [];
    this.weaponEffects = [];

    // Status text
    this.statusText = this.add
      .text(0, 0, "", {
        fontSize: "20px",
        fill: "#ff4444",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(10);

    // Debug + powerup HUD
    this.debugText = this.add.text(4, 0, "", { fontSize: "12px", fill: "#ffffff" });
    this.powerupText = this.add.text(4, 0, "", { fontSize: "12px", fill: "#ffcc00" });

    // Scoreboard text (top-right)
    this.scoreboardText = this.add.text(0, 4, "", { fontSize: "11px", fill: "#ffffff", align: "right" }).setDepth(10);

    // Restart vote text
    this.voteText = this.add.text(0, 0, "", { fontSize: "12px", fill: "#ffcc00", align: "center" }).setOrigin(0.5).setDepth(10);

    // Sound toggle icon
    this.soundToggle = this.add.text(0, 4, this.soundMgr.isEnabled() ? "SND" : "MUTE", {
      fontSize: "11px",
      fill: this.soundMgr.isEnabled() ? "#44ff44" : "#ff4444",
      fontStyle: "bold",
      backgroundColor: "#222222",
      padding: { x: 4, y: 2 },
    }).setDepth(20).setInteractive({ useHandCursor: true });

    this.soundToggle.on("pointerdown", () => {
      const nowEnabled = this.soundMgr.toggle();
      this.soundToggle.setText(nowEnabled ? "SND" : "MUTE");
      this.soundToggle.setColor(nowEnabled ? "#44ff44" : "#ff4444");
    });

    this.textPositioned = false;

    // State change tracking for sounds
    this._prevAlive = true;
    this._prevShield = false;
    this._prevPowerup = 0;
    this._endSoundPlayed = false;

    // Listen for explosion broadcasts
    this.room.onMessage("explosion", (message) => {
      this.explosions.push({
        tiles: message.tiles,
        createdAt: this.time.now,
      });
      this.soundMgr.playExplosion();
    });

    // Listen for weapon fire broadcasts
    this.room.onMessage("weaponFire", (message) => {
      this.weaponEffects.push({
        tiles: message.tiles,
        weaponType: message.weaponType,
        dir: message.dir,
        createdAt: this.time.now,
      });
      if (message.weaponType === "raygun") {
        this.soundMgr.playRaygunFire();
      } else {
        this.soundMgr.playFlamethrowerFire();
      }
    });

    // Listen for shield absorb
    this.room.onMessage("shieldAbsorb", () => {
      this.soundMgr.playShieldAbsorb();
    });

    this.room.onMessage("restartVote", (message) => {
      if (message.current > 0 && message.needed > 0) {
        this.voteText.setText(`Restart: ${message.current}/${message.needed} [R]`);
      } else {
        this.voteText.setText("");
      }
    });

    this.room.onMessage("powerupDrop", () => {
      this.soundMgr.playPowerupPickup();
    });

    this.room.onMessage("shrink", () => {
      this.soundMgr.playExplosion();
    });

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

    // Resize canvas when state cols/rows arrive (for joiners)
    this._resized = false;
  }

  update(time) {
    if (!this.room || !this.room.state) return;

    const state = this.room.state;
    const { cols, rows } = this.getDimensions();

    // Resize canvas once we know the real dimensions
    if (!this._resized && cols > 0 && rows > 0) {
      const w = cols * TILE;
      const h = rows * TILE + 40;
      if (this.scale.width !== w || this.scale.height !== h) {
        this.scale.resize(w, h);
      }
      this._resized = true;
    }

    // Position text elements once we have dimensions
    if (!this.textPositioned && cols > 0 && rows > 0) {
      this.statusText.setPosition((cols * TILE) / 2, (rows * TILE) / 2);
      this.voteText.setPosition((cols * TILE) / 2, (rows * TILE) / 2 + 24);
      this.debugText.setPosition(4, rows * TILE + 4);
      this.powerupText.setPosition(4, rows * TILE + 20);
      this.scoreboardText.setPosition(cols * TILE - 4, 4);
      this.scoreboardText.setOrigin(1, 0);
      this.soundToggle.setPosition(cols * TILE - 4, rows * TILE + 4);
      this.soundToggle.setOrigin(1, 0);
      this.textPositioned = true;
    }

    this.updateStatusText(state);
    this.updateSoundTriggers(state);

    if (state.status === "playing") {
      this.handleInput(time);
    }

    this.explosions = this.explosions.filter(
      (e) => this.time.now - e.createdAt < EXPLOSION_DURATION
    );

    this.drawTiles(state, cols, rows);
    this.drawBombs(state);
    this.drawExplosions();
    this.drawWeaponEffects();
    this.drawPlayers(state, time);
    this.updateDebug(state);
    this.updateScoreboard(state);
  }

  // --- SOUND TRIGGERS ---
  updateSoundTriggers(state) {
    const myPlayer = state.players ? state.players.get(this.room.sessionId) : null;
    if (!myPlayer) return;

    // Death sound
    if (this._prevAlive === true && !myPlayer.alive) {
      this.soundMgr.playDeath();
    }

    // Powerup pickup sound
    if (this._prevPowerup === 0 && myPlayer.powerupType > 0) {
      this.soundMgr.playPowerupPickup();
    }
    // Shield pickup sound
    if (!this._prevShield && myPlayer.hasShield) {
      this.soundMgr.playPowerupPickup();
    }

    this._prevAlive = myPlayer.alive;
    this._prevShield = myPlayer.hasShield;
    this._prevPowerup = myPlayer.powerupType;
  }

  // --- STATUS ---
  updateStatusText(state) {
    if (state.status === "lobby") {
      this.statusText.setText("Waiting for opponent...");
      this._endSoundPlayed = false;
      return;
    }

    if (state.status === "ended") {
      const result = state.result;
      let iWon = false;

      if (result === "draw") {
        this.statusText.setText("Draw!");
      } else if (result === "disconnect") {
        this.statusText.setText("Opponent disconnected");
      } else if (result === "npc") {
        this.statusText.setText("Bot Wins!");
      } else if (state.players) {
        const myPlayer = state.players.get(this.room.sessionId);
        if (myPlayer) {
          const myIndex = myPlayer.playerIndex;
          iWon =
            (result === "p1" && myIndex === 0) ||
            (result === "p2" && myIndex === 1);
          this.statusText.setText(iWon ? "You Win!" : "You Lose!");
        }
      }

      // Play win/lose sound once
      if (!this._endSoundPlayed) {
        this._endSoundPlayed = true;
        if (result === "draw" || result === "disconnect") {
          this.soundMgr.playLose();
        } else {
          const myPlayer = state.players ? state.players.get(this.room.sessionId) : null;
          if (myPlayer) {
            const myIndex = myPlayer.playerIndex;
            const didWin =
              (result === "p1" && myIndex === 0) ||
              (result === "p2" && myIndex === 1);
            if (didWin) this.soundMgr.playWin();
            else this.soundMgr.playLose();
          }
        }
      }
      return;
    }

    this.statusText.setText("");
    this._endSoundPlayed = false;
  }

  // --- INPUT ---
  handleInput(time) {
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

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const myPlayer = this.room.state.players.get(this.room.sessionId);
      if (myPlayer && myPlayer.powerupType > 0 && myPlayer.powerupUses > 0) {
        this.room.send("fire", {});
      } else {
        this.room.send("bomb", {});
        this.soundMgr.playBombPlace();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.room.send("restart", {});
    }
  }

  // --- DRAWING ---
  drawTiles(state, cols, rows) {
    this.tileGraphics.clear();
    const map = state.map;
    if (!map || map.length === 0) return;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = map[y * cols + x];
        const color = TILE_COLORS[tile] || 0x404040;
        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);

        if (tile === POWERUP_FLAMETHROWER || tile === POWERUP_RAYGUN || tile === POWERUP_SHIELD) {
          let texKey = null;
          if (tile === POWERUP_FLAMETHROWER) texKey = "powerup_flame";
          else if (tile === POWERUP_RAYGUN) texKey = "powerup_ray";
          else if (tile === POWERUP_SHIELD) texKey = "powerup_shield";

          const key = `pu_${x}_${y}`;
          if (!this._puSprites) this._puSprites = {};
          if (!this._puSprites[key]) {
            this._puSprites[key] = this.add.image(x * TILE, y * TILE, texKey).setOrigin(0, 0).setDepth(1);
          } else {
            this._puSprites[key].setTexture(texKey).setPosition(x * TILE, y * TILE).setVisible(true);
          }
        }
      }
    }

    if (this._puSprites) {
      for (const [key, sprite] of Object.entries(this._puSprites)) {
        const parts = key.split("_");
        const px = parseInt(parts[1]);
        const py = parseInt(parts[2]);
        const tile = map[py * cols + px];
        if (tile < 3 || tile > 5) {
          sprite.setVisible(false);
        }
      }
    }
  }

  drawPlayers(state, time) {
    const seenPlayerIds = new Set();
    const seenNpcIds = new Set();
    const frame = Math.floor(time / 200) % 2;

    if (state.players) {
      state.players.forEach((player, sessionId) => {
        seenPlayerIds.add(sessionId);

        const isMe = sessionId === this.room.sessionId;
        const theme = isMe ? "blue" : "red";

        if (!player.alive) {
          if (this.playerSprites[sessionId]) {
            // Show ghost at spawn if respawning
            if (player.respawnAt > 0) {
              const texKey = `player_${theme}_down_0`;
              this.playerSprites[sessionId].setTexture(texKey);
              this.playerSprites[sessionId].setPosition(player.spawnX * TILE, player.spawnY * TILE);
              this.playerSprites[sessionId].setAlpha(0.25 + 0.1 * Math.sin(time / 200));
              this.playerSprites[sessionId].setVisible(true);
            } else {
              this.playerSprites[sessionId].setVisible(false);
            }
          }
          if (this.shieldIndicators[sessionId]) {
            this.shieldIndicators[sessionId].setVisible(false);
          }
          return;
        }

        const facing = player.facing || "down";
        const texKey = `player_${theme}_${facing}_${frame}`;

        if (!this.playerSprites[sessionId]) {
          this.playerSprites[sessionId] = this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(5);
        }

        const sprite = this.playerSprites[sessionId];
        sprite.setTexture(texKey);
        sprite.setPosition(player.x * TILE, player.y * TILE);
        sprite.setVisible(true);

        // Invincibility blink
        if (player.invincibleUntil > Date.now()) {
          sprite.setAlpha(Math.floor(time / 100) % 2 === 0 ? 1.0 : 0.3);
        } else {
          sprite.setAlpha(1.0);
        }

        if (player.hasShield) {
          if (!this.shieldIndicators[sessionId]) {
            this.shieldIndicators[sessionId] = this.add.graphics().setDepth(4);
          }
          const sg = this.shieldIndicators[sessionId];
          sg.clear();
          sg.lineStyle(2, 0x44ff44, 0.7);
          sg.strokeCircle(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2, TILE / 2 + 2);
          sg.setVisible(true);
        } else if (this.shieldIndicators[sessionId]) {
          this.shieldIndicators[sessionId].setVisible(false);
        }
      });
    }

    if (state.npcs) {
      state.npcs.forEach((npc, npcId) => {
        seenNpcIds.add(npcId);

        const theme = NPC_THEMES[npc.npcIndex % NPC_THEMES.length];

        if (!npc.alive) {
          if (this.npcSprites[npcId]) {
            if (npc.respawnAt > 0) {
              const texKey = `player_${theme}_down_0`;
              this.npcSprites[npcId].setTexture(texKey);
              this.npcSprites[npcId].setPosition(npc.spawnX * TILE, npc.spawnY * TILE);
              this.npcSprites[npcId].setAlpha(0.25 + 0.1 * Math.sin(time / 200));
              this.npcSprites[npcId].setVisible(true);
            } else {
              this.npcSprites[npcId].setVisible(false);
            }
          }
          if (this.shieldIndicators[npcId]) {
            this.shieldIndicators[npcId].setVisible(false);
          }
          return;
        }

        const facing = npc.facing || "down";
        const texKey = `player_${theme}_${facing}_${frame}`;

        if (!this.npcSprites[npcId]) {
          this.npcSprites[npcId] = this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(5);
        }

        const sprite = this.npcSprites[npcId];
        sprite.setTexture(texKey);
        sprite.setPosition(npc.x * TILE, npc.y * TILE);
        sprite.setVisible(true);

        if (npc.invincibleUntil > Date.now()) {
          sprite.setAlpha(Math.floor(time / 100) % 2 === 0 ? 1.0 : 0.3);
        } else {
          sprite.setAlpha(1.0);
        }

        if (npc.hasShield) {
          if (!this.shieldIndicators[npcId]) {
            this.shieldIndicators[npcId] = this.add.graphics().setDepth(4);
          }
          const sg = this.shieldIndicators[npcId];
          sg.clear();
          sg.lineStyle(2, 0x44ff44, 0.7);
          sg.strokeCircle(npc.x * TILE + TILE / 2, npc.y * TILE + TILE / 2, TILE / 2 + 2);
          sg.setVisible(true);
        } else if (this.shieldIndicators[npcId]) {
          this.shieldIndicators[npcId].setVisible(false);
        }
      });
    }

    for (const id of Object.keys(this.playerSprites)) {
      if (!seenPlayerIds.has(id)) {
        this.playerSprites[id].destroy();
        delete this.playerSprites[id];
      }
    }
    for (const id of Object.keys(this.npcSprites)) {
      if (!seenNpcIds.has(id)) {
        this.npcSprites[id].destroy();
        delete this.npcSprites[id];
      }
    }
  }

  drawBombs(state) {
    const seenBombIds = new Set();

    if (state.bombs) {
      state.bombs.forEach((bomb, bombId) => {
        seenBombIds.add(bombId);

        if (!this.bombSprites[bombId]) {
          this.bombSprites[bombId] = this.add.image(0, 0, "bomb").setOrigin(0, 0).setDepth(3);
        }

        const sprite = this.bombSprites[bombId];
        sprite.setPosition(bomb.x * TILE, bomb.y * TILE);
        sprite.setVisible(true);

        const pulse = 1.0 + 0.1 * Math.sin(this.time.now / 150);
        sprite.setScale(pulse);
      });
    }

    for (const id of Object.keys(this.bombSprites)) {
      if (!seenBombIds.has(id)) {
        this.bombSprites[id].destroy();
        delete this.bombSprites[id];
      }
    }
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
        this.explosionGraphics.fillStyle(0xffcc00, 0.4);
        this.explosionGraphics.fillRect(
          t.x * TILE + 6,
          t.y * TILE + 6,
          TILE - 12,
          TILE - 12
        );
      }
    }
  }

  drawWeaponEffects() {
    this.weaponGraphics.clear();

    const now = this.time.now;
    this.weaponEffects = this.weaponEffects.filter(e => {
      const duration = e.weaponType === "raygun" ? 200 : 300;
      return now - e.createdAt < duration;
    });

    for (const effect of this.weaponEffects) {
      const duration = effect.weaponType === "raygun" ? 200 : 300;
      const progress = (now - effect.createdAt) / duration;
      const alpha = 1.0 - progress;

      if (effect.weaponType === "raygun") {
        const isHoriz = effect.dir === "left" || effect.dir === "right";
        // Outer beam
        this.weaponGraphics.fillStyle(0x00ffff, alpha * 0.8);
        for (const t of effect.tiles) {
          if (isHoriz) {
            this.weaponGraphics.fillRect(t.x * TILE, t.y * TILE + TILE / 2 - 4, TILE, 8);
          } else {
            this.weaponGraphics.fillRect(t.x * TILE + TILE / 2 - 4, t.y * TILE, 8, TILE);
          }
        }
        // Bright core
        this.weaponGraphics.fillStyle(0xffffff, alpha * 0.6);
        for (const t of effect.tiles) {
          if (isHoriz) {
            this.weaponGraphics.fillRect(t.x * TILE, t.y * TILE + TILE / 2 - 1, TILE, 2);
          } else {
            this.weaponGraphics.fillRect(t.x * TILE + TILE / 2 - 1, t.y * TILE, 2, TILE);
          }
        }
      } else {
        // Flamethrower — wide orange burst with flicker
        for (const t of effect.tiles) {
          const flicker = 0.7 + Math.random() * 0.3;
          this.weaponGraphics.fillStyle(0xff4400, alpha * flicker * 0.7);
          this.weaponGraphics.fillRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
          this.weaponGraphics.fillStyle(0xffcc00, alpha * flicker * 0.4);
          this.weaponGraphics.fillRect(t.x * TILE + 6, t.y * TILE + 6, TILE - 12, TILE - 12);
        }
      }
    }
  }

  // --- SCOREBOARD ---
  updateScoreboard(state) {
    if (!state.players) return;

    const mode = state.gameMode;
    if (mode === "classic") {
      this.scoreboardText.setText("");
      return;
    }

    let lines = [];
    if (mode === "kills") {
      lines.push(`KILLS (first to ${state.killTarget})`);
    } else if (mode === "lives") {
      lines.push("LIVES");
    }

    // Collect all entities with info
    const entries = [];
    state.players.forEach((player, sessionId) => {
      const isMe = sessionId === this.room.sessionId;
      const name = isMe ? "You" : `P${player.playerIndex + 1}`;
      entries.push({ name, kills: player.kills, lives: player.lives, alive: player.alive, color: isMe ? "blue" : "red" });
    });
    state.npcs.forEach((npc) => {
      entries.push({ name: `Bot${npc.npcIndex + 1}`, kills: npc.kills, lives: npc.lives, alive: npc.alive, color: NPC_THEMES[npc.npcIndex % NPC_THEMES.length] });
    });

    for (const e of entries) {
      if (mode === "kills") {
        lines.push(`${e.name}: ${e.kills}`);
      } else {
        const hearts = e.lives > 0 ? `${"*".repeat(Math.min(e.lives, 5))}` : "OUT";
        lines.push(`${e.name}: ${hearts}`);
      }
    }

    this.scoreboardText.setText(lines.join("\n"));
  }

  updateDebug(state) {
    if (!state.players) {
      this.debugText.setText("Syncing...");
      this.powerupText.setText("");
      return;
    }
    const myPlayer = state.players.get(this.room.sessionId);
    if (!myPlayer) {
      this.debugText.setText("Waiting...");
      this.powerupText.setText("");
      return;
    }

    this.debugText.setText(
      `Pos: (${myPlayer.x}, ${myPlayer.y})  Bombs: ${myPlayer.bombsAvailable}  Alive: ${myPlayer.alive}  Status: ${state.status}`
    );

    let puText = "";
    if (myPlayer.powerupType === 1) {
      puText = `FLAMETHROWER: ${myPlayer.powerupUses} uses`;
    } else if (myPlayer.powerupType === 2) {
      puText = `RAYGUN: ${myPlayer.powerupUses} uses`;
    }
    if (myPlayer.hasShield) {
      puText += puText ? "  |  SHIELD ACTIVE" : "SHIELD ACTIVE";
    }
    this.powerupText.setText(puText);
  }
}
