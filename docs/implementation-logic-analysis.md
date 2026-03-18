# Skills Hub 具体实现逻辑解析

## 1. 文档目标

上一份 `repository-analysis.md` 偏向“仓库结构与职责分层”。这份文档聚焦“代码是怎么跑起来的”，也就是：

- 命令和界面请求如何进入系统
- 关键功能如何逐步处理数据
- 处理过程中哪些状态会更新
- 最终结果会落到哪些文件或数据库里

如果把这个仓库理解成一个本地工具平台，那么它的实现逻辑大致可以分成 4 层：

1. 入口层：CLI 和 Desktop UI
2. 调度层：命令分发、Tauri action、服务封装
3. 业务层：skill/provider/kit/official preset 的核心流程
4. 持久化层：JSON、SQLite、Hub 目录、目标 agent 目录、本地 live config

## 2. 两套入口是如何进入业务的

### 2.1 CLI 入口

CLI 入口是 [bin/skills-hub](/Users/leo/workspace/skills-hub/bin/skills-hub)。

核心流程：

1. `main()` 读取 `process.argv`
2. 找到第一个非 flag 参数作为 command
3. 用 `commandAliases` 把 `ls -> list`、`rm -> remove`
4. 通过 `runCommand()` 分发到具体处理函数

`runCommand()` 当前支持：

- `import`
- `list`
- `remove`
- `sync`
- `provider`
- `kit`
- `official`

这个入口文件本身承担三件事：

- 参数解析
- 用户输入校验
- 调用共享逻辑并格式化输出

它不适合承载复杂业务，所以 provider 和 kit 逻辑都通过懒加载进入：

- `loadProviderCore()`
- `loadKitService()`

这和仓库的分层原则是一致的：CLI 只做交互层，不做重业务堆积。

### 2.2 Desktop 入口

桌面端入口在 [apps/desktop-ui/src/App.tsx](/Users/leo/workspace/skills-hub/apps/desktop-ui/src/App.tsx)。

启动时主要做三件事：

1. 初始化本地前端快照状态
2. 调用 `hydrateTauriState()` 拉取 Tauri 侧真实数据
3. 监听 `skills://updated` 事件，收到后刷新 skill 状态

对应的数据拉取封装在 [apps/desktop-ui/src/tauri-actions.ts](/Users/leo/workspace/skills-hub/apps/desktop-ui/src/tauri-actions.ts) 里，典型逻辑是：

- `invoke('config_get')`
- `invoke('skill_list')`
- `invoke('provider_list')`
- `invoke('kit_list')`
- `invoke('official_preset_list')`

前端组件并不直接碰磁盘，而是：

- React 组件触发 action
- action 通过 Tauri `invoke` 调 Rust command
- Rust 执行本地逻辑并返回结果
- 前端更新内存快照

这使桌面端保持了“UI 和本地能力分离”的结构。

## 3. 持久化材料有哪些

这个仓库不是单一数据库项目，而是多种本地存储协作：

### 3.1 JSON 配置

用户主配置：

- `~/.skills-hub/config.json`

由 [lib/config.ts](/Users/leo/workspace/skills-hub/lib/config.ts) 管理，主要存：

- `hubPath`
- `projects`
- `scanRoots`
- `agents`

### 3.2 SQLite

Node 侧 Kit 和 Provider 使用 SQLite：

- `~/.skills-hub/skills-hub.db`

其中 [lib/core/kit-core.mjs](/Users/leo/workspace/skills-hub/lib/core/kit-core.mjs) 会建：

- `kit_policies`
- `kit_loadouts`
- `kit_loadout_items`
- `kit_presets`

[lib/core/provider-core.mjs](/Users/leo/workspace/skills-hub/lib/core/provider-core.mjs) 则负责 provider 相关表。

### 3.3 Hub 技能目录

Hub 是实际 skill 文件的存放位置，默认由配置项 `hubPath` 决定，默认通常是：

- `~/skills-hub`

每个 skill 是一个目录，核心文件是 `SKILL.md`。

### 3.4 目标 Agent / 项目目录

apply 或 sync 时，skill 会被拷贝或软链接到：

- agent 全局 skills 目录
- 项目内 agent 专属目录，例如 `.claude/skills`、`.codex/skills`

同时 policy 文件会被写到项目根目录，如：

- `AGENTS.md`
- `CLAUDE.md`

### 3.5 各 Agent 的 live config

provider 切换时，系统会直接读写用户本机 agent 的真实配置文件。例如：

