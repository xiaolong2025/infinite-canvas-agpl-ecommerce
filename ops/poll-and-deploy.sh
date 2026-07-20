#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${CANVAS_ROOT_DIR:-/opt/infinite-canvas}"
IMAGE_NAME="${CANVAS_IMAGE_NAME:-ghcr.io/xiaolong2025/infinite-canvas}"
DEV_IMAGE="${IMAGE_NAME}:dev"
STATE_FILE="${CANVAS_STATE_FILE:-$ROOT_DIR/current-version}"
DEPLOY_SCRIPT="${CANVAS_DEPLOY_SCRIPT:-$ROOT_DIR/deploy.sh}"
LOCK_FILE="${CANVAS_POLL_LOCK_FILE:-/run/lock/infinite-canvas-deploy.lock}"
PUBLIC_URL="${CANVAS_PUBLIC_URL:-https://canvas.yigeai.work/}"
YIGEAI_HEALTH_URL="${YIGEAI_HEALTH_URL:-https://api.yigeai.work/health}"

log() {
    printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

current_sha() {
    [ -f "$STATE_FILE" ] || return 0
    sed -n 's/^CURRENT_SHA=//p' "$STATE_FILE" | head -n 1
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "Another Canvas deployment check is already running"
    exit 0
fi

docker pull "$DEV_IMAGE" >/dev/null
sha="$(docker image inspect "$DEV_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    log "ERROR: dev image does not contain a valid full Git SHA label" >&2
    exit 1
fi

deployed_sha="$(current_sha)"
if [ "$deployed_sha" = "$sha" ]; then
    log "Canvas is already running Git SHA $sha"
    exit 0
fi

immutable_image="${IMAGE_NAME}:${sha}"
log "New Canvas image detected: $immutable_image"
CANVAS_PUBLIC_URL="$PUBLIC_URL" \
YIGEAI_HEALTH_URL="$YIGEAI_HEALTH_URL" \
    "$DEPLOY_SCRIPT" deploy "$immutable_image" "$sha"
