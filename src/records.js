// Record rules shared by the app, the local server and scripts/validate.js.

export const WANT_COLUMNS = ["section", "artist", "title", "note"];
export const COLLECTION_COLUMNS = ["artist", "title", "year", "format", "label", "catalog", "condition", "notes", "added"];

// Matching key for "is this the same record?": ignores case, accents,
// punctuation, a leading "The" and & vs "and", so "Blue Öyster Cult" and
// "Blue Oyster Cult" collide, as do "Ashes & Fire" and "Ashes and Fire".
export function recordKey(artist, title) {
  const norm = (s) => String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
  return `${norm(artist)}|${norm(title)}`;
}

// Discogs exports disambiguate artists as "Nirvana (2)" or "Prince*".
function cleanArtist(name) {
  return name.replace(/\s*\(\d+\)$/, "").replace(/\*+$/, "").trim();
}

// Accepted header spellings for CSV import, including Discogs collection exports.
const ALIASES = {
  artist: ["artist", "artists", "artist name", "band"],
  title: ["title", "album", "album title", "release", "record", "name"],
  year: ["year", "released", "release year", "release date", "date"],
  format: ["format", "formats", "media"],
  label: ["label", "labels", "record label"],
  catalog: ["catalog", "catalog#", "catalog #", "catalog number", "catno", "cat no", "cat#"],
  condition: ["condition", "collection media condition", "media condition", "grade"],
  notes: ["notes", "note", "comments", "collection notes"],
  added: ["added", "date added", "acquired", "purchased"],
};

// Maps each collection field to the index of the matching import column (or -1).
export function mapColumns(columns) {
  const lower = columns.map((c) => c.trim().toLowerCase());
  return Object.fromEntries(
    Object.entries(ALIASES).map(([field, names]) => [field, lower.findIndex((c) => names.includes(c))]),
  );
}

function yearOf(value) {
  const m = String(value ?? "").match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? m[1] : "";
}

function dateOf(value) {
  const m = String(value ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeCollectionRecord(raw) {
  const rec = Object.fromEntries(COLLECTION_COLUMNS.map((c) => [c, String(raw[c] ?? "").trim()]));
  rec.artist = cleanArtist(rec.artist);
  rec.year = yearOf(rec.year);
  rec.added = dateOf(rec.added) || today();
  return rec;
}

// Turns a parsed CSV (header + rows as arrays) into collection records,
// flagging rows that are missing artist/title or already in the collection.
export function planImport(csvRows, collection) {
  const [header = [], ...rows] = csvRows;
  const map = mapColumns(header);
  if (map.artist < 0 || map.title < 0) {
    return { error: `The file needs "artist" and "title" columns. Found: ${header.join(", ") || "nothing"}.` };
  }
  const owned = new Set(collection.map((r) => recordKey(r.artist, r.title)));
  const seen = new Set();
  const fresh = [], duplicates = [], skipped = [];
  for (const row of rows) {
    const raw = Object.fromEntries(Object.entries(map).map(([f, i]) => [f, i >= 0 ? row[i] : ""]));
    const rec = normalizeCollectionRecord(raw);
    if (!rec.artist || !rec.title) { skipped.push(rec); continue; }
    const key = recordKey(rec.artist, rec.title);
    if (owned.has(key) || seen.has(key)) duplicates.push(rec);
    else { seen.add(key); fresh.push(rec); }
  }
  const mapped = Object.entries(map).filter(([, i]) => i >= 0).map(([f, i]) => `${header[i].trim()} → ${f}`);
  return { fresh, duplicates, skipped, mapped };
}

// Inserts a want next to the same artist's other titles in that section,
// otherwise at the end of the section, so the printed list stays grouped.
export function insertWant(wants, want) {
  const sameArtist = (w) => w.section === want.section && recordKey(w.artist, "") === recordKey(want.artist, "");
  let at = wants.findLastIndex(sameArtist);
  if (at < 0) at = wants.findLastIndex((w) => w.section === want.section);
  const next = wants.slice();
  next.splice(at < 0 ? next.length : at + 1, 0, want);
  return next;
}

// Problems that should block a pull request. Returns human-readable strings.
export function validateData({ wants, wantColumns, collection, collectionColumns, layout }) {
  const errors = [];
  const checkColumns = (file, got, want) => {
    if (got.join(",") !== want.join(",")) errors.push(`${file}: header must be exactly "${want.join(",")}" (found "${got.join(",")}")`);
  };
  checkColumns("wants.csv", wantColumns, WANT_COLUMNS);
  checkColumns("collection.csv", collectionColumns, COLLECTION_COLUMNS);

  const sections = new Set(layout.pages.flatMap((p) => p.sections.map((s) => s.name)));
  const wantKeys = new Map();
  wants.forEach((w, i) => {
    const line = `wants.csv line ${i + 2}`;
    if (!w.artist || !w.title) errors.push(`${line}: artist and title are required`);
    if (!sections.has(w.section)) errors.push(`${line}: section "${w.section}" is not in layout.json`);
    const key = `${w.section}|${recordKey(w.artist, w.title)}`;
    if (wantKeys.has(key)) errors.push(`${line}: duplicate of line ${wantKeys.get(key)} (${w.artist} – ${w.title})`);
    else wantKeys.set(key, i + 2);
  });

  const owned = new Map();
  collection.forEach((r, i) => {
    const line = `collection.csv line ${i + 2}`;
    if (!r.artist || !r.title) errors.push(`${line}: artist and title are required`);
    if (r.year && !/^\d{4}$/.test(r.year)) errors.push(`${line}: year "${r.year}" should be four digits`);
    if (r.added && !/^\d{4}-\d{2}-\d{2}$/.test(r.added)) errors.push(`${line}: added "${r.added}" should be YYYY-MM-DD`);
    owned.set(recordKey(r.artist, r.title), i + 2);
  });

  wants.forEach((w, i) => {
    const hit = owned.get(recordKey(w.artist, w.title));
    if (hit) errors.push(`wants.csv line ${i + 2}: ${w.artist} – ${w.title} is already owned (collection.csv line ${hit})`);
  });
  return errors;
}
