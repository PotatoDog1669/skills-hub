import fs from 'fs-extra'
import path from 'path'
import os from 'os'

/**
 * Scans directories within the given roots for git repositories.
 * Returns a list of absolute paths to projects.
 *
 * Supports finding projects nested deeper (e.g. workspace/Org/Repo).
 */
export async function scanForProjects(roots: string[]): Promise<string[]> {
  const foundProjects: Set<string> = new Set()
  const MAX_DEPTH = 5 // Allow deeper nested monorepos
  const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next'])

  // Helper to verify if a folder is a git repo root.
  async function isProject(dirPath: string): Promise<boolean> {
    // Explicitly exclude home directory
    // We compare resolved paths to be safe
    const resolvedPath = path.resolve(dirPath)
    // os.homedir() returns absolute path, resolve ensures consistency
    if (resolvedPath === path.resolve(os.homedir())) {
      return false
    }

    const gitPath = path.join(dirPath, '.git')
    if (!(await fs.pathExists(gitPath))) {
      return false
    }

    try {
      const stats = await fs.lstat(gitPath)
      return stats.isDirectory() || stats.isFile()
    } catch {
      return false
    }
  }

  // Recursive directory walker
  async function walk(dir: string, currentDepth: number) {
    if (currentDepth > MAX_DEPTH) return
    if (!(await fs.pathExists(dir))) return

    try {
      if (await isProject(dir)) {
        // Normalize path before adding
        foundProjects.add(path.resolve(dir))
        // We continue scanning to support monorepos
      }

      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          // Skip dot folders (except maybe .agent if we needed to, but we don't scan INSIDE .agent)
          // Also explicitly skip node_modules etc.
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
            continue
          }
          await walk(path.join(dir, entry.name), currentDepth + 1)
        }
      }
    } catch {
      // Permission denied or other fs errors
    }
  }

  for (const root of roots) {
    await walk(path.resolve(root), 0)
  }

  return Array.from(foundProjects)
}
