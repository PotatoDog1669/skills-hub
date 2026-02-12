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

    CREATE TABLE IF NOT EXISTS universal_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      website_url TEXT,
      notes TEXT,
      apps_json TEXT NOT NULL,
      models_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
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

function normalizeUniversalApps(appsInput) {
  const apps = appsInput && typeof appsInput === 'object' ? appsInput : {}
  return {
    claude: apps.claude !== false,
    codex: apps.codex !== false,
    gemini: apps.gemini !== false,
  }
}

function normalizeUniversalModels(modelsInput) {
  const models = modelsInput && typeof modelsInput === 'object' ? modelsInput : {}
  const toModelObj = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const model = typeof value.model === 'string' ? value.model : undefined
    return model ? { model } : {}
  }

  return {
    claude: toModelObj(models.claude),
    codex: toModelObj(models.codex),
    gemini: toModelObj(models.gemini),
  }
}

function parseUniversalProviderRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    websiteUrl: row.website_url || undefined,
    notes: row.notes || undefined,
    apps: normalizeUniversalApps(parseJsonSafe(row.apps_json, {})),
    models: normalizeUniversalModels(parseJsonSafe(row.models_json, {})),
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

function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  const tempFile = path.join(
    dir,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  fs.writeFileSync(tempFile, content, 'utf-8')
  fs.renameSync(tempFile, filePath)
}

function writeJsonAtomicSync(filePath, value) {
  atomicWriteFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function getCodexProviderAuthSnapshotPath(providerId) {
  return path.join(DB_DIR, 'provider-auth', 'codex', providerId, 'auth.json')
}

function writeCodexProviderAuthSnapshot(providerId, auth) {
  if (!providerId) return
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return
  writeJsonAtomicSync(getCodexProviderAuthSnapshotPath(providerId), auth)
}

async function readCodexProviderAuthSnapshot(providerId) {
  if (!providerId) return null
  const snapshotPath = getCodexProviderAuthSnapshotPath(providerId)
  try {
    const raw = await fsp.readFile(snapshotPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw new Error(`Failed to read Codex auth snapshot: ${snapshotPath}`)
  }
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

function sanitizeProviderConfigForLive(providerConfig) {
  if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
    return providerConfig
  }

  const sanitized = { ...providerConfig }
  if (Object.prototype.hasOwnProperty.call(sanitized, '_profile')) {
    delete sanitized._profile
  }
  return sanitized
}

function preserveProviderProfile(nextConfig, previousConfig) {
  if (!nextConfig || typeof nextConfig !== 'object' || Array.isArray(nextConfig)) {
    return nextConfig
  }
  if (!previousConfig || typeof previousConfig !== 'object' || Array.isArray(previousConfig)) {
    return nextConfig
  }

  const profile = previousConfig._profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return nextConfig
  }

  return {
    ...nextConfig,
    _profile: profile,
  }
}

function sanitizeOfficialProviderConfig(appType, liveConfig) {
  if (!liveConfig || typeof liveConfig !== 'object' || Array.isArray(liveConfig)) {
    return liveConfig
  }

  // Official Codex providers should never carry API-key credentials from API-mode snapshots.
  if (appType === 'codex') {
    const next = { ...liveConfig }
    const auth =
      next.auth && typeof next.auth === 'object' && !Array.isArray(next.auth) ? { ...next.auth } : {}
    auth.OPENAI_API_KEY = null
    if (Object.prototype.hasOwnProperty.call(auth, 'api_key')) {
      delete auth.api_key
    }
    next.auth = auth
    return next
  }

  return liveConfig
}

function sanitizeOfficialConfigIfNeeded(appType, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return config
  }
  const profile = config._profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return config
  }
  if (profile.kind !== 'official') {
    return config
  }
  return sanitizeOfficialProviderConfig(appType, config)
}

