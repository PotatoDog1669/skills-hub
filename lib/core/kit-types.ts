export type KitSyncMode = 'copy' | 'link'

export interface KitLoadoutItem {
  skillPath: string
  mode: KitSyncMode
  sortOrder: number
}

export interface KitLoadoutImportSource {
  repoWebUrl: string
  repoUrl: string
  originalUrl: string
  branch?: string
  rootSubdir: string
  importedAt: string
  lastSourceUpdatedAt: string
  lastSafetyCheck?: KitSafetyCheck
}

export interface KitLoadoutRecord {
  id: string
  name: string
  description?: string
  items: KitLoadoutItem[]
  importSource?: KitLoadoutImportSource
  createdAt: number
  updatedAt: number
}

export interface KitPolicyRecord {
  id: string
  name: string
  description?: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface KitSafetyCheck {
  checkedAt: number
  status: 'pass' | 'warn'
  scannedFiles: number
  warnings: string[]
  flaggedFiles: string[]
}

export interface ManagedKitPolicyBaseline {
  id: string
  name: string
  description?: string
  content: string
}

export interface ManagedKitLoadoutBaseline {
  id: string
  name: string
  description?: string
  items: KitLoadoutItem[]
}

export interface ManagedKitSecurityCheck {
  sourceId: string
  sourceName: string
  check: KitSafetyCheck
}

export interface ManagedKitSource {
  kind: 'official_preset'
  presetId: string
  presetName: string
  catalogVersion: number
  installedAt: number
  lastRestoredAt?: number
  restoreCount: number
  baseline: {
    name: string
    description?: string
    policy: ManagedKitPolicyBaseline
    loadout: ManagedKitLoadoutBaseline
  }
  securityChecks: ManagedKitSecurityCheck[]
}

export interface KitRecord {
  id: string
  name: string
  description?: string
  policyId?: string
  loadoutId?: string
  lastAppliedAt?: number
  lastAppliedTarget?: {
    projectPath: string
    agentName: string
  }
  managedSource?: ManagedKitSource
  createdAt: number
  updatedAt: number
}

export interface KitApplySkillResult {
  skillPath: string
  mode: KitSyncMode
  destination: string
  status: 'success' | 'failed'
  error?: string
}

export interface KitApplyResult {
  kitId: string
  kitName: string
  policyPath?: string
  policyFileName?: string
  projectPath: string
  agentName: string
  appliedAt: number
  overwroteAgentsMd?: boolean
  loadoutResults: KitApplySkillResult[]
}

export interface KitLoadoutImportResult {
  loadout: KitLoadoutRecord
  loadoutStatus: 'created' | 'updated'
  importedSkillPaths: string[]
  overwrittenCount: number
  removedCount: number
  discoveredCount: number
  source: KitLoadoutImportSource
}

export interface OfficialPresetSummary {
  id: string
  name: string
  description?: string
  policyName: string
  sourceCount: number
  skillCount: number
}

export interface OfficialPresetSource {
  id: string
  name: string
  url: string
  description?: string
  selectedSkillDetails?: Array<{
    name: string
    description?: string
  }>
  selectedSkills: string[]
}

export interface OfficialPresetDetail {
  id: string
  name: string
  description?: string
  policy: {
    name: string
    description?: string
    template: string
  }
  sources: OfficialPresetSource[]
  skillCount: number
}

export interface OfficialPresetInstallResult {
  preset: {
    id: string
    name: string
    description?: string
  }
  policy: KitPolicyRecord
  loadout: KitLoadoutRecord
  kit: KitRecord
  importedSources: Array<{
    id: string
    name: string
    loadoutId: string
    importedSkillCount: number
    selectedSkillCount: number
  }>
}

export interface OfficialPresetBatchInstallResult {
  installed: OfficialPresetInstallResult[]
}
