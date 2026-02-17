import fs from 'fs-extra'
import matter from 'gray-matter'
import path from 'path'

export interface ParsedSkillImportUrl {
  repoUrl: string
  repoWebUrl: string
  branch?: string
  subdir: string
  skillName: string
}

export interface SkillImportMetadata {
  sourceRepo: string
  sourceUrl: string
  sourceSubdir?: string
  sourceLastUpdated: string
  importedAt: string
}

function normalizeRepoWebUrl(url: string): string {
  return url
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/, '')
}

export function parseSkillImportUrl(url: string, preferredBranch?: string): ParsedSkillImportUrl {
  const input = url.trim()
  if (!input) {
    throw new Error('Missing URL for import.')
  }

  let repoWebUrl = ''
  let branch = preferredBranch?.trim() || undefined
  let subdir = ''

  if (input.includes('/tree/')) {
    const [base, restRaw = ''] = input.split('/tree/', 2)
    repoWebUrl = normalizeRepoWebUrl(base)

    const rest = restRaw.replace(/^\/+/, '')
    if (rest) {
      const parts = rest.split('/').filter(Boolean)
      if (!branch && parts.length > 0) {
        branch = parts[0]
      }
      if (parts.length > 1) {
        subdir = parts.slice(1).join('/')
      }
    }
  } else {
    repoWebUrl = normalizeRepoWebUrl(input)
  }

  const skillName = subdir ? path.basename(subdir) : path.basename(repoWebUrl)
  if (!repoWebUrl || !skillName) {
    throw new Error('Invalid skill import URL.')
  }

  return {
    repoUrl: `${repoWebUrl}.git`,
    repoWebUrl,
    branch,
    subdir,
    skillName,
  }
}

export function buildGitSourceUrl(repoWebUrl: string, branch: string, subdir?: string): string {
  const normalizedRepoWebUrl = normalizeRepoWebUrl(repoWebUrl)
  if (!branch) {
    return normalizedRepoWebUrl
  }
  if (subdir) {
    return `${normalizedRepoWebUrl}/tree/${branch}/${subdir}`
  }
  return `${normalizedRepoWebUrl}/tree/${branch}`
}

export async function attachSkillImportMetadata(
  skillDirPath: string,
  metadata: SkillImportMetadata
) {
  const skillMdPath = path.join(skillDirPath, 'SKILL.md')
  if (!(await fs.pathExists(skillMdPath))) {
    return
  }

  const rawContent = await fs.readFile(skillMdPath, 'utf-8')
  const parsed = matter(rawContent)
  const restFrontmatter = { ...(parsed.data as Record<string, unknown>) }
  delete restFrontmatter.source_branch

  const nextFrontmatter: Record<string, unknown> = {
    ...restFrontmatter,
    source_repo: metadata.sourceRepo,
    source_url: metadata.sourceUrl,
    source_subdir: metadata.sourceSubdir || '/',
    source_last_updated: metadata.sourceLastUpdated,
    imported_at: metadata.importedAt,
  }

  const nextRawContent = matter.stringify(parsed.content, nextFrontmatter)
  await fs.writeFile(skillMdPath, nextRawContent)
}
