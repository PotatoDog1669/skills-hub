export type KitSyncMode = 'copy' | 'link'

export interface KitLoadoutItem {
  skillPath: string
  mode: KitSyncMode
  sortOrder: number
}

export interface KitLoadoutRecord {
  id: string
  name: string
  description?: string
  items: KitLoadoutItem[]
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

export interface KitRecord {
  id: string
  name: string
  description?: string
  policyId: string
  loadoutId: string
  lastAppliedAt?: number
  lastAppliedTarget?: {
    projectPath: string
    agentName: string
  }
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
  policyPath: string
  projectPath: string
  agentName: string
  appliedAt: number
  overwroteAgentsMd?: boolean
  loadoutResults: KitApplySkillResult[]
}
