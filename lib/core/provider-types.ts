export const APP_TYPES = ['claude', 'codex', 'gemini'] as const

export type AppType = (typeof APP_TYPES)[number]

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
  accountId?: string
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
