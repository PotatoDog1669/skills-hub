export interface ScanForProjectsOptions {
  force?: boolean
  cacheFilePath?: string
}

export interface ProjectScanDirectoryCacheEntry {
  mtimeMs: number
  repos: string[]
}

export interface ProjectScanRootCacheEntry {
  updatedAt: string
  directories: Record<string, ProjectScanDirectoryCacheEntry>
}

export interface ProjectScanCacheFile {
  version: number
  roots: Record<string, ProjectScanRootCacheEntry>
}

export function getProjectScanCachePath(): string
export function scanForProjects(roots: string[], options?: ScanForProjectsOptions): Promise<string[]>
