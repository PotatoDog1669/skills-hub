# S2 Solution Draft

- Issue: #3
- Title: feat: sync/apply 前增加 dry-run 与变更预览（diff）

## Problem Summary

- `sync` 与 `kit apply` 当前会直接落盘，缺少“执行前可审查”的安全检查。
- 需求是新增 `--dry-run`，输出稳定可脚本化预览（JSON），并给出简短可读摘要。
- dry-run 必须零写入（尤其不触发 copy/remove/symlink 及 AGENTS.md 写入）。

## Scope

- In scope
  - CLI: `bin/skills-hub` 增加 `sync --dry-run` 与 `kit apply --dry-run` 参数与输出流程。
  - Service: `lib/services/kit-service.mjs` 增加 `previewKitApply`，用于 apply 预览且不写盘。
  - Shared planner: 新增 `lib/services/sync-service.mjs`（及 `.d.ts`）统一 copy/link 变更计算与汇总，避免重复逻辑。
  - Tests: 扩展 `__tests__/kit-cli.test.ts`，新增 `__tests__/sync-cli.test.ts` 覆盖 dry-run JSON 与 no-write。
- Out of scope
  - UI 交互确认/取消流程（issue body 提到 UI diff，但本次按 must-have 仅做 CLI）。
  - 非 dry-run 行为语义调整（保持现有 apply/sync 的执行路径与错误模型）。
  - 文件内容级 textual diff（本次为路径级变更预览：add/update/delete/link + reason）。

## Change Plan

- `bin/skills-hub`
  - help 文案补充 `--dry-run`。
  - `sync`：dry-run 分支只调用 preview 计算，不执行 ensureDir/copy/remove/symlink。
  - `kit apply`：dry-run 分支调用 `previewKitApply`，输出 JSON + summary。
  - 增加统一 preview 输出函数，保证 schema 稳定。
- `lib/services/sync-service.mjs`
  - 新增 `previewSkillSync` 计算 copy/link 下 add/update/delete/link 动作。
  - 新增 `syncSkill`（实际执行）与 `summarizeSyncChanges`（汇总计数）。
- `lib/services/kit-service.mjs`
  - 提取 `resolveKitApplyContext` 复用校验上下文。
  - 新增 `previewKitApply` 返回 `{action:"kit-apply",dryRun:true,changes,summary,warnings...}`。
  - 现有 `applyKit` 改为复用 shared sync service，非 dry-run 行为保持一致。
- `lib/services/kit-service.d.ts`、`package.json`
  - 暴露新 preview 类型与 `sync-service` 发布文件。
- 预期行为变化
  - `skills-hub sync --dry-run` 与 `skills-hub kit apply --dry-run` 输出脚本可解析 JSON 预览与摘要。
  - 无 `--dry-run` 时维持原有落盘逻辑与输出。

## Risks

- CLI 输出兼容性：dry-run 新增 JSON 行，若外部脚本依赖旧日志格式需适配（非 dry-run 不变）。
- 预览准确性：基于路径状态判定（非内容 diff），可能显示 “update” 而非细粒度行级差异。
- apply 阻塞条件提示：`AGENTS.md` 已存在且未传 `--overwrite-agents-md` 时，在 preview 以 warning 暴露，真实执行仍按旧逻辑报错。

## Validation Commands

- `npm test -- --run __tests__/sync-cli.test.ts __tests__/kit-cli.test.ts`
  - 验收：dry-run 预览 JSON 可解析，包含 action/dryRun/changes/summary；断言目标文件未被修改。
- `npm test`
  - 验收：全量测试通过，无回归。
