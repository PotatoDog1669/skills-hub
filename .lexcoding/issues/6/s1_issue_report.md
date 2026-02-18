# S1 Issue Report

- Repo: PotatoDog1669/skills-hub
- Issue: #6
- URL: https://github.com/PotatoDog1669/skills-hub/issues/6
- State: OPEN
- Author: PotatoDog1669
- Assignees: none
- Labels: none
- Created at: 2026-02-17T19:17:25Z
- Updated at: 2026-02-17T19:17:25Z

## Title

feat: 增加冲突检测与可视化（重复 plugin id / skill 名冲突）

## Body

```markdown
### 背景
重复 plugin id 或 skill 冲突会导致加载优先级不清、行为不可预期。

### 目标
在注册阶段自动检测冲突，并在 CLI/UI 显示冲突与修复建议。

### 范围
- 检测重复 plugin id
- 检测 skill 名称/路径冲突
- 展示优先级/覆盖关系
- 给出修复建议（禁用、改名、移除重复来源）

### 验收标准
- 启动和刷新时都可检测冲突
- CLI/UI 都能查看冲突详情
- 每条冲突都包含影响说明与修复建议
```

## Comments (0)

- none
