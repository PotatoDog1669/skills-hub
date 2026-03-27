# Supported Agents

Skills Hub supports synchronization with a wide range of AI agents. Below is the complete list of supported agents and their default paths.

## Agent Path Configuration

| Agent Name         | Global Path (Sync Target)      | Project Path (Scan Target) |
| :----------------- | :----------------------------- | :------------------------- |
| **Antigravity**    | `~/.gemini/antigravity/skills` | `.agent/skills`            |
| **Claude Code**    | `~/.claude/skills`             | `.claude/skills`           |
| **Cursor**         | `~/.cursor/skills`             | `.cursor/skills`           |
| **OpenClaw**       | `~/.openclaw/skills`           | `skills`                   |
| **CodeBuddy**      | `~/.codebuddy/skills`          | `.codebuddy/skills`        |
| **OpenCode**       | `~/.config/opencode/skills`    | `.agents/skills`           |
| **Codex**          | `~/.codex/skills`              | `.codex/skills` or `.agents/skills` |
| **Kimi Code CLI**  | `~/.config/agents/skills`      | `.agents/skills`           |
| **Kilo Code**      | `~/.kilocode/skills`           | `.kilocode/skills`         |
| **Kiro CLI**       | `~/.kiro/skills`               | `.kiro/skills`             |
| **Gemini CLI**     | `~/.gemini/skills`             | `.gemini/skills`           |
| **GitHub Copilot** | `~/.copilot/skills`            | `.github/skills`           |
| **Windsurf**       | `~/.codeium/windsurf/skills`   | `.windsurf/skills`         |
| **Trae**           | `~/.trae/skills`               | `.trae/skills`             |
| **Trae CN**        | `~/.trae-cn/skills`            | `.trae/skills`             |
| **Qoder**          | `~/.qoder/skills`              | `.qoder/skills`            |
| **Qwen Code**      | `~/.qwen/skills`               | `.qwen/skills`             |

## How it Works

- **Global Path**: Where Skills Hub copies skills to when you click "Sync". All projects using this agent will share these skills.
- **Project Path**: Where Skills Hub looks for skills when scanning your workspace for projects.
