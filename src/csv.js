// Minimal RFC 4180 CSV reader/writer shared by the browser app, the local
// server and the validation script.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  text = text.replace(/^﻿/, "");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Rows as objects keyed by the (trimmed) header row.
export function parseCsvObjects(text) {
  const [header = [], ...rows] = parseCsv(text);
  const keys = header.map((h) => h.trim());
  return {
    columns: keys,
    rows: rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()]))),
  };
}

function quote(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function stringifyCsv(columns, rows) {
  const lines = [columns.map(quote).join(",")];
  for (const row of rows) lines.push(columns.map((c) => quote(row[c])).join(","));
  return lines.join("\n") + "\n";
}
