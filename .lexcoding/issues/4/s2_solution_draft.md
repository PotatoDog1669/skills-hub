# S2 Solution Draft

- Issue: #4
- Title: feat: 为 sync/apply 增加快照与一键回滚机制

## Problem Summary

- ### 背景 执行同步后若结果不符合预期，缺少快速回退能力会增加使用风险。 ### 目标 在每次变更前自动创建快照，并支持按快照回滚。 ### 范围 - sync/apply 前自动创建快照 - 快照元信息：时间、操作类型、目标对象 - CLI 支持回滚到最近一次/指定快照 - UI 可选：显示快照历史 ### 验收标准 - 每次变更操作都生成可回滚点 - 一条命令可恢复到上一个状态 - 回滚后输出恢复结果说明 - 支持快照保留策略配置

## Scope

- In scope:
  - `bin/skills-hub`: add `snapshot` command group, wire snapshot creation into non-dry-run `sync` and `kit apply`.
  - `lib/services/snapshot-service.mjs` (+ `.d.ts`): snapshot create/list/rollback/retention logic under `~/.skills-hub/snapshots`.
  - `lib/services/kit-service.mjs` (+ `.d.ts`): expose kit-apply snapshot planning (target + affected paths).
  - `__tests__/snapshot-cli.test.ts`: integration coverage for sync/apply snapshot creation, rollback, dry-run no snapshot, retention.
  - `README.md`, `README_zh.md`: document snapshot commands and retention env var.
- Out of scope:
  - Desktop UI snapshot history panel.
  - Remote/cloud snapshot storage.
  - Automatic rollback on apply/sync failure (manual rollback command only).
  - Snapshot diff viewer.

## Change Plan

- Add snapshot service with metadata schema:
  - Metadata fields: `id`, `createdAt`, `operation`, `target`, `mode`, `affectedPaths`, and per-path entry states (`missing|file|directory|symlink|other`).
  - Snapshot payload stores only destination path pre-change state (no hub source copy).
  - Retention pruning keeps latest N snapshots (`SKILLS_HUB_SNAPSHOT_RETENTION` > config `snapshotRetention` > default `20`).
- Integrate snapshot create before mutating flows:
  - `skills-hub sync` (non-dry-run): compute all destination skill paths across selected agents; create one snapshot before file changes.
  - `skills-hub kit apply` (non-dry-run): compute policy + loadout destination paths; create one snapshot before apply.
  - Dry-run paths unchanged and do not create snapshots.
- Add new CLI interfaces:
  - `skills-hub snapshot list`
  - `skills-hub snapshot rollback --id <snapshotId>`
  - `skills-hub snapshot rollback --last`
- Add test coverage and docs updates to preserve backward compatibility while surfacing new rollback workflow.

## Risks

- Snapshot storage growth if retention misconfigured to high values.
- Rollback precision depends on accurate destination path planning; incorrect path list could under/over-restore.
- `kit apply` can still fail after partial mutation, but snapshot now exists for manual recovery.
- New CLI output line (`Snapshot created: ...`) may affect brittle external parsers that assume exact output format.

## Validation Commands

- `npm run lint`
  - Passes with no new lint errors.
- `npm run typecheck`
  - Passes with no TypeScript errors.
- `npm test`
  - Full suite green; includes new snapshot integration tests.
- Smoke test (temp sandbox, manual rollback):
  - Commands:
    ```bash
    tmp_root="$(mktemp -d)"
    tmp_home="$tmp_root/home"
    mkdir -p "$tmp_home/.skills-hub" "$tmp_root/hub/skill-a" "$tmp_root/agent"
    cat > "$tmp_home/.skills-hub/config.json" <<JSON
    {
      "hubPath": "$tmp_root/hub",
      "projects": [],
      "scanRoots": [],
      "snapshotRetention": 5,
      "agents": [
        {
          "name": "Claude Code",
          "globalPath": "$tmp_root/agent",
          "projectPath": ".claude/skills",
          "enabled": true,
          "isCustom": false
        }
      ]
    }
    JSON
    mkdir -p "$tmp_root/agent/skill-a"
    printf '# old\n' > "$tmp_root/agent/skill-a/SKILL.md"
    printf '# new\n' > "$tmp_root/hub/skill-a/SKILL.md"
    HOME="$tmp_home" node bin/skills-hub sync --target Claude
    HOME="$tmp_home" node bin/skills-hub snapshot list
    HOME="$tmp_home" node bin/skills-hub snapshot rollback --last
    cat "$tmp_root/agent/skill-a/SKILL.md"
    ```
  - Acceptance:
    - `sync` output contains `Snapshot created:`.
    - `snapshot list` returns at least one snapshot row.
    - `rollback --last` succeeds and `cat` prints `# old`.
