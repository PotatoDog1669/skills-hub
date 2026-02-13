import type { KitLoadoutRecord, KitPolicyRecord, KitRecord } from './kit-types'

export function ensureDb(): unknown
export function getDbPath(): string

export function listKitPolicies(): KitPolicyRecord[]
export function getKitPolicyById(id: string): KitPolicyRecord | null
export function addKitPolicy(input: {
  name: string
  description?: string
  content: string
}): KitPolicyRecord
export function updateKitPolicy(input: {
  id: string
  name?: string
  description?: string
  content?: string
}): KitPolicyRecord
export function deleteKitPolicy(id: string): boolean

export function listKitLoadouts(): KitLoadoutRecord[]
export function getKitLoadoutById(id: string): KitLoadoutRecord | null
export function addKitLoadout(input: {
  name: string
  description?: string
  items: Array<{ skillPath: string; mode?: 'copy' | 'link'; sortOrder?: number }>
}): KitLoadoutRecord
export function updateKitLoadout(input: {
  id: string
  name?: string
  description?: string
  items?: Array<{ skillPath: string; mode?: 'copy' | 'link'; sortOrder?: number }>
}): KitLoadoutRecord
export function deleteKitLoadout(id: string): boolean

export function listKits(): KitRecord[]
export function getKitById(id: string): KitRecord | null
export function addKit(input: {
  name: string
  description?: string
  policyId: string
  loadoutId: string
}): KitRecord
export function updateKit(input: {
  id: string
  name?: string
  description?: string
  policyId?: string
  loadoutId?: string
}): KitRecord
export function deleteKit(id: string): boolean
export function markKitApplied(input: {
  id: string
  projectPath: string
  agentName: string
}): KitRecord