function normalizeCodexAuthConfig(authConfig) {
  if (!authConfig || typeof authConfig !== 'object' || Array.isArray(authConfig)) {
    return {}
  }

  const normalized = { ...authConfig }
  if (
    typeof normalized.OPENAI_API_KEY !== 'string' &&
    typeof normalized.api_key === 'string'
  ) {
    normalized.OPENAI_API_KEY = normalized.api_key
  }

  return normalized
}

function normalizeCodexProviderConfig(providerConfig) {
  if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
    return {}
  }

  const normalized = {}
  if (providerConfig.auth && typeof providerConfig.auth === 'object' && !Array.isArray(providerConfig.auth)) {
    normalized.auth = normalizeCodexAuthConfig(providerConfig.auth)
  }

  if (typeof providerConfig.config === 'string') {
    normalized.config = providerConfig.config
  } else if (
    providerConfig.config &&
    typeof providerConfig.config === 'object' &&
    !Array.isArray(providerConfig.config)
  ) {
    normalized.config = TOML.stringify(providerConfig.config)
  } else if (
    providerConfig.configToml &&
    typeof providerConfig.configToml === 'object' &&
    !Array.isArray(providerConfig.configToml)
  ) {
    // Backward compatibility for old stored shape.
    normalized.config = TOML.stringify(providerConfig.configToml)
  }

  return normalized
}

function sanitizeCodexProviderName(rawName) {
  const normalized = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'custom'
}

function buildCodexConfigToml(providerName, endpoint, modelName = 'gpt-5.2') {
  const providerKey = sanitizeCodexProviderName(providerName)
  return `model_provider = "${providerKey}"
model = "${modelName || 'gpt-5.2'}"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.${providerKey}]
name = "${providerKey}"
base_url = "${endpoint}"
wire_api = "responses"
requires_openai_auth = true
`
}

function mergeLiveConfig(appType, liveConfig, providerConfig) {
  const sanitizedProviderConfig = sanitizeProviderConfigForLive(providerConfig || {})

  if (appType === 'claude') {
    return deepMergeObject(liveConfig || {}, sanitizedProviderConfig || {})
  }

  if (appType === 'codex') {
    // Align with cc-switch: switch writes provider snapshot directly.
    // If legacy provider misses auth/config, fallback to current live values.
    const liveCodex = normalizeCodexProviderConfig(liveConfig || {})
    const nextCodex = normalizeCodexProviderConfig(sanitizedProviderConfig || {})
    return {
      ...(nextCodex.auth || liveCodex.auth ? { auth: nextCodex.auth || liveCodex.auth } : {}),
      ...(typeof nextCodex.config === 'string' || typeof liveCodex.config === 'string'
        ? { config: typeof nextCodex.config === 'string' ? nextCodex.config : liveCodex.config }
        : {}),
    }
  }

  if (appType === 'gemini') {
    return {
      env: { ...(liveConfig?.env || {}), ...(sanitizedProviderConfig?.env || {}) },
      settings: deepMergeObject(liveConfig?.settings || {}, sanitizedProviderConfig?.settings || {}),
    }
  }

  return sanitizedProviderConfig
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
        let config = ''
        try {
          config = await fsp.readFile(configTomlPath, 'utf-8')
        } catch (error) {
          if (!error || error.code !== 'ENOENT') {
            throw new Error(`Failed to read Codex config.toml: ${configTomlPath}`)
          }
        }

        return {
          auth: await readJsonFile(authPath),
          config,
        }
      },
      async validateProviderConfig(providerConfig) {
        ensureObject(providerConfig, 'Codex provider config')
        const normalized = normalizeCodexProviderConfig(providerConfig)
        const hasAuth = normalized.auth && typeof normalized.auth === 'object'
        const hasConfig = typeof normalized.config === 'string'
        if (!hasAuth && !hasConfig) {
          throw new Error('Codex provider config must include auth and/or config')
        }
      },
      async writeLive(providerConfig) {
        ensureObject(providerConfig, 'Codex provider config')
        const normalized = normalizeCodexProviderConfig(providerConfig)

        if (normalized.auth && typeof normalized.auth === 'object') {
          await writeJsonAtomic(authPath, normalized.auth)
        }

        if (typeof normalized.config === 'string') {
          await atomicWriteFile(configTomlPath, normalized.config)
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

function normalizeProviderProfile(profileInput) {
  const profile = profileInput && typeof profileInput === 'object' ? profileInput : {}
  return {
    kind: profile.kind === 'official' ? 'official' : 'api',
    vendorKey: typeof profile.vendorKey === 'string' ? profile.vendorKey : undefined,
    universalId: typeof profile.universalId === 'string' ? profile.universalId : undefined,
    accountName: typeof profile.accountName === 'string' ? profile.accountName : undefined,
    endpoint: typeof profile.endpoint === 'string' ? profile.endpoint : undefined,
    website: typeof profile.website === 'string' ? profile.website : undefined,
    model: typeof profile.model === 'string' ? profile.model : undefined,
    accountId: typeof profile.accountId === 'string' ? profile.accountId : undefined,
    note: typeof profile.note === 'string' ? profile.note : undefined,
  }
}

function attachProfile(config, profileInput) {
  const profile = normalizeProviderProfile(profileInput)
  return {
    ...(config || {}),
    _profile: profile,
  }
}

function addProvider({ appType, name, config }) {
  assertAppType(appType)
  ensureObject(config, 'Provider config')
  const normalizedConfig = sanitizeOfficialConfigIfNeeded(appType, config)

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
    configJson: JSON.stringify(normalizedConfig),
    createdAt: ts,
    updatedAt: ts,
  })

  if (
    appType === 'codex' &&
    normalizedConfig.auth &&
    typeof normalizedConfig.auth === 'object' &&
    !Array.isArray(normalizedConfig.auth)
  ) {
    writeCodexProviderAuthSnapshot(id, normalizedConfig.auth)
  }

  return getProviderById(id)
}

