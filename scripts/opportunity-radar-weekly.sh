#!/usr/bin/env bash
# Weekly Opportunity Radar runner (local - launchd invokes this every Monday 09:00;
# the Cortex "Run research" button spawns it too, via radar-control-watcher.mjs).
#
# One step: scripts/opportunity-research.mjs asks Codex to deep-research and re-verify
# opportunities for scripts/radar-profile.md, scores them with the profile rules, hides
# what fails, and writes ONLY to the Cortex store (localhost:3456). Codex runs with web
# search as its only tool (no shell, MCP, plugins or hooks); see that script's header.
#
# FAILURE VISIBILITY: every FATAL exit (and the 60-minute watchdog kill) POSTs
# /api/automation/run on the Cortex app, which logs the failure on the Automations
# page and pushes the phone. Alerting is fail-open: a down Cortex app never breaks
# the run or masks its exit code.
#
# Prereqs when it fires: Mac awake, Cortex app open, codex CLI signed in.
set -uo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# The checkout this script lives in, so launchd can run any clean checkout of main.
CORTEX="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

# -- 60-minute watchdog ------------------------------------------------------
# launchd has no per-job timeout, so the script supervises itself: this outer
# invocation re-runs the same file (RADAR_INNER=1) under gtimeout/timeout when
# coreutils is installed, else under a perl alarm wrapper (exit 124 on timeout,
# matching gtimeout). The control watcher keeps its own 60-min SIGKILL; this
# inner watchdog is redundant there but harmless, and it covers launchd runs.
RADAR_TIMEOUT_SECS=3600
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
    alert_fatal "run exceeded the 60-minute watchdog and was killed"
  fi
  exit "$rc"
fi

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

  command -v codex >/dev/null 2>&1 || fatal 127 "codex CLI not found"
  command -v node  >/dev/null 2>&1 || fatal 127 "node not found"

  node "$CORTEX/scripts/opportunity-research.mjs" || fatal 1 "research failed"

  echo "opportunity-radar weekly run finished @ $(date)"
} >> "$LOG" 2>&1
