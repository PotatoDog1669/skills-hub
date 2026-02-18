// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

describe('scan-projects CLI', () => {
  let tempRoot: string
  let tempHome: string
  let scanRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-scan-cli-'))
    tempHome = path.join(tempRoot, 'home')
    scanRoot = path.join(tempRoot, 'workspace')

    await fs.ensureDir(path.join(scanRoot, 'repo-a', '.git'))

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(configPath, {
      scanRoots: [scanRoot],
    })
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('scans projects and writes the scan cache file', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const result = await execFileAsync('node', ['bin/skills-hub', 'scan-projects'], {
      cwd: repoRoot,
      env,
    })

    const expectedRepoPath = path.resolve(path.join(scanRoot, 'repo-a'))
    expect(result.stdout).toContain('Scanned roots: 1')
    expect(result.stdout).toContain('Projects found: 1')
    expect(result.stdout).toContain('Duration:')
    expect(result.stdout).toContain(expectedRepoPath)

    const cachePath = path.join(tempHome, '.skills-hub', 'cache', 'project-scan.json')
    const cacheContent = await fs.readJson(cachePath)
    expect(cacheContent.roots[path.resolve(scanRoot)]).toBeDefined()
  })

  it('supports --force refresh', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    await execFileAsync('node', ['bin/skills-hub', 'scan-projects'], {
      cwd: repoRoot,
      env,
    })

    const forced = await execFileAsync('node', ['bin/skills-hub', 'scan-projects', '--force'], {
      cwd: repoRoot,
      env,
    })

    expect(forced.stdout).toContain('force refresh')
  })
})
