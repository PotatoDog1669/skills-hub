export type DiagnoseTargetKind = 'hub' | 'project' | 'agent'
export type DiagnoseReasonCode =
  | 'missing_bin'
  | 'missing_any_bin'
  | 'missing_env'
  | 'missing_config'
  | 'invalid_frontmatter'

export interface DiagnoseTargetInput {
  kind: DiagnoseTargetKind
  path: string
  label?: string
}

export interface DiagnoseReason {
  code: DiagnoseReasonCode
  message: string
  suggestion: string
  item?: string
  items?: string[]
}

export interface SkillRequirements {
  bins: string[]
  anyBins: string[]
  env: string[]
  config: string[]
}

export interface DiagnosedSkill {
  name: string
  path: string
  skillMdPath: string
  source: DiagnoseTargetKind
  sourcePath: string
  sourceLabel?: string
  ready: boolean
  reasons: DiagnoseReason[]
  requirements: SkillRequirements
}

export interface DiagnoseTargetSummary {
  kind: DiagnoseTargetKind
  path: string
  label?: string
  exists: boolean
  skillCount: number
}

export interface DiagnoseSummary {
  totalSkills: number
  readySkills: number
  notReadySkills: number
  totalReasons: number
}

export interface DiagnoseReport {
  generatedAt: string
  targets: DiagnoseTargetSummary[]
  summary: DiagnoseSummary
  skills: DiagnosedSkill[]
}

export const REASON_CODE_MISSING_BIN: 'missing_bin'
export const REASON_CODE_MISSING_ANY_BIN: 'missing_any_bin'
export const REASON_CODE_MISSING_ENV: 'missing_env'
export const REASON_CODE_MISSING_CONFIG: 'missing_config'
export const REASON_CODE_INVALID_FRONTMATTER: 'invalid_frontmatter'

export function diagnoseSkills(values: {
  targets: DiagnoseTargetInput[]
  config?: Record<string, unknown>
  env?: NodeJS.ProcessEnv
}): Promise<DiagnoseReport>
