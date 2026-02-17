// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

describe('kit CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('supports policy/loadout/kit/apply flow', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const projectPath = path.join(tempRoot, 'project-a')
    const skillPath = path.join(tempRoot, 'hub-skills', 'frontend-toolkit')
    await fs.ensureDir(projectPath)
    await fs.ensureDir(skillPath)
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# Frontend Toolkit\n', 'utf-8')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath: path.join(tempHome, 'skills-hub'),
        projects: [projectPath],
        scanRoots: [],
        agents: [
          {
            name: 'Claude Code',
            globalPath: path.join(tempHome, '.claude', 'skills'),
            projectPath: '.claude/skills',
            enabled: true,
            isCustom: false,
          },
        ],
      },
      { spaces: 2 }
    )

    const policyFile = path.join(tempRoot, 'policy.md')
    await fs.writeFile(policyFile, '# AGENTS\n\nUse strict TS.\n', 'utf-8')

    const policyAdded = await execFileAsync(
      'node',
      ['bin/skills-hub', 'kit', 'policy-add', '--name', 'frontend-policy', '--content-file', policyFile],
      { cwd: repoRoot, env }
    )
    expect(policyAdded.stdout).toContain('Policy created:')

    const policyListed = await execFileAsync('node', ['bin/skills-hub', 'kit', 'policy-list'], {
      cwd: repoRoot,
      env,
    })
    const policyId = policyListed.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(policyId).toBeTruthy()

    const loadoutAdded = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'loadout-add',
        '--name',
        'frontend-loadout',
        '--skills',
        skillPath,
        '--mode',
        'copy',
      ],
      { cwd: repoRoot, env }
    )
    expect(loadoutAdded.stdout).toContain('Loadout created:')

    const loadoutListed = await execFileAsync('node', ['bin/skills-hub', 'kit', 'loadout-list'], {
      cwd: repoRoot,
      env,
    })
    const loadoutId = loadoutListed.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(loadoutId).toBeTruthy()

    const kitAdded = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'add',
        '--name',
        'frontend-kit',
        '--policy-id',
        policyId!,
        '--loadout-id',
        loadoutId!,
      ],
      { cwd: repoRoot, env }
    )
    expect(kitAdded.stdout).toContain('Kit created:')

    const kitListed = await execFileAsync('node', ['bin/skills-hub', 'kit', 'list'], {
      cwd: repoRoot,
      env,
    })
    const kitId = kitListed.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(kitId).toBeTruthy()

    const applied = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'apply',
        '--id',
        kitId!,
        '--project',
        projectPath,
        '--agent',
        'Claude Code',
        '--mode',
        'copy',
      ],
      { cwd: repoRoot, env }
    )
    expect(applied.stdout).toContain('Kit applied:')

    const agentsPath = path.join(projectPath, 'AGENTS.md')
    expect(await fs.pathExists(agentsPath)).toBe(true)
    expect(await fs.readFile(agentsPath, 'utf-8')).toContain('Use strict TS.')

    const syncedSkillPath = path.join(projectPath, '.claude', 'skills', 'frontend-toolkit')
    expect(await fs.pathExists(path.join(syncedSkillPath, 'SKILL.md'))).toBe(true)
  })
})
