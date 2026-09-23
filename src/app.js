// Want list + collection manager. Read-only on the published site; when
// served by server.js (npm start) every change is saved to data/*.csv.

import { parseCsv } from "./csv.js";
import { recordKey, planImport, insertWant, normalizeCollectionRecord, today } from "./records.js";
import { loadData, saveData, isEditable, groupWants } from "./data.js";

const REPO_URL = "https://github.com/asciivader/vinyl-hunt-list";

const state = {
  wants: [],
  collection: [],
  layout: { pages: [] },
  editable: false,
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
    else if (k === "dataset") Object.assign(node.dataset, v);
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

/* ---------- Toasts ---------- */

let toastTimer;
function toast(message, { error = false, undo } = {}) {
  $(".toast")?.remove();
  clearTimeout(toastTimer);
  const node = el("div", { class: `toast${error ? " error" : ""}`, role: "status" }, message);
  if (undo) {
    node.append(" ", el("button", {
      type: "button",
      class: "icon-btn",
      style: "margin-left:8px;background:transparent;color:inherit;border-color:currentColor",
      onclick: () => { node.remove(); undo(); },
    }, "Undo"));
  }
  document.body.append(node);
  toastTimer = setTimeout(() => node.remove(), undo ? 7000 : 4000);
}

/* ---------- Saving ---------- */

// Applies a change, re-renders, and writes the touched files; the
// confirmation toast offers Undo, which restores the previous lists.
async function commit(next, message) {
  const before = { wants: state.wants, collection: state.collection };
  const files = [];
  if (next.wants && next.wants !== state.wants) { state.wants = next.wants; files.push("wants.csv"); }
  if (next.collection && next.collection !== state.collection) { state.collection = next.collection; files.push("collection.csv"); }
  render();
  try {
    await Promise.all(files.map((f) => saveData(f, f === "wants.csv" ? state.wants : state.collection)));
    toast(message, { undo: () => commit(before, "Undone.") });
  } catch (err) {
    toast(`${err.message}. Reloading from disk.`, { error: true });
    Object.assign(state, await loadData());
    render();
  }
}

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
  const index = new Map(state.wants.map((w, i) => [w, i]));
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
          state.editable && el("span", { class: "row-actions" },
            el("button", { type: "button", class: "icon-btn got", title: "Found it: move to collection", onclick: () => gotIt(index.get(t)) }, "Got it"),
            el("button", { type: "button", class: "icon-btn remove", title: "Remove from want list", "aria-label": `Remove ${t.title}`, onclick: () => removeWant(index.get(t)) }, "✕"),
          ),
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

function gotIt(i) {
  const want = state.wants[i];
  const record = normalizeCollectionRecord({ artist: want.artist, title: want.title, format: "LP", added: today() });
  commit({
    wants: state.wants.filter((_, j) => j !== i),
    collection: [...state.collection, record],
  }, `Moved ${want.title} to your collection.`);
}

function removeWant(i) {
  const want = state.wants[i];
  commit({ wants: state.wants.filter((_, j) => j !== i) }, `Removed ${want.title} from the want list.`);
}

/* ---------- Collection ---------- */

function renderCollection() {
  const { key, dir } = state.sort;
  const rows = state.collection
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => matches(state.ownedQuery, r.artist, r.title, r.label, r.notes, r.year, r.catalog))
    .sort((a, b) => {
      const cmp = String(a.r[key]).localeCompare(String(b.r[key]), undefined, { numeric: true, sensitivity: "base" })
        || a.r.artist.localeCompare(b.r.artist) || a.r.title.localeCompare(b.r.title);
      return dir === "asc" ? cmp : -cmp;
    });

  $$("th button[data-sort]").forEach((b) => {
    if (b.dataset.sort === key) b.dataset.dir = dir; else delete b.dataset.dir;
  });

  const body = rows.map(({ r, i }) => el("tr", {},
    el("td", { class: "artist-cell" }, r.artist),
    el("td", {}, r.title),
    el("td", { class: "muted" }, r.year),
    el("td", { class: "muted" }, r.format),
    el("td", { class: "muted" }, [r.label, r.catalog].filter(Boolean).join(" · ")),
    el("td", { class: "muted" }, [r.condition, r.notes].filter(Boolean).join(" · ")),
    el("td", { class: "muted date" }, r.added),
    state.editable && el("td", { class: "actions" },
      el("button", { type: "button", class: "icon-btn remove", "aria-label": `Remove ${r.title}`, onclick: () => removeOwned(i) }, "✕")),
  ));
  const cols = state.editable ? 8 : 7;
  $("#owned-rows").replaceChildren(...(body.length ? body : [el("tr", {}, el("td", { colspan: cols, class: "empty" },
    state.collection.length ? "Nothing matches that search." : "No records yet. Add one or import a CSV."))]));
}

