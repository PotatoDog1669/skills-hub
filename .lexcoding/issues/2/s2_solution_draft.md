# S2 Solution Draft

- Issue: #2
- Title: feat: 增加项目级 Skill Profile（项目 -> loadout/policy/provider 绑定）

## Problem Summary

- ### 背景 不同项目需要不同的 skills、策略模板和 provider 配置。当前主要靠手动切换，容易出错、效率低。 ### 目标 支持“项目级 Skill Profile”，将以下内容绑定到项目： - skill loadout - policy 模板 - provider 配置 并支持继承机制： - 全局默认 profile - 项目级覆盖 profile ### 范围 - 设计 profile 数据结构 - 增加 profile 的 CLI（增删改查/绑定/切换） - UI 展示当前激活 prof...

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
