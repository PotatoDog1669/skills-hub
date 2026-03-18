# AGENTS.md

## Project Overview

- This project builds Python services or APIs.
- Prefer explicit validation, narrow interfaces, and predictable operational behavior.

## Engineering Rules

- Keep route handlers thin.
- Push reusable logic into services or domain modules.
- Use typed models and validate external input at the edge.

## Quality Bar

- Add regression coverage for changed behavior.
- Surface config, auth, and persistence risk explicitly.
- Treat migrations and public contract changes as high-signal changes.
