import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import matter from 'gray-matter'
import simpleGit from 'simple-git'
import {
  addKitLoadout,
  listKitLoadouts,
  updateKitLoadout,
} from '../core/kit-core.mjs'

const CONFIG_PATH = path.join(os.homedir(), '.skills-hub', 'config.json')
const SKIP_SCAN_DIRS = new Set(['.git', 'node_modules'])

function normalizeRepoWebUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/i, '')
}

function normalizeRelativePath(input) {
  const normalized = String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  return normalized
}

function normalizeRootSubdir(input) {
  const normalized = normalizeRelativePath(input)
  return normalized || '/'
}

function buildImportSourceKey(repoWebUrl, rootSubdir) {
  return `${normalizeRepoWebUrl(repoWebUrl).toLowerCase()}::${normalizeRelativePath(rootSubdir).toLowerCase()}`
}

function getPathBasename(inputPath) {
  const normalized = normalizeRelativePath(inputPath)
  if (!normalized) return ''
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function joinRelativePath(...parts) {
  const normalized = parts
    .map((part) => normalizeRelativePath(part))
    .filter(Boolean)
  return normalized.join('/')
}

function toOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

async function readRuntimeConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    if (!raw.trim()) {
      return { hubPath: path.join(os.homedir(), 'skills-hub') }
    }

    const parsed = JSON.parse(raw)
    return {
      hubPath: String(parsed?.hubPath || path.join(os.homedir(), 'skills-hub')),
    }
  } catch {
    return { hubPath: path.join(os.homedir(), 'skills-hub') }
  }
}

function parseLoadoutImportUrl(url) {
  const originalUrl = String(url || '').trim()
  if (!originalUrl) {
    throw new Error('kit loadout-import requires --url')
  }

  if (originalUrl.includes('github.com/') && originalUrl.includes('/tree/')) {
    const parsedUrl = new URL(originalUrl)
    const segments = parsedUrl.pathname.split('/').filter(Boolean)
    if (segments.length < 4 || segments[2] !== 'tree') {
      throw new Error('Invalid GitHub tree URL.')
    }

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    const branch = segments[3]
    const subdir = segments.slice(4).join('/')

    return {
      originalUrl,
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      repoWebUrl: `https://github.com/${owner}/${repo}`,
      repoName: repo,
      branch: branch || undefined,
      explicitSubdir: normalizeRelativePath(subdir),
      isGithub: true,
    }
  }

  if (originalUrl.includes('github.com/')) {
    const parsedUrl = new URL(originalUrl)
    const segments = parsedUrl.pathname.split('/').filter(Boolean)
    if (segments.length < 2) {
      throw new Error('Invalid GitHub repository URL.')
    }

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/i, '')
    return {
      originalUrl,
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      repoWebUrl: `https://github.com/${owner}/${repo}`,
      repoName: repo,
      branch: undefined,
      explicitSubdir: '',
      isGithub: true,
    }
  }

  const repoWebUrl = normalizeRepoWebUrl(originalUrl)
  const repoName = getPathBasename(repoWebUrl) || 'imported-skills'
  return {
    originalUrl,
    repoUrl: originalUrl,
    repoWebUrl,
    repoName,
    branch: undefined,
    explicitSubdir: '',
    isGithub: false,
  }
}

async function cloneRemoteRepository(repoUrl, branch) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-loadout-'))
  const git = simpleGit()

  try {
    const cloneArgs = ['--depth', '1']
    if (branch) {
      cloneArgs.push('--branch', branch)
    }

    await git.clone(repoUrl, tempDir, cloneArgs)
    const localGit = simpleGit(tempDir)
    const resolvedBranch = await localGit
      .revparse(['--abbrev-ref', 'HEAD'])
      .then((value) => String(value || '').trim())
      .catch(() => branch || '')

    return {
      tempDir,
      git: localGit,
      resolvedBranch: resolvedBranch || branch || 'unknown',
    }
  } catch (error) {
    await fs.remove(tempDir)
    throw error
  }
}

