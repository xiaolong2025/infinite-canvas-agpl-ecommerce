#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-infinite-canvas}"
ROOT_DIR="${CANVAS_ROOT_DIR:-/opt/infinite-canvas}"
COMPOSE_FILE="${CANVAS_COMPOSE_FILE:-$ROOT_DIR/docker-compose.server.yml}"
NGINX_TEMPLATE="${CANVAS_NGINX_TEMPLATE:-$ROOT_DIR/canvas.yigeai.work.conf}"
NGINX_CONFIG="${CANVAS_NGINX_CONFIG:-/etc/nginx/conf.d/canvas.yigeai.work.conf}"
STATE_FILE="${CANVAS_STATE_FILE:-$ROOT_DIR/current-version}"
LOG_DIR="${CANVAS_LOG_DIR:-$ROOT_DIR/logs}"
BACKUP_DIR="${CANVAS_NGINX_BACKUP_DIR:-$ROOT_DIR/nginx-backups}"
PUBLIC_URL="${CANVAS_PUBLIC_URL:-https://canvas.yigeai.work/}"
YIGEAI_HEALTH_URL="${YIGEAI_HEALTH_URL:-}"
RUNTIME_ENV_FILE="${CANVAS_RUNTIME_ENV_FILE:-$ROOT_DIR/runtime.env}"
PERSISTENT_DATA_DIR="${CANVAS_DATA_DIR:-$ROOT_DIR/data}"
PORT_A="${CANVAS_PORT_A:-3100}"
PORT_B="${CANVAS_PORT_B:-3101}"

log() {
    printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
    log "ERROR: $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

run_root() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo -n "$@"
    fi
}

state_value() {
    local key="$1"
    [ -f "$STATE_FILE" ] || return 0
    sed -n "s/^${key}=//p" "$STATE_FILE" | head -n 1
}

