import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  addKit as addKitCore,
  addKitLoadout as addKitLoadoutCore,
  addKitPolicy as addKitPolicyCore,
  deleteKit as deleteKitCore,
  deleteKitLoadout as deleteKitLoadoutCore,
  deleteKitPolicy as deleteKitPolicyCore,
  getKitById,
  getKitLoadoutById,
  getKitPolicyById,
  listKitLoadouts as listKitLoadoutsCore,
  listKitPolicies as listKitPoliciesCore,
  listKits as listKitsCore,
  markKitApplied,
  updateKit as updateKitCore,
  updateKitLoadout as updateKitLoadoutCore,
  updateKitPolicy as updateKitPolicyCore,
} from '../core/kit-core.mjs'

const CONFIG_PATH = path.join(os.homedir(), '.skills-hub', 'config.json')

function normalizeKitMode(value) {
  return value === 'link' ? 'link' : 'copy'
}

function normalizeLoadoutItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('Skills package items must be an array.')
  }

  const seen = new Set()
  const normalized = []

  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const raw = item
    const skillPath = String(raw.skillPath || '').trim()
    if (!skillPath || seen.has(skillPath)) continue

    normalized.push({
      skillPath,
      mode: normalizeKitMode(raw.mode),
      sortOrder: Number.isInteger(raw.sortOrder) ? Number(raw.sortOrder) : index,
    })
    seen.add(skillPath)
  }

  return normalized
}

async function readRuntimeConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    if (!raw.trim()) {
      return { projects: [], agents: [] }
    }

    const parsed = JSON.parse(raw)
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map((entry) => String(entry || '').trim()).filter(Boolean)
      : []
    const agents = Array.isArray(parsed.agents)
      ? parsed.agents.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      : []

    return { projects, agents }
  } catch {
    return { projects: [], agents: [] }
  }
}

async function atomicWriteText(filePath, content) {
  const dirPath = path.dirname(filePath)
  await fs.ensureDir(dirPath)
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.move(tempPath, filePath, { overwrite: true })
}

async function syncSkill(sourcePath, destParentPath, syncMode = 'copy') {
  const skillDirName = path.basename(sourcePath)
  const destPath = path.join(destParentPath, skillDirName)

  if (sourcePath === destPath) {
    return destPath
  }

  await fs.ensureDir(destParentPath)

  if (syncMode === 'link') {
    await fs.remove(destPath)
    await fs.ensureSymlink(sourcePath, destPath)
    return destPath
  }

  const isSymlink = await fs
    .lstat(destPath)
    .then((stat) => stat.isSymbolicLink())
    .catch(() => false)

  if (isSymlink) {
    await fs.remove(destPath)
  }

  await fs.copy(sourcePath, destPath, { overwrite: true, errorOnExist: false })
  return destPath
}

function listKitPolicies() {
  return listKitPoliciesCore()
}

function addKitPolicy(values) {
  return addKitPolicyCore(values)
}

function updateKitPolicy(values) {
  return updateKitPolicyCore(values)
}

function deleteKitPolicy(id) {
  return deleteKitPolicyCore(id)
}

function listKitLoadouts() {
  return listKitLoadoutsCore()
}

function addKitLoadout(values) {
  return addKitLoadoutCore({
    ...values,
    items: normalizeLoadoutItems(values.items || []),
  })
}

function updateKitLoadout(values) {
  return updateKitLoadoutCore({
    ...values,
    items: values.items === undefined ? undefined : normalizeLoadoutItems(values.items),
  })
}

function deleteKitLoadout(id) {
  return deleteKitLoadoutCore(id)
}

function listKits() {
  return listKitsCore()
}

function addKit(values) {
  return addKitCore(values)
}

function updateKit(values) {
  return updateKitCore(values)
}

function deleteKit(id) {
  return deleteKitCore(id)
}

async function applyKit(values) {
  const kitId = String(values?.kitId || '').trim()
  const projectPath = String(values?.projectPath || '').trim()
  const agentName = String(values?.agentName || '').trim()
  const applyMode = normalizeKitMode(values?.mode)
  const overwriteAgentsMd = values?.overwriteAgentsMd === true

  if (!kitId) throw new Error('kitId is required')
  if (!projectPath) throw new Error('projectPath is required')
  if (!agentName) throw new Error('agentName is required')

  const kit = getKitById(kitId)
  if (!kit) throw new Error(`Kit not found: ${kitId}`)

  const policy = getKitPolicyById(kit.policyId)
  if (!policy) throw new Error(`AGENTS.md not found: ${kit.policyId}`)

  const loadout = getKitLoadoutById(kit.loadoutId)
  if (!loadout) throw new Error(`Skills package not found: ${kit.loadoutId}`)

  const config = await readRuntimeConfig()
  const projectExists = config.projects.includes(projectPath)
  if (!projectExists) {
    throw new Error('Target project is not registered in Skills Hub.')
  }

  const targetAgent = config.agents.find((agent) => agent.enabled && agent.name === agentName)
  if (!targetAgent) {
    throw new Error('Target agent is not enabled or not found.')
  }

  const targetSkillParent = path.join(projectPath, targetAgent.projectPath)
  const loadoutResults = []

  for (const item of loadout.items) {
    try {
      const destination = await syncSkill(item.skillPath, targetSkillParent, applyMode)
      loadoutResults.push({
        skillPath: item.skillPath,
        mode: applyMode,
        destination,
        status: 'success',
      })
    } catch (error) {
      loadoutResults.push({
        skillPath: item.skillPath,
        mode: applyMode,
        destination: path.join(targetSkillParent, path.basename(item.skillPath)),
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      throw new Error(`Failed to sync skill: ${item.skillPath}`)
    }
  }

  const policyPath = path.join(projectPath, 'AGENTS.md')
  const policyExists = await fs.pathExists(policyPath)
  if (policyExists && !overwriteAgentsMd) {
    throw new Error(`AGENTS_MD_EXISTS::${policyPath}`)
  }

  const policyContent = policy.content.endsWith('\n') ? policy.content : `${policy.content}\n`
  await atomicWriteText(policyPath, policyContent)

  const applied = markKitApplied({ id: kitId, projectPath, agentName })
  if (!applied) {
    throw new Error('Failed to record kit application metadata.')
  }

  return {
    kitId,
    kitName: applied.name,
    policyPath,
    projectPath,
    agentName,
    appliedAt: applied.lastAppliedAt || Date.now(),
    overwroteAgentsMd: policyExists && overwriteAgentsMd,
    loadoutResults,
  }
}

export {
  normalizeKitMode,
  normalizeLoadoutItems,
  listKitPolicies,
  addKitPolicy,
  updateKitPolicy,
  deleteKitPolicy,
  listKitLoadouts,
  addKitLoadout,
  updateKitLoadout,
  deleteKitLoadout,
  listKits,
  addKit,
  updateKit,
  deleteKit,
  applyKit,
}
