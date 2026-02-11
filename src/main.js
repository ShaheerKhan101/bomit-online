// main.js — lobby + Phaser boot with Colyseus connection

import { Client } from "colyseus.js";
import Phaser from "phaser";
import GameScene from "./GameScene.js";
import { COLS, ROWS, TILE } from "./map.js";

const lobbyDiv = document.getElementById("lobby");
const gameContainer = document.getElementById("gameContainer");
const roomCodeInput = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const lobbyStatus = document.getElementById("lobbyStatus");

// Determine server URL
// Dev: Vite runs on a different port, so point to :2567
// Prod: server serves both static files & WS on the same host/port
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const serverUrl = import.meta.env.DEV
  ? `${protocol}://${window.location.hostname}:2567`
  : `${protocol}://${window.location.host}`;

async function joinGame() {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    lobbyStatus.textContent = "Enter a room code!";
    return;
  }

  joinBtn.disabled = true;
  lobbyStatus.textContent = "Connecting...";

  try {
    const client = new Client(serverUrl);
    const room = await client.joinOrCreate("game", { roomCode });

    lobbyStatus.textContent = "Joined! Waiting for game...";

    // Hide lobby, show game
    lobbyDiv.style.display = "none";
    gameContainer.style.display = "block";

    // Boot Phaser with the room reference
    const config = {
      type: Phaser.AUTO,
      width: COLS * TILE,
      height: ROWS * TILE + 32,
      backgroundColor: "#222222",
      parent: "gameContainer",
      scene: [],
    };

    const game = new Phaser.Game(config);
    game.scene.add("GameScene", GameScene, true, { room });
  } catch (err) {
    console.error("Join error:", err);
    lobbyStatus.textContent = `Error: ${err.message}`;
    joinBtn.disabled = false;
  }
}

joinBtn.addEventListener("click", joinGame);
roomCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinGame();
});