async function resolveImportRoot(tempDir, parsedSource) {
  if (parsedSource.explicitSubdir) {
    const explicitRoot = path.join(tempDir, parsedSource.explicitSubdir)
    const explicitExists = await fs.pathExists(explicitRoot)
    if (!explicitExists) {
      throw new Error(`Directory '${parsedSource.explicitSubdir}' not found in remote repository.`)
    }

    return {
      rootPath: explicitRoot,
      rootSubdir: normalizeRootSubdir(parsedSource.explicitSubdir),
    }
  }

  const skillsRoot = path.join(tempDir, 'skills')
  if (await fs.pathExists(skillsRoot)) {
    return {
      rootPath: skillsRoot,
      rootSubdir: 'skills',
    }
  }

  return {
    rootPath: tempDir,
    rootSubdir: '/',
  }
}

async function collectInstallableSkills(basePath, currentPath, output) {
  const skillMdPath = path.join(currentPath, 'SKILL.md')
  if (await fs.pathExists(skillMdPath)) {
    const relativePath = normalizeRelativePath(path.relative(basePath, currentPath)) || '.'
    output.push({
      name: getPathBasename(currentPath),
      relativePath,
      fullPath: currentPath,
    })
    return
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (SKIP_SCAN_DIRS.has(entry.name)) continue
    await collectInstallableSkills(basePath, path.join(currentPath, entry.name), output)
  }
}

function assertUniqueSkillNames(entries) {
  const collisions = new Map()

  for (const entry of entries) {
    const key = entry.name
    const list = collisions.get(key) || []
    list.push(entry.relativePath)
    collisions.set(key, list)
  }

  const conflictingEntries = []
  for (const [name, paths] of collisions.entries()) {
    if (paths.length < 2) continue
    conflictingEntries.push(`${name}: ${paths.join(', ')}`)
  }

  if (conflictingEntries.length > 0) {
    throw new Error(
      `Duplicate skill directory names found in remote source: ${conflictingEntries.join('; ')}`
    )
  }
}

