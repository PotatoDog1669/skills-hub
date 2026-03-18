import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { DEFAULT_INSTRUCTION_FILE_NAME, getAgentInstructionFileName } from '@/lib/core/agent-config'

const CONFIG_PATH = path.join(os.homedir(), '.skills-hub', 'config.json')
const CONFIG_DIR = path.dirname(CONFIG_PATH)

function normalizeAbsolutePath(inputPath: string): string {
  const trimmed = inputPath.trim()
  if (!trimmed) return ''

  const expandedPath =
    trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')
      ? path.join(os.homedir(), trimmed.slice(1))
      : trimmed

  return path.resolve(expandedPath)
}

function dedupeNormalizedPaths(paths: string[] | undefined): string[] {
  if (!paths || paths.length === 0) return []
  const normalized = paths
    .map((entry) => normalizeAbsolutePath(entry))
    .filter((entry) => entry.length > 0)
  return Array.from(new Set(normalized))
}

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
  instructionFileName?: string // Project instruction file e.g., AGENTS.md or CLAUDE.md
  enabled: boolean
  isCustom: boolean
}

export { DEFAULT_INSTRUCTION_FILE_NAME, getAgentInstructionFileName } from '@/lib/core/agent-config'

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: 'Antigravity',
    globalPath: path.join(os.homedir(), '.gemini/antigravity/skills'),
    projectPath: '.agent/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Claude Code',
    globalPath: path.join(os.homedir(), '.claude/skills'),
    projectPath: '.claude/skills',
    instructionFileName: 'CLAUDE.md',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Cursor',
    globalPath: path.join(os.homedir(), '.cursor/skills'),
    projectPath: '.cursor/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: true,
    isCustom: false,
  },
  {
    name: 'OpenClaw',
    globalPath: path.join(os.homedir(), '.openclaw/skills'),
    projectPath: 'skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'CodeBuddy',
    globalPath: path.join(os.homedir(), '.codebuddy/skills'),
    projectPath: '.codebuddy/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'OpenCode',
    globalPath: path.join(os.homedir(), '.config/opencode/skills'),
    projectPath: '.agents/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Codex',
    globalPath: path.join(os.homedir(), '.codex/skills'),
    projectPath: '.codex/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Kimi Code CLI',
    globalPath: path.join(os.homedir(), '.config/agents/skills'),
    projectPath: '.agents/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Kilo Code',
    globalPath: path.join(os.homedir(), '.kilocode/skills'),
    projectPath: '.kilocode/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Kiro CLI',
    globalPath: path.join(os.homedir(), '.kiro/skills'),
    projectPath: '.kiro/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Gemini CLI',
    globalPath: path.join(os.homedir(), '.gemini/skills'),
    projectPath: '.gemini/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'GitHub Copilot',
    globalPath: path.join(os.homedir(), '.copilot/skills'),
    projectPath: '.github/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Windsurf',
    globalPath: path.join(os.homedir(), '.codeium/windsurf/skills'),
    projectPath: '.windsurf/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Trae',
    globalPath: path.join(os.homedir(), '.trae/skills'),
    projectPath: '.trae/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Trae CN',
    globalPath: path.join(os.homedir(), '.trae-cn/skills'),
    projectPath: '.trae/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Qoder',
    globalPath: path.join(os.homedir(), '.qoder/skills'),
    projectPath: '.qoder/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: false,
    isCustom: false,
  },
  {
    name: 'Qwen Code',
    globalPath: path.join(os.homedir(), '.qwen/skills'),
    projectPath: '.qwen/skills',
    instructionFileName: DEFAULT_INSTRUCTION_FILE_NAME,
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

function mergeAgentsPreservingOrder(userAgents: AgentConfig[] | undefined): AgentConfig[] {
  const storedAgents = userAgents || []
  const defaultAgentsByName = new Map(DEFAULT_AGENTS.map((agent) => [agent.name, agent]))
  const seenAgentNames = new Set<string>()
  const mergedAgents: AgentConfig[] = []

  for (const storedAgent of storedAgents) {
    if (seenAgentNames.has(storedAgent.name)) {
      continue
    }

    const defaultAgent = defaultAgentsByName.get(storedAgent.name)
    if (defaultAgent) {
      mergedAgents.push({
        ...defaultAgent,
        enabled: storedAgent.enabled,
        projectPath: storedAgent.projectPath,
        globalPath: storedAgent.globalPath,
        instructionFileName: getAgentInstructionFileName(storedAgent),
      })
      seenAgentNames.add(storedAgent.name)
      continue
    }

    mergedAgents.push({
      ...storedAgent,
      instructionFileName: getAgentInstructionFileName(storedAgent),
    })
    seenAgentNames.add(storedAgent.name)
  }

  for (const defaultAgent of DEFAULT_AGENTS) {
    if (seenAgentNames.has(defaultAgent.name)) {
      continue
    }
    mergedAgents.push(defaultAgent)
  }

  return mergedAgents
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

    const normalizedProjects = dedupeNormalizedPaths(userConfig.projects)
    const normalizedScanRoots = userConfig.scanRoots
      ? dedupeNormalizedPaths(userConfig.scanRoots)
      : undefined

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      projects: normalizedProjects,
      scanRoots: normalizedScanRoots ?? DEFAULT_CONFIG.scanRoots,
      agents: mergeAgentsPreservingOrder(userConfig.agents),
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
  const normalizedPath = normalizeAbsolutePath(projectPath)
  if (!normalizedPath) return

  if (!config.projects.includes(normalizedPath)) {
    config.projects.push(normalizedPath)
    await saveConfig(config)
  }
}

export async function removeProjectPath(projectPath: string): Promise<void> {
  const config = await getConfig()
  const normalizedPath = normalizeAbsolutePath(projectPath)
  config.projects = config.projects.filter((p) => p !== normalizedPath)
  await saveConfig(config)
}

export async function addScanRoot(rootPath: string): Promise<void> {
  const config = await getConfig()
  const normalizedPath = normalizeAbsolutePath(rootPath)
  if (!normalizedPath) return

  if (!config.scanRoots.includes(normalizedPath)) {
    config.scanRoots.push(normalizedPath)
    await saveConfig(config)
  }
}

export async function removeScanRoot(rootPath: string): Promise<void> {
  const config = await getConfig()
  const normalizedPath = normalizeAbsolutePath(rootPath)
  config.scanRoots = config.scanRoots.filter((p) => p !== normalizedPath)
  await saveConfig(config)
}

export async function updateAgentConfig(agent: AgentConfig): Promise<void> {
  const config = await getConfig()
  const normalizedAgent = {
    ...agent,
    instructionFileName: getAgentInstructionFileName(agent),
  }
  const index = config.agents.findIndex((a) => a.name === agent.name)
  if (index >= 0) {
    config.agents[index] = normalizedAgent
  } else {
    config.agents.push(normalizedAgent)
  }
  await saveConfig(config)
}

export async function removeAgentConfig(agentName: string): Promise<void> {
  const config = await getConfig()
  config.agents = config.agents.filter((a) => a.name !== agentName)
  await saveConfig(config)
}
