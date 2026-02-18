import crypto from 'crypto'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const SNAPSHOT_STORE_PATH = path.join(os.homedir(), '.skills-hub', 'snapshots')
const SNAPSHOT_METADATA_FILE = 'metadata.json'
const SNAPSHOT_ENTRIES_DIR = 'entries'
const DEFAULT_SNAPSHOT_RETENTION = 20
const SNAPSHOT_RETENTION_ENV_KEY = 'SKILLS_HUB_SNAPSHOT_RETENTION'
const VALID_SNAPSHOT_OPERATIONS = new Set(['sync', 'kit-apply'])

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function normalizeSnapshotMode(mode) {
  return mode === 'link' ? 'link' : 'copy'
}

function normalizeSnapshotOperation(operation) {
  const normalized = String(operation || '').trim().toLowerCase()
  if (!VALID_SNAPSHOT_OPERATIONS.has(normalized)) {
    throw new Error(`Unsupported snapshot operation: ${operation}`)
  }
  return normalized
}

function normalizeSnapshotTarget(target) {
  const normalized = String(target || '').trim()
  if (!normalized) {
    throw new Error('snapshot target is required')
  }
  return normalized
}

function normalizeAffectedPaths(affectedPaths) {
  if (!Array.isArray(affectedPaths)) {
    throw new Error('affectedPaths must be an array')
  }

  const unique = []
  const seen = new Set()
  for (const candidate of affectedPaths) {
    const normalized = String(candidate || '').trim()
    if (!normalized) continue
    const resolved = path.resolve(normalized)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    unique.push(resolved)
  }

  if (unique.length === 0) {
    throw new Error('affectedPaths must include at least one path')
  }

  return unique
}

function resolveSnapshotRetention(configValue) {
  const envRetention = parsePositiveInteger(process.env[SNAPSHOT_RETENTION_ENV_KEY])
  if (envRetention !== null) {
    return envRetention
  }

  const configRetention = parsePositiveInteger(configValue)
  if (configRetention !== null) {
    return configRetention
  }

  return DEFAULT_SNAPSHOT_RETENTION
}

function createSnapshotId() {
  const prefix = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().split('-')[0]}`
  }
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`
}

function getSnapshotStorePath() {
  return SNAPSHOT_STORE_PATH
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

async function writeJsonAtomic(filePath, value) {
  const dirPath = path.dirname(filePath)
  await fs.ensureDir(dirPath)

  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  await fs.move(tempPath, filePath, { overwrite: true })
}

async function getPathKind(targetPath) {
  try {
    const stat = await fs.lstat(targetPath)
    if (stat.isSymbolicLink()) return 'symlink'
    if (stat.isDirectory()) return 'directory'
    if (stat.isFile()) return 'file'
    return 'other'
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 'missing'
    }
    throw error
  }
}

function snapshotSortDesc(left, right) {
  const leftTs = Date.parse(left?.createdAt || '') || 0
  const rightTs = Date.parse(right?.createdAt || '') || 0
  if (leftTs !== rightTs) {
    return rightTs - leftTs
  }
  return String(right?.id || '').localeCompare(String(left?.id || ''))
}

async function listSnapshots() {
  if (!await fs.pathExists(SNAPSHOT_STORE_PATH)) {
    return []
  }

  const entries = await fs.readdir(SNAPSHOT_STORE_PATH)
  const snapshots = []

  for (const entryName of entries) {
    const snapshotPath = path.join(SNAPSHOT_STORE_PATH, entryName)
    const stat = await fs.stat(snapshotPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const metadataPath = path.join(snapshotPath, SNAPSHOT_METADATA_FILE)
    const metadata = await readJsonFile(metadataPath).catch(() => null)
    if (!metadata || typeof metadata !== 'object') continue
    if (!metadata.id) continue

    snapshots.push(metadata)
  }

  snapshots.sort(snapshotSortDesc)
  return snapshots
}

async function getSnapshotById(snapshotId) {
  const normalizedId = String(snapshotId || '').trim()
  if (!normalizedId) {
    throw new Error('snapshot id is required')
  }

  const metadataPath = path.join(SNAPSHOT_STORE_PATH, normalizedId, SNAPSHOT_METADATA_FILE)
  const metadata = await readJsonFile(metadataPath).catch(() => null)
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`Snapshot not found: ${normalizedId}`)
  }

  return metadata
}

async function getLatestSnapshot() {
  const snapshots = await listSnapshots()
  return snapshots[0] || null
}

