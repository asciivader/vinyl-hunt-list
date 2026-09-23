// Loading and saving the data files. Saving only works when the site is
// served by server.js (npm start); the published site is read-only.

import { parseCsvObjects, stringifyCsv } from "./csv.js";
import { WANT_COLUMNS, COLLECTION_COLUMNS } from "./records.js";

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.text();
}

export async function loadData() {
  const [wants, collection, layout] = await Promise.all([
    fetchText("data/wants.csv").then(parseCsvObjects),
    fetchText("data/collection.csv").then(parseCsvObjects),
    fetchText("data/layout.json").then(JSON.parse),
  ]);
  return { wants: wants.rows, collection: collection.rows, layout };
}

export async function isEditable() {
  try {
    const res = await fetch("api/status", { cache: "no-store" });
    return res.ok && (await res.json()).editable === true;
  } catch {
    return false;
  }
}

const COLUMNS = { "wants.csv": WANT_COLUMNS, "collection.csv": COLLECTION_COLUMNS };

export async function saveData(name, rows) {
  const res = await fetch(`api/data/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "text/csv" },
    body: stringifyCsv(COLUMNS[name], rows),
  });
  if (!res.ok) throw new Error(`Saving ${name} failed: ${await res.text()}`);
}

// Wants grouped for display: pages -> sections -> artists -> titles, in file
// order. Sections missing from layout.json go at the end of the last page.
export function groupWants(wants, layout) {
  const bySection = new Map();
  for (const w of wants) {
    if (!bySection.has(w.section)) bySection.set(w.section, new Map());
    const artists = bySection.get(w.section);
    if (!artists.has(w.artist)) artists.set(w.artist, []);
    artists.get(w.artist).push(w);
  }
  const placed = new Set();
  const pages = layout.pages.map((page) => ({
    ...page,
    sections: page.sections.map((s) => {
      placed.add(s.name);
      return { ...s, artists: [...(bySection.get(s.name) ?? new Map())] };
    }),
  }));
  const unplaced = [...bySection].filter(([name]) => !placed.has(name));
  if (unplaced.length && pages.length) {
    pages.at(-1).sections.push(...unplaced.map(([name, artists]) => ({ name, gap: true, artists: [...artists] })));
  }
  return { pages, unplaced: unplaced.map(([name]) => name) };
}
