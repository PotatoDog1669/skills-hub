# AGENTS.md

## Project Overview

- This workflow supports releases, change summaries, and maintainer tasks.
- Prefer correctness, traceability, and conservative changes over speed.

## Repository Layout

- Keep release metadata, automation, and user-facing documentation aligned with the code change set.
- Reuse existing release and changelog conventions.

## Dev Commands

- Run the project checks needed to confirm release readiness.
- Revalidate release-related config or automation when workflows change.

## Testing Instructions

- Confirm the relevant build, packaging, or release validation path still works.
- Document any checks that could not be run locally.

## Architecture Boundaries

- Treat release automation, packaging, and changelog generation as separate concerns.
- Keep manual release notes consistent with automated outputs.

## PR / Change Rules

- Summarize release impact, packaging impact, and compatibility notes clearly.
- Highlight manual follow-up tasks when automation does not cover them.
