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
  <a href="./README.md">English</a> | 简体中文
</p>

## 简介

**Skills Hub** 是一个用于 AI Agent 技能管理的中心化工具，提供了统一的 **Web UI** 和 **CLI** 工作流，帮助你发现、管理和同步技能。

| <img src="docs/dashboard.png" alt="Skills Hub Dashboard" width="100%">                                                                                                                                                                                                                                                              |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills Hub Web UI** 是你的 AI 技能本地控制中心。它允许你**可视化地浏览和检查**技能库，**直接从 GitHub 导入**新功能，并一键**同步**到你喜爱的编码 Agent（如 Antigravity, Claude, Cursor）——确保你的 Agent 始终拥有最新的工具，而无需离开本地环境，也无需依赖云端账户。它支持**复制**（稳定）和**软链接**（实时开发）两种同步模式。 |

## 支持的 Agent

Skills Hub 支持同步到多种主流 AI 编码助手，包括 Antigravity, Claude Code, Cursor, Trae 等以及 **[更多](./docs/supported-agents.md)**。

👉 **[查看完整支持 Agent 列表及路径](./docs/supported-agents.md)**

## 项目发现规则

- 自动扫描为 **仅 Git**：`Scan Roots` 只会纳入位于 Git 工作树内的目录。
- 手动添加项目也为 **仅 Git**。
- 路径输入优先使用系统文件夹选择器，失败时可回退为手动输入路径。

## 快速开始

### 前提条件

- Node.js 18+

### 使用方法

```bash
npm i -g @potatodog1669/skills-hub
skills-hub
```

**选项：**

```bash
skills-hub --port 4000 --host 127.0.0.1   # 自定义端口和主机
skills-hub --no-open                       # 不自动打开浏览器
```

**CLI 命令：**

| 命令                                      | 描述                                                                   |
| :---------------------------------------- | :--------------------------------------------------------------------- |
| `skills-hub list`                         | 列出中心 Hub (`~/skills-hub`) 中的所有技能                             |
| `skills-hub import <url>`                 | 从 GitHub 导入技能（支持指定分支: `--branch main`）                    |
| `skills-hub sync --all`                   | 将 Hub 技能同步到所有已启用的 Agent (Antigravity, Claude, Cursor 等)   |
| `skills-hub sync --target <name>`         | 同步到特定 Agent（例如：`--target claude` 同步到 `~/.claude/skills/`） |
| `skills-hub provider list`                | 查看 Provider 档案列表（`claude`、`codex`、`gemini`）                  |
| `skills-hub provider add ...`             | 通过 `--app --name --config-json` 或 `--config-file` 新增 Provider     |
| `skills-hub provider switch ...`          | 执行 Provider 切换（含 backfill + 备份 + 原子写）                      |
| `skills-hub provider restore ...`         | 按 app 恢复最近一次 live 配置备份                                      |
| `skills-hub provider capture ...`         | 将当前 live 配置捕获为“官方账号”Provider                               |
| `skills-hub provider universal-add ...`   | 创建统一供应商并同步到多个 app                                         |
| `skills-hub provider universal-list`      | 查看统一供应商列表                                                     |
| `skills-hub provider universal-apply ...` | 将统一供应商重新同步到已启用 app                                       |

### 开发指南

如果你想参与贡献或修改源码：

```bash
git clone https://github.com/PotatoDog1669/skills-hub.git
cd skills-hub
npm install
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

## 参与贡献

我们欢迎社区贡献！请查看 [CONTRIBUTING.md](docs/CONTRIBUTING.md) 了解如何开始。

所有互动请遵守我们的 [行为准则](docs/CODE_OF_CONDUCT.md)。

## 许可证

本项目采用 MIT 许可证 - 详情请见 [LICENSE](LICENSE) 文件。
