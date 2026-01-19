'use server';

import { syncSkill, deleteSkill } from '@/lib/sync';
import {
    addProjectPath, removeProjectPath, getConfig, saveConfig,
    addScanRoot, removeScanRoot, updateAgentConfig, removeAgentConfig, AgentConfig
} from '@/lib/config';
import { scanForProjects } from '@/lib/scanner';
import { revalidatePath } from 'next/cache';

export async function actionSyncSkill(source: string, destParent: string) {
    await syncSkill(source, destParent);
    revalidatePath('/');
}

export async function actionCollectToHub(sourcePath: string) {
    const config = await getConfig();
    await syncSkill(sourcePath, config.hubPath);
    revalidatePath('/');
}

export async function actionDeleteSkill(path: string) {
    await deleteSkill(path);
    revalidatePath('/');
}

export async function actionAddProject(path: string) {
    await addProjectPath(path);
    revalidatePath('/');
}

export async function actionRemoveProject(path: string) {
    await removeProjectPath(path);
    revalidatePath('/');
}

// Scanning Actions
export async function actionAddScanRoot(path: string) {
    await addScanRoot(path);
    revalidatePath('/');
}

export async function actionRemoveScanRoot(path: string) {
    await removeScanRoot(path);
    revalidatePath('/');
}

export async function actionScanAndAddProjects() {
    const config = await getConfig();
    const newProjects = await scanForProjects(config.scanRoots);

    let addedCount = 0;
    for (const p of newProjects) {
        if (!config.projects.includes(p)) {
            config.projects.push(p);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        await saveConfig(config);
        revalidatePath('/');
    }
    return addedCount;
}

// Agent Actions
export async function actionUpdateAgentConfig(agent: AgentConfig) {
    await updateAgentConfig(agent);
    revalidatePath('/');
}

export async function actionRemoveAgentConfig(agentName: string) {
    await removeAgentConfig(agentName);
    revalidatePath('/');
}
