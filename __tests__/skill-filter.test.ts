import { describe, expect, it } from 'vitest'
import type { Skill } from '@/lib/skills-types'
import {
  SKILL_TAG_ALL,
  SKILL_TAG_HUB,
  collectAvailableSkillTags,
  filterSkillGroups,
  groupSkillsByName,
  type SkillFilterContext,
} from '@/lib/core/skill-filter'

const sampleSkills: Skill[] = [
  {
    id: 'hub-agent-browser',
    name: 'agent-browser',
    description: 'Browser automation CLI for agents',
    path: '/Users/leo/skills-hub/agent-browser',
    location: 'hub',
  },
  {
    id: 'codex-global-agent-browser',
    name: 'agent-browser',
    description: 'Browser automation CLI for agents',
    path: '/Users/leo/.codex/skills/agent-browser',
    location: 'agent',
    agentName: 'Codex',
  },
  {
    id: 'repo-a-codex-agent-browser',
    name: 'agent-browser',
    description: 'Browser automation CLI for agents',
    path: '/workspace/repo-a/.codex/skills/agent-browser',
    location: 'project',
    agentName: 'Codex',
    projectName: 'repo-a',
  },
  {
    id: 'hub-skill-installer',
    name: 'skill-installer',
    description: 'Install and manage skills',
    path: '/Users/leo/skills-hub/skill-installer',
    location: 'hub',
  },
  {
    id: 'cursor-global-skill-installer',
    name: 'skill-installer',
    description: 'Install and manage skills',
    path: '/Users/leo/.cursor/skills/skill-installer',
    location: 'agent',
    agentName: 'Cursor',
  },
  {
    id: 'repo-b-codex-deploy-helper',
    name: 'deploy-helper',
    description: 'Deploy workflow helper',
    path: '/workspace/repo-b/.codex/skills/deploy-helper',
    location: 'project',
    agentName: 'Codex',
    projectName: 'repo-b',
  },
  {
    id: 'codex-global-docs-tool',
    name: 'docs-tool',
    description: 'Documentation helper',
    path: '/Users/leo/.codex/skills/docs-tool',
    location: 'agent',
    agentName: 'Codex',
  },
  {
    id: 'repo-a-cursor-docs-tool',
    name: 'docs-tool',
    description: 'Documentation helper',
    path: '/workspace/repo-a/.cursor/skills/docs-tool',
    location: 'project',
    agentName: 'Cursor',
    projectName: 'repo-a',
  },
]

const allGroups = groupSkillsByName(sampleSkills)

function filterNames(
  context: SkillFilterContext,
  selectedTag = SKILL_TAG_ALL,
  searchQuery = ''
): string[] {
  return filterSkillGroups(allGroups, {
    ...context,
    selectedTag,
    searchQuery,
  }).map((group) => group.name)
}

describe('skill filter core', () => {
  it('collects Hub and agent tags for inventory view', () => {
    const tags = collectAvailableSkillTags(allGroups, {
      currentView: 'inventory-skills',
      currentId: null,
      agentScope: 'all',
    })

    expect(tags).toEqual([SKILL_TAG_HUB, 'Codex', 'Cursor'])
  })

  it('collects only Codex tag in agent global scope', () => {
    const tags = collectAvailableSkillTags(allGroups, {
      currentView: 'agent',
      currentId: 'Codex',
      agentScope: 'global',
    })

    expect(tags).toEqual(['Codex'])
  })

  it('filters by project + tag using in-scope instances only', () => {
    const names = filterNames(
      {
        currentView: 'project',
        currentId: '/workspace/repo-a',
        agentScope: 'all',
      },
      'Codex'
    )

    expect(names).toEqual(['agent-browser'])
  })

  it('supports agent scope filter between global and project', () => {
    const globalNames = filterNames({
      currentView: 'agent',
      currentId: 'Codex',
      agentScope: 'global',
    })
    const projectNames = filterNames({
      currentView: 'agent',
      currentId: 'Codex',
      agentScope: 'project',
    })

    expect(globalNames).toEqual(['agent-browser', 'docs-tool'])
    expect(projectNames).toEqual(['agent-browser', 'deploy-helper'])
  })

  it('applies search together with tag filters', () => {
    const names = filterNames(
      {
        currentView: 'inventory-skills',
        currentId: null,
        agentScope: 'all',
      },
      SKILL_TAG_HUB,
      'install'
    )

    expect(names).toEqual(['skill-installer'])
  })
})
