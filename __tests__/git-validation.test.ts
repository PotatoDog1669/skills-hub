// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('actionAddProject git validation', () => {
  let tempRoot: string
  let tempHome: string
  let originalHome: string | undefined

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-git-check-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
    originalHome = process.env.HOME
    process.env.HOME = tempHome
    vi.resetModules()
  })

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    await fs.remove(tempRoot)
  })

  it('rejects non-git directories', async () => {
    const plainDir = path.join(tempRoot, 'plain-project')
    await fs.ensureDir(plainDir)

    const { actionAddProject } = await import('@/app/actions')
    await expect(actionAddProject(plainDir)).rejects.toThrow(
      /Only git repositories can be added as projects/
    )
  })

  it('accepts git repository root directories', async () => {
    const repoRoot = path.join(tempRoot, 'repo-root')
    await fs.ensureDir(repoRoot)
    await execFileAsync('git', ['init'], { cwd: repoRoot })

    const { actionAddProject } = await import('@/app/actions')
    const { getConfig } = await import('@/lib/config')

    await actionAddProject(repoRoot)

    const config = await getConfig()
    expect(config.projects).toContain(path.resolve(repoRoot))
  })

  it('accepts subdirectories inside a git repository', async () => {
    const repoRoot = path.join(tempRoot, 'repo-subdir')
    const nestedDir = path.join(repoRoot, 'packages', 'core')
    await fs.ensureDir(repoRoot)
    await execFileAsync('git', ['init'], { cwd: repoRoot })
    await fs.ensureDir(nestedDir)

    const { actionAddProject } = await import('@/app/actions')
    const { getConfig } = await import('@/lib/config')

    await actionAddProject(nestedDir)

    const config = await getConfig()
    expect(config.projects).toContain(path.resolve(nestedDir))
  })
})
