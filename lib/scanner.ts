import fs from 'fs-extra'
import path from 'path'
import { getConfig } from './config'
import os from 'os'

/**
 * Scans directories within the given roots for project-level skill folders.
 * Returns a list of absolute paths to projects that contain skills.
 *
 * Supports finding projects nested deeper (e.g. workspace/Org/Repo).
 */
export async function scanForProjects(roots: string[]): Promise<string[]> {
  const foundProjects: Set<string> = new Set()
  const MAX_DEPTH = 5 // Allow deeper nested monorepos
  const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next'])

  const config = await getConfig()
  const activeAgents = config.agents.filter((a) => a.enabled)

  // Helper to verify if a folder is a valid project (has skill dirs)
  async function isProject(dirPath: string): Promise<boolean> {
    // Explicitly exclude home directory
    // We compare resolved paths to be safe
    const resolvedPath = path.resolve(dirPath)
    // os.homedir() returns absolute path, resolve ensures consistency
    if (resolvedPath === path.resolve(os.homedir())) {
      return false
    }

    for (const agent of activeAgents) {
      if (await fs.pathExists(path.join(dirPath, agent.projectPath))) {
        return true
      }
    }
    return false
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
        if (entry.isDirectory()) {
          // Skip dot folders (except maybe .agent if we needed to, but we don't scan INSIDE .agent)
          // Also explicitly skip node_modules etc.
          if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
            continue
          }
          await walk(path.join(dir, entry.name), currentDepth + 1)
        }
      }
    } catch (_) {
      // Permission denied or other fs errors
    }
  }

  for (const root of roots) {
    await walk(path.resolve(root), 0)
  }

  return Array.from(foundProjects)
}
