// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectSkillConflicts } from '../lib/services/conflict-service.mjs'

async function writeSkill(skillPath: string, pluginId?: string) {
  await fs.ensureDir(skillPath)
  const frontmatter = pluginId ? `---\nplugin_id: ${pluginId}\n---\n` : ''
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), `${frontmatter}# skill\n`, 'utf-8')
}

describe('conflict service', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-conflicts-service-'))
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('detects duplicate plugin ids and cross-source skill names', async () => {
    const hubPath = path.join(tempRoot, 'hub')
    const agentPath = path.join(tempRoot, 'agent')
    const projectPath = path.join(tempRoot, 'project-a')

    const hubSkill = path.join(hubPath, 'weather-helper')
    const agentSkill = path.join(agentPath, 'weather-agent')
    const projectSkill = path.join(projectPath, '.claude', 'skills', 'weather-helper')

    await writeSkill(hubSkill, 'plugin.weather')
    await writeSkill(agentSkill, 'plugin.weather')
    await writeSkill(projectSkill, 'plugin.project.weather')

    const report = await collectSkillConflicts({
      hubPath,
      projects: [projectPath],
      agents: [
        {
          name: 'Claude Code',
          globalPath: agentPath,
          projectPath: '.claude/skills',
          enabled: true,
        },
      ],
    })

    expect(report.itemCount).toBe(3)
    expect(report.conflictCount).toBe(2)

    const pluginConflict = report.conflicts.find((conflict) => conflict.type === 'duplicate_plugin_id')
    expect(pluginConflict).toBeTruthy()
    expect(pluginConflict?.items.map((item) => item.path)).toEqual(
      expect.arrayContaining([path.resolve(hubSkill), path.resolve(agentSkill)])
    )
    expect(pluginConflict?.resolution).toContain('disable/remove')

    const nameConflict = report.conflicts.find((conflict) => conflict.type === 'duplicate_skill_name')
    expect(nameConflict).toBeTruthy()
    expect(nameConflict?.key).toBe('weather-helper')
    expect(new Set(nameConflict?.items.map((item) => item.sourceType))).toEqual(
      new Set(['hub', 'project'])
    )
  })

  it('ignores duplicate skill names inside one source type', async () => {
    const hubPath = path.join(tempRoot, 'hub')
    const nestedA = path.join(hubPath, 'group-a', 'same-name')
    const nestedB = path.join(hubPath, 'group-b', 'same-name')

    await writeSkill(nestedA, 'plugin.a')
    await writeSkill(nestedB, 'plugin.b')

    const report = await collectSkillConflicts({
      hubPath,
      projects: [],
      agents: [],
    })

    expect(report.itemCount).toBe(2)
    expect(report.conflicts.find((conflict) => conflict.type === 'duplicate_skill_name')).toBeUndefined()
  })
})
