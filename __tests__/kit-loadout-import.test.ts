// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildDefaultLoadoutName,
  parseLoadoutImportUrl,
  resolveImportRoot,
} from '../lib/services/kit-loadout-import.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const binPath = path.join(repoRoot, 'bin', 'skills-hub')

async function runCli(args: string[], env: NodeJS.ProcessEnv) {
  return execFileAsync('node', [binPath, ...args], {
    cwd: repoRoot,
    env,
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
      agents: [],
    },
    { spaces: 2 }
  )
}

async function writeRepoFiles(repoPath: string, files: Record<string, string | null>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoPath, relativePath)
    if (content === null) {
      await fs.remove(fullPath)
      continue
    }

    await fs.ensureDir(path.dirname(fullPath))
    await fs.writeFile(fullPath, content, 'utf-8')
  }
}

async function commitAndPushRepo(repoPath: string, message: string, bareRepoPath: string) {
  await execFileAsync('git', ['add', '-A'], { cwd: repoPath })
  await execFileAsync('git', ['commit', '-m', message], { cwd: repoPath })
  await execFileAsync('git', ['push', 'origin', 'main'], { cwd: repoPath })

  const remoteHeads = await execFileAsync('git', ['show-ref', '--heads'], { cwd: bareRepoPath })
  expect(remoteHeads.stdout).toContain('refs/heads/main')
}

async function createRemoteRepo(
  tempRoot: string,
  repoName: string,
  files: Record<string, string>
) {
  const sourceRepoPath = path.join(tempRoot, `${repoName}-src`)
  const bareRepoPath = path.join(tempRoot, `${repoName}.git`)

  await fs.ensureDir(sourceRepoPath)
  await writeRepoFiles(sourceRepoPath, files)

  await execFileAsync('git', ['init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.email', 'tests@example.com'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.name', 'Kit Import Tests'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['add', '.'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['branch', '-M', 'main'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['clone', '--bare', sourceRepoPath, bareRepoPath], { cwd: tempRoot })
  await execFileAsync('git', ['remote', 'add', 'origin', bareRepoPath], { cwd: sourceRepoPath })
  await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: sourceRepoPath })

  return {
    sourceRepoPath,
    bareRepoPath,
    remoteUrl: `file://${bareRepoPath}`,
  }
}

describe('kit loadout import helpers', () => {
  it('parses GitHub root and tree URLs and keeps repo naming rules', () => {
    const root = parseLoadoutImportUrl('https://github.com/obra/superpowers')
    expect(root.repoUrl).toBe('https://github.com/obra/superpowers.git')
    expect(root.repoWebUrl).toBe('https://github.com/obra/superpowers')
    expect(root.explicitSubdir).toBe('')

    const tree = parseLoadoutImportUrl('https://github.com/obra/superpowers/tree/main/skills')
    expect(tree.branch).toBe('main')
    expect(tree.explicitSubdir).toBe('skills')
    expect(buildDefaultLoadoutName(tree, 'skills')).toBe('superpowers')
  })

  it('prefers skills directory over repo root when resolving import root', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-root-'))
    try {
      await fs.ensureDir(path.join(tempRoot, 'skills', 'alpha'))
      const resolved = await resolveImportRoot(tempRoot, {
        explicitSubdir: '',
      })
      expect(resolved.rootSubdir).toBe('skills')
      expect(resolved.rootPath).toBe(path.join(tempRoot, 'skills'))
    } finally {
      await fs.remove(tempRoot)
    }
  })
})

describe('kit loadout-import CLI', () => {
  let tempRoot: string
  let tempHome: string
  let env: NodeJS.ProcessEnv

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-loadout-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
    await writeConfig(tempHome)
    env = {
      ...process.env,
      HOME: tempHome,
    }
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('imports a remote skills repo and upserts stale skills on re-import', async () => {
    const remote = await createRemoteRepo(tempRoot, 'superpowers', {
      'skills/a/SKILL.md': '# A\n',
      'skills/b/SKILL.md': '# B\n',
    })

    const firstRun = await runCli(['kit', 'loadout-import', '--url', remote.remoteUrl], env)
    expect(firstRun.stdout).toContain('Imported skills: discovered=2, overwritten=0, removed=0')
    expect(firstRun.stdout).toContain('Loadout created:')

    const hubPath = path.join(tempHome, 'skills-hub')
    expect(await fs.pathExists(path.join(hubPath, 'a', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'b', 'SKILL.md'))).toBe(true)

    await writeRepoFiles(remote.sourceRepoPath, {
      'skills/b/SKILL.md': null,
      'skills/c/SKILL.md': '# C\n',
    })
    await commitAndPushRepo(remote.sourceRepoPath, 'replace b with c', remote.bareRepoPath)

    const secondRun = await runCli(
      ['kit', 'loadout-import', '--url', remote.remoteUrl, '--yes'],
      env
    )
    expect(secondRun.stdout).toContain('Imported skills: discovered=2, overwritten=1, removed=1')
    expect(secondRun.stdout).toContain('Loadout updated:')

    expect(await fs.pathExists(path.join(hubPath, 'a', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'b'))).toBe(false)
    expect(await fs.pathExists(path.join(hubPath, 'c', 'SKILL.md'))).toBe(true)
  }, 60_000)

  it('falls back to scanning repo root when no skills directory exists', async () => {
    const remote = await createRemoteRepo(tempRoot, 'root-scan', {
      'tooling/demo/SKILL.md': '# Demo\n',
    })

    const imported = await runCli(['kit', 'loadout-import', '--url', remote.remoteUrl], env)
    expect(imported.stdout).toContain('Root subdir: /')
    expect(imported.stdout).toContain('Loadout created:')
    expect(await fs.pathExists(path.join(tempHome, 'skills-hub', 'demo', 'SKILL.md'))).toBe(true)
  }, 60_000)

  it('fails when duplicate skill directory basenames exist in one import', async () => {
    const remote = await createRemoteRepo(tempRoot, 'dupe-skill-names', {
      'skills/backend/demo/SKILL.md': '# Demo backend\n',
      'skills/frontend/demo/SKILL.md': '# Demo frontend\n',
    })

    await expect(
      runCli(['kit', 'loadout-import', '--url', remote.remoteUrl], env)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Duplicate skill directory names found in remote source'),
    })
  }, 60_000)

  it('fails when the derived package name collides with a local-only loadout', async () => {
    const localSkillPath = path.join(tempRoot, 'local-skill')
    await fs.ensureDir(localSkillPath)
    await fs.writeFile(path.join(localSkillPath, 'SKILL.md'), '# local\n', 'utf-8')

    await runCli(
      ['kit', 'loadout-add', '--name', 'superpowers', '--skills', localSkillPath],
      env
    )

    const remote = await createRemoteRepo(tempRoot, 'superpowers', {
      'skills/a/SKILL.md': '# A\n',
    })

    await expect(
      runCli(['kit', 'loadout-import', '--url', remote.remoteUrl], env)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Use --name to choose a different package name'),
    })
  }, 60_000)
})
