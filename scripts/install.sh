#!/usr/bin/env bash
set -euo pipefail

REPO="bot-uichan/git-ai-commit"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="latest"

usage() {
  cat <<'EOF'
Install git-ai-commit from GitHub Releases.

Usage:
  install.sh [-v <version>] [-b <install_dir>]

Options:
  -v <version>   Release tag (e.g. v0.1.5). Default: latest
  -b <dir>       Install directory. Default: ~/.local/bin
  -h             Show help
EOF
}

while getopts ":v:b:h" opt; do
  case "$opt" in
    v) VERSION="$OPTARG" ;;
    b) INSTALL_DIR="$OPTARG" ;;
    h) usage; exit 0 ;;
    \?) echo "Unknown option: -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *)
    echo "Unsupported OS: $uname_s" >&2
    exit 1
    ;;
esac

case "$uname_m" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "Unsupported architecture: $uname_m" >&2
    exit 1
    ;;
esac

asset="git-ai-commit-${os}-${arch}"
base_url="https://github.com/${REPO}/releases"
if [[ "$VERSION" == "latest" ]]; then
  asset_url="${base_url}/latest/download/${asset}"
  checksum_url="${base_url}/latest/download/${asset}.sha256"
else
  asset_url="${base_url}/download/${VERSION}/${asset}"
  checksum_url="${base_url}/download/${VERSION}/${asset}.sha256"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "⬇️  Downloading ${asset}..."
curl -fL "$asset_url" -o "$tmpdir/$asset"
curl -fL "$checksum_url" -o "$tmpdir/$asset.sha256"

(
  cd "$tmpdir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$asset.sha256"
  else
    expected="$(awk '{print $1}' "$asset.sha256")"
    actual="$(shasum -a 256 "$asset" | awk '{print $1}')"
    if [[ "$expected" != "$actual" ]]; then
      echo "Checksum mismatch: expected $expected actual $actual" >&2
      exit 1
    fi
  fi
)

mkdir -p "$INSTALL_DIR"
install -m 755 "$tmpdir/$asset" "$INSTALL_DIR/git-ai-commit"

echo "✅ Installed to: $INSTALL_DIR/git-ai-commit"
if ! command -v git-ai-commit >/dev/null 2>&1; then
  echo "ℹ️  Add to PATH if needed: export PATH=\"$INSTALL_DIR:\$PATH\""
fi
