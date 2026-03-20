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
  - Do not use this repository's default `GITHUB_TOKEN`; it cannot push to a different repository.
  - For a fine-grained PAT, explicitly grant access to the tap repo itself.
  - If the tap repo belongs to an organization with SSO enabled, authorize the token for that organization.
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

If the release already published to npm but the tap step failed, run the GitHub Actions workflow `Update Homebrew Tap` with the released version, for example `0.1.20`. This workflow downloads the DMG assets from the existing GitHub Release and updates only the tap repository.

## 4) Troubleshooting

If release fails with:

```text
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/<owner>/<repo>.git/'
```

Check these first:

- `HOMEBREW_TAP_GITHUB_TOKEN` is a PAT or GitHub App installation token, not the source repository `GITHUB_TOKEN`.
- The token can access `PotatoDog1669/homebrew-skillshub` (or the repo in `HOMEBREW_TAP_REPO`).
- The token has repository `contents: write`.
- If you used a fine-grained PAT, the tap repo was selected explicitly when creating the token.
- If the tap repo is under an organization, SSO authorization has been completed for the token.
- If npm already contains the target version, do not rerun the full release just to repair Homebrew. Use the manual `Update Homebrew Tap` workflow instead.

## 5) User Install Commands

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
