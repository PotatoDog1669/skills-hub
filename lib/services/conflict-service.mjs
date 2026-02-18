import fs from 'fs-extra'
import matter from 'gray-matter'
import os from 'os'
import path from 'path'

const MAX_SCAN_DEPTH = 3
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'build', 'target', '__pycache__'])
const CONFLICT_TYPE_DUPLICATE_PLUGIN_ID = 'duplicate_plugin_id'
const CONFLICT_TYPE_DUPLICATE_SKILL_NAME = 'duplicate_skill_name'
const SOURCE_ORDER = {
  hub: 0,
  agent: 1,
  project: 2,
}

function asTrimmedString(input) {
  const value = String(input ?? '').trim()
  return value
}

function normalizePath(inputPath) {
  const trimmed = asTrimmedString(inputPath)
  if (!trimmed) return ''
  if (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.resolve(path.join(os.homedir(), trimmed.slice(1)))
  }
  return path.resolve(trimmed)
}

function normalizeKey(input) {
  return asTrimmedString(input).toLowerCase()
}

function shouldSkipSkillScanDir(name) {
  if (!name) return true
  if (name.startsWith('.')) return true
  return SKIP_DIR_NAMES.has(name)
}

function readFrontmatterString(values, keys) {
  for (const key of keys) {
    if (!values || typeof values !== 'object' || !(key in values)) {
      continue
    }
    const value = asTrimmedString(values[key])
    if (value) return value
  }
  return ''
}

function extractPluginId(frontmatter) {
  return readFrontmatterString(frontmatter, [
    'plugin_id',
    'pluginId',
    'plugin-id',
    'plugin',
    'id',
  ])
}

async function readSkillMetadata(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md')
  try {
    const raw = await fs.readFile(skillMdPath, 'utf-8')
    const parsed = matter(raw)
    return {
      pluginId: extractPluginId(parsed.data),
    }
  } catch {
    return {
      pluginId: '',
    }
  }
}

async function scanDirForSkillDirs(basePath, depth, output) {
  if (depth > MAX_SCAN_DEPTH || !basePath) return
  if (!await fs.pathExists(basePath)) return

  let entries
  try {
    entries = await fs.readdir(basePath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!(entry.isDirectory() || entry.isSymbolicLink())) {
      continue
    }

    if (shouldSkipSkillScanDir(entry.name)) {
      continue
    }

    const entryPath = path.join(basePath, entry.name)
    if (await fs.pathExists(path.join(entryPath, 'SKILL.md'))) {
      output.push(entryPath)
      continue
    }

    await scanDirForSkillDirs(entryPath, depth + 1, output)
  }
}

function buildSourceLabel(input) {
  if (input.sourceType === 'hub') {
    return 'hub'
  }
  if (input.sourceType === 'agent') {
    return `agent:${input.agentName || 'unknown'}`
  }
  const projectName = input.projectName || 'unknown'
  const agentName = input.agentName ? `@${input.agentName}` : ''
  return `project:${projectName}${agentName}`
}

async function collectSkillItemsFromRoot(rootPath, sourceInfo, seenPaths) {
  const normalizedRoot = normalizePath(rootPath)
  if (!normalizedRoot) return []

  const skillDirs = []
  await scanDirForSkillDirs(normalizedRoot, 0, skillDirs)

  const items = []
  for (const skillDir of skillDirs) {
    const normalizedSkillPath = normalizePath(skillDir)
    if (!normalizedSkillPath || seenPaths.has(normalizedSkillPath)) {
      continue
    }

    const metadata = await readSkillMetadata(normalizedSkillPath)
    const skillName = path.basename(normalizedSkillPath)
    const item = {
      path: normalizedSkillPath,
      skillName,
      pluginId: metadata.pluginId,
      sourceType: sourceInfo.sourceType,
      sourceLabel: buildSourceLabel(sourceInfo),
      agentName: sourceInfo.agentName || undefined,
      projectPath: sourceInfo.projectPath || undefined,
      projectName: sourceInfo.projectName || undefined,
    }
    items.push(item)
    seenPaths.add(normalizedSkillPath)
  }

  return items
}

function projectSkillParentCandidates(projectPath, agent) {
  const normalizedProjectPath = normalizePath(projectPath)
  if (!normalizedProjectPath) return []

  const relativePaths = [asTrimmedString(agent?.projectPath)].filter(Boolean)
  if (normalizeKey(agent?.name) === 'codex') {
    relativePaths.push('.agents/skills')
  }

  const dedupedRelativePaths = Array.from(new Set(relativePaths))
  return dedupedRelativePaths.map((relativePath) => path.join(normalizedProjectPath, relativePath))
}

