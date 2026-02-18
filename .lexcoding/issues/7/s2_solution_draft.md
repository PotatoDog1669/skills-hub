# S2 Solution Draft

- Issue: #7
- Title: perf: 增加项目发现的增量索引缓存，减少全量扫描开销

## Problem Summary

- ### 背景 工作区规模变大后，项目扫描耗时明显，影响使用体验。 ### 目标 实现基于 mtime/hash 的增量扫描缓存，避免重复全量扫描。 ### 范围 - 缓存结构与失效策略设计 - 增量扫描逻辑实现 - 强制刷新机制 - 扫描耗时指标记录 ### 验收标准 - 未变化目录重复扫描耗时显著下降 - 目录变化后能正确失效并重建索引 - 强制刷新后不出现陈旧结果 - 有前后性能对比数据

## Scope

- [AGENT_REQUIRED] Define exact in-scope files and modules.
- [AGENT_REQUIRED] Define explicit out-of-scope items.

## Change Plan

- [AGENT_REQUIRED] List concrete file-level edits.
- [AGENT_REQUIRED] Explain expected behavior change.

## Risks

- [AGENT_REQUIRED] List regressions and compatibility risks.

## Validation Commands

- [AGENT_REQUIRED] Add runnable commands (lint/test/integration).
- [AGENT_REQUIRED] Add acceptance criteria for each command.