function removeOwned(i) {
  const rec = state.collection[i];
  commit({ collection: state.collection.filter((_, j) => j !== i) }, `Removed ${rec.title} from your collection.`);
}

// Adding records you own also clears them off the want list.
function addToCollection(records, message) {
  const owned = new Set(records.map((r) => recordKey(r.artist, r.title)));
  const wants = state.wants.filter((w) => !owned.has(recordKey(w.artist, w.title)));
  const cleared = state.wants.length - wants.length;
  commit(
    { collection: [...state.collection, ...records], wants: cleared ? wants : state.wants },
    cleared ? `${message} ${plural(cleared, "title")} came off the want list.` : message,
  );
}

/* ---------- Dialogs ---------- */

function openDialog(id) {
  const dialog = document.getElementById(id);
  const form = $("form", dialog);
  form.reset();
  $$("[data-dup], [data-want-match]", form).forEach((n) => { n.hidden = true; });
  if (id === "want-dialog") {
    const select = form.elements.section;
    const names = state.layout.pages.flatMap((p) => p.sections.map((s) => s.name));
    select.replaceChildren(...names.map((n) => el("option", { value: n }, n)));
    if (state.section) select.value = state.section;
  }
  if (id === "owned-dialog") form.elements.added.value = today();
  if (id === "import-dialog") resetImport();
  dialog.showModal();
  $("input:not([type=hidden]):not([hidden]), select", form)?.focus();
}

function dupCheck(form) {
  const { artist, title } = form.elements;
  const key = recordKey(artist.value, title.value);
  const owned = state.collection.find((r) => recordKey(r.artist, r.title) === key);
  const wanted = state.wants.find((w) => recordKey(w.artist, w.title) === key);
  const dup = $("[data-dup]", form);
  const filled = artist.value.trim() && title.value.trim();
  dup.hidden = !filled || !(owned || (form.id === "want-form" && wanted));
  dup.textContent = owned ? "You already own this one." : "This is already on the want list.";
  const hint = $("[data-want-match]", form);
  if (hint) {
    hint.hidden = !filled || !wanted || !!owned;
    hint.textContent = "It's on your want list; adding it here will take it off.";
  }
}

function wireDialogs() {
  $$("[data-open]").forEach((b) => b.addEventListener("click", () => openDialog(b.dataset.open)));

  for (const form of [$("#want-form"), $("#owned-form")]) {
    form.addEventListener("input", () => dupCheck(form));
  }

  $("#want-form").addEventListener("submit", (e) => {
    if (e.submitter?.value !== "save") return;
    const f = e.target.elements;
    const want = { section: f.section.value, artist: f.artist.value.trim(), title: f.title.value.trim(), note: f.note.value.trim() };
    const key = recordKey(want.artist, want.title);
    if (state.collection.some((r) => recordKey(r.artist, r.title) === key)
      || state.wants.some((w) => recordKey(w.artist, w.title) === key)) {
      e.preventDefault();
      dupCheck(e.target);
      return;
    }
    commit({ wants: insertWant(state.wants, want) }, `Added ${want.title} to the want list.`);
  });

  $("#owned-form").addEventListener("submit", (e) => {
    if (e.submitter?.value !== "save") return;
    const rec = normalizeCollectionRecord(Object.fromEntries(new FormData(e.target)));
    if (state.collection.some((r) => recordKey(r.artist, r.title) === recordKey(rec.artist, rec.title))) {
      e.preventDefault();
      dupCheck(e.target);
      return;
    }
    addToCollection([rec], `Added ${rec.title} to your collection.`);
  });

  wireImport();
}

