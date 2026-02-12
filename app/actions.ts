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
import { isInsideGitWorkTree } from '@/lib/git'
import { pickDirectory } from '@/lib/path-picker'
import type { PickDirectoryOptions } from '@/lib/path-picker'
import {
  parseSkillImportUrl,
  buildGitSourceUrl,
  attachSkillImportMetadata,
} from '@/lib/import-skill'
import {
  APP_TYPES,
  addProvider,
  addUniversalProvider,
  applyUniversalProvider,
  captureProviderFromLive,
  deleteProvider,
  deleteUniversalProvider,
  getCurrentProvider,
  getProviderById,
  getLatestBackup,
  getUniversalProviderById,
  listProviders,
  listUniversalProviders,
  maskProvider,
  maskProviders,
  restoreBackup,
  switchProvider,
  updateUniversalProvider,
  updateProvider,
} from '@/lib/core/provider-core.mjs'
import type {
  AppType,
  UniversalProviderApps,
  UniversalProviderModels,
  UniversalProviderRecord,
} from '@/lib/core/provider-types'

function assertAppType(appType: string): asserts appType is AppType {
  if (!APP_TYPES.includes(appType as AppType)) {
    throw new Error(`Unsupported app type: ${appType}`)
  }
}

function normalizeProviderConfig(config: unknown): Record<string, unknown> {
  if (typeof config === 'string') {
    const parsed = JSON.parse(config)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Provider config must be a JSON object.')
    }
    return parsed as Record<string, unknown>
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Provider config must be an object.')
  }

  return config as Record<string, unknown>
}

export async function actionProviderList(appType?: string) {
  if (appType) assertAppType(appType)
  const providers = listProviders(appType as AppType | undefined)
  return maskProviders(providers)
}

export async function actionProviderCurrent(appType: string) {
  assertAppType(appType)
  return maskProvider(getCurrentProvider(appType))
}

export async function actionProviderGetRaw(id: string) {
  const provider = getProviderById(id)
  if (!provider) {
    throw new Error(`Provider not found: ${id}`)
  }
  return provider
}

export async function actionProviderAdd(values: {
  appType: string
  name: string
  config: unknown
}) {
  assertAppType(values.appType)
  const provider = addProvider({
    appType: values.appType,
    name: values.name,
    config: normalizeProviderConfig(values.config),
  })
  revalidatePath('/')
  return maskProvider(provider)
}

export async function actionProviderUpdate(values: {
  id: string
  name?: string
  config?: unknown
}) {
  const provider = updateProvider({
    id: values.id,
    name: values.name,
    config: values.config === undefined ? undefined : normalizeProviderConfig(values.config),
  })
  revalidatePath('/')
  return maskProvider(provider)
}

export async function actionProviderDelete(id: string) {
  const deleted = deleteProvider(id)
  revalidatePath('/')
  return deleted
}

export async function actionProviderSwitch(values: { appType: string; providerId: string }) {
  assertAppType(values.appType)
  const result = await switchProvider({
    appType: values.appType,
    providerId: values.providerId,
  })
  revalidatePath('/')
  return result
}

export async function actionProviderLatestBackup(appType: string) {
  assertAppType(appType)
  return getLatestBackup(appType)
}

export async function actionProviderRestoreLatestBackup(appType: string) {
  assertAppType(appType)
  const result = await restoreBackup(appType)
  revalidatePath('/')
  return result
}

export async function actionProviderCaptureLive(values: {
  appType: string
  name: string
  profile?: Record<string, unknown>
}) {
  assertAppType(values.appType)
  const provider = await captureProviderFromLive({
    appType: values.appType,
    name: values.name,
    profile: values.profile,
  })
  revalidatePath('/')
  return maskProvider(provider)
}

function maskUniversalProvider(provider: UniversalProviderRecord): UniversalProviderRecord {
  return {
    ...provider,
    apiKey: provider.apiKey.trim() ? `${provider.apiKey.slice(0, 3)}****` : '',
  }
}

export async function actionUniversalProviderList() {
  const providers = listUniversalProviders() as UniversalProviderRecord[]
  return providers.map(maskUniversalProvider)
}

