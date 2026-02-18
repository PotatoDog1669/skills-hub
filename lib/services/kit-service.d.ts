import type {
  KitApplyResult,
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  KitSyncMode,
} from '../core/kit-types'
import type { SyncChange } from './sync-service'

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

export function listKits(): KitRecord[]
export function addKit(values: {
  name: string
  description?: string
  policyId: string
  loadoutId: string
}): KitRecord
export function updateKit(values: {
  id: string
  name?: string
  description?: string
  policyId?: string
  loadoutId?: string
}): KitRecord
export function deleteKit(id: string): boolean

export interface KitApplyDryRunPreview {
  action: 'kit-apply'
  dryRun: true
  kitId: string
  kitName: string
  projectPath: string
  agentName: string
  mode: KitSyncMode
  changes: SyncChange[]
  summary: {
    total: number
    add: number
    update: number
    delete: number
    link: number
  }
  warnings: string[]
}

export function previewKitApply(values: {
  kitId: string
  projectPath: string
  agentName: string
  mode?: KitSyncMode
  overwriteAgentsMd?: boolean
}): Promise<KitApplyDryRunPreview>

export function applyKit(values: {
  kitId: string
  projectPath: string
  agentName: string
  mode?: KitSyncMode
  overwriteAgentsMd?: boolean
}): Promise<KitApplyResult>
