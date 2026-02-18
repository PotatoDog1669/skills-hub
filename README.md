<p align="center">
  <img src="docs/banner.svg" alt="Skills Hub" width="400">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8D8" alt="Tauri">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status">
</p>

<p align="center">
  English | <a href="./README_zh.md">简体中文</a>
</p>

**Skills Hub** is a centralized management tool for AI Agent Skills, providing a unified workflow for discovery, management, and synchronization via **Tauri Desktop** and **CLI**.

| <img src="docs/dashboard.png" alt="Skills Hub Dashboard" width="100%">                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills Hub Desktop UI** is your local control center for AI skills. It allows you to **visually discover and inspect** your skill library, **import new capabilities** directly from GitHub repositories, and **synchronize** them to your favorite coding agents (Antigravity, Claude, Cursor) with a single click—ensuring your agents always have the latest tools without leaving your local environment. It supports both **Copy** (stable) and **Symbolic Link** (live development) synchronization modes. |

## Supported Agents

Skills Hub supports synchronization with a wide range of AI agents, including Antigravity, Claude Code, Cursor, Trae, and [many more](./docs/supported-agents.md).

👉 **[View Full List of Supported Agents & Paths](./docs/supported-agents.md)**

## Project Discovery

- Auto scan is **Git-only**: Scan Roots only add directories that are inside a Git work tree.
- Manual project add is also **Git-only**.
- Path inputs now support a system folder picker first, with manual path input as fallback.
- CLI supports incremental scan cache at `~/.skills-hub/cache/project-scan.json` via `skills-hub scan-projects` (`--force` bypasses cache).

## Download & Installation

### System Requirements

- Node.js 18+ (required for CLI and source builds)
- Rust toolchain (`rustup`) for Desktop (Tauri) source build
- Tauri platform prerequisites for your OS: [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Option A: Homebrew (macOS/Linux)

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

### Option B: CLI via npm

Install globally:

```bash
npm i -g @potatodog1669/skills-hub
skills-hub --help
```

Run without global install:

```bash
npx @potatodog1669/skills-hub --help
```

Upgrade:

```bash
npm i -g @potatodog1669/skills-hub@latest
```

### Option C: Build Desktop App from Source

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
- Current releases include changelog + source archives (`zipball` / `tarball`).
- If desktop installer assets are attached to a release, prefer those assets for end users.

## CLI Command Overview

| Command                                   | Description                                                                     |
| :---------------------------------------- | :------------------------------------------------------------------------------ |
| `skills-hub list`                         | List all skills in your Central Hub (`~/skills-hub`)                            |
| `skills-hub diagnose [--json]`            | Diagnose skill requirements and print missing reasons + fix suggestions          |
| `skills-hub diagnose --project <path> --agent <path>` | Include project/agent skill roots in diagnostics                     |
| `skills-hub scan-projects [--force]`      | Scan configured `scanRoots` with incremental cache (`--force` for full rescan)  |
| `skills-hub conflicts`                    | Detect duplicate `plugin_id` and cross-source skill directory name conflicts     |
| `skills-hub conflicts --json`             | Output machine-readable conflict details (type, paths, and suggested resolution) |
| `skills-hub import <url>`                 | Import a skill from GitHub (supports branch: `--branch main`)                   |
| `skills-hub sync --all`                   | Sync Hub skills to all enabled agents (Antigravity, Claude, Cursor, etc.)       |
| `skills-hub sync --target <name>`         | Sync to a specific agent (e.g., `--target claude` syncs to `~/.claude/skills/`) |
| `skills-hub snapshot list`                | List rollback snapshots created before `sync` / `kit apply`                      |
| `skills-hub snapshot rollback --id <id>`  | Roll back to a specific snapshot                                                  |
| `skills-hub snapshot rollback --last`     | Roll back to the latest snapshot                                                  |
| `skills-hub provider list`                | List provider profiles (`claude`, `codex`, `gemini`)                            |
| `skills-hub provider add ...`             | Add a provider with `--app --name --config-json` or `--config-file`             |
| `skills-hub provider switch ...`          | Switch current provider with backfill + backup + atomic write                   |
| `skills-hub provider restore ...`         | Restore latest live config backup for an app                                    |
| `skills-hub provider capture ...`         | Capture current live config as an official account provider                     |
| `skills-hub provider universal-add ...`   | Create one universal API provider and sync to multiple apps                     |
| `skills-hub provider universal-list`      | List all universal providers                                                    |
| `skills-hub provider universal-apply ...` | Re-apply a universal provider to enabled apps                                   |
| `skills-hub kit policy-*`                 | Manage AGENTS.md templates (`policy-list/add/update/delete`)                    |
| `skills-hub kit loadout-*`                | Manage skill packages (`loadout-list/add/update/delete`)                        |
| `skills-hub kit add/update/delete/apply`  | Compose Kit and apply it to target project + agent                              |
| `skills-hub profile list/add/update/delete` | Manage project profile bindings (`project -> kit/provider`)                    |
| `skills-hub profile apply ...`            | Apply project/default profile to target project (kit + provider switch)         |

Snapshot retention keeps the latest 20 entries by default. Override with:

```bash
export SKILLS_HUB_SNAPSHOT_RETENTION=30
```

### Development

For contributors who want to modify the source code:

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm ci
npm run tauri:dev
```

For maintainers, a reusable release notes template is available at:
- `docs/release-notes-template.md`
- `docs/homebrew-tap-setup.md`

## Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details on how to get started.

Please adhere to our [Code of Conduct](docs/CODE_OF_CONDUCT.md) in all interactions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
