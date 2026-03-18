# AGENTS.md

## Project Overview

- This project targets Cloudflare, Workers, or edge-runtime deployments.
- Prefer small, deployable changes that respect edge limits and runtime constraints.

## Engineering Rules

- Keep environment, bindings, and deployment configuration explicit.
- Design with edge latency, stateless execution, and runtime limits in mind.
- Separate local development assumptions from deployed behavior.

## Quality Bar

- Note compatibility constraints for Workers, Durable Objects, and AI integrations.
- Highlight deployment, routing, and observability impact.
- Avoid hidden coupling between local-only tooling and edge runtime code.
