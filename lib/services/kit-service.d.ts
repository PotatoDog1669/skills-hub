import type {
  ManagedKitSource,
  OfficialPresetBatchInstallResult,
  KitApplyResult,
  KitLoadoutImportResult,
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  KitSyncMode,
} from '../core/kit-types'

export function normalizeKitMode(value: unknown): KitSyncMode
export function normalizeLoadoutItems(items: unknown): Array<{
  skillPath: string
  mode: KitSyncMode
  sortOrder: number
}>

export function listKitPolicies(): KitPolicyRecord[]
export function addKitPolicy(values: {
  name: string
  description?: string
  content: string
}): KitPolicyRecord
export function updateKitPolicy(values: {
  id: string
  name?: string
  description?: string
  content?: string
}): KitPolicyRecord
export function deleteKitPolicy(id: string): boolean

export function listKitLoadouts(): KitLoadoutRecord[]
export function addKitLoadout(values: {
  name: string
  description?: string
  items: Array<{ skillPath: string; mode?: KitSyncMode; sortOrder?: number }>
}): KitLoadoutRecord
export function updateKitLoadout(values: {
  id: string
  name?: string
  description?: string
  items?: Array<{ skillPath: string; mode?: KitSyncMode; sortOrder?: number }>
}): KitLoadoutRecord
export function deleteKitLoadout(id: string): boolean
export function importKitLoadoutFromRepo(values: {
  url: string
  name?: string
  description?: string
  overwrite?: boolean
  skillNames?: string[]
}): Promise<KitLoadoutImportResult>

export function listOfficialPresets(): Promise<
  Array<{
    id: string
    name: string
    description?: string
    policyName: string
    sourceCount: number
    skillCount: number
  }>
>
export function searchOfficialPresets(values: {
  query?: string
}): Promise<
  Array<{
    id: string
    name: string
    description?: string
    policyName: string
    sourceCount: number
    skillCount: number
  }>
>
export function getOfficialPreset(values: {
  id: string
}): Promise<{
  id: string
  name: string
  description?: string
  policy: {
    name: string
    description?: string
    template: string
  }
  sources: Array<{
    id: string
    name: string
    url: string
    description?: string
    selectedSkillDetails?: Array<{
      name: string
      description?: string
    }>
    selectedSkills: string[]
  }>
  skillCount: number
}>
export function installOfficialPreset(values: {
  id: string
  overwrite?: boolean
}): Promise<{
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
}>
export function installAllOfficialPresets(values?: {
  overwrite?: boolean
}): Promise<OfficialPresetBatchInstallResult>
export function ensureManagedOfficialPresetsInstalled(values?: {
  overwrite?: boolean
}): Promise<OfficialPresetBatchInstallResult>

export function listKits(): KitRecord[]
export function addKit(values: {
  name: string
  description?: string
  policyId?: string
  loadoutId?: string
  managedSource?: ManagedKitSource
}): KitRecord
export function updateKit(values: {
  id: string
  name?: string
  description?: string
  policyId?: string
  loadoutId?: string
  managedSource?: ManagedKitSource | null
}): KitRecord
export function deleteKit(id: string): boolean
export function restoreManagedKitBaseline(id: string): KitRecord

export function applyKit(values: {
  kitId: string
  projectPath: string
  agentName: string
  mode?: KitSyncMode
  overwriteAgentsMd?: boolean
  includeSkills?: string[]
  excludeSkills?: string[]
}): Promise<KitApplyResult>
