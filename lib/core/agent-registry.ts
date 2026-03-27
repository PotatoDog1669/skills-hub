import { DEFAULT_INSTRUCTION_FILE_NAME, getDefaultInstructionFileName } from '@/lib/core/agent-config'
import builtinAgentDefinitions from '@/data/builtin-agents.json'

export type BuiltinAgentDefinition = {
  name: string
  globalPathRelative: string
  projectPath: string
  scanProjectPaths?: string[]
  instructionFileName?: string
  enabled: boolean
}

export type BuiltinAgentConfig = {
  name: string
  globalPath: string
  projectPath: string
  instructionFileName: string
  enabled: boolean
  isCustom: false
}

export type BuiltinAgentDocRow = {
  name: string
  globalPath: string
  projectPath: string
}

export const BUILTIN_AGENT_DEFINITIONS: BuiltinAgentDefinition[] =
  builtinAgentDefinitions as BuiltinAgentDefinition[]

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function joinAbsolutePath(basePath: string, relativePath: string): string {
  const normalizedBase = basePath.replace(/\/+$/g, '') || '/'
  const normalizedRelative = trimSlashes(relativePath)
  if (!normalizedRelative) {
    return normalizedBase
  }
  if (normalizedBase === '/') {
    return `/${normalizedRelative}`
  }
  return `${normalizedBase}/${normalizedRelative}`
}

function toHomeRelativePath(relativePath: string): string {
  return `~/${trimSlashes(relativePath)}`
}

function resolveInstructionFileName(definition: BuiltinAgentDefinition): string {
  return definition.instructionFileName || getDefaultInstructionFileName(definition.name)
}

export function createBuiltinAgentConfigs(homeDir: string): BuiltinAgentConfig[] {
  return BUILTIN_AGENT_DEFINITIONS.map((definition) => ({
    name: definition.name,
    globalPath: joinAbsolutePath(homeDir, definition.globalPathRelative),
    projectPath: definition.projectPath,
    instructionFileName: resolveInstructionFileName(definition) || DEFAULT_INSTRUCTION_FILE_NAME,
    enabled: definition.enabled,
    isCustom: false,
  }))
}

export function getBuiltinAgentDocumentationRows(): BuiltinAgentDocRow[] {
  return BUILTIN_AGENT_DEFINITIONS.map((definition) => ({
    name: definition.name,
    globalPath: toHomeRelativePath(definition.globalPathRelative),
    projectPath: [definition.projectPath, ...(definition.scanProjectPaths || [])].join(' or '),
  }))
}
