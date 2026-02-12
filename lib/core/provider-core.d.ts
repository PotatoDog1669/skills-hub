export type AppType = 'claude' | 'codex' | 'gemini'

export interface ProviderRecord {
  id: string
  appType: AppType
  name: string
  config: Record<string, unknown>
  isCurrent: boolean
  createdAt: number
  updatedAt: number
}

export interface ProviderProfile {
  kind?: 'api' | 'official'
  vendorKey?: string
  universalId?: string
  accountName?: string
  endpoint?: string
  website?: string
  model?: string
  note?: string
}

export interface UniversalProviderApps {
  claude: boolean
  codex: boolean
  gemini: boolean
}

export interface UniversalProviderModels {
  claude?: {
    model?: string
  }
  codex?: {
    model?: string
  }
  gemini?: {
    model?: string
  }
}

export interface UniversalProviderRecord {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  websiteUrl?: string
  notes?: string
  apps: UniversalProviderApps
  models: UniversalProviderModels
  createdAt: number
  updatedAt: number
}

export interface SwitchResult {
  appType: AppType
  currentProviderId: string
  backupId: number
  switchedFrom: string | null
  switchedTo: string
}

export const APP_TYPES: AppType[]

export function ensureDb(): unknown
export function getDbPath(): string

export function listProviders(appType?: AppType): ProviderRecord[]
export function getProviderById(id: string): ProviderRecord | null
export function getCurrentProvider(appType: AppType): ProviderRecord | null

export function addProvider(input: {
  appType: AppType
  name: string
  config: Record<string, unknown>
}): ProviderRecord

export function captureProviderFromLive(input: {
  appType: AppType
  name: string
  profile?: ProviderProfile
}): Promise<ProviderRecord>

export function updateProvider(input: {
  id: string
  name?: string
  config?: Record<string, unknown>
}): ProviderRecord

export function deleteProvider(id: string): boolean

export function switchProvider(input: {
  appType: AppType
  providerId: string
}): Promise<SwitchResult>

export function getLatestBackup(appType: AppType): {
  id: number
  appType: AppType
  backup: Record<string, unknown>
  createdAt: number
} | null

export function restoreBackup(
  appType: AppType,
  backupId?: number
): Promise<{ id: number; appType: AppType; backup: Record<string, unknown>; createdAt: number }>

export function maskProvider(provider: ProviderRecord | null): ProviderRecord | null
export function maskProviders(providers: ProviderRecord[]): ProviderRecord[]

export function listUniversalProviders(): UniversalProviderRecord[]
export function getUniversalProviderById(id: string): UniversalProviderRecord | null
export function addUniversalProvider(input: {
  name: string
  baseUrl: string
  apiKey: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}): UniversalProviderRecord
export function updateUniversalProvider(input: {
  id: string
  name?: string
  baseUrl?: string
  apiKey?: string
  websiteUrl?: string
  notes?: string
  apps?: Partial<UniversalProviderApps>
  models?: UniversalProviderModels
}): UniversalProviderRecord
export function deleteUniversalProvider(id: string): boolean
export function applyUniversalProvider(input: { id: string }): ProviderRecord[]
