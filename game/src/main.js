// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, level cleared and caught.
//
// ?seed=N fixes the seed. ?shot=title|hero|chase|win|caught (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, LEVELS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_CLEARED } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world, scene.screen, scene.best, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startLevel(levelIndex) {
    world.reset(levelIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing ${LEVELS[levelIndex].short}. Collect every Moon-Spore, then reach the North Gate.`);
  }

  function endLevel() {
    screen = SCREEN_CLEAR;
    const time = Math.floor(world.state.clearTime);
    if (best === 0 || time < best) {
      best = time;
      saveBest(best);
    }
    announce(`Level cleared in ${world.timeString()}. Rank ${world.state.rank}.`);
  }

  function endCaught() {
    screen = SCREEN_CAUGHT;
    announce('Caught by the warden. Press R to retry.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_CAUGHT)) {
      audio.unlock();
      startLevel(world.state.levelIndex);
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_CLEAR)) {
      audio.unlock();
      if (screen === SCREEN_TITLE) startLevel(0);
      else startLevel((world.state.levelIndex + 1) % LEVELS.length);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    const click = input.takeClick();
    const mouse = input.mousePos();
    const gridClick = click ? renderer.screenToGrid(click.x, click.y) : null;
    const events = world.step(STEP, { dir: input.direction(), sneak: input.sneaking(), click: gridClick }, audio);
    if (world.state.cleared && screen === SCREEN_PLAY) endLevel();
    else if (world.state.caught && screen === SCREEN_PLAY) endCaught();
    else if (events & EVENT_CLEARED) endLevel();
    else if (events & EVENT_CAUGHT) endCaught();
    return mouse;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    let mouse = input.mousePos();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        mouse = step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const mouseGrid = screen === SCREEN_PLAY ? renderer.screenToGrid(mouse.x, mouse.y) : null;
    renderer.draw(world.state, world, screen, best, mouseGrid);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A hook for play-tests: the live world and screen, read-only from outside.
  window.__glassward = {
    world,
    get screen() {
      return screen;
    },
    get best() {
      return best;
    },
  };

  announce('Glassward. Press Space or click to enter the conservatory.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
