# AGENTS.md

## Project Overview

- This project targets Azure cloud application development.
- Prefer explicit service boundaries, identity handling, and environment-aware deployment choices.

## Engineering Rules

- Keep SDK usage, infra assumptions, and app logic separated.
- Treat identity, secrets, queues, and search indexes as explicit dependencies.
- Prefer maintainable service composition over implicit framework magic.

## Quality Bar

- Call out resource, auth, and provisioning assumptions directly.
- Document local-vs-cloud behavior differences.
- Avoid partial infra changes without noting the required follow-up steps.
