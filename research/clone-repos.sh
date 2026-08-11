#!/usr/bin/env bash
# Clone the domain corpus that grounds every downstream artifact.
#
# Rule 1 of the creation workflow: every eval, workflow and MCP tool we host
# must be mocked and runnable in the world. Rule 2: new tasks/tools/mock data
# must be judged against evidence from a repo that is actually on disk. Both
# rules require the corpus to be LOCAL, not a list of URLs — the previous
# registry (data/research/domain-registry.json, 101 items) was web-sourced and
# nothing was ever downloaded, so no claim in it could be checked against code.
#
# Shallow clones (--depth 1); we want source and fixtures, not history.
# Failures are RECORDED, never silently skipped — an unavailable repo is a fact
# about the domain, not a gap to paper over.
#
# Usage: bash research/clone-repos.sh
set -u
DEST="$(cd "$(dirname "$0")" && pwd)/repos"
mkdir -p "$DEST"
MANIFEST="$DEST/../repos-manifest.tsv"
: > "$MANIFEST"
printf 'status\tcategory\trepo\tsize\tnote\n' >> "$MANIFEST"

clone() {  # clone <category> <owner/name>
  local cat="$1" repo="$2"
  local name="${repo//\//@}"
  local dir="$DEST/$name"
  if [ -d "$dir/.git" ]; then
    printf 'OK\t%s\t%s\t%s\tpresent\n' "$cat" "$repo" "$(du -sh "$dir" | cut -f1 | tr -d ' ')" >> "$MANIFEST"
    echo "SKIP  $repo"; return
  fi
  rm -rf "$dir"
  if timeout 900 git clone --depth 1 --quiet "https://github.com/$repo.git" "$dir" 2>/tmp/clone_err; then
    printf 'OK\t%s\t%s\t%s\t\n' "$cat" "$repo" "$(du -sh "$dir" | cut -f1 | tr -d ' ')" >> "$MANIFEST"
    echo "OK    $repo"
  else
    local err; err=$(tr '\n' ' ' < /tmp/clone_err | head -c 140)
    printf 'FAIL\t%s\t%s\t-\t%s\n' "$cat" "$repo" "$err" >> "$MANIFEST"
    echo "FAIL  $repo — $err"
  fi
}

# ---- 1. domain evals / benchmarks (what tasks are likely) -----------------
clone eval harveyai/harvey-labs
clone eval HazyResearch/legalbench
clone eval TheAtticusProject/cuad
clone eval TheAtticusProject/maud
clone eval TheAtticusProject/acord
clone eval RegNLP/ObliQADataset
clone eval minnesotanlp/LawFlow
clone eval olivialiu121/ContractEval
clone eval Exploration-Lab/CJPE
clone eval thunlp/jec-qa
clone eval lbox-kr/lbox-open
clone eval SgfdDttt/sara-ie
clone eval hoorangyee/LRAGE

# ---- 2. domain automation / agent skills (how the work is actually done) --
clone automation CSlawyer1985/claude-for-legal-ZH
clone automation lawve-ai/awesome-legal-skills
clone automation armanaydemir/openprobono
clone automation SuffolkLITLab/ALKiln
clone automation jhpyle/docassemble

# ---- 3. domain MCP / tool surfaces (what the agent calls) -----------------
clone mcp agentic-ops/legal-mcp
clone mcp grafana/mcp-grafana
clone mcp modelcontextprotocol/servers

# ---- 4. real services we mirror (ground truth for API shape) -------------
clone service freelawproject/courtlistener
clone service freelawproject/juriscraper
clone service freelawproject/eyecite
clone service LexPredict/lexpredict-lexnlp
clone service eugene-yang/tarexp
clone service shmsoft/FreeEed

# ---- 5. domain surveys (find what we have not thought of) ----------------
clone survey maastrichtlawtech/awesome-legal-nlp

echo
echo "=== manifest ==="
column -t -s $'\t' "$MANIFEST" 2>/dev/null || cat "$MANIFEST"
echo
echo "OK:   $(grep -c '^OK' "$MANIFEST")"
echo "FAIL: $(grep -c '^FAIL' "$MANIFEST")"
