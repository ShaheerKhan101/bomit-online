// main.js — lobby + Phaser boot with Colyseus connection

import { Client } from "colyseus.js";
import Phaser from "phaser";
import GameScene from "./GameScene.js";
import { TILE, GRID_PRESETS } from "./map.js";

// DOM elements
const lobbyDiv = document.getElementById("lobby");
const gameContainer = document.getElementById("gameContainer");
const lobbyStatus = document.getElementById("lobbyStatus");

// Choice screen
const choiceScreen = document.getElementById("choiceScreen");
const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");

// Host panel
const hostPanel = document.getElementById("hostPanel");
const gridSizeSelect = document.getElementById("gridSize");
const botCountSelect = document.getElementById("botCount");
const botDifficultySelect = document.getElementById("botDifficulty");
const gameModeSelect = document.getElementById("gameMode");
const startingLivesSelect = document.getElementById("startingLives");
const killTargetSelect = document.getElementById("killTarget");
const livesLabel = document.getElementById("livesLabel");
const killsLabel = document.getElementById("killsLabel");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const hostBackBtn = document.getElementById("hostBackBtn");

// Join panel
const joinPanel = document.getElementById("joinPanel");
const roomCodeInput = document.getElementById("roomCode");
const joinSubmitBtn = document.getElementById("joinSubmitBtn");
const joinBackBtn = document.getElementById("joinBackBtn");

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const serverUrl = import.meta.env.DEV
  ? `${protocol}://${window.location.hostname}:2567`
  : `${protocol}://${window.location.host}`;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function showPanel(panel) {
  choiceScreen.style.display = "none";
  hostPanel.style.display = "none";
  joinPanel.style.display = "none";
  lobbyStatus.textContent = "";
  if (panel === "host") hostPanel.style.display = "block";
  else if (panel === "join") joinPanel.style.display = "block";
  else choiceScreen.style.display = "flex";
}

// Game mode dropdown toggling
gameModeSelect.addEventListener("change", () => {
  const mode = gameModeSelect.value;
  livesLabel.style.display = mode === "lives" ? "" : "none";
  killsLabel.style.display = mode === "kills" ? "" : "none";
});

// Host flow — show config panel first, don't create room yet
hostBtn.addEventListener("click", () => {
  showPanel("host");
  const code = generateRoomCode();
  roomCodeDisplay.textContent = code;
});

// Start Hosting button — creates the room after user configures settings
const startHostBtn = document.getElementById("startHostBtn");
startHostBtn.addEventListener("click", () => {
  const code = roomCodeDisplay.textContent;
  if (code && code !== "----") {
    startHostBtn.disabled = true;
    hostGame(code);
  }
});

copyCodeBtn.addEventListener("click", () => {
  const code = roomCodeDisplay.textContent;
  navigator.clipboard.writeText(code).then(() => {
    copyCodeBtn.textContent = "Copied!";
    setTimeout(() => { copyCodeBtn.textContent = "Copy Code"; }, 1500);
  });
});

hostBackBtn.addEventListener("click", () => showPanel("choice"));
joinBackBtn.addEventListener("click", () => showPanel("choice"));

async function hostGame(roomCode) {
  lobbyStatus.textContent = "Creating room...";

  try {
    const client = new Client(serverUrl);
    const room = await client.create("game", {
      roomCode,
      gridSize: gridSizeSelect.value,
      botCount: parseInt(botCountSelect.value, 10),
      botDifficulty: botDifficultySelect.value,
      gameMode: gameModeSelect.value,
      startingLives: parseInt(startingLivesSelect.value, 10),
      killTarget: parseInt(killTargetSelect.value, 10),
    });

    lobbyStatus.textContent = "Waiting for opponent...";
    startPhaserGame(room, gridSizeSelect.value);
  } catch (err) {
    console.error("Host error:", err);
    lobbyStatus.textContent = `Error: ${err.message}`;
  }
}

// Join flow
joinBtn.addEventListener("click", () => {
  showPanel("join");
  roomCodeInput.value = "";
  roomCodeInput.focus();
});

joinSubmitBtn.addEventListener("click", joinGame);
roomCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinGame();
});

async function joinGame() {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    lobbyStatus.textContent = "Enter a room code!";
    return;
  }

  joinSubmitBtn.disabled = true;
  lobbyStatus.textContent = "Connecting...";

  try {
    const client = new Client(serverUrl);
    const room = await client.join("game", { roomCode });

    lobbyStatus.textContent = "Joined! Waiting for game...";
    // Joiner doesn't know grid size — use a generous default, GameScene will resize
    startPhaserGame(room, null);
  } catch (err) {
    console.error("Join error:", err);
    lobbyStatus.textContent = `Error: ${err.message}`;
    joinSubmitBtn.disabled = false;
  }
}

function startPhaserGame(room, gridSize) {
  lobbyDiv.style.display = "none";
  gameContainer.style.display = "block";

  // Use known preset or generous default for joiners
  const preset = gridSize ? (GRID_PRESETS[gridSize] || GRID_PRESETS.medium) : GRID_PRESETS.xl;
  const config = {
    type: Phaser.AUTO,
    width: preset.cols * TILE,
    height: preset.rows * TILE + 40,
    backgroundColor: "#222222",
    parent: "gameContainer",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
  };

  const game = new Phaser.Game(config);
  game.scene.add("GameScene", GameScene, true, { room });
}
