// Uses your own photo as a record's cover (replacing any downloaded one).
//
//   npm run cover -- inbox/2026-09-29_21-04-07-123.jpg "Fleetwood Mac" "Rumours"
//
// When you have several copies told apart by their notes, name the copy:
//
//   npm run cover -- photo.jpg "Guns N' Roses" "Appetite for Destruction" "original pressing, alternate cover"
//
// Copies the photo into covers/; commit and push to publish.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { parseCsvObjects } from "../src/csv.js";
import { coverSlug, editionCoverSlug, recordKey } from "../src/records.js";

const [photo, artist, title, edition] = process.argv.slice(2);
if (!photo || !artist || !title) {
  console.error('Usage: npm run cover -- <photo.jpg> "<artist>" "<title>" ["<notes of that copy>"]');
  process.exit(1);
}
const head = await readFile(photo).then((b) => b.subarray(0, 2), () => null);
if (!head || head[0] !== 0xff || head[1] !== 0xd8) {
  console.error(`${photo} isn't a JPEG photo.`);
  process.exit(1);
}
const { rows } = parseCsvObjects(await readFile(new URL("../data/collection.csv", import.meta.url), "utf8"));
const copies = rows.filter((r) => recordKey(r.artist, r.title) === recordKey(artist, title));
if (!copies.length) {
  console.error(`"${artist} – ${title}" isn't in data/collection.csv (check the spelling).`);
  process.exit(1);
}
let name = `${coverSlug(artist, title)}.jpg`;
if (edition) {
  const copy = copies.find((r) => recordKey("", r.notes) === recordKey("", edition));
  if (!copy) {
    console.error(`No copy with notes "${edition}". Copies: ${copies.map((r) => `"${r.notes}"`).join(", ")}`);
    process.exit(1);
  }
  name = `${editionCoverSlug(artist, title, copy.notes)}.jpg`;
} else if (copies.length > 1) {
  console.log(`Note: this is the shared cover for all ${copies.length} copies. For one copy, add its notes: ${copies.map((r) => `"${r.notes}"`).join(" or ")}.`);
}
const dir = new URL("../covers/", import.meta.url);
await mkdir(dir, { recursive: true });
await copyFile(photo, new URL(name, dir));
console.log(`Saved covers/${name}. Commit and push to publish it.`);
