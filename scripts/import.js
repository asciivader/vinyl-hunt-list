// Merges a CSV of owned records into data/collection.csv and takes any
// matching titles off data/wants.csv. Needs artist and title columns; a
// Discogs collection export works as-is.
//
//   npm run import -- ~/Downloads/discogs-export.csv
//   npm run import -- records.csv --dry-run     (show what would change)

import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, parseCsvObjects, stringifyCsv } from "../src/csv.js";
import { planImport, recordKey, WANT_COLUMNS, COLLECTION_COLUMNS } from "../src/records.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const source = args.find((a) => !a.startsWith("--"));
if (!source) {
  console.error("Usage: npm run import -- <file.csv> [--dry-run]");
  process.exit(1);
}

const dataFile = (name) => new URL(`../data/${name}`, import.meta.url);
const collection = parseCsvObjects(await readFile(dataFile("collection.csv"), "utf8")).rows;
const wants = parseCsvObjects(await readFile(dataFile("wants.csv"), "utf8")).rows;

const plan = planImport(parseCsv(await readFile(source, "utf8")), collection);
if (plan.error) {
  console.error(plan.error);
  process.exit(1);
}

const incoming = new Set(plan.fresh.map((r) => recordKey(r.artist, r.title)));
const keptWants = wants.filter((w) => !incoming.has(recordKey(w.artist, w.title)));
const cleared = wants.filter((w) => incoming.has(recordKey(w.artist, w.title)));

console.log(`Columns: ${plan.mapped.join(", ")}`);
console.log(`${plan.fresh.length} new, ${plan.duplicates.length} already owned, ${plan.skipped.length} missing artist or title.`);
for (const r of plan.fresh) console.log(`  + ${r.artist} – ${r.title}${r.year ? ` (${r.year})` : ""}`);
for (const w of cleared) console.log(`  off the want list: ${w.artist} – ${w.title}`);

if (dryRun) {
  console.log("Dry run: nothing written.");
} else if (plan.fresh.length) {
  await writeFile(dataFile("collection.csv"), stringifyCsv(COLLECTION_COLUMNS, [...collection, ...plan.fresh]));
  if (cleared.length) await writeFile(dataFile("wants.csv"), stringifyCsv(WANT_COLUMNS, keptWants));
  console.log("Updated data/collection.csv" + (cleared.length ? " and data/wants.csv" : "") + ". Commit and push to publish.");
}
