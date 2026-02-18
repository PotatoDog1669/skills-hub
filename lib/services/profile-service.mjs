import crypto from 'crypto'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import simpleGit from 'simple-git'
import { getKitById } from '../core/kit-core.mjs'
import {
  APP_TYPES,
  applyUniversalProvider,
  getProviderById,
  getUniversalProviderById,
  switchProvider,
} from '../core/provider-core.mjs'
import { applyKit, normalizeKitMode } from './kit-service.mjs'

const PROFILE_STORE_PATH = path.join(os.homedir(), '.skills-hub', 'profiles.json')
const PROFILE_SCHEMA_VERSION = 1

function nowIso() {
  return new Date().toISOString()
}

function createProfileId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `profile-${crypto.randomBytes(8).toString('hex')}`
}

function toOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function expandHome(inputPath) {
  const normalized = String(inputPath || '').trim()
  if (!normalized) return ''
  if (normalized === '~' || normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    return path.join(os.homedir(), normalized.slice(1))
  }
  return normalized
}

function normalizeProfileName(value) {
  const name = String(value || '').trim()
  if (!name) {
    throw new Error('Profile name is required.')
  }
  return name
}

function normalizeProviderByApp(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = {}

  for (const appType of APP_TYPES) {
    const providerId = toOptionalText(source[appType])
    if (providerId) {
      normalized[appType] = providerId
    }
  }

  return normalized
}

function getEmptyStore() {
  return {
    version: PROFILE_SCHEMA_VERSION,
    defaultProfileId: undefined,
    profiles: [],
  }
}

function normalizeProfileRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const id = toOptionalText(value.id)
  const name = toOptionalText(value.name)
  const projectPath = toOptionalText(value.projectPath)
  if (!id || !name || !projectPath) {
    return null
  }

  const providerId = toOptionalText(value.providerId)
  const providerByApp = providerId ? undefined : normalizeProviderByApp(value.providerByApp)

  return {
    id,
    name,
    projectPath: path.resolve(projectPath),
    kitId: toOptionalText(value.kitId),
    providerId,
    providerByApp: providerByApp && Object.keys(providerByApp).length > 0 ? providerByApp : undefined,
    createdAt: toOptionalText(value.createdAt) || nowIso(),
    updatedAt: toOptionalText(value.updatedAt) || nowIso(),
  }
}

function normalizeStore(value) {
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const profilesRaw = Array.isArray(parsed.profiles) ? parsed.profiles : []
  const normalizedProfiles = []
  const seenIds = new Set()

  for (const profile of profilesRaw) {
    const normalized = normalizeProfileRecord(profile)
    if (!normalized) continue
    if (seenIds.has(normalized.id)) continue
    seenIds.add(normalized.id)
    normalizedProfiles.push(normalized)
  }

  const defaultProfileId = toOptionalText(parsed.defaultProfileId)

  return {
    version: PROFILE_SCHEMA_VERSION,
    defaultProfileId: defaultProfileId && seenIds.has(defaultProfileId) ? defaultProfileId : undefined,
    profiles: normalizedProfiles,
  }
}

async function readStore() {
  try {
    const raw = await fs.readFile(PROFILE_STORE_PATH, 'utf-8')
    if (!raw.trim()) return getEmptyStore()
    const parsed = JSON.parse(raw)
    return normalizeStore(parsed)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return getEmptyStore()
    }
    return getEmptyStore()
  }
}

