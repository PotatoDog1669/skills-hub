# AGENTS.md

## Project Overview

- This project builds LangChain or LangGraph applications.
- Optimize for explicit orchestration, reproducible agent behavior, and durable state handling.

## Engineering Rules

- Keep prompt, tool, graph, and persistence concerns separated.
- Prefer observable, testable chains and graphs over hidden control flow.
- Make memory, checkpointing, and human-in-the-loop boundaries explicit.

## Quality Bar

- Document graph transitions and failure paths.
- Validate retrieval, tool calling, and persistence behavior with deterministic checks when practical.
- Call out provider-specific assumptions and token-cost implications.
