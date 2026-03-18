# AGENTS.md

## Project Overview

- This project uses Next.js, React, and TypeScript.
- Favor small, testable changes that preserve existing UI and data flow patterns.

## Repository Layout

- Keep route, UI, and data access concerns separated.
- Prefer existing component and app-router conventions over introducing parallel structures.

## Dev Commands

- Run the existing lint, typecheck, and test commands before finalizing changes.
- If a UI change affects rendering behavior, validate the relevant app or page flow manually as well.

## Testing Instructions

- Cover changed behavior with deterministic tests when practical.
- If a change touches UI state or routing, check loading, empty, and error states.

## Architecture Boundaries

- Keep business logic out of UI components when possible.
- Avoid introducing new abstractions unless the same pattern is clearly reused.

## PR / Change Rules

- Explain user-visible behavior changes directly.
- Call out risky UI, routing, or state changes before merge.
