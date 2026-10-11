// Page checks for TMT: Volleyball Hub.
// Serves the repo twice on one origin, like GitHub Pages does for several sites under one account:
//   /demo/  the code with no team data
//   /team/  the code plus tests/fixtures/team as its team/ folder
// Then loads every page in light and dark mode, at desktop and phone width, and checks behavior.
// Run: npm i --no-save playwright@1.56.0 && npx playwright install chromium && node tests/smoke.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'team');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  const m = p.match(/^\/(demo|team)(\/.*)?$/);
  if (!m) return null;
  let rest = m[2] || '/';
  if (rest.startsWith('/team/') || rest === '/team') {
    if (m[1] === 'demo') return null;                        // the demo has no team data
    return path.join(FIXTURE, rest.slice('/team'.length));
  }
  if (rest.startsWith('/tests/')) return null;
  return path.join(ROOT, rest);
}
const server = http.createServer((req, res) => {
  let f = resolve(req.url);
  if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
const browser = await chromium.launch();

async function open(ctx, url, where) {
  const page = await ctx.newPage();
  page.on('pageerror', e => fail(where, `page error: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) fail(where, `console error: ${m.text()}`);
  });
  // Keep the run offline and repeatable: only the local server is reachable.
  await page.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  await page.goto(url);
  await page.waitForTimeout(800);
  return page;
}

const PAGES = ['', 'rotations/', 'clips/', 'clips/marker/'];
for (const colorScheme of ['light', 'dark']) {
  for (const width of [1280, 390]) {
    for (const site of ['demo', 'team']) {
      const ctx = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
      for (const p of PAGES) {
        const where = `${site}/${p || '(hub)'} ${colorScheme} ${width}px`;
        const page = await open(ctx, `${BASE}/${site}/${p}`, where);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (over > 1) fail(where, `scrolls sideways by ${over}px`);
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const want = colorScheme === 'dark' ? 'rgb(15, 22, 36)' : 'rgb(238, 241, 245)';
        if (bg !== want) fail(where, `background is ${bg}, expected the theme's ${want}`);
        await page.close();
      }
      await ctx.close();
    }
  }
}

// Behavior checks (light, desktop)
const ctx = await browser.newContext();
const check = async (where, url, fn) => { const page = await open(ctx, BASE + url, where); try { await fn(page); } catch (e) { fail(where, e.message); } await page.close(); };
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await check('hub demo', '/demo/', async p => {
  expect(await p.isVisible('#demo'), 'demo note should show without team data');
});
await check('hub team', '/team/', async p => {
  expect(!(await p.isVisible('#demo')), 'demo note should be hidden with team data');
  expect((await p.innerText('#sub')).includes('Sample Squad'), 'team name should show');
});
await check('clips team', '/team/clips/', async p => {
  expect((await p.innerText('#sub')).includes('5 clips'), 'should load the 5 fixture clips');
  await p.click('#filters .chip[data-v="Unassigned"]');
  expect((await p.innerText('#results')).startsWith('1 of 5'), 'Unassigned should show the one untagged clip');
});
await check('clips demo', '/demo/clips/', async p => {
  expect(await p.isVisible('.empty'), 'should show the empty state');
});
await check('rotations team', '/team/rotations/', async p => {
  const s = await p.evaluate(() => ({ note: rec().note, hl: hlText(), lib: liberoFor(), draft }));
  expect(s.note === 'Sample receive note.', `note from the team file, got ${JSON.stringify(s.note)}`);
  expect(s.hl.join() === 'S behind OH1', `highlight from the team file, got ${s.hl}`);
  expect(s.lib === 'OH2', `libero override from the team file, got ${s.lib}`);
  expect(!s.draft, 'should not start with local edits');
  await p.click('#editBtn');
  expect(await p.isVisible('#editPanel'), 'editor should open');
  await p.click('#exportBtn');
  const out = JSON.parse(await p.inputValue('#expText'));
  expect(out.format === 'tmt-rotations' && out.version === 2 && out.views['rx|0'], 'export should be a v2 rotations file');
});
await check('rotations demo', '/demo/rotations/', async p => {
  const s = await p.evaluate(() => { const T = target(); pos = 0; const P = target(); pos = 1; return { same: JSON.stringify(T) === JSON.stringify(P), hl: hlText().length }; });
  expect(s.same, '5-1 view should default to plain rotation order');
  expect(s.hl === 0, 'no highlights without team data');
  // Drafts are per site: an edit on the demo must not show on the team site
  await p.click('#editBtn'); await p.fill('#noteText', 'demo only'); await p.waitForTimeout(500);
});
await check('rotations team after demo edit', '/team/rotations/', async p => {
  expect(await p.evaluate(() => !draft && rec().note === 'Sample receive note.'), 'demo edits leaked into the team site');
});
await check('marker team', '/team/clips/marker/', async p => {
  expect((await p.inputValue('#roster')) === 'Alex\nBlair\nCasey\nDrew\nEmery\nFinley', 'roster should come from team.json');
});
await check('marker demo', '/demo/clips/marker/', async p => {
  expect((await p.inputValue('#roster')).startsWith('Player 1'), 'demo roster should be generic');
});

// Starter files must stay valid
try { JSON.parse(fs.readFileSync(path.join(ROOT, 'starter', 'team.json'), 'utf8')); } catch (e) { fail('starter/team.json', e.message); }

await browser.close();
server.close();
if (failures.length) {
  console.error(`${failures.length} problem(s):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log('All page checks passed.');
