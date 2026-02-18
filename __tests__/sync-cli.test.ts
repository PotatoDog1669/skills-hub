// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

describe('sync CLI dry-run', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-sync-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('prints JSON preview and does not write target files', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const hubPath = path.join(tempRoot, 'hub')
    const agentRoot = path.join(tempRoot, 'agent-skills')
    await fs.ensureDir(hubPath)
    await fs.ensureDir(agentRoot)

    const addSkill = path.join(hubPath, 'skill-add')
    const updateSkill = path.join(hubPath, 'skill-update')
    const linkSkill = path.join(hubPath, 'skill-link')
    for (const skillPath of [addSkill, updateSkill, linkSkill]) {
      await fs.ensureDir(skillPath)
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), '# skill\n', 'utf-8')
    }

    const existingUpdateDest = path.join(agentRoot, 'skill-update')
    await fs.ensureDir(existingUpdateDest)
    await fs.writeFile(path.join(existingUpdateDest, 'SKILL.md'), '# old\n', 'utf-8')

    const oldLinkTarget = path.join(tempRoot, 'old-link-target')
    await fs.ensureDir(oldLinkTarget)
    await fs.ensureSymlink(oldLinkTarget, path.join(agentRoot, 'skill-link'))

    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJson(
      configPath,
      {
        hubPath,
        projects: [],
        scanRoots: [],
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

    const result = await execFileAsync(
      'node',
      ['bin/skills-hub', 'sync', '--target', 'Claude', '--dry-run'],
      { cwd: repoRoot, env }
    )

    const lines = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const preview = JSON.parse(lines[0])
    expect(preview).toMatchObject({
      action: 'sync',
      dryRun: true,
      mode: 'copy',
    })
    expect(Array.isArray(preview.changes)).toBe(true)

    const changeTypes = new Set(preview.changes.map((change: { type: string }) => change.type))
    expect(changeTypes.has('add')).toBe(true)
    expect(changeTypes.has('update')).toBe(true)
    expect(changeTypes.has('delete')).toBe(true)
    expect(lines[1]).toContain('Dry run summary:')

    expect(await fs.pathExists(path.join(agentRoot, 'skill-add'))).toBe(false)
    expect(await fs.readFile(path.join(existingUpdateDest, 'SKILL.md'), 'utf-8')).toBe('# old\n')
    expect((await fs.lstat(path.join(agentRoot, 'skill-link'))).isSymbolicLink()).toBe(true)
    expect(await fs.readlink(path.join(agentRoot, 'skill-link'))).toBe(oldLinkTarget)
  })
})
