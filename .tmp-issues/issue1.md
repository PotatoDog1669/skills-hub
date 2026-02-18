### 背景
不同项目需要不同的 skills、策略模板和 provider 配置。当前主要靠手动切换，容易出错、效率低。

### 目标
支持“项目级 Skill Profile”，将以下内容绑定到项目：
- skill loadout
- policy 模板
- provider 配置

并支持继承机制：
- 全局默认 profile
- 项目级覆盖 profile

### 范围
- 设计 profile 数据结构
- 增加 profile 的 CLI（增删改查/绑定/切换）
- UI 展示当前激活 profile
- 项目切换时自动应用 profile

### 验收标准
- 可按项目路径/仓库绑定 profile
- 切换项目可一键应用 loadout/policy/provider
- 无项目 profile 时自动回退全局默认
- UI/CLI 可清晰显示当前 profile 状态
