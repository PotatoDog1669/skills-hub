<p align="center">
  <img src="docs/banner.svg" alt="Skills Hub" width="400">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://github.com/PotatoDog1669/skills-hub/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8D8" alt="Tauri">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status">
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | English
</p>

## Overview

**Skills Hub** is a local-first control center for AI agent capabilities. It provides a unified **Tauri desktop** and **CLI** workflow for discovering, importing, organizing, and syncing Skills, while also managing **instruction templates, skills packages, Kits, Providers, and official presets**.

| <img src="docs/dashboard.png" alt="Skills Hub Dashboard" width="100%">                                                                                                                                                                                                                                                                                                                                                                                                      |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Skills Hub Desktop UI** is your local control plane. You can browse Hub skills, import GitHub skills, manage projects and agents, compose Kits, switch Providers, and sync capabilities to different coding agents without depending on a hosted cloud workflow. |

## Current Capabilities

- Use **Central Hub** as the single source of truth for reusable Skills.
- Import Skills from GitHub repositories, branch links, and `tree` subdirectory links, or create new Skills directly in the desktop app.
- Sync Hub Skills to many supported agents in **copy** or **link** mode, and save project-side changes back into Hub.
- Project discovery is **Git-only**: both auto-scan and manual add require the target directory to live inside a Git work tree. Path input prefers the system folder picker and falls back to manual entry when needed.
- Open **Skills Market** links from the desktop app, then paste repository URLs back into Hub for import.
- Manage **instruction templates** (`AGENTS.md` / `CLAUDE.md`) with drag-and-drop import, GitHub import, and manual editing.
- Build **skills packages** from Hub Skills, or import reusable packages directly from a repository with `kit package-import`.
- Compose templates and skills packages into **Kits**, then apply them to a target project and agent in one step.
- Install bundled **Official Presets**, which materialize as local policy templates, skills packages, and Kits. The desktop app can also restore the managed baseline for official Kits later.
- Manage app-specific **Claude / Codex / Gemini Providers** plus **Universal Providers** with switch, restore, capture-live, and re-apply workflows.

## Supported Agents

Skills Hub can sync to a broad set of coding agents, including Antigravity, Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, Trae, Windsurf, Qwen Code, and more.

👉 **[View the full supported agent list and default paths](./docs/supported-agents.md)**

## Download & Installation

### System Requirements

