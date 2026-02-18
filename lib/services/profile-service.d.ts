export type ProviderAppType = 'claude' | 'codex' | 'gemini'

export interface ProjectProfileRecord {
  id: string
  name: string
  projectPath: string
  kitId?: string
  providerId?: string
  providerByApp?: Partial<Record<ProviderAppType, string>>
  createdAt: string
  updatedAt: string
  isDefault?: boolean
}

export interface ProjectProfileListResult {
  defaultProfileId?: string
  profiles: ProjectProfileRecord[]
}

export interface AddProjectProfileInput {
  name: string
  projectPath: string
  kitId?: string
  providerId?: string
  providerByApp?: Partial<Record<ProviderAppType, string>>
  setDefault?: boolean
}

export interface UpdateProjectProfileInput {
  id: string
  name?: string
  projectPath?: string
  kitId?: string
  providerId?: string
  providerByApp?: Partial<Record<ProviderAppType, string>>
  setDefault?: boolean
  unsetDefault?: boolean
}

export interface ApplyProjectProfileInput {
  id?: string
  projectPath?: string
  agentName?: string
  mode?: 'copy' | 'link'
  overwriteAgentsMd?: boolean
}

export interface ApplyProjectProfileResult {
  profile: {
    id: string
    name: string
    projectPath: string
    isDefault: boolean
  }
  targetProjectPath: string
  matchedBy: 'id' | 'project'
  usedDefaultFallback: boolean
  kit:
    | {
        status: 'skipped'
        reason: string
      }
    | {
        status: 'applied'
        kitId: string
        agentName: string
        mode: 'copy' | 'link'
        policyPath: string
        syncedSkills: number
      }
  provider: {
    status: 'applied' | 'skipped'
    strategy: 'none' | 'universal' | 'per-app'
    switched: Array<{
      appType: ProviderAppType
      providerId: string
    }>
    skippedApps: ProviderAppType[]
    universalProviderId?: string
    reason?: string
  }
}

export function getProfilesStorePath(): string
export function resolveProjectGitRoot(projectPath: string): Promise<string>
export function listProfiles(): Promise<ProjectProfileListResult>
export function addProfile(input: AddProjectProfileInput): Promise<ProjectProfileRecord>
export function updateProfile(input: UpdateProjectProfileInput): Promise<ProjectProfileRecord>
export function deleteProfile(profileId: string): Promise<boolean>
export function applyProfile(input: ApplyProjectProfileInput): Promise<ApplyProjectProfileResult>