async function writeStore(store) {
  const normalized = normalizeStore(store)
  const dirPath = path.dirname(PROFILE_STORE_PATH)
  await fs.ensureDir(dirPath)

  const tempPath = path.join(
    dirPath,
    `.${path.basename(PROFILE_STORE_PATH)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )

  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  await fs.move(tempPath, PROFILE_STORE_PATH, { overwrite: true })
  return normalized
}

function resolveProfileById(store, profileId) {
  const id = String(profileId || '').trim()
  if (!id) {
    throw new Error('Profile id is required.')
  }

  const profile = store.profiles.find((item) => item.id === id)
  if (!profile) {
    throw new Error(`Profile not found: ${id}`)
  }

  return profile
}

function getDefaultProfile(store) {
  if (!store.defaultProfileId) {
    return null
  }
  return store.profiles.find((item) => item.id === store.defaultProfileId) || null
}

function ensureProjectProfileUnique(store, projectPath, exceptId) {
  const conflict = store.profiles.find(
    (item) => item.projectPath === projectPath && (!exceptId || item.id !== exceptId)
  )
  if (conflict) {
    throw new Error(`Project already bound to profile: ${conflict.id}`)
  }
}

function ensureKitExists(kitId) {
  const normalized = toOptionalText(kitId)
  if (!normalized) return undefined
  if (!getKitById(normalized)) {
    throw new Error(`Kit not found: ${normalized}`)
  }
  return normalized
}

function validateUniversalProvider(providerId) {
  const normalized = toOptionalText(providerId)
  if (!normalized) return undefined
  if (!getUniversalProviderById(normalized)) {
    throw new Error(`Universal provider not found: ${normalized}`)
  }
  return normalized
}

function validateProviderByApp(providerByApp) {
  const normalized = normalizeProviderByApp(providerByApp)

  for (const appType of APP_TYPES) {
    const providerId = normalized[appType]
    if (!providerId) continue

    const provider = getProviderById(providerId)
    if (!provider) {
      throw new Error(`Provider not found for ${appType}: ${providerId}`)
    }
    if (provider.appType !== appType) {
      throw new Error(`Provider ${providerId} does not belong to app ${appType}`)
    }
  }

  return normalized
}

function buildProviderSelection(input) {
  const hasUniversal = Object.prototype.hasOwnProperty.call(input, 'providerId')
  const hasProviderByApp = Object.prototype.hasOwnProperty.call(input, 'providerByApp')

  if (!hasUniversal && !hasProviderByApp) {
    return null
  }

  const universalProviderId = hasUniversal ? validateUniversalProvider(input.providerId) : undefined
  const providerByApp = hasProviderByApp ? validateProviderByApp(input.providerByApp) : {}

  if (universalProviderId && Object.keys(providerByApp).length > 0) {
    throw new Error('Use either --provider-id or app-specific provider ids, not both.')
  }

  if (universalProviderId) {
    return {
      providerId: universalProviderId,
      providerByApp: undefined,
    }
  }

  return {
    providerId: undefined,
    providerByApp: Object.keys(providerByApp).length > 0 ? providerByApp : undefined,
  }
}

async function resolveProjectGitRoot(projectPath) {
  const expanded = expandHome(projectPath)
  const normalizedPath = path.resolve(expanded)

  if (!await fs.pathExists(normalizedPath)) {
    throw new Error(`Project path not found: ${normalizedPath}`)
  }

  const git = simpleGit(normalizedPath)

  try {
    const root = await git.revparse(['--show-toplevel'])
    const resolvedRoot = path.resolve(root.trim())
    if (!resolvedRoot) {
      throw new Error('missing git root')
    }
    return resolvedRoot
  } catch {
    throw new Error(`Project path is not inside a git repository: ${normalizedPath}`)
  }
}

function sortProfiles(profiles, defaultProfileId) {
  const sorted = [...profiles].sort((left, right) => {
    if (left.projectPath !== right.projectPath) {
      return left.projectPath.localeCompare(right.projectPath)
    }
    return left.name.localeCompare(right.name)
  })

  return sorted.map((profile) => ({
    ...profile,
    isDefault: profile.id === defaultProfileId,
  }))
}

async function listProfiles() {
  const store = await readStore()
  return {
    defaultProfileId: store.defaultProfileId,
    profiles: sortProfiles(store.profiles, store.defaultProfileId),
  }
}

async function addProfile(input) {
  const name = normalizeProfileName(input?.name)
  const projectPath = await resolveProjectGitRoot(input?.projectPath)
  const kitId = ensureKitExists(input?.kitId)
  const providerSelection = buildProviderSelection(input || {})
  const setDefault = input?.setDefault === true

  const store = await readStore()
  ensureProjectProfileUnique(store, projectPath)

  const profile = {
    id: createProfileId(),
    name,
    projectPath,
    kitId,
    providerId: providerSelection?.providerId,
    providerByApp: providerSelection?.providerByApp,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  store.profiles.push(profile)
  if (setDefault) {
    store.defaultProfileId = profile.id
  }

  const saved = await writeStore(store)
  const created = saved.profiles.find((item) => item.id === profile.id)
  return {
    ...created,
    isDefault: saved.defaultProfileId === profile.id,
  }
}

async function updateProfile(input) {
  const profileId = toOptionalText(input?.id)
  if (!profileId) {
    throw new Error('Profile id is required.')
  }

  const store = await readStore()
  const index = store.profiles.findIndex((item) => item.id === profileId)
  if (index < 0) {
    throw new Error(`Profile not found: ${profileId}`)
  }

  const current = store.profiles[index]

  const next = {
    ...current,
  }

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    next.name = normalizeProfileName(input.name)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'projectPath')) {
    const projectPath = await resolveProjectGitRoot(input.projectPath)
    ensureProjectProfileUnique(store, projectPath, profileId)
    next.projectPath = projectPath
  }

  if (Object.prototype.hasOwnProperty.call(input, 'kitId')) {
    next.kitId = ensureKitExists(input.kitId)
  }

  const providerSelection = buildProviderSelection(input || {})
  if (providerSelection) {
    next.providerId = providerSelection.providerId
    next.providerByApp = providerSelection.providerByApp
  }

  next.updatedAt = nowIso()
  store.profiles[index] = next

  if (input?.setDefault === true) {
    store.defaultProfileId = next.id
  }

  if (input?.unsetDefault === true && store.defaultProfileId === next.id) {
    store.defaultProfileId = undefined
  }

  const saved = await writeStore(store)
  const updated = saved.profiles.find((item) => item.id === next.id)
  return {
    ...updated,
    isDefault: saved.defaultProfileId === next.id,
  }
}

async function deleteProfile(profileId) {
  const normalizedId = toOptionalText(profileId)
  if (!normalizedId) {
    throw new Error('Profile id is required.')
  }

  const store = await readStore()
  const remaining = store.profiles.filter((item) => item.id !== normalizedId)
  if (remaining.length === store.profiles.length) {
    return false
  }

  store.profiles = remaining
  if (store.defaultProfileId === normalizedId) {
    store.defaultProfileId = undefined
  }

  await writeStore(store)
  return true
}

async function resolveProfileForApply(input) {
  const profileId = toOptionalText(input?.id)
  const projectPathArg = toOptionalText(input?.projectPath)

  if (profileId && projectPathArg) {
    throw new Error('Use either --id or --project, not both.')
  }

  if (!profileId && !projectPathArg) {
    throw new Error('profile apply requires --id or --project')
  }

  const store = await readStore()

  if (profileId) {
    const profile = resolveProfileById(store, profileId)
    return {
      profile,
      targetProjectPath: profile.projectPath,
      matchedBy: 'id',
      usedDefaultFallback: false,
    }
  }

  const projectPath = await resolveProjectGitRoot(projectPathArg)
  const projectProfile = store.profiles.find((item) => item.projectPath === projectPath)

  if (projectProfile) {
    return {
      profile: projectProfile,
      targetProjectPath: projectPath,
      matchedBy: 'project',
      usedDefaultFallback: false,
    }
  }

  const defaultProfile = getDefaultProfile(store)
  if (!defaultProfile) {
    throw new Error(`No profile found for project and no global default profile: ${projectPath}`)
  }

  return {
    profile: defaultProfile,
    targetProjectPath: projectPath,
    matchedBy: 'project',
    usedDefaultFallback: true,
  }
}

async function applyKitFromProfile(profile, input, projectPath) {
  if (!profile.kitId) {
    return {
      status: 'skipped',
      reason: 'Profile has no kit binding.',
    }
  }

  const agentName = toOptionalText(input?.agentName)
  if (!agentName) {
    throw new Error('profile apply requires --agent when profile has a kit binding')
  }

  const mode = normalizeKitMode(input?.mode)
  const overwriteAgentsMd = input?.overwriteAgentsMd === true

  const applied = await applyKit({
    kitId: profile.kitId,
    projectPath,
    agentName,
    mode,
    overwriteAgentsMd,
  })

  const successCount = applied.loadoutResults.filter((item) => item.status === 'success').length

  return {
    status: 'applied',
    kitId: profile.kitId,
    agentName,
    mode,
    policyPath: applied.policyPath,
    syncedSkills: successCount,
  }
}

async function applyProvidersFromProfile(profile) {
  if (profile.providerId) {
    const appliedProviders = applyUniversalProvider({ id: profile.providerId })
    const switched = []

    for (const provider of appliedProviders) {
      await switchProvider({
        appType: provider.appType,
        providerId: provider.id,
      })
      switched.push({
        appType: provider.appType,
        providerId: provider.id,
      })
    }

    return {
      status: switched.length > 0 ? 'applied' : 'skipped',
      strategy: 'universal',
      universalProviderId: profile.providerId,
      switched,
      skippedApps: APP_TYPES.filter((appType) => !switched.some((item) => item.appType === appType)),
      reason: switched.length > 0 ? undefined : 'Universal provider has no enabled apps.',
    }
  }

  const providerByApp = profile.providerByApp || {}
  const entries = APP_TYPES
    .map((appType) => ({ appType, providerId: providerByApp[appType] }))
    .filter((item) => item.providerId)

  if (entries.length === 0) {
    return {
      status: 'skipped',
      strategy: 'none',
      switched: [],
      skippedApps: [...APP_TYPES],
      reason: 'Profile has no provider binding.',
    }
  }

  const switched = []
  for (const entry of entries) {
    await switchProvider({
      appType: entry.appType,
      providerId: entry.providerId,
    })
    switched.push({
      appType: entry.appType,
      providerId: entry.providerId,
    })
  }

  return {
    status: 'applied',
    strategy: 'per-app',
    switched,
    skippedApps: APP_TYPES.filter((appType) => !entries.some((item) => item.appType === appType)),
  }
}

async function applyProfile(input) {
  const resolved = await resolveProfileForApply(input || {})

  const kit = await applyKitFromProfile(resolved.profile, input || {}, resolved.targetProjectPath)
  const provider = await applyProvidersFromProfile(resolved.profile)

  return {
    profile: {
      id: resolved.profile.id,
      name: resolved.profile.name,
      projectPath: resolved.profile.projectPath,
      isDefault: resolved.profile.id === (await readStore()).defaultProfileId,
    },
    targetProjectPath: resolved.targetProjectPath,
    matchedBy: resolved.matchedBy,
    usedDefaultFallback: resolved.usedDefaultFallback,
    kit,
    provider,
  }
}

function getProfilesStorePath() {
  return PROFILE_STORE_PATH
}

export {
  addProfile,
  applyProfile,
  deleteProfile,
  getProfilesStorePath,
  listProfiles,
  resolveProjectGitRoot,
  updateProfile,
}
