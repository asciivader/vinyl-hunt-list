import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvObjects, stringifyCsv } from "../src/csv.js";
import { recordKey, planImport, insertWant, validateData, WANT_COLUMNS, COLLECTION_COLUMNS } from "../src/records.js";

test("CSV round-trips quotes, commas and newlines", () => {
  const rows = [{ artist: 'The "Band"', title: "Girls, Girls, Girls", year: "", note: "two\nlines" }];
  const text = stringifyCsv(["artist", "title", "year", "note"], rows);
  assert.deepEqual(parseCsvObjects(text).rows, rows);
});

test("CSV parser handles BOM, CRLF and blank lines", () => {
  assert.deepEqual(parseCsv("﻿a,b\r\n1,2\r\n\r\n3,\"4\"\r\n"), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

test("recordKey ignores case, accents, punctuation, leading The and &", () => {
  assert.equal(recordKey("Blue Öyster Cult", "Spectres"), recordKey("blue oyster cult", "SPECTRES"));
  assert.equal(recordKey("The Replacements", "Let It Be"), recordKey("Replacements", "Let it be!"));
  assert.equal(recordKey("Ryan Adams", "Ashes & Fire"), recordKey("Ryan Adams", "Ashes and Fire"));
  assert.notEqual(recordKey("Queen", "Greatest Hits"), recordKey("Queen", "Greatest Hits II"));
});

test("planImport reads a Discogs export and skips duplicates", () => {
  const csv = parseCsv([
    "Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition",
    "SRM-1-609,Rod Stewart,Every Picture Tells A Story,Mercury,LP,,1971,123,Uncategorized,2024-03-01 10:00:00,VG+",
    "PC 33479,Aerosmith,Toys In The Attic,Columbia,LP,,1975,456,Uncategorized,2024-03-02 10:00:00,VG",
    "X1,Nirvana (2),Bleach,Sub Pop,LP,,1989,789,Uncategorized,2024-03-03 10:00:00,",
    ",,No Artist,,,,,,,,",
  ].join("\n"));
  const plan = planImport(csv, [{ artist: "Aerosmith", title: "Toys in the Attic" }]);
  assert.equal(plan.fresh.length, 2);
  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.skipped.length, 1);
  const [rod, nirvana] = plan.fresh;
  assert.deepEqual(
    [rod.catalog, rod.year, rod.added, rod.condition, rod.label],
    ["SRM-1-609", "1971", "2024-03-01", "VG+", "Mercury"],
  );
  assert.equal(nirvana.artist, "Nirvana");
});

test("planImport needs artist and title columns", () => {
  assert.match(planImport(parseCsv("name,year\nfoo,1999"), []).error, /artist/);
});

test("insertWant keeps an artist's titles together", () => {
  const wants = [
    { section: "Rock", artist: "Faces", title: "Long Player" },
    { section: "Rock", artist: "Queen", title: "Greatest Hits" },
    { section: "Punk", artist: "Ramones", title: "Leave Home" },
  ];
  const next = insertWant(wants, { section: "Rock", artist: "Faces", title: "Ooh La La" });
  assert.deepEqual(next.map((w) => w.title), ["Long Player", "Ooh La La", "Greatest Hits", "Leave Home"]);
  const fresh = insertWant(wants, { section: "Rock", artist: "The Who", title: "Who's Next" });
  assert.equal(fresh[2].title, "Who's Next");
});

test("validateData catches bad sections, duplicates and owned wants", () => {
  const errors = validateData({
    wantColumns: WANT_COLUMNS,
    collectionColumns: COLLECTION_COLUMNS,
    layout: { pages: [{ sections: [{ name: "Rock" }] }] },
    wants: [
      { section: "Rock", artist: "Queen", title: "Greatest Hits" },
      { section: "Rock", artist: "Queen", title: "Greatest hits" },
      { section: "Jazz", artist: "Miles Davis", title: "Kind of Blue" },
      { section: "Rock", artist: "Aerosmith", title: "Rocks" },
    ],
    collection: [{ artist: "Aerosmith", title: "Rocks", year: "76", added: "2024-01-01" }],
  });
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /duplicate/);
  assert.match(errors.join("\n"), /"Jazz" is not in layout/);
  assert.match(errors.join("\n"), /already owned/);
  assert.match(errors.join("\n"), /four digits/);
});
