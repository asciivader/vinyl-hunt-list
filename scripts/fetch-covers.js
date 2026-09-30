// Downloads album covers for the collection from the Cover Art Archive
// (coverartarchive.org, looked up via MusicBrainz) into a cache folder.
// The publish workflow runs it and keeps the cache between runs, so each
// cover is fetched once. Records with their own photo in covers/ are skipped.
//
//   npm run covers                 -> .covers-cache/
//   node scripts/fetch-covers.js --cache <dir> [--limit N]

import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsvObjects } from "../src/csv.js";
import { coverSlug, editionCoverSlug, editionCoverUrl } from "../src/records.js";

const USER_AGENT = "vinyl-hunt-list/1.0 (https://github.com/asciivader/vinyl-hunt-list)";
const RETRY_MISSES_AFTER_DAYS = 30;
const MIN_SCORE = 90;
const NO_ARTIST = new Set(["soundtrack", "various artists"]);

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => `"${String(s).replace(/[\\"]/g, "\\$&")}"`;

// Bump when the matching rules change, so earlier "not found" results are
// retried with the new rules.
const MATCHER_VERSION = 3;

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
// singles, for records filed as singles, never videos), then ones first
// released in the record's year (Fleetwood Mac's 1975 album, not 1968's),
// then by search score.
export function pickReleaseGroups(response, format = "", year = "") {
  const want = /single/i.test(format) ? "Single" : "Album";
  return (response?.["release-groups"] ?? [])
    .filter((g) => Number(g.score) >= MIN_SCORE)
    .map((g, i) => {
      const type = g["primary-type"] === want ? 0 : g["primary-type"] === "Video" ? 2 : 1;
      const sameYear = year && String(g["first-release-date"] ?? "").startsWith(year) ? 0 : 1;
      return { id: g.id, rank: type * 10000 + sameYear * 1000 + i };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((g) => g.id);
}

// Each downloaded cover remembers the rules and search that found it, so it
// is fetched again when either changes (better rules, a corrected title).
const matchedWith = (artist, title) => `${MATCHER_VERSION}|${searchQueries(artist, title)[0]}`;
// A "not found" is retried early when the record's details change (a year
// filled in, or the record since added to MusicBrainz and its row touched).
// Bump MISS_RULES when what counts as "not found" changes, to retry them all.
const MISS_RULES = 2;
const missedWith = (r) => `${MISS_RULES}|${matchedWith(r.artist, r.title)}|${r.format}|${r.year}`;

// fetch, retrying a couple of times when the service says it's busy (503)
// or has a hiccup, backing off each time.
async function politeFetch(url, headers) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status < 500 || attempt === 2) return res;
    await sleep(3000 * (attempt + 1));
  }
}

