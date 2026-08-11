#!/usr/bin/env bash
# Discover legal-domain repos on GitHub across the three categories the
# creation workflow names — evals, automation/skills, MCP/tool surfaces — plus
# the services those tools actually call.
#
# Emits research/discovered-repos.tsv (stars, full_name, description) sorted by
# stars, deduplicated, with anything already in repos-manifest.tsv marked.
#
# Usage: bash research/discover-repos.sh
set -u
OUT="$(cd "$(dirname "$0")" && pwd)/discovered-repos.tsv"
TMP=$(mktemp)

q() {  # q <query> — one GitHub search, appended to TMP
  gh api -X GET search/repositories -f q="$1" -f per_page=40 -f sort=stars \
    --jq '.items[] | [.stargazers_count, .full_name, (.description // "")[0:90]] | @tsv' \
    2>/dev/null >> "$TMP" || true
  sleep 2   # unauthenticated-ish rate courtesy
}

# --- evals / benchmarks ---------------------------------------------------
q "legal benchmark llm stars:>3"
q "legal agent benchmark stars:>2"
q "legal reasoning evaluation dataset stars:>10"
q "contract review benchmark stars:>3"
q "legalbench OR lexglue OR cuad OR maud stars:>3"
q "case law dataset judgment prediction stars:>10"
q "legal question answering dataset stars:>10"

# --- automation / skills / agents ----------------------------------------
q "legal AI agent workflow stars:>5"
q "law firm automation stars:>5"
q "legal document automation stars:>10"
q "contract analysis python stars:>20"
q "legal claude skills OR legal agent skills stars:>2"
q "paralegal OR litigation automation stars:>5"

# --- MCP / tool surfaces --------------------------------------------------
q "legal mcp server stars:>1"
q "mcp server law OR court OR contract stars:>2"
q "model context protocol legal stars:>1"

# --- services the tools call ---------------------------------------------
q "court records API scraper stars:>10"
q "pacer OR courtlistener stars:>5"
q "citation parser legal stars:>10"
q "ediscovery OR e-discovery stars:>10"
q "docket OR filing automation stars:>5"

sort -t$'\t' -k1 -rn -u "$TMP" | awk -F'\t' '!seen[$2]++' > "$OUT.raw"

# mark ones we already have
MAN="$(dirname "$OUT")/repos-manifest.tsv"
{
  printf 'have\tstars\trepo\tdescription\n'
  while IFS=$'\t' read -r stars name desc; do
    if grep -qi "	$name	" "$MAN" 2>/dev/null; then have="YES"; else have="-"; fi
    printf '%s\t%s\t%s\t%s\n' "$have" "$stars" "$name" "$desc"
  done < "$OUT.raw"
} > "$OUT"
rm -f "$TMP" "$OUT.raw"

echo "discovered: $(( $(wc -l < "$OUT") - 1 )) unique repos"
echo "already cloned: $(grep -c '^YES' "$OUT" || true)"
echo "new candidates: $(grep -c '^-' "$OUT" || true)"
echo "-> $OUT"
