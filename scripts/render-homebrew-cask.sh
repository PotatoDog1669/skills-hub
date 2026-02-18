#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <version> <arm64_sha256> <x64_sha256> [output_file]" >&2
  exit 1
fi

VERSION="$1"
ARM64_SHA256="$2"
X64_SHA256="$3"
OUTPUT_FILE="${4:-}"

render_cask() {
  cat <<EOF
cask "skills-hub" do
  version "${VERSION}"
  sha256 arm: "${ARM64_SHA256}", intel: "${X64_SHA256}"

  arch arm: "aarch64", intel: "x64"

  url "https://github.com/PotatoDog1669/skills-hub/releases/download/v#{version}/skills-hub_#{version}_macos_#{arch}.dmg"
  name "Skills Hub"
  desc "Unify your AI toolbox for managing and syncing agent skills"
  homepage "https://github.com/PotatoDog1669/skills-hub"

  app "Skills Hub.app"
end
EOF
}

if [ -n "${OUTPUT_FILE}" ]; then
  mkdir -p "$(dirname "${OUTPUT_FILE}")"
  render_cask > "${OUTPUT_FILE}"
else
  render_cask
fi
