# S1 Issue Report

- Repo: PotatoDog1669/skills-hub
- Issue: #5
- URL: https://github.com/PotatoDog1669/skills-hub/issues/5
- State: OPEN
- Author: PotatoDog1669
- Assignees: none
- Labels: none
- Created at: 2026-02-17T19:17:19Z
- Updated at: 2026-02-17T19:17:19Z

## Title

feat: 增加 Skill 可用性诊断（missing 原因 + 修复建议）

## Body

```markdown
### 背景
仅显示 `missing` 不够，用户需要知道“缺什么、怎么修”。

### 目标
对 skill readiness 提供可执行诊断信息：
- 缺少命令行依赖/二进制
- 缺少认证或环境变量
- 版本不兼容

### 范围
- 扩展 readiness reason code
- 增加诊断命令/诊断输出
- 每类错误附带修复建议（安装命令或配置指引）

### 验收标准
- 非 ready skill 都有明确原因
- 每个原因都附带可执行修复建议
- 支持导出诊断结果用于排障
```

## Comments (0)

- none