- Claude 的 settings JSON
- Codex 的 `auth.json` 和 `config.toml`
- Gemini 的 env/settings 结构

这也是 provider 功能比普通技能管理器更“侵入本地环境”的原因。

## 4. Skill 发现与扫描逻辑

### 4.1 配置来源

扫描的输入不是全盘递归，而是来自配置：

- `scanRoots`
- `projects`
- `agents`

### 4.2 Git 项目发现

[lib/scanner.ts](/Users/leo/workspace/skills-hub/lib/scanner.ts) 的 `scanForProjects()` 逻辑是：

1. 遍历 `scanRoots`
2. 深度限制 `MAX_DEPTH = 5`
3. 跳过 `node_modules/.git/dist/build/out/.next`
4. 通过检查 `.git` 判断目录是否为 Git 仓库
5. 找到后加入结果，但继续深入，以支持 monorepo 嵌套情况

Rust 侧也有一套类似逻辑：

- `scan_projects_from_roots()`
- `is_git_repo_root()`
- `is_inside_git_work_tree()`

这说明“项目发现”在 Desktop 侧是 Rust 原生实现，在 Node 侧有对应的共享实现。

### 4.3 Skill 收集

桌面端真实的 skill 汇总逻辑在 [src-tauri/src/main.rs](/Users/leo/workspace/skills-hub/src-tauri/src/main.rs) 的：

- `collect_all_skills()`

其思路是：

1. 先根据 `config.hub_path` 收集 hub skills
2. 再遍历每个 enabled agent 的 globalPath
3. 再遍历每个项目里该 agent 的 projectPath
4. 对每个 skill 目录解析 `SKILL.md`
5. 生成统一的 `Skill` 结构

解析 skill 时会读取 frontmatter 和 markdown 内容，并通过：

- `parse_skill_document()`
- `infer_description()`
- `parse_skill_summary()`

推导出：

- 名称
- 描述
- 元数据
- 内容摘要

### 4.4 UI 过滤

前端不会直接展示原始 skill 实例，而是先通过 [lib/core/skill-filter.ts](/Users/leo/workspace/skills-hub/lib/core/skill-filter.ts)：

1. `groupSkillsByName()` 按名称归组
2. `collectAvailableSkillTags()` 收集 hub/agent 标签
3. `filterSkillGroups()` 根据当前视图、scope、tag、search 过滤

所以 UI 上看到的是“统一 skill 视图”，不是单纯文件系统列表。

## 5. Skill 导入逻辑

Skill 导入有 Node 和 Rust 两条实现，但总体思路一致。

### 5.1 URL 解析

[lib/import-skill.ts](/Users/leo/workspace/skills-hub/lib/import-skill.ts) 和 Rust 侧 `parse_skill_import_url()` 都会把输入 URL 解析成：

- `repoWebUrl`
- `repoUrl`
- `branch`
- `subdir`
- `skillName`

支持两类地址：

- 仓库根地址
- `/tree/<branch>/<subdir>` 地址

### 5.2 克隆与源路径确认

Rust 侧 `skill_import()` 执行流程：

1. `parse_skill_import_url(&url)`
2. 取当前 `hub_path`
3. 检查目标目录是否已存在
4. `make_temp_directory("skills-hub-import")`
5. `run_git_clone(&source, &temp_repo_path)`
6. `select_import_source_path(&temp_repo_path, &source)`
7. 确认源路径下存在 `SKILL.md`
8. 拷贝到 Hub 目录
9. 删除临时目录
10. 刷新内存 state 并持久化

Node 侧的下载优化更明显，[lib/remote.ts](/Users/leo/workspace/skills-hub/lib/remote.ts) 会：

1. 初始化临时 Git 仓库
2. 设置 remote origin
3. 打开 sparse checkout
4. 只拉目标子目录
5. 浅克隆 `--depth 1`
6. 读取目标子目录的最后更新时间
7. 将内容复制到最终目录

### 5.3 导入元数据回写

导入后会把源信息写回 skill 的 `SKILL.md` frontmatter。

Node 侧由 `attachSkillImportMetadata()` 完成，写入字段包括：

- `source_repo`
- `source_url`
- `source_subdir`
- `source_last_updated`
- `imported_at`

Rust 侧也有对应的 `write_skill_import_metadata()`。

这一步很关键，因为后续：

- loadout import 需要判断某个 skill 是否由特定来源导入
- overwrite / cleanup 也要依赖这个来源标识

## 6. Skill 同步逻辑

