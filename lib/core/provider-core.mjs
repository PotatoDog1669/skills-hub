import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import TOML from '@iarna/toml'

const APP_TYPES = ['claude', 'codex', 'gemini']
const DB_DIR = path.join(os.homedir(), '.skills-hub')
const DB_PATH = path.join(DB_DIR, 'skills-hub.db')

let dbInstance = null

function ensureDb() {
  if (dbInstance) return dbInstance

  fs.mkdirSync(DB_DIR, { recursive: true })
  dbInstance = new Database(DB_PATH)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      app_type TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_current_app
      ON providers(app_type)
      WHERE is_current = 1;

    CREATE TABLE IF NOT EXISTS live_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_type TEXT NOT NULL,
      backup_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  return dbInstance
}

function nowTs() {
  return Date.now()
}

function assertAppType(appType) {
  if (!APP_TYPES.includes(appType)) {
    throw new Error(`Unsupported app type: ${appType}`)
  }
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function parseProviderRow(row) {
  if (!row) return null
  return {
    id: row.id,
    appType: row.app_type,
    name: row.name,
    config: parseJsonSafe(row.config_json, {}),
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ensureObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`)
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    throw new Error(`Failed to read JSON file: ${filePath}`)
  }
}

async function atomicWriteFile(filePath, content) {
  const dir = path.dirname(filePath)
  await fsp.mkdir(dir, { recursive: true })

  const tempFile = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )

  await fsp.writeFile(tempFile, content, 'utf-8')
  await fsp.rename(tempFile, filePath)
}

async function writeJsonAtomic(filePath, value) {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function parseEnv(raw) {
  const result = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, '')
    result[key] = value
  }
  return result
}

function stringifyEnv(envObj) {
  return (
    Object.entries(envObj)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('\n') + '\n'
  )
}

function deepMergeObject(base, next) {
  if (!base || typeof base !== 'object' || Array.isArray(base)) return next
  if (!next || typeof next !== 'object' || Array.isArray(next)) return next

  const merged = { ...base }
  for (const [key, value] of Object.entries(next)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      merged[key] &&
      typeof merged[key] === 'object' &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = deepMergeObject(merged[key], value)
    } else {
      merged[key] = value
    }
  }
  return merged
}

function mergeLiveConfig(appType, liveConfig, providerConfig) {
  if (appType === 'claude') {
    return deepMergeObject(liveConfig || {}, providerConfig || {})
  }

  if (appType === 'codex') {
    return {
      auth: deepMergeObject(liveConfig?.auth || {}, providerConfig?.auth || {}),
      configToml: deepMergeObject(liveConfig?.configToml || {}, providerConfig?.configToml || {}),
    }
  }

  if (appType === 'gemini') {
    return {
      env: { ...(liveConfig?.env || {}), ...(providerConfig?.env || {}) },
      settings: deepMergeObject(liveConfig?.settings || {}, providerConfig?.settings || {}),
    }
  }

  return providerConfig
}

function getAdapter(appType) {
  assertAppType(appType)

  if (appType === 'claude') {
    const livePath = path.join(os.homedir(), '.claude', 'settings.json')
    return {
      async readLive() {
        return await readJsonFile(livePath)
      },
      async validateProviderConfig(providerConfig) {
        ensureObject(providerConfig, 'Claude provider config')
      },
      async writeLive(providerConfig) {
        ensureObject(providerConfig, 'Claude provider config')
        await writeJsonAtomic(livePath, providerConfig)
      },
    }
  }

  if (appType === 'codex') {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json')
    const configTomlPath = path.join(os.homedir(), '.codex', 'config.toml')

    return {
      async readLive() {
        let configToml = {}
        try {
          const rawToml = await fsp.readFile(configTomlPath, 'utf-8')
          configToml = TOML.parse(rawToml)
        } catch (error) {
          if (!error || error.code !== 'ENOENT') {
            throw new Error(`Failed to read Codex config.toml: ${configTomlPath}`)
          }
        }

        return {
          auth: await readJsonFile(authPath),
          configToml,
        }
      },
      async validateProviderConfig(providerConfig) {
        ensureObject(providerConfig, 'Codex provider config')
        const hasAuth = providerConfig.auth && typeof providerConfig.auth === 'object'
        const hasToml = providerConfig.configToml && typeof providerConfig.configToml === 'object'
        if (!hasAuth && !hasToml) {
          throw new Error('Codex provider config must include auth and/or configToml object')
        }
      },
      async writeLive(providerConfig) {
        ensureObject(providerConfig, 'Codex provider config')

        if (providerConfig.auth && typeof providerConfig.auth === 'object') {
          await writeJsonAtomic(authPath, providerConfig.auth)
        }

        if (providerConfig.configToml && typeof providerConfig.configToml === 'object') {
          await atomicWriteFile(configTomlPath, TOML.stringify(providerConfig.configToml))
        }
      },
    }
  }

  if (appType === 'gemini') {
    const envPath = path.join(os.homedir(), '.gemini', '.env')
    const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json')

    return {
      async readLive() {
        let env = {}
        try {
          const rawEnv = await fsp.readFile(envPath, 'utf-8')
          env = parseEnv(rawEnv)
        } catch (error) {
          if (!error || error.code !== 'ENOENT') {
            throw new Error(`Failed to read Gemini .env: ${envPath}`)
          }
        }

        return {
          env,
          settings: await readJsonFile(settingsPath),
        }
      },
      async validateProviderConfig(providerConfig) {
        ensureObject(providerConfig, 'Gemini provider config')
        const hasEnv = providerConfig.env && typeof providerConfig.env === 'object'
        const hasSettings = providerConfig.settings && typeof providerConfig.settings === 'object'
        if (!hasEnv && !hasSettings) {
          throw new Error('Gemini provider config must include env and/or settings object')
        }
      },
      async writeLive(providerConfig) {
        ensureObject(providerConfig, 'Gemini provider config')

        if (providerConfig.env && typeof providerConfig.env === 'object') {
          await atomicWriteFile(envPath, stringifyEnv(providerConfig.env))
        }

        if (providerConfig.settings && typeof providerConfig.settings === 'object') {
          await writeJsonAtomic(settingsPath, providerConfig.settings)
        }
      },
    }
  }

  throw new Error(`No adapter for app type: ${appType}`)
}

function addLiveBackup(appType, backup) {
  const db = ensureDb()
  const stmt = db.prepare(`
    INSERT INTO live_backups (app_type, backup_json, created_at)
    VALUES (@appType, @backupJson, @createdAt)
  `)

  const result = stmt.run({
    appType,
    backupJson: JSON.stringify(backup),
    createdAt: nowTs(),
  })

  return Number(result.lastInsertRowid)
}

function getBackupById(backupId) {
  const db = ensureDb()
  const row = db
    .prepare(`SELECT id, app_type, backup_json, created_at FROM live_backups WHERE id = ?`)
    .get(backupId)

  if (!row) return null

  return {
    id: row.id,
    appType: row.app_type,
    backup: parseJsonSafe(row.backup_json, {}),
    createdAt: row.created_at,
  }
}

function getLatestBackup(appType) {
  assertAppType(appType)
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, app_type, backup_json, created_at
       FROM live_backups
       WHERE app_type = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(appType)

  if (!row) return null

  return {
    id: row.id,
    appType: row.app_type,
    backup: parseJsonSafe(row.backup_json, {}),
    createdAt: row.created_at,
  }
}

function listProviders(appType) {
  const db = ensureDb()

  if (appType) assertAppType(appType)

  const rows = appType
    ? db
        .prepare(
          `SELECT id, app_type, name, config_json, is_current, created_at, updated_at
           FROM providers
           WHERE app_type = ?
           ORDER BY updated_at DESC, name ASC`
        )
        .all(appType)
    : db
        .prepare(
          `SELECT id, app_type, name, config_json, is_current, created_at, updated_at
           FROM providers
           ORDER BY app_type ASC, updated_at DESC, name ASC`
        )
        .all()

  return rows.map(parseProviderRow)
}

function getProviderById(id) {
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, app_type, name, config_json, is_current, created_at, updated_at
       FROM providers
       WHERE id = ?`
    )
    .get(id)

  return parseProviderRow(row)
}

function getCurrentProvider(appType) {
  assertAppType(appType)
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, app_type, name, config_json, is_current, created_at, updated_at
       FROM providers
       WHERE app_type = ? AND is_current = 1
       LIMIT 1`
    )
    .get(appType)

  return parseProviderRow(row)
}

function addProvider({ appType, name, config }) {
  assertAppType(appType)
  ensureObject(config, 'Provider config')

  const db = ensureDb()
  const ts = nowTs()
  const id = crypto.randomUUID()

  db.prepare(
    `INSERT INTO providers (id, app_type, name, config_json, is_current, created_at, updated_at)
     VALUES (@id, @appType, @name, @configJson, 0, @createdAt, @updatedAt)`
  ).run({
    id,
    appType,
    name: name?.trim() || `${appType}-${id.slice(0, 8)}`,
    configJson: JSON.stringify(config),
    createdAt: ts,
    updatedAt: ts,
  })

  return getProviderById(id)
}

function updateProvider({ id, name, config }) {
  const db = ensureDb()
  const existing = getProviderById(id)
  if (!existing) {
    throw new Error(`Provider not found: ${id}`)
  }

  if (config !== undefined) ensureObject(config, 'Provider config')

  db.prepare(
    `UPDATE providers
     SET name = @name,
         config_json = @configJson,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    name: name?.trim() || existing.name,
    configJson: JSON.stringify(config ?? existing.config),
    updatedAt: nowTs(),
  })

  return getProviderById(id)
}

