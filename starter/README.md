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
| `team.json` | Team name, player list and play labels (Serve, Receive, your own…) | The hub's **Team Setup** page |
| `rotations.json` | Your rotation positions, highlights and notes | The hub's **5-1 Rotation Guide** → Edit positions → Save to GitHub (or Export JSON) |
| `clips/` | One file per match | The hub's **Clip Marker** → Save to GitHub (or Download JSON) |
| `.github/workflows/deploy.yml` | Builds your site. You don't need to touch it. | Came with this repository |

## Updating your site

### The quick way: Save to GitHub

Team Setup, the rotation guide's editor and Clip Marker each have a **Save to GitHub** button.
It saves the file straight into this repository, so you don't have to download and upload anything.

The first time you click it, your hub asks you to connect:

1. Click **Open GitHub's new token page**. GitHub opens a form with most of it filled in.
2. Under **Repository access**, choose **Only select repositories** and pick this repository.
3. Click **Generate token**, copy the token, paste it into your hub, and click **Connect**.

That's it. Your hub remembers the token until you close the tab, or on this device if you check
**Remember on this device** (leave that off on shared computers). The token can only change files in
this repository, and it expires after a year. To stop using it, click **Disconnect** under the Save
button, or delete it on GitHub under **Settings → Developer settings → Personal access tokens**.

Only this repository's owner can make the token, unless the repository belongs to a GitHub
organization. Anyone else can still use the upload way below.

### The upload way

Download a file from your hub, then upload it here.

1. Make the change on your hub site and download the file.
2. Open this repository on GitHub. For a match file, click into the **clips** folder first.
3. Click **Add file → Upload files** and drag the file in. A file with the same name gets replaced.
4. Click **Commit changes**.

Your site updates about two minutes later. To watch, open the **Actions** tab: a yellow dot means
it's working, a green check means it's done. If the page still looks old, refresh it with
**Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac).

## If something goes wrong

- **Red X in the Actions tab:** click it to see which step failed. The most common cause is the
  setting below.
- **The site shows this text instead of the hub:** go to **Settings → Pages** and make sure
  **Source** says **GitHub Actions**, not "Deploy from a branch". Then open **Actions → Deploy team hub →
  Run workflow** and click the green button.
- **Save to GitHub says the token can't see or change this repository:** make a new token on GitHub's
  token page, and make sure you pick this repository under **Repository access**.
- **A grey icon on the very first run:** that's expected. The first run is skipped because
  GitHub Pages isn't switched on yet at that moment.
