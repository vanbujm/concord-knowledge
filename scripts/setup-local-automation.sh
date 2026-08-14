#!/bin/bash
#
# One-shot setup for polling the Winds automatically from a Mac. Safe to re-run:
# every step is idempotent, so this doubles as the repair command when something
# has drifted.
#
#   bash scripts/setup-local-automation.sh
#
# It checks prerequisites, builds the container image, installs the launchd agent,
# and does one dry run to prove the whole path works end to end without posting
# anything to Discord.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_TAG="${CONCORD_IMAGE:-concord-ravens:local}"
MODEL_VOLUME="${CONCORD_MODEL_VOLUME:-concord-model-cache}"

# Everything the poller reads. The rest of .env.example serves the web app and the
# slash commands, which this schedule does not touch.
REQUIRED_ENV_KEYS=(
  DATABASE_URL
  ANTHROPIC_API_KEY
  DISCORD_BOT_TOKEN
  DISCORD_CHANNEL_ID
  DISCORD_GUILD_ID
)

step() {
  echo
  echo "==> $1"
}

die() {
  echo "    ERROR: $1" >&2
  exit 1
}

step "Checking the platform"

if [ "$(uname -s)" != "Darwin" ]; then
  die "This installs a launchd agent, which is macOS only. On Linux use a systemd timer calling scripts/poll-local.sh."
fi
echo "    macOS $(sw_vers -productVersion)"

step "Checking Docker"

if ! command -v docker >/dev/null 2>&1; then
  die "docker is not installed. Install Docker Desktop or OrbStack, then re-run."
fi

if ! docker info >/dev/null 2>&1; then
  die "The Docker daemon is not running. Start it, then re-run."
fi
echo "    docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo present)"

step "Checking credentials"

if [ ! -f "$REPO_DIR/.env" ]; then
  die "No .env found. Copy .env.example to .env and fill it in."
fi

missing_keys=()
for key in "${REQUIRED_ENV_KEYS[@]}"; do
  if ! grep -qE "^${key}=.+" "$REPO_DIR/.env"; then
    missing_keys+=("$key")
  fi
done

if [ "${#missing_keys[@]}" -gt 0 ]; then
  die ".env is missing values for: ${missing_keys[*]}"
fi
echo "    all ${#REQUIRED_ENV_KEYS[@]} required keys present"

# Secrets in a world-readable file are worth fixing while we are here.
env_mode=$(stat -f "%OLp" "$REPO_DIR/.env")
if [ "$env_mode" != "600" ]; then
  chmod 600 "$REPO_DIR/.env"
  echo "    tightened .env permissions from $env_mode to 600"
fi

step "Building the image"

cd "$REPO_DIR" || die "Could not enter $REPO_DIR"

if ! docker build -t "$IMAGE_TAG" .; then
  die "Image build failed."
fi
echo "    built $IMAGE_TAG"

step "Preparing the model cache volume"

docker volume create "$MODEL_VOLUME" >/dev/null
echo "    volume $MODEL_VOLUME ready (the embedding model lands here on first run)"

step "Installing the launchd agent"

bash "$REPO_DIR/scripts/install-launch-agent.sh"

step "Proving it works, without posting anything"

if bash "$REPO_DIR/scripts/poll-local.sh" --dry-run --limit 1; then
  echo "    dry run completed"
else
  die "The dry run failed. Check ~/Library/Logs/concord-ravens.log"
fi

echo
echo "Done. The ravens will poll at 08:07, 12:07, 16:07 and 20:07 local time."
echo "Logs: tail -f \$HOME/Library/Logs/concord-ravens.log"
