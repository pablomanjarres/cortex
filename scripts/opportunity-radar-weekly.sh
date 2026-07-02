#!/usr/bin/env bash
# Weekly Opportunity Radar runner (local — launchd invokes this).
#
# DETERMINISTIC + INJECTION-SAFE by construction:
#   1. SCRAPE   — hardcoded commands on the Lima VM. Untrusted output -> a file, never run.
#   2. CLASSIFY — a TOOL-LESS Claude call. Scraped content can't execute anything; worst
#                 case the model emits junk JSON.
#   3. INGEST   — radar-ingest.mjs validates/coerces every field and writes ONLY to the
#                 Cortex store (localhost:3456). No other write path exists in this flow.
# The LLM never chooses which commands run, so a prompt-injected post cannot escalate.
#
# Prereqs when it fires: Mac awake, Lima VM `default` running, Cortex app open, and the
# radar engine deployed (noelle PR #356 merged + built on the Lima checkout).
set -uo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CORTEX="/Users/pablo/projects/cortex"
LOG="$HOME/Library/Logs/opportunity-radar.log"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/radar.XXXXXX")"
RAW="$TMP/raw.json"; PROMPT="$TMP/prompt.txt"; MODEL="$TMP/model.txt"
CLS="$TMP/classified.json"; REP="$TMP/report.md"
trap 'rm -rf "$TMP"' EXIT

{
  echo "==================================================================="
  echo "opportunity-radar weekly run @ $(date)"

  command -v claude  >/dev/null 2>&1 || { echo "FATAL: claude CLI not found"; exit 127; }
  command -v limactl >/dev/null 2>&1 || { echo "FATAL: limactl not found"; exit 127; }

  # 1. SCRAPE — fixed command; borrows one Apify token (read-only), prints RawHit[] JSON.
  limactl start default >/dev/null 2>&1 || echo "warn: could not ensure Lima 'default' running"
  limactl shell default -- bash -lc '
    set -a; for f in "$HOME/.noelle/.env" /home/pablo.guest/.noelle/.env; do [ -f "$f" ] && . "$f" && break; done; set +a
    cd /home/pablo.guest/noelle || exit 1
    [ -f apps/opportunity-radar/dist/scrape.js ] || pnpm turbo build --filter=@noelle/opportunity-radar >/tmp/radar-build.log 2>&1
    node apps/opportunity-radar/dist/scrape.js --since 8d 2>/tmp/radar-scrape.log
  ' > "$RAW" || { echo "FATAL: scrape failed"; exit 1; }
  echo "scraped $(wc -c < "$RAW") bytes"

  # 2. CLASSIFY — tool-less LLM. --allowedTools with no entries = no tool can run.
  node "$CORTEX/scripts/radar-build-prompt.mjs" "$RAW" > "$PROMPT" || { echo "FATAL: build-prompt failed"; exit 1; }
  claude -p --allowedTools "" < "$PROMPT" > "$MODEL" 2>>"$LOG" || { echo "FATAL: classify failed"; exit 1; }

  # 3. PARSE + VALIDATE model output -> classified.json + report.md
  node "$CORTEX/scripts/radar-parse-output.mjs" "$MODEL" "$CLS" "$REP" || { echo "FATAL: parse failed"; exit 1; }

  # 4. INGEST -> Cortex only.
  node "$CORTEX/scripts/radar-ingest.mjs" "$CLS" "$REP" || { echo "FATAL: ingest failed"; exit 1; }

  echo "opportunity-radar weekly run finished @ $(date)"
} >> "$LOG" 2>&1
