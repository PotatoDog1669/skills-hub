'use server'

import { syncSkill, deleteSkill } from '@/lib/sync'
import {
  addProjectPath,
  removeProjectPath,
  getConfig,
  saveConfig,
  addScanRoot,
  removeScanRoot,
  updateAgentConfig,
  removeAgentConfig,
  AgentConfig,
} from '@/lib/config'
import { scanForProjects } from '@/lib/scanner'
import { revalidatePath } from 'next/cache'
import path from 'path'
import fs from 'fs-extra'
import { downloadRemoteSkill } from '@/lib/remote'

export async function actionSyncSkill(
  source: string,
  destParent: string,
  syncMode?: 'copy' | 'link'
) {
  await syncSkill(source, destParent, syncMode)
  revalidatePath('/')
}

export async function actionCollectToHub(sourcePath: string) {
  const config = await getConfig()
  await syncSkill(sourcePath, config.hubPath)
  revalidatePath('/')
}

export async function actionDeleteSkill(path: string) {
  await deleteSkill(path)
  revalidatePath('/')
}

export async function actionAddProject(path: string) {
  await addProjectPath(path)
  revalidatePath('/')
}

export async function actionRemoveProject(path: string) {
  await removeProjectPath(path)
  revalidatePath('/')
}

// Scanning Actions
export async function actionAddScanRoot(path: string) {
  await addScanRoot(path)
  revalidatePath('/')
}

export async function actionRemoveScanRoot(path: string) {
  await removeScanRoot(path)
  revalidatePath('/')
}

export async function actionScanAndAddProjects() {
  const config = await getConfig()
  const newProjects = await scanForProjects(config.scanRoots)

  let addedCount = 0

  // Normalize existing projects for comparison
  const existingProjects = new Set(config.projects.map((p) => path.resolve(p)))

  for (const p of newProjects) {
    const resolvedP = path.resolve(p)
    if (!existingProjects.has(resolvedP)) {
      // Add the resolved path to avoid duplicates
      config.projects.push(resolvedP)
      existingProjects.add(resolvedP)
      addedCount++
    }
  }

  if (addedCount > 0) {
    await saveConfig(config)
    revalidatePath('/')
  }
  return addedCount
}

// Agent Actions
export async function actionUpdateAgentConfig(agent: AgentConfig) {
  await updateAgentConfig(agent)
  revalidatePath('/')
}

export async function actionRemoveAgentConfig(agentName: string) {
  await removeAgentConfig(agentName)
  revalidatePath('/')
}

export async function actionGetSkillContent(path: string) {
  const { getSkillContent } = await import('@/lib/skills-server')
  return await getSkillContent(path)
}

export async function actionImportSkill(url: string) {
  if (!url) {
    throw new Error('Missing URL for import.')
  }

  let repoUrl = ''
  let subdir = ''
  let skillName = ''
  let branch: string | undefined

  if (url.includes('tree/')) {
    const parts = url.split('tree/')
    // parts[0] is https://github.com/owner/repo/
    // parts[1] is branch/subdir/path
    const base = parts[0]
    const rest = parts[1]
    const slashIndex = rest.indexOf('/')

    if (slashIndex === -1) {
      // branch only? e.g. tree/master
      repoUrl = base.replace(/\/$/, '') // Remove trailing slash
      repoUrl = base.replace(/\/$/, '') + '.git'
      branch = rest
    } else {
      repoUrl = base.replace(/\/$/, '') + '.git'
      // Extract branch: everything before the first slash
      branch = rest.substring(0, slashIndex)

      // Remove branch from rest to get subdir
      subdir = rest.substring(slashIndex + 1)
    }
  } else {
    // Assume root repo and let git resolve default branch
    repoUrl = url.endsWith('.git') ? url : url + '.git'
  }

  // Determine destination
  skillName = subdir ? path.basename(subdir) : path.basename(repoUrl, '.git')
  const config = await getConfig()
  const destPath = path.join(config.hubPath, skillName)

  if (await fs.pathExists(destPath)) {
    throw new Error(`Skill '${skillName}' already exists at ${destPath}`)
  }

  try {
    await downloadRemoteSkill(repoUrl, subdir, destPath, branch)
    revalidatePath('/')
    return { success: true, message: `Successfully imported ${skillName}!` }
  } catch (error) {
    console.error('Import failed:', error)
    throw new Error(
      `Failed to import skill: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function actionCreateSkill(values: {
  name: string
  description: string
  content: string
}) {
  const { name, description, content } = values
  if (!name || !content) {
    throw new Error('Name and Content are required.')
  }

  const config = await getConfig()
  const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  const skillPath = path.join(config.hubPath, safeName)

  if (await fs.pathExists(skillPath)) {
    throw new Error(`Skill '${safeName}' already exists.`)
  }

  try {
    await fs.ensureDir(skillPath)

    // Assemble SKILL.md content
    // If content already has frontmatter, might need to be careful.
    // For simplicity, we assume content is just the body or user handles frontmatter.
    // BUT plan says we generate frontmatter.

    let fileContent = content
    if (!content.startsWith('---')) {
      fileContent = `---
name: ${name}
description: ${description || ''}
---

${content}
`
    }

    await fs.writeFile(path.join(skillPath, 'SKILL.md'), fileContent)
    revalidatePath('/')
    return { success: true, message: `Successfully created skill: ${safeName}` }
  } catch (error) {
    console.error('Create skill failed:', error)
    throw new Error(
      `Failed to create skill: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
