// GLASSWARD: every tuning number, colour and level layout in one place.
// The playfield is a fixed 960x600 grid (24x15 tiles of 40px) with a 44px HUD
// bar on top, so the whole logical view is 960x644 and the renderer scales it
// to the window. No rule below depends on the screen size.

export const STEP = 1 / 60;
export const TILE = 40;
export const COLS = 24;
export const ROWS = 15;
export const HUD_H = 44;
export const VIEW = { width: 960, height: 600 + HUD_H };

/** Centre of a tile, in grid pixels: cell(2, 6) is the middle of column 2, row 6. */
export function cell(cx, cy) {
  return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
}

/** A rectangle given in tile units: rect(9, 6, 1, 1) is one tile at column 9, row 6. */
export function rect(cx, cy, w, h) {
  return { x: cx * TILE, y: cy * TILE, w: w * TILE, h: h * TILE };
}

export const PLAYER = {
  radius: 13,
  walk: 160,
  sneak: 95,
  pickup: 26,
  catchDistance: 24,
};

export const GUARD = {
  radius: 13,
  patrol: 85,
  investigate: 115,
  chase: 155,
  viewRange: 220,
  viewHalf: (65 / 2) * (Math.PI / 180),
  viewHalfWide: (75 / 2) * (Math.PI / 180),
  waypointPause: 1.2,
  suspiciousPause: 0.4,
  lookTime: 2.5,
  pebbleLookTime: 2.0,
  loseSightTime: 3.5,
  unseenReturnTime: 4.0,
  alertRadius: 200,
  hedgeSpotDistance: 40,
};

export const DETECT = {
  nearDistance: 100,
  nearRate: 110,
  farRate: 65,
  decayOpen: 25,
  decayCrouch: 35,
  decayHedge: 50,
  crouchFill: 0.75,
  lightFill: 1.35,
  hedgeFill: 0.5,
};

export const PEBBLE = {
  maxRange: 260,
  rippleRadius: 120,
  cooldown: 1.5,
  flight: 0.35,
  rippleTime: 0.8,
};

export const NOISE = { walkRadius: 70, stepTime: 0.35 };

