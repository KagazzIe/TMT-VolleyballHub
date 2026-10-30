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
// The deploy writes team/site.json (which repo "Save to GitHub" commits to); fake it for the team site
const SITE_JSON = JSON.stringify({ repo: 'sample-owner/sample-team' });
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/team/team/site.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(SITE_JSON); }
  let f = resolve(req.url);
  if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// Fake GitHub API: one repo, one good token. GH.files maps path -> { text, sha }.
const GOOD_TOKEN = 'github_pat_sample';
const GH = { files: {}, puts: [], n: 0 };
const b64 = t => Buffer.from(t, 'utf8').toString('base64');
async function fakeGitHub(route) {
  const req = route.request(), u = new URL(req.url());
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT' };
  const send = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.headers()['authorization'] !== 'Bearer ' + GOOD_TOKEN) return send(401, { message: 'Bad credentials' });
  if (u.pathname === '/user') return send(200, { login: 'sample-captain' });
  if (u.pathname === '/repos/sample-owner/sample-team') return send(200, { full_name: 'sample-owner/sample-team' });
  const m = u.pathname.match(/^\/repos\/sample-owner\/sample-team\/contents\/(.+)$/);
  if (!m) return send(404, { message: 'Not Found' });
  const file = decodeURIComponent(m[1]), f = GH.files[file];
  if (req.method() === 'GET') return f ? send(200, { sha: f.sha, encoding: 'base64', content: b64(f.text) }) : send(404, { message: 'Not Found' });
  const body = JSON.parse(req.postData());
  if (f && body.sha !== f.sha) return send(body.sha ? 409 : 422, { message: 'sha mismatch' });
  GH.files[file] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 'sha' + (++GH.n) };
  GH.puts.push({ file, message: body.message });
  return send(f ? 200 : 201, { content: { sha: GH.files[file].sha }, commit: { html_url: 'https://github.com/sample-owner/sample-team/commit/x' } });
}

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
    if (u.startsWith('https://api.github.com/')) return fakeGitHub(r);
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
await check('clips: games from one video sort by where they start', '/team/clips/', async p => {
  const order = await p.evaluate(() => {
    const game = (id, name, vid, start) => ({ game: { id, name, date: '2026-02-01', videoId: vid }, clips: [{ id: 'c' + id, start, end: start + 5, players: [], action: 'Serve' }] });
    ingest(game('g1', 'Match A', 'vid-one-aaa', 900)); ingest(game('g2', 'Match B', 'vid-one-aaa', 100));
    ingest(game('g3', 'Match C', 'vid-two-bbb', 50)); ingest(game('g0', 'Match 0', 'vid-two-bbb', 2000));
    const dflt = F.order;
    F.order = 'old'; sortAll(); const old = GAME_ORDER.filter(g => /^g\d$/.test(g));
    F.order = 'new'; sortAll(); const neu = GAME_ORDER.filter(g => /^g\d$/.test(g));
    return { old: old.join(), neu: neu.join(), dflt, url: (setUrl(), location.search) };
  });
  // Same video: by first clip (B before A, C before 0). Videos on the same day: by their first game name ('Match 0' < 'Match A')
  expect(order.old === 'g3,g0,g2,g1' && order.neu === 'g1,g2,g0,g3', `unexpected game order ${JSON.stringify(order)}`);
  expect(order.dflt === 'new' && !order.url.includes('order='), `newest first should be the default and need nothing in the link, got ${JSON.stringify(order)}`);
  await p.evaluate(() => { F.order = 'old'; });
  // Games sharing angles are one recording, whichever angle a game opens on. Here angle Y started 5 s
  // after X; h2 opens on Y. In X's time: h1 560, h3 1556, h2 1553 + 5 = 1558.
  const rec = await p.evaluate(() => {
    const game = (id, name, videos, start) => ({ version: 4, game: { id, name, date: '2026-02-02', videoId: videos[0].id, videos }, clips: [{ id: 'c' + id, start, end: start + 5, players: [], action: 'Serve' }] });
    const X = 'vidXXXXXXXX', Y = 'vidYYYYYYYY';
    ingest(game('h2', 'Game 2', [{ id: Y, at: 0 }, { id: X, at: -5 }], 1553));
    ingest(game('h1', 'Game 1', [{ id: X, at: 0 }, { id: Y, at: 5 }], 560));
    ingest(game('h3', 'Game 3', [{ id: X, at: 0 }, { id: Y, at: 5 }], 1556));
    sortAll(); return GAME_ORDER.filter(g => /^h\d$/.test(g)).join();
  });
  expect(rec === 'h1,h3,h2', `games sharing angles should sort by time in the recording, got ${rec}`);
});
await check('clips warm up to HD before the first clip', '/team/clips/', async p => {
  await p.evaluate(() => { window.__ytQuality = 'medium'; });
  await p.click('#list .clip'); await p.waitForTimeout(300);
  const c = await p.evaluate(() => ({ start: cur.start }));
  let s = await p.evaluate(() => { const q = __yt.players.at(-1); return { cover: !document.querySelector('.ang-warm').hidden, muted: q.muted, t: q.t }; });
  expect(s.cover && s.muted && s.t <= c.start - 1, `a player below HD should warm up before the clip, muted and covered, got ${JSON.stringify(s)}`);
  await p.evaluate(() => { __yt.players.at(-1).q = 'hd1080'; }); await p.waitForTimeout(300);
  s = await p.evaluate(() => { const q = __yt.players.at(-1); return { cover: !document.querySelector('.ang-warm').hidden, muted: q.muted, t: q.t, state: q.state }; });
  expect(!s.cover && !s.muted && s.t === c.start && s.state === 1, `once in HD it should play the clip from its start, got ${JSON.stringify(s)}`);
  // The next clip plays right away
  await p.click('#next'); await p.waitForTimeout(150);
  expect(await p.evaluate(() => document.querySelector('.ang-warm').hidden && __yt.players.at(-1).t === cur.start), 'later clips should not warm up again');
});
await check('clips: several angles of one game', '/team/clips/', async p => {
  // Angle B started 5 s after A, so at game time 100 it shows its own 95
  await p.evaluate(() => {
    ingest({ version: 4, game: { id: 'two', name: 'Two angles', date: '2026-03-01', videoId: 'angleAAAAAA',
      videos: [{ id: 'angleAAAAAA', label: 'Court', at: 0 }, { id: 'angleBBBBBB', label: 'End line', at: 5 }] },
      clips: [{ id: 'c1', start: 100, end: 110, players: [], action: 'Serve', note: '' }] });
    afterLoad(); play(CLIPS.find(c => c.key === 'two:c1'));
  });
  await p.waitForTimeout(700);
  const P = () => p.evaluate(() => stage.players().map(x => ({ id: x.id, t: x.yt.getCurrentTime(), muted: x.yt.muted, controls: x.yt.opts.playerVars.controls, x: parseFloat(x.tile.style.left), w: parseFloat(x.tile.style.width) })));
  let s = await P();
  expect(s.length === 2 && s[0].t === 100 && s[1].t === 95, `angles should line up on the game clock, got ${JSON.stringify(s)}`);
  expect(s[0].x === 0 && s[1].x > s[0].w - 1 && Math.abs(s[0].w - s[1].w) < 1, `grid should split the box side by side, got ${JSON.stringify(s)}`);
  expect(!s[0].muted && s[1].muted, 'the first angle should have the sound');
  // Click the second angle: it gets focus and the sound
  await p.locator('.ang-tile .ang-shield').nth(1).click(); await p.waitForTimeout(300);
  s = await P();
  const f = await p.evaluate(() => ({ focus: stage.focusIndex(), audio: stage.audioIndex() }));
  expect(f.focus === 1 && f.audio === 1 && s[0].muted && !s[1].muted && s[1].w > s[0].w * 2, `clicking an angle should focus it with sound, got ${JSON.stringify({ f, s })}`);
  const link = await p.evaluate(() => clipUrl('two:c1'));
  expect(link.includes('v=angleBBBBBB') && link.endsWith('&t=95s'), `YouTube link should use the angle you're hearing, got ${link}`);
  await p.click('.ang-tools [data-a="grid"]'); await p.waitForTimeout(200);
  expect(await p.evaluate(() => stage.focusIndex() === -1 && stage.audioIndex() === 1), 'All angles should go back to the grid and keep the sound choice');
  // Full screen: the sound angle alone, remade with YouTube's controls; and back
  await p.click('.ang-tools [data-a="fs"]'); await p.waitForTimeout(400);
  let fs = await p.evaluate(() => { const q = __yt.players.at(-1); return { on: stage.isFullscreen(), id: q.opts.videoId, controls: q.opts.playerVars.controls }; });
  expect(fs.on && fs.id === 'angleBBBBBB' && fs.controls === 1, `full screen should use YouTube's controls on the sound angle, got ${JSON.stringify(fs)}`);
  await p.click('.ang-tools [data-a="fs"]'); await p.waitForTimeout(400);
  fs = await p.evaluate(() => { const q = __yt.players.at(-1); return { on: stage.isFullscreen(), controls: q.opts.playerVars.controls }; });
  expect(!fs.on && fs.controls === 0, `leaving full screen should drop YouTube's controls, got ${JSON.stringify(fs)}`);
  // Copy link on a two-angle clip offers each perspective
  await p.evaluate(() => { window.__copied = []; copyText = t => { __copied.push(t); }; });
  const menuBtn = '[data-copymenu="two:c1"]';
  for (const ang of [1, 0]) {
    await p.click(menuBtn);
    const items = await p.$$eval('.copymenu button', b => b.map(x => x.textContent));
    expect(items.join() === 'Court,End line', `menu should list the angles by name, got ${items}`);
    await p.click(`.copymenu [data-ang="${ang}"]`);
  }
  const copied = await p.evaluate(() => __copied);
  expect(copied[0] === 'https://www.youtube.com/watch?v=angleBBBBBB&t=95s' && copied[1] === 'https://www.youtube.com/watch?v=angleAAAAAA&t=100s' && !(await p.isVisible('.copymenu')),
    `each angle should copy its own link at the right time, got ${JSON.stringify(copied)}`);
  expect((await p.evaluate(() => cur.key)) === 'two:c1', 'using the menu should not change the playing clip');
});
await check('marker: add, line up and reorder angles', '/team/clips/marker/', async p => {
  // Video setup is behind a button, and the empty player offers it too
  expect(!(await p.isVisible('#url')) && await p.isVisible('#vstart'), 'video setup should be tucked away, with a start button on the empty player');
  await p.click('#vstart');
  await p.fill('#url', 'https://youtu.be/angleAAAAAA'); await p.click('#load'); await p.waitForTimeout(200);
  expect(!(await p.isVisible('#vstart')), 'the start button should go once a video is loaded');
  await p.fill('#url', 'https://www.youtube.com/watch?v=angleBBBBBB'); await p.click('#addang'); await p.waitForTimeout(300);
  expect(await p.evaluate(() => stage.players().length === 2 && S.game.videos.map(v => v.id).join() === 'angleAAAAAA,angleBBBBBB'), 'Add angle should add the second video');
  await p.evaluate(() => { stage.seek(50); }); await p.click('#mark');
  await p.click('#anglist .angrow[data-i="1"] [data-n="1"]'); await p.click('#anglist .angrow[data-i="1"] [data-n="0.1"]');
  let g = await p.evaluate(() => ({ at: S.game.videos[1].at, start: S.clips[0].start }));
  expect(g.at === 1.1, `nudging should move the angle on the game clock, got ${JSON.stringify(g)}`);
  // Type an exact offset (hundredths of a second); the angle's player follows
  await p.fill('#anglist .angrow[data-i="1"] [data-f="at"]', '1.37'); await p.press('#anglist .angrow[data-i="1"] [data-f="at"]', 'Enter'); await p.waitForTimeout(400);
  g = await p.evaluate(() => ({ at: S.game.videos[1].at, start: S.clips[0].start, t: stage.players()[1].yt.getCurrentTime(), game: stage.time() }));
  expect(g.at === 1.37 && Math.abs(g.t - (g.game - 1.37)) < 0.01, `typed offset should apply exactly, got ${JSON.stringify(g)}`);
  await p.press('body', 'Escape');
  expect(!(await p.isVisible('#vpanel')), 'Esc should close video setup');
  await p.click('#vsetup');
  // Make B first: the game's clock now starts with B, and clip times move with it
  await p.click('#anglist .angrow[data-i="1"] [data-a="first"]');
  const r = await p.evaluate(() => ({ ids: S.game.videos.map(v => v.id + '@' + v.at).join(), start: S.clips[0].start, out: out() }));
  expect(r.ids === 'angleBBBBBB@0,angleAAAAAA@-1.37' && Math.abs(r.start - (g.start - 1.37)) < 0.01, `Make first should rebase the clock, got ${JSON.stringify(r)}`);
  expect(r.out.version === 4 && r.out.game.videoId === 'angleBBBBBB' && r.out.game.videos.length === 2, 'export should list the angles, first one as videoId');
  await p.evaluate(() => { localStorage.clear(); });
});
await check('clips volume and video quality', '/team/clips/', async p => {
  await p.click('#list .clip'); await p.waitForFunction(() => stage.ready() && !stage.busy()); await p.waitForTimeout(100);
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
  await p.click('#vsetup'); await p.fill('#url', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'); await p.click('#load'); await p.waitForTimeout(150);
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
  expect(out.format === 'tmt-rotations' && out.version === 3 && out.views['rx|0'], 'export should be a v3 rotations file');
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
await check('rotations libero choice, hitting views and arrows', '/team/rotations/', async p => {
  const top = () => p.evaluate(() => Math.round(document.getElementById('court').getBoundingClientRect().top + scrollY));
  const libShown = () => p.evaluate(() => getComputedStyle(document.getElementById('libWrap')).visibility === 'visible');
  const t0 = await top();
  expect(!(await libShown()), 'libero choice should be hidden while receiving');
  await p.click('#view [data-v="serving"]');
  expect(await libShown(), 'libero choice should show while serving');
  await p.click('#sys [data-s="0"]');
  expect(!(await libShown()) && await top() === t0, 'non-positional should hide the libero choice without moving the court');
  await p.click('#sys [data-s="1"]'); await p.click('#view [data-v="receive"]');
  expect(await top() === t0, 'court should not move between views');
  // Hitting views: only in the base view, and they start from the base position
  expect(!(await p.isVisible('#hit')), 'hit buttons only belong to the base view');
  await p.click('#view [data-v="base"]');
  expect(await p.isVisible('#hit'), 'hit buttons should show in the base view');
  await p.click('#hit [data-h="left"]');
  const h = await p.evaluate(() => ({ key: stateKey(), same: JSON.stringify(target()) === JSON.stringify(EDITS['bs|0|left'].pos) }));
  expect(h.key === 'dl|0|left' && h.same, `left side hit should start from base, got ${JSON.stringify(h)}`);
  // Draw an arrow: tap a player, then two points
  await p.click('#editBtn'); await p.click('#arMove'); await p.$eval('#court', e => e.scrollIntoView());
  const at = (x, y) => p.evaluate(([x, y]) => { const s = document.getElementById('court'), q = s.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(s.getScreenCTM()); return [r.x, r.y]; }, [x, y]);
  const tap = async (x, y) => { const [cx, cy] = await at(x, y); await p.mouse.click(cx, cy); };
  const oh1 = await p.evaluate(() => CUR.OH1);
  expect(await p.isDisabled('#arDone'), 'Done needs a point first');
  await tap(oh1[0], oh1[1]); await tap(150, 200); await tap(200, 150);
  await p.click('#arDone');
  // This rotation uses the team defense, so the arrow goes there, by spot (OH1 plays left front)
  const a = await p.evaluate(() => ({ arrows: (EDITS['def|dl'] || {}).arrows, own: rec().arrows, paths: document.querySelectorAll('#arw > g').length }));
  expect(a.arrows && a.arrows.length === 1 && a.arrows[0].from === 'LF' && a.arrows[0].pts.length === 2 && !a.own && a.paths === 1, `arrow should be saved to the team defense and drawn, got ${JSON.stringify(a)}`);
  await p.click('#arBall'); await tap(270, 10);
  expect(await p.isDisabled('#arDone'), 'a ball arrow needs two points');
  await p.click('#arCancel');
  // Team defense: positions set in one rotation apply to every rotation, by spot
  const t = await p.evaluate(() => {
    CUR = target(); CUR.OH1 = [100, 100]; commit();
    const set = EDITS['def|dl'] && EDITS['def|dl'].pos;
    rot = 1; render(); const r1 = target(), arrowFrom = document.querySelectorAll('#arw > g').length;
    rot = 0; render();
    return { lf: set && set.LF, oh2: r1.OH2, arrowFrom, ownBefore: !!rec().pos };
  });
  expect(JSON.stringify(t.lf) === '[100,100]' && JSON.stringify(t.oh2) === '[100,100]' && t.arrowFrom === 1 && !t.ownBefore,
    `team defense should follow each player's spot in every rotation, got ${JSON.stringify(t)}`);
  // "Change only this rotation" gives it its own copy; later drags leave the team defense alone
  await p.click('#ownPos');
  const o = await p.evaluate(() => { CUR = target(); CUR.OH1 = [120, 90]; commit(); return { own: rec().pos.OH1, team: EDITS['def|dl'].pos.LF }; });
  expect(JSON.stringify(o.own) === '[120,90]' && JSON.stringify(o.team) === '[100,100]', `rotation copy should be separate, got ${JSON.stringify(o)}`);
  expect((await p.textContent('#resetPos')) === 'Use the team defense', 'a rotation with its own positions can go back to the team defense');
  await p.click('#resetPos');
  expect(await p.evaluate(() => !rec().pos), 'Use the team defense should drop the rotation copy');
  await p.click('#exportBtn');
  const out = JSON.parse(await p.inputValue('#expText'));
  expect(out.version === 3 && out.views['def|dl'].arrows[0].from === 'LF' && out.views['def|dl'].pos.LF[0] === 100, 'export should include the team defense and its arrow');
  const bad = await p.evaluate(() => readFile({ format: 'tmt-rotations', views: { 'def|dl': { pos: { LF: [1, 2] } }, 'def|xx': { pos: {} } } }).views);
  expect(Object.keys(bad).length === 0, `incomplete team defense entries should be dropped, got ${JSON.stringify(bad)}`);
  // Reading: bad arrows are dropped, old files still load
  const r = await p.evaluate(() => readFile({ format: 'tmt-rotations', version: 3, views: { 'dr|1|mid': { arrows: [{ from: 'OH1', pts: [[10, 10]] }, { pts: [[5, 5]], dash: true }, { from: 'X', pts: [[1, 1]] }] } } }));
  expect(r.views['dr|1|mid'].arrows.length === 1, `invalid arrows should be dropped, got ${JSON.stringify(r)}`);
  await p.evaluate(() => { revert(); });
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
await check('marker auto-fills new marks', '/team/clips/marker/', async p => {
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  await p.click('#vsetup'); await p.fill('#url', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'); await p.click('#load'); await p.click('#vdone'); await p.waitForTimeout(150);
  // Built-in chain: Receive, then Set, then Hit, while marks stay in the same rally
  await p.evaluate(() => stage.seek(100)); await p.keyboard.press('m'); await p.keyboard.press('j');
  await p.keyboard.press('m'); await p.keyboard.press('m');
  await p.evaluate(() => stage.seek(300)); await p.keyboard.press('m');
  let acts = await p.evaluate(() => S.clips.map(c => c.action));
  expect(acts.join() === 'Receive,Set,Hit,', `marks should follow Receive > Set > Hit, and a new rally starts blank, got ${acts}`);
  // A default player per play, skipped when that player made the mark just before
  await p.click('#afopen');
  const off = await p.$$eval('#afbody strong', s => s.map(x => Math.round(x.nextElementSibling.getBoundingClientRect().top - x.getBoundingClientRect().top)));
  expect(off.length === 6 && new Set(off).size === 1, `each play's name and menus should share a row, got offsets ${off}`);
  await p.selectOption('#afbody [data-player="Set"]', 'Blair'); await p.click('#afx');
  await p.evaluate(() => stage.seek(500)); await p.keyboard.press('m'); await p.keyboard.press('j'); await p.keyboard.press('m');
  await p.evaluate(() => stage.seek(700)); await p.keyboard.press('m'); await p.keyboard.press('j'); await p.keyboard.press('2'); await p.keyboard.press('m');
  const c = await p.evaluate(() => S.clips.slice(4).map(c => c.action + ':' + c.players.join('+')));
  expect(c.join() === 'Receive:,Set:Blair,Receive:Blair,Set:', `the setter should be filled in unless they took the receive, got ${c}`);
  // Changing the play swaps an auto-filled player, but never one picked by hand
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('k');
  expect((await p.evaluate(() => curClip().players.join())) === 'Blair', 'picking Set should fill in the setter');
  await p.keyboard.press('l');
  expect((await p.evaluate(() => curClip().players.join())) === '', 'changing to a play with no default should clear the auto-filled setter');
  expect(!JSON.stringify(await p.evaluate(() => out())).includes('autoP'), 'auto-fill bookkeeping should stay out of the game file');
  // Suggestions from the team's games
  const L = await p.evaluate(() => {
    const cl = [];
    for (let i = 0; i < 8; i++) cl.push({ start: i * 60, action: 'Receive', players: ['Casey'] }, { start: i * 60, action: 'Set', players: [i < 6 ? 'Blair' : 'Drew'] }, { start: i * 60 + 2, action: 'Hit', players: ['Emery'] }, { start: i * 60 + 30, action: 'Serve', players: [i < 4 ? 'Alex' : 'Finley'] });
    return learn([{ clips: cl }], 10);
  });
  expect(L.next.Receive === 'Set' && L.next.Set === 'Hit' && L.player.Set === 'Blair' && L.player.Serve === '=last' && !L.next.Serve,
    `suggestions should find the chain, the setter and the repeating server, got ${JSON.stringify(L)}`);
  await p.click('#afopen');
  expect(await p.isVisible('#afsuggest'), 'Suggest should be offered on a team site with games');
  await p.click('#afx');
  await p.evaluate(() => localStorage.clear());
});

await check('setup team', '/team/setup/', async p => {
  expect((await p.inputValue('#tname')) === 'Sample Squad', 'should start from the team file');
  expect((await p.inputValue('#roster')).split('\n').length === 6, 'roster should come from the team file');
  expect((await p.inputValue('#labels')).split('\n').join() === 'Serve,Receive,Dig,Set,Hit,Block', 'labels should come from the team file');
  expect((await p.inputValue('#tags')).split('\n').join() === 'Good,Bad', 'clip tags should come from the team file');
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
  expect(out.name === 'New Team' && out.roster.join() === 'Ana,Bo,Cy' && out.labels.join() === 'Serve,Receive,Set,Hit,Block' && !('tags' in out), `unexpected team.json: ${JSON.stringify(out)}`);
  // Clip tags are optional; when given, they're saved one per line
  await p.fill('#tags', 'Good\n Bad \nGood');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#dl')]);
  const out2 = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
  expect(out2.tags && out2.tags.join() === 'Good,Bad', `tags should be saved without blanks or repeats, got ${JSON.stringify(out2)}`);
});

// Save to GitHub
const CONN = JSON.stringify({ token: GOOD_TOKEN, login: 'sample-captain', repo: 'sample-owner/sample-team' });
await check('save hidden on the demo', '/demo/setup/', async p => {
  expect(!(await p.isVisible('#gh')) && !(await p.isVisible('#ghstat')), 'Save to GitHub should not show without site.json');
  await p.goto(BASE + '/demo/rotations/'); await p.waitForTimeout(400); await p.click('#editBtn');
  expect(!(await p.isVisible('#ghSave')), 'rotation editor should not offer Save to GitHub on the demo');
  await p.goto(BASE + '/demo/clips/marker/'); await p.waitForTimeout(400);
  expect(!(await p.isVisible('#ghSave')), 'Clip Marker should not offer Save to GitHub on the demo');
});
await check('setup saves to GitHub', '/team/setup/', async p => {
  GH.files = { 'team.json': { text: fs.readFileSync(path.join(FIXTURE, 'team.json'), 'utf8'), sha: 'old' } }; GH.puts = [];
  expect(await p.isVisible('#gh'), 'Save to GitHub should show on a team site');
  await p.fill('#tname', 'Sample Squad B');
  await p.click('#gh');
  expect(await p.isVisible('.ghdlg'), 'first save should ask to connect');
  const link = await p.getAttribute('#ghlink', 'href');
  expect(link.startsWith('https://github.com/settings/personal-access-tokens/new?') && link.includes('contents=write') && link.includes('target_name=sample-owner'), `token link should be pre-filled, got ${link}`);
  await p.fill('#ghtok', 'not-a-token'); await p.click('#ghgo'); await p.waitForTimeout(200);
  expect((await p.innerText('#gherr')).includes('accept'), 'a bad token should be explained');
  await p.fill('#ghtok', GOOD_TOKEN); await p.check('#ghrem'); await p.click('#ghgo'); await p.waitForTimeout(300);
  expect(!(await p.isVisible('.ghdlg')), 'dialog should close once connected');
  expect((await p.innerText('#msg')).startsWith('Saved to GitHub'), `should confirm the save, got ${await p.innerText('#msg')}`);
  const saved = JSON.parse(GH.files['team.json'].text);
  expect(saved.name === 'Sample Squad B' && saved.roster.length === 6, `team.json on GitHub should be updated, got ${JSON.stringify(saved)}`);
  expect((await p.innerText('#ghstat')).includes('@sample-captain'), 'should show who is connected');
  // Someone else changes the file: saving again asks first, and cancelling leaves it alone
  GH.files['team.json'] = { text: '{"name":"Changed elsewhere","roster":[]}\n', sha: 'other' };
  let asked = '';
  p.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p.click('#gh'); await p.waitForTimeout(300);
  expect(asked.includes('changed on GitHub'), `should warn about a change made elsewhere, got "${asked}"`);
  expect(GH.files['team.json'].sha === 'other', 'cancelling must not overwrite');
  // Disconnect forgets the token
  await p.click('#ghstat button');
  expect(await p.evaluate(() => !TMTGitHub.connected && !localStorage.getItem('tmt:github@/team/')), 'Disconnect should forget the token');
});
await check('rotations save to GitHub', '/team/rotations/', async p => {
  GH.files = { 'rotations.json': { text: fs.readFileSync(path.join(FIXTURE, 'rotations.json'), 'utf8'), sha: 'old' } }; GH.puts = [];
  await p.evaluate(c => localStorage.setItem('tmt:github@/team/', c), CONN);
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#editBtn');
  expect(await p.isVisible('#ghSave'), 'editor should offer Save to GitHub');
  expect((await p.innerText('#ghStat')).includes('@sample-captain'), 'a remembered connection should be used');
  await p.fill('#noteText', 'Saved from the hub'); await p.waitForTimeout(500);
  await p.click('#ghSave'); await p.waitForTimeout(300);
  const saved = JSON.parse(GH.files['rotations.json'].text);
  expect(saved.format === 'tmt-rotations' && saved.views['rx|0'].note === 'Saved from the hub', 'rotations.json on GitHub should have the new note');
  const s = await p.evaluate(() => ({ draft, pending, status: document.getElementById('status').textContent }));
  expect(!s.draft && s.pending && s.status.includes('saved to GitHub'), `page should show the save is on its way, got ${JSON.stringify(s)}`);
  await p.reload(); await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ draft, pending, note: rec().note }));
  expect(!r.draft && r.pending && r.note === 'Saved from the hub', `saved positions should survive a reload until the site updates, got ${JSON.stringify(r)}`);
  await p.evaluate(() => localStorage.clear());
});
await check('marker saves a game to GitHub', '/team/clips/marker/', async p => {
  GH.files = {}; GH.puts = [];
  await p.evaluate(c => localStorage.setItem('tmt:github@/team/', c), CONN);
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#vsetup'); await p.fill('#url', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'); await p.click('#load'); await p.click('#vdone'); await p.waitForTimeout(150);
  await p.fill('#gname', 'Saved Game'); await p.fill('#gdate', '2026-02-01');
  await p.click('#mark');
  await p.click('#ghSave'); await p.waitForTimeout(300);
  const name = 'clips/2026-02-01-saved-game.json';
  expect(GH.files[name] && JSON.parse(GH.files[name].text).clips.length === 1, `game file should be in clips/, got ${Object.keys(GH.files)}`);
  // Renaming the game keeps saving to the same file
  await p.fill('#gname', 'Saved Game Renamed'); await p.click('#ghSave'); await p.waitForTimeout(300);
  expect(Object.keys(GH.files).join() === name && JSON.parse(GH.files[name].text).game.name === 'Saved Game Renamed', `renamed game should update the same file, got ${Object.keys(GH.files)}`);
  expect(GH.puts.map(x => x.message.split(' ')[0]).join() === 'Add,Update', `commit messages, got ${GH.puts.map(x => x.message)}`);
  // An expired token is forgotten, with a plain explanation
  await p.evaluate(() => localStorage.setItem('tmt:github@/team/', JSON.stringify({ token: 'expired', login: 'sample-captain', repo: 'sample-owner/sample-team' })));
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#ghSave'); await p.waitForTimeout(300);
  expect((await p.innerText('#toast')).includes('stopped working'), `expired token should be explained, got ${await p.innerText('#toast')}`);
  expect(await p.evaluate(() => !TMTGitHub.connected && !localStorage.getItem('tmt:github@/team/')), 'expired token should be forgotten');
  await p.evaluate(() => localStorage.clear());
});

// Editing a published game: viewer link -> Clip Marker -> add an angle -> save to the same file
await check('edit a team game in Clip Marker', '/team/clips/', async p => {
  await p.click('#list .clip'); await p.waitForTimeout(200);
  const href = await p.getAttribute('#now a.edit', 'href');
  expect(href === 'marker/?edit=2026-01-10-sample-game.json', `viewer should link the game to Clip Marker, got ${href}`);
  await p.evaluate(() => localStorage.setItem('tmt:github@/team/', JSON.stringify({ token: 'github_pat_sample', login: 'sample-captain', repo: 'sample-owner/sample-team' })));
  await p.goto(BASE + '/team/clips/' + href); await p.waitForTimeout(800);
  const s = await p.evaluate(() => ({ file: S.game.file, clips: S.clips.length, url: location.search, editing: document.getElementById('editing').textContent }));
  expect(s.file === 'clips/2026-01-10-sample-game.json' && s.clips === 6 && s.url === '' && s.editing.includes('clips/2026-01-10-sample-game.json'),
    `Clip Marker should open the team game for editing, got ${JSON.stringify(s)}`);
  // Add an angle and save: it updates the same file, now with two videos
  const fixture = fs.readFileSync(path.join(FIXTURE, 'clips', '2026-01-10-sample-game.json'), 'utf8');
  GH.files = { 'clips/2026-01-10-sample-game.json': { text: fixture, sha: 'old' } }; GH.puts = [];
  await p.click('#vsetup'); await p.fill('#url', 'https://youtu.be/angleBBBBBB'); await p.click('#addang'); await p.click('#vdone'); await p.waitForTimeout(200);
  await p.click('#ghSave'); await p.waitForTimeout(400);
  const saved = JSON.parse(GH.files['clips/2026-01-10-sample-game.json'].text);
  expect(Object.keys(GH.files).length === 1 && saved.version === 4 && saved.game.videos.length === 2 && saved.clips.length === 6 && GH.puts[0].message.startsWith('Update'),
    `saving should update the same team file with the new angle, got ${Object.keys(GH.files)} ${JSON.stringify(saved.game)}`);
  // The Open button lists team games
  await p.click('#open'); await p.waitForTimeout(400);
  const list = await p.$$eval('#openlist button', b => b.map(x => x.dataset.f));
  expect(list.join() === '2026-01-10-sample-game.json', `Open should list the team's games, got ${list}`);
  // Opening another game over unsaved work asks first
  await p.evaluate(() => { S.clips[0].note = 'unsaved change'; });
  let asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p.click('#openlist button'); await p.waitForTimeout(400);
  expect(asked.includes('replaces the game') && (await p.evaluate(() => S.clips[0].note)) === 'unsaved change', `should ask before replacing unsaved work, got "${asked}"`);
  await p.evaluate(() => localStorage.clear());
});

// Clip tags: picked in Clip Marker from the team's list, shown and filtered in Match Clips
await check('clip tags', '/team/clips/', async p => {
  const tagChips = await p.$$eval('#filters .chip[data-k="tags"]', b => b.map(x => x.dataset.v + ':' + x.querySelector('b').textContent));
  expect(tagChips.join() === ':6,Good:1', `Tag filter should list tags in use, got ${tagChips}`);
  await p.click('#filters .chip[data-k="tags"][data-v="Good"]');
  const r = await p.evaluate(() => ({ n: visible().length, url: location.search, card: document.querySelector('#list .clip .ctags')?.textContent }));
  expect(r.n === 1 && r.url.includes('tag=Good') && r.card === 'Good', `filtering by tag should show the tagged clip, got ${JSON.stringify(r)}`);
  await p.goto(BASE + '/team/clips/marker/?edit=2026-01-10-sample-game.json'); await p.waitForTimeout(900);
  const opts = await p.$$eval('#list .clip:nth-child(2) [data-f="addtag"] option', o => o.map(x => x.textContent));
  expect(opts.join() === 'Add tag,Good,Bad', `Clip Marker should offer only the team's tags, got ${opts}`);
  expect((await p.textContent('#list .clip:nth-child(1) .ctag')).startsWith('Good'), 'existing tags should show on the clip');
  await p.selectOption('#list .clip:nth-child(2) [data-f="addtag"]', 'Bad');
  await p.selectOption('#list .clip:nth-child(2) [data-f="addtag"]', 'Good');
  const m = await p.evaluate(() => ({ tags: S.clips[1].tags, pend: document.querySelector('#list .clip:nth-child(2) .pendtag').textContent, out: out().clips.slice(0, 3).map(c => c.tags || null) }));
  expect(m.tags.join() === 'Bad,Good' && m.pend.startsWith('Changed: tags') && JSON.stringify(m.out) === '[["Good"],["Bad","Good"],null]',
    `adding tags should change the clip and the file, got ${JSON.stringify(m)}`);
  expect(!(await p.isVisible('#list .clip:nth-child(2) [data-f="addtag"]')), 'once every team tag is on a clip there is nothing left to add');
  await p.click('#list .clip:nth-child(2) [data-a="untag"][data-t="Bad"]');
  expect((await p.evaluate(() => S.clips[1].tags.join())) === 'Good', 'removing a tag should work');
  await p.evaluate(() => localStorage.clear());
});

// Unsaved changes to a team game are highlighted until it's saved
await check('marker highlights unsaved changes', '/team/clips/marker/?edit=2026-01-10-sample-game.json', async p => {
  await p.evaluate(c => localStorage.setItem('tmt:github@/team/', c), CONN);
  await p.reload(); await p.waitForTimeout(800);
  const state = () => p.evaluate(() => ({ pend: [...document.querySelectorAll('#list .clip.pend')].map(el => el.querySelector('.pendtag').textContent),
    banner: document.getElementById('editing').textContent, bannerPend: document.getElementById('editing').classList.contains('pend') }));
  let s = await state();
  expect(!s.pend.length && !s.bannerPend && s.banner.includes('No unsaved changes'), `a freshly opened game has nothing pending, got ${JSON.stringify(s)}`);
  // Type a note on the first clip, add a clip (it sorts last), delete the second one
  await p.fill('#list .clip:nth-child(1) [data-f="note"]', 'better pass');
  await p.evaluate(() => { stage.seek(300); }); await p.click('#mark');
  await p.click('#list .clip:nth-child(2) [data-a="del"]');
  s = await state();
  expect(s.pend.length === 2 && s.pend.includes('Changed: noteUndo') && s.pend.includes('New') && s.bannerPend && s.banner.includes('1 edited, 1 new, 1 deleted'),
    `edited and new clips should be highlighted, with a summary, got ${JSON.stringify(s)}`);
  // Undo puts the clip back
  await p.click('#list .clip.pend [data-a="undo"]');
  s = await state();
  expect(s.pend.join() === 'New' && (await p.evaluate(() => S.clips[0].note)) === '', `Undo should restore the clip, got ${JSON.stringify(s)}`);
  // Saving clears the highlighting
  const fixture = fs.readFileSync(path.join(FIXTURE, 'clips', '2026-01-10-sample-game.json'), 'utf8');
  GH.files = { 'clips/2026-01-10-sample-game.json': { text: fixture, sha: 'old' } }; GH.puts = [];
  await p.click('#ghSave'); await p.waitForTimeout(400);
  s = await state();
  expect(GH.puts.length === 1 && !s.pend.length && !s.bannerPend, `saving should clear pending changes, got ${JSON.stringify(s)}`);
  await p.evaluate(() => localStorage.clear());
});

// Two people editing one game: saving over someone else's newer save asks first
await check('marker asks before overwriting changes made since opening', '/team/clips/marker/?edit=2026-01-10-sample-game.json', async p => {
  const name = 'clips/2026-01-10-sample-game.json';
  const fixture = fs.readFileSync(path.join(FIXTURE, 'clips', '2026-01-10-sample-game.json'), 'utf8');
  await p.evaluate(c => localStorage.setItem('tmt:github@/team/', c), CONN);
  await p.reload(); await p.waitForTimeout(800);
  expect(await p.evaluate(() => S.game.file === 'clips/2026-01-10-sample-game.json' && !!S.game.base), 'opening a team game should remember its version');
  // Saving twice without changes makes one commit, without asking
  GH.files = { [name]: { text: fixture, sha: 'old' } }; GH.puts = [];
  let early = ''; p.on('dialog', d => { early = early || d.message(); d.dismiss(); });
  await p.click('#ghSave'); await p.waitForTimeout(300);
  await p.click('#ghSave'); await p.waitForTimeout(300);
  p.removeAllListeners('dialog');
  const unchangedPuts = GH.puts.length;
  // Someone else adds a clip and saves first
  const theirs = JSON.parse(fixture); theirs.clips.push({ ...theirs.clips[0], id: 'theirclip', note: 'their clip' });
  const theirText = JSON.stringify(theirs, null, 2) + '\n';
  GH.files = { [name]: { text: theirText, sha: 'theirs' } };
  await p.evaluate(() => { S.clips[0].note = 'my edit'; });
  let asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p.click('#ghSave'); await p.waitForTimeout(400);
  expect(!early && unchangedPuts === 1, `saving an unchanged game again should not ask or commit, got ${unchangedPuts} commit(s), "${early}"`);
  expect(asked.includes('changed on GitHub since you opened it') && asked.includes('7 clips') && GH.files[name].text === theirText,
    `should ask before replacing a newer save and keep it on Cancel, got "${asked}"`);
  // Choosing Replace saves, and later saves (even after a reload) don't ask again
  p.once('dialog', d => d.accept());
  await p.click('#ghSave'); await p.waitForTimeout(400);
  expect(JSON.parse(GH.files[name].text).clips.some(c => c.note === 'my edit'), 'Replace should save my version');
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => { S.clips[1].note = 'second edit'; });
  asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p.click('#ghSave'); await p.waitForTimeout(400);
  expect(!asked && JSON.parse(GH.files[name].text).clips.some(c => c.note === 'second edit'), `my own last save should not count as someone else's change, got "${asked}"`);
  expect(!JSON.parse(GH.files[name].text).game.base, 'the version fingerprint should not be written into the game file');
  await p.evaluate(() => localStorage.clear());
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
