import type { Skill } from '@/lib/skills-types'

export interface UnifiedSkillGroup {
  name: string
  description: string
  instances: Skill[]
}

export type AgentSkillScope = 'all' | 'global' | 'project'

export const SKILL_TAG_ALL = 'All'
export const SKILL_TAG_HUB = 'Hub'

export interface SkillFilterContext {
  currentView: string
  currentId: string | null
  agentScope: AgentSkillScope
}

export interface SkillFilterOptions extends SkillFilterContext {
  selectedTag: string
  searchQuery: string
}

export function groupSkillsByName(skills: Skill[]): UnifiedSkillGroup[] {
  const groups: Record<string, UnifiedSkillGroup> = {}

  for (const skill of skills) {
    if (!groups[skill.name]) {
      groups[skill.name] = {
        name: skill.name,
        description: skill.description,
        instances: [],
      }
    }

    if (skill.description && skill.description.length > groups[skill.name].description.length) {
      groups[skill.name].description = skill.description
    }

    groups[skill.name].instances.push(skill)
  }

  return Object.values(groups)
}

function instanceMatchesView(instance: Skill, context: SkillFilterContext): boolean {
  if (context.currentView === 'hub') {
    return instance.location === 'hub'
  }

  if (context.currentView === 'project') {
    if (!context.currentId) return false
    return instance.path.startsWith(context.currentId)
  }

  if (context.currentView === 'agent') {
    if (!context.currentId || instance.agentName !== context.currentId) {
      return false
    }

    if (context.agentScope === 'global') {
      return instance.location === 'agent'
    }
    if (context.agentScope === 'project') {
      return instance.location === 'project'
    }
    return true
  }

  // inventory-skills / all / unknown views
  return true
}

function instanceMatchesTag(instance: Skill, selectedTag: string): boolean {
  if (!selectedTag || selectedTag === SKILL_TAG_ALL) {
    return true
  }
  if (selectedTag === SKILL_TAG_HUB) {
    return instance.location === 'hub'
  }
  return instance.agentName === selectedTag
}

function groupMatchesSearch(group: UnifiedSkillGroup, searchQuery: string): boolean {
  const query = searchQuery.trim().toLowerCase()
  if (!query) {
    return true
  }
  return (
    group.name.toLowerCase().includes(query) || group.description.toLowerCase().includes(query)
  )
}

export function collectAvailableSkillTags(
  groups: UnifiedSkillGroup[],
  context: SkillFilterContext
): string[] {
  const hasHub = groups.some((group) =>
    group.instances.some((instance) => instance.location === 'hub' && instanceMatchesView(instance, context))
  )

  const agentNames = new Set<string>()
  for (const group of groups) {
    for (const instance of group.instances) {
      if (!instanceMatchesView(instance, context)) {
        continue
      }
      if (instance.agentName && instance.agentName.trim()) {
        agentNames.add(instance.agentName.trim())
      }
    }
  }

  const sortedAgents = Array.from(agentNames).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  )

  return hasHub ? [SKILL_TAG_HUB, ...sortedAgents] : sortedAgents
}

export function filterSkillGroups(
  groups: UnifiedSkillGroup[],
  options: SkillFilterOptions
): UnifiedSkillGroup[] {
  return groups.filter((group) => {
    if (!groupMatchesSearch(group, options.searchQuery)) {
      return false
    }

    return group.instances.some(
      (instance) =>
        instanceMatchesView(instance, options) && instanceMatchesTag(instance, options.selectedTag)
    )
  })
}