- Node.js 18+ for the CLI and source builds
- Rust toolchain (`rustup`) for desktop (Tauri) source builds
- Tauri platform prerequisites for your OS: [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### App (macOS)

```bash
curl -fLsS https://raw.githubusercontent.com/PotatoDog1669/skills-hub/main/install.sh | sh
```

Upgrade:

```bash
curl -fLsS https://raw.githubusercontent.com/PotatoDog1669/skills-hub/main/install.sh | sh
```

### CLI

#### CLI via Homebrew (macOS/Linux)

```bash
brew tap PotatoDog1669/skillshub
brew install skills-hub
skills-hub --version
```

Upgrade:

```bash
brew update
brew upgrade skills-hub
```

#### CLI via npm

Install globally:

```bash
npm i -g @skillshub-labs/cli
skills-hub --help
```

Run without global install:

```bash
npx @skillshub-labs/cli --help
```

Upgrade:

```bash
npm i -g @skillshub-labs/cli@latest
```

### Build from Source (Desktop App)

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm ci
npm run tauri:dev
```

Create desktop bundles:

```bash
npm run tauri:build
```

Output directory:

- `src-tauri/target/release/bundle/`

### Releases

- Latest releases: [GitHub Releases](https://github.com/PotatoDog1669/skills-hub/releases)
- Current releases include changelog plus source archives (`zipball` / `tarball`)
- Desktop assets include installer archives and DMG fallbacks:
  - `skills-hub_X.Y.Z_macos_aarch64.tar.gz`
  - `skills-hub_X.Y.Z_macos_x64.tar.gz`
  - `skills-hub_X.Y.Z_macos_aarch64.dmg`
  - `skills-hub_X.Y.Z_macos_x64.dmg`

## CLI Command Overview

| Command | Description |
| :--- | :--- |
| `skills-hub list` / `skills-hub ls` | List installed Skills (project scope by default; supports `--global` and `--hub`) |
| `skills-hub remove` / `skills-hub rm` | Remove installed Skills (supports `--all`, `--global`, `--hub`, and `--agent`) |
| `skills-hub import <url>` | Import into Hub, or install directly to target agents (supports `--branch`, `--list`, `-a/--agent`, `-g/--global`, and `--copy`) |
| `skills-hub sync --all` / `skills-hub sync --target <name>` | Sync Hub Skills to all enabled agents, or a single target agent |
| `skills-hub provider list/add/update/delete` | Manage Claude / Codex / Gemini provider profiles |
| `skills-hub provider switch/restore/capture` | Switch the current provider, restore the latest live backup, or capture the live config into a provider profile |
| `skills-hub provider universal-list/add/apply/delete` | Manage and reuse Universal Providers |
| `skills-hub kit policy-*` | Manage local instruction templates (`policy-list/add/update/delete`) |
| `skills-hub kit package-*` | Manage local skills packages (`package-list/add/update/delete`) |
| `skills-hub kit package-import --url <repoOrTreeUrl>` | Import a reusable skills package from a repository into local Hub/Kit assets |
| `skills-hub kit preset-list/search/inspect/install` | Browse, search, inspect, and install bundled Official Presets |
| `skills-hub kit add/update/delete/apply` | Manage local Kits and apply them to a target project + agent |
| `skills-hub official list/search/inspect/install` | Backward-compatible aliases for `kit preset-*` |

Notes:

- `skills-hub kit ...` is the primary entry point for templates, skills packages, Kits, and official presets.
- `package-*` is the primary user-facing name; `loadout-*` remains available as a compatibility alias.
- `official ...` is a compatibility entry point for `kit preset-*`; the recommended form is still `skills-hub kit preset-*`.

### Import / List / Remove Quick Examples

```bash
# Import to Hub only (backward-compatible behavior)
skills-hub import https://github.com/owner/repo

# List installable skills from the remote source only
skills-hub import https://github.com/owner/repo --list

# Import and install to Codex in the current project (default mode: symlink)
skills-hub import https://github.com/owner/repo -a codex

# Install globally and use copy mode
skills-hub import https://github.com/owner/repo -g -a codex --copy

# Overwrite conflicts without prompting
skills-hub import https://github.com/owner/repo -y

# Inspect global installation scope or Hub storage
skills-hub ls --global
skills-hub list --hub

# Remove installed skills or remove in bulk
skills-hub rm my-skill -a codex
skills-hub remove --all -g -a codex
skills-hub remove my-skill --hub
```

### Kit / Official Preset Quick Examples

```bash
# Import a reusable skills package from a repository
skills-hub kit package-import --url https://github.com/owner/repo/tree/main/skills

# Explore bundled official presets
skills-hub kit preset-list
skills-hub kit preset-search nextjs
skills-hub kit preset-inspect --id demo-web

# Install an official preset (legacy alias still works)
skills-hub kit preset-install --id demo-web
skills-hub official install --id demo-web
```

## Development

For contributors who want to modify the source code:

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm ci
npm run tauri:dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

When you need desktop bundles:

```bash
npm run tauri:build
```

If you changed `src-tauri`, also run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Reusable release notes references for maintainers:

- `docs/release-notes-template.md`
- `docs/homebrew-tap-setup.md`

## Contributing

We welcome contributions. Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to get started.

Please follow our [Code of Conduct](docs/CODE_OF_CONDUCT.md) in all interactions.

Please report security issues privately according to [SECURITY.md](SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
