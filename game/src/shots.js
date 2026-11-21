// The screenshot scenes behind ?shot=title|hero|chase|win. Each one stages a
// named moment through the world's own stage() and returns the screen to draw
// over it, so the frame is a real render of the game's own code and the same
// seed always gives the same frame. The cover is the hero: the near-miss the
// design stages, player hidden in the west hedge while a lantern cone sweeps
// past and a pebble ripple holds a guard's attention.

import { SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/**
 * Stage the named scene on `world` and return the screen to draw over it
 * and the best clear time to show. Any other name is the title screen.
 */
export function stageShot(name, world) {
  if (name === 'hero') {
    world.stage('hero');
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    world.stage('chase');
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    world.stage('win');
    return { screen: SCREEN_CLEAR, best: 48 };
  }
  if (name === 'caught') {
    world.stage('caught');
    return { screen: SCREEN_CAUGHT, best: 0 };
  }
  world.stage('title');
  return { screen: SCREEN_TITLE, best: 0 };
}

export const SHOT_NAMES = ['title', 'hero', 'chase', 'win'];
