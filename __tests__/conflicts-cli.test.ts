// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

async function writeSkill(skillPath: string, pluginId?: string) {
  await fs.ensureDir(skillPath)
  const frontmatter = pluginId ? `---\nplugin_id: ${pluginId}\n---\n` : ''
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), `${frontmatter}# skill\n`, 'utf-8')
}

describe('conflicts CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-conflicts-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('prints conflicts in text and json mode', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const hubPath = path.join(tempRoot, 'hub')
    const agentRoot = path.join(tempRoot, 'agent-skills')
    const projectPath = path.join(tempRoot, 'project-a')
    const hubSkillPath = path.join(hubPath, 'search-tool')
    const agentSkillPath = path.join(agentRoot, 'search-agent-copy')
    const projectSkillPath = path.join(projectPath, '.claude', 'skills', 'search-tool')

    await writeSkill(hubSkillPath, 'plugin.search')
    await writeSkill(agentSkillPath, 'plugin.search')
    await writeSkill(projectSkillPath, 'plugin.project.search')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [projectPath],
        scanRoots: [],
        agents: [
          {
            name: 'Claude Code',
            globalPath: agentRoot,
            projectPath: '.claude/skills',
            enabled: true,
            isCustom: false,
          },
        ],
      },
      { spaces: 2 }
    )

    const jsonResult = await execFileAsync('node', ['bin/skills-hub', 'conflicts', '--json'], {
      cwd: repoRoot,
      env,
    })
    const report = JSON.parse(jsonResult.stdout)

    expect(report.conflictCount).toBe(2)
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'duplicate_plugin_id',
          key: 'plugin.search',
          resolution: expect.stringContaining('disable/remove'),
          items: expect.arrayContaining([
            expect.objectContaining({
              path: path.resolve(hubSkillPath),
            }),
            expect.objectContaining({
              path: path.resolve(agentSkillPath),
            }),
          ]),
        }),
        expect.objectContaining({
          type: 'duplicate_skill_name',
          key: 'search-tool',
        }),
      ])
    )

    const textResult = await execFileAsync('node', ['bin/skills-hub', 'conflicts'], {
      cwd: repoRoot,
      env,
    })

    expect(textResult.stdout).toContain('[duplicate_plugin_id]')
    expect(textResult.stdout).toContain('[duplicate_skill_name]')
    expect(textResult.stdout).toContain('Suggested resolution:')
    expect(textResult.stdout).toContain(path.resolve(hubSkillPath))
  })
})
