# Homebrew Tap Setup (Maintainers)

This project can auto-update a Homebrew formula after each tagged release.

## 1) Create Tap Repository

Create a public repository:

- `PotatoDog1669/homebrew-skillshub`

Directory structure:

```text
Formula/
  skills-hub.rb
```

## 2) Configure GitHub Secrets / Variables

In this repository (`skills-hub`) set:

- Secret: `HOMEBREW_TAP_GITHUB_TOKEN`
  - A classic PAT (or fine-grained token) with write access to the tap repo.
  - Minimum permission: repository `contents: write`.
- Variable (optional): `HOMEBREW_TAP_REPO`
  - Default fallback is `PotatoDog1669/homebrew-skillshub`.

## 3) Release Flow

When tag `v*` is pushed:

1. Publish npm package.
2. Resolve npm tarball for the new version.
3. Compute tarball SHA256.
4. Render `Formula/skills-hub.rb`.
5. Commit and push formula update to tap repo.

## 4) User Install Commands

```bash
brew tap PotatoDog1669/skillshub
brew install skills-hub
```
