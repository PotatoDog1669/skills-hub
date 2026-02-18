export type SnapshotOperation = 'sync' | 'kit-apply'
export type SnapshotMode = 'copy' | 'link'
export type SnapshotEntryKind = 'missing' | 'directory' | 'file' | 'symlink' | 'other'

export interface SnapshotEntry {
  path: string
  kind: SnapshotEntryKind
  archivePath?: string
}

export interface SnapshotMetadata {
  version: number
  id: string
  createdAt: string
  operation: SnapshotOperation
  target: string
  mode: SnapshotMode
  affectedPaths: string[]
  entries: SnapshotEntry[]
}

export interface SnapshotCreateResult extends SnapshotMetadata {
  retention: number
  prunedSnapshotIds: string[]
}

export interface SnapshotRollbackResult {
  id: string
  createdAt: string | null
  operation: string
  target: string
  mode: SnapshotMode
  totalPaths: number
  restoredPaths: number
  removedPaths: number
}

export const DEFAULT_SNAPSHOT_RETENTION: number
export const SNAPSHOT_RETENTION_ENV_KEY: 'SKILLS_HUB_SNAPSHOT_RETENTION'

export function normalizeSnapshotMode(mode: unknown): SnapshotMode
export function normalizeSnapshotOperation(operation: unknown): SnapshotOperation
export function resolveSnapshotRetention(configValue?: unknown): number
export function getSnapshotStorePath(): string
export function listSnapshots(): Promise<SnapshotMetadata[]>
export function getSnapshotById(snapshotId: string): Promise<SnapshotMetadata>
export function getLatestSnapshot(): Promise<SnapshotMetadata | null>
export function pruneSnapshots(retentionLimit: number): Promise<{ removed: string[] }>
export function createSnapshot(values: {
  operation: SnapshotOperation
  target: string
  mode?: SnapshotMode
  affectedPaths: string[]
  retention?: number
}): Promise<SnapshotCreateResult>
export function rollbackSnapshot(values: { id: string }): Promise<SnapshotRollbackResult>
