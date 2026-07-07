#!/usr/bin/env bash
# Weekly Opportunity Radar runner (local — launchd invokes this every Monday 09:00;
# the Cortex "Run radar" button spawns it too, via radar-control-watcher.mjs).
#
# DETERMINISTIC + INJECTION-SAFE by construction:
#   1. SCRAPE   — a hardcoded command run natively on this Mac (the Lima VM is
#                 retired). Untrusted output -> a file, never run.
#   2. CLASSIFY — a TOOL-LESS Claude call. Scraped content can't execute anything; worst
#                 case the model emits junk JSON.
#   3. INGEST   — radar-ingest.mjs validates/coerces every field and writes ONLY to the
#                 Cortex store (localhost:3456). No other write path exists in this flow.
# The LLM never chooses which commands run, so a prompt-injected post cannot escalate.
#
# FAILURE VISIBILITY: every FATAL exit (and the 40-minute watchdog kill) POSTs
# /api/automation/run on the Cortex app, which logs the failure on the Automations
# page and pushes the phone. Alerting is fail-open: a down Cortex app never breaks
# the run or masks its exit code.
#
# Prereqs when it fires: Mac awake, Cortex app open, and the radar engine built at
# /Users/pablo/Projects/noelle/apps/opportunity-radar/dist (host noelle checkout).
set -uo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CORTEX="/Users/pablo/projects/cortex"
NOELLE="/Users/pablo/Projects/noelle"
SCRAPE_ENTRY="$NOELLE/apps/opportunity-radar/dist/scrape.js"
CORTEX_API="http://127.0.0.1:3456"
LOG="$HOME/Library/Logs/opportunity-radar.log"

# POST a fatal failure to Cortex (Automations page + phone push). Fail-open:
# any error here is swallowed. Never prints env values.
alert_fatal() {
  local reason="$1" payload
  payload="$(node -e 'console.log(JSON.stringify({ taskName: "opportunity-radar", status: "error", summary: String(process.argv[1] || "unknown failure") }))' "$reason" 2>/dev/null)" \
    || payload='{"taskName":"opportunity-radar","status":"error","summary":"radar failed (reason unavailable)"}'
  curl -sS -m 10 -X POST "$CORTEX_API/api/automation/run" \
    -H 'Content-Type: application/json' -d "$payload" >/dev/null 2>&1 || true
}

# ── 40-minute watchdog ──────────────────────────────────────────────────────
# launchd has no per-job timeout, so the script supervises itself: this outer
# invocation re-runs the same file (RADAR_INNER=1) under gtimeout/timeout when
# coreutils is installed, else under a perl alarm wrapper (exit 124 on timeout,
# matching gtimeout). The control watcher keeps its own 40-min SIGKILL; this
# inner watchdog is redundant there but harmless, and it covers launchd runs.
RADAR_TIMEOUT_SECS=2400
if [ "${RADAR_INNER:-}" != "1" ]; then
  export RADAR_INNER=1
  TIMEOUT_BIN="$(command -v gtimeout || command -v timeout || true)"
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" -k 60 "$RADAR_TIMEOUT_SECS" /bin/bash "$0" "$@"
    rc=$?
  else
    perl -e '
      my $secs = shift @ARGV;
      my $pid = fork() // die "fork: $!";
      if ($pid == 0) { exec @ARGV or die "exec: $!" }
      my $timed_out = 0;
      $SIG{ALRM} = sub {
        if ($timed_out) { kill "KILL", $pid }
        else { $timed_out = 1; kill "TERM", $pid; alarm 60 }
      };
      alarm $secs;
      waitpid($pid, 0);
      alarm 0;
      exit 124 if $timed_out;
      exit(($? & 127) ? 128 + ($? & 127) : ($? >> 8));
    ' "$RADAR_TIMEOUT_SECS" /bin/bash "$0" "$@"
    rc=$?
  fi
  if [ "$rc" -eq 124 ]; then
    echo "FATAL: run exceeded the ${RADAR_TIMEOUT_SECS}s watchdog and was killed @ $(date)" >> "$LOG"
    alert_fatal "run exceeded the 40-minute watchdog and was killed"
  fi
  exit "$rc"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/radar.XXXXXX")"
RAW="$TMP/raw.json"; PROMPT="$TMP/prompt.txt"; MODEL="$TMP/model.txt"
CLS="$TMP/classified.json"; REP="$TMP/report.md"
trap 'rm -rf "$TMP"' EXIT

# Log the reason, alert Cortex, exit. Runs inside the log redirection below.
fatal() {
  local code="$1"; shift
  echo "FATAL: $*"
  alert_fatal "$*"
  exit "$code"
}

{
  echo "==================================================================="
  echo "opportunity-radar weekly run @ $(date)"

  command -v claude >/dev/null 2>&1 || fatal 127 "claude CLI not found"
  command -v node   >/dev/null 2>&1 || fatal 127 "node not found"

  # 1. SCRAPE — fixed command, native on this Mac (the old path booted the retired
  #    Lima VM with `limactl start default` and ran the frozen VM checkout).
  #    Borrows one Apify token (read-only), prints RawHit[] JSON. Env comes from
  #    ~/.noelle/.env, sourced into this process only and never echoed.
  [ -f "$SCRAPE_ENTRY" ] || fatal 1 "scrape entry missing: $SCRAPE_ENTRY (build @noelle/opportunity-radar in the host noelle checkout)"
  [ -f "$HOME/.noelle/.env" ] || fatal 1 "~/.noelle/.env not found (scraper needs NOELLE_DATABASE_URL)"
  set +u; set -a; . "$HOME/.noelle/.env"; set +a; set -u
  ( cd "$NOELLE" && node "$SCRAPE_ENTRY" --since 8d 2>/tmp/radar-scrape.log ) > "$RAW" \
    || fatal 1 "scrape failed (see /tmp/radar-scrape.log)"
  echo "scraped $(wc -c < "$RAW") bytes"

  # 2. CLASSIFY — tool-less LLM. --allowedTools with no entries = no tool can run.
  node "$CORTEX/scripts/radar-build-prompt.mjs" "$RAW" > "$PROMPT" || fatal 1 "build-prompt failed"
  claude -p --allowedTools "" < "$PROMPT" > "$MODEL" 2>>"$LOG" || fatal 1 "classify failed"

  # 3. PARSE + VALIDATE model output -> classified.json + report.md
  node "$CORTEX/scripts/radar-parse-output.mjs" "$MODEL" "$CLS" "$REP" || fatal 1 "parse failed"

  # 4. INGEST -> Cortex only.
  node "$CORTEX/scripts/radar-ingest.mjs" "$CLS" "$REP" || fatal 1 "ingest failed"

  echo "opportunity-radar weekly run finished @ $(date)"
} >> "$LOG" 2>&1
