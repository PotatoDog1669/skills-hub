import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const CACHE_VERSION = 1
const MAX_DEPTH = 5
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next'])

function getProjectScanCachePath() {
  return path.join(os.homedir(), '.skills-hub', 'cache', 'project-scan.json')
}

function createEmptyCache() {
  return {
    version: CACHE_VERSION,
    roots: {},
  }
}

function isRecord(input) {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input)
}

function normalizeRepoPaths(inputRepos) {
  if (!Array.isArray(inputRepos)) return []

  const normalized = inputRepos
    .map((repoPath) => (typeof repoPath === 'string' ? repoPath.trim() : ''))
    .filter(Boolean)
    .map((repoPath) => path.resolve(repoPath))

  return Array.from(new Set(normalized))
}

function normalizeDirectoryEntry(rawEntry) {
  if (!isRecord(rawEntry)) return null
  const mtimeMs = Number(rawEntry.mtimeMs)
  if (!Number.isFinite(mtimeMs) || mtimeMs < 0) return null

  return {
    mtimeMs,
    repos: normalizeRepoPaths(rawEntry.repos),
  }
}

function normalizeDirectories(rawDirectories) {
  if (!isRecord(rawDirectories)) return {}

  const result = {}
  for (const [directoryPath, rawEntry] of Object.entries(rawDirectories)) {
    const normalizedPath = path.resolve(directoryPath)
    const normalizedEntry = normalizeDirectoryEntry(rawEntry)
    if (!normalizedEntry) continue
    result[normalizedPath] = normalizedEntry
  }

  return result
}

function normalizeRootEntry(rawRootEntry) {
  if (!isRecord(rawRootEntry)) return null
  const updatedAt =
    typeof rawRootEntry.updatedAt === 'string' && rawRootEntry.updatedAt.trim()
      ? rawRootEntry.updatedAt
      : new Date(0).toISOString()

  return {
    updatedAt,
    directories: normalizeDirectories(rawRootEntry.directories),
  }
}

function normalizeCache(rawCache) {
  if (!isRecord(rawCache) || rawCache.version !== CACHE_VERSION || !isRecord(rawCache.roots)) {
    return createEmptyCache()
  }

  const roots = {}
  for (const [rootPath, rawRootEntry] of Object.entries(rawCache.roots)) {
    const normalizedRoot = path.resolve(rootPath)
    const normalizedEntry = normalizeRootEntry(rawRootEntry)
    if (!normalizedEntry) continue
    roots[normalizedRoot] = normalizedEntry
  }

  return {
    version: CACHE_VERSION,
    roots,
  }
}

async function loadProjectScanCache(cacheFilePath) {
  try {
    const rawCache = await fs.readJson(cacheFilePath)
    return normalizeCache(rawCache)
  } catch {
    return createEmptyCache()
  }
}

async function saveProjectScanCache(cacheFilePath, cacheFile) {
  await fs.ensureDir(path.dirname(cacheFilePath))
  await fs.writeJson(cacheFilePath, cacheFile, { spaces: 2 })
}

function cloneDirectoryEntry(entry) {
  return {
    mtimeMs: entry.mtimeMs,
    repos: [...entry.repos],
  }
}

function copyCachedSubtree(directoryPath, previousDirectories, nextDirectories) {
  const prefix = `${directoryPath}${path.sep}`

  for (const [cachedPath, cachedEntry] of Object.entries(previousDirectories)) {
    if (cachedPath === directoryPath || cachedPath.startsWith(prefix)) {
      nextDirectories[cachedPath] = cloneDirectoryEntry(cachedEntry)
    }
  }
}

function normalizeRoots(roots) {
  if (!Array.isArray(roots)) return []

  const normalized = roots
    .map((rootPath) => (typeof rootPath === 'string' ? rootPath.trim() : ''))
    .filter(Boolean)
    .map((rootPath) => path.resolve(rootPath))

  return Array.from(new Set(normalized))
}

function shouldSkipEntry(entryName) {
  return entryName.startsWith('.') || IGNORED_DIRS.has(entryName)
}

async function isProject(directoryPath) {
  const resolvedPath = path.resolve(directoryPath)
  if (resolvedPath === path.resolve(os.homedir())) {
    return false
  }

  const gitPath = path.join(resolvedPath, '.git')
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

async function walkDirectory(directoryPath, currentDepth, state) {
  if (currentDepth > MAX_DEPTH) {
    return []
  }

  const resolvedDirectory = path.resolve(directoryPath)

  let directoryStats
  try {
    directoryStats = await fs.stat(resolvedDirectory)
  } catch {
    return []
  }

  if (!directoryStats.isDirectory()) {
    return []
  }

  const cachedEntry = state.force ? undefined : state.previousDirectories[resolvedDirectory]
  if (cachedEntry && cachedEntry.mtimeMs === directoryStats.mtimeMs) {
    copyCachedSubtree(resolvedDirectory, state.previousDirectories, state.nextDirectories)
    return cachedEntry.repos
  }

  const discoveredRepos = new Set()
  if (await isProject(resolvedDirectory)) {
    discoveredRepos.add(resolvedDirectory)
  }

  let entries = []
  try {
    entries = await fs.readdir(resolvedDirectory, { withFileTypes: true })
  } catch {
    entries = []
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue
    }
    if (shouldSkipEntry(entry.name)) {
      continue
    }

    const childDirectory = path.join(resolvedDirectory, entry.name)
    const childRepos = await walkDirectory(childDirectory, currentDepth + 1, state)
    for (const childRepo of childRepos) {
      discoveredRepos.add(childRepo)
    }
  }

  const repos = Array.from(discoveredRepos)
  state.nextDirectories[resolvedDirectory] = {
    mtimeMs: directoryStats.mtimeMs,
    repos,
  }

  return repos
}

async function scanForProjects(roots, options = {}) {
  const normalizedRoots = normalizeRoots(roots)
  const force = options.force === true
  const cacheFilePath = options.cacheFilePath
    ? path.resolve(String(options.cacheFilePath))
    : getProjectScanCachePath()

  const previousCache = await loadProjectScanCache(cacheFilePath)
  const nextCache = {
    version: CACHE_VERSION,
    roots: { ...previousCache.roots },
  }

  const foundProjects = new Set()
  for (const rootPath of normalizedRoots) {
    const previousRootEntry = previousCache.roots[rootPath]
    const previousDirectories =
      force || !previousRootEntry ? {} : previousRootEntry.directories
    const nextDirectories = {}

    const repos = await walkDirectory(rootPath, 0, {
      force,
      previousDirectories,
      nextDirectories,
    })

    for (const repoPath of repos) {
      foundProjects.add(repoPath)
    }

    nextCache.roots[rootPath] = {
      updatedAt: new Date().toISOString(),
      directories: nextDirectories,
    }
  }

  await saveProjectScanCache(cacheFilePath, nextCache)
  return Array.from(foundProjects).sort()
}

export { getProjectScanCachePath, scanForProjects }
