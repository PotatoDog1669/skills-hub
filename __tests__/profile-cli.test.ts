// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

function extractFirstId(output: string): string | null {
  const line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('- '))

  if (!line) return null
  return line
    .split('|')[0]
    .replace(/^[-\s]+/, '')
    .trim()
}

async function initGitRepo(repoPath: string): Promise<void> {
  await fs.ensureDir(repoPath)
  await execFileAsync('git', ['init'], { cwd: repoPath })
}

describe('profile CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-profile-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('supports profile CRUD operations', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const projectPath = path.join(tempRoot, 'project-crud')
    await initGitRepo(projectPath)

    const added = await execFileAsync(
      'node',
      ['bin/skills-hub', 'profile', 'add', '--name', 'project-crud-profile', '--project', projectPath],
      { cwd: repoRoot, env }
    )
    expect(added.stdout).toContain('Profile created:')

    const listed = await execFileAsync('node', ['bin/skills-hub', 'profile', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(listed.stdout).toContain('project-crud-profile')

    const profileId = extractFirstId(listed.stdout)
    expect(profileId).toBeTruthy()

    const updated = await execFileAsync(
      'node',
      ['bin/skills-hub', 'profile', 'update', '--id', profileId!, '--name', 'project-crud-profile-v2', '--default'],
      { cwd: repoRoot, env }
    )
    expect(updated.stdout).toContain('Profile updated:')

    const listedAfterUpdate = await execFileAsync('node', ['bin/skills-hub', 'profile', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(listedAfterUpdate.stdout).toContain('project-crud-profile-v2')
    expect(listedAfterUpdate.stdout).toContain('| default')

    const deleted = await execFileAsync('node', ['bin/skills-hub', 'profile', 'delete', '--id', profileId!], {
      cwd: repoRoot,
      env,
    })
    expect(deleted.stdout).toContain('Deleted profile:')

    const listedAfterDelete = await execFileAsync('node', ['bin/skills-hub', 'profile', 'list'], {
      cwd: repoRoot,
      env,
    })
    expect(listedAfterDelete.stdout).toContain('No profiles found.')
  })

  it('applies default profile fallback with kit and provider bindings', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const projectDefault = path.join(tempRoot, 'project-default')
    const projectTarget = path.join(tempRoot, 'project-target')
    const skillPath = path.join(tempRoot, 'hub-skills', 'frontend-toolkit')
    await initGitRepo(projectDefault)
    await initGitRepo(projectTarget)
    await fs.ensureDir(skillPath)
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# Frontend Toolkit\n', 'utf-8')

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath: path.join(tempHome, 'skills-hub'),
        projects: [projectDefault, projectTarget],
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

    const policyPath = path.join(tempRoot, 'policy-profile.md')
    await fs.writeFile(policyPath, '# AGENTS\n\nUse profile fallback.\n', 'utf-8')

    await execFileAsync(
      'node',
      ['bin/skills-hub', 'kit', 'policy-add', '--name', 'profile-policy', '--content-file', policyPath],
      { cwd: repoRoot, env }
    )
    const policyList = await execFileAsync('node', ['bin/skills-hub', 'kit', 'policy-list'], {
      cwd: repoRoot,
      env,
    })
    const policyId = extractFirstId(policyList.stdout)
    expect(policyId).toBeTruthy()

    await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'loadout-add',
        '--name',
        'profile-loadout',
        '--skills',
        skillPath,
        '--mode',
        'copy',
      ],
      { cwd: repoRoot, env }
    )
    const loadoutList = await execFileAsync('node', ['bin/skills-hub', 'kit', 'loadout-list'], {
      cwd: repoRoot,
      env,
    })
    const loadoutId = extractFirstId(loadoutList.stdout)
    expect(loadoutId).toBeTruthy()

    await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'kit',
        'add',
        '--name',
        'profile-kit',
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
    const kitId = extractFirstId(kitList.stdout)
    expect(kitId).toBeTruthy()

    const providerConfigPath = path.join(tempRoot, 'claude-profile-provider.json')
    await fs.writeJson(providerConfigPath, {
      api_key: 'profile-key-123',
      model: 'claude-sonnet-4',
    })

    await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'provider',
        'add',
        '--app',
        'claude',
        '--name',
        'profile-claude-provider',
        '--config-file',
        providerConfigPath,
      ],
      { cwd: repoRoot, env }
    )

    const providerList = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'list', '--app', 'claude'],
      { cwd: repoRoot, env }
    )
    const providerId = extractFirstId(providerList.stdout)
    expect(providerId).toBeTruthy()

    const profileAdded = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'profile',
        'add',
        '--name',
        'fallback-profile',
        '--project',
        projectDefault,
        '--kit-id',
        kitId!,
        '--claude-provider-id',
        providerId!,
        '--default',
      ],
      { cwd: repoRoot, env }
    )
    expect(profileAdded.stdout).toContain('Profile created:')

    const applied = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'profile',
        'apply',
        '--project',
        projectTarget,
        '--agent',
        'Claude Code',
      ],
      { cwd: repoRoot, env }
    )

    expect(applied.stdout).toContain('source=default-fallback')
    expect(applied.stdout).toContain('Kit applied:')
    expect(applied.stdout).toContain('Provider switched:')

    const agentsPath = path.join(projectTarget, 'AGENTS.md')
    expect(await fs.pathExists(agentsPath)).toBe(true)
    expect(await fs.readFile(agentsPath, 'utf-8')).toContain('Use profile fallback.')

    const syncedSkillPath = path.join(projectTarget, '.claude', 'skills', 'frontend-toolkit', 'SKILL.md')
    expect(await fs.pathExists(syncedSkillPath)).toBe(true)

    const claudeSettings = await fs.readJson(path.join(tempHome, '.claude', 'settings.json'))
    expect(claudeSettings).toMatchObject({
      api_key: 'profile-key-123',
      model: 'claude-sonnet-4',
    })
  })
})
