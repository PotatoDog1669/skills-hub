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

async function createRemoteRepo(
  tempRoot: string,
  repoName: string,
  files: Record<string, string>
) {
  const sourceRepoPath = path.join(tempRoot, `${repoName}-src`)
  const bareRepoPath = path.join(tempRoot, `${repoName}.git`)

  await fs.ensureDir(sourceRepoPath)
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(sourceRepoPath, relativePath)
    await fs.ensureDir(path.dirname(fullPath))
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  await execFileAsync('git', ['init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.email', 'tests@example.com'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['config', 'user.name', 'Official Preset Tests'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['add', '.'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['branch', '-M', 'main'], { cwd: sourceRepoPath })
  await execFileAsync('git', ['clone', '--bare', sourceRepoPath, bareRepoPath], { cwd: tempRoot })
  await execFileAsync('git', ['remote', 'add', 'origin', bareRepoPath], { cwd: sourceRepoPath })
  await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: sourceRepoPath })

  return {
    remoteUrl: `file://${bareRepoPath}`,
  }
}

describe('official preset CLI', () => {
  let tempRoot: string
  let tempHome: string
  let env: NodeJS.ProcessEnv

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-official-'))
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

  it('lists and installs an official preset from a custom local catalog', async () => {
    const nextjsRepo = await createRemoteRepo(tempRoot, 'nextjs-toolkit', {
      'skills/app-router-helper/SKILL.md': '# App Router Helper\n',
      'skills/ssr-ssg-advisor/SKILL.md': '# SSR SSG Advisor\n',
      'skills/web-design-guidelines/SKILL.md': '# Web Design Guidelines\n',
      'skills/unselected-helper/SKILL.md': '# Unselected Helper\n',
    })
    const testingRepo = await createRemoteRepo(tempRoot, 'testing-toolkit', {
      'skills/test-coverage-analyzer/SKILL.md': '# Test Coverage Analyzer\n',
    })

    const catalogDir = path.join(tempRoot, 'official-presets')
    const policyDir = path.join(catalogDir, 'policies')
    const catalogPath = path.join(catalogDir, 'catalog.json')
    const demoWebPreset = {
      id: 'demo-web',
      name: 'Demo Web Preset',
      description: 'Demo preset for testing official install flow.',
      policy: {
        name: 'Official: Demo Web',
        description: 'Demo web policy.',
        template: 'policies/policy-demo.md',
      },
      sources: [
        {
          id: 'nextjs-source',
          name: 'Next.js Toolkit',
          url: nextjsRepo.remoteUrl,
          description: 'Demo nextjs skills.',
          selectedSkills: ['app-router-helper', 'ssr-ssg-advisor'],
        },
        {
          id: 'testing-source',
          name: 'Testing Toolkit',
          url: testingRepo.remoteUrl,
          description: 'Demo testing skills.',
          selectedSkills: ['test-coverage-analyzer'],
        },
      ],
    }
    const demoDesignPreset = {
      id: 'demo-design',
      name: 'Demo Design Preset',
      description: 'Demo preset that reuses the same source with a different selection.',
      policy: {
        name: 'Official: Demo Design',
        description: 'Demo design policy.',
        template: 'policies/policy-demo.md',
      },
      sources: [
        {
          id: 'nextjs-design-source',
          name: 'Next.js Toolkit',
          url: nextjsRepo.remoteUrl,
          description: 'Demo design skills.',
          selectedSkills: ['web-design-guidelines'],
        },
      ],
    }
    await fs.ensureDir(policyDir)
    await fs.writeFile(
      path.join(policyDir, 'policy-demo.md'),
      '# AGENTS.md\n\n## Rules\n- Keep changes reviewable.\n',
      'utf-8'
    )
    await fs.writeJson(
      catalogPath,
      {
        version: 1,
        presets: [demoWebPreset],
      },
      { spaces: 2 }
    )

    env = {
      ...env,
      SKILLS_HUB_OFFICIAL_PRESETS_DIR: catalogDir,
    }

    const listed = await runCli(['official', 'list'], env)
    expect(listed.stdout).toContain('demo-web')
    expect(listed.stdout).toContain('skills=3')

    const searched = await runCli(['official', 'search', 'nextjs'], env)
    expect(searched.stdout).toContain('demo-web')
    expect(searched.stdout).toContain('Demo Web Preset')

    const inspected = await runCli(['official', 'inspect', '--id', 'demo-web'], env)
    expect(inspected.stdout).toContain('demo-web | Demo Web Preset')
    expect(inspected.stdout).toContain('Policy: Official: Demo Web')
    expect(inspected.stdout).toContain('Policy template: policies/policy-demo.md')
    expect(inspected.stdout).toContain('Next.js Toolkit')
    expect(inspected.stdout).toContain('app-router-helper, ssr-ssg-advisor')
    expect(inspected.stdout).toContain('Testing Toolkit')
    expect(inspected.stdout).toContain('test-coverage-analyzer')

    const installed = await runCli(['official', 'install', '--id', 'demo-web'], env)
    expect(installed.stdout).toContain('Official preset installed: demo-web')
    expect(installed.stdout).toContain('Policy:')
    expect(installed.stdout).toContain('Loadout:')
    expect(installed.stdout).toContain('Kit:')

    const policies = await runCli(['kit', 'policy-list'], env)
    expect(policies.stdout).toContain('Official: Demo Web')

    const loadouts = await runCli(['kit', 'loadout-list'], env)
    expect(loadouts.stdout).toContain('Official: Demo Web Preset')
    expect(loadouts.stdout).not.toContain('Official Source: Demo Web Preset / Next.js Toolkit')
    expect(loadouts.stdout).not.toContain('Official Source: Demo Web Preset / Testing Toolkit')

    const kits = await runCli(['kit', 'list'], env)
    expect(kits.stdout).toContain('Official: Demo Web Preset')

    const hubPath = path.join(tempHome, 'skills-hub')
    expect(await fs.pathExists(path.join(hubPath, 'app-router-helper', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'ssr-ssg-advisor', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'test-coverage-analyzer', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'web-design-guidelines', 'SKILL.md'))).toBe(false)
    expect(await fs.pathExists(path.join(hubPath, 'unselected-helper', 'SKILL.md'))).toBe(false)

    await fs.writeJson(
      catalogPath,
      {
        version: 1,
        presets: [demoWebPreset, demoDesignPreset],
      },
      { spaces: 2 }
    )

    const installedSharedSource = await runCli(['official', 'install', '--id', 'demo-design'], env)
    expect(installedSharedSource.stdout).toContain('Official preset installed: demo-design')
    expect(await fs.pathExists(path.join(hubPath, 'app-router-helper', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'ssr-ssg-advisor', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'web-design-guidelines', 'SKILL.md'))).toBe(true)
    expect(await fs.pathExists(path.join(hubPath, 'unselected-helper', 'SKILL.md'))).toBe(false)

    await runCli(['official', 'install', '--id', 'demo-web'], env)
    const kitsAfterReinstall = await runCli(['kit', 'list'], env)
    const matchingLines = kitsAfterReinstall.stdout
      .split('\n')
      .filter((line) => line.includes('Official: Demo Web Preset'))
    expect(matchingLines).toHaveLength(1)
  }, 20_000)
})
