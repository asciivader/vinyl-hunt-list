import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvObjects, stringifyCsv } from "../src/csv.js";
import { recordKey, planImport, validateData, WANT_COLUMNS, COLLECTION_COLUMNS } from "../src/records.js";

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

test("planImport dates rows (today if missing); undated leaves every date empty", () => {
  const csv = parseCsv("artist,title,added\nA,One,2024-05-01\nB,Two,");
  const [one, two] = planImport(csv, []).fresh;
  assert.equal(one.added, "2024-05-01");
  assert.equal(two.added, new Date().toISOString().slice(0, 10));
  const undated = planImport(csv, [], { undated: true }).fresh;
  assert.deepEqual(undated.map((r) => r.added), ["", ""]);
});

test("planImport needs artist and title columns", () => {
  assert.match(planImport(parseCsv("name,year\nfoo,1999"), []).error, /artist/);
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

test("groupWants lists artists alphabetically in each section, ignoring a leading The", async () => {
  const { groupWants } = await import("../src/data.js");
  const wants = [
    { section: "Rock", artist: "Queen", title: "Greatest Hits" },
    { section: "Rock", artist: "The Clash", title: "Combat Rock" },
    { section: "Rock", artist: "Aerosmith", title: "Rocks" },
    { section: "Rock", artist: "Queen", title: "Greatest Hits II" },
    { section: "Rock", artist: "Mötley Crüe", title: "Dr. Feelgood" },
  ];
  const { pages } = groupWants(wants, { pages: [{ sections: [{ name: "Rock" }] }] });
  const artists = pages[0].sections[0].artists;
  assert.deepEqual(artists.map(([a]) => a), ["Aerosmith", "The Clash", "Mötley Crüe", "Queen"]);
  assert.deepEqual(artists[3][1].map((t) => t.title), ["Greatest Hits", "Greatest Hits II"]);
});

test("coverSlug makes file-safe names with the same matching rules as recordKey", async () => {
  const { coverSlug } = await import("../src/records.js");
  assert.equal(coverSlug("Fleetwood Mac", "Rumours"), "fleetwood-mac--rumours");
  assert.equal(coverSlug("The Cars", "The Cars"), "cars--cars");
  assert.equal(coverSlug("Blue Öyster Cult", "Agents of Fortune"), coverSlug("Blue Oyster Cult", "Agents of Fortune"));
  assert.match(coverSlug("Guns N' Roses", "Appetite for Destruction"), /^[a-z0-9-]+$/);
});

test("cover lookup tries exact, trimmed and loose searches, preferring the right type", async () => {
  const { searchQueries, pickReleaseGroups } = await import("../scripts/fetch-covers.js");
  assert.deepEqual(searchQueries("Fleetwood Mac", "Rumours"), ['releasegroup:"Rumours" AND artist:"Fleetwood Mac"']);
  assert.deepEqual(searchQueries("Weezer", "Weezer (Blue Album)"), [
    'releasegroup:"Weezer (Blue Album)" AND artist:"Weezer"',
    'releasegroup:"Weezer" AND artist:"Weezer"',
  ]);
  assert.deepEqual(searchQueries("Eagles", "Eagles Greatest Hits Volume 2").at(-1), 'releasegroup:(Eagles Greatest Hits Volume 2) AND artist:"Eagles"');
  assert.deepEqual(searchQueries("Soundtrack", "Flashdance"), ['releasegroup:"Flashdance" AND secondarytype:soundtrack']);
  assert.equal(searchQueries("Various Artists", "Morningtown Ride")[0], 'releasegroup:"Morningtown Ride"');
  assert.equal(searchQueries("A", 'Say "Hi"')[0], 'releasegroup:"Say \\"Hi\\"" AND artist:"A"');
  const response = { "release-groups": [
    { id: "single", score: 100, "primary-type": "Single" },
    { id: "album", score: 98, "primary-type": "Album" },
    { id: "weak", score: 50, "primary-type": "Album" },
  ] };
  assert.deepEqual(pickReleaseGroups(response, "LP"), ["album", "single"]);
  assert.deepEqual(pickReleaseGroups(response, "12-inch single"), ["single", "album"]);
  assert.deepEqual(pickReleaseGroups({}), []);
});

test("editionCoverSlug gives each noted copy its own cover name", async () => {
  const { editionCoverSlug, coverSlug } = await import("../src/records.js");
  assert.equal(
    editionCoverSlug("Guns N' Roses", "Appetite for Destruction", "original pressing, alternate cover"),
    "guns-n-roses--appetite-for-destruction--original-pressing-alternate-cover",
  );
  assert.equal(editionCoverSlug("Fleetwood Mac", "Rumours", ""), coverSlug("Fleetwood Mac", "Rumours"));
});
