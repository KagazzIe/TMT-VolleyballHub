# TMT: Volleyball Hub

A small site for a 5-1 volleyball team: a rotation guide, a match clip viewer, and a clip-tagging tool.
Demo (no team data): https://kagazzie.github.io/TMT-VolleyballHub/

| Page | Path |
|---|---|
| Hub | `/` |
| 5-1 Rotation Guide | `/rotations/` |
| Match Clips viewer | `/clips/` |
| Clip Marker | `/clips/marker/` |

## How it fits together
This repo holds **code only**. Each team has:

- a **private data repo** with its clips, rotation positions and roster, and
- a **public site repo** whose only file is a small workflow that calls this repo's shared
  workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

Each deploy combines this repo's code with the team's data and publishes it to the team's own
GitHub Pages at the team's own URL. Teams always run the hub version they ask for (`@v1` or `@main`),
so updates reach them on their next deploy without copying any code.

Data repo layout:

```
team.json          {"name": "...", "roster": ["...", "..."]}
rotations.json     exported from the rotation guide (Edit positions → Export JSON)
clips/*.json       one file per game, exported from Clip Marker
```

Once deployed, the data files are reachable by anyone with the site URL. The private repo keeps
them out of public code and history.

## Set up your own team
1. **Create two repos** under your account:
   - a **public** site repo, for example `volleyball-hub`. Your site will be at `https://<you>.github.io/volleyball-hub/`.
   - a **private** data repo with the same name plus `-data`, for example `volleyball-hub-data`.
     (Other names work too: set an Actions variable `TEAM_DATA_REPO` = `owner/name` in the site repo.)
2. **Site repo:** add [`starter/team-site/deploy.yml`](starter/team-site/deploy.yml) as `.github/workflows/deploy.yml`.
3. **Data repo:** add [`starter/team-data/redeploy-site.yml`](starter/team-data/redeploy-site.yml) as
   `.github/workflows/redeploy-site.yml`, and [`starter/team-data/team.json`](starter/team-data/team.json)
   with your team name and roster.
4. **Token:** GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token. Only select repositories: both of yours. Repository permissions → **Contents: Read and write**.
5. **Secrets:** in **both** repos, Settings → Secrets and variables → Actions → New repository secret,
   name `TEAM_DATA_TOKEN`, value = the token.
6. **Pages:** in the site repo, Settings → Pages → Source: **GitHub Actions**.
7. In the site repo, Actions → Deploy team hub → **Run workflow**.

After that, upload game JSONs to `clips/` and `rotations.json` to the data repo; the site redeploys on its own.
It also redeploys every Monday to pick up hub updates. GitHub pauses scheduled runs in repos with no
commits for 60 days; data uploads still redeploy with the latest hub, and you can re-enable the
schedule from the Actions tab.

## Maintaining the hub (KagazzIe)
- This repo's own site is a demo with no team data (no `TEAM_DATA_TOKEN` secret here). It uses the
  shared workflow from the current commit, so pushing to `main` shows exactly what `@main` teams will get.
- The Team of Misfit Toys runs as a normal team from its own site and data repos.
- When `main` is stable, move the `v1` tag so `@v1` teams get the update:
  ```
  git tag -f v1
  git push -f origin v1
  ```
- Keep data files backward compatible. If a change would break existing team files, convert old
  files when loading them, or start `v2` and leave `v1` alone.

## Testing locally
Copy a data repo's contents into a `team/` folder here (it's gitignored), create
`team/clips/index.json` listing the game files (e.g. `["2026-10-09-game-1.json"]`), then run
`python -m http.server` and open http://localhost:8000/.
