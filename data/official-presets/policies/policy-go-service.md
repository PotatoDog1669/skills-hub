# AGENTS.md

## Project Overview

- This project uses Go for backend or service development.
- Prefer explicit control flow, predictable errors, and reviewable changes.

## Repository Layout

- Keep transport, service, storage, and shared utility layers separated.
- Reuse established package boundaries before adding new ones.

## Dev Commands

- Run the relevant Go formatting, lint, test, and build checks before finalizing changes.
- If concurrency or interfaces change, validate the directly impacted package and callers.

## Testing Instructions

- Add regression coverage for behavior changes or bug fixes.
- Exercise timeout, cancellation, and failure paths when they are part of the change.

## Architecture Boundaries

- Keep goroutine usage, context propagation, and error ownership explicit.
- Avoid hidden shared state or cross-package shortcuts.

## PR / Change Rules

- Summarize affected packages and service boundaries.
- Call out concurrency, performance, or operational risk explicitly.
