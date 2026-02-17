import type {
  AppType,
  ProviderRecord,
  ProviderSwitchResult,
  UniversalProviderApps,
  UniversalProviderModels,
  UniversalProviderRecord,
} from '../core/provider-types'

export const APP_TYPES: AppType[]

export function assertAppType(appType: string): asserts appType is AppType
export function normalizeProviderConfig(config: unknown): Record<string, unknown>

export function listProvidersMasked(appType?: string): ProviderRecord[]
export function getCurrentProviderMasked(appType: string): ProviderRecord | null
export function getProviderRaw(id: string): ProviderRecord
export function addProviderRecord(values: {
  appType: string
  name: string
  config: unknown
}): ProviderRecord
export function updateProviderRecord(values: {
  id: string
  name?: string
  config?: unknown
}): ProviderRecord
export function deleteProviderRecord(id: string): boolean
export function switchProviderRecord(values: {
  appType: string
  providerId: string
}): Promise<ProviderSwitchResult>
export function getLatestProviderBackup(appType: string): unknown
export function restoreLatestProviderBackup(appType: string): Promise<unknown>
export function captureProviderFromLiveRecord(values: {
  appType: string
  name: string
  profile?: Record<string, unknown>
}): Promise<ProviderRecord>

export function listUniversalProvidersMasked(): UniversalProviderRecord[]
export function getUniversalProviderRaw(id: string): UniversalProviderRecord
export function addUniversalProviderRecord(values: {
  name: string
  baseUrl: string
  apiKey: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}): UniversalProviderRecord
export function updateUniversalProviderRecord(values: {
  id: string
  name?: string
  baseUrl?: string
  apiKey?: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}): UniversalProviderRecord
export function deleteUniversalProviderRecord(id: string): boolean
export function applyUniversalProviderRecord(id: string): ProviderRecord[]
