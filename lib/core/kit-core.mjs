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

  return dbInstance
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
    policyId: row.policy_id,
    loadoutId: row.loadout_id,
    lastAppliedAt: row.last_applied_at || undefined,
    lastAppliedTarget: row.last_applied_target_json
      ? parseJsonSafe(row.last_applied_target_json, undefined)
      : undefined,
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
      `SELECT id, name, description, created_at, updated_at
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
      `SELECT id, name, description, created_at, updated_at
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
    `INSERT INTO kit_loadouts (id, name, description, created_at, updated_at)
     VALUES (@id, @name, @description, @createdAt, @updatedAt)`
  ).run({
    id,
    name,
    description: toOptionalText(input?.description) || null,
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

  const db = ensureDb()
  const updateLoadout = db.prepare(
    `UPDATE kit_loadouts
        SET name = @name,
            description = @description,
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
      `SELECT id, name, description, policy_id, loadout_id, last_applied_at, last_applied_target_json,
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
      `SELECT id, name, description, policy_id, loadout_id, last_applied_at, last_applied_target_json,
              created_at, updated_at
         FROM kit_presets
        WHERE id = ?`
    )
    .get(id)
  return parseKitRow(row)
}

function ensureKitRefsExist(policyId, loadoutId) {
  if (!getKitPolicyById(policyId)) {
    throw new Error(`AGENTS.md not found: ${policyId}`)
  }

  if (!getKitLoadoutById(loadoutId)) {
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
  if (!policyId || !loadoutId) {
    throw new Error('Kit must include both AGENTS.md and Skills package')
  }

  ensureKitRefsExist(policyId, loadoutId)

  db.prepare(
    `INSERT INTO kit_presets (
      id, name, description, policy_id, loadout_id, created_at, updated_at
    ) VALUES (
      @id, @name, @description, @policyId, @loadoutId, @createdAt, @updatedAt
    )`
  ).run({
    id,
    name,
    description: toOptionalText(input?.description) || null,
    policyId,
    loadoutId,
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

  if (!nextPolicyId || !nextLoadoutId) {
    throw new Error('Kit must include both AGENTS.md and Skills package')
  }

  ensureKitRefsExist(nextPolicyId, nextLoadoutId)

  const db = ensureDb()
  db.prepare(
    `UPDATE kit_presets
        SET name = @name,
            description = @description,
            policy_id = @policyId,
            loadout_id = @loadoutId,
            updated_at = @updatedAt
      WHERE id = @id`
  ).run({
    id,
    name: nextName,
    description: nextDescription,
    policyId: nextPolicyId,
    loadoutId: nextLoadoutId,
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
  markKitApplied,
}
