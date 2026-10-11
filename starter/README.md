# Our team hub

This repository holds our team's data for [TMT: Volleyball Hub](https://github.com/KagazzIe/TMT-VolleyballHub):
our team name and roster, our rotation positions, and our tagged match clips. GitHub turns it into
our team's website automatically.

Your site's address is `https://YOUR-GITHUB-NAME.github.io/THIS-REPOSITORY-NAME/`.
You can also find it under **Settings → Pages**.

Everything in this repository is public. Anyone with the link can see the site.

## What's in here

| File | What it is | Where it comes from |
|---|---|---|
| `team.json` | Team name and player list | The hub's **Team Setup** page |
| `rotations.json` | Your rotation positions, highlights and notes | The hub's **5-1 Rotation Guide** → Edit positions → Export JSON |
| `clips/` | One file per match | The hub's **Clip Marker** → Download JSON |
| `.github/workflows/deploy.yml` | Builds your site. You don't need to touch it. | Came with this repository |

## Updating your site

Every change works the same way: download a file from your hub, then upload it here.

1. Make the change on your hub site and download the file.
2. Open this repository on GitHub. For a match file, click into the **clips** folder first.
3. Click **Add file → Upload files** and drag the file in. A file with the same name gets replaced.
4. Click **Commit changes**.

Your site updates about two minutes later. To watch, open the **Actions** tab: a yellow dot means
it's working, a green check means it's done. If the page still looks old, refresh it with
**Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac).

## Trying the newest version of the hub

Your site uses the stable version of the hub. To preview the newest one:

1. Open the **Actions** tab and click **Deploy team hub** on the left.
2. Click **Run workflow**, choose **main** under *Hub version*, and click the green **Run workflow** button.

Your next upload switches back to the stable version on its own.

## If something goes wrong

- **Red X in the Actions tab:** click it to see which step failed. The most common cause is the
  setting below.
- **The site shows this text instead of the hub:** go to **Settings → Pages** and make sure
  **Source** says **GitHub Actions**, not "Deploy from a branch". Then open **Actions → Deploy team hub →
  Run workflow** and click the green button.
- **A grey icon on the very first run:** that's expected. The first run is skipped because
  GitHub Pages isn't switched on yet at that moment.
