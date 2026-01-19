# Product Requirements Document (PRD) - Skills Hub

## 1. 项目背景与目标 (Background & Goals)
随着 AI Coding 平台的普及，开发者往往同时使用多个工具（如 Antigravity, Claude Code, Cursor, Codex）。这些平台都支持 "Agent Skills"（代理技能），虽然技能本身的格式通用，但存放路径各不相同。
**目标**：构建一个统一的“Skills Hub”管理工具，提供可视化界面，让用户能够集中管理、分发和同步各个平台及项目中的技能。

## 2. 核心概念 (Core Concepts)
*   **Central Hub**: 用户的主要技能库，位于 `~/skills-hub`。这是技能的“源头”。
*   **Agent Global**: 各个 AI Agent 的全局技能目录（对该 Agent 所有项目生效）。
*   **Project Local**: 特定项目的技能目录（仅对该项目生效）。

## 3. 支持的 Agents 与路径 (Agents & Paths)
工具需自动识别和管理以下标准及用户自定义路径：

### 3.1 预设 Agents Extensions (Built-in Agents)
包括但不限于：Antigravity, Claude Code, Cursor, Codex, Windsurf, OpenCode 等。

### 3.2 自定义 Agents (Custom Agents)
用户可手动添加新的 Agent 及其对应的全局技能路径。

| Agent | 全局路径 (Global) | 项目级路径 (Project) |
| :--- | :--- | :--- |
| **Antigravity** | `~/.gemini/antigravity/skills/` | `.agent/skills/` |
| **Claude Code** | `~/.claude/skills/` | `.claude/skills/` |
| **Cursor** | `~/.cursor/skills/` | `.cursor/skills/` |
| **Codex** | `~/.codex/skills/` | `.codex/skills/` |
| **... (More)** | *Configurable* | *Configurable* |

## 4. 功能需求 (Functional Requirements)

### 4.1 技能发现与展示 (Discovery & Display)
*   **Hub View**: 展示 `~/skills-hub` 下的所有技能。
*   **Agent View**: 按 Agent 分类（如 Claude, Antigravity），展示其全局目录下的现有技能。
*   **Project View**: 展示用户添加的项目中的技能。
    *   *需提供添加项目路径的功能，以便扫描项目级技能。*

### 4.2 同步管理 (Sync Management)
*   **分发 (Deploy)**: 将 Skills Hub 中的技能同步到：
    *   某平台的全局目录（例如：一键同步 "Deploy to K8s" 到 Claude Global）。
    *   某特定项目的目录。
    *   **批量同步**: 支持“同步所有技能”或选择部分技能同步。
*   **收集 (Collect)**: (可选) 将分散在各处的技能复制回 Skills Hub 进行归档。

### 4.3 技能维护 (Skill Maintenance)
*   **增删改 (CRUD)**:
    *   在 Skills Hub 中新建技能（创建文件夹及 `SKILL.md` 模板）。
    *   删除任意位置的技能。
*   **版本更新 (Version Control & Updates)**:
    *   **Git 仓库识别**: 识别技能是否为一个独立的 Git 仓库。
    *   **子目录/单文件追踪**: 如果技能仅是大仓库（如 `Dify` 项目）中的一个子目录（`.claude/skills/`），需支持检测该特定路径的变更。
    *   **Upstream Link**: 支持通过元数据（如 `skill.yaml` 或备注）关联 GitHub 源链接，即使本地不是 git 仓库，也能通过对比远程内容检测更新。
    *   提供“检查更新”和“同步更新”功能。

## 5. 界面与交互 (UI/UX)
*   **Dashboard**: 总览视图，显示各处技能数量概况。
*   **Skill Card**: 每个技能以卡片形式展示，包含：
    *   名称 (Name)
    *   描述 (Description from SKILL.md)
    *   当前状态 (已同步/未同步/有更新)
    *   操作按钮 (Sync, Delete, Update)
*   **Sync Modal**: 清晰的选择器，让用户决定将当前技能同步到哪些位置（勾选平台或项目）。

## 6. 技术约束 (Technical Constraints)
*   **Local-First**: 作为一个本地工具运行，不依赖云端账户体系。
*   **File System**: 直接操作用户本地文件系统，需处理好权限和路径存在性检查。