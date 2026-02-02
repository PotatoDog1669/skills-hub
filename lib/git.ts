import simpleGit from 'simple-git'
import fs from 'fs-extra'
import path from 'path'

export interface GitStatus {
  isGit: boolean
  hasRemote: boolean
  behindCount: number
  remoteUrl?: string
  isSubDir?: boolean // If true, it's a subdir in a repo
}

/**
 * Checks git status for a skill path.
 * Supports both root git repos and subdirectories.
 */
export async function checkGitStatus(skillPath: string): Promise<GitStatus> {
  try {
    // 1. Check if the directory itself is a git root
    const isRootGit = await fs.pathExists(path.join(skillPath, '.git'))

    if (isRootGit) {
      const git = simpleGit(skillPath)
      const isRepo = await git.checkIsRepo()
      if (!isRepo) return { isGit: false, hasRemote: false, behindCount: 0 }

      const remotes = await git.getRemotes(true)
      const hasRemote = remotes.length > 0
      let behindCount = 0

      if (hasRemote) {
        try {
          await git.fetch()
          const status = await git.status()
          behindCount = status.behind
        } catch (e) {
          console.warn('Git fetch failed:', e)
        }
      }

      return {
        isGit: true,
        hasRemote,
        behindCount,
        remoteUrl: remotes[0]?.refs.fetch,
        isSubDir: false,
      }
    } else {
      // 2. Check if it's inside a git repo (upwards traversal)
      const git = simpleGit(skillPath)

      try {
        // Use rev-parse to check if inside work tree
        const isInside = await git.revparse(['--is-inside-work-tree'])
        if (isInside.trim() === 'true') {
          const remoteUrl = await git.listRemote(['--get-url'])
          return {
            isGit: true,
            hasRemote: !!remoteUrl,
            behindCount: 0,
            remoteUrl: remoteUrl ? remoteUrl.trim() : undefined,
            isSubDir: true,
          }
        }
      } catch {
        // Not inside a repo or error running git
      }
    }

    return { isGit: false, hasRemote: false, behindCount: 0 }
  } catch (error) {
    console.warn('Error checking git status:', error)
    return { isGit: false, hasRemote: false, behindCount: 0 }
  }
}

export async function pullUpdates(skillPath: string): Promise<void> {
  const git = simpleGit(skillPath)
  await git.pull()
}
