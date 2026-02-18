export type SyncMode = 'copy' | 'link'
export type SyncChangeType = 'add' | 'update' | 'delete' | 'link'

export interface SyncChange {
  type: SyncChangeType
  src: string
  dest: string
  reason: string
}

export interface SkillSyncPlan {
  sourcePath: string
  destination: string
  mode: SyncMode
  changes: SyncChange[]
}

export function normalizeSyncMode(mode: unknown): SyncMode
export function previewSkillSync(input: {
  sourcePath: string
  destParentPath: string
  mode?: SyncMode
}): Promise<SkillSyncPlan>
export function syncSkill(input: {
  sourcePath: string
  destParentPath: string
  mode?: SyncMode
}): Promise<SkillSyncPlan>
export function summarizeSyncChanges(changes: SyncChange[]): {
  total: number
  add: number
  update: number
  delete: number
  link: number
}
