# AGENTS.md

## Project Overview

- This project ships product features across frontend and backend boundaries.
- Prefer small, reviewable changes with clear contracts and rollback paths.

## Frontend Rules

- Default to React Server Components when possible.
- Keep UI state minimal and colocated.
- Avoid waterfalls, oversized client bundles, and duplicate data fetching.

## Backend Rules

- Validate inputs at the boundary.
- Keep transport handlers thin and move business logic into services.
- Make schema, auth, and migration changes explicit.

## Delivery Workflow

- Break work into a short plan before implementation.
- Add or update regression tests for changed behavior.
- Call out UX, API, and data-model risk clearly in the final summary.
