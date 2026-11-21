// GLASSWARD verification + screenshots.
// Serves game/ locally, play-tests the live game in a headless desktop
// browser (keyboard movement, pebble throw, guard vision and detection,
// spore pickup, gate opening, win and caught), checks zero non-local
// requests and zero console errors, verifies the hero shot is deterministic,
// then writes the 4 screenshots DIRECTLY into the repo's screenshots/
// directory. Run: node shots.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/makefun/tools/package.json');
const { chromium } = require('playwright-core');

const REPO = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(REPO, 'game');
const SHOTS = path.join(REPO, 'screenshots');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(GAME, p);
      if (!file.startsWith(GAME) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const state = () => page.evaluate(() => {
    const w = window.__glassward.world;
    const s = w.state;
    return {
      screen: window.__glassward.screen,
      player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
      status: s.status,
      spores: s.spores.map((x) => x.taken),
      pebbles: s.pebblesLeft,
      exitOpen: s.exitOpen,
      cleared: s.cleared,
      caught: s.caught,
      rank: s.rank,
      meters: s.guards.map((g) => Math.round(g.meter)),
      guardStates: s.guards.map((g) => g.state),
      ripples: s.ripples.length,
      elapsed: Math.round(s.elapsed * 10) / 10,
    };
  });

  // --- 1. Title loads, no errors, local only ---
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  let st = await state();
  check('title screen shows', st.screen === 0, `screen=${st.screen}`);
  check('player starts at the south entrance', st.player.x === 500 && st.player.y === 540, `(${st.player.x},${st.player.y})`);

  // --- 2. Keyboard: start, move, sneak ---
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  st = await state();
  check('Space starts level 1', st.screen === 1, `screen=${st.screen}`);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  st = await state();
  check('D moves the player east', st.player.x > 540, `x=${st.player.x}`);
  const xAfterD = st.player.x;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ShiftLeft');
  st = await state();
  check('sneak moves slower than a walk', st.player.x > xAfterD - 120 && st.player.x < xAfterD, `x=${st.player.x} (was ${xAfterD})`);

  // --- 3. Walls block movement: walk north into the exit gate ---
  await page.evaluate(() => {
    const w = window.__glassward.world;
    w.state.player.x = 480;
    w.state.player.y = 70;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  st = await state();
  check('north gate blocks the player (stops at y~53)', st.player.y >= 50 && st.player.y <= 56, `y=${st.player.y}`);

  // --- 4. Mouse: pebble throw spends a pebble and makes a ripple ---
  await page.evaluate(() => {
    const w = window.__glassward.world;
    w.state.player.x = 480;
    w.state.player.y = 540;
  });
  await page.waitForTimeout(200);
  await page.mouse.click(640, 500); // click in the courtyard, inside pebble range
  await page.waitForTimeout(600);
  st = await state();
  check('click throws a pebble (3 -> 2)', st.pebbles === 2, `pebbles=${st.pebbles}`);
  check('pebble landing leaves a ripple', st.ripples >= 1 || st.guardStates.includes(3), `ripples=${st.ripples} states=${st.guardStates}`);

  // --- 5. Vision: a guard sees the player in the open, not in a hedge ---
  const vision = await page.evaluate(() => {
    const w = window.__glassward.world;
    const out = {};
    // Guard 1 placed in the courtyard facing east, in the open.
    const g = w.state.guards[0];
    g.x = 340; g.y = 220; g.angle = 0;
    out.open = w.canSee(g, 500, 220);
    // The point (380,280) sits inside the pillar at (9,6): sight must stop there.
    out.pillar = w.canSee(g, 380, 280);
    // Guard 2 facing the west hedge alcove at 135 deg: the player crouched
    // inside it is geometrically in the cone but hidden by the hedge.
    const g2 = w.state.guards[1];
    g2.x = 180; g2.y = 260; g2.angle = (135 * Math.PI) / 180;
    out.hedge = w.canSee(g2, 60, 300);
    return out;
  });
  check('guard sees the player in the open cone', vision.open === true, JSON.stringify(vision));
  check('hedge hides the player from a far guard', vision.hedge === false, JSON.stringify(vision));
  check('pillar blocks the line of sight', vision.pillar === false, JSON.stringify(vision));

  // --- 6. Detection meter rises while seen, then the guard gives chase ---
  await page.evaluate(() => {
    const w = window.__glassward.world;
    const g = w.state.guards[0];
    // Stand the player still, in the open, inside guard 1's cone.
    w.state.player.x = g.x + Math.cos(g.angle) * 100;
    w.state.player.y = g.y + Math.sin(g.angle) * 100;
    w.state.player.sneaking = false;
  });
  await page.waitForTimeout(1500);
  st = await state();
  check('detection meter rises while seen', st.meters[0] > 20, `meters=${st.meters}`);
  await page.waitForTimeout(1500);
  st = await state();
  check('guard goes alert and chases at 100%', st.guardStates[0] === 2 && st.status === 'ALERT', `states=${st.guardStates} status=${st.status}`);
  await page.waitForTimeout(2500);
  st = await state();
  check('alert guard catches a player who stands still', st.caught === true && st.screen === 4, `caught=${st.caught} screen=${st.screen}`);

  // --- 7. Restart, collect spores, open the gate, win ---
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  st = await state();
  check('R restarts the level', st.screen === 1 && st.caught === false, `screen=${st.screen}`);
  const win = await page.evaluate(() => {
    const w = window.__glassward.world;
    const out = {};
    // Walk the player onto each spore with the world's own step.
    for (const spore of w.state.spores) {
      w.state.player.x = spore.x;
      w.state.player.y = spore.y;
      w.step(1 / 60, { dir: { x: 0, y: 0 }, sneak: false, click: null }, null);
    }
    out.spores = w.state.spores.map((s) => s.taken);
    out.exitOpen = w.state.exitOpen;
    // Then into the exit touch zone.
    w.state.player.x = 480;
    w.state.player.y = 60;
    w.step(1 / 60, { dir: { x: 0, y: 0 }, sneak: false, click: null }, null);
    out.cleared = w.state.cleared;
    out.rank = w.state.rank;
    return out;
  });
  check('both spores collected', win.spores.every(Boolean), JSON.stringify(win.spores));
  check('gate opens once all spores are taken', win.exitOpen === true);
  check('reaching the open exit clears the level', win.cleared === true, `cleared=${win.cleared}`);
  check('unseen clear earns GHOST', win.rank === 'GHOST', `rank=${win.rank}`);
  await page.waitForTimeout(300);
  st = await state();
  check('clear screen shows', st.screen === 3, `screen=${st.screen}`);

  // --- 8. Network + errors ---
  const external = requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
  check('zero non-local requests', external.length === 0, `${requests.length} total, ${external.length} external`);
  check('zero console/page errors', errors.length === 0, errors.join(' | '));

  // --- 9. Determinism: the hero shot renders byte-identical twice ---
  async function heroShot() {
    await page.goto(base + '/?shot=hero&seed=7', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 10000 });
    return page.screenshot({ type: 'jpeg', quality: 82 });
  }
  const heroA = await heroShot();
  const heroB = await heroShot();
  check('hero shot is deterministic (byte-identical)', heroA.equals(heroB), `${heroA.length} vs ${heroB.length} bytes`);

  // --- 10. Screenshots, written directly into screenshots/ ---
  async function shoot(name, query, wait) {
    await page.goto(base + query, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 10000 });
    await page.waitForTimeout(wait);
    const buf = await page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 82 });
    const st2 = fs.statSync(path.join(SHOTS, name));
    console.log(`SHOT  ${name}  ${st2.size} bytes`);
    check(`${name} under 256 KiB`, st2.size < 262144, `${st2.size} bytes`);
    return buf;
  }
  await shoot('1-hero.jpg', '/?shot=hero&seed=7', 100);
  await shoot('2-title.jpg', '/?shot=title&seed=7', 100);
  await shoot('3-chase.jpg', '/?shot=chase&seed=7', 100);
  await shoot('4-win.jpg', '/?shot=win&seed=7', 100);

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
