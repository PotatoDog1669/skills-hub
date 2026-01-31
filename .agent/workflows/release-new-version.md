---
description: Release a new version of the package safely to avoid race conditions
---

1. **Check Prerequisites**
   Ensure you are on the `main` branch and your working directory is clean.

   ```bash
   git checkout main
   git pull origin main
   ```

2. **Update Version**
   Update the version in `package.json`.

   ```bash
   # Example: npm version patch --no-git-tag-version
   # Or manually edit package.json
   ```

3. **Commit Changes**
   Commit the version bump.

   ```bash
   git add package.json package-lock.json
   git commit -m "chore(release): bump version to <VERSION>"
   ```

4. **Push Commit (CRITICAL)**
   Push the commit to the remote repository _before_ creating/pushing the tag. This ensures the CI/CD pipeline sees the new version in `package.json` when the tag triggers the build.

   ```bash
   git push origin main
   ```

5. **Create and Push Tag**
   Now that the code is safely on the remote, create and push the tag.

   ```bash
   git tag v<VERSION>
   git push origin v<VERSION>
   ```

6. **Monitor Release**
   Check the GitHub Actions tab to confirm the release workflow runs successfully.
