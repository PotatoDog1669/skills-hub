type GithubRepoInfo = {
  owner: string
  repo: string
}

type GithubReference = GithubRepoInfo & {
  branch?: string
  filePath?: string
  searchPrefix?: string
}

type GithubRepoResponse = {
  default_branch: string
}

type GithubTreeResponse = {
  truncated?: boolean
  tree?: Array<{
    path?: string
    type?: string
  }>
}

type GithubContentResponse = {
  type?: string
  path?: string
  encoding?: string
  content?: string
}

export type ResolveAgentsFromGithubResult = {
  owner: string
  repo: string
  branch: string
  filePath: string
  content: string
  sourceUrl: string
  suggestedName: string
}

const GITHUB_API_BASE = 'https://api.github.com'

function decodePathSegment(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

function normalizePath(input: string): string {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function encodeApiPath(input: string): string {
  return normalizePath(input)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function getBasename(input: string): string {
  const normalized = normalizePath(input)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function dirname(input: string): string {
  const normalized = normalizePath(input)
  const index = normalized.lastIndexOf('/')
  if (index < 0) return ''
  return normalized.slice(0, index)
}

function isAgentsMarkdownPath(input: string): boolean {
  return getBasename(input).toLowerCase() === 'agents.md'
}

function sanitizeSuggestedName(input: string): string {
  const value = String(input || '').trim()
  if (!value) return 'Imported AGENTS.md'
  return value.replace(/\s+/g, ' ')
}

function decodeBase64ToUtf8(input: string): string {
  const normalized = String(input || '').replace(/\s+/g, '')
  if (!normalized) return ''

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf8')
  }

  if (typeof atob !== 'function') {
    throw new Error('当前环境不支持 base64 解码。')
  }

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

async function readApiError(response: Response): Promise<string> {
  let detail = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as { message?: string }
    if (body?.message) {
      detail = body.message
    }
  } catch {
    // ignore parse failure
  }
  return detail
}

async function githubApiJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'skills-hub',
    },
  })

  if (!response.ok) {
    const detail = await readApiError(response)
    if (response.status === 403 && /rate limit/i.test(detail)) {
      throw new Error('GitHub API 访问频率已达上限，请稍后再试。')
    }
    throw new Error(`GitHub API 请求失败：${detail}`)
  }

  return (await response.json()) as T
}

async function githubBranchExists(repo: GithubRepoInfo, branch: string): Promise<boolean> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/branches/${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'skills-hub',
      },
    }
  )

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    const detail = await readApiError(response)
    throw new Error(`GitHub 分支查询失败：${detail}`)
  }

  return true
}

async function resolveBranchAndSubpath(
  repo: GithubRepoInfo,
  segments: string[]
): Promise<{ branch?: string; subpath: string }> {
  const decoded = segments.map((segment) => decodePathSegment(segment)).filter(Boolean)
  if (decoded.length === 0) {
    return { branch: undefined, subpath: '' }
  }

  for (let split = decoded.length; split >= 1; split -= 1) {
    const branch = decoded.slice(0, split).join('/')
    if (!branch) continue
    if (await githubBranchExists(repo, branch)) {
      return {
        branch,
        subpath: decoded.slice(split).join('/'),
      }
    }
  }

  return {
    branch: decoded[0],
    subpath: decoded.slice(1).join('/'),
  }
}

function extractRepoInfo(url: URL): GithubRepoInfo {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('GitHub 链接格式不正确，至少需要 owner/repo。')
  }

  return {
    owner: decodePathSegment(segments[0]),
    repo: decodePathSegment(segments[1]).replace(/\.git$/i, ''),
  }
}

async function parseGithubReference(input: string): Promise<GithubReference> {
  const normalized = String(input || '').trim()
  if (!normalized) {
    throw new Error('请输入 GitHub 链接。')
  }

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('GitHub 链接无效，请检查后重试。')
  }

  const host = url.hostname.toLowerCase()
  if (host === 'raw.githubusercontent.com') {
    const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodePathSegment(segment))
    if (segments.length < 4) {
      throw new Error('raw.githubusercontent.com 链接格式不正确。')
    }

    return {
      owner: segments[0],
      repo: segments[1].replace(/\.git$/i, ''),
      branch: segments[2],
      filePath: segments.slice(3).join('/'),
      searchPrefix: dirname(segments.slice(3).join('/')),
    }
  }

  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new Error('仅支持 github.com 或 raw.githubusercontent.com 链接。')
  }

  const repo = extractRepoInfo(url)
  const segments = url.pathname.split('/').filter(Boolean)
  const mode = segments[2]?.toLowerCase()

  if (mode === 'blob' || mode === 'tree') {
    const resolved = await resolveBranchAndSubpath(repo, segments.slice(3))
    if (mode === 'blob') {
      return {
        ...repo,
        branch: resolved.branch,
        filePath: normalizePath(resolved.subpath),
        searchPrefix: dirname(resolved.subpath),
      }
    }

    return {
      ...repo,
      branch: resolved.branch,
      searchPrefix: normalizePath(resolved.subpath),
    }
  }

  return repo
}

