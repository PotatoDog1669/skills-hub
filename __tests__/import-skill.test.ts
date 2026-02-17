import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import matter from 'gray-matter'
import { describe, expect, test } from 'vitest'
import {
  parseSkillImportUrl,
  buildGitSourceUrl,
  attachSkillImportMetadata,
} from '../lib/import-skill'

describe('import skill helpers', () => {
  test('parseSkillImportUrl parses tree URL correctly', () => {
    const parsed = parseSkillImportUrl('https://github.com/owner/repo/tree/main/skills/my-skill')
    expect(parsed.repoUrl).toBe('https://github.com/owner/repo.git')
    expect(parsed.repoWebUrl).toBe('https://github.com/owner/repo')
    expect(parsed.branch).toBe('main')
    expect(parsed.subdir).toBe('skills/my-skill')
    expect(parsed.skillName).toBe('my-skill')
  })

  test('attachSkillImportMetadata writes source fields to SKILL.md', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-test-'))
    const skillDir = path.join(tempDir, 'demo-skill')
    const skillPath = path.join(skillDir, 'SKILL.md')

    try {
      await fs.ensureDir(skillDir)
      await fs.writeFile(
        skillPath,
        `---
name: Demo Skill
description: test
---

hello
`
      )

      const sourceUrl = buildGitSourceUrl('https://github.com/owner/repo', 'main', 'skills/demo')
      await attachSkillImportMetadata(skillDir, {
        sourceRepo: 'https://github.com/owner/repo',
        sourceUrl,
        sourceSubdir: 'skills/demo',
        sourceLastUpdated: '2026-01-01T00:00:00.000Z',
        importedAt: '2026-02-01T00:00:00.000Z',
      })

      const saved = await fs.readFile(skillPath, 'utf-8')
      const parsed = matter(saved)
      expect(parsed.data['source_repo']).toBe('https://github.com/owner/repo')
      expect(parsed.data['source_url']).toBe(sourceUrl)
      expect(parsed.data['source_branch']).toBeUndefined()
      expect(parsed.data['source_subdir']).toBe('skills/demo')
      expect(parsed.data['source_last_updated']).toBe('2026-01-01T00:00:00.000Z')
      expect(parsed.data['imported_at']).toBe('2026-02-01T00:00:00.000Z')
    } finally {
      await fs.remove(tempDir)
    }
  })
})
