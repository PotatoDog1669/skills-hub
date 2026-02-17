// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { isInsideGitWorkTree } from '@/lib/git'

const execFileAsync = promisify(execFile)

describe('isInsideGitWorkTree', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-git-check-'))
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('returns false for non-git directories', async () => {
    const plainDir = path.join(tempRoot, 'plain-project')
    await fs.ensureDir(plainDir)

    await expect(isInsideGitWorkTree(plainDir)).resolves.toBe(false)
  })

  it('returns true for git repository root directories', async () => {
    const repoRoot = path.join(tempRoot, 'repo-root')
    await fs.ensureDir(repoRoot)
    await execFileAsync('git', ['init'], { cwd: repoRoot })

    await expect(isInsideGitWorkTree(repoRoot)).resolves.toBe(true)
  })

  it('returns true for subdirectories inside a git repository', async () => {
    const repoRoot = path.join(tempRoot, 'repo-subdir')
    const nestedDir = path.join(repoRoot, 'packages', 'core')
    await fs.ensureDir(repoRoot)
    await execFileAsync('git', ['init'], { cwd: repoRoot })
    await fs.ensureDir(nestedDir)

    await expect(isInsideGitWorkTree(nestedDir)).resolves.toBe(true)
  })
})
