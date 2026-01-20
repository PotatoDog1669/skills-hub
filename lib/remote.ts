import fs from 'fs-extra'
import path from 'path'
import simpleGit, { SimpleGit } from 'simple-git'
import os from 'os'

/**
 * Downloads a specific subdirectory from a remote git repository using sparse-checkout.
 * This avoids downloading the entire history and other directories.
 *
 * @param repoUrl The full git URL (e.g. https://github.com/vercel-labs/add-skill.git)
 * @param subdir The specific subdirectory to checkout (e.g. skills/git-commit). If empty, checks out root.
 * @param destPath The local destination path
 * @param branch The branch to checkout. If omitted, resolve remote default.
 */
async function resolveDefaultBranch(git: SimpleGit): Promise<string | null> {
  try {
    const result = await git.listRemote(['--symref', 'origin', 'HEAD'])
    const match = result.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function downloadRemoteSkill(
  repoUrl: string,
  subdir: string,
  destPath: string,
  branch?: string
) {
  // Create a temporary directory for the operation
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-import-'))
  const git = simpleGit(tempDir)

  try {
    console.log(`[Remote] Initializing temp repo at ${tempDir}`)
    await git.init()
    await git.addRemote('origin', repoUrl)

    // efficient: enable sparse checkout
    await git.addConfig('core.sparseCheckout', 'true')

    if (subdir) {
      console.log(`[Remote] Configuring sparse checkout for: ${subdir}`)
      await fs.writeFile(path.join(tempDir, '.git/info/sparse-checkout'), subdir + '\n')
    } else {
      await fs.writeFile(path.join(tempDir, '.git/info/sparse-checkout'), '*\n')
    }

    const requestedBranch = branch?.trim()
    const defaultBranch = requestedBranch ? null : await resolveDefaultBranch(git)
    const branchesToTry = requestedBranch
      ? [requestedBranch]
      : defaultBranch
        ? [defaultBranch]
        : ['main', 'master']

    console.log(`[Remote] Pulling from origin (depth=1)...`)
    // efficient: shallow fetch
    let pulledBranch = ''
    let lastError: unknown
    for (const candidate of branchesToTry) {
      try {
        await git.pull('origin', candidate, { '--depth': 1 })
        pulledBranch = candidate
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!pulledBranch) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Failed to resolve default branch for remote repository.')
    }

    // Move the target content to final destination
    // If subdir is specified, we only move that specific folder's content
    const sourceContentPath = subdir ? path.join(tempDir, subdir) : tempDir

    // Check if source exists
    if (!(await fs.pathExists(sourceContentPath))) {
      throw new Error(`Directory '${subdir}' not found in remote repository.`)
    }

    console.log(`[Remote] Moving files to ${destPath}...`)
    await fs.ensureDir(path.dirname(destPath)) // Ensure parent exists
    await fs.copy(sourceContentPath, destPath)

    console.log('[Remote] Download complete.')
  } catch (error) {
    console.error('[Remote] Error downloading skill:', error)
    throw error
  } finally {
    // Cleanup temp directory
    await fs.remove(tempDir)
  }
}
