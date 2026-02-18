// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

function buildSkillMarkdown(frontmatter: string): string {
  return `${frontmatter}\n# Test Skill\n`
}

async function writeSkill(skillRoot: string, frontmatter: string) {
  await fs.ensureDir(skillRoot)
  await fs.writeFile(path.join(skillRoot, 'SKILL.md'), buildSkillMarkdown(frontmatter), 'utf-8')
}

describe('diagnose CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-diagnose-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('reports missing bins/env/config with suggestions', async () => {
    const hubPath = path.join(tempRoot, 'hub')
    await writeSkill(
      path.join(hubPath, 'needs-requirements'),
      `---
metadata:
  openclaw:
    requires:
      bins:
        - missing-bin-for-diagnose-tests
      anyBins:
        - missing-any-bin-a
        - missing-any-bin-b
      env:
        - SKILLS_HUB_DIAG_TEST_ENV
      config:
        - custom.required.token
---`
    )

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [],
        scanRoots: [],
        agents: [
          {
            name: 'Claude Code',
            globalPath: path.join(tempRoot, 'agent'),
            projectPath: '.claude/skills',
            enabled: true,
            isCustom: false,
          },
        ],
      },
      { spaces: 2 }
    )

    const result = await execFileAsync('node', ['bin/skills-hub', 'diagnose', '--json'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: tempHome,
      },
    })

    const report = JSON.parse(result.stdout)
    expect(report.summary.totalSkills).toBe(1)
    expect(report.summary.notReadySkills).toBe(1)

    const skill = report.skills.find((item: { name: string }) => item.name === 'needs-requirements')
    expect(skill).toBeTruthy()
    expect(skill.ready).toBe(false)

    const reasonCodes = new Set(skill.reasons.map((reason: { code: string }) => reason.code))
    expect(reasonCodes.has('missing_bin')).toBe(true)
    expect(reasonCodes.has('missing_any_bin')).toBe(true)
    expect(reasonCodes.has('missing_env')).toBe(true)
    expect(reasonCodes.has('missing_config')).toBe(true)

    for (const reason of skill.reasons) {
      expect(typeof reason.suggestion).toBe('string')
      expect(reason.suggestion.length).toBeGreaterThan(0)
    }
  })

  it('can include project and agent paths', async () => {
    const hubPath = path.join(tempRoot, 'hub')
    await writeSkill(path.join(hubPath, 'hub-skill'), '---\n---')

    const projectRoot = path.join(tempRoot, 'project-a')
    await writeSkill(
      path.join(projectRoot, '.claude', 'skills', 'project-skill'),
      `---
metadata:
  openclaw:
    requires:
      env:
        - SKILLS_HUB_PROJECT_ENV
---`
    )

    const agentRoot = path.join(tempRoot, 'agent-skills')
    await writeSkill(
      path.join(agentRoot, 'agent-skill'),
      `---
metadata:
  openclaw:
    requires:
      bins:
        - missing-agent-bin
---`
    )

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [],
        scanRoots: [],
        agents: [
          {
            name: 'Claude Code',
            globalPath: path.join(tempRoot, 'default-agent'),
            projectPath: '.claude/skills',
            enabled: true,
            isCustom: false,
          },
        ],
      },
      { spaces: 2 }
    )

    const result = await execFileAsync(
      'node',
      ['bin/skills-hub', 'diagnose', '--json', '--project', projectRoot, '--agent', agentRoot],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: tempHome,
        },
      }
    )

    const report = JSON.parse(result.stdout)
    const projectSkill = report.skills.find((item: { name: string }) => item.name === 'project-skill')
    const agentSkill = report.skills.find((item: { name: string }) => item.name === 'agent-skill')

    expect(projectSkill).toBeTruthy()
    expect(projectSkill.source).toBe('project')
    expect(projectSkill.reasons.some((reason: { code: string }) => reason.code === 'missing_env')).toBe(true)

    expect(agentSkill).toBeTruthy()
    expect(agentSkill.source).toBe('agent')
    expect(agentSkill.reasons.some((reason: { code: string }) => reason.code === 'missing_bin')).toBe(true)

    expect(report.targets.some((target: { kind: string }) => target.kind === 'project')).toBe(true)
    expect(report.targets.some((target: { kind: string }) => target.kind === 'agent')).toBe(true)
  })
})
