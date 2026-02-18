### 背景
sync/apply 可能同时改多个目标与文件，用户在执行前需要明确看到将发生什么变更。

### 目标
为 sync/apply 增加 `--dry-run` 和结构化变更预览能力。

### 范围
- CLI：`skills-hub sync --dry-run`、`skills-hub kit apply --dry-run`
- 预览内容：新增/删除/更新及目标路径
- UI 提供变更摘要与关键 diff 预览

### 验收标准
- dry-run 不产生任何实际写入
- 预览覆盖新增、删除、覆盖等动作
- 支持确认/取消执行
- 输出稳定、可脚本化
