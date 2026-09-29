// Downloads album covers for the collection from the Cover Art Archive
// (coverartarchive.org, looked up via MusicBrainz) into a cache folder.
// The publish workflow runs it and keeps the cache between runs, so each
// cover is fetched once. Records with their own photo in covers/ are skipped.
//
//   npm run covers                 -> .covers-cache/
//   node scripts/fetch-covers.js --cache <dir> [--limit N]

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsvObjects } from "../src/csv.js";
import { coverSlug } from "../src/records.js";

const USER_AGENT = "vinyl-hunt-list/1.0 (https://github.com/asciivader/vinyl-hunt-list)";
const RETRY_MISSES_AFTER_DAYS = 30;
const MIN_SCORE = 90;
const NO_ARTIST = new Set(["soundtrack", "various artists"]);

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => `"${String(s).replace(/[\\"]/g, "\\$&")}"`;

// Bump when the matching rules change, so earlier "not found" results are
// retried with the new rules.
const MATCHER_VERSION = 2;

// MusicBrainz searches to try, most exact first: the full title as a
// phrase, the title without (…) or […] asides ("Weezer (Blue Album)" is
// "Weezer" there), then the title's words in any order ("Greatest Hits
// Volume 2" vs "Greatest Hits, Vol. 2").
export function searchQueries(artist, title) {
  const name = artist.trim().toLowerCase();
  // Soundtracks are filed under the artist "Soundtrack": search soundtrack
  // releases only, or "Flashdance" finds the single instead of the album.
  const who = name === "soundtrack" ? " AND secondarytype:soundtrack"
    : NO_ARTIST.has(name) ? "" : ` AND artist:${quote(artist)}`;
  const bare = title.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
  const words = bare.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const aside = title.match(/[([]([^)\]]+)[)\]]/)?.[1].trim();
  const queries = [`releasegroup:${quote(title)}${who}`];
  // MusicBrainz tells same-named albums apart with a note, e.g. Weezer's
  // "Weezer" albums are noted "Green Album", "Blue Album"...
  if (aside && bare) queries.push(`releasegroup:${quote(bare)} AND comment:${quote(aside)}${who}`);
  if (bare && bare !== title) queries.push(`releasegroup:${quote(bare)}${who}`);
  if (words.length > 1) queries.push(`releasegroup:(${words.join(" ")})${who}`);
  return queries;
}

// Confident matches from a search response, best first: albums first (or
// singles, for records filed as singles), then by search score.
export function pickReleaseGroups(response, format = "") {
  const want = /single/i.test(format) ? "Single" : "Album";
  return (response?.["release-groups"] ?? [])
    .filter((g) => Number(g.score) >= MIN_SCORE)
    .map((g, i) => ({ id: g.id, rank: (g["primary-type"] === want ? 0 : 1) * 1000 + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((g) => g.id);
}

// The search a downloaded cover was found with, so a cover is fetched again
// when its record's search changes (a better rule, or a corrected title).
// Covers from before this was recorded used the plain first search, except
// that titles with a (…) note were matched without it and may show a
// same-named album (Weezer's Green Album art for the Blue Album), so those
// are fetched again.
function legacyQuery(artist, title) {
  if (/[([]/.test(title)) return null;
  const who = NO_ARTIST.has(artist.trim().toLowerCase()) ? "" : ` AND artist:${quote(artist)}`;
  return `releasegroup:${quote(title)}${who}`;
}

async function findCover(r) {
  const tried = new Set();
  for (const query of searchQueries(r.artist, r.title)) {
    await sleep(1100); // MusicBrainz allows one request per second
    const url = `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
    for (const id of pickReleaseGroups(await res.json(), r.format).slice(0, 3)) {
      if (tried.has(id)) continue;
      tried.add(id);
      const art = await fetch(`https://coverartarchive.org/release-group/${id}/front-500`, { headers: { "User-Agent": USER_AGENT } });
      if (art.ok) return Buffer.from(await art.arrayBuffer());
      if (art.status !== 404) throw new Error(`Cover Art Archive ${art.status}`);
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const cacheDir = pathToFileURL(resolve(opt("--cache", ".covers-cache")) + "/");
  const limit = Number(opt("--limit", 500));
  await mkdir(cacheDir, { recursive: true });

  const missesFile = new URL("misses.json", cacheDir);
  const saved = await readFile(missesFile, "utf8").then(JSON.parse, () => ({}));
  const misses = saved.version === MATCHER_VERSION ? saved.misses : {};
  const foundFile = new URL("found.json", cacheDir);
  const foundWith = await readFile(foundFile, "utf8").then(JSON.parse, () => ({}));
  const today = new Date().toISOString().slice(0, 10);
  const stale = (date) => (Date.parse(today) - Date.parse(date)) / 864e5 >= RETRY_MISSES_AFTER_DAYS;

  const { rows } = parseCsvObjects(await readFile(new URL("../data/collection.csv", import.meta.url), "utf8"));
  const todo = [];
  const seen = new Set();
  for (const r of rows) {
    const slug = coverSlug(r.artist, r.title);
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (await exists(new URL(`../covers/${slug}.jpg`, import.meta.url))) continue; // own photo
    const query = searchQueries(r.artist, r.title)[0];
    if (await exists(new URL(`${slug}.jpg`, cacheDir)) && (foundWith[slug] ?? legacyQuery(r.artist, r.title)) === query) continue;
    if (misses[slug] && !stale(misses[slug])) continue;
    todo.push({ ...r, slug });
  }

  let found = 0, missed = 0, failed = 0;
  for (const r of todo.slice(0, limit)) {
    try {
      const cover = await findCover(r);
      if (!cover) {
        misses[r.slug] = today;
        missed++;
        console.log(`  no cover: ${r.artist} – ${r.title}`);
        continue;
      }
      await writeFile(new URL(`${r.slug}.jpg`, cacheDir), cover);
      foundWith[r.slug] = searchQueries(r.artist, r.title)[0];
      delete misses[r.slug];
      found++;
      console.log(`  cover: ${r.artist} – ${r.title}`);
    } catch (err) {
      failed++; // network trouble: try again next run
      await sleep(3000); // back off if MusicBrainz is asking us to slow down
      console.log(`  error (will retry): ${r.artist} – ${r.title}: ${err.message}`);
    }
  }
  await writeFile(missesFile, JSON.stringify({ version: MATCHER_VERSION, misses }, null, 1) + "\n");
  await writeFile(foundFile, JSON.stringify(foundWith, null, 1) + "\n");
  const left = Math.max(0, todo.length - limit);
  const summary = `${found} downloaded, ${missed} not found, ${failed} errors${left ? `, ${left} left for next run` : ""}`;
  console.log(`Covers: ${summary}.`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::notice title=Covers::${summary}`);
    const names = new Map(rows.map((r) => [coverSlug(r.artist, r.title), `${r.artist} – ${r.title}`]));
    const without = Object.keys(misses).filter((slug) => names.has(slug)).map((slug) => names.get(slug)).sort();
    if (without.length) console.log(`::notice title=No cover found (photograph these)::${without.join("; ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
