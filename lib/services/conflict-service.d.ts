export type ConflictSourceType = 'hub' | 'agent' | 'project'
export type SkillConflictType = 'duplicate_plugin_id' | 'duplicate_skill_name'

export interface ConflictSkillItem {
  path: string
  skillName: string
  pluginId: string
  sourceType: ConflictSourceType
  sourceLabel: string
  agentName?: string
  projectPath?: string
  projectName?: string
}

export interface SkillConflict {
  type: SkillConflictType
  key: string
  items: ConflictSkillItem[]
  resolution: string
}

export interface SkillConflictReport {
  scannedAt: string
  itemCount: number
  conflictCount: number
  conflicts: SkillConflict[]
}

export function discoverSkillsForConflictCheck(config: {
  hubPath: string
  projects?: string[]
  agents?: Array<{
    name: string
    globalPath: string
    projectPath: string
    enabled: boolean
  }>
}): Promise<ConflictSkillItem[]>

export function detectSkillConflicts(skillItems: ConflictSkillItem[]): SkillConflict[]

export function collectSkillConflicts(config: {
  hubPath: string
  projects?: string[]
  agents?: Array<{
    name: string
    globalPath: string
    projectPath: string
    enabled: boolean
  }>
}): Promise<SkillConflictReport>
