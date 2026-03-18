# AGENTS.md

## Project Overview

- This project uses Node.js and TypeScript for API or backend service development.
- Prefer explicit contracts, narrow changes, and clear error handling.

## Repository Layout

- Keep transport, validation, domain logic, and persistence responsibilities separated.
- Reuse existing service and module boundaries instead of bypassing them.

## Dev Commands

- Run lint, typecheck, and tests before finalizing changes.
- If schema or contract files are part of the repo, validate them alongside code changes.

## Testing Instructions

- Add regression coverage for behavior changes or bug fixes.
- Exercise failure paths when input validation, auth, config, or persistence code changes.

## Architecture Boundaries

- Do not mix request parsing, domain logic, and storage concerns in one handler.
- Keep migrations, config changes, and breaking contract changes explicit.

## PR / Change Rules

- Summarize API-facing behavior changes clearly.
- Highlight contract risk, migration risk, and rollback considerations when relevant.