async function getDefaultBranch(repo: GithubRepoInfo): Promise<string> {
  const payload = await githubApiJson<GithubRepoResponse>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
  )

  const branch = String(payload?.default_branch || '').trim()
  if (!branch) {
    throw new Error('无法读取仓库默认分支。')
  }
  return branch
}

async function fetchGithubFileContent(
  repo: GithubRepoInfo,
  branch: string,
  filePath: string
): Promise<string> {
  const payload = await githubApiJson<GithubContentResponse>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodeApiPath(filePath)}?ref=${encodeURIComponent(branch)}`
  )

  if (payload?.type !== 'file') {
    throw new Error(`目标路径不是文件：${filePath}`)
  }

  if (payload?.encoding === 'base64' && payload?.content) {
    return decodeBase64ToUtf8(payload.content)
  }

  throw new Error(`无法读取文件内容：${filePath}`)
}

function selectBestAgentsPath(paths: string[]): string {
  const sorted = [...paths].sort((left, right) => {
    const leftLower = left.toLowerCase()
    const rightLower = right.toLowerCase()

    if (leftLower === 'agents.md' && rightLower !== 'agents.md') return -1
    if (rightLower === 'agents.md' && leftLower !== 'agents.md') return 1

    const leftDepth = left.split('/').length
    const rightDepth = right.split('/').length
    if (leftDepth !== rightDepth) return leftDepth - rightDepth

    if (left.length !== right.length) return left.length - right.length
    return left.localeCompare(right)
  })

  return sorted[0]
}

async function searchAgentsPath(
  repo: GithubRepoInfo,
  branch: string,
  searchPrefix?: string
): Promise<string> {
  const tree = await githubApiJson<GithubTreeResponse>(
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  )

  if (tree.truncated) {
    throw new Error('仓库文件过多，GitHub API 返回被截断，无法可靠定位 AGENTS.md。')
  }

  const allCandidates = (tree.tree || [])
    .filter((entry) => entry?.type === 'blob' && isAgentsMarkdownPath(entry?.path || ''))
    .map((entry) => normalizePath(entry.path || ''))
    .filter(Boolean)

  if (allCandidates.length === 0) {
    throw new Error('未在该仓库中找到 AGENTS.md。')
  }

  const prefix = normalizePath(searchPrefix || '')
  if (!prefix) {
    return selectBestAgentsPath(allCandidates)
  }

  const lowerPrefix = prefix.toLowerCase()
  const scoped = allCandidates.filter((entry) => {
    const lowerEntry = entry.toLowerCase()
    return lowerEntry === lowerPrefix || lowerEntry.startsWith(`${lowerPrefix}/`)
  })

  if (scoped.length > 0) {
    return selectBestAgentsPath(scoped)
  }

  return selectBestAgentsPath(allCandidates)
}

function buildSuggestedPolicyName(repo: string, filePath: string): string {
  const normalizedRepo = sanitizeSuggestedName(repo.replace(/[-_]+/g, ' '))
  const normalizedPath = normalizePath(filePath)
  if (!normalizedPath || normalizedPath.toLowerCase() === 'agents.md') {
    return sanitizeSuggestedName(`${normalizedRepo} AGENTS`)
  }

  const parent = dirname(normalizedPath).split('/').filter(Boolean).pop() || ''
  if (!parent) {
    return sanitizeSuggestedName(`${normalizedRepo} AGENTS`)
  }

  return sanitizeSuggestedName(`${normalizedRepo} ${parent} AGENTS`)
}

function buildSourceUrl(result: { owner: string; repo: string; branch: string; filePath: string }): string {
  const pathPart = normalizePath(result.filePath)
  if (!pathPart) {
    return `https://github.com/${result.owner}/${result.repo}`
  }
  return `https://github.com/${result.owner}/${result.repo}/blob/${result.branch}/${pathPart}`
}

export async function resolveAgentsFromGithub(
  inputUrl: string
): Promise<ResolveAgentsFromGithubResult> {
  const reference = await parseGithubReference(inputUrl)
  const repo = { owner: reference.owner, repo: reference.repo }
  const branch = reference.branch || (await getDefaultBranch(repo))

  let filePath = normalizePath(reference.filePath || '')

  if (filePath && isAgentsMarkdownPath(filePath)) {
    const content = await fetchGithubFileContent(repo, branch, filePath)
    return {
      owner: repo.owner,
      repo: repo.repo,
      branch,
      filePath,
      content,
      sourceUrl: buildSourceUrl({ owner: repo.owner, repo: repo.repo, branch, filePath }),
      suggestedName: buildSuggestedPolicyName(repo.repo, filePath),
    }
  }

  filePath = await searchAgentsPath(repo, branch, reference.searchPrefix || filePath)
  const content = await fetchGithubFileContent(repo, branch, filePath)

  return {
    owner: repo.owner,
    repo: repo.repo,
    branch,
    filePath,
    content,
    sourceUrl: buildSourceUrl({ owner: repo.owner, repo: repo.repo, branch, filePath }),
    suggestedName: buildSuggestedPolicyName(repo.repo, filePath),
  }
}
