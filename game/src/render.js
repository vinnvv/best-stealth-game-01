// GLASSWARD's painter: a canvas renderer that scales the fixed 960x644
// logical view to the window and draws everything the world knows: floor,
// hedges, walls, pillars, the fountain, light pools, the gate, spores, the
// guards' raycast vision cones, the player, the HUD and the screens. Nothing
// here reads the clock or Math.random, so the same state always paints the
// same frame.

import { COLS, FONT, HUD_H, MONO_FONT, PALETTE, ROWS, TILE, VIEW } from './config.js';
import { hash2 } from './random.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_CLEAR = 3;
export const SCREEN_CAUGHT = 4;

const CONE_COLORS = ['#f4b942', '#f27435', '#e63946'];

function coneColor(guard) {
  if (guard.state === 2) return CONE_COLORS[2];
  if (guard.state === 1 || guard.meter >= 50) return CONE_COLORS[1];
  return CONE_COLORS[0];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height) * 1;
    const vw = VIEW.width * scale;
    const vh = VIEW.height * scale;
    offsetX = (canvas.width - vw) / 2;
    offsetY = (canvas.height - vh) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** A point in CSS pixels on the canvas becomes a point in grid space. */
  function screenToGrid(px, py) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const x = (px * dpr - offsetX) / scale;
    const y = (py * dpr - offsetY) / scale - HUD_H;
    return { x, y };
  }

  function drawFloor(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        ctx.fillStyle = (row + col) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
      }
    }
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 0; col <= COLS; col += 1) {
      ctx.moveTo(col * TILE + 0.5, 0);
      ctx.lineTo(col * TILE + 0.5, ROWS * TILE);
    }
    for (let row = 0; row <= ROWS; row += 1) {
      ctx.moveTo(0, row * TILE + 0.5);
      ctx.lineTo(COLS * TILE, row * TILE + 0.5);
    }
    ctx.stroke();
  }

  function drawLightPools(state) {
    for (const light of state.level.lights) {
      const grad = ctx.createRadialGradient(light.x, light.y, 4, light.x, light.y, light.r);
      grad.addColorStop(0, 'rgba(244, 185, 66, 0.20)');
      grad.addColorStop(1, 'rgba(244, 185, 66, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(244, 185, 66, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawWalls(state) {
    for (const wall of state.level.walls) {
      ctx.fillStyle = PALETTE.offMap;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(wall.x, wall.y + wall.h - 4, wall.w, 4);
    }
  }

  function drawHedges(state) {
    for (const hedge of state.level.hedges) {
      ctx.fillStyle = PALETTE.shadow;
      roundRect(ctx, hedge.x + 3, hedge.y + 4, hedge.w, hedge.h, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.hedgeBase;
      roundRect(ctx, hedge.x, hedge.y, hedge.w, hedge.h, 8);
      ctx.fill();
      // Stacked leaf circles, scattered by a stable hash so they never move.
      const count = Math.floor((hedge.w * hedge.h) / 160);
      for (let i = 0; i < count; i += 1) {
        const lx = hedge.x + 8 + hash2(hedge.x, hedge.y + i * 7) * (hedge.w - 16);
        const ly = hedge.y + 8 + hash2(hedge.x + i * 13, hedge.y) * (hedge.h - 16);
        const lr = 6 + hash2(i, hedge.x + hedge.y) * 5;
        ctx.fillStyle = i % 2 === 0 ? PALETTE.hedgeLeaf : PALETTE.hedgeLeaf2;
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawTables(state) {
    for (const table of state.level.tables) {
      ctx.fillStyle = PALETTE.shadow;
      roundRect(ctx, table.x + 3, table.y + 4, table.w, table.h, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.table;
      roundRect(ctx, table.x, table.y, table.w, table.h, 6);
      ctx.fill();
      const count = Math.floor(table.h / 40);
      for (let i = 0; i < count; i += 1) {
        const px = table.x + table.w / 2;
        const py = table.y + 20 + i * 40;
        ctx.fillStyle = PALETTE.tablePlant;
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.hedgeLeaf2;
        ctx.beginPath();
        ctx.arc(px - 3, py - 3, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPillars(state) {
    for (const pillar of state.level.pillars) {
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(pillar.x + pillar.w / 2 + 3, pillar.y + pillar.h / 2 + 5, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.pillar;
      roundRect(ctx, pillar.x + 3, pillar.y + 3, pillar.w - 6, pillar.h - 6, 5);
      ctx.fill();
      ctx.fillStyle = PALETTE.pillarTop;
      roundRect(ctx, pillar.x + 8, pillar.y + 8, pillar.w - 16, pillar.h - 16, 4);
      ctx.fill();
    }
  }

  function drawFountain(state) {
    const f = state.level.fountain;
    if (!f) return;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 5, 40, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.pillar;
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.fountain;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.fountainRing;
    ctx.lineWidth = 2;
    const ripple = 8 + ((state.elapsed * 10) % 18);
    ctx.beginPath();
    ctx.arc(cx, cy, ripple, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#dfe9f2';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGate(state) {
    const gate = state.level.exit.gate;
    const cx = gate.x + gate.w / 2;
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(gate.x + 2, gate.y + 2, gate.w, gate.h);
    // Posts.
    ctx.fillStyle = state.exitOpen ? PALETTE.exitGold : PALETTE.wallTop;
    ctx.fillRect(gate.x, gate.y, 6, gate.h);
    ctx.fillRect(gate.x + gate.w - 6, gate.y, 6, gate.h);
    // Bars: shut while locked, swung open once the spores are all taken.
    ctx.fillStyle = state.exitOpen ? PALETTE.exitGold : '#5a6b84';
    const bars = state.exitOpen ? 2 : 5;
    for (let i = 0; i < bars; i += 1) {
      const bx = gate.x + 10 + ((gate.w - 20) * i) / Math.max(1, bars - 1);
      ctx.fillRect(bx - 2, gate.y + 2, 4, gate.h - 4);
    }
    // The bar across the gate: red while locked, gold once open.
    ctx.fillStyle = state.exitOpen ? PALETTE.exitGold : PALETTE.exitLocked;
    ctx.fillRect(gate.x, gate.y + gate.h / 2 - 4, gate.w, 8);
    if (state.exitOpen) {
      const glow = ctx.createRadialGradient(cx, gate.y + gate.h / 2, 2, cx, gate.y + gate.h / 2, 60);
      glow.addColorStop(0, 'rgba(255, 209, 102, 0.45)');
      glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, gate.y + gate.h / 2, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    // A small EXIT label under the gate so it reads at a glance.
    ctx.fillStyle = state.exitOpen ? PALETTE.exitGold : PALETTE.exitLocked;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(state.exitOpen ? 'EXIT OPEN' : 'EXIT', cx, gate.y + gate.h + 3);
  }

  function drawSpores(state) {
    state.spores.forEach((spore, index) => {
      if (spore.taken) return;
      const bob = Math.sin(state.elapsed * 2 + index * 1.7) * 2;
      const y = spore.y + bob;
      const glow = ctx.createRadialGradient(spore.x, y, 2, spore.x, y, 30);
      glow.addColorStop(0, 'rgba(56, 242, 198, 0.55)');
      glow.addColorStop(1, 'rgba(56, 242, 198, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(spore.x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(spore.x + 2, spore.y + 12, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.spore;
      roundRect(ctx, spore.x - 6, y - 11, 12, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#eafff8';
      roundRect(ctx, spore.x - 3, y - 8, 6, 8, 3);
      ctx.fill();
    });
  }

  function drawCones(state, world) {
    for (const guard of state.guards) {
      const poly = world.visionPolygon(guard);
      const color = coneColor(guard);
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.26;
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawRipples(state) {
    for (const ripple of state.ripples) {
      const frac = ripple.t / 0.8;
      const radius = 12 + frac * 108;
      ctx.strokeStyle = `rgba(232, 241, 245, ${0.9 * (1 - frac)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of state.flying) {
      const frac = f.t / 0.35;
      const x = f.x0 + (f.x1 - f.x0) * frac;
      const y = f.y0 + (f.y1 - f.y0) * frac - Math.sin(frac * Math.PI) * 18;
      ctx.fillStyle = '#c8d3de';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const color = coneColor(guard);
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(guard.x + 2, guard.y + 4, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark robe, rimmed by the colour of its current state.
      ctx.fillStyle = '#1a2233';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // The brass lantern, carried ahead in the facing direction.
      const lx = guard.x + Math.cos(guard.angle) * 16;
      const ly = guard.y + Math.sin(guard.angle) * 16;
      const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 12);
      glow.addColorStop(0, 'rgba(244, 185, 66, 0.8)');
      glow.addColorStop(1, 'rgba(244, 185, 66, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      // Detection arc above the head, plus ? while suspicious, ! while alert.
      if (guard.meter > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y - 20, 9, -Math.PI / 2, -Math.PI / 2 + (guard.meter / 100) * Math.PI * 2);
        ctx.stroke();
      }
      if (guard.state === 1) {
        ctx.fillStyle = '#f27435';
        ctx.font = `bold 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('?', guard.x, guard.y - 28);
      } else if (guard.state === 2) {
        ctx.fillStyle = '#e63946';
        ctx.font = `bold 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('!', guard.x, guard.y - 28);
      }
    }
  }

  function drawPlayer(state, world) {
    const p = state.player;
    const inHedge = world.inHedge(p.x, p.y);
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = inHedge ? 0.55 : 1;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sneaking ? 11 : 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.playerEdge;
    ctx.lineWidth = 2.5;
    if (p.sneaking) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small hood mark so the player reads as a person, not a coin.
    ctx.fillStyle = PALETTE.playerEdge;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawAim(state, world, mouseGrid) {
    if (!mouseGrid) return;
    const p = state.player;
    const dx = mouseGrid.x - p.x;
    const dy = mouseGrid.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 260 || mouseGrid.y < 0 || mouseGrid.y > 600 || mouseGrid.x < 0 || mouseGrid.x > 960) return;
    ctx.strokeStyle = 'rgba(232, 241, 245, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 260, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232, 241, 245, 0.7)';
    ctx.beginPath();
    ctx.arc(mouseGrid.x, mouseGrid.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseGrid.x - 12, mouseGrid.y);
    ctx.lineTo(mouseGrid.x + 12, mouseGrid.y);
    ctx.moveTo(mouseGrid.x, mouseGrid.y - 12);
    ctx.lineTo(mouseGrid.x, mouseGrid.y + 12);
    ctx.stroke();
  }

  function drawHud(state, world) {
    ctx.fillStyle = PALETTE.hud;
    ctx.fillRect(0, 0, VIEW.width, HUD_H);
    ctx.fillStyle = PALETTE.hudLine;
    ctx.fillRect(0, HUD_H - 1, VIEW.width, 1);
    ctx.textBaseline = 'middle';
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.fillText(state.level.name, 16, 22);
    const taken = state.spores.filter((s) => s.taken).length;
    ctx.fillStyle = PALETTE.spore;
    ctx.fillText(`SPORES ${taken}/${state.spores.length}`, 340, 22);
    ctx.fillStyle = PALETTE.dimText;
    ctx.fillText(`PEBBLES ${state.pebblesLeft}`, 490, 22);
    // Status pill: HIDDEN green, SEEN orange, ALERT red.
    const pill = { x: 634, y: 10, w: 92, h: 24 };
    if (state.status === 'HIDDEN') {
      ctx.fillStyle = PALETTE.hiddenBg;
    } else if (state.status === 'SEEN') {
      ctx.fillStyle = '#f27435';
    } else {
      ctx.fillStyle = '#e63946';
    }
    roundRect(ctx, pill.x, pill.y, pill.w, pill.h, 12);
    ctx.fill();
    ctx.strokeStyle = state.status === 'HIDDEN' ? PALETTE.spore : ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = state.status === 'HIDDEN' ? PALETTE.spore : state.status === 'SEEN' ? '#0b0f17' : '#ffffff';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(state.status, pill.x + pill.w / 2, pill.y + pill.h / 2 + 1);
    // Timer, right aligned.
    ctx.font = `15px ${MONO_FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'right';
    ctx.fillText(world.timeString(), 944, 22);
    // One line of controls, bottom left of the field.
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.globalAlpha = 0.75;
    ctx.textAlign = 'left';
    ctx.fillText('WASD Move - SHIFT Sneak - CLICK Pebble - R Restart', 16, HUD_H + 584);
    ctx.globalAlpha = 1;
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(11, 15, 23, ${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function centredText(lines) {
    let y = 210;
    for (const line of lines) {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, VIEW.width / 2, y);
      y += line.gap;
    }
  }

  function drawOverlay(state, world, screen, best) {
    if (screen === SCREEN_TITLE) {
      dim(0.88);
      try {
        ctx.letterSpacing = '6px';
      } catch {
        // Older browsers ignore letter spacing.
      }
      centredText([
        { text: 'GLASSWARD', font: `bold 48px ${FONT}`, color: PALETTE.text, gap: 44 },
        { text: 'Midnight Botanical Conservatory', font: `16px ${FONT}`, color: PALETTE.spore, gap: 40 },
        { text: 'Collect all Moon-Spores. Stay out of the lanterns. Reach the North Gate.', font: `14px ${FONT}`, color: PALETTE.dimText, gap: 52 },
        { text: 'ENTER CONSERVATORY', font: `bold 15px ${FONT}`, color: PALETTE.exitGold, gap: 30 },
        { text: 'press SPACE or click', font: `12px ${FONT}`, color: PALETTE.muted, gap: 0 },
      ]);
      try {
        ctx.letterSpacing = '0px';
      } catch {
        // As above.
      }
    } else if (screen === SCREEN_PAUSED) {
      dim(0.6);
      centredText([{ text: 'PAUSED', font: `bold 32px ${FONT}`, color: PALETTE.text, gap: 30 }, { text: 'press P to keep sneaking', font: `14px ${FONT}`, color: PALETTE.muted, gap: 0 }]);
    } else if (screen === SCREEN_CLEAR) {
      dim(0.78);
      centredText([
        { text: 'LEVEL CLEARED', font: `bold 32px ${FONT}`, color: PALETTE.exitGold, gap: 40 },
        { text: `Time: ${world.timeString()}  -  Alerts: ${state.alerts}  -  Rank: ${state.rank}`, font: `16px ${FONT}`, color: PALETTE.text, gap: 44 },
        { text: state.levelIndex + 1 < 3 ? 'NEXT LEVEL' : 'PLAY AGAIN', font: `bold 15px ${FONT}`, color: PALETTE.exitGold, gap: 30 },
        { text: 'press SPACE', font: `12px ${FONT}`, color: PALETTE.muted, gap: 0 },
      ]);
    } else if (screen === SCREEN_CAUGHT) {
      ctx.fillStyle = 'rgba(230, 57, 70, 0.18)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      dim(0.7);
      centredText([
        { text: 'CAUGHT BY THE WARDEN', font: `bold 32px ${FONT}`, color: '#e63946', gap: 40 },
        { text: 'The lantern light found you.', font: `15px ${FONT}`, color: PALETTE.dimText, gap: 44 },
        { text: 'PRESS R TO RETRY', font: `bold 14px ${FONT}`, color: PALETTE.text, gap: 0 },
      ]);
    }
    if (best > 0 && screen === SCREEN_TITLE) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Best clear: ${best}s`, VIEW.width / 2, 430);
    }
  }

  /** Paint one frame: the field, the HUD and the screen overlay. */
  function draw(state, world, screen, best, mouseGrid) {
    resize();
    ctx.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    ctx.fillStyle = PALETTE.offMap;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX / Math.min(2, window.devicePixelRatio || 1), offsetY / Math.min(2, window.devicePixelRatio || 1));
    ctx.scale(scale / Math.min(2, window.devicePixelRatio || 1), scale / Math.min(2, window.devicePixelRatio || 1));
    drawHud(state, world);
    ctx.save();
    ctx.translate(0, HUD_H);
    drawFloor(state);
    drawLightPools(state);
    drawGate(state);
    drawHedges(state);
    drawTables(state);
    drawPillars(state);
    drawFountain(state);
    drawSpores(state);
    drawCones(state, world);
    drawRipples(state);
    drawGuards(state);
    drawPlayer(state, world);
    if (screen === SCREEN_PLAY) drawAim(state, world, mouseGrid);
    ctx.restore();
    drawOverlay(state, world, screen, best);
    ctx.restore();
  }

  return { draw, screenToGrid, resize };
}