async function captureProviderFromLive({ appType, name, profile }) {
  assertAppType(appType)
  const adapter = getAdapter(appType)
  const liveConfig = await adapter.readLive()
  ensureObject(liveConfig, 'Live config')
  const capturedConfig = sanitizeOfficialProviderConfig(appType, liveConfig)
  const normalizedProfileInput = profile && typeof profile === 'object' ? { ...profile } : {}

  if (appType === 'codex') {
    const capturedAccountId = getCodexAccountIdFromConfig(capturedConfig)
    if (capturedAccountId) {
      normalizedProfileInput.accountId = capturedAccountId

      const existingOfficial = listProviders('codex').find((provider) => {
        const providerProfile = getProviderProfile(provider)
        if (providerProfile?.kind !== 'official') return false

        const providerAccountId =
          (typeof providerProfile.accountId === 'string' && providerProfile.accountId) ||
          getCodexAccountIdFromConfig(provider.config)

        return providerAccountId === capturedAccountId
      })

      if (existingOfficial) {
        delete normalizedProfileInput.accountId
        const emptyOfficialAuth = {
          OPENAI_API_KEY: null,
          auth_mode: 'chatgpt',
        }
        capturedConfig.auth = emptyOfficialAuth
      }
    }
  }

  const provider = addProvider({
    appType,
    name,
    config: attachProfile(capturedConfig, {
      ...normalizedProfileInput,
      kind: 'official',
    }),
  })

  return provider
}

