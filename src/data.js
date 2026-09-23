// Loads the data files the site displays. The site never writes them; they
// change only through the GitHub repo.

import { parseCsvObjects } from "./csv.js";

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`);
  return res.text();
}

// data/updated.txt is written at publish time (see .github/workflows/pages.yml)
// and holds the date of the last commit that touched data/.
async function fetchUpdated() {
  try {
    return (await fetchText("data/updated.txt")).trim();
  } catch {
    return "";
  }
}

export async function loadData() {
  const [wants, collection, layout, updated] = await Promise.all([
    fetchText("data/wants.csv").then(parseCsvObjects),
    fetchText("data/collection.csv").then(parseCsvObjects),
    fetchText("data/layout.json").then(JSON.parse),
    fetchUpdated(),
  ]);
  return { wants: wants.rows, collection: collection.rows, layout, updated };
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
