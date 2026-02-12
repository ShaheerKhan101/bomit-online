// sprites.js — Programmatic 8-bit pixel art generation for all game entities

const S = 2; // Scale: each pixel becomes 2x2 on a 32x32 canvas (16x16 pixel art)

// Color palettes for character themes
const THEMES = {
  blue:   { body: "#2266cc", bodyDark: "#1a4e99", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#2266cc", legs: "#1a1a4e", legsDark: "#111133" },
  red:    { body: "#cc2222", bodyDark: "#991a1a", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#cc2222", legs: "#4e1a1a", legsDark: "#331111" },
  green:  { body: "#22aa44", bodyDark: "#1a8833", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#22aa44", legs: "#1a3e1a", legsDark: "#112211" },
  purple: { body: "#8833cc", bodyDark: "#6622aa", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#8833cc", legs: "#3e1a4e", legsDark: "#221133" },
  orange: { body: "#cc8822", bodyDark: "#aa6e1a", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#cc8822", legs: "#4e3e1a", legsDark: "#332211" },
  yellow: { body: "#cccc22", bodyDark: "#aaaa1a", head: "#ffddaa", headDark: "#ddbb88", eyes: "#111111", arms: "#cccc22", legs: "#4e4e1a", legsDark: "#333311" },
};

// _ = transparent, H = head, h = headDark, E = eyes, B = body, b = bodyDark, A = arms, L = legs, l = legsDark
const CHAR_DOWN_0 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HhEHHEhH_____",
  "___HHHHHHHH_____",
  "___HHHhhHHH_____",
  "____HHHHHH______",
  "___ABBBBBBA_____",
  "___ABBBBBBA_____",
  "___ABBbbBBA_____",
  "____BBBBBB______",
  "____BBBBBB______",
  "____LL__LL______",
  "____LL__LL______",
  "___lll__lll_____",
  "________________",
];

const CHAR_DOWN_1 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HhEHHEhH_____",
  "___HHHHHHHH_____",
  "___HHHhhHHH_____",
  "____HHHHHH______",
  "___ABBBBBBA_____",
  "___ABBBBBBA_____",
  "___ABBbbBBA_____",
  "____BBBBBB______",
  "____BBBBBB______",
  "___LL____LL_____",
  "___LL____LL_____",
  "___ll____ll_____",
  "________________",
];

const CHAR_UP_0 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HHHHHHHH_____",
  "___HHHhhHHH_____",
  "___HHHHHHHH_____",
  "____HHHHHH______",
  "___ABBBBBBA_____",
  "___ABBBBBBA_____",
  "___ABBbbBBA_____",
  "____BBBBBB______",
  "____BBBBBB______",
  "____LL__LL______",
  "____LL__LL______",
  "___lll__lll_____",
  "________________",
];

const CHAR_UP_1 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HHHHHHHH_____",
  "___HHHhhHHH_____",
  "___HHHHHHHH_____",
  "____HHHHHH______",
  "___ABBBBBBA_____",
  "___ABBBBBBA_____",
  "___ABBbbBBA_____",
  "____BBBBBB______",
  "____BBBBBB______",
  "___LL____LL_____",
  "___LL____LL_____",
  "___ll____ll_____",
  "________________",
];

const CHAR_LEFT_0 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HEhHHHHH_____",
  "___HHHHHHHH_____",
  "___HhHHHHHH_____",
  "____HHHHHH______",
  "___BBBBBBB______",
  "__ABBBBBBB______",
  "__ABBbbBBB______",
  "___BBBBBBB______",
  "____BBBBB_______",
  "____LL_LL_______",
  "____LL_LL_______",
  "___lll_lll______",
  "________________",
];

const CHAR_LEFT_1 = [
  "________________",
  "____HHHHHH______",
  "___HHHHHHHH_____",
  "___HEhHHHHH_____",
  "___HHHHHHHH_____",
  "___HhHHHHHH_____",
  "____HHHHHH______",
  "___BBBBBBB______",
  "__ABBBBBBB______",
  "__ABBbbBBB______",
  "___BBBBBBB______",
  "____BBBBB_______",
  "___LL__LL_______",
  "___LL__LL_______",
  "___ll__ll_______",
  "________________",
];

const CHAR_RIGHT_0 = [
  "________________",
  "______HHHHHH____",
  "_____HHHHHHHH___",
  "_____HHHHHhEH___",
  "_____HHHHHHHH___",
  "_____HHHHHHhH___",
  "______HHHHHH____",
  "______BBBBBBB___",
  "______BBBBBBBA__",
  "______BBBbbBBA__",
  "______BBBBBBB___",
  "_______BBBBB____",
  "_______LL_LL____",
  "_______LL_LL____",
  "______lll_lll___",
  "________________",
];

const CHAR_RIGHT_1 = [
  "________________",
  "______HHHHHH____",
  "_____HHHHHHHH___",
  "_____HHHHHhEH___",
  "_____HHHHHHHH___",
  "_____HHHHHHhH___",
  "______HHHHHH____",
  "______BBBBBBB___",
  "______BBBBBBBA__",
  "______BBBbbBBA__",
  "______BBBBBBB___",
  "_______BBBBB____",
  "_______LL__LL___",
  "_______LL__LL___",
  "______ll___ll___",
  "________________",
];

