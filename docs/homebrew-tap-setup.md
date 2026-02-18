# Homebrew Tap Setup (Maintainers)

This project can auto-update Homebrew formula/cask files after each tagged release.

## 1) Create Tap Repository

Create a public repository:

- `PotatoDog1669/homebrew-skillshub`

Directory structure:

```text
Formula/
  skills-hub.rb
Casks/
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

1. Build and upload macOS desktop DMG assets (Apple Silicon + Intel) to GitHub Release.
2. Publish npm package.
3. Resolve npm tarball for the new version.
4. Compute SHA256 for npm tarball + both DMG assets.
5. Render `Formula/skills-hub.rb` (CLI).
6. Render `Casks/skills-hub.rb` (Desktop app).
7. Commit and push tap updates.

## 4) User Install Commands

Install CLI:

```bash
brew tap PotatoDog1669/skillshub
brew install skills-hub
```

Install Desktop app:

```bash
brew tap PotatoDog1669/skillshub
brew install --cask skills-hub
```