function sortConflictItems(items) {
  return [...items].sort((left, right) => {
    const leftRank = SOURCE_ORDER[left.sourceType] ?? Number.MAX_SAFE_INTEGER
    const rightRank = SOURCE_ORDER[right.sourceType] ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.path.localeCompare(right.path)
  })
}

function createConflict(conflictType, key, items) {
  const sortedItems = sortConflictItems(items)
  if (conflictType === CONFLICT_TYPE_DUPLICATE_PLUGIN_ID) {
    return {
      type: conflictType,
      key,
      items: sortedItems,
      resolution:
        'Keep one canonical plugin id. Rename one plugin id in SKILL.md, or disable/remove duplicate sources.',
    }
  }

  return {
    type: conflictType,
    key,
    items: sortedItems,
    resolution:
      'Keep one canonical skill directory name. Rename one skill directory, or disable/remove duplicate sources.',
  }
}

export async function discoverSkillsForConflictCheck(config) {
  const safeConfig = config && typeof config === 'object' ? config : {}
  const projects = Array.isArray(safeConfig.projects) ? safeConfig.projects : []
  const agents = Array.isArray(safeConfig.agents) ? safeConfig.agents : []
  const activeAgents = agents.filter((agent) => Boolean(agent?.enabled))

  const seenPaths = new Set()
  const results = []

  results.push(
    ...(await collectSkillItemsFromRoot(
      safeConfig.hubPath,
      {
        sourceType: 'hub',
      },
      seenPaths
    ))
  )

  for (const agent of activeAgents) {
    results.push(
      ...(await collectSkillItemsFromRoot(
        agent?.globalPath,
        {
          sourceType: 'agent',
          agentName: asTrimmedString(agent?.name),
        },
        seenPaths
      ))
    )
  }

  for (const projectPath of projects) {
    const normalizedProjectPath = normalizePath(projectPath)
    if (!normalizedProjectPath) continue
    const projectName = path.basename(normalizedProjectPath)

    for (const agent of activeAgents) {
      for (const candidatePath of projectSkillParentCandidates(normalizedProjectPath, agent)) {
        results.push(
          ...(await collectSkillItemsFromRoot(
            candidatePath,
            {
              sourceType: 'project',
              agentName: asTrimmedString(agent?.name),
              projectPath: normalizedProjectPath,
              projectName,
            },
            seenPaths
          ))
        )
      }
    }
  }

  return results.sort((left, right) => left.path.localeCompare(right.path))
}

export function detectSkillConflicts(skillItems) {
  const items = Array.isArray(skillItems) ? skillItems : []
  const conflicts = []
  const pluginIdGroups = new Map()
  const skillNameGroups = new Map()

  for (const item of items) {
    if (!item || typeof item !== 'object') continue

    const normalizedPluginId = normalizeKey(item.pluginId)
    if (normalizedPluginId) {
      if (!pluginIdGroups.has(normalizedPluginId)) {
        pluginIdGroups.set(normalizedPluginId, [])
      }
      pluginIdGroups.get(normalizedPluginId).push(item)
    }

    const normalizedSkillName = normalizeKey(item.skillName)
    if (normalizedSkillName) {
      if (!skillNameGroups.has(normalizedSkillName)) {
        skillNameGroups.set(normalizedSkillName, [])
      }
      skillNameGroups.get(normalizedSkillName).push(item)
    }
  }

  for (const groupItems of pluginIdGroups.values()) {
    if (groupItems.length < 2) continue
    const key = groupItems.find((entry) => asTrimmedString(entry.pluginId))?.pluginId || ''
    conflicts.push(createConflict(CONFLICT_TYPE_DUPLICATE_PLUGIN_ID, key, groupItems))
  }

  for (const groupItems of skillNameGroups.values()) {
    if (groupItems.length < 2) continue
    const sourceTypes = new Set(groupItems.map((entry) => entry.sourceType))
    if (sourceTypes.size < 2) continue
    const key = groupItems.find((entry) => asTrimmedString(entry.skillName))?.skillName || ''
    conflicts.push(createConflict(CONFLICT_TYPE_DUPLICATE_SKILL_NAME, key, groupItems))
  }

  return conflicts.sort((left, right) => {
    const leftType = `${left.type}:${normalizeKey(left.key)}`
    const rightType = `${right.type}:${normalizeKey(right.key)}`
    return leftType.localeCompare(rightType)
  })
}

export async function collectSkillConflicts(config) {
  const items = await discoverSkillsForConflictCheck(config)
  const conflicts = detectSkillConflicts(items)
  return {
    scannedAt: new Date().toISOString(),
    itemCount: items.length,
    conflictCount: conflicts.length,
    conflicts,
  }
}
