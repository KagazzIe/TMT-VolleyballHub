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

## Pages
| Path | File | Notes |
|---|---|---|
| `/` | `index.html` | Hub. Shows a demo note when no `team/team.json` exists. |
| `/rotations/` | `rotations/index.html` | 5-1 rotation guide and its editor (exports `rotations.json`). |
| `/clips/` | `clips/index.html` | Match clip viewer. |
| `/clips/marker/` | `clips/marker/index.html` | Clip Marker, exports one game JSON. |

Each page is one self-contained HTML file with inline CSS and JS, plus the shared stylesheet.

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
- Check each changed page in light and dark mode (`colorScheme: 'dark'` in Playwright) and at
  390px wide. No horizontal scrolling.
- Check with and without a `team/` folder (copy a team repo's files into `team/`, it's gitignored),
  and make sure nothing team-specific shows without it.
- No console errors.
