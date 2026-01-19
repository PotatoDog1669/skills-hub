import fs from 'fs-extra';
import path from 'path';
import { getConfig } from './config';

/**
 * Scans directories within the given roots for project-level skill folders.
 * Returns a list of absolute paths to projects that contain skills.
 * 
 * Supports finding projects nested deeper (e.g. workspace/Org/Repo).
 */
export async function scanForProjects(roots: string[]): Promise<string[]> {
    const foundProjects: Set<string> = new Set();
    const MAX_DEPTH = 3; // Allow workspace/Org/Repo

    const config = await getConfig();
    const activeAgents = config.agents.filter(a => a.enabled);

    // Helper to verify if a folder is a valid project (has skill dirs)
    async function isProject(dirPath: string): Promise<boolean> {
        for (const agent of activeAgents) {
            if (await fs.pathExists(path.join(dirPath, agent.projectPath))) {
                return true;
            }
        }
        return false;
    }

    // Recursive directory walker
    async function walk(dir: string, currentDepth: number) {
        if (currentDepth > MAX_DEPTH) return;
        if (!await fs.pathExists(dir)) return;

        try {
            // If this directory ITSELF is a project, add it and stop recursing down this branch?
            // No, a project might contain sub-projects (monorepo), though simplified logic suggests yes.
            // Let's check if it is a project first.
            // CAUTION: 'workspace' root itself isn't a project usually.

            if (await isProject(dir)) {
                foundProjects.add(dir);
                // We continue scanning? Usually monorepos might have `packages/foo/.agent`
                // So let's continue.
            }

            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    // Skip dot folders like .git, .vscode, .agent, etc. during traversal
                    // But wait, .agent IS what we look for?
                    // We look for .agent INSIDE the project. We don't walk INSIDE .agent to find projects.
                    // So skipping dot folders is generally safe for finding PROJECT roots.
                    await walk(path.join(dir, entry.name), currentDepth + 1);
                }
            }
        } catch (e) {
            // Permission denied etc.
        }
    }

    for (const root of roots) {
        // Start walking. Root is depth 0.
        // We look for children mainly.
        // If user sets root as '~/workspace/Org/Repo', it should be found immediately.
        await walk(root, 0);
    }

    return Array.from(foundProjects);
}
