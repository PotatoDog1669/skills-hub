# S1 Issue Report

- Repo: PotatoDog1669/skills-hub
- Issue: #4
- URL: https://github.com/PotatoDog1669/skills-hub/issues/4
- State: OPEN
- Author: PotatoDog1669
- Assignees: none
- Labels: none
- Created at: 2026-02-17T19:17:12Z
- Updated at: 2026-02-17T19:17:12Z

## Title

feat: 为 sync/apply 增加快照与一键回滚机制

## Body

```markdown
### 背景
执行同步后若结果不符合预期，缺少快速回退能力会增加使用风险。

### 目标
在每次变更前自动创建快照，并支持按快照回滚。

### 范围
- sync/apply 前自动创建快照
- 快照元信息：时间、操作类型、目标对象
- CLI 支持回滚到最近一次/指定快照
- UI 可选：显示快照历史

### 验收标准
- 每次变更操作都生成可回滚点
- 一条命令可恢复到上一个状态
- 回滚后输出恢复结果说明
- 支持快照保留策略配置
```

## Comments (0)

- none
