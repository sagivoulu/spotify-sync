#!/usr/bin/env bash
# Redeploy the openbeat mockup to GitHub Pages → https://sagivoulu.github.io/spotify-sync/
#
# Publishes ONLY this folder's index.html as the root of the orphan `gh-pages` branch.
# It does NOT touch your working tree or current branch (uses git plumbing).
# Deploys the CURRENT index.html on disk (committed or not), so you can preview quickly.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SELF="prd/ui-research/04-prototype/index.html"
BLOB=$(git hash-object -w "$SELF")
TREE=$(printf '100644 blob %s\tindex.html\n' "$BLOB" | git mktree)
COMMIT=$(echo "Deploy openbeat mockup $(date -u +%FT%TZ)" | git commit-tree "$TREE")
git push -f origin "${COMMIT}:refs/heads/gh-pages"
echo "Deployed → https://sagivoulu.github.io/spotify-sync/  (allow ~1 min to rebuild)"
