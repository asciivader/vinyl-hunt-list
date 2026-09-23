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
- **Only people with write access to this repo** (me, plus anyone I add as a
  collaborator) can change the lists.
- **Anyone else**, if the repo is public, can only *suggest* a change by opening
  a pull request, and nothing changes until I merge it. Their Claude Code
  follows [CLAUDE.md](CLAUDE.md) to do this properly.

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
