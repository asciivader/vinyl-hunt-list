// Want list + collection viewer. View-only by design: the lists change only
// through data/*.csv in the GitHub repo (see README.md).

import { loadData, groupWants } from "./data.js";

// On GitHub Pages (<user>.github.io/<repo>/) link to the repo the site was
// built from, so copies of this project link to themselves.
const REPO_URL = (() => {
  const user = location.hostname.match(/^([\w-]+)\.github\.io$/)?.[1];
  const repo = location.pathname.split("/")[1];
  return user && repo ? `https://github.com/${user}/${repo}` : "https://github.com/asciivader/vinyl-hunt-list";
})();

const state = {
  wants: [],
  collection: [],
  layout: { pages: [] },
  updated: "",
  section: "",
  wantQuery: "",
  ownedQuery: "",
  sort: { key: "artist", dir: "asc" },
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? "").toLowerCase().includes(q));
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- Want list ---------- */

function renderChips() {
  const names = state.layout.pages.flatMap((p) => p.sections.map((s) => s.name));
  const counts = new Map();
  for (const w of state.wants) counts.set(w.section, (counts.get(w.section) ?? 0) + 1);
  const chip = (value, label) => el("button", {
    type: "button",
    class: "chip",
    "aria-pressed": String(state.section === value),
    onclick: () => { state.section = value; renderWants(); },
  }, label);
  $("#section-chips").replaceChildren(
    chip("", `All (${state.wants.length})`),
    ...names.filter((n) => counts.get(n)).map((n) => chip(n, `${n} (${counts.get(n)})`)),
  );
}

function renderWants() {
  renderChips();
  const { pages } = groupWants(state.wants, state.layout);
  const out = [];
  for (const section of pages.flatMap((p) => p.sections)) {
    if (state.section && section.name !== state.section) continue;
    const cards = [];
    let shown = 0;
    for (const [artist, titles] of section.artists) {
      const hits = titles.filter((t) => matches(state.wantQuery, artist, t.title, t.note));
      if (!hits.length) continue;
      shown += hits.length;
      cards.push(el("article", { class: "artist" },
        el("h3", {}, artist),
        el("ul", { class: "titles" }, hits.map((t) => el("li", {},
          el("span", { class: "name" }, t.title, t.note && el("span", { class: "note" }, t.note)),
        ))),
      ));
    }
    if (!cards.length) continue;
    out.push(
      el("h2", { class: "section-bar" }, el("span", {}, section.name), el("span", {}, plural(shown, "title"))),
      el("div", { class: "artists" }, cards),
    );
  }
  $("#want-list").replaceChildren(...(out.length ? out : [el("p", { class: "empty" },
    state.wants.length ? "Nothing matches that search." : "The want list is empty.")]));
}

/* ---------- Collection ---------- */

// Sorting: artists ignore a leading "The", empty values always go last, and
// ties fall back to artist, then year, then title, so sorting by artist lists
// each artist's records in release order.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const sortValue = (r, key) => (key === "artist" ? r.artist.replace(/^the\s+/i, "") : String(r[key] ?? ""));

function compareBy(a, b, key, dir = "asc") {
  const x = sortValue(a, key), y = sortValue(b, key);
  if (!x !== !y) return x ? -1 : 1;
  return collator.compare(x, y) * (dir === "asc" ? 1 : -1);
}

function compareRecords(a, b, { key, dir }) {
  for (const [k, d] of [[key, dir], ["artist"], ["year"], ["title"]]) {
    const c = compareBy(a, b, k, d);
    if (c) return c;
  }
  return 0;
}

function renderCollection() {
  const { key, dir } = state.sort;
  const rows = state.collection
    .filter((r) => matches(state.ownedQuery, r.artist, r.title, r.label, r.notes, r.year, r.catalog))
    .sort((a, b) => compareRecords(a, b, state.sort));

  $$("th button[data-sort]").forEach((b) => {
    if (b.dataset.sort === key) b.dataset.dir = dir; else delete b.dataset.dir;
  });
  const select = $("#owned-sort");
  const option = `${key}:${dir}`;
  select.value = [...select.options].some((o) => o.value === option) ? option : "";

  // The newest batch of additions (latest `added` date) is labelled
  // "picked up recently"; the label moves on when a later batch arrives.
  const latest = state.collection.reduce((max, r) => (r.added > max ? r.added : max), "");

  const body = rows.map((r) => el("tr", {},
    el("td", { class: "artist-cell" }, r.artist),
    el("td", {}, r.title),
    el("td", { class: "muted" }, r.year),
    el("td", { class: "muted" }, r.format),
    el("td", { class: "muted" }, [r.label, r.catalog].filter(Boolean).join(" · ")),
    el("td", { class: "muted" },
      latest && r.added === latest && el("span", { class: "recent" }, "picked up recently"),
      [r.condition, r.notes].filter(Boolean).join(" · ") || null),
    el("td", { class: "muted date" }, r.added),
  ));
  $("#owned-rows").replaceChildren(...(body.length ? body : [el("tr", {}, el("td", { colspan: 7, class: "empty" },
    state.collection.length ? "Nothing matches that search." : "No records yet."))]));
}

/* ---------- Shell ---------- */

function render() {
  const wanted = state.wants.length, owned = state.collection.length;
  $("#stats").textContent = `${plural(wanted, "record")} wanted · ${owned} owned`;
  $("#want-count").textContent = wanted;
  $("#owned-count").textContent = owned;
  const updated = state.updated && new Date(state.updated);
  $("#updated").textContent = updated && !isNaN(updated)
    ? `Updated ${updated.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
    : "";
  $("#footer").replaceChildren(
    "Suggestions welcome: just let me know. ",
    el("a", { href: REPO_URL }, "Source on GitHub"),
  );
  renderWants();
  renderCollection();
}

function showView() {
  const view = location.hash === "#collection" ? "collection" : "wants";
  $("#wants-view").hidden = view !== "wants";
  $("#collection-view").hidden = view !== "collection";
  $$(".tabs a").forEach((a) => {
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

$("#want-search").addEventListener("input", (e) => { state.wantQuery = e.target.value; renderWants(); });
$("#owned-search").addEventListener("input", (e) => { state.ownedQuery = e.target.value; renderCollection(); });
$$("th button[data-sort]").forEach((b) => b.addEventListener("click", () => {
  const key = b.dataset.sort;
  state.sort = { key, dir: state.sort.key === key && state.sort.dir === "asc" ? "desc" : "asc" };
  renderCollection();
}));
$("#owned-sort").addEventListener("change", (e) => {
  if (!e.target.value) return;
  const [key, dir] = e.target.value.split(":");
  state.sort = { key, dir };
  renderCollection();
});
window.addEventListener("hashchange", showView);
showView();

try {
  Object.assign(state, await loadData());
  render();
} catch (err) {
  $("#want-list").replaceChildren(el("p", { class: "empty" }, `Couldn't load the list: ${err.message}`));
}
