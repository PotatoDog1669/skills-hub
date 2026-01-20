# Supported Agents

Skills Hub supports synchronization with a wide range of AI agents. Below is the complete list of supported agents and their default paths.

## Agent Path Configuration

| Agent Name         | Global Path (Sync Target)      | Project Path (Scan Target) | Enabled by Default |
| :----------------- | :----------------------------- | :------------------------- | :----------------- |
| **Antigravity**    | `~/.gemini/antigravity/skills` | `.agent/skills`            | ✅                 |
| **Claude Code**    | `~/.claude/skills`             | `.claude/skills`           | ✅                 |
| **Cursor**         | `~/.cursor/skills`             | `.cursor/skills`           | ✅                 |
| **Trae**           | `~/.trae/skills`               | `.trae/skills`             | ❌                 |
| **Windsurf**       | `~/.codeium/windsurf/skills`   | `.windsurf/skills`         | ❌                 |
| **OpenCode**       | `~/.config/opencode/skill`     | `.opencode/skill`          | ❌                 |
| **Codex**          | `~/.codex/skills`              | `.codex/skills`            | ❌                 |
| **Amp**            | `~/.config/agents/skills`      | `.agents/skills`           | ❌                 |
| **Kilo Code**      | `~/.kilocode/skills`           | `.kilocode/skills`         | ❌                 |
| **Roo Code**       | `~/.roo/skills`                | `.roo/skills`              | ❌                 |
| **Goose**          | `~/.config/goose/skills`       | `.goose/skills`            | ❌                 |
| **Gemini CLI**     | `~/.gemini/skills`             | `.gemini/skills`           | ❌                 |
| **GitHub Copilot** | `~/.copilot/skills`            | `.github/skills`           | ❌                 |
| **Clawdbot**       | `~/.clawdbot/skills`           | `skills`                   | ❌                 |
| **Droid**          | `~/.factory/skills`            | `.factory/skills`          | ❌                 |
| **Qoder**          | `~/.qoder/skills`              | `.qoder/skills`            | ❌                 |

> **Note:** "Enabled by Default" refers to the default configuration. You can enable or disable any agent in the Skills Hub settings or configuration file.

## How it Works

- **Global Path**: Where Skills Hub copies skills to when you click "Sync". All projects using this agent will share these skills.
- **Project Path**: Where Skills Hub looks for skills when scanning your workspace for projects.
