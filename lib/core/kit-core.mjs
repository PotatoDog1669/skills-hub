import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import Database from 'better-sqlite3'

const DB_DIR = path.join(os.homedir(), '.skills-hub')
const DB_PATH = path.join(DB_DIR, 'skills-hub.db')

let dbInstance = null

function ensureDb() {
  if (dbInstance) return dbInstance

  fs.mkdirSync(DB_DIR, { recursive: true })
  dbInstance = new Database(DB_PATH)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS kit_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kit_loadouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      import_source_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kit_loadout_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loadout_id TEXT NOT NULL,
      skill_path TEXT NOT NULL,
      mode TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_kit_loadout_items_loadout_id
      ON kit_loadout_items(loadout_id);

    CREATE TABLE IF NOT EXISTS kit_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      policy_id TEXT NOT NULL,
      loadout_id TEXT NOT NULL,
      managed_source_json TEXT,
      last_applied_at INTEGER,
      last_applied_target_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kit_presets_policy_id
      ON kit_presets(policy_id);

    CREATE INDEX IF NOT EXISTS idx_kit_presets_loadout_id
      ON kit_presets(loadout_id);
  `)
  ensureColumn(dbInstance, 'kit_loadouts', 'import_source_json', 'TEXT')
  ensureColumn(dbInstance, 'kit_presets', 'managed_source_json', 'TEXT')

  return dbInstance
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column?.name === columnName)) {
    return
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function getDbPath() {
  return DB_PATH
}

function nowTs() {
  return Date.now()
}

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `kit-${crypto.randomBytes(16).toString('hex')}`
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function requireName(value, fieldName = 'name') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    throw new Error(`Kit ${fieldName} is required`)
  }
  return normalized
}

function toOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function normalizeLoadoutImportSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const repoWebUrl = String(value.repoWebUrl || '').trim()
  const repoUrl = String(value.repoUrl || '').trim()
  const originalUrl = String(value.originalUrl || '').trim()
  const branch = toOptionalText(value.branch)
  const rootSubdir = String(value.rootSubdir || '').trim() || '/'
  const importedAt = String(value.importedAt || '').trim()
  const lastSourceUpdatedAt = String(value.lastSourceUpdatedAt || '').trim()
  const lastSafetyCheck = normalizeKitSafetyCheck(value.lastSafetyCheck)

  if (!repoWebUrl || !repoUrl || !originalUrl || !importedAt || !lastSourceUpdatedAt) {
    return undefined
  }

  return {
    repoWebUrl,
    repoUrl,
    originalUrl,
    branch,
    rootSubdir,
    importedAt,
    lastSourceUpdatedAt,
    lastSafetyCheck,
  }
}

function normalizeKitSafetyCheck(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const checkedAt = Number(value.checkedAt)
  const status = value.status === 'warn' ? 'warn' : 'pass'
  const scannedFiles = Number(value.scannedFiles)
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
  const flaggedFiles = Array.isArray(value.flaggedFiles)
    ? value.flaggedFiles.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []

  if (!Number.isFinite(checkedAt) || !Number.isFinite(scannedFiles)) {
    return undefined
  }

  return {
    checkedAt,
    status,
    scannedFiles,
    warnings,
    flaggedFiles,
  }
}

function normalizeManagedPolicyBaseline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const id = String(value.id || '').trim()
  const name = String(value.name || '').trim()
  const content = String(value.content || '').trim()
  const description = toOptionalText(value.description)

  if (!id || !name || !content) {
    return undefined
  }

  return {
    id,
    name,
    description,
    content,
  }
}

function normalizeManagedLoadoutBaseline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const id = String(value.id || '').trim()
  const name = String(value.name || '').trim()
  const description = toOptionalText(value.description)
  const items = normalizeLoadoutItems(value.items || [])

  if (!id || !name || items.length === 0) {
    return undefined
  }

  return {
    id,
    name,
    description,
    items,
  }
}

function normalizeManagedSecurityChecks(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null
      }

      const sourceId = String(entry.sourceId || '').trim()
      const sourceName = String(entry.sourceName || '').trim()
      const check = normalizeKitSafetyCheck(entry.check)
      if (!sourceId || !sourceName || !check) {
        return null
      }

      return {
        sourceId,
        sourceName,
        check,
      }
    })
    .filter(Boolean)
}

function normalizeManagedSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  if (String(value.kind || '').trim() !== 'official_preset') {
    return undefined
  }

  const presetId = String(value.presetId || '').trim()
  const presetName = String(value.presetName || '').trim()
  const catalogVersion = Number(value.catalogVersion)
  const installedAt = Number(value.installedAt)
  const lastRestoredAt = value.lastRestoredAt == null ? undefined : Number(value.lastRestoredAt)
  const restoreCount = Number(value.restoreCount)
  const baseline = value.baseline

  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    return undefined
  }

  const name = String(baseline.name || '').trim()
  const description = toOptionalText(baseline.description)
  const policy = normalizeManagedPolicyBaseline(baseline.policy)
  const loadout = normalizeManagedLoadoutBaseline(baseline.loadout)
  const securityChecks = normalizeManagedSecurityChecks(value.securityChecks)

  if (
    !presetId ||
    !presetName ||
    !name ||
    !policy ||
    !loadout ||
    !Number.isFinite(catalogVersion) ||
    !Number.isFinite(installedAt) ||
    !Number.isFinite(restoreCount)
  ) {
    return undefined
  }

  return {
    kind: 'official_preset',
    presetId,
    presetName,
    catalogVersion,
    installedAt,
    lastRestoredAt: Number.isFinite(lastRestoredAt) ? lastRestoredAt : undefined,
    restoreCount,
    baseline: {
      name,
      description,
      policy,
      loadout,
    },
    securityChecks,
  }
}

function normalizeLoadoutItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('Skills package items must be an array')
  }

  const seen = new Set()
  const normalized = []

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const skillPath = String(item.skillPath || '').trim()
    if (!skillPath || seen.has(skillPath)) {
      continue
    }

    const mode = item.mode === 'link' ? 'link' : 'copy'
    const sortOrder = Number.isInteger(item.sortOrder) ? item.sortOrder : index

    normalized.push({ skillPath, mode, sortOrder })
    seen.add(skillPath)
  }

  return normalized
}

function parsePolicyRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseLoadoutItems(rows) {
  return rows.map((row) => ({
    skillPath: row.skill_path,
    mode: row.mode === 'link' ? 'link' : 'copy',
    sortOrder: row.sort_order,
  }))
}

function parseLoadoutRow(row, items) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    items,
    importSource: normalizeLoadoutImportSource(parseJsonSafe(row.import_source_json, undefined)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseKitRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    policyId: row.policy_id || undefined,
    loadoutId: row.loadout_id || undefined,
    lastAppliedAt: row.last_applied_at || undefined,
    lastAppliedTarget: row.last_applied_target_json
      ? parseJsonSafe(row.last_applied_target_json, undefined)
      : undefined,
    managedSource: normalizeManagedSource(parseJsonSafe(row.managed_source_json, undefined)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function listKitPolicies() {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT id, name, description, content, created_at, updated_at
         FROM kit_policies
        ORDER BY updated_at DESC, name ASC`
    )
    .all()
  return rows.map(parsePolicyRow)
}

