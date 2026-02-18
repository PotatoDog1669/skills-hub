# S2 Solution Draft

- Issue: #7
- Title: perf: 增加项目发现的增量索引缓存，减少全量扫描开销

## Problem Summary

- 当前 `scanForProjects(roots)` 每次都会递归全量扫描，工作区规模变大后明显变慢。
- 目标是在目录未变化时跳过递归，复用上一次结果，并支持强制刷新。
- 需要补齐 CLI 入口、耗时输出、测试和文档说明。

## Scope

- In scope
  - `lib/scanner-core.mjs`：实现增量缓存扫描（root 维度 + directory mtime + repos）。
  - `lib/scanner.ts`：导出共享扫描能力，保持 TS 侧入口。
  - `bin/skills-hub`：新增 `scan-projects` 与 `--force`，输出耗时指标。
  - `__tests__/scanner.test.ts`：新增缓存命中/强制刷新回归测试。
  - `__tests__/scanner-cli.test.ts`：新增 CLI 扫描行为测试。
  - `README.md`、`README_zh.md`：补充新命令与缓存说明。
  - `package.json`：发布文件清单加入 `lib/scanner-core.mjs`/`.d.ts`。
- Out of scope
  - Tauri Rust 端扫描流程改造。
  - 扫描策略（最大深度、忽略目录）规则变更。
  - 缓存哈希化（本次按 issue 要求用 mtime）。

## Change Plan

- 新增共享扫描核心模块，缓存文件固定为 `~/.skills-hub/cache/project-scan.json`，按 root 记录目录树缓存。
- 递归扫描时先比较目录 `mtimeMs`：
  - 相同：直接复用缓存 repos，跳过子目录遍历；
  - 不同：仅重扫变化分支并回写最新缓存。
- `scanForProjects(roots, { force })` 支持 `force=true` 跳过缓存读取命中逻辑并重建缓存。
- CLI 新增 `skills-hub scan-projects`：
  - 读取配置中的 `scanRoots`；
  - 调用扫描并打印项目数、缓存文件路径、耗时（start/end 差值）；
  - `--force` 触发强制刷新。

## Risks

- 目录 `mtime` 依赖文件系统语义，不同平台粒度可能不同；通过强制刷新兜底。
- 缓存文件损坏或格式异常可能导致读取失败；实现中已回退为空缓存并继续扫描。
- 新增 CLI 命令需确保 npm 发布包含 runtime 文件；已同步更新 `package.json` files 清单。

## Validation Commands

- `npm run test -- --run __tests__/scanner.test.ts`
  - 通过标准：缓存文件写入成功；第二次扫描 readdir 次数下降；`force` 时重新扫描。
- `npm run test -- --run __tests__/scanner-cli.test.ts`
  - 通过标准：`scan-projects` 输出项目与耗时；`--force` 输出强制刷新标识。
- `npm test -- --run`
  - 通过标准：全量测试通过，无回归。
