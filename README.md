# TMT: Volleyball Hub

A small site for a 5-1 volleyball team: a rotation guide, a match clip viewer, and a clip-tagging tool.
Demo (no team data): https://kagazzie.github.io/TMT-VolleyballHub/

| Page | Path |
|---|---|
| Hub | `/` |
| 5-1 Rotation Guide | `/rotations/` |
| Match Clips viewer | `/clips/` |
| Clip Marker | `/clips/marker/` |
| Team Setup | `/setup/` |

## Set up your own team

About 10 minutes. No coding or downloads needed, just a web browser and a free GitHub account.
GitHub hosts your team's site for free.

### 1. Copy the team template
1. Sign in to [GitHub](https://github.com), or [create a free account](https://github.com/signup).
2. Open the [team template](https://github.com/KagazzIe/TMT-VolleyballHub-team-template) and click the
   green **Use this template** button, then **Create a new repository**.
3. Give it a short name, like `volleyball`. It becomes part of your site's address.
4. Choose **Public**, then click **Create repository**.

### 2. Turn on your website
1. In your new repository, click **Settings** (along the top), then **Pages** (on the left).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

### 3. Add your team name and players
1. Open the hub's [Team Setup page](https://kagazzie.github.io/TMT-VolleyballHub/setup/), fill it in,
   and click **Download team.json**.
2. Back in your repository, click the **Code** tab, then **Add file → Upload files**.
3. Drag in `team.json` and click **Commit changes**.

That upload also builds your site for the first time.

### 4. Open your site
1. Click the **Actions** tab. After about two minutes you'll see a green check.
2. Go to **Settings → Pages**. It shows **Your site is live at** and a link, which will be something like
   `https://your-name.github.io/volleyball/`. Bookmark it and share it with your team.

Your repository's front page has the rest: how to add matches and rotations, and what to do if
something goes wrong.

**Good to know:** your site and repository are public. Anyone with the link can see them, but nothing
on this hub links to your team.

## Updating your team's data
Every change works the same way: make it on your hub site, download the file, and upload it to your
repository (**Add file → Upload files → Commit changes**). The site updates about two minutes later.

| To change | Use | Upload |
|---|---|---|
| Team name, players or play labels | **Team Setup** | `team.json` |
| Rotation positions, highlights and notes | **5-1 Rotation Guide → Edit positions → Export JSON** | `rotations.json` |
| Add a match | **Clip Marker → Download JSON** | the game file, into the `clips` folder |

You can try the rotation editor and Clip Marker on the [demo site](https://kagazzie.github.io/TMT-VolleyballHub/)
first. Nothing changes on any team's site until a file is uploaded.

**Trying the newest version:** your site uses the stable version of the hub. To preview the newest one,
open **Actions → Deploy team hub → Run workflow**, choose **main** as the hub version, and click
**Run workflow**. Your next upload switches back. To stay on the newest version, add an Actions
variable `HUB_VERSION` = `main`.

## How it works (for developers)
This repo holds **code only**. Each team has its **own repo** with its data and one small workflow file:

```
your-team-repo/
  .github/workflows/deploy.yml   from the team template (source: starter/deploy.yml)
  team.json                      {"name": "...", "roster": [...], "labels": [...]} from Team Setup
  rotations.json                 exported from the rotation guide
  clips/*.json                   one file per game, exported from Clip Marker
```

Each deploy combines this repo's code with the team's files and publishes to the team's own
GitHub Pages at the team's own URL. Teams run the hub version they choose (`@v1` or `@main`),
so updates reach them on their next deploy without copying any code. The team repo is public
(free GitHub Pages needs that). Nothing in the hub links to team sites. Pushing to a team repo
redeploys it, and it also redeploys every Monday to pick up hub updates (GitHub pauses scheduled
runs in repos with no commits for 60 days).

The team template repo is a copy of `starter/`. When `starter/` changes, copy it there too.

### Optional: keep data in a separate private repo (advanced)
This keeps the data off GitHub's repo pages, though the deployed site still serves it.
1. Create a private data repo with the data files above, plus
   [`starter/private-data/redeploy-site.yml`](starter/private-data/redeploy-site.yml) as `.github/workflows/redeploy-site.yml`.
   Name it `<site repo>-data`, or set an Actions variable `SITE_REPO` = `owner/name` in it.
2. In the site repo, set an Actions variable `TEAM_DATA_REPO` = `owner/data-repo`.
3. Create a fine-grained token (Developer settings → Fine-grained tokens) for both repos with
   **Contents: Read and write**, and save it as the secret `TEAM_DATA_TOKEN` in both.

## Contributing
Changes go through pull requests into `main`. Every pull request runs **Page checks**
(`.github/workflows/check.yml`), which loads each page with and without team data, in light and dark
mode, at desktop and phone width, and fails on errors, sideways scrolling or broken behavior.
Run the same checks locally:

```
npm install --no-save playwright@1.56.0
npx playwright install chromium
node tests/smoke.mjs
```

Design and data rules for new pages are in [`AGENTS.md`](AGENTS.md).

## Maintaining the hub (KagazzIe)
- Repo rules live in `.github/rulesets/`: `main` needs a reviewed pull request with passing Page checks,
  and only admins can create, move or delete `v*` tags. Import them under
  **Settings → Rules → Rulesets → New ruleset → Import a ruleset**. Admins can bypass both.
- To test a change on the team site before releasing it, run the team's deploy with **Hub version: main**.
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
`python -m http.server` and open http://localhost:8000/. Or copy `tests/fixtures/team` to `team/`
for sample data.

## License
[MIT](LICENSE).