function getKitPolicyById(id) {
  if (!id) return null
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, name, description, content, created_at, updated_at
         FROM kit_policies
        WHERE id = ?`
    )
    .get(id)
  return parsePolicyRow(row)
}

function addKitPolicy(input) {
  const db = ensureDb()
  const id = createId()
  const ts = nowTs()

  const name = requireName(input?.name, 'AGENTS.md name')
  const content = String(input?.content || '').trim()
  if (!content) {
    throw new Error('AGENTS.md content is required')
  }

  db.prepare(
    `INSERT INTO kit_policies (id, name, description, content, created_at, updated_at)
     VALUES (@id, @name, @description, @content, @createdAt, @updatedAt)`
  ).run({
    id,
    name,
    description: toOptionalText(input?.description) || null,
    content,
    createdAt: ts,
    updatedAt: ts,
  })

  return getKitPolicyById(id)
}

function updateKitPolicy(input) {
  const id = String(input?.id || '').trim()
  if (!id) {
    throw new Error('AGENTS.md id is required')
  }

  const existing = getKitPolicyById(id)
  if (!existing) {
    throw new Error(`AGENTS.md not found: ${id}`)
  }

  const nextName =
    input?.name === undefined ? existing.name : requireName(input.name, 'AGENTS.md name')
  const nextDescription =
    input?.description === undefined ? existing.description || null : toOptionalText(input.description) || null
  const nextContent = input?.content === undefined ? existing.content : String(input.content || '').trim()

  if (!nextContent) {
    throw new Error('AGENTS.md content is required')
  }

  const db = ensureDb()
  db.prepare(
    `UPDATE kit_policies
        SET name = @name,
            description = @description,
            content = @content,
            updated_at = @updatedAt
      WHERE id = @id`
  ).run({
    id,
    name: nextName,
    description: nextDescription,
    content: nextContent,
    updatedAt: nowTs(),
  })

  return getKitPolicyById(id)
}

function deleteKitPolicy(id) {
  if (!id) return false
  const db = ensureDb()
  const usedByKit = db
    .prepare(`SELECT COUNT(1) AS count FROM kit_presets WHERE policy_id = ?`)
    .get(id)

  if (usedByKit?.count > 0) {
    throw new Error('AGENTS.md is referenced by existing kit presets; remove kits first')
  }

  const result = db.prepare(`DELETE FROM kit_policies WHERE id = ?`).run(id)
  return result.changes > 0
}

function listLoadoutItems(loadoutId) {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT skill_path, mode, sort_order
         FROM kit_loadout_items
        WHERE loadout_id = ?
        ORDER BY sort_order ASC, id ASC`
    )
    .all(loadoutId)
  return parseLoadoutItems(rows)
}

