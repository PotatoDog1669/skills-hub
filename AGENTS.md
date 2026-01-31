# AGENTS.md

## Core Philosophy & Principles

> **Keep It Simple (KISS)**
> Adhere to simple, clear, and maintainable design. Avoid over-engineering and unnecessary defensive complexity.

> **First Principles Thinking**
> Analyze problems from first principles. Leverage tools to enhance reasoning and execution efficiency when necessary.

> **Facts First**
> Facts and evidence are the highest standard. If there are errors, point them out and correct them immediately to continuously improve result quality.

---

## Development Workflow

> **Progressive Clarification & Implementation**
> Clarify requirements and advance implementation through multi-round dialogue. Before starting any design or coding, complete necessary research and eliminate key uncertainties.

> **Structured Execution Process**
> Strictly follow this sequence:
> **Ideation -> Review & Approval -> Task Breakdown & Execution**

---

## Release Specification

To avoid race conditions during the CI/CD release process, which can lead to publishing old version code, strictly follow this procedure:

1.  **Update Version Number**
    Update the `version` field in `package.json`.

2.  **Commit Changes**

    ```bash
    git commit -m "chore(release): bump version to x.x.x"
    ```

3.  **Critical Step: Push Code First**
    You must ensure the code containing the new version number has reached the remote repository.

    ```bash
    # Ensure main branch code is pushed
    git push origin main
    ```

4.  **Tag & Push Tag**
    After confirming the code push is successful, trigger the GitHub Action release process by pushing the tag.
    ```bash
    # Create tag (e.g., v0.1.6)
    git tag vx.x.x
    # Push tag
    git push origin vx.x.x
    ```
