// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { getProjectScanCachePath, scanForProjects } from '@/lib/scanner'

describe('scanForProjects', () => {
  let tempRoot: string
  let tempHome: string
  let originalHome: string | undefined

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-scanner-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
    originalHome = process.env.HOME
    process.env.HOME = tempHome
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    await fs.remove(tempRoot)
  })

  it('finds a git repository with .git directory', async () => {
    const repoPath = path.join(tempRoot, 'repo-a')
    await fs.ensureDir(path.join(repoPath, '.git'))

    const projects = await scanForProjects([tempRoot])
    expect(projects).toContain(path.resolve(repoPath))
  })

  it('does not include directories that only contain agent skill folders', async () => {
    const nonGitProject = path.join(tempRoot, 'plain-project')
    await fs.ensureDir(path.join(nonGitProject, '.agent', 'skills'))

    const projects = await scanForProjects([tempRoot])
    expect(projects).not.toContain(path.resolve(nonGitProject))
  })

  it('finds a git worktree-style repository with .git file', async () => {
    const repoPath = path.join(tempRoot, 'repo-worktree')
    await fs.ensureDir(repoPath)
    await fs.writeFile(path.join(repoPath, '.git'), 'gitdir: /tmp/worktrees/repo-worktree')

    const projects = await scanForProjects([tempRoot])
    expect(projects).toContain(path.resolve(repoPath))
  })

  it('skips ignored directories like node_modules', async () => {
    const ignoredRepo = path.join(tempRoot, 'node_modules', 'hidden-repo')
    await fs.ensureDir(path.join(ignoredRepo, '.git'))

    const projects = await scanForProjects([tempRoot])
    expect(projects).not.toContain(path.resolve(ignoredRepo))
  })

  it('respects max depth and does not include repositories deeper than 5 levels', async () => {
    const deepRepo = path.join(tempRoot, 'a', 'b', 'c', 'd', 'e', 'f', 'deep-repo')
    await fs.ensureDir(path.join(deepRepo, '.git'))

    const projects = await scanForProjects([tempRoot])
    expect(projects).not.toContain(path.resolve(deepRepo))
  })

  it('writes and reuses cache entries for unchanged directories', async () => {
    const repoPath = path.join(tempRoot, 'repo-cache')
    await fs.ensureDir(path.join(repoPath, '.git'))

    const readdirSpy = vi.spyOn(fs, 'readdir')

    const firstScan = await scanForProjects([tempRoot])
    const firstReaddirCount = readdirSpy.mock.calls.length

    const secondScan = await scanForProjects([tempRoot])
    const secondReaddirCount = readdirSpy.mock.calls.length - firstReaddirCount

    expect(firstScan).toContain(path.resolve(repoPath))
    expect(secondScan).toEqual(firstScan)
    expect(firstReaddirCount).toBeGreaterThan(0)
    expect(secondReaddirCount).toBeLessThan(firstReaddirCount)

    const cachePath = getProjectScanCachePath()
    const cacheContent = await fs.readJson(cachePath)
    const rootKey = path.resolve(tempRoot)
    expect(cacheContent.roots[rootKey]).toBeDefined()
    expect(cacheContent.roots[rootKey].directories[rootKey]).toBeDefined()
  })

  it('bypasses cache when force is enabled', async () => {
    const repoPath = path.join(tempRoot, 'repo-force')
    await fs.ensureDir(path.join(repoPath, '.git'))
    await scanForProjects([tempRoot])

    const readdirSpy = vi.spyOn(fs, 'readdir')

    await scanForProjects([tempRoot])
    const nonForceCalls = readdirSpy.mock.calls.length

    await scanForProjects([tempRoot], { force: true })
    const forceCalls = readdirSpy.mock.calls.length - nonForceCalls

    expect(nonForceCalls).toBe(0)
    expect(forceCalls).toBeGreaterThan(0)
  })
})
