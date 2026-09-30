// Lists the releases (pressings) MusicBrainz has for a record, with their
// Cover Art Archive images, to pick a copy's cover for data/edition-covers.csv.
//
//   npm run find-releases -- "The Rolling Stones" "Beggars Banquet"
//   npm run find-releases -- "The Rolling Stones" "Beggars Banquet" --vinyl
//
// Also runs on GitHub (Actions → Find releases), for sessions that can't
// reach MusicBrainz; the list then appears in the run's notices.

const USER_AGENT = "vinyl-hunt-list/1.0 (https://github.com/asciivader/vinyl-hunt-list)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => `"${String(s).replace(/[\\"]/g, "\\$&")}"`;

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (attempt === 2) throw new Error(`${res.status} from ${url}`);
    await sleep(3000 * (attempt + 1));
  }
}

const args = process.argv.slice(2);
const vinylOnly = args.includes("--vinyl");
const [artist, title] = args.filter((a) => !a.startsWith("--"));
if (!artist || !title) {
  console.error('Usage: npm run find-releases -- "<artist>" "<title>" [--vinyl]');
  process.exit(1);
}

const query = `release:${quote(title)} AND artist:${quote(artist)}`;
const found = await getJson(`https://musicbrainz.org/ws/2/release/?fmt=json&limit=100&query=${encodeURIComponent(query)}`);
const releases = (found?.releases ?? [])
  .filter((r) => Number(r.score) >= 90)
  .map((r) => ({
    id: r.id,
    date: r.date ?? "????",
    country: r.country ?? "",
    format: [...new Set((r.media ?? []).map((m) => m.format).filter(Boolean))].join(" + "),
    label: (r["label-info"] ?? []).map((l) => [l.label?.name, l["catalog-number"]].filter(Boolean).join(" ")).join("; "),
    note: r.disambiguation ?? "",
  }))
  .filter((r) => !vinylOnly || /vinyl/i.test(r.format))
  .sort((a, b) => a.date.localeCompare(b.date));

const lines = [];
for (const r of releases) {
  await sleep(400);
  const art = await getJson(`https://coverartarchive.org/release/${r.id}`).catch(() => null);
  const images = (art?.images ?? []).filter((i) => i.front || i.types?.includes("Front"));
  const pics = images.length ? images.map((i) => `image ${i.id}${i.comment ? ` "${i.comment}"` : ""}`).join(", ") : "no cover art";
  lines.push(`${r.date} ${r.country} ${r.format} | ${r.label}${r.note ? ` (${r.note})` : ""} | release ${r.id} | ${pics}`);
}

console.log(`${artist} – ${title}: ${lines.length} releases${vinylOnly ? " on vinyl" : ""}`);
for (const l of lines) console.log(l);
if (process.env.GITHUB_ACTIONS) {
  for (let i = 0; i < lines.length; i += 12) {
    console.log(`::notice title=Releases ${i + 1}-${Math.min(i + 12, lines.length)} of ${lines.length}::${lines.slice(i, i + 12).join("%0A")}`);
  }
}