/* ---------- CSV import ---------- */

let pendingImport = null;

function resetImport() {
  pendingImport = null;
  $("#import-preview").hidden = true;
  $("#import-go").disabled = true;
  $("#import-go").textContent = "Import";
}

async function previewImport(file) {
  resetImport();
  const preview = $("#import-preview");
  preview.hidden = false;
  if (!file) return;
  const plan = planImport(parseCsv(await file.text()), state.collection);
  if (plan.error) {
    preview.replaceChildren(el("p", { class: "hint warn" }, plan.error));
    return;
  }
  const incoming = new Set(plan.fresh.map((r) => recordKey(r.artist, r.title)));
  const wantHits = state.wants.filter((w) => incoming.has(recordKey(w.artist, w.title)));
  const list = (items, fmt) => el("ul", {}, items.slice(0, 50).map((x) => el("li", {}, fmt(x))),
    items.length > 50 && el("li", {}, `…and ${items.length - 50} more`));

  preview.replaceChildren(
    el("p", { class: "hint" }, `${file.name}: ${plan.mapped.join(", ")}`),
    el("div", { class: "summary" },
      el("span", {}, `${plural(plan.fresh.length, "new record")}`),
      plan.duplicates.length > 0 && el("span", {}, `${plan.duplicates.length} already owned`),
      plan.skipped.length > 0 && el("span", {}, `${plan.skipped.length} missing artist or title`)),
    plan.fresh.length > 0 && list(plan.fresh, (r) => `${r.artist} – ${r.title}${r.year ? ` (${r.year})` : ""}`),
    wantHits.length > 0 && el("p", { class: "hint" },
      `${plural(wantHits.length, "title")} will come off your want list: ${wantHits.map((w) => w.title).join(", ")}.`),
    plan.duplicates.length > 0 && el("details", {},
      el("summary", { class: "hint" }, "Skipped as already owned"),
      list(plan.duplicates, (r) => `${r.artist} – ${r.title}`)),
  );
  pendingImport = plan.fresh;
  $("#import-go").disabled = !plan.fresh.length;
  $("#import-go").textContent = plan.fresh.length ? `Import ${plural(plan.fresh.length, "record")}` : "Nothing to import";
}

function wireImport() {
  const drop = $("#drop");
  const input = $("input[type=file]", drop);
  input.addEventListener("change", () => previewImport(input.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    previewImport(e.dataTransfer.files[0]);
  });
  $("#import-form").addEventListener("submit", (e) => {
    if (e.submitter?.value !== "save" || !pendingImport?.length) return;
    addToCollection(pendingImport, `Imported ${plural(pendingImport.length, "record")}.`);
  });
}

/* ---------- Shell ---------- */

function renderFooter() {
  const repo = el("a", { href: REPO_URL }, "the GitHub repo");
  $("#footer").replaceChildren(state.editable
    ? el("span", {}, "Editing locally: changes save to data/wants.csv and data/collection.csv. Commit and push to publish them.")
    : el("span", {}, "Want to suggest a record? Open ", repo, " in Claude Code and ask it to add one; it will open a pull request for review."));
}

function render() {
  const wanted = state.wants.length, owned = state.collection.length;
  $("#stats").textContent = `${plural(wanted, "record")} wanted · ${owned} owned`;
  $("#want-count").textContent = wanted;
  $("#owned-count").textContent = owned;
  const mode = $("#mode");
  mode.textContent = state.editable ? "Editing locally" : "Read-only";
  mode.classList.toggle("editing", state.editable);
  $$("[data-edit]").forEach((n) => { n.hidden = !state.editable; });
  const artists = [...new Set([...state.wants, ...state.collection].map((r) => r.artist))].sort();
  $("#artist-options").replaceChildren(...artists.map((a) => el("option", { value: a })));
  renderWants();
  renderCollection();
  renderFooter();
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
window.addEventListener("hashchange", showView);
wireDialogs();
showView();

try {
  const [data, editable] = await Promise.all([loadData(), isEditable()]);
  Object.assign(state, data, { editable });
  render();
} catch (err) {
  $("#want-list").replaceChildren(el("p", { class: "empty" }, `Couldn't load the list: ${err.message}`));
}