export const PALETTE = {
  offMap: '#0f141e',
  wallTop: '#243044',
  floorA: '#17202e',
  floorB: '#1e2a3b',
  floorLine: '#223047',
  hedgeBase: '#163b32',
  hedgeLeaf: '#245c4d',
  hedgeLeaf2: '#2e7260',
  player: '#e8f1f5',
  playerEdge: '#4de3d1',
  conePatrol: '#f4b942',
  coneSuspicious: '#f27435',
  coneAlert: '#e63946',
  spore: '#38f2c6',
  exitGold: '#ffd166',
  exitLocked: '#e63946',
  pillar: '#8b98ab',
  pillarTop: '#b9c4d4',
  fountain: '#2e6f8e',
  fountainRing: '#7fd4e8',
  table: '#4a3626',
  tablePlant: '#3f7d5a',
  hud: '#0b0f17',
  hudLine: '#243044',
  text: '#e8f1f5',
  muted: '#8a9bb0',
  dimText: '#b8c7d9',
  hiddenBg: '#10322b',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

/** How many seconds a level may run before the clock stops mattering for rank. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const BEST_KEY = 'glassward.best';

/**
 * A guard patrol is a list of waypoints. Each waypoint is {x, y, face, pause}:
 * x/y are grid pixels, face is the direction in radians the guard looks while
 * waiting there (0 east, PI/2 south), pause the seconds waited. `loop` patrols
 * walk the list round and round; `pingpong` patrols walk it out and back.
 * `spin` guards stand still and turn 180 degrees every `spinPeriod` seconds.
 * `wide` guards use the wider 75-degree cone (level 3).
 */
function guard(waypoints, options = {}) {
  return { waypoints, loop: options.loop ?? false, spin: options.spin ?? false, wide: options.wide ?? false, spinPeriod: options.spinPeriod ?? 2.5 };
}

function wp(cx, cy, faceDeg, pause = GUARD.waypointPause) {
  const p = cell(cx, cy);
  return { x: p.x, y: p.y, face: (faceDeg * Math.PI) / 180, pause };
}

/** The outer walls, with a two-tile gap in the north wall where the exit sits. */
function borderWalls(exitCol) {
  return [
    rect(0, 0, exitCol, 1),
    rect(exitCol + 2, 0, COLS - exitCol - 2, 1),
    rect(0, 14, 24, 1),
    rect(0, 0, 1, 15),
    rect(23, 0, 1, 15),
  ];
}

export const LEVELS = [
  {
    name: 'LEVEL 1 - THE ATRIUM',
    short: 'The Atrium',
    pebbles: 3,
    start: cell(12, 13),
    exit: { gate: rect(11, 0, 2, 1), touch: rect(11, 1, 2, 1) },
    walls: [...borderWalls(11), rect(10, 1, 1, 1), rect(13, 1, 1, 1)],
    pillars: [rect(9, 6, 1, 1), rect(14, 6, 1, 1), rect(9, 9, 1, 1), rect(14, 9, 1, 1)],
    fountain: rect(11, 7, 2, 2),
    tables: [rect(18, 5, 1, 4), rect(20, 5, 1, 4)],
    hedges: [
      rect(1, 4, 1, 2),
      rect(1, 7, 1, 2),
      rect(1, 10, 1, 2),
      rect(19, 12, 2, 2),
      rect(10, 13, 1, 1),
      rect(13, 13, 1, 1),
    ],
    lights: [{ x: 480, y: 420, r: 70 }],
    spores: [cell(2, 6), cell(21, 4)],
    guards: [
      guard([wp(8, 5, 0), wp(15, 5, 90), wp(15, 10, 180), wp(8, 10, 270)], { loop: true }),
      guard([wp(4, 3, 90), wp(4, 11, 270)]),
      guard([wp(18, 10, 0), wp(21, 10, 270), wp(21, 4, 180)]),
    ],
  },
  {
    name: 'LEVEL 2 - THE ORCHID GALLERY',
    short: 'The Orchid Gallery',
    pebbles: 2,
    start: cell(12, 13),
    exit: { gate: rect(11, 0, 2, 1), touch: rect(11, 1, 2, 1) },
    walls: [
      ...borderWalls(11),
      rect(9, 2, 1, 1),
      rect(9, 4, 1, 3),
      rect(9, 8, 1, 3),
      rect(9, 12, 1, 1),
      rect(14, 2, 1, 1),
      rect(14, 4, 1, 3),
      rect(14, 8, 1, 3),
      rect(14, 12, 1, 1),
    ],
    pillars: [rect(6, 6, 1, 1), rect(6, 9, 1, 1), rect(17, 6, 1, 1), rect(17, 9, 1, 1), rect(10, 3, 1, 1), rect(13, 3, 1, 1)],
    fountain: null,
    tables: [],
    hedges: [rect(1, 6, 1, 3), rect(7, 4, 1, 2), rect(16, 8, 1, 2), rect(22, 6, 1, 3)],
    lights: [
      { x: 460, y: 220, r: 75 },
      { x: 460, y: 420, r: 75 },
    ],
    spores: [cell(2, 3), cell(21, 3), cell(12, 6)],
    guards: [
      guard([wp(11, 7, 270)], { spin: true, spinPeriod: 2.5 }),
      guard([wp(3, 2, 90), wp(3, 12, 270)]),
      guard([wp(6, 11, 0), wp(17, 11, 180)]),
      guard([wp(20, 2, 90), wp(20, 12, 270)]),
      guard([wp(7, 2, 0), wp(16, 2, 180)]),
    ],
  },
  {
    name: 'LEVEL 3 - THE GRAND DOME',
    short: 'The Grand Dome',
    pebbles: 2,
    start: cell(2, 13),
    exit: { gate: rect(21, 0, 2, 1), touch: rect(21, 1, 2, 1) },
    walls: [...borderWalls(21), rect(20, 1, 1, 1)],
    pillars: [
      rect(8, 5, 1, 1),
      rect(15, 5, 1, 1),
      rect(8, 9, 1, 1),
      rect(15, 9, 1, 1),
      rect(11, 4, 1, 1),
      rect(11, 10, 1, 1),
      rect(7, 7, 1, 1),
      rect(16, 7, 1, 1),
    ],
    fountain: null,
    tables: [],
    hedges: [rect(1, 7, 1, 1), rect(11, 13, 1, 1), rect(22, 7, 1, 1), rect(11, 1, 1, 1)],
    lights: [
      { x: 460, y: 300, r: 100 },
      { x: 260, y: 300, r: 60 },
      { x: 700, y: 300, r: 60 },
    ],
    spores: [cell(2, 2), cell(11, 7), cell(21, 12), cell(15, 2)],
    guards: [
      guard([wp(7, 4, 0), wp(16, 4, 90), wp(16, 10, 180), wp(7, 10, 270)], { loop: true, wide: true }),
      guard([wp(7, 10, 90), wp(16, 10, 0), wp(16, 4, 270), wp(7, 4, 180)], { loop: true, wide: true }),
      guard([wp(3, 3, 90), wp(3, 11, 270)], { wide: true }),
      guard([wp(5, 12, 0), wp(19, 12, 180)], { wide: true }),
      guard([wp(20, 3, 90), wp(20, 11, 270)], { wide: true }),
      guard([wp(5, 2, 0), wp(18, 2, 180)], { wide: true }),
      guard([wp(19, 3, 0), wp(22, 3, 180)], { wide: true }),
    ],
  },
];
