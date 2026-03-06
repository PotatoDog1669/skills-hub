#!/bin/sh
set -eu

REPO="${SKILLS_HUB_REPO:-PotatoDog1669/skills-hub}"
APP_NAME="Skills Hub.app"
INSTALL_ROOT="${SKILLS_HUB_INSTALL_DIR:-}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Skills Hub desktop installer currently supports macOS only." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64)
    ASSET_ARCH="aarch64"
    ;;
  x86_64)
    ASSET_ARCH="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $ARCH" >&2
    exit 1
    ;;
esac

if [ -n "${SKILLS_HUB_VERSION:-}" ]; then
  VERSION="$SKILLS_HUB_VERSION"
  TAG="v${VERSION}"
else
  LATEST_URL="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest")"
  TAG="${LATEST_URL##*/}"
  case "$TAG" in
    v*)
      VERSION="${TAG#v}"
      ;;
    *)
      echo "Unable to resolve the latest Skills Hub release tag." >&2
      exit 1
      ;;
  esac
fi

if [ -z "$INSTALL_ROOT" ]; then
  if [ -w "/Applications" ]; then
    INSTALL_ROOT="/Applications"
  else
    INSTALL_ROOT="$HOME/Applications"
    mkdir -p "$INSTALL_ROOT"
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

ASSET="skills-hub_${VERSION}_macos_${ASSET_ARCH}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
ARCHIVE_PATH="${TMP_DIR}/${ASSET}"
APP_PATH="${INSTALL_ROOT}/${APP_NAME}"

echo "Downloading ${URL}"
curl -fL "${URL}" -o "${ARCHIVE_PATH}"

tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

if [ ! -d "${TMP_DIR}/${APP_NAME}" ]; then
  echo "Archive did not contain ${APP_NAME}." >&2
  exit 1
fi

rm -rf "${APP_PATH}"
ditto "${TMP_DIR}/${APP_NAME}" "${APP_PATH}"
xattr -dr com.apple.quarantine "${APP_PATH}" 2>/dev/null || true

echo "Installed Skills Hub to ${APP_PATH}"
open "${APP_PATH}"