function updateProvider({ id, name, config }) {
  const db = ensureDb()
  const existing = getProviderById(id)
  if (!existing) {
    throw new Error(`Provider not found: ${id}`)
  }

  if (config !== undefined) ensureObject(config, 'Provider config')
  const nextConfig =
    config === undefined ? existing.config : sanitizeOfficialConfigIfNeeded(existing.appType, config)

  db.prepare(
    `UPDATE providers
     SET name = @name,
         config_json = @configJson,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id,
    name: name?.trim() || existing.name,
    configJson: JSON.stringify(nextConfig),
    updatedAt: nowTs(),
  })

  if (
    existing.appType === 'codex' &&
    nextConfig &&
    typeof nextConfig === 'object' &&
    !Array.isArray(nextConfig) &&
    nextConfig.auth &&
    typeof nextConfig.auth === 'object' &&
    !Array.isArray(nextConfig.auth)
  ) {
    writeCodexProviderAuthSnapshot(existing.id, nextConfig.auth)
  }

  return getProviderById(id)
}

function deleteProvider(id) {
  const db = ensureDb()
  const existing = getProviderById(id)
  if (!existing) return false

  db.prepare(`DELETE FROM providers WHERE id = ?`).run(id)

  if (existing.appType === 'codex') {
    const snapshotDir = path.dirname(getCodexProviderAuthSnapshotPath(id))
    try {
      fs.rmSync(snapshotDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup failures.
    }
  }

  return true
}

function listUniversalProviders() {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT id, name, base_url, api_key, website_url, notes, apps_json, models_json, created_at, updated_at
       FROM universal_providers
       ORDER BY updated_at DESC, name ASC`
    )
    .all()

  return rows.map(parseUniversalProviderRow)
}