function selectInstallableSkills(entries, skillNames, sourceLabel) {
  const normalizedNames = Array.from(
    new Set(
      (Array.isArray(skillNames) ? skillNames : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
  if (normalizedNames.length === 0) {
    return entries
  }

  const entryByName = new Map(entries.map((entry) => [entry.name, entry]))
  const missing = normalizedNames.filter((name) => !entryByName.has(name))
  if (missing.length > 0) {
    const available = entries.map((entry) => entry.name).sort().join(', ')
    throw new Error(
      `Remote source '${sourceLabel}' is missing expected skills: ${missing.join(', ')}. Available skills: ${available}`
    )
  }

  return normalizedNames
    .map((name) => entryByName.get(name))
    .filter(Boolean)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function buildDefaultLoadoutName(parsedSource, rootSubdir) {
  if (parsedSource.explicitSubdir) {
    const baseName = getPathBasename(parsedSource.explicitSubdir)
    if (baseName && baseName.toLowerCase() !== 'skills') {
      return baseName
    }
  }

  if (normalizeRelativePath(rootSubdir).toLowerCase() === 'skills') {
    return parsedSource.repoName
  }

  return parsedSource.repoName
}

function buildGithubTreeUrl(repoWebUrl, branch, subdir) {
  const normalizedRepoWebUrl = normalizeRepoWebUrl(repoWebUrl)
  if (!branch || !normalizedRepoWebUrl.startsWith('http')) {
    return normalizedRepoWebUrl
  }

  const normalizedSubdir = normalizeRelativePath(subdir)
  if (!normalizedSubdir) {
    return `${normalizedRepoWebUrl}/tree/${branch}`
  }

  return `${normalizedRepoWebUrl}/tree/${branch}/${normalizedSubdir}`
}

async function readLastUpdatedAt(git, subdir) {
  const args = ['log', '-1', '--format=%cI']
  const normalizedSubdir = normalizeRelativePath(subdir)
  if (normalizedSubdir) {
    args.push('--', normalizedSubdir)
  }

  try {
    const raw = await git.raw(args)
    return String(raw || '').trim() || new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

async function readSkillLoadoutKey(skillDirPath) {
  const skillMdPath = path.join(skillDirPath, 'SKILL.md')
  if (!(await fs.pathExists(skillMdPath))) {
    return undefined
  }

  try {
    const raw = await fs.readFile(skillMdPath, 'utf-8')
    const parsed = matter(raw)
    return toOptionalText(parsed.data?.source_loadout_key)
  } catch {
    return undefined
  }
}

async function writeSkillImportMetadata(skillDirPath, metadata) {
  const skillMdPath = path.join(skillDirPath, 'SKILL.md')
  if (!(await fs.pathExists(skillMdPath))) {
    return
  }

  const raw = await fs.readFile(skillMdPath, 'utf-8')
  const parsed = matter(raw)
  const restFrontmatter = { ...(parsed.data || {}) }
  delete restFrontmatter.source_branch

  const nextFrontmatter = {
    ...restFrontmatter,
    source_repo: metadata.sourceRepo,
    source_url: metadata.sourceUrl,
    source_subdir: metadata.sourceSubdir,
    source_last_updated: metadata.sourceLastUpdated,
    imported_at: metadata.importedAt,
    source_loadout_key: metadata.sourceLoadoutKey,
  }

  const nextRaw = matter.stringify(parsed.content, nextFrontmatter)
  await fs.writeFile(skillMdPath, nextRaw, 'utf-8')
}

function sameImportSource(left, right) {
  if (!left || !right) return false
  return (
    buildImportSourceKey(left.repoWebUrl, left.rootSubdir) ===
    buildImportSourceKey(right.repoWebUrl, right.rootSubdir)
  )
}

async function assessImportedSkillsSafety(entries) {
  const flaggedExtensions = new Set([
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.bat',
    '.cmd',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.jar',
    '.app',
  ])
  const warnings = []
  const flaggedFiles = []
  let scannedFiles = 0
  let hasExecutableLikeFile = false
  let hasLargeFile = false

  for (const entry of entries) {
    const stack = [entry.fullPath]
    while (stack.length > 0) {
      const currentPath = stack.pop()
      const stats = await fs.stat(currentPath)
      if (stats.isDirectory()) {
        const children = await fs.readdir(currentPath)
        for (const child of children) {
          stack.push(path.join(currentPath, child))
        }
        continue
      }

      scannedFiles += 1
      const ext = path.extname(currentPath).toLowerCase()
      if (flaggedExtensions.has(ext)) {
        flaggedFiles.push(currentPath)
        hasExecutableLikeFile = true
      }
      if (stats.size > 1024 * 1024) {
        flaggedFiles.push(currentPath)
        hasLargeFile = true
      }
    }
  }

  if (hasExecutableLikeFile) {
    warnings.push('Imported skills contain shell/binary style executable files that should be reviewed.')
  }
  if (hasLargeFile) {
    warnings.push('Imported skills contain files larger than 1MB that should be reviewed.')
  }

  return {
    checkedAt: Date.now(),
    status: warnings.length > 0 ? 'warn' : 'pass',
    scannedFiles,
    warnings,
    flaggedFiles: flaggedFiles.map((filePath) => String(filePath)),
  }
}

async function importKitLoadoutFromRepo(input) {
  const parsedSource = parseLoadoutImportUrl(input?.url)
  const config = await readRuntimeConfig()
  const hubPath = path.resolve(config.hubPath)
  const explicitName = toOptionalText(input?.name)
  const explicitDescription = input?.description === undefined ? undefined : toOptionalText(input.description)
  const overwrite = input?.overwrite === true
  const skillNames = Array.isArray(input?.skillNames) ? input.skillNames : []

  const cloned = await cloneRemoteRepository(parsedSource.repoUrl, parsedSource.branch)

  try {
    const { rootPath, rootSubdir } = await resolveImportRoot(cloned.tempDir, parsedSource)
    const entries = []
    await collectInstallableSkills(rootPath, rootPath, entries)
    entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))

    if (entries.length === 0) {
      throw new Error('No installable skills found in remote source.')
    }

    assertUniqueSkillNames(entries)
    const selectedEntries = selectInstallableSkills(entries, skillNames, parsedSource.repoWebUrl)

    const sourceLastUpdatedAt = await readLastUpdatedAt(
      cloned.git,
      rootSubdir === '/' ? '' : rootSubdir
    )
    const importSourceKey = buildImportSourceKey(parsedSource.repoWebUrl, rootSubdir)
    const existingLoadout = listKitLoadouts().find((loadout) =>
      sameImportSource(loadout.importSource, {
        repoWebUrl: parsedSource.repoWebUrl,
        rootSubdir,
      })
    )

    const derivedName = buildDefaultLoadoutName(parsedSource, rootSubdir)
    const loadoutName = explicitName || existingLoadout?.name || derivedName

    if (!existingLoadout && !explicitName) {
      const conflictingName = listKitLoadouts().find(
        (loadout) => !loadout.importSource && loadout.name === loadoutName
      )
      if (conflictingName) {
        throw new Error(
          `Skills package name '${loadoutName}' is already used by a local package. Use --name to choose a different package name.`
        )
      }
    }

    await fs.ensureDir(hubPath)

    const conflicts = []
    let overwrittenCount = 0
    for (const entry of selectedEntries) {
      const destinationPath = path.join(hubPath, entry.name)
      if (!(await fs.pathExists(destinationPath))) {
        continue
      }

      overwrittenCount += 1
      const existingKey = await readSkillLoadoutKey(destinationPath)
      if (existingKey && existingKey === importSourceKey) {
        continue
      }

      conflicts.push(destinationPath)
    }

    if (conflicts.length > 0 && !overwrite) {
      throw new Error(
        `Hub skill destinations already exist: ${conflicts.join(', ')}. Re-run with --yes to overwrite them.`
      )
    }

    const importedAt = new Date().toISOString()
    const lastSafetyCheck = await assessImportedSkillsSafety(selectedEntries)
    const importSource = {
      repoWebUrl: parsedSource.repoWebUrl,
      repoUrl: parsedSource.repoUrl,
      originalUrl: parsedSource.originalUrl,
      branch: cloned.resolvedBranch || parsedSource.branch,
      rootSubdir,
      importedAt,
      lastSourceUpdatedAt: sourceLastUpdatedAt,
      lastSafetyCheck,
    }

    const importedSkillPaths = []
    const items = []
    for (const [index, entry] of selectedEntries.entries()) {
      const destinationPath = path.join(hubPath, entry.name)
      const sourceSubdir = joinRelativePath(rootSubdir, entry.relativePath === '.' ? '' : entry.relativePath)
      const sourceUrl = parsedSource.isGithub
        ? buildGithubTreeUrl(
            parsedSource.repoWebUrl,
            importSource.branch,
            sourceSubdir
          )
        : parsedSource.originalUrl
      const sourceLastUpdated = await readLastUpdatedAt(
        cloned.git,
        sourceSubdir
      )

      await fs.remove(destinationPath)
      await fs.copy(entry.fullPath, destinationPath, { overwrite: true })
      await writeSkillImportMetadata(destinationPath, {
        sourceRepo: parsedSource.repoWebUrl,
        sourceUrl,
        sourceSubdir: sourceSubdir || '/',
        sourceLastUpdated,
        importedAt,
        sourceLoadoutKey: importSourceKey,
      })

      importedSkillPaths.push(destinationPath)
      items.push({
        skillPath: destinationPath,
        mode: 'copy',
        sortOrder: index,
      })
    }

    let removedCount = 0
    if (existingLoadout) {
      const nextPaths = new Set(importedSkillPaths)
      for (const item of existingLoadout.items) {
        if (nextPaths.has(item.skillPath)) {
          continue
        }

        const existingKey = await readSkillLoadoutKey(item.skillPath)
        if (existingKey !== importSourceKey) {
          continue
        }

        await fs.remove(item.skillPath)
        removedCount += 1
      }
    }

    const loadout = existingLoadout
      ? updateKitLoadout({
          id: existingLoadout.id,
          name: explicitName || existingLoadout.name,
          description:
            explicitDescription === undefined
              ? existingLoadout.description
              : explicitDescription,
          items,
          importSource,
        })
      : addKitLoadout({
          name: loadoutName,
          description: explicitDescription,
          items,
          importSource,
        })

    return {
      loadout,
      loadoutStatus: existingLoadout ? 'updated' : 'created',
      importedSkillPaths,
      overwrittenCount,
      removedCount,
      discoveredCount: selectedEntries.length,
      source: importSource,
    }
  } finally {
    await fs.remove(cloned.tempDir)
  }
}

export {
  buildDefaultLoadoutName,
  buildImportSourceKey,
  importKitLoadoutFromRepo,
  parseLoadoutImportUrl,
  resolveImportRoot,
}
