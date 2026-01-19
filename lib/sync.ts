import fs from 'fs-extra';
import path from 'path';

/**
 * Copies a skill from source to destination.
 * If destination exists, it overwrites it.
 */
export async function syncSkill(sourcePath: string, destParentPath: string): Promise<string> {
    const skillDirName = path.basename(sourcePath);
    const destPath = path.join(destParentPath, skillDirName);

    // Prevent syncing to self
    if (sourcePath === destPath) {
        return destPath;
    }

    try {
        await fs.ensureDir(destParentPath);
        await fs.copy(sourcePath, destPath, { overwrite: true, errorOnExist: false });
        return destPath;
    } catch (error) {
        console.error(`Failed to sync skill from ${sourcePath} to ${destPath}:`, error);
        throw error;
    }
}

/**
 * Deletes a skill directory.
 */
export async function deleteSkill(skillPath: string): Promise<void> {
    try {
        await fs.remove(skillPath);
    } catch (error) {
        console.error(`Failed to delete skill at ${skillPath}:`, error);
        throw error;
    }
}