function getUniversalProviderById(id) {
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT id, name, base_url, api_key, website_url, notes, apps_json, models_json, created_at, updated_at
       FROM universal_providers
       WHERE id = ?`
    )
    .get(id)

  return parseUniversalProviderRow(row)
}

function addUniversalProvider(input) {
  const db = ensureDb()
  const ts = nowTs()
  const id = crypto.randomUUID()

  const name = input?.name?.trim()
  const baseUrl = input?.baseUrl?.trim()
  const apiKey = input?.apiKey?.trim()
  if (!name) throw new Error('Universal provider name is required')
  if (!baseUrl) throw new Error('Universal provider baseUrl is required')
  if (!apiKey) throw new Error('Universal provider apiKey is required')

  db.prepare(
    `INSERT INTO universal_providers
      (id, name, base_url, api_key, website_url, notes, apps_json, models_json, created_at, updated_at)
      VALUES (@id, @name, @baseUrl, @apiKey, @websiteUrl, @notes, @appsJson, @modelsJson, @createdAt, @updatedAt)`
  ).run({
    id,
    name,
    baseUrl,
    apiKey,
    websiteUrl: input.websiteUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    appsJson: JSON.stringify(normalizeUniversalApps(input.apps || {})),
    modelsJson: JSON.stringify(normalizeUniversalModels(input.models || {})),
    createdAt: ts,
    updatedAt: ts,
  })

  return getUniversalProviderById(id)
}

function updateUniversalProvider(input) {
  const existing = getUniversalProviderById(input?.id)
  if (!existing) {
    throw new Error(`Universal provider not found: ${input?.id}`)
  }

  const db = ensureDb()
  const next = {
    name: input.name?.trim() || existing.name,
    baseUrl: input.baseUrl?.trim() || existing.baseUrl,
    apiKey: input.apiKey?.trim() || existing.apiKey,
    websiteUrl:
      input.websiteUrl === undefined ? existing.websiteUrl : input.websiteUrl?.trim() || undefined,
    notes: input.notes === undefined ? existing.notes : input.notes?.trim() || undefined,
    apps: normalizeUniversalApps(input.apps ? { ...existing.apps, ...input.apps } : existing.apps),
    models: input.models ? normalizeUniversalModels(input.models) : existing.models,
  }

  db.prepare(
    `UPDATE universal_providers
     SET name = @name,
         base_url = @baseUrl,
         api_key = @apiKey,
         website_url = @websiteUrl,
         notes = @notes,
         apps_json = @appsJson,
         models_json = @modelsJson,
         updated_at = @updatedAt
     WHERE id = @id`
  ).run({
    id: existing.id,
    name: next.name,
    baseUrl: next.baseUrl,
    apiKey: next.apiKey,
    websiteUrl: next.websiteUrl || null,
    notes: next.notes || null,
    appsJson: JSON.stringify(next.apps),
    modelsJson: JSON.stringify(next.models),
    updatedAt: nowTs(),
  })

  return getUniversalProviderById(existing.id)
}

function deleteUniversalProvider(id) {
  const db = ensureDb()
  const existing = getUniversalProviderById(id)
  if (!existing) return false
  db.prepare(`DELETE FROM universal_providers WHERE id = ?`).run(id)
  return true
}

function getProviderProfile(provider) {
  if (!provider?.config || typeof provider.config !== 'object') return null
  const profile = provider.config._profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null
  return profile
}

function getCodexAccountIdFromConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined
  const auth = config.auth
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return undefined
  const tokens = auth.tokens
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return undefined
  return typeof tokens.account_id === 'string' ? tokens.account_id : undefined
}

function buildProviderConfigFromUniversal(universalProvider, appType) {
  const model = universalProvider?.models?.[appType]?.model
  const endpoint = universalProvider.baseUrl
  const profile = {
    kind: 'api',
    vendorKey: 'universal',
    universalId: universalProvider.id,
    endpoint,
    website: universalProvider.websiteUrl || undefined,
    model: model || undefined,
    note: universalProvider.notes || undefined,
  }

  if (appType === 'claude') {
    return attachProfile(
      {
        api_key: universalProvider.apiKey,
        model: model || 'claude-sonnet-4',
        api_base_url: endpoint,
      },
      profile
    )
  }

  if (appType === 'codex') {
    return attachProfile(
      {
        auth: {
          OPENAI_API_KEY: universalProvider.apiKey,
        },
        config: buildCodexConfigToml(universalProvider.name, endpoint, model || 'gpt-5.2'),
      },
      profile
    )
  }

  if (appType === 'gemini') {
    return attachProfile(
      {
        env: {
          GEMINI_API_KEY: universalProvider.apiKey,
        },
        settings: {
          model: model || 'gemini-2.5-pro',
          api_base_url: endpoint,
        },
      },
      profile
    )
  }

  throw new Error(`Unsupported app type: ${appType}`)
}

function applyUniversalProvider({ id }) {
  const universal = getUniversalProviderById(id)
  if (!universal) {
    throw new Error(`Universal provider not found: ${id}`)
  }

  const applied = []
  for (const appType of APP_TYPES) {
    if (!universal.apps[appType]) continue

    const existing = listProviders(appType).find((provider) => {
      const profile = getProviderProfile(provider)
      return profile?.universalId === universal.id
    })

    const config = buildProviderConfigFromUniversal(universal, appType)
    if (existing) {
      applied.push(
        updateProvider({
          id: existing.id,
          name: universal.name,
          config,
        })
      )
    } else {
      applied.push(
        addProvider({
          appType,
          name: universal.name,
          config,
        })
      )
    }
  }

  return applied
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
    if (appType === 'codex') {
      const liveAuth =
        liveBefore &&
        typeof liveBefore === 'object' &&
        !Array.isArray(liveBefore) &&
        liveBefore.auth &&
        typeof liveBefore.auth === 'object' &&
        !Array.isArray(liveBefore.auth)
          ? liveBefore.auth
          : null
      if (liveAuth) {
        writeCodexProviderAuthSnapshot(current.id, liveAuth)
      }
    }
    updateProviderConfig(current.id, preserveProviderProfile(liveBefore, current.config))
  }

  let targetConfigForSwitch = target.config
  if (appType === 'codex') {
    const snapshotAuth = await readCodexProviderAuthSnapshot(target.id)
    if (snapshotAuth) {
      targetConfigForSwitch = {
        ...(target.config || {}),
        auth: snapshotAuth,
      }
    }
  }

  const nextConfig = mergeLiveConfig(appType, liveBefore, targetConfigForSwitch)

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
  addUniversalProvider,
  applyUniversalProvider,
  captureProviderFromLive,
  deleteProvider,
  deleteUniversalProvider,
  ensureDb,
  getAdapter,
  getBackupById,
  getCurrentProvider,
  getDbPath,
  getLatestBackup,
  getProviderById,
  getUniversalProviderById,
  listProviders,
  listUniversalProviders,
  maskProvider,
  maskProviders,
  restoreBackup,
  switchProvider,
  updateProvider,
  updateUniversalProvider,
}
