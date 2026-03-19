# AGENTS.md

## Project Scope

- This project delivers product features across UI, API, and data boundaries.
- Prefer small, reversible changes with explicit contracts between layers.
- Optimize for maintainability and predictable behavior over cleverness.

## Architecture Rules

- Keep business rules in shared services, not in route handlers or UI components.
- UI components handle presentation and local interaction only.
- API routes and server actions validate input, enforce auth, and delegate to services.
- Schema and migration changes must be explicit and reviewed with rollout impact in mind.

## Frontend Rules

- Prefer React Server Components for read-heavy views and use client components only where interaction requires them.
- Keep client state minimal, local, and derived whenever possible.
- Avoid waterfalls, oversized client bundles, and duplicate data fetching across server and client.
- Handle loading, empty, error, and mutation states intentionally.
- Forms and optimistic updates must include validation and failure recovery.

## Backend Rules

- Validate input and permissions at the boundary.
- Keep transport handlers thin and move business logic into services.
- Make writes idempotent when retries are plausible.
- Be explicit about transactions, consistency assumptions, and side effects.
- Schema, auth, and migration changes must include rollback notes when risk is non-trivial.

## Quality Rules

- Changed behavior requires regression coverage.
- Add integration tests for cross-boundary changes.
- Call out performance, accessibility, and SEO impact for user-facing changes when relevant.
- Fail with actionable errors and do not swallow exceptions silently.

## Delivery Workflow

- Start with a short implementation plan for non-trivial work.
- Separate refactors from behavior changes unless coupling makes that impractical.
- Call out UX, API, data-model, and rollout risk clearly in the final summary.
