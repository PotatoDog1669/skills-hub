import fs from 'fs-extra'
import path from 'path'

/**
 * Copies a skill from source to destination.
 * If destination exists, it overwrites it.
 */
export async function syncSkill(
  sourcePath: string,
  destParentPath: string,
  syncMode: 'copy' | 'link' = 'copy'
): Promise<string> {
  const skillDirName = path.basename(sourcePath)
  const destPath = path.join(destParentPath, skillDirName)

  // Prevent syncing to self
  if (sourcePath === destPath) {
    return destPath
  }

  try {
    await fs.ensureDir(destParentPath)

    if (syncMode === 'link') {
      // For link mode, we strictly want a symlink.
      // Remove whatever is there (dir or link)
      await fs.remove(destPath)
      await fs.ensureSymlink(sourcePath, destPath)
    } else {
      // Copy mode
      // If it's currently a symlink, we must remove it to replace with a real copy
      const isSymlink = await fs
        .lstat(destPath)
        .then((s) => s.isSymbolicLink())
        .catch(() => false)

      if (isSymlink) {
        await fs.remove(destPath)
      }
      await fs.copy(sourcePath, destPath, { overwrite: true, errorOnExist: false })
    }

    return destPath
  } catch (error) {
    console.error(`Failed to sync skill from ${sourcePath} to ${destPath}:`, error)
    throw error
  }
}

/**
 * Deletes a skill directory.
 */
export async function deleteSkill(skillPath: string): Promise<void> {
  try {
    await fs.remove(skillPath)
  } catch (error) {
    console.error(`Failed to delete skill at ${skillPath}:`, error)
    throw error
  }
}
