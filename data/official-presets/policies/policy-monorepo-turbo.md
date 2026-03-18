# AGENTS.md

## Project Overview

- This project uses a workspace or monorepo layout.
- Prefer scoped, reviewable changes with a clear impact boundary.

## Repository Layout

- Respect package, app, and shared library boundaries.
- Reuse the existing workspace structure instead of introducing parallel module trees.

## Dev Commands

- Run the narrowest workspace build, lint, typecheck, and test commands that validate the change.
- Note any packages or apps intentionally not rechecked.

## Testing Instructions

- Validate the directly changed package first, then any affected downstream package if the boundary moved.
- Call out cross-package risk when shared contracts or utilities change.

## Architecture Boundaries

- Avoid cross-package shortcuts and hidden imports.
- Keep ownership and dependency direction explicit.

## PR / Change Rules

- Summarize which packages or apps were touched.
- State the likely blast radius and what was verified.