[lib/sync.ts](/Users/leo/workspace/skills-hub/lib/sync.ts) 中的 `syncSkill()` 是最基础的文件操作单元。

它的行为非常直接：

1. 计算目标路径 `destParentPath + basename(sourcePath)`
2. 若源和目标相同，直接返回，避免自同步
3. 确保目标父目录存在
4. `link` 模式下：
   - 先删除目标
   - 再创建 symlink
5. `copy` 模式下：
   - 如果目标当前是 symlink，先删掉
   - 再把源目录完整复制过去

Rust 侧对应能力是：

- `sync_skill_into_parent()`
- `skill_sync()`
- `skill_collect_to_hub()`

它们本质上都在做“把一个 skill 目录同步到另一个 skill 容器目录”。

## 7. Provider 管理逻辑

Provider 是这个仓库最复杂的业务之一，因为它不仅管理数据库记录，还会影响本机真实 agent 配置。

### 7.1 数据记录

[lib/core/provider-core.mjs](/Users/leo/workspace/skills-hub/lib/core/provider-core.mjs) 负责 provider 数据库操作，包括：

- `addProvider()`
- `updateProvider()`
- `deleteProvider()`
- `captureProviderFromLive()`
- `switchProvider()`
- `addUniversalProvider()`
- `applyUniversalProvider()`

这里的 provider 记录包含：

- `appType`
- `name`
- `config`
- `isCurrent`
- 时间戳

### 7.2 capture live 的逻辑

`captureProviderFromLive()` 的目标是：

- 读取当前用户机器上某个 app 的 live 配置
- 规整成可存储的 provider
- 附上 `_profile.kind = official`

Codex 这里更特殊：

1. 从 live config 提取 account id
2. 如果已存在同 account 的 official provider，则避免重复继承敏感 auth
3. 必要时创建“空 auth 占位”
4. 对 auth 额外写 snapshot

这样做是为了避免：

- 多个官方账号相互覆盖
- 将不应该长期存档的 live token 状态错误复制到别的 provider 记录

### 7.3 universal provider 的逻辑

`addUniversalProvider()` 存一份跨 app 的基础配置：

- `baseUrl`
- `apiKey`
- `websiteUrl`
- `notes`
- app 开关
- 各 app 的 model

`applyUniversalProvider()` 再把它转成具体 app 的 provider 配置：

- Claude：`api_key + model + api_base_url`
- Codex：`auth + config.toml 文本`
- Gemini：`env + settings`

本质上是“一份通用供应商配置，派生成多个 app 的具体 provider record”。

### 7.4 provider switch 的逻辑

`switchProvider()` 是 provider 体系的核心。

Node 侧流程：

1. 校验 `appType` 和 `providerId`
2. 找到 target provider 与 current provider
3. 读取当前 live config
4. 创建 backup
5. 如果 current 存在且不是 target：
   - 把当前 live config 回写到 current provider 的 `config`
   - 保留 profile 信息
   - Codex 额外写 auth snapshot
6. 为 target 准备 `targetConfigForSwitch`
   - Codex 时优先读取 snapshot auth
7. `mergeLiveConfig(appType, liveBefore, targetConfigForSwitch)`
8. 调用 adapter 校验
9. 写回本机 live config
10. 更新数据库里的 `is_current`
11. 失败时尝试回滚 backup

Rust 侧 `provider_switch()` 结构也类似：

1. 找到 target/current
2. 读取 live config
3. 生成 previous current 的 backup snapshot
4. `merge_live_config()`
5. `validate_provider_config_for_live()`
6. `write_live_provider_config()`
7. 更新内存 state 中 provider 列表与 backup 列表
8. 持久化 state

其中最关键的思想是：

- “当前 live 配置”不仅是目标结果，也是旧 provider 的回填来源

也就是说，switch 不是简单覆盖，而是带“状态回采”的双向同步。

## 8. Kit 数据结构与核心逻辑

Kit 相关 Node 核心在 [lib/core/kit-core.mjs](/Users/leo/workspace/skills-hub/lib/core/kit-core.mjs)，服务编排在 [lib/services/kit-service.mjs](/Users/leo/workspace/skills-hub/lib/services/kit-service.mjs)。

### 8.1 kit-core 做什么

`kit-core.mjs` 负责：

- 初始化 SQLite 表
- 规范化输入
- 读写 `policy/loadout/kit`
- 解析 `managedSource`
- 解析 `importSource`

几个典型规范化函数：

- `normalizeLoadoutItems()`
- `normalizeLoadoutImportSource()`
- `normalizeManagedSource()`
- `normalizeKitSafetyCheck()`

