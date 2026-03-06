# Release vX.Y.Z

> Published: YYYY-MM-DD

## Download & Installation

### Homebrew CLI (macOS/Linux)

```bash
brew tap PotatoDog1669/skillshub
brew install skills-hub
```

### Desktop App (macOS)

```bash
curl -Ls https://potatodog1669.github.io/skills-hub/install.sh | sh
```

### CLI (npm, Recommended)

```bash
npm i -g @skillshub-labs/cli@X.Y.Z
skills-hub --version
```

### CLI (npx, No Global Install)

```bash
npx @skillshub-labs/cli@X.Y.Z --help
```

### Source Archives

- Zip: `https://github.com/PotatoDog1669/skills-hub/archive/refs/tags/vX.Y.Z.zip`
- Tarball: `https://github.com/PotatoDog1669/skills-hub/archive/refs/tags/vX.Y.Z.tar.gz`

### Desktop Installers

| Platform | Architecture | Asset Name | Notes |
| :------- | :----------- | :--------- | :---- |
| macOS | Apple Silicon | `skills-hub_X.Y.Z_macos_aarch64.tar.gz` | Used by `install.sh` |
| macOS | Intel | `skills-hub_X.Y.Z_macos_x64.tar.gz` | Used by `install.sh` |
| macOS | Apple Silicon | `skills-hub_X.Y.Z_macos_aarch64.dmg` | Manual fallback |
| macOS | Intel | `skills-hub_X.Y.Z_macos_x64.dmg` | Manual fallback |
| Windows | x64 | `skills-hub-vX.Y.Z-*.msi` | Example placeholder |
| Linux | x64 | `skills-hub-vX.Y.Z-*.AppImage` | Example placeholder |

## What's Changed

### Features

- ...

### Fixes

- ...

### Refactors / Docs / Chore

- ...

## Breaking Changes

- None

## Verification Checklist

- [ ] npm package published successfully
- [ ] `npm i -g @skillshub-labs/cli@X.Y.Z` works on a clean environment
- [ ] `skills-hub --help` and key command smoke tests pass
- [ ] Release notes match actual shipped behavior
- [ ] Desktop installer works: `curl -Ls https://potatodog1669.github.io/skills-hub/install.sh | sh`
- [ ] Desktop assets are attached and downloadable

## Full Changelog

`https://github.com/PotatoDog1669/skills-hub/compare/vPREV...vX.Y.Z`
