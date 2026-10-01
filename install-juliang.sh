#!/usr/bin/env bash
set -Eeuo pipefail

REPO="wangjontao/3x-ui"
BRANCH="juliang-ui-v1"
GO_VERSION="1.27.1"
NODE_MAJOR="26"
INSTALL_DIR="/usr/local/x-ui"
INSTALL_BIN="${INSTALL_DIR}/x-ui"
SOURCE_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"

say() { printf '\033[1;36m[JuLiang-UI]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[JuLiang-UI]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[JuLiang-UI]\033[0m %s\n' "$*" >&2; exit 1; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || die "Run this installer as root."

case "$(uname -m)" in
  x86_64|amd64) ARCH="amd64"; NODE_ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64"; NODE_ARCH="arm64" ;;
  *) die "Source installer supports amd64 and arm64 only. Current arch: $(uname -m)" ;;
esac

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
else
  die "Cannot detect Linux distribution."
fi

install_build_deps() {
  say "Installing build dependencies..."
  case "${ID:-}" in
    debian|ubuntu|armbian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y ca-certificates curl tar gzip xz-utils git build-essential file
      ;;
    fedora|rhel|almalinux|rocky|ol|amzn|virtuozzo)
      dnf install -y ca-certificates curl tar gzip xz git gcc gcc-c++ make file
      ;;
    centos)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y ca-certificates curl tar gzip xz git gcc gcc-c++ make file
      else
        yum install -y ca-certificates curl tar gzip xz git gcc gcc-c++ make file
      fi
      ;;
    arch|manjaro|parch)
      pacman -Sy --noconfirm ca-certificates curl tar gzip xz git base-devel file
      ;;
    opensuse-tumbleweed|opensuse-leap)
      zypper --non-interactive refresh
      zypper --non-interactive install ca-certificates curl tar gzip xz git gcc gcc-c++ make file
      ;;
    alpine)
      die "Alpine/musl is not supported by this source builder. Use a Debian/Ubuntu/RHEL-family VPS."
      ;;
    *)
      die "Unsupported distribution: ${ID:-unknown}"
      ;;
  esac
}

WORK="$(mktemp -d /tmp/juliang-ui.XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
SRC="$WORK/src"
mkdir -p "$SRC"

fetch() {
  curl -fL --retry 5 --retry-all-errors --retry-delay 2 --connect-timeout 20 "$@"
}

install_build_deps

say "Downloading ${REPO}@${BRANCH}..."
if ! fetch -o "$WORK/source.tar.gz" "$SOURCE_URL"; then
  fetch -o "$WORK/source.tar.gz" "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
fi
tar -xzf "$WORK/source.tar.gz" -C "$SRC" --strip-components=1

grep -q "injectClientEgress" "$SRC/internal/web/service/xray.go" \
  || die "Source validation failed: JuLiang client egress code is missing."
grep -q "JuLiang-UI" "$SRC/frontend/src/layouts/AppSidebar.tsx" \
  || die "Source validation failed: JuLiang-UI branding is missing."

say "Preparing Go ${GO_VERSION}..."
GO_TAR="go${GO_VERSION}.linux-${ARCH}.tar.gz"
fetch -o "$WORK/$GO_TAR" "https://go.dev/dl/${GO_TAR}"
tar -xzf "$WORK/$GO_TAR" -C "$WORK"
export PATH="$WORK/go/bin:$PATH"
export GOTOOLCHAIN=local
go version

say "Preparing Node.js ${NODE_MAJOR}.x..."
fetch -o "$WORK/SHASUMS256.txt" "https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/SHASUMS256.txt"
NODE_FILE="$(awk -v suffix="linux-${NODE_ARCH}.tar.xz" '$2 ~ suffix"$" {print $2; exit}' "$WORK/SHASUMS256.txt")"
[[ -n "$NODE_FILE" ]] || die "Unable to resolve Node.js ${NODE_MAJOR}.x package for ${NODE_ARCH}."
NODE_SHA="$(awk -v f="$NODE_FILE" '$2 == f {print $1; exit}' "$WORK/SHASUMS256.txt")"
NODE_VER="${NODE_FILE#node-}"
NODE_VER="${NODE_VER%-linux-${NODE_ARCH}.tar.xz}"
fetch -o "$WORK/$NODE_FILE" "https://nodejs.org/dist/${NODE_VER}/${NODE_FILE}"
(
  cd "$WORK"
  printf '%s  %s\n' "$NODE_SHA" "$NODE_FILE" | sha256sum -c -
)
tar -xJf "$WORK/$NODE_FILE" -C "$WORK"
export PATH="$WORK/node-${NODE_VER}-linux-${NODE_ARCH}/bin:$PATH"
node --version
npm --version

SOURCE_SHA="$(git ls-remote "https://github.com/${REPO}.git" "refs/heads/${BRANCH}" 2>/dev/null | awk 'NR==1 {print $1}' || true)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

say "Generating frontend schemas and running checks..."
cd "$SRC/frontend"
npm ci --no-audit --no-fund
npm run gen
npm run typecheck
npm test -- src/test/outbound-link-parser.test.ts
npm run build

say "Running JuLiang backend tests..."
cd "$SRC"
go test ./internal/web/service \
  -run 'Test(InjectClientEgress.*|ClientWithInboundFlowStripsPanelOutboundTag)$' \
  -count=1

