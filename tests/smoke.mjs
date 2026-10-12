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
  const ytStub = fs.readFileSync(path.join(FIXTURE, '..', 'yt-stub.js'), 'utf8');
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (u.startsWith('https://www.youtube.com/iframe_api')) return r.fulfill({ contentType: 'text/javascript', body: ytStub });
    return r.abort();
  });
  await page.goto(url);
  await page.waitForTimeout(800);
  return page;
}

const PAGES = ['', 'rotations/', 'clips/', 'clips/marker/', 'setup/'];
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
const ctx = await browser.newContext({ acceptDownloads: true });
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
  expect((await p.innerText('#sub')).includes('6 clips'), 'should load the 6 fixture clips');
  const plays = await p.$$eval('#filters .chip[data-k="actions"]', b => b.map(x => x.dataset.v).filter(Boolean));
  expect(plays.join() === 'Serve,Receive,Dig,Hit,Block', `play filters should follow the team's label order (only plays that have clips), got ${plays}`);
  await p.click('#filters .chip[data-v="Unassigned"]');
  expect((await p.innerText('#results')).startsWith('1 of 6'), 'Unassigned should show the one untagged clip');
});
await check('clips volume and video quality', '/team/clips/', async p => {
  await p.click('#list .clip'); await p.waitForTimeout(150);
  const yt = () => p.evaluate(() => { const q = __yt.players.at(-1); return { vol: q.vol, muted: q.muted, controls: q.opts.playerVars.controls }; });
  let s = await yt();
  expect(s.controls === 0 && s.vol === 100 && !s.muted, `player should start without YouTube's controls at full volume, got ${JSON.stringify(s)}`);
  const f = await p.evaluate(() => { const fr = document.querySelector('.vid iframe'), r = fr.getBoundingClientRect(), box = document.querySelector('.vid').getBoundingClientRect(); return { w: fr.offsetWidth, h: fr.offsetHeight, shownW: Math.round(r.width), boxW: Math.round(box.width) }; });
  expect(f.w === 1920 && f.h === 1080 && Math.abs(f.shownW - f.boxW) <= 1, `player should be laid out at 1920x1080 and scaled to the box, got ${JSON.stringify(f)}`);
  await p.$eval('#vol', el => { el.value = 30; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  s = await yt(); expect(s.vol === 30 && !s.muted, `volume slider should set 30, got ${JSON.stringify(s)}`);
  await p.click('#mute'); s = await yt(); expect(s.muted, 'mute button should mute');
  await p.click('#mute'); s = await yt(); expect(!s.muted && s.vol === 30, 'second click should unmute at the same volume');
});
await check('marker shares volume and uses the full-HD player', '/team/clips/marker/', async p => {
  expect((await p.inputValue('#vol')) === '30', 'volume from the clips page should carry over');
  await p.fill('#url', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'); await p.click('#load'); await p.waitForTimeout(150);
  const s = await p.evaluate(() => { const q = __yt.players.at(-1), fr = document.querySelector('.vid iframe'); return { controls: q.opts.playerVars.controls, vol: q.vol, w: fr.offsetWidth }; });
  expect(s.controls === 0 && s.vol === 30 && s.w === 1920, `marker player should be full-HD layout at the saved volume, got ${JSON.stringify(s)}`);
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
  // Libero and the server: by default the libero never replaces the server, but a team can choose it
  const lib = await p.evaluate(() => {
    rot = 2; view = 'serving'; lib = 'left'; render();
    const before = liberoFor();
    edit = true; render();
    const opts = [...document.querySelectorAll('#libSel option')].map(o => o.textContent);
    const sel = document.getElementById('libSel'); sel.value = 'MB2'; sel.onchange({ target: sel });
    const after = liberoFor(), head = document.getElementById('head').textContent;
    sel.value = 'none'; sel.onchange({ target: sel }); edit = false; rot = 0; view = 'receive'; render();
    return { before, opts, after, head };
  });
  expect(lib.before === null, `R3 serving should default to the libero being out, got ${lib.before}`);
  expect(lib.opts.includes('MB2 (serving)'), `the server should be an option, got ${lib.opts}`);
  expect(lib.after === 'MB2' && lib.head.includes('Libero replaces MB2'), `choosing the server should work, got ${JSON.stringify(lib)}`);
  // Drafts are per site: an edit on the demo must not show on the team site
  await p.click('#editBtn'); await p.fill('#noteText', 'demo only'); await p.waitForTimeout(500);
});
await check('rotations team after demo edit', '/team/rotations/', async p => {
  expect(await p.evaluate(() => !draft && rec().note === 'Sample receive note.'), 'demo edits leaked into the team site');
});
await check('marker team', '/team/clips/marker/', async p => {
  expect((await p.inputValue('#roster')) === 'Alex\nBlair\nCasey\nDrew\nEmery\nFinley', 'roster should come from team.json');
  const acts = await p.evaluate(() => ACTIONS.map(a => a.join('=')));
  expect(acts.join() === 'n=Serve,j=Receive,h=Dig,k=Set,l=Hit,;=Block', `play labels and keys from team.json, got ${acts}`);
  await p.click('#hkopen');
  expect(await p.isVisible('#hkteam') && !(await p.isVisible('#hkunlock')), 'label list should be locked to Team Setup on a team site');
});
await check('marker demo', '/demo/clips/marker/', async p => {
  expect((await p.inputValue('#roster')).startsWith('Player 1'), 'demo roster should be generic');
  expect(await p.evaluate(() => ACTIONS.map(a => a[1]).join()) === 'Serve,Receive,Set,Hit,Block', 'demo should use the default labels');
  await p.click('#hkopen');
  expect(await p.isVisible('#hkunlock'), 'demo can still edit its own label list');
});

await check('setup team', '/team/setup/', async p => {
  expect((await p.inputValue('#tname')) === 'Sample Squad', 'should start from the team file');
  expect((await p.inputValue('#roster')).split('\n').length === 6, 'roster should come from the team file');
  expect((await p.inputValue('#labels')).split('\n').join() === 'Serve,Receive,Dig,Set,Hit,Block', 'labels should come from the team file');
});
await check('setup demo', '/demo/setup/', async p => {
  expect((await p.inputValue('#tname')) === '', 'demo should start empty');
  await p.click('#dl');
  expect((await p.innerText('#msg')).includes('team name'), 'should ask for a team name');
  await p.fill('#tname', '  New Team ');
  await p.fill('#roster', 'Ana\n\n Bo \nAna\nCy');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl')]);
  expect(dl.suggestedFilename() === 'team.json', 'file should be named team.json');
  const out = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(out.name === 'New Team' && out.roster.join() === 'Ana,Bo,Cy' && out.labels.join() === 'Serve,Receive,Set,Hit,Block', `unexpected team.json: ${JSON.stringify(out)}`);
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
