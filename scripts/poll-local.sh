#!/bin/bash
#
# Runs the Winds poller once inside its container, for launchd to call on a
# schedule. Any arguments are passed through, so `--dry-run` works here too.
#
# The image is rebuilt on every run. With Docker's layer cache that costs a second
# or two when nothing changed, and it removes the failure where the schedule
# quietly keeps running last month's code.
#
# Everything is appended to a log with a timestamp, and any failure raises a
# desktop notification rather than passing quietly. The CI version of this job
# failed fifteen times in a row without anyone noticing, which is the failure mode
# most worth designing against.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${CONCORD_POLL_LOG:-$HOME/Library/Logs/concord-ravens.log}"
DOCKER_BIN="${CONCORD_DOCKER:-$(command -v docker || echo /usr/local/bin/docker)}"
IMAGE_TAG="${CONCORD_IMAGE:-concord-ravens:local}"
MODEL_VOLUME="${CONCORD_MODEL_VOLUME:-concord-model-cache}"
MAX_LOG_BYTES=5242880

mkdir -p "$(dirname "$LOG_FILE")"

# Keep one previous log so the file cannot grow without bound.
if [ -f "$LOG_FILE" ]; then
  log_bytes=$(wc -c <"$LOG_FILE" | tr -d ' ')

  if [ "$log_bytes" -gt "$MAX_LOG_BYTES" ]; then
    mv "$LOG_FILE" "$LOG_FILE.1"
  fi
fi

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

fail() {
  echo "$(timestamp) poll FAILED: $1" >>"$LOG_FILE"
  osascript -e "display notification \"$1\" with title \"Concord ravens\"" 2>/dev/null
  exit 1
}

echo "$(timestamp) poll starting" >>"$LOG_FILE"

if [ ! -x "$DOCKER_BIN" ]; then
  fail "docker not found. See ~/Library/Logs/concord-ravens.log"
fi

# A stopped daemon is the failure this design adds, so it is checked explicitly
# rather than surfacing as a confusing error from docker run.
if ! "$DOCKER_BIN" info >/dev/null 2>&1; then
  fail "Docker is not running, so the ravens could not poll."
fi

if [ ! -f "$REPO_DIR/.env" ]; then
  fail "No .env in the repo, so the poller has no credentials."
fi

cd "$REPO_DIR" || fail "Could not enter $REPO_DIR"

# A build failure should not cost a poll. It is usually the registry being
# briefly unreachable rather than anything wrong with the code, so fall back to
# the image already built and note it, and only give up when there is none.
if ! "$DOCKER_BIN" build -q -t "$IMAGE_TAG" . >>"$LOG_FILE" 2>&1; then
  if "$DOCKER_BIN" image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    echo "$(timestamp) build failed, running the existing image instead" >>"$LOG_FILE"
  else
    fail "The ravens image failed to build and none was already built."
  fi
fi

# .env is mounted rather than passed with --env-file, because Docker's env-file
# parser takes values literally: a quoted URL arrives with the quote characters
# still attached. Mounting lets Bun read it with the same parser that works when
# running outside the container, and keeps the secrets out of `docker inspect`.
"$DOCKER_BIN" run --rm \
  -v "$REPO_DIR/.env:/app/.env:ro" \
  -v "$MODEL_VOLUME:/model-cache" \
  "$IMAGE_TAG" "$@" >>"$LOG_FILE" 2>&1
poll_status=$?

if [ "$poll_status" -eq 0 ]; then
  echo "$(timestamp) poll finished ok" >>"$LOG_FILE"
  exit 0
fi

fail "The ravens poll exited $poll_status."
