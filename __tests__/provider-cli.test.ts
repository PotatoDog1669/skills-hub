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

  it('supports capture flow for official account', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const settingsPath = path.join(tempHome, '.claude', 'settings.json')
    await fs.ensureDir(path.dirname(settingsPath))
    await fs.writeJson(settingsPath, {
      api_key: 'official-token',
      model: 'claude-sonnet-4',
      account: 'work-login',
    })

    const captured = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'provider',
        'capture',
        '--app',
        'claude',
        '--name',
        'claude-official-work',
        '--account-name',
        'work-login',
      ],
      { cwd: repoRoot, env }
    )

    expect(captured.stdout).toContain('Provider captured from live config:')

    const listed = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'list', '--app', 'claude'],
      { cwd: repoRoot, env }
    )

    expect(listed.stdout).toContain('claude-official-work')
  })

  it('supports universal provider add/list/apply flow', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
    }

    const added = await execFileAsync(
      'node',
      [
        'bin/skills-hub',
        'provider',
        'universal-add',
        '--name',
        'newapi-shared',
        '--base-url',
        'https://gateway.example.com/v1',
        '--api-key',
        'shared-key-123',
        '--apps',
        'claude,codex',
        '--claude-model',
        'claude-sonnet-4',
        '--codex-model',
        'gpt-5.2',
      ],
      { cwd: repoRoot, env }
    )

    expect(added.stdout).toContain('Universal provider created:')

    const listedUniversal = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'universal-list'],
      { cwd: repoRoot, env }
    )
    expect(listedUniversal.stdout).toContain('newapi-shared')

    const universalId = listedUniversal.stdout
      .split('\\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
      ?.split('|')[0]
      ?.replace(/^-\s*/, '')
      ?.trim()
    expect(universalId).toBeTruthy()

    const reapplied = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'universal-apply', '--id', universalId!],
      { cwd: repoRoot, env }
    )
    expect(reapplied.stdout).toContain('Universal provider applied:')

    const claudeProviders = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'list', '--app', 'claude'],
      { cwd: repoRoot, env }
    )
    expect(claudeProviders.stdout).toContain('newapi-shared')

    const codexProviders = await execFileAsync(
      'node',
      ['bin/skills-hub', 'provider', 'list', '--app', 'codex'],
      { cwd: repoRoot, env }
    )
    expect(codexProviders.stdout).toContain('newapi-shared')
  })
})
