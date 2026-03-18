# AGENTS.md

## Project Overview

- This project uses Python for service or API development.
- Prefer explicit validation, clear contracts, and small changes with obvious rollback paths.

## Repository Layout

- Keep route handlers, schemas, domain logic, and persistence concerns separate.
- Reuse existing package and module boundaries before adding new abstractions.

## Dev Commands

- Run the relevant lint, typecheck, and test commands before finalizing changes.
- Re-run API- or schema-related checks if request or response shapes change.

## Testing Instructions

- Add or update regression tests for changed service behavior.
- Cover error paths when validation, dependencies, or integrations are touched.

## Architecture Boundaries

- Keep transport code thin and push reusable logic into shared modules.
- Make dependency, schema, and migration changes explicit.

## PR / Change Rules

- Explain API-facing behavior changes directly.
- Note migration, validation, or compatibility risks when present.