所以 `kit-core` 的角色更偏“带约束的数据存储层”。

### 8.2 service 层做什么

`kit-service.mjs` 在 core 之上加了业务编排，例如：

- 从 Git 导入 loadout
- 安装 official preset
- 自动保证托管 official preset 已安装
- 应用 kit 到目标项目

也就是说：

- `core` 负责 CRUD 和结构校验
- `service` 负责跨对象协同和流程逻辑

## 9. Loadout 导入逻辑

最完整的实现可以看 Rust 的 `import_kit_loadout_from_repo_internal()`，因为它把整个流程写得非常完整。

### 9.1 主要步骤

1. 解析远程 URL
2. 取当前 `hub_path` 和已有 loadout 列表
3. 克隆到临时目录
4. 解析 root 路径和 root_subdir
5. 收集所有可安装 skill 目录
6. 检查是否存在重名 skill
7. 如果用户传了 `skill_names`，只选择子集
8. 根据 repo + root_subdir 计算 import source key
9. 检查是否已经有来自同一来源的 loadout
10. 检查 hub 里目标 skill 是否冲突
11. 做安全扫描 `assess_imported_entries_safety()`
12. 将每个 skill 复制到 hub，并写入导入元数据
13. 如果这是更新现有 loadout，还会移除本次不再包含、但同来源的旧 skill
14. 创建或更新 `KitLoadoutRecord`
15. 刷新 skills state

### 9.2 设计上的关键点

这个流程的几个要点值得特别注意：

- 不是“整个 repo = 一个 loadout”，而是先发现 repo 中所有 installable skills
- 允许只导入其中一部分 skill
- 导入记录带来源 key，因此后续更新时能知道哪些 skill 是自己上次导入的
- 更新 loadout 时会清理“同来源但本次已不再需要”的旧 skill

这使 loadout import 具备了“可重复执行、可增量更新”的特征，而不是一次性拷贝。

## 10. Official Preset 安装逻辑

`installOfficialPreset()` 是另一个关键流程。Node 服务层和 Rust 侧都实现了这条链路。

### 10.1 输入

输入来自：

- `data/official-presets/catalog.json`
- 对应的 policy 模板文件

一个 preset 通常包含：

- 基础元信息
- policy 模板
- 多个 source
- 每个 source 选中的 skill 列表

### 10.2 安装步骤

Rust 的 `official_preset_install()` 可概括为：

1. 从 catalog 找到 preset
2. 构建 source selection plan
3. 读取 policy 模板正文
4. 对 preset 的每个 source：
   - 调 `import_kit_loadout_from_repo_internal()`
   - 导入该 source 对应的 skill 子集
5. 从各 source loadout 中抽取 preset 需要的 skill，拼成 curated loadout
6. 创建或更新 policy
7. 创建或更新 curated loadout
8. 生成 `managedSource`
   - 记录 presetId
   - 记录 catalogVersion
   - 记录 baseline
   - 记录安全检查结果
9. 创建或更新最终 kit
10. 清理无用的官方 source loadout
11. 刷新 skill state 并持久化

### 10.3 为什么要分 source loadout 和 curated loadout

这是这个设计里很精巧的一点。

安装 official preset 时，系统实际上保留了两层结构：

- source loadout：每个来源仓库对应一个导入包
- curated loadout：把 preset 真正要用的 skill 抽出来组成最终包

这样有几个好处：

- 可以追踪每个 source 的导入情况
- 可做安全检查分源记录
- 便于后续基线恢复
- curated 层只暴露预设真正需要的内容

## 11. Managed Kit 恢复逻辑

`kit_restore_managed_baseline()` 只允许对 managed official kit 生效。

流程是：

1. 找到 kit
2. 校验 `managed_source.kind === official_preset`
3. 从 baseline 中取出 policy 和 loadout 的原始版本
4. 覆盖当前 policy 记录
5. 覆盖当前 loadout 记录
6. 更新 `last_restored_at` 和 `restore_count`
7. 回写 kit

这意味着 official kit 虽然可以被用户后续修改，但系统保留了一份可恢复的“官方安装基线”。

## 12. Kit Apply 逻辑

`kit_apply()` 是“把配置和技能真正部署到项目”的最终动作。

### 12.1 取数阶段

Rust 侧 `kit_apply()` 先一次性拿到：

- kit
- policy
- loadout
- hub path
- agent 的 projectPath
- instruction file name

其中 instruction file name 会根据 agent 配置决定，比如：