async function findCover(r) {
  const tried = new Set();
  for (const query of searchQueries(r.artist, r.title)) {
    await sleep(1100); // MusicBrainz allows one request per second
    const url = `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query=${encodeURIComponent(query)}`;
    const res = await politeFetch(url, { "User-Agent": USER_AGENT, Accept: "application/json" });
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
    for (const id of pickReleaseGroups(await res.json(), r.format, r.year).slice(0, 3)) {
      if (tried.has(id)) continue;
      tried.add(id);
      const art = await politeFetch(`https://coverartarchive.org/release-group/${id}/front-500`, { "User-Agent": USER_AGENT });
      if (art.ok) return Buffer.from(await art.arrayBuffer());
      // A new upload is redirected to archive.org before its sizes exist
      // there: not "no cover", just not ready yet, so retry next publish.
      if (art.status === 404 && art.redirected) throw new Error("new cover still processing at the Cover Art Archive");
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
  const missDetails = saved.version === MATCHER_VERSION ? saved.details ?? {} : {};
  const foundFile = new URL("found.json", cacheDir);
  const foundWith = await readFile(foundFile, "utf8").then(JSON.parse, () => ({}));
  const today = new Date().toISOString().slice(0, 10);
  const stale = (date) => (Date.parse(today) - Date.parse(date)) / 864e5 >= RETRY_MISSES_AFTER_DAYS;

  const { rows } = parseCsvObjects(await readFile(new URL("../data/collection.csv", import.meta.url), "utf8"));
  // Covers picked in data/edition-covers.csv: one copy's (by its notes), or
  // with empty notes the whole record's, replacing the automatic match.
  const editions = await readFile(new URL("../data/edition-covers.csv", import.meta.url), "utf8")
    .then((text) => parseCsvObjects(text).rows, () => []);
  const picked = new Set(editions.map((e) => editionCoverSlug(e.artist, e.title, e.notes)));
  const todo = [];
  const seen = new Set();
  for (const r of rows) {
    const slug = coverSlug(r.artist, r.title);
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (picked.has(slug)) continue;
    if (await exists(new URL(`../covers/${slug}.jpg`, import.meta.url))) continue; // own photo
    if (await exists(new URL(`${slug}.jpg`, cacheDir)) && foundWith[slug] === matchedWith(r.artist, r.title)) continue;
    if (misses[slug] && !stale(misses[slug]) && missDetails[slug] === missedWith(r)) continue;
    todo.push({ ...r, slug });
  }

  let found = 0, missed = 0, failed = 0;
  const failedNames = [];
  for (const r of todo.slice(0, limit)) {
    try {
      const cover = await findCover(r);
      if (!cover) {
        await rm(new URL(`${r.slug}.jpg`, cacheDir), { force: true });
        misses[r.slug] = today;
        missDetails[r.slug] = missedWith(r);
        missed++;
        console.log(`  no cover: ${r.artist} – ${r.title}`);
        continue;
      }
      await writeFile(new URL(`${r.slug}.jpg`, cacheDir), cover);
      foundWith[r.slug] = matchedWith(r.artist, r.title);
      delete misses[r.slug];
      delete missDetails[r.slug];
      found++;
      console.log(`  cover: ${r.artist} – ${r.title}`);
    } catch (err) {
      failed++; // network trouble: try again next run
      failedNames.push(`${r.artist} – ${r.title} (${err.message})`);
      await sleep(3000); // back off if MusicBrainz is asking us to slow down
      console.log(`  error (will retry): ${r.artist} – ${r.title}: ${err.message}`);
    }
  }
  // Picked covers are fetched again when the pick changes.
  for (const e of editions) {
    const slug = editionCoverSlug(e.artist, e.title, e.notes);
    const url = editionCoverUrl(e);
    const name = `${e.artist} – ${e.title}${e.notes ? ` (${e.notes})` : ""}`;
    if (await exists(new URL(`../covers/${slug}.jpg`, import.meta.url))) continue; // own photo
    if (await exists(new URL(`${slug}.jpg`, cacheDir)) && foundWith[slug] === url) continue;
    try {
      const art = await politeFetch(url, { "User-Agent": USER_AGENT });
      if (!art.ok) throw new Error(`Cover Art Archive ${art.status}`);
      await writeFile(new URL(`${slug}.jpg`, cacheDir), Buffer.from(await art.arrayBuffer()));
      foundWith[slug] = url;
      found++;
      console.log(`  cover: ${name}`);
    } catch (err) {
      failed++;
      failedNames.push(`${name}: ${err.message}`);
      console.log(`  error (will retry): ${name}: ${err.message}`);
    }
  }

  await writeFile(missesFile, JSON.stringify({ version: MATCHER_VERSION, misses, details: missDetails }, null, 1) + "\n");
  await writeFile(foundFile, JSON.stringify(foundWith, null, 1) + "\n");
  const left = Math.max(0, todo.length - limit);
  const summary = `${found} downloaded, ${missed} not found, ${failed} errors${left ? `, ${left} left for next run` : ""}`;
  console.log(`Covers: ${summary}.`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::notice title=Covers::${summary}`);
    const names = new Map(rows.map((r) => [coverSlug(r.artist, r.title), `${r.artist} – ${r.title}`]));
    const without = Object.keys(misses).filter((slug) => names.has(slug)).map((slug) => names.get(slug)).sort();
    if (without.length) console.log(`::notice title=No cover found (photograph these)::${without.join("; ")}`);
    if (failedNames.length) console.log(`::notice title=Errors (retried next publish)::${failedNames.join("; ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
