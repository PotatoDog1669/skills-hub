// @vitest-environment node

import fs from 'fs-extra'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { getBuiltinAgentDocumentationRows } from '@/lib/core/agent-registry'

function parseSupportedAgentsTable(markdown: string) {
  const lines = markdown.split('\n')
  const rows: Array<{ name: string; globalPath: string; projectPath: string }> = []

  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      continue
    }
    if (line.includes('Agent Name') || line.includes(':---')) {
      continue
    }

    const columns = line
      .split('|')
      .slice(1, -1)
      .map((column) => column.trim())

    if (columns.length !== 3) {
      continue
    }

    rows.push({
      name: columns[0].replace(/\*\*/g, ''),
      globalPath: columns[1].replace(/`/g, ''),
      projectPath: columns[2].replace(/`/g, ''),
    })
  }

  return rows
}

describe('supported agents documentation', () => {
  it('matches the shared built-in agent registry', async () => {
    const docPath = path.join(process.cwd(), 'docs', 'supported-agents.md')
    const markdown = await fs.readFile(docPath, 'utf-8')

    expect(parseSupportedAgentsTable(markdown)).toEqual(getBuiltinAgentDocumentationRows())
  })
})