function listKitLoadouts() {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT id, name, description, import_source_json, created_at, updated_at
         FROM kit_loadouts
        ORDER BY updated_at DESC, name ASC`
    )
    .all()

  return rows.map((row) => parseLoadoutRow(row, listLoadoutItems(row.id)))
}

function getKitLoadoutById(id) {
  if (!id) return null
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, name, description, import_source_json, created_at, updated_at
         FROM kit_loadouts
        WHERE id = ?`
    )
    .get(id)

  if (!row) return null
  return parseLoadoutRow(row, listLoadoutItems(id))
}

function addKitLoadout(input) {
  const db = ensureDb()
  const id = createId()
  const ts = nowTs()

  const name = requireName(input?.name, 'skills package name')
  const items = normalizeLoadoutItems(input?.items || [])

  db.prepare(
    `INSERT INTO kit_loadouts (id, name, description, import_source_json, created_at, updated_at)
     VALUES (@id, @name, @description, @importSourceJson, @createdAt, @updatedAt)`
  ).run({
    id,
    name,
    description: toOptionalText(input?.description) || null,
    importSourceJson: JSON.stringify(normalizeLoadoutImportSource(input?.importSource) || null),
    createdAt: ts,
    updatedAt: ts,
  })

  if (items.length > 0) {
    const insertItem = db.prepare(
      `INSERT INTO kit_loadout_items (loadout_id, skill_path, mode, sort_order)
       VALUES (@loadoutId, @skillPath, @mode, @sortOrder)`
    )
    const tx = db.transaction((inputItems) => {
      for (const item of inputItems) {
        insertItem.run({
          loadoutId: id,
          skillPath: item.skillPath,
          mode: item.mode,
          sortOrder: item.sortOrder,
        })
      }
    })
    tx(items)
  }

  return getKitLoadoutById(id)
}

function updateKitLoadout(input) {
  const id = String(input?.id || '').trim()
  if (!id) {
    throw new Error('Skills package id is required')
  }

  const existing = getKitLoadoutById(id)
  if (!existing) {
    throw new Error(`Skills package not found: ${id}`)
  }

  const nextName =
    input?.name === undefined ? existing.name : requireName(input.name, 'skills package name')
  const nextDescription =
    input?.description === undefined
      ? existing.description || null
      : toOptionalText(input.description) || null
  const nextItems = input?.items === undefined ? existing.items : normalizeLoadoutItems(input.items)
  const nextImportSource =
    input?.importSource === undefined
      ? existing.importSource || null
      : normalizeLoadoutImportSource(input.importSource) || null

  const db = ensureDb()
  const updateLoadout = db.prepare(
    `UPDATE kit_loadouts
        SET name = @name,
            description = @description,
            import_source_json = @importSourceJson,
            updated_at = @updatedAt
      WHERE id = @id`
  )
  const deleteItems = db.prepare(`DELETE FROM kit_loadout_items WHERE loadout_id = ?`)
  const insertItem = db.prepare(
    `INSERT INTO kit_loadout_items (loadout_id, skill_path, mode, sort_order)
     VALUES (@loadoutId, @skillPath, @mode, @sortOrder)`
  )

  const tx = db.transaction(() => {
    updateLoadout.run({
      id,
      name: nextName,
      description: nextDescription,
      importSourceJson: JSON.stringify(nextImportSource),
      updatedAt: nowTs(),
    })

    deleteItems.run(id)

    for (const item of nextItems) {
      insertItem.run({
        loadoutId: id,
        skillPath: item.skillPath,
        mode: item.mode,
        sortOrder: item.sortOrder,
      })
    }
  })

  tx()

  return getKitLoadoutById(id)
}

