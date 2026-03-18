# AGENTS.md

## Project Overview

- This project supports scientific discovery, bioinformatics, or computational chemistry workflows.
- Prefer reproducible analysis, explicit data provenance, and conservative interpretation.

## Engineering Rules

- Separate data access, processing, analysis, and reporting.
- Keep domain assumptions visible near the code or report that depends on them.
- Treat external scientific databases as versioned inputs.

## Quality Bar

- Document changed datasets, parameters, or biological assumptions.
- Note reproducibility gaps when full reruns are too expensive.
- Avoid claiming experimental validity when only computational evidence exists.
