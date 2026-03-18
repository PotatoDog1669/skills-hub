# AGENTS.md

## Project Overview

- This project supports release engineering, CI maintenance, and change-management workflows.
- Prefer correctness, traceability, and safe automation over speed.

## Engineering Rules

- Keep release, documentation, and automation changes aligned.
- Treat flaky CI and broken checks as root-cause problems, not cosmetic issues.
- Preserve auditability for release notes, version bumps, and workflow edits.

## Quality Bar

- State what was verified locally and what still depends on CI.
- Call out packaging, deployment, or rollback risk explicitly.
- Avoid silent workflow changes without explaining impact.
