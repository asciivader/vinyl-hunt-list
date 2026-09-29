// Uses your own photo as a record's cover (replacing any downloaded one).
//
//   npm run cover -- inbox/2026-09-29_21-04-07-123.jpg "Fleetwood Mac" "Rumours"
//
// Copies the photo to covers/<artist>--<title>.jpg; commit and push to publish.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { parseCsvObjects } from "../src/csv.js";
import { coverSlug, recordKey } from "../src/records.js";

const [photo, artist, title] = process.argv.slice(2);
if (!photo || !artist || !title) {
  console.error('Usage: npm run cover -- <photo.jpg> "<artist>" "<title>"');
  process.exit(1);
}
const head = await readFile(photo).then((b) => b.subarray(0, 2), () => null);
if (!head || head[0] !== 0xff || head[1] !== 0xd8) {
  console.error(`${photo} isn't a JPEG photo.`);
  process.exit(1);
}
const { rows } = parseCsvObjects(await readFile(new URL("../data/collection.csv", import.meta.url), "utf8"));
if (!rows.some((r) => recordKey(r.artist, r.title) === recordKey(artist, title))) {
  console.error(`"${artist} – ${title}" isn't in data/collection.csv (check the spelling).`);
  process.exit(1);
}
const dir = new URL("../covers/", import.meta.url);
await mkdir(dir, { recursive: true });
const name = `${coverSlug(artist, title)}.jpg`;
await copyFile(photo, new URL(name, dir));
console.log(`Saved covers/${name}. Commit and push to publish it.`);
