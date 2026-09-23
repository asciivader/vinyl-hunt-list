# Vinyl hunt list

My record collection, the records I'm hunting for, and a printable one-sheet
hunt list to take to the shops.

**Live site:** https://asciivader.github.io/vinyl-hunt-list/

- **Want list:** searchable, grouped by genre section.
- **Collection:** everything I already own, sortable and searchable.
- **Print sheet:** the want list on one US letter sheet, front and back, with a
  checkbox on each side of every title (left: found / bought, right: seen but
  passed).

## Editing (owner)

```sh
npm start        # http://localhost:4321 (needs Node 20+; nothing to install)
```

Run locally, the site switches to editing mode:

- **Add to want list** or **Add record** for single entries.
- **Import CSV** to bulk-add to the collection. It needs `artist` and `title`
  columns; a Discogs collection export works as-is. Records already owned are
  skipped.
- **Got it** on a want moves it to the collection. Adding or importing a record
  also takes it off the want list.

Changes save to `data/wants.csv` and `data/collection.csv`. Commit and push
to publish them. You can also just ask Claude Code to make the change.

## Suggesting records (everyone else)

Open this repo in [Claude Code](https://claude.com/claude-code) and ask it
for what you want, e.g. *"add Big Star's #1 Record to the 70s rock section"*.
It follows [CLAUDE.md](CLAUDE.md): it creates a branch, edits the data,
runs the checks, and opens a pull request for me to review. You can also
edit `data/wants.csv` by hand and open a pull request yourself.

## Layout

| Path | What |
| --- | --- |
| `data/` | The data: `wants.csv`, `collection.csv`, `layout.json` (print placement) |
| `index.html`, `print.html`, `src/` | The site: plain HTML/CSS/JS, no build step |
| `server.js` | Local editing server |
| `scripts/validate.js`, `test/` | Data checks and unit tests (`npm run validate`, `npm test`) |
