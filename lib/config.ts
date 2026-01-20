import fs from 'fs-extra'
import path from 'path'
import os from 'os'

const CONFIG_PATH = path.join(os.homedir(), '.skills-hub', 'config.json')
const CONFIG_DIR = path.dirname(CONFIG_PATH)

export interface AppConfig {
  hubPath: string
  projects: string[]
  scanRoots: string[] // Directories to scan
  agents: AgentConfig[] // Agents configuration
}

export interface AgentConfig {
  name: string
  globalPath: string // Path to global skills directory e.g., ~/.gemini/antigravity/skills
  projectPath: string // Relative path in project e.g., .agent/skills
  enabled: boolean
  isCustom: boolean
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: 'Antigravity',
    globalPath: path.join(os.homedir(), '.gemini/antigravity/skills'),
    projectPath: '.agent/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Claude Code',
    globalPath: path.join(os.homedir(), '.claude/skills'),
    projectPath: '.claude/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Cursor',
    globalPath: path.join(os.homedir(), '.cursor/skills'),
    projectPath: '.cursor/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'OpenCode',
    globalPath: path.join(os.homedir(), '.config/opencode/skill'),
    projectPath: '.opencode/skill',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Codex',
    globalPath: path.join(os.homedir(), '.codex/skills'),
    projectPath: '.codex/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Amp',
    globalPath: path.join(os.homedir(), '.config/agents/skills'),
    projectPath: '.agents/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Kilo Code',
    globalPath: path.join(os.homedir(), '.kilocode/skills'),
    projectPath: '.kilocode/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Roo Code',
    globalPath: path.join(os.homedir(), '.roo/skills'),
    projectPath: '.roo/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Goose',
    globalPath: path.join(os.homedir(), '.config/goose/skills'),
    projectPath: '.goose/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Gemini CLI',
    globalPath: path.join(os.homedir(), '.gemini/skills'),
    projectPath: '.gemini/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'GitHub Copilot',
    globalPath: path.join(os.homedir(), '.copilot/skills'),
    projectPath: '.github/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Clawdbot',
    globalPath: path.join(os.homedir(), '.clawdbot/skills'),
    projectPath: 'skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Droid',
    globalPath: path.join(os.homedir(), '.factory/skills'),
    projectPath: '.factory/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Windsurf',
    globalPath: path.join(os.homedir(), '.codeium/windsurf/skills'),
    projectPath: '.windsurf/skills',
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Qoder',
    globalPath: path.join(os.homedir(), '.qoder/skills'),
    projectPath: '.qoder/skills',
    enabled: false,
    isCustom: false,
  },
]

const DEFAULT_CONFIG: AppConfig = {
  hubPath: path.join(os.homedir(), 'skills-hub'),
  projects: [],
  scanRoots: [path.join(os.homedir(), 'workspace')],
  agents: DEFAULT_AGENTS,
}

export async function getConfig(): Promise<AppConfig> {
  try {
    await fs.ensureFile(CONFIG_PATH)
    const content = await fs.readFile(CONFIG_PATH, 'utf-8')
    if (!content.trim()) {
      await fs.writeJSON(CONFIG_PATH, DEFAULT_CONFIG, { spaces: 2 })
      return DEFAULT_CONFIG
    }
    let userConfig: Partial<AppConfig>
    try {
      userConfig = JSON.parse(content)
    } catch (error) {
      console.warn('Invalid config.json; restoring defaults.', error)
      await fs.ensureDir(CONFIG_DIR)
      const backupPath = path.join(CONFIG_DIR, `config.json.bak-${Date.now()}`)
      await fs.writeFile(backupPath, content, 'utf-8')
      await fs.writeJSON(CONFIG_PATH, DEFAULT_CONFIG, { spaces: 2 })
      return DEFAULT_CONFIG
    }

    // Smart merge for agents
    const mergedAgents = [...DEFAULT_AGENTS]
    const userAgents = userConfig.agents || []

    // 1. Update state of built-in agents from user config
    mergedAgents.forEach((agent, index) => {
      const userAgent = userAgents.find((ua: AgentConfig) => ua.name === agent.name)
      if (userAgent) {
        mergedAgents[index] = {
          ...agent,
          enabled: userAgent.enabled,
          projectPath: userAgent.projectPath,
          globalPath: userAgent.globalPath,
        }
      }
    })

    // 2. Add custom agents from user config
    const customAgents = userAgents.filter((ua: AgentConfig) => ua.isCustom)

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      agents: [...mergedAgents, ...customAgents],
    }
  } catch (error) {
    console.warn('Failed to load config; using defaults.', error)
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.ensureDir(CONFIG_DIR)
  await fs.writeJSON(CONFIG_PATH, config, { spaces: 2 })
}

export async function addProjectPath(projectPath: string): Promise<void> {
  const config = await getConfig()
  if (!config.projects.includes(projectPath)) {
    config.projects.push(projectPath)
    await saveConfig(config)
  }
}

export async function removeProjectPath(projectPath: string): Promise<void> {
  const config = await getConfig()
  config.projects = config.projects.filter((p) => p !== projectPath)
  await saveConfig(config)
}

export async function addScanRoot(rootPath: string): Promise<void> {
  const config = await getConfig()
  if (!config.scanRoots.includes(rootPath)) {
    config.scanRoots.push(rootPath)
    await saveConfig(config)
  }
}

export async function removeScanRoot(rootPath: string): Promise<void> {
  const config = await getConfig()
  config.scanRoots = config.scanRoots.filter((p) => p !== rootPath)
  await saveConfig(config)
}

export async function updateAgentConfig(agent: AgentConfig): Promise<void> {
  const config = await getConfig()
  const index = config.agents.findIndex((a) => a.name === agent.name)
  if (index >= 0) {
    config.agents[index] = agent
  } else {
    config.agents.push(agent)
  }
  await saveConfig(config)
}

export async function removeAgentConfig(agentName: string): Promise<void> {
  const config = await getConfig()
  config.agents = config.agents.filter((a) => a.name !== agentName)
  await saveConfig(config)
}
