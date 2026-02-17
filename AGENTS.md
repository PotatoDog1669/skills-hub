# AGENTS.md

This document defines the engineering standards for this repository (`skills-hub`).
Goal: keep code simple, maintainable, and consistent across Desktop UI, CLI, and core logic.

## 1) Core Principles

1. **Simplicity First (KISS)**
   - Prefer the smallest correct solution.
   - Avoid speculative abstractions and defensive complexity.

2. **Maintainability Over Cleverness**
   - Code should be obvious to future contributors.
   - Favor explicit naming, clear control flow, and small units.

3. **Single Source of Truth**
   - Shared business logic belongs in shared modules.
   - Do not duplicate behavior across CLI, UI, and Tauri backend.

4. **Facts First**
   - Validate assumptions with code, tests, and repo evidence.
   - If behavior is unclear, confirm before implementing.

## 2) Architecture Boundaries

- `lib/core/*`: pure domain logic and data transforms; avoid UI/terminal concerns.
- `lib/services/*`: orchestration over core logic (filesystem, git, provider/kit flows).
- `bin/skills-hub`: CLI command parsing and user-facing CLI output only.
- `components/*` + `apps/desktop-ui/src/*`: UI composition, state wiring, and view logic.
- `src-tauri/src/*`: desktop-native integration (OS access, secure file ops, platform behavior).

Rules:
- Keep heavy logic out React components and command handlers.
- If logic is needed by multiple entry points, extract it into `lib/core` or `lib/services`.
- Respect layering; avoid cross-layer shortcuts that increase coupling.

## 3) Coding Standards

1. **TypeScript quality**
   - Keep strict typing; avoid `any` unless unavoidable and documented.
   - Prefer narrow types and explicit return types for exported functions.

2. **Complexity control**
   - Keep functions focused and short.
   - Use early returns and guard clauses to reduce nesting.
   - Split large modules by responsibility, not by arbitrary file size.

3. **Error handling**
   - Fail with actionable error messages (what failed + why + next hint when possible).
   - Never swallow errors silently.
   - For destructive operations, validate inputs first.

4. **Comments and naming**
   - Use names that explain intent.
   - Add comments for *why*, not *what*.
   - Remove dead code instead of commenting it out.

5. **Dependencies**
   - Prefer existing project dependencies and platform APIs first.
   - Add new dependency only with clear justification (complexity, maintenance, bundle/runtime impact).

## 4) Workflow (Required)

Follow this sequence for non-trivial work:

1. **Ideation**: clarify scope, constraints, and acceptance criteria.
2. **Review & Approval**: align on approach before large changes.
3. **Task Breakdown & Execution**: implement in small, reviewable steps.
4. **Verification**: run quality gates and confirm behavior.

## 5) Testing & Quality Gates

Before merge, run the relevant checks:

```bash
npm run lint
npm run typecheck
npm run test -- --run
```

Also run when applicable:

```bash
npm run build
npm run tauri:build
```

When `src-tauri` code changes, also run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Testing requirements:
- Bug fixes must include a regression test.
- Behavior changes should update or add tests in `__tests__`.
- Keep tests deterministic and avoid external network dependency.

## 6) Git & Change Hygiene

1. Use focused commits (one logical change per commit).
2. Use Conventional Commits when possible (`feat:`, `fix:`, `refactor:`, `chore:`...).
3. Do not mix large refactors with behavior changes unless necessary.
4. Update documentation (`README`, `docs/*`) when user-facing behavior changes.

## 7) Release Specification (Mandatory)

To avoid CI/CD race conditions that can publish old code, follow this exact order:

1. **Update Version Number**
   - Update `version` in `package.json`.

2. **Commit Changes**

```bash
git commit -m "chore(release): bump version to x.x.x"
```

3. **Critical Step: Push Code First**
   - Ensure the commit containing the new version is already on remote `main`.

```bash
git push origin main
```

4. **Tag & Push Tag**
   - Only after step 3 succeeds, create and push release tag.

```bash
git tag vx.x.x
git push origin vx.x.x
```
