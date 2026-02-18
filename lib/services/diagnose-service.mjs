import { spawnSync } from 'child_process'
import fs from 'fs-extra'
import matter from 'gray-matter'
import os from 'os'
import path from 'path'

const REASON_CODE_MISSING_BIN = 'missing_bin'
const REASON_CODE_MISSING_ANY_BIN = 'missing_any_bin'
const REASON_CODE_MISSING_ENV = 'missing_env'
const REASON_CODE_MISSING_CONFIG = 'missing_config'
const REASON_CODE_INVALID_FRONTMATTER = 'invalid_frontmatter'
const VALID_TARGET_KINDS = new Set(['hub', 'project', 'agent'])

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value
}

function getPathValue(container, dotPath) {
  const root = toObject(container)
  if (!root) return undefined

  const segments = dotPath
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)

  let current = root
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (toObject(current) && segment in current) {
      current = current[segment]
      continue
    }

    const remainingPath = segments.slice(index).join('.')
    if (toObject(current) && remainingPath in current) {
      return current[remainingPath]
    }

    return undefined
  }

  return current
}

function normalizeRequirementList(rawValue) {
  let candidates = []

  if (Array.isArray(rawValue)) {
    candidates = rawValue
  } else if (typeof rawValue === 'string') {
    candidates = rawValue.includes(',') ? rawValue.split(',') : [rawValue]
  }

  const normalized = []
  const seen = new Set()
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function parseSkillRequirements(frontmatter) {
  return {
    bins: normalizeRequirementList(getPathValue(frontmatter, 'metadata.openclaw.requires.bins')),
    anyBins: normalizeRequirementList(getPathValue(frontmatter, 'metadata.openclaw.requires.anyBins')),
    env: normalizeRequirementList(getPathValue(frontmatter, 'metadata.openclaw.requires.env')),
    config: normalizeRequirementList(getPathValue(frontmatter, 'metadata.openclaw.requires.config')),
  }
}

function formatBinNameForShell(binName) {
  return /^[A-Za-z0-9._+-]+$/.test(binName) ? binName : null
}

function buildMissingBinSuggestion(binName) {
  const formatted = formatBinNameForShell(binName)
  if (!formatted) {
    return `Install "${binName}" and make sure it is available on PATH.`
  }

  return (
    `Install "${formatted}" and make sure it is available on PATH ` +
    `(for example: "brew install ${formatted}" or "sudo apt-get install ${formatted}").`
  )
}

function buildMissingAnyBinSuggestion(binNames) {
  const normalized = Array.isArray(binNames) ? binNames.filter(Boolean) : []
  if (normalized.length === 0) {
    return 'Install at least one required binary and ensure it is available on PATH.'
  }
  const quoted = normalized.map((name) => `"${name}"`).join(', ')
  return `Install at least one of ${quoted} and ensure it is available on PATH.`
}

function buildMissingEnvSuggestion(envName) {
  return `Set environment variable "${envName}" (for example: "export ${envName}=<value>").`
}

function buildMissingConfigSuggestion(configKey) {
  return (
    `Set "${configKey}" in ${path.join(os.homedir(), '.skills-hub', 'config.json')} ` +
    'or pass it through your runtime config.'
  )
}

function hasEnvValue(env, envName) {
  const value = env?.[envName]
  return typeof value === 'string' && value.trim().length > 0
}

function hasConfigValue(config, configKey) {
  const value = getPathValue(config, configKey)
  if (value === undefined || value === null) return false
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return true
}

function hasBinary(binName, cache) {
  const normalized = String(binName || '').trim()
  if (!normalized) return false
  if (cache.has(normalized)) {
    return cache.get(normalized)
  }

  const command = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(command, [normalized], { stdio: 'ignore' })
  const available = result.status === 0
  cache.set(normalized, available)
  return available
}

function compareSkills(left, right) {
  const leftSource = String(left?.source || '')
  const rightSource = String(right?.source || '')
  if (leftSource !== rightSource) {
    return leftSource.localeCompare(rightSource)
  }

  const leftName = String(left?.name || '')
  const rightName = String(right?.name || '')
  if (leftName !== rightName) {
    return leftName.localeCompare(rightName)
  }

  return String(left?.path || '').localeCompare(String(right?.path || ''))
}

function normalizeTargets(targets) {
  const normalizedTargets = []
  const seen = new Set()
  for (const rawTarget of Array.isArray(targets) ? targets : []) {
    const rawKind = String(rawTarget?.kind || '').trim().toLowerCase()
    if (!VALID_TARGET_KINDS.has(rawKind)) continue

    const rawPath = String(rawTarget?.path || '').trim()
    if (!rawPath) continue
    const resolvedPath = path.resolve(rawPath)
    const dedupeKey = `${rawKind}:${resolvedPath}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    normalizedTargets.push({
      kind: rawKind,
      path: resolvedPath,
      label: String(rawTarget?.label || '').trim() || undefined,
    })
  }

  return normalizedTargets
}

async function collectSkillsFromTarget(target) {
  const targetPath = target.path
  const skills = []
  const seenPaths = new Set()

  if (!await fs.pathExists(targetPath)) {
    return { exists: false, skills }
  }

  const rootSkillPath = path.join(targetPath, 'SKILL.md')
  if (await fs.pathExists(rootSkillPath)) {
    skills.push({
      name: path.basename(targetPath),
      path: targetPath,
      skillMdPath: rootSkillPath,
      source: target.kind,
      sourcePath: target.path,
      sourceLabel: target.label,
    })
    seenPaths.add(targetPath)
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!(entry.isDirectory() || entry.isSymbolicLink())) continue

    const skillPath = path.join(targetPath, entry.name)
    if (seenPaths.has(skillPath)) continue

    const stat = await fs.stat(skillPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const skillMdPath = path.join(skillPath, 'SKILL.md')
    if (!await fs.pathExists(skillMdPath)) continue

    skills.push({
      name: entry.name,
      path: skillPath,
      skillMdPath,
      source: target.kind,
      sourcePath: target.path,
      sourceLabel: target.label,
    })
    seenPaths.add(skillPath)
  }

  skills.sort(compareSkills)
  return { exists: true, skills }
}

async function diagnoseSkill(input) {
  const reasons = []
  const rawContent = await fs.readFile(input.skillMdPath, 'utf-8')

  let parsed
  try {
    parsed = matter(rawContent)
  } catch {
    reasons.push({
      code: REASON_CODE_INVALID_FRONTMATTER,
      message: `Invalid frontmatter in ${input.skillMdPath}.`,
      suggestion: 'Fix YAML frontmatter in SKILL.md.',
      item: 'SKILL.md',
    })
    return {
      ...input,
      ready: false,
      reasons,
      requirements: { bins: [], anyBins: [], env: [], config: [] },
    }
  }

  const requirements = parseSkillRequirements(parsed.data || {})
  const binCache = input.binCache

  for (const binName of requirements.bins) {
    if (hasBinary(binName, binCache)) continue
    reasons.push({
      code: REASON_CODE_MISSING_BIN,
      message: `Missing required binary "${binName}".`,
      suggestion: buildMissingBinSuggestion(binName),
      item: binName,
    })
  }

  if (requirements.anyBins.length > 0) {
    const hasAnyBin = requirements.anyBins.some((binName) => hasBinary(binName, binCache))
    if (!hasAnyBin) {
      reasons.push({
        code: REASON_CODE_MISSING_ANY_BIN,
        message: `Missing any required binary (${requirements.anyBins.join(', ')}).`,
        suggestion: buildMissingAnyBinSuggestion(requirements.anyBins),
        items: requirements.anyBins,
      })
    }
  }

  for (const envName of requirements.env) {
    if (hasEnvValue(input.env, envName)) continue
    reasons.push({
      code: REASON_CODE_MISSING_ENV,
      message: `Missing required environment variable "${envName}".`,
      suggestion: buildMissingEnvSuggestion(envName),
      item: envName,
    })
  }

  for (const configKey of requirements.config) {
    if (hasConfigValue(input.config, configKey)) continue
    reasons.push({
      code: REASON_CODE_MISSING_CONFIG,
      message: `Missing required config value "${configKey}".`,
      suggestion: buildMissingConfigSuggestion(configKey),
      item: configKey,
    })
  }

  return {
    ...input,
    ready: reasons.length === 0,
    reasons,
    requirements,
  }
}

async function diagnoseSkills(values) {
  const targets = normalizeTargets(values?.targets)
  const config = toObject(values?.config) || {}
  const env = values?.env || process.env
  const binCache = new Map()
  const diagnosedSkills = []
  const targetSummaries = []

  for (const target of targets) {
    const collected = await collectSkillsFromTarget(target)
    targetSummaries.push({
      kind: target.kind,
      path: target.path,
      label: target.label,
      exists: collected.exists,
      skillCount: collected.skills.length,
    })

    for (const skill of collected.skills) {
      const diagnosed = await diagnoseSkill({
        ...skill,
        config,
        env,
        binCache,
      })
      diagnosedSkills.push(diagnosed)
    }
  }

  diagnosedSkills.sort(compareSkills)
  const readySkills = diagnosedSkills.filter((skill) => skill.ready).length
  const totalReasons = diagnosedSkills.reduce((sum, skill) => sum + skill.reasons.length, 0)

  return {
    generatedAt: new Date().toISOString(),
    targets: targetSummaries,
    summary: {
      totalSkills: diagnosedSkills.length,
      readySkills,
      notReadySkills: diagnosedSkills.length - readySkills,
      totalReasons,
    },
    skills: diagnosedSkills,
  }
}

export {
  REASON_CODE_MISSING_BIN,
  REASON_CODE_MISSING_ANY_BIN,
  REASON_CODE_MISSING_ENV,
  REASON_CODE_MISSING_CONFIG,
  REASON_CODE_INVALID_FRONTMATTER,
  diagnoseSkills,
}
