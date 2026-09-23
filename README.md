# Vinyl hunt list

My record collection, the records I'm hunting for, and a printable one-sheet
hunt list to take to the shops.

**Site:** https://asciivader.github.io/vinyl-hunt-list/ (once GitHub Pages is
turned on; see [Publishing](#publishing))

- **Want list:** searchable, grouped by genre section.
- **Collection:** everything I already own, sortable and searchable.
- **Print sheet:** the want list on one US letter sheet, front and back, with a
  checkbox on each side of every title (left: found / bought, right: seen but
  passed).

The site is **view-only**. Nothing on it can change the lists, so it's safe to
share the link with anyone. The lists live in this repo, and the site
rebuilds from them whenever they change on GitHub.

## Updating the lists

All the data is in three files in `data/`:

| File | What |
| --- | --- |
| `wants.csv` | The hunt list: `section,artist,title,note` |
| `collection.csv` | What I own: `artist,title,year,format,label,catalog,condition,notes,added` |
| `layout.json` | Which genre sections go on which printed page and column |

Any of these gets a change onto the site:

- **Ask Claude Code**, e.g. *"I bought Rocks and Get Your Wings"* or *"add Big
  Star's #1 Record to classic rock"*. It edits the files, runs the checks and
  commits.
- **Edit on github.com:** open the file, click the pencil, change it, commit.
  Or use **Add file → Upload files** to replace a CSV with a new version.
- **Import a CSV** of records I own (a Discogs collection export works as-is):

  ```sh
  npm run import -- ~/Downloads/discogs-export.csv --dry-run   # preview
  npm run import -- ~/Downloads/discogs-export.csv             # merge it in
  ```

  New records are added to `collection.csv`, ones already there are skipped,
  and anything now owned comes off `wants.csv`. Then commit and push.

Every change to `main` is checked (`npm run validate`) and then published.

## Who can change what

- **Anyone with the link** can view the site, and nothing more.
- **Only I change the lists.** A check fails any pull request from someone
  else that touches `data/`.
- **Collaborators I invite** can propose design changes on their own branches
  as pull requests. Nothing reaches `main` (and so the site) until I approve
  and merge it.
- **Pull requests from anyone else are closed automatically.** Anyone is
  welcome to copy the whole thing and make their own; see below.

## Working on the design together

For invited collaborators, using [Claude Code](https://claude.ai/code):

1. Accept the GitHub invite to this repo.
2. In Claude Code, connect GitHub and start a session on
   `asciivader/vinyl-hunt-list`.
3. Describe the change you want, e.g. *"make the album cards look like record
   sleeves"*. Claude works on its own branch and follows [CLAUDE.md](CLAUDE.md).
4. When you like it, ask Claude to open a pull request. I review and merge it,
   and the site updates a minute later.

## Make your own

Want your own version? It's free and needs nothing installed.

1. **Fork** this repo on GitHub (button at the top right).
2. In your fork, replace `data/wants.csv` and `data/collection.csv` with your
   records (edit them on github.com, or upload your own CSVs with the same
   column headers). Adjust the genre sections in `data/layout.json` to match.
3. Follow [Publishing](#publishing) in your fork. Your site appears at
   `https://<your-username>.github.io/<repo-name>/`.

Changes in your fork never affect this one.

## Previewing locally

```sh
npm start        # http://localhost:4321 (Node 20+, nothing to install)
```

Shows the site exactly as published, using the files on disk.

## Publishing

The site is published free with GitHub Pages. One-time setup in the repo on github.com:

1. **Settings → General → Change visibility → Public.** A free account needs this for Pages.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Actions → Publish site → Run workflow.** After that it republishes on every push to `main`.

## Layout

| Path | What |
| --- | --- |
| `data/` | The data files above |
| `index.html`, `print.html`, `src/` | The site: plain HTML/CSS/JS, no build step |
| `scripts/import.js` | CSV import (`npm run import`) |
| `scripts/validate.js`, `test/` | Data checks and unit tests (`npm run validate`, `npm test`) |
| `server.js` | Local preview (`npm start`) |
