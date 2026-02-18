// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

function getSnapshotIdFromList(output: string): string | null {
  const line = output
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith('- '))

  if (!line) {
    return null
  }

  return line
    .split('|')[0]
    .replace(/^-\s*/, '')
    .trim()
}

describe('snapshot CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-snapshot-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('creates snapshot for sync and rolls back by snapshot id', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const hubPath = path.join(tempRoot, 'hub')
    const agentRoot = path.join(tempRoot, 'agent-skills')
    await fs.ensureDir(hubPath)
    await fs.ensureDir(agentRoot)

    const newSkillPath = path.join(hubPath, 'new-skill')
    await fs.ensureDir(newSkillPath)
    await fs.writeFile(path.join(newSkillPath, 'SKILL.md'), '# New Skill\n', 'utf-8')

    const updateSkillPath = path.join(hubPath, 'update-skill')
    await fs.ensureDir(updateSkillPath)
    await fs.writeFile(path.join(updateSkillPath, 'SKILL.md'), '# Updated Skill\n', 'utf-8')

    const existingUpdateDest = path.join(agentRoot, 'update-skill')
    await fs.ensureDir(existingUpdateDest)
    await fs.writeFile(path.join(existingUpdateDest, 'SKILL.md'), '# Old Skill\n', 'utf-8')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [],
        scanRoots: [],
        snapshotRetention: 20,
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

    await execFileAsync('node', ['bin/skills-hub', 'sync', '--target', 'Claude', '--dry-run'], {
      cwd: repoRoot,
      env,
    })

    const beforeList = await execFileAsync('node', ['bin/skills-hub', 'snapshot', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(beforeList.stdout).toContain('No snapshots found.')

    const syncResult = await execFileAsync('node', ['bin/skills-hub', 'sync', '--target', 'Claude'], {
      cwd: repoRoot,
      env,
    })
    expect(syncResult.stdout).toContain('Snapshot created:')

    expect(await fs.readFile(path.join(existingUpdateDest, 'SKILL.md'), 'utf-8')).toBe('# Updated Skill\n')
    expect(await fs.pathExists(path.join(agentRoot, 'new-skill', 'SKILL.md'))).toBe(true)

    const listed = await execFileAsync('node', ['bin/skills-hub', 'snapshot', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(listed.stdout).toContain('sync')
    const snapshotId = getSnapshotIdFromList(listed.stdout)
    expect(snapshotId).toBeTruthy()

    const rollbackResult = await execFileAsync(
      'node',
      ['bin/skills-hub', 'snapshot', 'rollback', '--id', snapshotId!],
      { cwd: repoRoot, env }
    )
    expect(rollbackResult.stdout).toContain('Snapshot rolled back:')

    expect(await fs.readFile(path.join(existingUpdateDest, 'SKILL.md'), 'utf-8')).toBe('# Old Skill\n')
    expect(await fs.pathExists(path.join(agentRoot, 'new-skill'))).toBe(false)
  })

  it('creates snapshot for kit apply and rolls back with --last', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const projectPath = path.join(tempRoot, 'project')
    const hubSkillPath = path.join(tempRoot, 'hub-skills', 'frontend-toolkit')
    const existingSkillDest = path.join(projectPath, '.claude', 'skills', 'frontend-toolkit')
    const agentsPath = path.join(projectPath, 'AGENTS.md')

    await fs.ensureDir(projectPath)
    await fs.ensureDir(hubSkillPath)
    await fs.writeFile(path.join(hubSkillPath, 'SKILL.md'), '# New Toolkit\n', 'utf-8')

    await fs.ensureDir(existingSkillDest)
    await fs.writeFile(path.join(existingSkillDest, 'SKILL.md'), '# Existing Toolkit\n', 'utf-8')
    await fs.writeFile(agentsPath, '# Existing Policy\n', 'utf-8')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath: path.join(tempHome, 'skills-hub'),
        projects: [projectPath],
        scanRoots: [],
        snapshotRetention: 20,
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
    await fs.writeFile(policyFile, '# AGENTS\n\nUse new workflow.\n', 'utf-8')

    await execFileAsync(
      'node',
      ['bin/skills-hub', 'kit', 'policy-add', '--name', 'snapshot-policy', '--content-file', policyFile],
      { cwd: repoRoot, env }
    )
    const policyList = await execFileAsync('node', ['bin/skills-hub', 'kit', 'policy-list'], {
      cwd: repoRoot,
      env,
    })
    const policyId = policyList.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(policyId).toBeTruthy()

    await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'loadout-add',
        '--name',
        'snapshot-loadout',
        '--skills',
        hubSkillPath,
        '--mode',
        'copy',
      ],
      { cwd: repoRoot, env }
    )
    const loadoutList = await execFileAsync('node', ['bin/skills-hub', 'kit', 'loadout-list'], {
      cwd: repoRoot,
      env,
    })
    const loadoutId = loadoutList.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(loadoutId).toBeTruthy()

    await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'add',
        '--name',
        'snapshot-kit',
        '--policy-id',
        policyId!,
        '--loadout-id',
        loadoutId!,
      ],
      { cwd: repoRoot, env }
    )
    const kitList = await execFileAsync('node', ['bin/skills-hub', 'kit', 'list'], {
      cwd: repoRoot,
      env,
    })
    const kitId = kitList.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(kitId).toBeTruthy()

    await execFileAsync(
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
        '--overwrite-agents-md',
        '--dry-run',
      ],
      { cwd: repoRoot, env }
    )

    const beforeList = await execFileAsync('node', ['bin/skills-hub', 'snapshot', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(beforeList.stdout).toContain('No snapshots found.')

    const applyResult = await execFileAsync(
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
        '--overwrite-agents-md',
      ],
      { cwd: repoRoot, env }
    )
    expect(applyResult.stdout).toContain('Snapshot created:')
    expect(applyResult.stdout).toContain('Kit applied:')

    expect(await fs.readFile(path.join(existingSkillDest, 'SKILL.md'), 'utf-8')).toBe('# New Toolkit\n')
    expect(await fs.readFile(agentsPath, 'utf-8')).toContain('Use new workflow.')

    const listed = await execFileAsync('node', ['bin/skills-hub', 'snapshot', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(listed.stdout).toContain('kit-apply')

    const rollbackResult = await execFileAsync(
      'node',
      ['bin/skills-hub', 'snapshot', 'rollback', '--last'],
      { cwd: repoRoot, env }
    )
    expect(rollbackResult.stdout).toContain('Snapshot rolled back:')

    expect(await fs.readFile(path.join(existingSkillDest, 'SKILL.md'), 'utf-8')).toBe('# Existing Toolkit\n')
    expect(await fs.readFile(agentsPath, 'utf-8')).toBe('# Existing Policy\n')
  })

  it('applies snapshot retention from config', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const hubPath = path.join(tempRoot, 'hub')
    const agentRoot = path.join(tempRoot, 'agent-skills')
    const skillPath = path.join(hubPath, 'skill-retain')
    await fs.ensureDir(skillPath)
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# v1\n', 'utf-8')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [],
        scanRoots: [],
        snapshotRetention: 1,
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

    await execFileAsync('node', ['bin/skills-hub', 'sync', '--target', 'Claude'], {
      cwd: repoRoot,
      env,
    })
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# v2\n', 'utf-8')
    await execFileAsync('node', ['bin/skills-hub', 'sync', '--target', 'Claude'], {
      cwd: repoRoot,
      env,
    })

    const listed = await execFileAsync('node', ['bin/skills-hub', 'snapshot', 'list'], {
      cwd: repoRoot,
      env,
    })
    const snapshotLines = listed.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
    expect(snapshotLines.length).toBe(1)
  })
})
