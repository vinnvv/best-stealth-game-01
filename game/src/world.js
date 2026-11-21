// GLASSWARD's rules and state, with no drawing and no browser in it: the
// player, the guards and their patrols, vision cones by raycast, the detection
// meter, pebbles and noise, spores, the gate and the win/lose conditions.
// step() advances one fixed step and returns what happened as bit flags, so
// the caller can react without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns, and nothing reads
// Math.random: the same seed and the same inputs always play the same game.

import { DETECT, GUARD, LEVELS, NOISE, PEBBLE, PLAYER, STEP, TILE } from './config.js';

export const EVENT_SPORE = 1;
export const EVENT_GATE = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_CLEARED = 8;
export const EVENT_ALERT = 16;

const STATE_PATROL = 0;
const STATE_SUSPICIOUS = 1;
const STATE_ALERT = 2;
const STATE_INVESTIGATE = 3;

const TAU = Math.PI * 2;

/** Smallest signed angle from a to b, in (-PI, PI]. */
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Move an angle toward a target by at most `maxStep` radians. */
function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

function pointInRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** True when the segment (x0,y0)-(x1,y1) touches rectangle r. */
function segmentHitsRect(x0, y0, x1, y1, r) {
  if (pointInRect(x0, y0, r) || pointInRect(x1, y1, r)) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  // Check each edge with the slab method.
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x0 < r.x || x0 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x0) / dx;
    let t2 = (r.x + r.w - x0) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y0 < r.y || y0 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y0) / dy;
    let t2 = (r.y + r.h - y0) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    player: { x: 0, y: 0, sneaking: false, moving: false, stepTimer: 0 },
    guards: [],
    spores: [],
    pebblesLeft: 0,
    pebbleCooldown: 0,
    flying: [],
    ripples: [],
    exitOpen: false,
    elapsed: 0,
    alerts: 0,
    everSuspicious: false,
    everAlert: false,
    status: 'HIDDEN',
    caught: false,
    cleared: false,
    clearTime: 0,
    rank: '',
  };

  function blockers() {
    const level = state.level;
    const list = [...level.walls, level.exit.gate, ...level.pillars];
    if (level.fountain) list.push(level.fountain);
    for (const table of level.tables) list.push(table);
    return list;
  }

  function circleHitsBlockers(x, y, radius, list) {
    for (const r of list) {
      const cx = Math.max(r.x, Math.min(x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(y, r.y + r.h));
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  }

  /** Move a circle by (dx, dy), sliding along walls: x first, then y. */
  function slideMove(body, dx, dy, radius) {
    const list = blockers();
    const nx = body.x + dx;
    if (!circleHitsBlockers(nx, body.y, radius, list)) body.x = nx;
    const ny = body.y + dy;
    if (!circleHitsBlockers(body.x, ny, radius, list)) body.y = ny;
  }

  function inHedge(x, y) {
    for (const h of state.level.hedges) if (pointInRect(x, y, h)) return true;
    return false;
  }

  function inLight(x, y) {
    for (const light of state.level.lights) {
      const dx = x - light.x;
      const dy = y - light.y;
      if (dx * dx + dy * dy < light.r * light.r) return true;
    }
    return false;
  }

  function losClear(x0, y0, x1, y1) {
    for (const r of blockers()) if (segmentHitsRect(x0, y0, x1, y1, r)) return false;
    return true;
  }

  function guardHalfAngle(g) {
    return g.def.wide ? GUARD.viewHalfWide : GUARD.viewHalf;
  }

  /** True when this guard can see the point right now. */
  function canSee(g, x, y) {
    const dx = x - g.x;
    const dy = y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.viewRange) return false;
    if (Math.abs(angleDiff(g.angle, Math.atan2(dy, dx))) > guardHalfAngle(g)) return false;
    if (inHedge(x, y) && dist > GUARD.hedgeSpotDistance) return false;
    return losClear(g.x, g.y, x, y);
  }

  /** The vision cone as a polygon, raycast against walls so it stops sharply. */
  function visionPolygon(g) {
    const half = guardHalfAngle(g);
    const rays = 25;
    const points = [{ x: g.x, y: g.y }];
    const list = blockers();
    for (let i = 0; i <= rays; i += 1) {
      const a = g.angle - half + (2 * half * i) / rays;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let reach = GUARD.viewRange;
      for (let t = 8; t <= GUARD.viewRange; t += 8) {
        const px = g.x + dx * t;
        const py = g.y + dy * t;
        let blocked = false;
        for (const r of list) {
          if (pointInRect(px, py, r)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          reach = t - 8;
          break;
        }
      }
      points.push({ x: g.x + dx * Math.max(0, reach), y: g.y + dy * Math.max(0, reach) });
    }
    return points;
  }

  function makeGuard(def) {
    const first = def.waypoints[0];
    const second = def.waypoints[1] ?? first;
    const face = first.face ?? Math.atan2(second.y - first.y, second.x - first.x);
    return {
      def,
      x: first.x,
      y: first.y,
      angle: face,
      state: STATE_PATROL,
      phase: 'walk',
      wpIndex: 0,
      wpDir: 1,
      resumeWp: 0,
      pause: 0,
      meter: 0,
      lastSeen: { x: first.x, y: first.y },
      lookTimer: 0,
      loseTimer: 0,
      unseenTimer: 0,
      spinTimer: def.spinPeriod,
      spinTurn: 0,
      target: null,
    };
  }

  function reset(levelIndex) {
    const level = LEVELS[levelIndex];
    state.levelIndex = levelIndex;
    state.level = level;
    state.player.x = level.start.x;
    state.player.y = level.start.y;
    state.player.sneaking = false;
    state.player.moving = false;
    state.player.stepTimer = 0;
    state.guards = level.guards.map(makeGuard);
    state.spores = level.spores.map((s) => ({ x: s.x, y: s.y, taken: false }));
    state.pebblesLeft = level.pebbles;
    state.pebbleCooldown = 0;
    state.flying = [];
    state.ripples = [];
    state.exitOpen = false;
    state.elapsed = 0;
    state.alerts = 0;
    state.everSuspicious = false;
    state.everAlert = false;
    state.status = 'HIDDEN';
    state.caught = false;
    state.cleared = false;
    state.clearTime = 0;
    state.rank = '';
  }

  function setSuspicious(g, x, y) {
    if (g.state === STATE_ALERT) return;
    g.state = STATE_SUSPICIOUS;
    g.phase = 'pause';
    g.pause = GUARD.suspiciousPause;
    g.lastSeen = { x, y };
    g.unseenTimer = 0;
    state.everSuspicious = true;
  }

  function setAlert(g, x, y) {
    if (g.state === STATE_ALERT) {
      g.lastSeen = { x, y };
      g.loseTimer = 0;
      return;
    }
    g.state = STATE_ALERT;
    g.lastSeen = { x, y };
    g.loseTimer = 0;
    g.unseenTimer = 0;
    state.alerts += 1;
    state.everAlert = true;
    // Nearby guards turn suspicious toward the same spot.
    for (const other of state.guards) {
      if (other === g || other.state === STATE_ALERT) continue;
      const dx = other.x - g.x;
      const dy = other.y - g.y;
      if (dx * dx + dy * dy <= GUARD.alertRadius * GUARD.alertRadius) {
        setSuspicious(other, x, y);
      }
    }
  }

  function resumePatrol(g) {
    g.state = STATE_PATROL;
    g.phase = 'walk';
    g.wpIndex = g.resumeWp;
    g.pause = 0;
    g.target = null;
  }

  function moveToward(g, tx, ty, speed, dt) {
    const dx = tx - g.x;
    const dy = ty - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return true;
    const step = Math.min(dist, speed * dt);
    slideMove(g, (dx / dist) * step, (dy / dist) * step, GUARD.radius);
    g.angle = turnToward(g.angle, Math.atan2(dy, dx), 6 * dt);
    return dist - step < 4;
  }

  function updateGuard(g, dt, audio) {
    const player = state.player;
    const seen = !state.caught && !state.cleared && canSee(g, player.x, player.y);
    const dist = Math.hypot(player.x - g.x, player.y - g.y);

    if (seen) {
      g.lastSeen = { x: player.x, y: player.y };
      g.loseTimer = 0;
      g.unseenTimer = 0;
      let rate = dist < DETECT.nearDistance ? DETECT.nearRate : DETECT.farRate;
      if (inLight(player.x, player.y)) rate *= DETECT.lightFill;
      if (inHedge(player.x, player.y)) rate *= DETECT.hedgeFill;
      if (player.sneaking) rate *= DETECT.crouchFill;
      const was = g.meter;
      g.meter = Math.min(100, g.meter + rate * dt);
      if (was < 50 && g.meter >= 50 && g.state !== STATE_ALERT) setSuspicious(g, player.x, player.y);
      if (g.meter >= 100 && g.state !== STATE_ALERT) {
        setAlert(g, player.x, player.y);
        return EVENT_ALERT;
      }
    } else {
      g.loseTimer += dt;
      g.unseenTimer += dt;
      const decay = inHedge(player.x, player.y) ? DETECT.decayHedge : player.sneaking ? DETECT.decayCrouch : DETECT.decayOpen;
      g.meter = Math.max(0, g.meter - decay * dt);
      if (g.state === STATE_ALERT && g.loseTimer >= GUARD.loseSightTime) {
        g.state = STATE_SUSPICIOUS;
        g.phase = 'goto';
        g.pause = 0;
      } else if (g.state === STATE_SUSPICIOUS && g.meter <= 0 && g.unseenTimer >= GUARD.unseenReturnTime) {
        resumePatrol(g);
      }
    }

    if (g.state === STATE_ALERT) {
      moveToward(g, player.x, player.y, GUARD.chase, dt);
      if (Math.hypot(player.x - g.x, player.y - g.y) <= PLAYER.catchDistance) {
        state.caught = true;
        if (audio) audio.caught();
        return EVENT_CAUGHT;
      }
      return 0;
    }

    if (g.state === STATE_SUSPICIOUS) {
      if (g.phase === 'pause') {
        g.pause -= dt;
        g.angle = turnToward(g.angle, Math.atan2(g.lastSeen.y - g.y, g.lastSeen.x - g.x), 3 * dt);
        if (g.pause <= 0) g.phase = 'goto';
      } else if (g.phase === 'goto') {
        if (moveToward(g, g.lastSeen.x, g.lastSeen.y, GUARD.investigate, dt)) {
          g.phase = 'look';
          g.lookTimer = GUARD.lookTime;
        }
      } else if (g.phase === 'look') {
        g.lookTimer -= dt;
        g.angle += Math.sin((GUARD.lookTime - g.lookTimer) * 2.4) * 1.4 * dt;
        if (g.lookTimer <= 0) resumePatrol(g);
      }
      return 0;
    }

    if (g.state === STATE_INVESTIGATE) {
      if (g.phase === 'goto') {
        if (moveToward(g, g.target.x, g.target.y, GUARD.investigate, dt)) {
          g.phase = 'look';
          g.lookTimer = GUARD.pebbleLookTime;
        }
      } else if (g.phase === 'look') {
        g.lookTimer -= dt;
        g.angle += Math.sin((GUARD.pebbleLookTime - g.lookTimer) * 2.4) * 1.4 * dt;
        if (g.lookTimer <= 0) resumePatrol(g);
      }
      return 0;
    }

    // Patrol.
    if (g.def.spin) {
      if (g.spinTurn > 0) {
        g.spinTurn -= dt;
        g.angle += (Math.PI * dt) / 0.8;
      } else {
        g.spinTimer -= dt;
        if (g.spinTimer <= 0) {
          g.spinTimer = g.def.spinPeriod;
          g.spinTurn = 0.8;
        }
      }
      return 0;
    }
    const wp = g.def.waypoints[g.wpIndex];
    if (g.pause > 0) {
      g.pause -= dt;
      const face = wp.face ?? g.angle;
      g.angle = turnToward(g.angle, face, 1.2 * dt);
      if (g.pause <= 0) {
        if (g.def.loop) {
          g.wpIndex = (g.wpIndex + 1) % g.def.waypoints.length;
        } else {
          g.wpIndex += g.wpDir;
          if (g.wpIndex >= g.def.waypoints.length) {
            g.wpIndex = g.def.waypoints.length - 2;
            g.wpDir = -1;
          } else if (g.wpIndex < 0) {
            g.wpIndex = 1;
            g.wpDir = 1;
          }
        }
      }
      return 0;
    }
    if (moveToward(g, wp.x, wp.y, GUARD.patrol, dt)) {
      g.resumeWp = g.wpIndex;
      g.pause = wp.pause;
    }
    return 0;
  }

  function throwPebble(target, audio) {
    const player = state.player;
    let dx = target.x - player.x;
    let dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > PEBBLE.maxRange) {
      dx = (dx / dist) * PEBBLE.maxRange;
      dy = (dy / dist) * PEBBLE.maxRange;
    }
    let tx = player.x + dx;
    let ty = player.y + dy;
    tx = Math.max(TILE / 2, Math.min(24 * TILE - TILE / 2, tx));
    ty = Math.max(TILE / 2, Math.min(15 * TILE - TILE / 2, ty));
    // Pull the landing point out of any wall or pillar it fell inside.
    for (let i = 0; i < 40 && circleHitsBlockers(tx, ty, 6, blockers()); i += 1) {
      tx -= dx * 0.025;
      ty -= dy * 0.025;
    }
    state.flying.push({ x0: player.x, y0: player.y, x1: tx, y1: ty, t: 0 });
    state.pebblesLeft -= 1;
    state.pebbleCooldown = PEBBLE.cooldown;
    if (audio) audio.pebble();
  }

  function landPebble(f) {
    state.ripples.push({ x: f.x1, y: f.y1, t: 0 });
    for (const g of state.guards) {
      if (g.state !== STATE_PATROL && g.state !== STATE_INVESTIGATE) continue;
      const dx = g.x - f.x1;
      const dy = g.y - f.y1;
      if (dx * dx + dy * dy <= PEBBLE.rippleRadius * PEBBLE.rippleRadius) {
        g.resumeWp = g.wpIndex;
        g.state = STATE_INVESTIGATE;
        g.phase = 'goto';
        g.target = { x: f.x1, y: f.y1 };
      }
    }
  }

  /**
   * One fixed step. `input` is {dir:{x,y}, sneak, click} where click is a
   * grid-space point or null. `audio` may be null (headless runs).
   */
  function step(dt, input, audio) {
    if (state.caught || state.cleared) return 0;
    let events = 0;
    state.elapsed += dt;
    const player = state.player;

    // Pebble throws.
    state.pebbleCooldown = Math.max(0, state.pebbleCooldown - dt);
    if (input.click && state.pebblesLeft > 0 && state.pebbleCooldown <= 0) {
      throwPebble(input.click, audio);
    }

    // Player movement, with wall sliding.
    player.sneaking = input.sneak;
    const speed = input.sneak ? PLAYER.sneak : PLAYER.walk;
    const mx = input.dir.x * speed * dt;
    const my = input.dir.y * speed * dt;
    player.moving = mx !== 0 || my !== 0;
    if (player.moving) {
      slideMove(player, mx, my, PLAYER.radius);
      if (!player.sneaking) {
        player.stepTimer -= dt;
        if (player.stepTimer <= 0) {
          player.stepTimer = NOISE.stepTime;
          if (audio) audio.footstep();
          // Footsteps carry 70px unless a wall stands between guard and player.
          for (const g of state.guards) {
            if (g.state !== STATE_PATROL && g.state !== STATE_INVESTIGATE) continue;
            const dx = g.x - player.x;
            const dy = g.y - player.y;
            if (dx * dx + dy * dy <= NOISE.walkRadius * NOISE.walkRadius && losClear(player.x, player.y, g.x, g.y)) {
              setSuspicious(g, player.x, player.y);
            }
          }
        }
      }
    }

    // Flying pebbles land, ripples fade.
    for (let i = state.flying.length - 1; i >= 0; i -= 1) {
      const f = state.flying[i];
      f.t += dt;
      if (f.t >= PEBBLE.flight) {
        landPebble(f);
        state.flying.splice(i, 1);
      }
    }
    for (let i = state.ripples.length - 1; i >= 0; i -= 1) {
      state.ripples[i].t += dt;
      if (state.ripples[i].t > PEBBLE.rippleTime) state.ripples.splice(i, 1);
    }

    // Spore pickups, then the gate.
    for (const spore of state.spores) {
      if (!spore.taken && Math.hypot(player.x - spore.x, player.y - spore.y) < PLAYER.pickup) {
        spore.taken = true;
        events |= EVENT_SPORE;
        if (audio) audio.spore();
      }
    }
    if (!state.exitOpen && state.spores.every((s) => s.taken)) {
      state.exitOpen = true;
      events |= EVENT_GATE;
      if (audio) audio.gate();
    }

    // Guards.
    for (const g of state.guards) {
      const e = updateGuard(g, dt, audio);
      events |= e;
      if (state.caught) break;
    }

    // Overall status: ALERT while any guard chases, SEEN while any guard
    // currently has eyes on the player, HIDDEN otherwise.
    let status = 'HIDDEN';
    for (const g of state.guards) {
      if (g.state === STATE_ALERT) {
        status = 'ALERT';
        break;
      }
      if (canSee(g, player.x, player.y)) status = 'SEEN';
    }
    state.status = status;
    if (audio) {
      let top = 0;
      for (const g of state.guards) top = Math.max(top, g.meter);
      audio.setDrone(top / 100);
    }

    // Reaching the open exit clears the level.
    if (state.exitOpen && pointInRect(player.x, player.y, state.level.exit.touch)) {
      state.cleared = true;
      state.clearTime = state.elapsed;
      state.rank = !state.everSuspicious && state.alerts === 0 ? 'GHOST' : state.alerts === 0 ? 'SHADOW' : 'ESCAPED';
      events |= EVENT_CLEARED;
      if (audio) audio.win();
    }
    return events;
  }

  /**
   * Stage a named screenshot scene on level 1. This only sets positions
   * through the world's own state and then lets the renderer draw it, the
   * way a photographer poses a scene: every pixel still comes from the
   * game's own code. `title` is the fresh game; `hero` is the near-miss
   * the design stages; `chase` is a guard in full pursuit; `win` is the
   * level cleared with a GHOST rank.
   */
  function stage(name) {
    reset(0);
    if (name === 'title') return;
    if (name === 'hero') {
      state.elapsed = 24;
      state.player.x = 60;
      state.player.y = 300;
      state.player.sneaking = true;
      state.spores[0].taken = true;
      state.pebblesLeft = 2;
      state.ripples.push({ x: 340, y: 380, t: 0.6 });
      const g1 = state.guards[0];
      g1.x = 400;
      g1.y = 300;
      g1.angle = Math.atan2(380 - 300, 340 - 400);
      g1.state = STATE_SUSPICIOUS;
      g1.phase = 'look';
      g1.lookTimer = 2.2;
      g1.meter = 60;
      g1.lastSeen = { x: 340, y: 380 };
      state.everSuspicious = true;
      const g2 = state.guards[1];
      g2.x = 180;
      g2.y = 260;
      g2.angle = (135 * Math.PI) / 180;
      g2.pause = 0.8;
      const g3 = state.guards[2];
      g3.x = 860;
      g3.y = 340;
      g3.angle = (270 * Math.PI) / 180;
      g3.pause = 0.8;
      state.status = 'HIDDEN';
      return;
    }
    if (name === 'chase') {
      state.elapsed = 40;
      state.player.x = 520;
      state.player.y = 440;
      state.spores[0].taken = true;
      state.pebblesLeft = 2;
      const g1 = state.guards[0];
      g1.x = 440;
      g1.y = 420;
      g1.angle = Math.atan2(440 - 420, 520 - 440);
      g1.state = STATE_ALERT;
      g1.meter = 100;
      g1.lastSeen = { x: 520, y: 440 };
      state.alerts = 1;
      state.everAlert = true;
      state.everSuspicious = true;
      state.status = 'ALERT';
      return;
    }
    if (name === 'win') {
      state.elapsed = 48;
      for (const s of state.spores) s.taken = true;
      state.exitOpen = true;
      state.player.x = 480;
      state.player.y = 60;
      state.cleared = true;
      state.clearTime = 48;
      state.rank = 'GHOST';
      return;
    }
    if (name === 'caught') {
      state.elapsed = 33;
      state.player.x = 500;
      state.player.y = 320;
      state.spores[0].taken = true;
      const g1 = state.guards[0];
      g1.x = 510;
      g1.y = 330;
      g1.state = STATE_ALERT;
      g1.meter = 100;
      state.alerts = 1;
      state.everAlert = true;
      state.caught = true;
      state.status = 'ALERT';
      return;
    }
  }

  function timeString() {
    const total = Math.floor(state.elapsed);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  reset(0);
  return { state, reset, step, stage, canSee, visionPolygon, inHedge, inLight, timeString };
}
