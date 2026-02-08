// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { scanForProjects } from '@/lib/scanner'

describe('scanForProjects', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-scanner-'))
  })

  afterEach(async () => {
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
})
