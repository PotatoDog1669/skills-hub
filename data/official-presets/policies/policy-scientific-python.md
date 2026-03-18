# AGENTS.md

## Project Overview

- This project supports scientific Python, literature review, or reproducible analysis workflows.
- Prefer traceable claims, reproducible steps, and explicit assumptions.

## Repository Layout

- Keep source data, derived outputs, and narrative artifacts clearly separated.
- Avoid mixing exploratory notebooks, reusable code, and final reporting outputs without a clear reason.

## Dev Commands

- Run the relevant checks or scripts needed to reproduce changed outputs.
- If notebooks or reports are touched, verify the dependent data and execution steps still line up.

## Testing Instructions

- Prefer deterministic validation for transformed data and reusable analysis code.
- Document what was not re-run when full reproduction is too expensive.

## Architecture Boundaries

- Keep data acquisition, processing, analysis, and reporting concerns explicit.
- Record assumptions around datasets, citations, and external scientific sources.

## PR / Change Rules

- Explain how conclusions, figures, or cited evidence changed.
- Call out reproducibility gaps, missing inputs, or unverified claims directly.
