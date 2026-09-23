#!/usr/bin/env bash
# Assembles the published site in _site/: the current checkout (main) at the
# root, plus a preview of each given pull request at previews/pr-<N>/.
#
#   scripts/build-site.sh [<pr-number>:<commit-sha> ...]
#
# Previews take only the page files (index.html, print.html, src/) from the
# pull request and always show the lists from main. Nothing from a pull
# request is executed here; its files are only copied.

set -euo pipefail

out=_site
repo=${GITHUB_REPOSITORY:-asciivader/vinyl-hunt-list}

rm -rf "$out"
mkdir -p "$out"
cp -r index.html print.html src data "$out/"
git log -1 --format=%cI -- data > "$out/data/updated.txt"

banner() {
  local n=$1
  cat <<EOF
<style>.preview-banner{position:sticky;top:0;z-index:1000;background:#ffd400;color:#111;font:600 14px/1.4 -apple-system,Helvetica,Arial,sans-serif;padding:8px 16px;text-align:center}.preview-banner a{color:#111}@media print{.preview-banner{display:none!important}}</style>
<div class="preview-banner">Preview of <a href="https://github.com/$repo/pull/$n">pull request #$n</a>, not the live site. <a href="../../">Go to the live site</a></div>
EOF
}

for spec in "$@"; do
  n=${spec%%:*}
  sha=${spec#*:}
  if [[ ! $n =~ ^[0-9]+$ || ! $sha =~ ^[0-9a-f]{40}$ ]]; then
    echo "Skipping malformed preview spec: $spec" >&2
    continue
  fi

  dir="$out/previews/pr-$n"
  mkdir -p "$dir"
  paths=$(git ls-tree --name-only "$sha" index.html print.html src)
  # shellcheck disable=SC2086
  git archive "$sha" -- $paths | tar -x --no-same-owner -C "$dir"
  # Only plain files: a symlink could point at files on the build machine.
  find "$dir" ! -type f ! -type d -delete

  rm -rf "$dir/data"
  cp -r "$out/data" "$dir/data"

  for page in "$dir/index.html" "$dir/print.html"; do
    [[ -f $page ]] || continue
    tmp=$(mktemp)
    awk -v banner="$(banner "$n")" '
      !done_head && /<head[^>]*>/ { sub(/<head[^>]*>/, "&\n<meta name=\"robots\" content=\"noindex\">"); done_head = 1 }
      !done_body && /<body[^>]*>/ { sub(/<body[^>]*>/, "&\n" banner); done_body = 1 }
      { print }
    ' "$page" > "$tmp"
    mv "$tmp" "$page"
  done
  echo "Built preview for pull request #$n ($sha)"
done