export async function actionUniversalProviderGetRaw(id: string) {
  const provider = getUniversalProviderById(id)
  if (!provider) {
    throw new Error(`Universal provider not found: ${id}`)
  }
  return provider
}

export async function actionUniversalProviderAdd(values: {
  name: string
  baseUrl: string
  apiKey: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}) {
  const provider = addUniversalProvider(values) as UniversalProviderRecord | null
  if (!provider) {
    throw new Error('Failed to create universal provider')
  }
  revalidatePath('/')
  return maskUniversalProvider(provider)
}

export async function actionUniversalProviderUpdate(values: {
  id: string
  name?: string
  baseUrl?: string
  apiKey?: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}) {
  const provider = updateUniversalProvider(values) as UniversalProviderRecord | null
  if (!provider) {
    throw new Error('Failed to update universal provider')
  }
  revalidatePath('/')
  return maskUniversalProvider(provider)
}

export async function actionUniversalProviderDelete(id: string) {
  const deleted = deleteUniversalProvider(id)
  revalidatePath('/')
  return deleted
}

export async function actionUniversalProviderApply(id: string) {
  const applied = applyUniversalProvider({ id })
  revalidatePath('/')
  return maskProviders(applied)
}

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
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    throw new Error('Project path is required.')
  }

  const isGitProject = await isInsideGitWorkTree(normalizedPath)
  if (!isGitProject) {
    throw new Error('Only git repositories can be added as projects.')
  }

  await addProjectPath(normalizedPath)
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
  const scannedProjects = await scanForProjects(config.scanRoots)
  const existingProjects = new Set(config.projects.map((p) => path.resolve(p)))
  return scannedProjects.filter((p) => !existingProjects.has(path.resolve(p))).length
}

export async function actionScanProjects() {
  const config = await getConfig()
  const scannedProjects = await scanForProjects(config.scanRoots)
  const existingProjects = new Set(config.projects.map((p) => path.resolve(p)))

  return scannedProjects
    .map((p) => path.resolve(p))
    .filter((p) => !existingProjects.has(p))
    .sort((a, b) => a.localeCompare(b))
}

export async function actionAddScannedProjects(projectPaths: string[]) {
  if (!Array.isArray(projectPaths) || projectPaths.length === 0) {
    return 0
  }

  const config = await getConfig()
  const existingProjects = new Set(config.projects.map((p) => path.resolve(p)))
  let addedCount = 0

  for (const projectPath of projectPaths) {
    const normalizedPath = projectPath.trim()
    if (!normalizedPath) continue

    const resolvedPath = path.resolve(normalizedPath)
    const isGitProject = await isInsideGitWorkTree(resolvedPath)
    if (!isGitProject || existingProjects.has(resolvedPath)) {
      continue
    }

    config.projects.push(resolvedPath)
    existingProjects.add(resolvedPath)
    addedCount++
  }

  if (addedCount > 0) {
    await saveConfig(config)
    revalidatePath('/')
  }

  return addedCount
}

export async function actionPickDirectory(options?: PickDirectoryOptions) {
  return pickDirectory(options)
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

  const { repoUrl, repoWebUrl, subdir, skillName, branch } = parseSkillImportUrl(url)

  // Determine destination
  const config = await getConfig()
  const destPath = path.join(config.hubPath, skillName)

  if (await fs.pathExists(destPath)) {
    throw new Error(`Skill '${skillName}' already exists at ${destPath}`)
  }

  try {
    const downloadResult = await downloadRemoteSkill(repoUrl, subdir, destPath, branch)
    const sourceUrl = buildGitSourceUrl(repoWebUrl, downloadResult.resolvedBranch, subdir)
    await attachSkillImportMetadata(destPath, {
      sourceRepo: repoWebUrl,
      sourceUrl,
      sourceBranch: downloadResult.resolvedBranch,
      sourceSubdir: subdir,
      sourceLastUpdated: downloadResult.lastUpdatedAt,
      importedAt: new Date().toISOString(),
    })

    revalidatePath('/')
    return {
      success: true,
      message: `Successfully imported ${skillName} from ${repoWebUrl} (last updated: ${downloadResult.lastUpdatedAt}).`,
    }
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
