<p align="center">
  <img src="docs/banner.svg" alt="Skills Hub" width="400">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status">
</p>

<p align="center">
  English | <a href="./README_zh-CN.md">简体中文</a>
</p>

**Skills Hub** is a centralized management tool for AI Agent Skills, providing a unified workflow for discovery, management, and synchronization via both **Web UI** and **CLI**.

| <img src="docs/dashboard.png" alt="Skills Hub Dashboard" width="100%">                                                                                                                                                                                                                                                                                                                                      |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills Hub Web UI** is your local control center for AI skills. It allows you to **visually discover and inspect** your skill library, **import new capabilities** directly from GitHub repositories, and **synchronize** them to your favorite coding agents (Antigravity, Claude, Cursor) with a single click—ensuring your agents always have the latest tools without leaving your local environment. |

## Getting Started

### Prerequisites

- Node.js 18+

### Usage

```bash
npm i -g @potatodog1669/skills-hub
skills-hub
```

**Options:**

```bash
skills-hub --port 4000 --host 127.0.0.1   # Custom port and host
skills-hub --no-open                       # Don't open browser automatically
```

**CLI Commands:**

| Command                           | Description                                                                     |
| :-------------------------------- | :------------------------------------------------------------------------------ |
| `skills-hub list`                 | List all skills in your Central Hub (`~/skills-hub`)                            |
| `skills-hub import <url>`         | Import a skill from GitHub (supports branch: `--branch main`)                   |
| `skills-hub sync --all`           | Sync Hub skills to all enabled agents (Antigravity, Claude, Cursor, etc.)       |
| `skills-hub sync --target <name>` | Sync to a specific agent (e.g., `--target claude` syncs to `~/.claude/skills/`) |

### Development

For contributors who want to modify the source code:

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](docs/CONTRIBUTING.md) for details on how to get started.

Please adhere to our [Code of Conduct](docs/CODE_OF_CONDUCT.md) in all interactions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
