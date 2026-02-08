// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()

describe('provider CLI', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-provider-cli-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('supports add/list/switch flow for claude', async () => {
    const configPath = path.join(tempRoot, 'claude-provider.json')
    await fs.writeJson(configPath, {
      api_key: 'cli-key-123',
      model: 'claude-sonnet-4',
    })

    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const added = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'provider',
        'add',
        '--app',
        'claude',
        '--name',
        'cli-demo',
        '--config-file',
        configPath,
      ],
      { cwd: repoRoot, env }
    )

    expect(added.stdout).toContain('Provider created:')

    const listed = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'list', '--app', 'claude'],
      { cwd: repoRoot, env }
    )

    expect(listed.stdout).toContain('cli-demo')

    const providerId = listed.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()

    expect(providerId).toBeTruthy()

    const switched = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'switch', '--app', 'claude', '--id', providerId!],
      { cwd: repoRoot, env }
    )

    expect(switched.stdout).toContain('Switched claude:')

    const settingsPath = path.join(tempHome, '.claude', 'settings.json')
    const settings = await fs.readJson(settingsPath)
    expect(settings).toMatchObject({ api_key: 'cli-key-123', model: 'claude-sonnet-4' })
  })
})
