#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <version> <tarball_url> <sha256> [output_file]" >&2
  exit 1
fi

VERSION="$1"
TARBALL_URL="$2"
SHA256="$3"
OUTPUT_FILE="${4:-}"

render_formula() {
  cat <<EOF
class SkillsHub < Formula
  desc "Unify your AI toolbox for managing and syncing agent skills"
  homepage "https://github.com/PotatoDog1669/skills-hub"
  url "${TARBALL_URL}"
  sha256 "${SHA256}"
  license "MIT"
  version "${VERSION}"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/skills-hub --version").strip
  end
end
EOF
}

if [ -n "${OUTPUT_FILE}" ]; then
  mkdir -p "$(dirname "${OUTPUT_FILE}")"
  render_formula > "${OUTPUT_FILE}"
else
  render_formula
fi