function deleteProvider(id) {
  const db = ensureDb()
  const existing = getProviderById(id)
  if (!existing) return false

  db.prepare(`DELETE FROM providers WHERE id = ?`).run(id)
  return true
}

function setCurrentProvider(appType, providerId) {
  assertAppType(appType)
  const db = ensureDb()

  const tx = db.transaction(() => {
    db.prepare(`UPDATE providers SET is_current = 0, updated_at = ? WHERE app_type = ?`).run(
      nowTs(),
      appType
    )

    db.prepare(`UPDATE providers SET is_current = 1, updated_at = ? WHERE id = ?`).run(nowTs(), providerId)
  })

  tx()
}

function updateProviderConfig(providerId, config) {
  ensureObject(config, 'Provider config')
  const db = ensureDb()
  db.prepare(`UPDATE providers SET config_json = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(config),
    nowTs(),
    providerId
  )
}

function formatSwitchError(step, err, rollbackErr, appType, backupId) {
  const detail = err instanceof Error ? err.message : String(err)
  const rollbackDetail = rollbackErr
    ? ` Rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}.`
    : ''

  return new Error(
    `Provider switch failed at ${step} for ${appType}. Backup id: ${backupId}.${rollbackDetail} Root cause: ${detail}`
  )
}

async function restoreBackup(appType, backupId) {
  const adapter = getAdapter(appType)
  const byId = backupId ? getBackupById(backupId) : null
  const latest = byId || getLatestBackup(appType)

  if (!latest) {
    throw new Error(`No backup found for app ${appType}`)
  }

  await adapter.writeLive(latest.backup)
  return latest
}

async function switchProvider({ appType, providerId }) {
  assertAppType(appType)

  const target = getProviderById(providerId)
  if (!target) {
    throw new Error(`Target provider not found: ${providerId}`)
  }
  if (target.appType !== appType) {
    throw new Error(`Provider ${providerId} does not belong to app ${appType}`)
  }

  const adapter = getAdapter(appType)
  const current = getCurrentProvider(appType)

  const liveBefore = await adapter.readLive()
  const backupId = addLiveBackup(appType, liveBefore)

  if (current && current.id !== target.id) {
    updateProviderConfig(current.id, liveBefore)
  }

  const nextConfig = mergeLiveConfig(appType, liveBefore, target.config)

  try {
    await adapter.validateProviderConfig(nextConfig)
  } catch (error) {
    throw formatSwitchError('validate', error, null, appType, backupId)
  }

  try {
    await adapter.writeLive(nextConfig)
  } catch (error) {
    let rollbackErr = null
    try {
      await restoreBackup(appType, backupId)
    } catch (restoreError) {
      rollbackErr = restoreError
    }

    throw formatSwitchError('writeLive', error, rollbackErr, appType, backupId)
  }

  try {
    setCurrentProvider(appType, target.id)
  } catch (error) {
    let rollbackErr = null
    try {
      await restoreBackup(appType, backupId)
    } catch (restoreError) {
      rollbackErr = restoreError
    }

    throw formatSwitchError('setCurrent', error, rollbackErr, appType, backupId)
  }

  return {
    appType,
    currentProviderId: target.id,
    backupId,
    switchedFrom: current?.id || null,
    switchedTo: target.id,
  }
}

function getDbPath() {
  return DB_PATH
}

function maskProviderConfig(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => maskProviderConfig(entry))
  }

  if (!value || typeof value !== 'object') return value

  const masked = {}
  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase()
    const shouldMask =
      lowerKey.includes('key') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password')

    if (shouldMask && typeof val === 'string') {
      const raw = val.trim()
      if (raw.length <= 8) {
        masked[key] = '****'
      } else {
        masked[key] = `${raw.slice(0, 4)}****${raw.slice(-2)}`
      }
      continue
    }

    masked[key] = maskProviderConfig(val)
  }

  return masked
}

function maskProvider(provider) {
  if (!provider) return provider
  return {
    ...provider,
    config: maskProviderConfig(provider.config),
  }
}

function maskProviders(providers) {
  return providers.map(maskProvider)
}

export {
  APP_TYPES,
  addProvider,
  deleteProvider,
  ensureDb,
  getAdapter,
  getBackupById,
  getCurrentProvider,
  getDbPath,
  getLatestBackup,
  getProviderById,
  listProviders,
  maskProvider,
  maskProviders,
  restoreBackup,
  switchProvider,
  updateProvider,
}