const FRAMES = {
  down:  [CHAR_DOWN_0, CHAR_DOWN_1],
  up:    [CHAR_UP_0, CHAR_UP_1],
  left:  [CHAR_LEFT_0, CHAR_LEFT_1],
  right: [CHAR_RIGHT_0, CHAR_RIGHT_1],
};

// Bomb pixel art (16x16)
const BOMB_ART = [
  "________________",
  "________YY______",
  "_______YR_______",
  "______YR________",
  "_____DDDDDD_____",
  "____DDDDDDDD____",
  "___DDDDwDDDDD___",
  "___DDDDDDDDD___",
  "___DDDDDDDwDD___",
  "___DDDDDDDDD___",
  "____DDDDDDDD____",
  "_____DDDDDD_____",
  "________________",
  "________________",
  "________________",
  "________________",
];

function drawPixelArt(scene, key, artData, colorMap) {
  const size = 16 * S;
  const canvasTex = scene.textures.createCanvas(key, size, size);
  const ctx = canvasTex.getContext();

  for (let py = 0; py < 16; py++) {
    const row = artData[py];
    for (let px = 0; px < 16; px++) {
      const ch = row[px];
      if (ch === "_") continue;
      const color = colorMap[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(px * S, py * S, S, S);
    }
  }

  canvasTex.refresh();
}

function charColorMap(theme) {
  return {
    H: theme.head,
    h: theme.headDark,
    E: theme.eyes,
    B: theme.body,
    b: theme.bodyDark,
    A: theme.arms,
    L: theme.legs,
    l: theme.legsDark,
  };
}

export function generateTextures(scene) {
  // Generate character sprites for each theme
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const cmap = charColorMap(theme);
    for (const [dir, frames] of Object.entries(FRAMES)) {
      for (let f = 0; f < frames.length; f++) {
        drawPixelArt(scene, `player_${themeName}_${dir}_${f}`, frames[f], cmap);
      }
    }
  }

  // Bomb texture
  drawPixelArt(scene, "bomb", BOMB_ART, {
    D: "#111111",
    w: "#333333",
    Y: "#ffcc00",
    R: "#ff4400",
  });

  // Powerup pickup textures (gun-shaped)
  drawPixelArt(scene, "powerup_flame", FLAMETHROWER_ART, {
    O: "#ff6600", R: "#ff2200", Y: "#ffcc00", G: "#333333",
  });
  drawPixelArt(scene, "powerup_ray", RAYGUN_ART, {
    C: "#00ccff", B: "#0088ff", W: "#ffffff", G: "#333333",
  });
  drawPixelArt(scene, "powerup_shield", SHIELD_ART, {
    S: "#44ff44", D: "#22aa22", W: "#ffffff",
  });

  // Explosion frame
  generateExplosionTexture(scene);
}

// Flamethrower pickup — nozzle/barrel shape with flame tip
const FLAMETHROWER_ART = [
  "________________",
  "________________",
  "_______YY_______",
  "______YRYY______",
  "______YORY______",
  "______YORY______",
  "______OORR______",
  "____GGGGGGG_____",
  "___GGOOOOOGG____",
  "___GG_GGGGG_____",
  "______GG________",
  "______GG________",
  "______GG________",
  "______GG________",
  "________________",
  "________________",
];

// Raygun pickup — sci-fi pistol shape
const RAYGUN_ART = [
  "________________",
  "________________",
  "______WW________",
  "_____CCCC_______",
  "____CCCCCC______",
  "___BCCWWCCB_____",
  "___BCCCCCCCCC___",
  "___BCCCCCCCCW___",
  "____CCCCCC______",
  "____GCC_________",
  "____GGC_________",
  "____GGG_________",
  "_____GG_________",
  "________________",
  "________________",
  "________________",
];

// Shield pickup — shield icon
const SHIELD_ART = [
  "________________",
  "________________",
  "____SSSSSS______",
  "___SSSSSSSS_____",
  "___SSDWWDSS_____",
  "___SSSWWSSSS____",
  "___SSSSSSSS_____",
  "___SSSSSSSS_____",
  "____SSSSSS______",
  "____SDDDSS______",
  "_____SSSS_______",
  "______SS________",
  "________________",
  "________________",
  "________________",
  "________________",
];

function generateExplosionTexture(scene) {
  const size = 16 * S;
  const canvasTex = scene.textures.createCanvas("explosion", size, size);
  const ctx = canvasTex.getContext();

  // Fiery explosion fill
  ctx.fillStyle = "#ff4400";
  ctx.globalAlpha = 0.7;
  ctx.fillRect(1 * S, 1 * S, 14 * S, 14 * S);

  ctx.fillStyle = "#ffcc00";
  ctx.globalAlpha = 0.5;
  ctx.fillRect(3 * S, 3 * S, 10 * S, 10 * S);

  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.3;
  ctx.fillRect(5 * S, 5 * S, 6 * S, 6 * S);

  ctx.globalAlpha = 1.0;
  canvasTex.refresh();
}