say "Building JuLiang-UI..."
LDFLAGS="-s -w"
if [[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  LDFLAGS="$LDFLAGS -X github.com/mhsanaei/3x-ui/v3/internal/config.buildCommit=${SOURCE_SHA:0:8}"
  LDFLAGS="$LDFLAGS -X github.com/mhsanaei/3x-ui/v3/internal/config.buildDate=${BUILD_DATE}"
fi
CGO_ENABLED=1 go build -trimpath -ldflags "$LDFLAGS" -o "$WORK/juliang-x-ui" .
[[ -s "$WORK/juliang-x-ui" ]] || die "Build failed: panel binary was not produced."
chmod 755 "$WORK/juliang-x-ui"
file "$WORK/juliang-x-ui" || true

FRESH_INSTALL=0
if [[ ! -x "$INSTALL_BIN" ]]; then
  FRESH_INSTALL=1
  say "No existing 3x-ui runtime found. Installing standard runtime assets first..."
  chmod +x "$SRC/install.sh"
  XUI_NONINTERACTIVE=1 bash "$SRC/install.sh"
fi

[[ -x "$INSTALL_BIN" ]] || die "Runtime bootstrap failed: ${INSTALL_BIN} does not exist."

service_mode=""
detect_service() {
  if command -v systemctl >/dev/null 2>&1 && systemctl cat x-ui.service >/dev/null 2>&1; then
    service_mode="systemd"
  elif command -v rc-service >/dev/null 2>&1 && rc-service x-ui status >/dev/null 2>&1; then
    service_mode="openrc"
  elif [[ -x /usr/bin/x-ui ]]; then
    service_mode="xui"
  else
    service_mode="process"
  fi
}
stop_panel() {
  case "$service_mode" in
    systemd) systemctl stop x-ui ;;
    openrc) rc-service x-ui stop ;;
    xui) /usr/bin/x-ui stop ;;
    process) pkill -f "${INSTALL_BIN}" 2>/dev/null || true ;;
  esac
}
start_panel() {
  case "$service_mode" in
    systemd) systemctl restart x-ui ;;
    openrc) rc-service x-ui restart ;;
    xui) /usr/bin/x-ui restart ;;
    process) "$INSTALL_BIN" >/var/log/x-ui.log 2>&1 & ;;
  esac
}
panel_healthy() {
  case "$service_mode" in
    systemd) systemctl is-active --quiet x-ui ;;
    openrc) rc-service x-ui status >/dev/null 2>&1 ;;
    xui|process) pgrep -f "${INSTALL_BIN}" >/dev/null 2>&1 ;;
  esac
}

detect_service
BACKUP="${INSTALL_BIN}.juliang-backup"
say "Backing up current panel binary..."
cp -a "$INSTALL_BIN" "$BACKUP"

say "Installing JuLiang-UI binary and restarting service..."
stop_panel || true
install -m 755 "$WORK/juliang-x-ui" "$INSTALL_BIN"

start_ok=0
if start_panel; then
  for _ in $(seq 1 15); do
    if panel_healthy; then
      start_ok=1
      break
    fi
    sleep 1
  done
fi

if [[ "$start_ok" -ne 1 ]]; then
  warn "JuLiang-UI failed its startup health check; restoring the previous binary."
  stop_panel || true
  cp -a "$BACKUP" "$INSTALL_BIN"
  chmod 755 "$INSTALL_BIN"
  start_panel || true
  die "Installation rolled back. Check x-ui logs for the startup failure."
fi

install -d -m 700 /etc/x-ui
cat > /etc/x-ui/juliang-ui.env <<EOF
JULIANG_REPO=${REPO}
JULIANG_BRANCH=${BRANCH}
JULIANG_COMMIT=${SOURCE_SHA:-unknown}
JULIANG_BUILD_DATE=${BUILD_DATE}
EOF
chmod 600 /etc/x-ui/juliang-ui.env

cat > /usr/local/bin/juliang-ui <<'EOF'
#!/usr/bin/env bash
set -e
INSTALLER="https://raw.githubusercontent.com/wangjontao/3x-ui/juliang-ui-v1/install-juliang.sh"
case "${1:-}" in
  update)
    curl -fsSL "$INSTALLER" | bash
    ;;
  logs|log)
    exec /usr/bin/x-ui log
    ;;
  start|stop|restart|status|settings)
    exec /usr/bin/x-ui "$1"
    ;;
  *)
    cat <<'HELP'
JuLiang-UI
  juliang-ui status
  juliang-ui restart
  juliang-ui logs
  juliang-ui settings
  juliang-ui update
Compatibility command: x-ui
HELP
    ;;
esac
EOF
chmod 755 /usr/local/bin/juliang-ui

say "JuLiang-UI installation completed."
echo "Management command: juliang-ui"
echo "Compatibility command: x-ui"
echo "Update command: juliang-ui update"
if [[ -f /etc/x-ui/install-result.env ]]; then
  echo
  echo "Panel installation details:"
  grep -E '^(XUI_ACCESS_URL|XUI_USERNAME|XUI_PASSWORD|XUI_PANEL_PORT|XUI_WEB_BASE_PATH)=' /etc/x-ui/install-result.env || true
elif [[ "$FRESH_INSTALL" -eq 1 ]]; then
  warn "No /etc/x-ui/install-result.env found; run 'x-ui settings' to inspect panel settings."
fi
