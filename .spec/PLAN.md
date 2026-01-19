# 技术方案 (Implementation Plan) - Skills Hub

基于 PRD 需求，我们将构建一个基于 Next.js 的本地 Web 应用程序。

## 1. 技术栈选型 (Technology Stack)

*   **Runtime**: Node.js (利用其强大的文件系统访问能力)
*   **Framework**: **Next.js 14+ (App Router)**
    *   *理由*: 提供现代化的 React 界面，同时 Server Actions 允许直接在组件中调用服务器端代码（FS 操作），架构统一，无需分离的前后端项目。
*   **Language**: **TypeScript** (强类型保证文件操作的安全性)
*   **Styling**: **Vanilla CSS (CSS Modules)**
    *   *理由*: 灵活、轻量，符合项目对简洁性的要求。
*   **State Management**: React Hooks / Context API
*   **Icons**: Lucide React
*   **Version Control**: `simple-git` (用于 Git 集成)

## 2. 架构设计 (Architecture)

### 2.1 目录结构
```
skills-hub/
├── app/                  # Next.js App Router 页面
│   ├── page.tsx          # Dashboard
│   ├── skills/           # 技能详情页
│   ├── settings/         # 项目路径配置
│   └── api/              # (可选) 如果 Server Actions 不够用时
├── components/           # UI 组件 (SkillCard, Sidebar, Modal)
├── lib/                  # 核心逻辑
│   ├── skills.ts         # 技能扫描、解析、CRUD
│   ├── sync.ts           # 同步逻辑
│   ├── git.ts            # Git 版本检测
│   └── config.ts         # 配置管理 (项目路径存储)
├── .spec/                # 文档 (PRD, PLAN)
└── package.json
```

### 2.2 数据存储 (Data Persistence)
本工具不使用复杂的数据库，而是以**文件系统为单一数据源 (Source of Truth)**：
1.  **Skills**: 直接读取 `~/skills-hub` 和各平台目录下的文件夹和 `SKILL.md`。
2.  **App Config**: 使用 `~/.skills-hub/config.json` 存储用户添加的“项目路径”列表。

## 3. 核心模块详解 (Core Modules)

### 3.1 Skill Manager (`lib/skills.ts`)
负责扫描和归一化技能数据。
- `StandardPaths`: 定义 Antigravity, Claude, Cursor 等的默认全局路径。
- `scanDirectory(path)`: 递归扫描目录下含有 `SKILL.md` 的文件夹。
- `parseSkill(skillDir)`: 读取 `SKILL.md` 的元数据（名称、描述）。

### 3.2 Sync Engine (`lib/sync.ts`)
负责技能的分发与同步。
- `copySkill(sourcePath, destPath)`: 执行实际的文件复制（使用 `fs-extra`）。
- `diffSkill(pathA, pathB)`: (后续迭代) 比较两处技能是否有差异。

### 3.3 Git Watcher (`lib/git.ts`)
- `checkGitStatus(skillPath)`:
    - 如果是仓库根目录：检查 `git status` 和 `git fetch` 后的落后提交数。
    - 如果是子目录：检查该目录下的文件变动。
- `getUpstreamInfo(skillPath)`: 解析 yaml/markdown 中的 update url。

## 4. 开发路线图 (Roadmap)

### Phase 1: 初始化与核心扫描 (Initialization & Scanning)
- [ ] 创建 Next.js 项目。
- [ ] 实现 `config.ts`，支持读写项目路径列表。
- [ ] 实现 `skills.ts`，能扫描 `~/skills-hub` 和各平台默认全局路径。
- [ ] 搭建简单 Dashboard，展示扫描到的技能。

### Phase 2: 界面与交互 (UI Implementation)
- [ ] 开发 Sidebar (Hub/Platform/Project 导航)。
- [ ] 开发 SkillCard 组件。
- [ ] 实现 Skill 详情/预览页。

### Phase 3: 同步功能 (Sync Implementation)
- [ ] 实现 Sync Modal (选择同步目标)。
- [ ] 实现后端复制逻辑。
- [ ] 实现基础的增删操作 (在 Hub 中新建/删除)。

### Phase 4: 高级功能 (Advanced)
- [ ] 集成 `simple-git` 实现版本检测。
- [ ] UI 抛光 (Loading 态, 错误处理)。
