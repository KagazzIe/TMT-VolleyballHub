# TMT: Volleyball Hub

A small site for a 5-1 volleyball team: a rotation guide, a match clip viewer, and a clip-tagging tool. Live at https://kagazzie.github.io/TMT-VolleyballHub/

| Page | Path |
|---|---|
| Hub | `/` |
| 5-1 Rotation Guide | `/rotations/` |
| Match Clips viewer | `/clips/` |
| Clip Marker | `/clips/marker/` |

## Team data stays out of this repo
This repo holds code only. Everything about a specific team lives in a separate **private** repo
(by default `<this repo>-data`) laid out like this:

```
team.json          {"name": "...", "roster": ["...", "..."]}
rotations.json     exported from the rotation guide's Export JSON button
clips/*.json       one file per game, exported from Clip Marker
```

The deploy workflow copies that repo into `team/` and publishes it with the site.
Pushing to the data repo triggers a redeploy (see its workflow).
Once deployed, those files are reachable by anyone with the site URL; the private repo keeps them out of public code and history.

### One-time setup
1. Create the private data repo.
2. Create a fine-grained personal access token with **Contents: Read and write** on both repos.
3. Add it as an Actions secret named `TEAM_DATA_TOKEN` in **both** repos.
4. In this repo: Settings → Pages → Source: **GitHub Actions**.

### Day to day
- **New game:** export from Clip Marker, upload to `clips/` in the data repo.
- **Rotation changes:** Edit positions → Export JSON, upload as `rotations.json` in the data repo.

### Testing locally
Copy the data repo's contents into a `team/` folder here (it's gitignored), then run
`python -m http.server` and open http://localhost:8000/. Create `team/clips/index.json` listing the game files, e.g. `["2026-10-09-game-1.json"]`.

## Using this for your own team
Fork or copy this repo, create your own `<repo>-data` private repo, and follow the setup above.
Without a `TEAM_DATA_TOKEN` secret the site still deploys, just with no team data, and pages fall back to defaults.