- Claude Code 常用 `CLAUDE.md`
- 其他 agent 默认多为 `AGENTS.md`

### 12.2 写 policy

如果 kit 带 policy：

1. 计算 `projectPath/instruction_file_name`
2. 若文件已存在且未显式 overwrite，则返回 `POLICY_FILE_EXISTS::<path>`
3. 直接写入 policy 内容

这也是前端 `ConfirmProvider` / KitPanel 可以做二次确认覆盖的基础。

### 12.3 同步 loadout

如果 kit 带 loadout：

1. 把 `includeSkills` 解析成 hub skill 路径
2. `build_effective_loadout_items()`
   - 用于将原 loadout 与 include/exclude 动态组合
3. 按 `sort_order` 排序
4. 对每个 item：
   - 计算实际 mode
   - `sync_skill_into_parent()`
   - 记录 success / failed 结果

这里支持两类“本次应用临时调整”：

- `includeSkills`
- `excludeSkills`

它们只影响本次 apply，不会修改保存下来的 kit。

### 12.4 更新元数据

apply 成功后，还会更新：

- `agents_md_applied`
- `kit.last_applied_at`
- `kit.last_applied_target`

并刷新整体 skill 视图。

所以 apply 不只是文件写入动作，也是一次状态登记动作。

## 13. 桌面端为什么大量逻辑放在 Rust

从 [src-tauri/src/main.rs](/Users/leo/workspace/skills-hub/src-tauri/src/main.rs) 可以看出，Rust 端并不只是桥接层，而是把以下都实现了：

- skill 发现
- skill 导入
- provider 切换
- universal provider 应用
- loadout 导入
- official preset 安装
- kit apply

这样做的好处：

- 桌面端不依赖 Node 运行时业务进程
- 文件系统和 OS 能力调用更直接
- 可以结合 `notify` 做 watcher

代价是：

- Node 侧和 Rust 侧存在一定程度的逻辑镜像
- 同一业务可能在两边都要维护

这也是后续维护时最需要警惕的实现风险之一。

## 14. 当前实现中的关键设计特征

### 14.1 来源可追踪

无论是 skill import 还是 loadout import，系统都尽量给本地对象写“来源元数据”，方便：

- 更新
- 覆盖
- 安全检查
- 清理旧内容

### 14.2 动作可重放

很多流程不是一次性操作，而是支持重复执行：

- official preset install 可重复运行
- loadout import 可更新已有来源
- provider switch 可回滚 backup
- managed kit 可 restore baseline

### 14.3 用户本地状态优先

provider switch 的逻辑不是死板覆盖，而是把 live config 视为重要事实来源，先读出来、再合并、再回填旧 provider。这种实现更贴近真实本地工具场景。

### 14.4 文件系统才是最终真实状态

虽然有 SQLite 和内存 state，但最终用户真正感知的是：

- Hub 目录里有哪些 skill
- 项目里有没有 `AGENTS.md` / `CLAUDE.md`
- 各 agent 的 live config 是否切换成功

因此这个仓库本质上是“以文件系统为终态，以数据库为索引和元数据层”的架构。

## 15. 总结

如果只用一句话概括这个仓库的实现逻辑，可以这样理解：

`skills-hub` 会先把“技能、策略、供应商、官方预设”抽象成可存储对象，再通过 CLI 或 Tauri 命令把这些对象编排成实际的本地文件与配置变更。

它最核心的实现套路反复出现为：

1. 解析输入
2. 找到本地状态
3. 规范化对象
4. 处理冲突与安全校验
5. 写磁盘 / 写数据库 / 写 live config
6. 刷新内存视图
7. 返回结构化结果给 CLI 或 UI

后续如果要继续深入源码，最推荐优先顺序是：

1. [src-tauri/src/main.rs](/Users/leo/workspace/skills-hub/src-tauri/src/main.rs)
2. [lib/core/provider-core.mjs](/Users/leo/workspace/skills-hub/lib/core/provider-core.mjs)
3. [lib/core/kit-core.mjs](/Users/leo/workspace/skills-hub/lib/core/kit-core.mjs)
4. [lib/services/kit-service.mjs](/Users/leo/workspace/skills-hub/lib/services/kit-service.mjs)
5. [bin/skills-hub](/Users/leo/workspace/skills-hub/bin/skills-hub)
6. [apps/desktop-ui/src/tauri-actions.ts](/Users/leo/workspace/skills-hub/apps/desktop-ui/src/tauri-actions.ts)

沿着这条顺序读，基本可以完整把这个仓库的运行机制串起来。
