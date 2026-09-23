// Printable hunt list: one US letter sheet, front and back, built from
// data/wants.csv and the page/column placement in data/layout.json.

import { loadData, groupWants } from "./data.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderTitle({ title, note }) {
  const row = el("div", "title");
  const label = el("span", null, title);
  if (note) label.append(" ", el("span", "note", note));
  row.append(el("span", "box"), label, el("span", "box"));
  return row;
}

function renderPage(page, index, total) {
  const sheet = el("section", "page");
  sheet.setAttribute("aria-label", `Page ${index + 1}`);

  const masthead = el("header", "masthead");
  masthead.append(el("h1", null, "Vinyl hunt list"), el("p", null, page.note ?? ""));

  const columns = el("div", "columns");
  for (const section of page.sections) {
    if (!section.artists.length) continue;
    const bar = el("div", "section", section.name);
    if (section.gap) bar.classList.add("gap");
    if (section.newColumn) bar.classList.add("new-column");
    columns.append(bar);
    for (const [artist, titles] of section.artists) {
      const group = el("div", "artist");
      group.append(el("h2", null, artist), ...titles.map(renderTitle));
      columns.append(group);
    }
  }

  const footer = el("footer", "footer");
  footer.append(
    el("span", null, "Left box: found / bought. Right box: seen but passed."),
    el("span", null, `${index + 1} of ${total}`),
  );

  sheet.append(masthead, columns, footer);
  return sheet;
}

// Content that doesn't fit spills into a clipped third column; flag it so
// nothing silently disappears from the printout.
function checkFit(unplaced) {
  const problems = [];
  document.querySelectorAll(".columns").forEach((cols, i) => {
    if (cols.scrollWidth > cols.clientWidth + 1) problems.push(`Page ${i + 1} is too full and some titles are cut off.`);
  });
  if (unplaced.length) problems.push(`Not in layout.json, added to the last page: ${unplaced.join(", ")}.`);
  const warning = document.getElementById("warning");
  warning.textContent = problems.join(" ");
  warning.hidden = !problems.length;
}

const { wants, layout } = await loadData();
const { pages, unplaced } = groupWants(wants, layout);
document.getElementById("sheet").append(...pages.map((p, i) => renderPage(p, i, pages.length)));
document.getElementById("count").textContent = `${wants.length} titles`;
await document.fonts.ready;
checkFit(unplaced);
