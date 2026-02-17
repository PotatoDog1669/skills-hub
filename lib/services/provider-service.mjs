import {
  APP_TYPES,
  addProvider,
  addUniversalProvider,
  applyUniversalProvider,
  captureProviderFromLive,
  deleteProvider,
  deleteUniversalProvider,
  getCurrentProvider,
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
} from '../core/provider-core.mjs'

function assertAppType(appType) {
  if (!APP_TYPES.includes(appType)) {
    throw new Error(`Unsupported app type: ${appType}`)
  }
}

function normalizeProviderConfig(config) {
  if (typeof config === 'string') {
    const parsed = JSON.parse(config)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Provider config must be a JSON object.')
    }
    return parsed
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Provider config must be an object.')
  }

  return config
}

function maskUniversalProvider(provider) {
  return {
    ...provider,
    apiKey: provider.apiKey.trim() ? `${provider.apiKey.slice(0, 3)}****` : '',
  }
}

function listProvidersMasked(appType) {
  if (appType) assertAppType(appType)
  const providers = listProviders(appType)
  return maskProviders(providers)
}

function getCurrentProviderMasked(appType) {
  assertAppType(appType)
  return maskProvider(getCurrentProvider(appType))
}

function getProviderRaw(id) {
  const provider = getProviderById(id)
  if (!provider) {
    throw new Error(`Provider not found: ${id}`)
  }
  return provider
}

function addProviderRecord(values) {
  assertAppType(values.appType)
  return maskProvider(
    addProvider({
      appType: values.appType,
      name: values.name,
      config: normalizeProviderConfig(values.config),
    })
  )
}

function updateProviderRecord(values) {
  return maskProvider(
    updateProvider({
      id: values.id,
      name: values.name,
      config: values.config === undefined ? undefined : normalizeProviderConfig(values.config),
    })
  )
}

function deleteProviderRecord(id) {
  return deleteProvider(id)
}

async function switchProviderRecord(values) {
  assertAppType(values.appType)
  return switchProvider({
    appType: values.appType,
    providerId: values.providerId,
  })
}

function getLatestProviderBackup(appType) {
  assertAppType(appType)
  return getLatestBackup(appType)
}

async function restoreLatestProviderBackup(appType) {
  assertAppType(appType)
  return restoreBackup(appType)
}

async function captureProviderFromLiveRecord(values) {
  assertAppType(values.appType)
  return maskProvider(
    await captureProviderFromLive({
      appType: values.appType,
      name: values.name,
      profile: values.profile,
    })
  )
}

function listUniversalProvidersMasked() {
  const providers = listUniversalProviders()
  return providers.map(maskUniversalProvider)
}

function getUniversalProviderRaw(id) {
  const provider = getUniversalProviderById(id)
  if (!provider) {
    throw new Error(`Universal provider not found: ${id}`)
  }
  return provider
}

function addUniversalProviderRecord(values) {
  const provider = addUniversalProvider(values)
  if (!provider) {
    throw new Error('Failed to create universal provider')
  }
  return maskUniversalProvider(provider)
}

function updateUniversalProviderRecord(values) {
  const provider = updateUniversalProvider(values)
  if (!provider) {
    throw new Error('Failed to update universal provider')
  }
  return maskUniversalProvider(provider)
}

function deleteUniversalProviderRecord(id) {
  return deleteUniversalProvider(id)
}

function applyUniversalProviderRecord(id) {
  const applied = applyUniversalProvider({ id })
  return maskProviders(applied)
}

export {
  APP_TYPES,
  assertAppType,
  normalizeProviderConfig,
  listProvidersMasked,
  getCurrentProviderMasked,
  getProviderRaw,
  addProviderRecord,
  updateProviderRecord,
  deleteProviderRecord,
  switchProviderRecord,
  getLatestProviderBackup,
  restoreLatestProviderBackup,
  captureProviderFromLiveRecord,
  listUniversalProvidersMasked,
  getUniversalProviderRaw,
  addUniversalProviderRecord,
  updateUniversalProviderRecord,
  deleteUniversalProviderRecord,
  applyUniversalProviderRecord,
}
