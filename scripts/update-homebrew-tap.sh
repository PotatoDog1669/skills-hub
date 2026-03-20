#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <version> <arm64_dmg> <x64_dmg>" >&2
  exit 1
fi

if [ -z "${HOMEBREW_TAP_GITHUB_TOKEN:-}" ]; then
  echo "HOMEBREW_TAP_GITHUB_TOKEN is required" >&2
  exit 1
fi

VERSION="${1#v}"
ARM64_DMG="$2"
X64_DMG="$3"
PACKAGE_NAME="${PACKAGE_NAME:-@skillshub-labs/cli}"
TAP_REPO="${HOMEBREW_TAP_REPO:-PotatoDog1669/homebrew-skillshub}"
AUTHED_TAP_REMOTE="https://github-actions:${HOMEBREW_TAP_GITHUB_TOKEN}@github.com/${TAP_REPO}.git"
TAP_DIR="tap-repo"

TAP_ACCESS_STATUS="$(
  curl -sS \
    -o "${RUNNER_TEMP:-/tmp}/tap-repo-check.json" \
    -w "%{http_code}" \
    -H "Authorization: Bearer ${HOMEBREW_TAP_GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${TAP_REPO}"
)"

if [ "${TAP_ACCESS_STATUS}" != "200" ]; then
  echo "::error::Unable to access ${TAP_REPO} with HOMEBREW_TAP_GITHUB_TOKEN (HTTP ${TAP_ACCESS_STATUS}). Use a PAT or GitHub App installation token that can access the tap repo. The default GITHUB_TOKEN from this repository cannot push to a different repository." >&2
  echo "::error::If you are using a fine-grained PAT, grant access to ${TAP_REPO} and repository Contents write permission. If the tap repo belongs to an organization with SSO, authorize the token for that organization." >&2
  cat "${RUNNER_TEMP:-/tmp}/tap-repo-check.json" >&2 || true
  exit 1
fi

for attempt in {1..12}; do
  TARBALL_URL="$(npm view "${PACKAGE_NAME}@${VERSION}" dist.tarball --silent || true)"
  if [ -n "${TARBALL_URL}" ]; then
    break
  fi
  echo "Waiting for npm metadata (${attempt}/12)..."
  sleep 10
done

if [ -z "${TARBALL_URL:-}" ]; then
  echo "Failed to resolve npm tarball URL for ${PACKAGE_NAME}@${VERSION}" >&2
  exit 1
fi

SHA256="$(curl -fsSL "${TARBALL_URL}" | shasum -a 256 | awk '{print $1}')"
ARM64_SHA256="$(shasum -a 256 "${ARM64_DMG}" | awk '{print $1}')"
X64_SHA256="$(shasum -a 256 "${X64_DMG}" | awk '{print $1}')"

rm -rf "${TAP_DIR}"
git clone "${AUTHED_TAP_REMOTE}" "${TAP_DIR}"

bash ./scripts/render-homebrew-formula.sh \
  "${VERSION}" \
  "${TARBALL_URL}" \
  "${SHA256}" \
  "${TAP_DIR}/Formula/skills-hub.rb"
bash ./scripts/render-homebrew-cask.sh \
  "${VERSION}" \
  "${ARM64_SHA256}" \
  "${X64_SHA256}" \
  "${TAP_DIR}/Casks/skills-hub.rb"

cd "${TAP_DIR}"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if [ -z "$(git status --porcelain -- Formula/skills-hub.rb Casks/skills-hub.rb)" ]; then
  echo "Formula and cask are already up to date."
  exit 0
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git add Formula/skills-hub.rb Casks/skills-hub.rb
git commit -m "skills-hub ${VERSION}"
git push "${AUTHED_TAP_REMOTE}" "HEAD:${CURRENT_BRANCH}"
