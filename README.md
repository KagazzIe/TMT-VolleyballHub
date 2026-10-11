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
This repo holds **code only**. Each team has its **own repo** with its data and one small workflow file:

```
your-team-repo/
  .github/workflows/deploy.yml   copied from starter/deploy.yml
  team.json                      {"name": "...", "roster": ["...", "..."]}
  rotations.json                 exported from the rotation guide (Edit positions → Export JSON)
  clips/*.json                   one file per game, exported from Clip Marker
```

Each deploy combines this repo's code with the team's files and publishes to the team's own
GitHub Pages at the team's own URL. Teams run the hub version they choose (`@v1` or `@main`),
so updates reach them on their next deploy without copying any code.

The team repo must be public for free GitHub Pages, so anyone who finds the team's repo or site can
see its data. Nothing in the hub links to team sites.

## Set up your own team
1. **Create a public repo**, for example `volleyball`. Your site will be at `https://<you>.github.io/volleyball/`.
2. Add [`starter/deploy.yml`](starter/deploy.yml) as `.github/workflows/deploy.yml`.
3. Add [`starter/team.json`](starter/team.json) with your team name and roster.
4. **Settings → Pages → Source: GitHub Actions.**
5. **Actions → Deploy team hub → Run workflow.**

After that, each upload to the repo redeploys the site.

### Updating your data from the browser
You can try all of this on the demo site first. Edits stay in your browser until you publish them.

- **Rotations:** open the rotation guide → **Edit positions**. For each rotation and view you can drag players,
  choose who the libero replaces, add highlights (like "S behind OH1") and write a note.
  Then **Export JSON → Download rotations.json**.
- **Games:** tag a match in Clip Marker and export the game JSON.
- **Publish:** in your team repo on GitHub, **Add file → Upload files**, drop in `rotations.json`
  (replacing the old one) or the game file inside `clips/`, then **Commit changes**.
  The site updates in a minute or two. It also redeploys every Monday to pick up hub updates (GitHub pauses
scheduled runs in repos with no commits for 60 days; re-enable from the Actions tab).

### Optional: keep data in a separate private repo
This keeps the data off GitHub's repo pages, though the deployed site still serves it.
1. Create a private data repo with the files above, plus
   [`starter/private-data/redeploy-site.yml`](starter/private-data/redeploy-site.yml) as `.github/workflows/redeploy-site.yml`.
   Name it `<site repo>-data`, or set an Actions variable `SITE_REPO` = `owner/name` in it.
2. In the site repo, set an Actions variable `TEAM_DATA_REPO` = `owner/data-repo`.
3. Create a fine-grained token (Developer settings → Fine-grained tokens) for both repos with
   **Contents: Read and write**, and save it as the secret `TEAM_DATA_TOKEN` in both.

## Maintaining the hub (KagazzIe)
- This repo's own site is a demo with no team data. It uses the shared workflow from the current
  commit, so pushing to `main` shows exactly what `@main` teams will get.
- The Team of Misfit Toys runs as a normal team from its own repo.
- When `main` is stable, move the `v1` tag so `@v1` teams get the update:
  ```
  git tag -f v1
  git push -f origin v1
  ```
- Keep data files backward compatible. If a change would break existing team files, convert old
  files when loading them, or start `v2` and leave `v1` alone.

## Testing locally
Copy a team repo's data files into a `team/` folder here (it's gitignored), create
`team/clips/index.json` listing the game files (e.g. `["2026-10-09-game-1.json"]`), then run
`python -m http.server` and open http://localhost:8000/.