validate_sha() {
    [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "Git SHA must be the full 40-character lowercase SHA"
}

validate_image() {
    local image="$1"
    local sha="$2"
    [[ "$image" == ghcr.io/* ]] || die "Only a user-owned GHCR image is accepted"
    [[ "$image" != ghcr.io/basketikun/infinite-canvas:* ]] || die "The author's image is forbidden"
    [[ "$image" != *":latest" ]] || die "The latest tag is not accepted for deployment"
    [[ "$image" == *":$sha" ]] || die "Image tag must equal the supplied full Git SHA"
}

container_name_for_port() {
    printf '%s-%s' "$APP_NAME" "$1"
}

compose_project_for_port() {
    printf '%s-%s' "$APP_NAME" "$1"
}

container_running() {
    [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]
}

wait_for_health() {
    local port="$1"
    local attempts="${2:-30}"
    local index
    for ((index = 1; index <= attempts; index++)); do
        if curl --fail --silent --show-error "http://127.0.0.1:${port}/healthz" >/dev/null; then
            return 0
        fi
        sleep 2
    done
    return 1
}

check_static_assets() {
    local port="$1"
    local base="http://127.0.0.1:${port}"
    local index_html asset_path extension
    index_html="$(curl --fail --silent --show-error "${base}/")"
    for extension in js css; do
        asset_path="$(printf '%s' "$index_html" | grep -oE "/assets/[^\"']+\\.${extension}" | head -n 1 || true)"
        [ -n "$asset_path" ] || return 1
        curl --fail --silent --show-error "${base}${asset_path}" >/dev/null || return 1
    done
}

check_build_sha() {
    local port="$1"
    local sha="$2"
    local build_info
    build_info="$(curl --fail --silent --show-error "http://127.0.0.1:${port}/build-info.json")"
    printf '%s' "$build_info" | grep -F "\"gitSha\":\"${sha}\"" >/dev/null
}

check_public_build_sha() {
    local sha="$1"
    local build_info
    build_info="$(curl --fail --silent --show-error "${PUBLIC_URL%/}/build-info.json")"
    printf '%s' "$build_info" | grep -F "\"gitSha\":\"${sha}\"" >/dev/null
}

check_yigeai_health() {
    [ -n "$YIGEAI_HEALTH_URL" ] || die "YIGEAI_HEALTH_URL is required before deployment"
    curl --fail --silent --show-error "$YIGEAI_HEALTH_URL" >/dev/null
}

render_nginx_config() {
    local port="$1"
    local target="$2"
    sed "s/__CANVAS_PORT__/${port}/g" "$NGINX_TEMPLATE" > "$target"
    grep -F "127.0.0.1:${port}" "$target" >/dev/null || die "Rendered Nginx config does not contain candidate port"
}

restore_nginx_config() {
    local backup="$1"
    if [ -n "$backup" ] && [ -f "$backup" ]; then
        run_root install -m 0644 "$backup" "$NGINX_CONFIG"
    else
        run_root rm -f "$NGINX_CONFIG"
    fi
    run_root nginx -t
    run_root nginx -s reload
}

switch_nginx() {
    local port="$1"
    local rendered backup=""
    rendered="$(mktemp)"
    render_nginx_config "$port" "$rendered"
    if [ -f "$NGINX_CONFIG" ]; then
        backup="$BACKUP_DIR/nginx-$(date -u +'%Y%m%dT%H%M%SZ').conf"
        run_root install -d -m 0755 "$BACKUP_DIR"
        run_root cp -a "$NGINX_CONFIG" "$backup"
    fi
    run_root install -m 0644 "$rendered" "$NGINX_CONFIG"
    rm -f "$rendered"
    if ! run_root nginx -t; then
        restore_nginx_config "$backup"
        die "Nginx configuration check failed; previous config restored"
    fi
    run_root nginx -s reload
    printf '%s' "$backup"
}

write_state() {
    local current_port="$1"
    local current_image="$2"
    local current_sha="$3"
    local previous_port="$4"
    local previous_image="$5"
    local previous_sha="$6"
    local temp
    temp="$(mktemp)"
    {
        printf 'CURRENT_PORT=%s\n' "$current_port"
        printf 'CURRENT_IMAGE=%s\n' "$current_image"
        printf 'CURRENT_SHA=%s\n' "$current_sha"
        printf 'PREVIOUS_PORT=%s\n' "$previous_port"
        printf 'PREVIOUS_IMAGE=%s\n' "$previous_image"
        printf 'PREVIOUS_SHA=%s\n' "$previous_sha"
        printf 'UPDATED_AT=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    } > "$temp"
    install -d -m 0755 "$ROOT_DIR"
    install -m 0644 "$temp" "$STATE_FILE"
    rm -f "$temp"
}

capture_candidate_logs() {
    local container="$1"
    local sha="$2"
    install -d -m 0755 "$LOG_DIR"
    docker logs "$container" > "$LOG_DIR/${sha}.log" 2>&1 || true
}

start_candidate() {
    local image="$1"
    local container="$2"
    local port="$3"
    local project="$4"
    if docker compose version >/dev/null 2>&1; then
        CANVAS_IMAGE="$image" CANVAS_CONTAINER="$container" CANVAS_PORT="$port" CANVAS_RUNTIME_ENV_FILE="$RUNTIME_ENV_FILE" CANVAS_DATA_DIR="$PERSISTENT_DATA_DIR" \
            docker compose -p "$project" -f "$COMPOSE_FILE" up -d --no-build app
        return
    fi

    log "Docker Compose plugin is unavailable; using equivalent docker run"
    docker run -d \
        --name "$container" \
        --restart unless-stopped \
        --security-opt no-new-privileges:true \
        -p "127.0.0.1:${port}:3000" \
        --env-file "$RUNTIME_ENV_FILE" \
        -v "$PERSISTENT_DATA_DIR:/app/data" \
        -e "ANALYTICS_GA4_ID=${ANALYTICS_GA4_ID:-}" \
        -e "ANALYTICS_BAIDU_ID=${ANALYTICS_BAIDU_ID:-}" \
        "$image" >/dev/null
}

deploy() {
    local image="${1:-}"
    local sha="${2:-}"
    [ -n "$image" ] || die "Usage: deploy.sh deploy <ghcr-image:full-sha> <full-sha>"
    validate_sha "$sha"
    validate_image "$image" "$sha"
    [ -f "$COMPOSE_FILE" ] || die "Missing Compose file: $COMPOSE_FILE"
    [ -f "$NGINX_TEMPLATE" ] || die "Missing Nginx template: $NGINX_TEMPLATE"
    [ -f "$RUNTIME_ENV_FILE" ] || die "Missing runtime environment file: $RUNTIME_ENV_FILE"
    run_root install -d -m 0770 -o 1000 -g 1000 "$PERSISTENT_DATA_DIR"

    local current_port current_image current_sha candidate_port candidate_container project
    current_port="$(state_value CURRENT_PORT)"
    current_image="$(state_value CURRENT_IMAGE)"
    current_sha="$(state_value CURRENT_SHA)"
    if [ "$current_port" = "$PORT_A" ]; then
        candidate_port="$PORT_B"
    else
        candidate_port="$PORT_A"
    fi
    candidate_container="$(container_name_for_port "$candidate_port")"
    project="$(compose_project_for_port "$candidate_port")"

    log "Deploying Git SHA: $sha"
    log "Deploying image: $image"
    log "Current port: ${current_port:-none}; candidate port: $candidate_port"
    check_yigeai_health
    docker pull "$image"

    if docker inspect "$candidate_container" >/dev/null 2>&1; then
        [ "$candidate_port" != "$current_port" ] || die "Refusing to replace the active container"
        capture_candidate_logs "$candidate_container" "replaced-${sha}"
        docker rm -f "$candidate_container" >/dev/null
    fi

    start_candidate "$image" "$candidate_container" "$candidate_port" "$project"

    if ! wait_for_health "$candidate_port"; then
        capture_candidate_logs "$candidate_container" "$sha"
        docker rm -f "$candidate_container" >/dev/null || true
        die "Candidate health check failed; active version was not changed"
    fi
    if ! check_static_assets "$candidate_port"; then
        capture_candidate_logs "$candidate_container" "$sha"
        docker rm -f "$candidate_container" >/dev/null || true
        die "Candidate static asset check failed; active version was not changed"
    fi
    if ! check_build_sha "$candidate_port" "$sha"; then
        capture_candidate_logs "$candidate_container" "$sha"
        docker rm -f "$candidate_container" >/dev/null || true
        die "Candidate build SHA does not match ${sha}; active version was not changed"
    fi

    local nginx_backup
    nginx_backup="$(switch_nginx "$candidate_port")"
    if ! curl --fail --silent --show-error "$PUBLIC_URL" >/dev/null || ! check_public_build_sha "$sha"; then
        restore_nginx_config "$nginx_backup"
        capture_candidate_logs "$candidate_container" "$sha"
        die "Public page or build SHA check failed; Nginx was restored to the previous port"
    fi
    check_yigeai_health
    write_state "$candidate_port" "$image" "$sha" "$current_port" "$current_image" "$current_sha"
    log "Deployment completed: $image on port $candidate_port"
}

rollback() {
    local current_port current_image current_sha previous_port previous_image previous_sha previous_container nginx_backup
    current_port="$(state_value CURRENT_PORT)"
    current_image="$(state_value CURRENT_IMAGE)"
    current_sha="$(state_value CURRENT_SHA)"
    previous_port="$(state_value PREVIOUS_PORT)"
    previous_image="$(state_value PREVIOUS_IMAGE)"
    previous_sha="$(state_value PREVIOUS_SHA)"
    [ -n "$previous_port" ] || die "No previous deployment is recorded"
    previous_container="$(container_name_for_port "$previous_port")"
    container_running "$previous_container" || die "Previous container is not running: $previous_container"
    wait_for_health "$previous_port" || die "Previous container health check failed"
    [ -z "$previous_sha" ] || check_build_sha "$previous_port" "$previous_sha"
    check_yigeai_health
    nginx_backup="$(switch_nginx "$previous_port")"
    if ! curl --fail --silent --show-error "$PUBLIC_URL" >/dev/null; then
        restore_nginx_config "$nginx_backup"
        die "Rollback public check failed; Nginx was restored"
    fi
    check_yigeai_health
    write_state "$previous_port" "$previous_image" "$previous_sha" "$current_port" "$current_image" "$current_sha"
    log "Rollback completed: $previous_image on port $previous_port"
}

status() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        log "No deployment state recorded"
    fi
    docker ps --filter "name=${APP_NAME}-" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
}

require_command curl
require_command docker
require_command nginx
require_command sed
require_command grep

case "${1:-}" in
    deploy)
        shift
        deploy "$@"
        ;;
    rollback)
        rollback
        ;;
    status)
        status
        ;;
    *)
        die "Usage: deploy.sh {deploy <image:full-sha> <full-sha>|rollback|status}"
        ;;
esac
