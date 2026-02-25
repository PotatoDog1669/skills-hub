// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const binPath = path.join(repoRoot, 'bin', 'skills-hub')

interface TestContext {
  tempRoot: string
  tempHome: string
  projectPath: string
  env: NodeJS.ProcessEnv
}

async function runCli(args: string[], ctx: TestContext, cwd?: string) {
  return execFileAsync('node', [binPath, ...args], {
    cwd: cwd || repoRoot,
    env: ctx.env,
  })
}

async function writeConfig(tempHome: string) {
  const configPath = path.join(tempHome, '.skills-hub', 'config.json')
  await fs.ensureDir(path.dirname(configPath))
  await fs.writeJson(
    configPath,
    {
      hubPath: path.join(tempHome, 'skills-hub'),
      projects: [],
      scanRoots: [],
      agents: [
        {
          name: 'Codex',
          globalPath: path.join(tempHome, '.codex', 'skills'),
          projectPath: '.codex/skills',
          enabled: true,
          isCustom: false,
        },
      ],
    },
    { spaces: 2 }
  )
}

async function createRemoteSkillRepo(tempRoot: string, skillName = 'demo-skill') {
  const sourceRepoPath = path.join(tempRoot, `${skillName}-src`)
  const bareRepoPath = path.join(tempRoot, `${skillName}.git`)

  await fs.ensureDir(sourceRepoPath)
  await fs.writeFile(path.join(sourceRepoPath, 'SKILL.md'), '# Demo skill\n', 'utf-8')
  await fs.writeFile(path.join(sourceRepoPath, 'README.md'), 'demo\n', 'utf-8')

  await execFileAsync('git', ['init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.email', 'tests@example.com'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.name', 'CLI Tests'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['add', '.'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['clone', '--bare', sourceRepoPath, bareRepoPath], { cwd: tempRoot })

  return {
    remoteUrl: `file://${bareRepoPath}`,
    skillName,
  }
}

describe('skills CLI enhancements', () => {
  let ctx: TestContext

  beforeEach(async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-cli-'))
    const tempHome = path.join(tempRoot, 'home')
    const projectPath = path.join(tempRoot, 'project-a')
    await fs.ensureDir(tempHome)
    await fs.ensureDir(projectPath)
    await writeConfig(tempHome)

    ctx = {
      tempRoot,
      tempHome,
      projectPath,
      env: {
        ...process.env,
        HOME: tempHome,
      },
    }
  })

  afterEach(async () => {
    await fs.remove(ctx.tempRoot)
  })

  it('supports list alias ls and shows installation view by agent', async () => {
    const installedSkillPath = path.join(ctx.projectPath, '.codex', 'skills', 'alpha')
    await fs.ensureDir(installedSkillPath)
    await fs.writeFile(path.join(installedSkillPath, 'SKILL.md'), '# alpha\n', 'utf-8')

    const listed = await runCli(['ls', '-a', 'codex'], ctx, ctx.projectPath)
    expect(listed.stdout).toContain('Listing installed skills (project scope):')
    expect(listed.stdout).toContain('Codex')
    expect(listed.stdout).toContain('alpha')
  })

  it('supports remove alias rm for project scope and --hub scope', async () => {
    const projectSkillPath = path.join(ctx.projectPath, '.codex', 'skills', 'beta')
    const hubSkillPath = path.join(ctx.tempHome, 'skills-hub', 'beta')

    await fs.ensureDir(projectSkillPath)
    await fs.writeFile(path.join(projectSkillPath, 'SKILL.md'), '# beta\n', 'utf-8')
    await fs.ensureDir(hubSkillPath)
    await fs.writeFile(path.join(hubSkillPath, 'SKILL.md'), '# beta hub\n', 'utf-8')

    await runCli(['rm', 'beta', '-a', 'codex'], ctx, ctx.projectPath)
    expect(await fs.pathExists(projectSkillPath)).toBe(false)
    expect(await fs.pathExists(hubSkillPath)).toBe(true)

    await runCli(['remove', 'beta', '--hub'], ctx, ctx.projectPath)
    expect(await fs.pathExists(hubSkillPath)).toBe(false)
  })

  it('keeps import without alias and rejects unknown command a', async () => {
    await expect(runCli(['a'], ctx, ctx.projectPath)).rejects.toMatchObject({
      stderr: expect.stringContaining('Unknown command: a'),
    })
  })

  it('supports import --list without writing files', async () => {
    const remote = await createRemoteSkillRepo(ctx.tempRoot, 'list-only-skill')
    const listed = await runCli(['import', remote.remoteUrl, '--list'], ctx, ctx.projectPath)
    expect(listed.stdout).toContain('Installable skills from')
    expect(listed.stdout).toContain('list-only-skill')

    const hubSkillPath = path.join(ctx.tempHome, 'skills-hub', 'list-only-skill')
    expect(await fs.pathExists(hubSkillPath)).toBe(false)
  })

  it('installs imported skills to project agent path with symlink by default', async () => {
    const remote = await createRemoteSkillRepo(ctx.tempRoot, 'project-install-skill')
    await runCli(['import', remote.remoteUrl, '-a', 'codex'], ctx, ctx.projectPath)

    const hubSkillPath = path.join(ctx.tempHome, 'skills-hub', 'project-install-skill')
    const projectSkillPath = path.join(ctx.projectPath, '.codex', 'skills', 'project-install-skill')

    expect(await fs.pathExists(path.join(hubSkillPath, 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(projectSkillPath)).toBe(true)
    expect((await fs.lstat(projectSkillPath)).isSymbolicLink()).toBe(true)
  })

  it('requires -y/--yes to overwrite in non-interactive mode', async () => {
    const remote = await createRemoteSkillRepo(ctx.tempRoot, 'conflict-skill')
    const hubSkillPath = path.join(ctx.tempHome, 'skills-hub', 'conflict-skill')
    await fs.ensureDir(hubSkillPath)
    await fs.writeFile(path.join(hubSkillPath, 'SKILL.md'), '# old\n', 'utf-8')

    await expect(runCli(['import', remote.remoteUrl], ctx, ctx.projectPath)).rejects.toMatchObject({
      message: expect.stringContaining('Use -y/--yes to overwrite in non-interactive mode'),
    })

    const overwritten = await runCli(['import', remote.remoteUrl, '--yes'], ctx, ctx.projectPath)
    expect(overwritten.stdout).toContain('Successfully imported conflict-skill to Hub')
    expect(await fs.pathExists(path.join(hubSkillPath, 'SKILL.md'))).toBe(true)
  })
})
