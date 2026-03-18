// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('default agent config', () => {
  const originalHome = process.env.HOME
  let tempHome = ''

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-config-'))
    process.env.HOME = tempHome
    vi.resetModules()
  })

  afterEach(async () => {
    process.env.HOME = originalHome
    await fs.remove(tempHome)
  })

  it('includes newly supported agents and upstream paths by default', async () => {
    const { getConfig } = await import('@/lib/config')
    const config = await getConfig()
    const byName = new Map(config.agents.map((agent) => [agent.name, agent]))

    expect(byName.get('OpenClaw')?.globalPath).toBe(path.join(tempHome, '.openclaw/skills'))
    expect(byName.get('CodeBuddy')?.projectPath).toBe('.codebuddy/skills')
    expect(byName.get('OpenCode')?.globalPath).toBe(path.join(tempHome, '.config/opencode/skills'))
    expect(byName.get('OpenCode')?.projectPath).toBe('.agents/skills')
    expect(byName.get('Kiro CLI')?.projectPath).toBe('.kiro/skills')
    expect(byName.get('Qwen Code')?.globalPath).toBe(path.join(tempHome, '.qwen/skills'))
    expect(byName.get('Trae CN')?.globalPath).toBe(path.join(tempHome, '.trae-cn/skills'))
    expect(byName.get('Kimi Code CLI')?.globalPath).toBe(
      path.join(tempHome, '.config/agents/skills')
    )
    expect(byName.has('Amp')).toBe(false)
    expect(byName.has('Roo Code')).toBe(false)
    expect(byName.has('Goose')).toBe(false)
    expect(byName.has('Droid')).toBe(false)
  })

  it('preserves stored agent order and appends newly missing defaults', async () => {
    const configPath = path.join(tempHome, '.skills-hub', 'config.json')
    await fs.ensureDir(path.dirname(configPath))
    await fs.writeJSON(
      configPath,
      {
        hubPath: path.join(tempHome, 'skills-hub'),
        projects: [],
        scanRoots: [],
        agents: [
          {
            name: 'Codex',
            globalPath: '/tmp/custom-codex',
            projectPath: '.codex/custom',
            enabled: true,
            isCustom: false,
          },
          {
            name: 'My Agent',
            globalPath: '/tmp/my-agent',
            projectPath: '.my-agent/skills',
            enabled: true,
            isCustom: true,
          },
          {
            name: 'Cursor',
            globalPath: '/tmp/custom-cursor',
            projectPath: '.cursor/custom',
            enabled: false,
            isCustom: false,
          },
        ],
      },
      { spaces: 2 }
    )

    const { getConfig } = await import('@/lib/config')
    const config = await getConfig()

    expect(config.agents.slice(0, 3).map((agent) => agent.name)).toEqual([
      'Codex',
      'My Agent',
      'Cursor',
    ])
    expect(config.agents.some((agent) => agent.name === 'Antigravity')).toBe(true)
  })
})
