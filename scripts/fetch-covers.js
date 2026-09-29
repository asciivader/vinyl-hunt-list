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

// Lucene query for a MusicBrainz release-group search.
export function searchQuery(artist, title) {
  const parts = [`releasegroup:${quote(title)}`];
  if (!NO_ARTIST.has(artist.trim().toLowerCase())) parts.push(`artist:${quote(artist)}`);
  return parts.join(" AND ");
}

// The best confident match from a search response, or null.
export function pickReleaseGroup(response) {
  const top = response?.["release-groups"]?.[0];
  return top && Number(top.score) >= MIN_SCORE ? top.id : null;
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
  const misses = await readFile(missesFile, "utf8").then(JSON.parse, () => ({}));
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
    if (await exists(new URL(`${slug}.jpg`, cacheDir))) continue;
    if (misses[slug] && !stale(misses[slug])) continue;
    todo.push({ ...r, slug });
  }

  let found = 0, missed = 0, failed = 0;
  for (const r of todo.slice(0, limit)) {
    try {
      await sleep(1100); // MusicBrainz allows one request per second
      const url = `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=3&query=${encodeURIComponent(searchQuery(r.artist, r.title))}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
      const id = pickReleaseGroup(await res.json());
      const art = id && await fetch(`https://coverartarchive.org/release-group/${id}/front-500`, { headers: { "User-Agent": USER_AGENT } });
      if (!art || !art.ok) {
        misses[r.slug] = today;
        missed++;
        console.log(`  no cover: ${r.artist} – ${r.title}`);
        continue;
      }
      await writeFile(new URL(`${r.slug}.jpg`, cacheDir), Buffer.from(await art.arrayBuffer()));
      delete misses[r.slug];
      found++;
      console.log(`  cover: ${r.artist} – ${r.title}`);
    } catch (err) {
      failed++; // network trouble: try again next run
      await sleep(3000); // back off if MusicBrainz is asking us to slow down
      console.log(`  error (will retry): ${r.artist} – ${r.title}: ${err.message}`);
    }
  }
  await writeFile(missesFile, JSON.stringify(misses, null, 1) + "\n");
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
