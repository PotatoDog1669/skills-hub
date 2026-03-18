export const DEFAULT_INSTRUCTION_FILE_NAME = 'AGENTS.md'

export function getDefaultInstructionFileName(agentName?: string): string {
  return String(agentName || '').trim().toLowerCase() === 'claude code'
    ? 'CLAUDE.md'
    : DEFAULT_INSTRUCTION_FILE_NAME
}

export function getAgentInstructionFileName(
  agent?: { name?: string; instructionFileName?: string | null } | null
): string {
  const explicit = String(agent?.instructionFileName || '').trim()
  if (explicit) {
    return explicit
  }
  return getDefaultInstructionFileName(agent?.name)
}
