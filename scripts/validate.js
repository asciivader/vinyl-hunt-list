// Checks data/*.csv and data/layout.json. Runs on every pull request;
// run it yourself with `npm run validate` before committing data changes.

import { readFile } from "node:fs/promises";
import { parseCsvObjects } from "../src/csv.js";
import { validateData } from "../src/records.js";

const read = (name) => readFile(new URL(`../data/${name}`, import.meta.url), "utf8");

const wants = parseCsvObjects(await read("wants.csv"));
const collection = parseCsvObjects(await read("collection.csv"));
const layout = JSON.parse(await read("layout.json"));

const errors = validateData({
  wants: wants.rows,
  wantColumns: wants.columns,
  collection: collection.rows,
  collectionColumns: collection.columns,
  layout,
});

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${wants.rows.length} wants, ${collection.rows.length} records in the collection.`);
