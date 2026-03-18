# AGENTS.md

## Project Overview

- This project focuses on Hugging Face based ML workflows.
- Prefer reproducible datasets, explicit evaluation criteria, and traceable experiment changes.

## Engineering Rules

- Separate data preparation, training, evaluation, and publishing steps.
- Record dataset and model assumptions explicitly.
- Keep training configuration and infrastructure choices reviewable.

## Quality Bar

- Note compute, hardware, and runtime tradeoffs.
- Make metrics, checkpoints, and experiment tracking outputs explicit.
- Avoid undocumented changes to evaluation methodology.