function deleteKitLoadout(id) {
  if (!id) return false
  const db = ensureDb()
  const usedByKit = db
    .prepare(`SELECT COUNT(1) AS count FROM kit_presets WHERE loadout_id = ?`)
    .get(id)

  if (usedByKit?.count > 0) {
    throw new Error('Skills package is referenced by existing kit presets; remove kits first')
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM kit_loadout_items WHERE loadout_id = ?`).run(id)
    return db.prepare(`DELETE FROM kit_loadouts WHERE id = ?`).run(id)
  })

  const result = tx()
  return result.changes > 0
}

function listKits() {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT id, name, description, policy_id, loadout_id, managed_source_json, last_applied_at, last_applied_target_json,
              created_at, updated_at
         FROM kit_presets
        ORDER BY updated_at DESC, name ASC`
    )
    .all()
  return rows.map(parseKitRow)
}

function getKitById(id) {
  if (!id) return null
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, name, description, policy_id, loadout_id, managed_source_json, last_applied_at, last_applied_target_json,
              created_at, updated_at
         FROM kit_presets
        WHERE id = ?`
    )
    .get(id)
  return parseKitRow(row)
}

function ensureKitRefsExist(policyId, loadoutId) {
  if (policyId && !getKitPolicyById(policyId)) {
    throw new Error(`AGENTS.md not found: ${policyId}`)
  }

  if (loadoutId && !getKitLoadoutById(loadoutId)) {
    throw new Error(`Skills package not found: ${loadoutId}`)
  }
}

function addKit(input) {
  const db = ensureDb()
  const id = createId()
  const ts = nowTs()

  const name = requireName(input?.name, 'kit name')
  const policyId = String(input?.policyId || '').trim()
  const loadoutId = String(input?.loadoutId || '').trim()
  if (!policyId && !loadoutId) {
    throw new Error('Kit must include at least AGENTS.md or Skills package')
  }

  ensureKitRefsExist(policyId, loadoutId)

  db.prepare(
    `INSERT INTO kit_presets (
      id, name, description, policy_id, loadout_id, managed_source_json, created_at, updated_at
    ) VALUES (
      @id, @name, @description, @policyId, @loadoutId, @managedSourceJson, @createdAt, @updatedAt
    )`
  ).run({
    id,
    name,
    description: toOptionalText(input?.description) || null,
    policyId: policyId || '',
    loadoutId: loadoutId || '',
    managedSourceJson: JSON.stringify(normalizeManagedSource(input?.managedSource) || null),
    createdAt: ts,
    updatedAt: ts,
  })

  return getKitById(id)
}

function updateKit(input) {
  const id = String(input?.id || '').trim()
  if (!id) {
    throw new Error('Kit id is required')
  }

  const existing = getKitById(id)
  if (!existing) {
    throw new Error(`Kit not found: ${id}`)
  }

  const nextName = input?.name === undefined ? existing.name : requireName(input.name, 'kit name')
  const nextDescription =
    input?.description === undefined
      ? existing.description || null
      : toOptionalText(input.description) || null
  const nextPolicyId =
    input?.policyId === undefined ? existing.policyId : String(input.policyId || '').trim()
  const nextLoadoutId =
    input?.loadoutId === undefined ? existing.loadoutId : String(input.loadoutId || '').trim()
  const nextManagedSource =
    input?.managedSource === undefined
      ? existing.managedSource || null
      : normalizeManagedSource(input.managedSource) || null

  if (!nextPolicyId && !nextLoadoutId) {
    throw new Error('Kit must include at least AGENTS.md or Skills package')
  }

  ensureKitRefsExist(nextPolicyId, nextLoadoutId)

  const db = ensureDb()
  db.prepare(
    `UPDATE kit_presets
        SET name = @name,
            description = @description,
            policy_id = @policyId,
            loadout_id = @loadoutId,
            managed_source_json = @managedSourceJson,
            updated_at = @updatedAt
      WHERE id = @id`
  ).run({
    id,
    name: nextName,
    description: nextDescription,
    policyId: nextPolicyId || '',
    loadoutId: nextLoadoutId || '',
    managedSourceJson: JSON.stringify(nextManagedSource),
    updatedAt: nowTs(),
  })

  return getKitById(id)
}

function deleteKit(id) {
  if (!id) return false
  const db = ensureDb()
  const result = db.prepare(`DELETE FROM kit_presets WHERE id = ?`).run(id)
  return result.changes > 0
}

function upsertPolicyBaseline(db, baseline, updatedAt) {
  const existing = getKitPolicyById(baseline.id)
  db.prepare(
    `INSERT OR REPLACE INTO kit_policies (id, name, description, content, created_at, updated_at)
     VALUES (@id, @name, @description, @content, @createdAt, @updatedAt)`
  ).run({
    id: baseline.id,
    name: baseline.name,
    description: baseline.description || null,
    content: baseline.content,
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
  })
}

function upsertLoadoutBaseline(db, baseline, updatedAt) {
  const existing = getKitLoadoutById(baseline.id)
  db.prepare(
    `INSERT OR REPLACE INTO kit_loadouts (id, name, description, import_source_json, created_at, updated_at)
     VALUES (@id, @name, @description, @importSourceJson, @createdAt, @updatedAt)`
  ).run({
    id: baseline.id,
    name: baseline.name,
    description: baseline.description || null,
    importSourceJson: JSON.stringify(null),
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
  })

  db.prepare(`DELETE FROM kit_loadout_items WHERE loadout_id = ?`).run(baseline.id)
  const insertItem = db.prepare(
    `INSERT INTO kit_loadout_items (loadout_id, skill_path, mode, sort_order)
     VALUES (@loadoutId, @skillPath, @mode, @sortOrder)`
  )

  for (const item of baseline.items) {
    insertItem.run({
      loadoutId: baseline.id,
      skillPath: item.skillPath,
      mode: item.mode,
      sortOrder: item.sortOrder,
    })
  }
}

function restoreManagedKitBaseline(id) {
  const existing = getKitById(id)
  if (!existing) {
    throw new Error(`Kit not found: ${id}`)
  }
  if (!existing.managedSource || existing.managedSource.kind !== 'official_preset') {
    throw new Error('Only managed official kits can be restored')
  }

  const db = ensureDb()
  const ts = nowTs()
  const { baseline } = existing.managedSource
  const nextManagedSource = {
    ...existing.managedSource,
    lastRestoredAt: ts,
    restoreCount: Number(existing.managedSource.restoreCount || 0) + 1,
  }

  const tx = db.transaction(() => {
    upsertPolicyBaseline(db, baseline.policy, ts)
    upsertLoadoutBaseline(db, baseline.loadout, ts)
    db.prepare(
      `UPDATE kit_presets
          SET name = @name,
              description = @description,
              policy_id = @policyId,
              loadout_id = @loadoutId,
              managed_source_json = @managedSourceJson,
              updated_at = @updatedAt
        WHERE id = @id`
    ).run({
      id,
      name: baseline.name,
      description: baseline.description || null,
      policyId: baseline.policy.id,
      loadoutId: baseline.loadout.id,
      managedSourceJson: JSON.stringify(nextManagedSource),
      updatedAt: ts,
    })
  })

  tx()
  return getKitById(id)
}

function markKitApplied(input) {
  const id = String(input?.id || '').trim()
  if (!id) {
    throw new Error('Kit id is required')
  }

  const existing = getKitById(id)
  if (!existing) {
    throw new Error(`Kit not found: ${id}`)
  }

  const projectPath = String(input?.projectPath || '').trim()
  const agentName = String(input?.agentName || '').trim()
  if (!projectPath || !agentName) {
    throw new Error('projectPath and agentName are required to mark kit application')
  }

  const appliedAt = nowTs()
  const db = ensureDb()
  db.prepare(
    `UPDATE kit_presets
        SET last_applied_at = @lastAppliedAt,
            last_applied_target_json = @lastAppliedTargetJson,
            updated_at = @updatedAt
      WHERE id = @id`
  ).run({
    id,
    lastAppliedAt: appliedAt,
    lastAppliedTargetJson: JSON.stringify({ projectPath, agentName }),
    updatedAt: appliedAt,
  })

  return getKitById(id)
}

export {
  ensureDb,
  getDbPath,
  listKitPolicies,
  getKitPolicyById,
  addKitPolicy,
  updateKitPolicy,
  deleteKitPolicy,
  listKitLoadouts,
  getKitLoadoutById,
  addKitLoadout,
  updateKitLoadout,
  deleteKitLoadout,
  listKits,
  getKitById,
  addKit,
  updateKit,
  deleteKit,
  restoreManagedKitBaseline,
  markKitApplied,
}
