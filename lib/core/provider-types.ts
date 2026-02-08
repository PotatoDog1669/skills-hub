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

export interface SwitchResult {
  appType: AppType
  currentProviderId: string
  backupId: number
  switchedFrom: string | null
  switchedTo: string
}
