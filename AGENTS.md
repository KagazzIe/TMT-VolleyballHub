# Notes for coding agents

Read this before changing or adding pages. It is for agents and maintainers only: nothing links
to it and the deploy workflow leaves it out of the published site.

## What this repo is
TMT: Volleyball Hub is static HTML (no build step, no framework) published with GitHub Pages.
It holds **code only**. Team data (`team.json`, `rotations.json`, `clips/*.json`) lives in each
team's own repo and is copied to `team/` at deploy time by `.github/workflows/deploy.yml`.

- Never commit team data, player names, or a team's formations to this repo.
  Built-in defaults must be generic (for example, rotation views default to plain rotation order).
- Pages read team data with **relative** paths (`../team/...`), so a site works at any URL depth.
- Keep `rotations.json` and game JSON backward compatible. If a format changes, bump its
  `version`, keep reading older versions, and never require teams to re-export.
- Teams run `@v1` of the shared workflow. Only move the `v1` tag once `main` is tested.
- `starter/` is the content of the public team template repo (KagazzIe/TMT-VolleyballHub-team-template).
  Keep the two in sync, and keep its README readable by non-technical captains.
- Team captains are often not technical. Every data change should be "Save to GitHub" from the hub, with
  "download a file, upload it on GitHub" as the fallback: never ask them to hand-edit JSON or create
  files in `.github/`.

## Browser storage
A demo site and team sites can share one origin (`user.github.io/a/`, `user.github.io/b/`), and
`localStorage` is per origin. Key anything site-specific (drafts, tool state) by the site's base path,
for example `'name@' + new URL('../', location.href).pathname` from a page one folder deep.
Pure viewer preferences (playback speed, video size) may stay unscoped. The GitHub token for Save to GitHub
is `tmt:github@<base path>` (sessionStorage, or localStorage when "Remember" is checked). Volume is shared by the clip
pages as `tmt:volume` and `tmt:muted`.

YouTube no longer lets embeds set video quality (`setPlaybackQuality` does nothing); its automatic
quality follows the player's layout size. So the clip pages lay the iframe out at 1920x1080 and scale it
down with CSS (`.vid.hq`), which makes YouTube pick the highest quality up to 1080p (verified on a real
1080p video: 480p at normal size, 1080p this way). YouTube's own controls stay hidden (`controls: 0`);
the pages provide play, seek, speed and volume.

## Pages
| Path | File | Notes |
|---|---|---|
| `/` | `index.html` | Hub. Shows a demo note when no `team/team.json` exists. |
| `/rotations/` | `rotations/index.html` | 5-1 rotation guide and its editor (saves or exports `rotations.json`). |
| `/clips/` | `clips/index.html` | Match clip viewer. |
| `/clips/marker/` | `clips/marker/index.html` | Clip Marker, saves or exports one game JSON. |
| `/setup/` | `setup/index.html` | Team Setup, a form that saves or downloads `team.json` (`name`, `roster`, `labels`). Team `labels` set Clip Marker's play list and the viewer's filter order; without them the defaults are Serve, Receive, Set, Hit, Block. |

Each page is one self-contained HTML file with inline CSS and JS, plus the shared stylesheet. The one
shared script is `assets/github.js` (Save to GitHub), used by Team Setup, the rotation editor and Clip Marker.

## Save to GitHub (`assets/github.js`)
- `TMTGitHub.ready` resolves to `{repo}` from `team/site.json` (written by the deploy), or `null` on the demo.
  Keep Save buttons `hidden` until it resolves with a repo.
- `TMTGitHub.save({path, text, message, isSafe, conflict})` asks to connect if needed, checks the current
  file, and commits. `isSafe(remoteText)` says when replacing what's on GitHub is fine (for example the
  file this page loaded); otherwise it asks with `conflict`. Resolves `null` if the person cancels, and
  throws an Error with a plain-language message on failure.
- `TMTGitHub.status(el)` shows the "Saving to owner/repo as @name. Disconnect" line.
- The token is sent only to `api.github.com`. Pages show team data, so always escape it before putting it in
  HTML (`esc()`), since a script injected through a game file could read the token.

## Theme: always use `assets/theme.css`
Every page links the Google Fonts stylesheet and `assets/theme.css` (relative path), then its own
`<style>` block. Use the CSS variables below. **Do not hard-code colors** in pages; if a new color
is needed, add a token to `theme.css` with light and dark values.

The theme follows the device's light/dark setting. Dark mode is the navy look.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#eef1f5` | `#0f1624` | Page background |
| `--card` | `#fff` | `#18223a` | Cards, panels, inputs, dialogs |
| `--ink` | `#14213d` | `#e8edf6` | Main text |
| `--muted` | `#55607a` | `#9aa6bf` | Secondary text, labels, counts |
| `--chip` | `#dde3ec` | `#26324f` | Resting buttons, chips, tags, kbd |
| `--edge` | `#cfd7e3` | `#2e3b5c` | Hairlines, input borders, button hover |
| `--on` / `--onink` | `#14213d` / `#fff` | `#e8edf6` / `#0f1624` | Selected or primary control, and its text |
| `--accent` | `#1d6fdc` | `#5b9bff` | Focus rings, links, sliders, checkboxes |
| `--alert` | `#c0281f` | same | Rule highlights, errors |
| `--ok` | `#2a9d5c` | same | Confirmation toasts |
| `--S --OH --MB --OPP --L` | `#e63946 #1d6fdc #2a9d5c #f4a300 #7b5cd6` | same | Player roles (setter, outside, middle, opposite, libero) |

Type and shape:
- Body text: `var(--font)` (Barlow), 14 to 16px. Headings and page titles: `var(--font-display)`
  (Barlow Condensed, 700). Page title is 30px; small section labels are 13px uppercase, `--muted`,
  letter-spacing .06em.
- Radii: `var(--r)` (12px) for cards and video, `var(--r-sm)` (10px) for buttons and inputs,
  `99px` for chips.
- Shadows only on floating things (drawers, dropdowns, dialogs): `var(--shadow)`.

Components:
- **Buttons:** `--chip` background, no border, 600 weight, at least 36px tall (44px for main
  mobile controls). Hover: `--edge`. Selected or primary: `--on` background with `--onink` text.
  Disabled: 50% opacity.
- **Segmented choices** (like the rotation guide's view switch): equal-width chip buttons; the
  selected one uses `--on`. Set `aria-pressed`.
- **Inputs and selects:** `--card` background (or `--bg` when inside a card), 1px `--edge` border.
- **Cards:** `--card` background, `var(--r)` radius, no border. Selected card: inset 2px `--on` ring.
- **Page header:** no colored bar. A `.back` link ("&larr; TMT: Volleyball Hub", linking to the hub)
  above the page title, on the page background.
- **Video:** black box, `var(--r)` radius. Overlays on video can use fixed light colors.
- **Editors:** open as a right-side drawer on wide screens and a bottom sheet under 900px wide,
  like the rotation guide's editor.

## Before you finish
- Run `node tests/smoke.mjs` (setup in the README). It must pass; extend it when you add a page or
  behavior. Its sample team data is in `tests/fixtures/team` and must stay fictional.
- Check each changed page in light and dark mode (`colorScheme: 'dark'` in Playwright) and at
  390px wide. No horizontal scrolling.
- Check with and without a `team/` folder (copy a team repo's files into `team/`, it's gitignored),
  and make sure nothing team-specific shows without it.
- No console errors.
