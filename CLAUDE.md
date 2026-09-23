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
  summary, then run it without `--dry-run`. If the records are ones the owner
  already had (their existing collection, a Discogs export), add `--undated`
  so none of them count as "picked up recently". If it's unclear whether a
  file is a new haul or existing records, ask.
- "Here are records I already own" (listed in chat, not bought just now):
  add them to `collection.csv` with `added` left empty.

"Picked up recently" is not a note: the site shows that label on every
collection record with the newest `added` date, so it moves to each new batch
by itself. Never type it into `notes`, and leave `added` empty for records
whose purchase date isn't known. `notes` is only for facts about the record
itself (number of copies, which edition).

Edit the CSVs directly and keep them valid CSV (quote fields containing
commas or quotes). Don't reorder or reformat rows you aren't changing, so
diffs stay reviewable.

## Who changes this repo

- **The owner (asciivader)** changes anything, including the lists.
- **Invited collaborators** propose design and code changes through pull
  requests. The owner reviews and merges every one; `main` is protected.
- **Everyone else** can't change it. Pull requests from forks are closed
  automatically (`.github/workflows/close-outside-prs.yml`). To make your own
  version, fork it and change `data/` in the fork (see "Make your own" in
  README.md).

### Working as a collaborator

1. Start from an up-to-date `main` and create a branch named for the change,
   e.g. `design/bigger-album-cards`. Never push to `main`.
2. Don't touch anything in `data/`. The lists are the owner's alone, and the
   `lists-owner-only` check fails any collaborator pull request that changes them.
3. Keep the site view-only: no forms, buttons or code that change data.
4. Keep the look working in light and dark mode and on a phone (~390px wide),
   and keep `print.html` to exactly two pages (see below).
5. Run `npm test` and `npm run validate`, then commit and push the branch.
6. Open a pull request into `main` that says in plain words what changes on
   the page and why, so the owner can review it without reading code. A
   preview of the site with the change is published automatically at
   `previews/pr-<N>/` and linked in a comment; point the owner to it.

When working for the owner, run `npm run validate` and `npm test` before
committing; both must pass. The `Check data` workflow runs them on every push
and pull request.

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
- `scripts/build-site.sh` assembles `_site/` for GitHub Pages: main at the root,
  open pull requests at `previews/pr-<N>/` (run by `.github/workflows/pages.yml`).
- `server.js` — `npm start` is a view-only local preview on http://localhost:4321.
- `npm test` runs unit tests in `test/`; `npm run validate` checks the data.
