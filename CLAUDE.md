# Vinyl hunt list

A record collection and want list for asciivader. The data lives in plain CSV
files in this repo; a static, view-only site (published on GitHub Pages)
displays it, and a one-page printable "hunt sheet" is generated from the want
list. The site must never gain a way to edit data: every change goes through
the files in `data/` and git.

## Data files — the source of truth

- `data/wants.csv` — records being hunted. Columns: `section,artist,title,note`.
  - `section` must be one of the section names in `data/layout.json`.
  - Row order is display and print order. Keep all of an artist's titles on
    adjacent rows inside their section; add a new artist at the end of its section.
  - `note` is optional and short (a year, "double LP", "1976 original"). It
    must fit on one line of the printed sheet: aim for under ~25 characters.
- `data/collection.csv` — records already owned. Columns:
  `artist,title,year,format,label,catalog,condition,notes,added`.
  `year` is four digits or empty; `added` is `YYYY-MM-DD`.
- `data/layout.json` — which sections go on which printed page, and where a
  section starts a new column (`newColumn`) or gets extra space above (`gap`).

A record must never be in both files: when something is bought, remove it
from `wants.csv` and add it to `collection.csv`. Record matching ignores case,
accents, punctuation, a leading "The" and `&` vs "and" (see `recordKey` in
`src/records.js`).

Common owner requests:
- "I bought X": remove X from `wants.csv`, add it to `collection.csv` with
  `added` set to today and `format` LP unless told otherwise.
- "Import this CSV": `npm run import -- <file> --dry-run`, show the owner the
  summary, then run it without `--dry-run`.

Edit the CSVs directly and keep them valid CSV (quote fields containing
commas or quotes). Don't reorder or reformat rows you aren't changing, so
diffs stay reviewable.

## Proposing changes (contributors)

Changes go through pull requests that the owner reviews. If you are not the owner:

1. Work on a new branch (fork the repo first if you can't push to it).
2. Change only what was asked, usually `data/wants.csv`. Suggest additions to
   the want list; don't edit `collection.csv` unless the owner asked you to.
3. Run `npm run validate` and `npm test`; both must pass.
4. Open a pull request that lists each record added or removed and why
   (e.g. "suggested by Sam: has Big Star's best songs").

The `Check data` workflow runs the same checks on every pull request.

## The printed sheet

`print.html` must stay exactly two letter pages (one sheet, front and back).
Each page has two columns; anything that doesn't fit is clipped, and the page
shows a warning banner on screen. After adding more than a few wants, open
`print.html` in the local preview (`npm start`) and check for the banner. If a page overflows,
rebalance by moving sections between pages in `layout.json`, shortening
notes, or ask the owner what to cut. Don't shrink the type.

## Code

- No build step and no dependencies. Plain ES modules in `src/`, served as-is.
- `src/csv.js` CSV parsing, `src/records.js` matching/import/validation rules
  (shared by browser and scripts), `src/data.js` loading, `src/app.js` the
  viewer, `src/print.js` the printed sheet.
- `scripts/import.js` merges an owned-records CSV (`npm run import`).
- `server.js` — `npm start` is a view-only local preview on http://localhost:4321.
- `npm test` runs unit tests in `test/`; `npm run validate` checks the data.