async function pruneSnapshots(retentionLimit) {
  const snapshots = await listSnapshots()
  if (snapshots.length <= retentionLimit) {
    return { removed: [] }
  }

  const stale = snapshots.slice(retentionLimit)
  const removed = []
  for (const snapshot of stale) {
    const snapshotId = String(snapshot.id || '').trim()
    if (!snapshotId) continue
    await fs.remove(path.join(SNAPSHOT_STORE_PATH, snapshotId))
    removed.push(snapshotId)
  }

  return { removed }
}

async function createSnapshot(values) {
  const operation = normalizeSnapshotOperation(values?.operation)
  const target = normalizeSnapshotTarget(values?.target)
  const mode = normalizeSnapshotMode(values?.mode)
  const affectedPaths = normalizeAffectedPaths(values?.affectedPaths)
  const retention = resolveSnapshotRetention(values?.retention)

  const id = createSnapshotId()
  const createdAt = new Date().toISOString()
  const snapshotDir = path.join(SNAPSHOT_STORE_PATH, id)
  const entriesDir = path.join(snapshotDir, SNAPSHOT_ENTRIES_DIR)
  await fs.ensureDir(entriesDir)

  const entries = []
  for (const [index, targetPath] of affectedPaths.entries()) {
    const kind = await getPathKind(targetPath)
    const entry = {
      path: targetPath,
      kind,
    }

    if (kind !== 'missing') {
      const archiveName = `${String(index).padStart(4, '0')}-${path.basename(targetPath) || 'entry'}`
      const archivePath = path.join(entriesDir, archiveName)
      await fs.copy(targetPath, archivePath, {
        overwrite: true,
        errorOnExist: false,
        dereference: false,
      })
      entry.archivePath = path.relative(snapshotDir, archivePath)
    }

    entries.push(entry)
  }

  const metadata = {
    version: 1,
    id,
    createdAt,
    operation,
    target,
    mode,
    affectedPaths,
    entries,
  }

  await writeJsonAtomic(path.join(snapshotDir, SNAPSHOT_METADATA_FILE), metadata)
  const pruned = await pruneSnapshots(retention)

  return {
    ...metadata,
    retention,
    prunedSnapshotIds: pruned.removed,
  }
}

async function rollbackSnapshot(values) {
  const snapshotId = String(values?.id || '').trim()
  if (!snapshotId) {
    throw new Error('snapshot id is required')
  }

  const metadata = await getSnapshotById(snapshotId)
  const snapshotDir = path.join(SNAPSHOT_STORE_PATH, snapshotId)
  const entries = Array.isArray(metadata.entries) ? metadata.entries : []
  const sorted = [...entries].sort((left, right) => String(right.path || '').length - String(left.path || '').length)

  let restoredPaths = 0
  let removedPaths = 0

  for (const entry of sorted) {
    const targetPath = String(entry?.path || '').trim()
    if (!targetPath) continue

    await fs.remove(targetPath)

    if (entry.kind === 'missing') {
      removedPaths += 1
      continue
    }

    const relativeArchivePath = String(entry.archivePath || '').trim()
    if (!relativeArchivePath) {
      throw new Error(`Snapshot entry missing archive path: ${targetPath}`)
    }

    const archivePath = path.resolve(snapshotDir, relativeArchivePath)
    if (!archivePath.startsWith(`${snapshotDir}${path.sep}`)) {
      throw new Error(`Invalid snapshot archive path: ${relativeArchivePath}`)
    }
    if (!await fs.pathExists(archivePath)) {
      throw new Error(`Snapshot archive not found for path: ${targetPath}`)
    }

    await fs.ensureDir(path.dirname(targetPath))
    await fs.copy(archivePath, targetPath, {
      overwrite: true,
      errorOnExist: false,
      dereference: false,
    })
    restoredPaths += 1
  }

  return {
    id: metadata.id || snapshotId,
    createdAt: metadata.createdAt || null,
    operation: metadata.operation || 'unknown',
    target: metadata.target || '',
    mode: metadata.mode || 'copy',
    totalPaths: entries.length,
    restoredPaths,
    removedPaths,
  }
}

export {
  DEFAULT_SNAPSHOT_RETENTION,
  SNAPSHOT_RETENTION_ENV_KEY,
  createSnapshot,
  getLatestSnapshot,
  getSnapshotById,
  getSnapshotStorePath,
  listSnapshots,
  normalizeSnapshotMode,
  normalizeSnapshotOperation,
  pruneSnapshots,
  resolveSnapshotRetention,
  rollbackSnapshot,
}
