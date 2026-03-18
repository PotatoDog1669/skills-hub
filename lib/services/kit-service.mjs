import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
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
  restoreManagedKitBaseline as restoreManagedKitBaselineCore,
  updateKit as updateKitCore,
  updateKitLoadout as updateKitLoadoutCore,
  updateKitPolicy as updateKitPolicyCore,
} from '../core/kit-core.mjs'
import {
  buildImportSourceKey,
  importKitLoadoutFromRepo as importKitLoadoutFromRepoService,
  parseLoadoutImportUrl,
} from './kit-loadout-import.mjs'

const CONFIG_PATH = path.join(os.homedir(), '.skills-hub', 'config.json')
const DEFAULT_POLICY_FILE_NAME = 'AGENTS.md'
const DEFAULT_OFFICIAL_PRESETS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/official-presets'
)

function resolveInstructionFileName(agent) {
  const explicit = String(agent?.instructionFileName || '').trim()
  if (explicit) {
    return explicit
  }

  return String(agent?.name || '').trim().toLowerCase() === 'claude code'
    ? 'CLAUDE.md'
    : DEFAULT_POLICY_FILE_NAME
}

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

function toOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function normalizeOfficialSource(source, index) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Invalid official preset source at index ${index}.`)
  }

  const id = String(source.id || '').trim()
  const name = String(source.name || '').trim()
  const url = String(source.url || '').trim()
  const description = toOptionalText(source.description)
  const selectedSkillDetails = Array.isArray(source.selectedSkillDetails)
    ? source.selectedSkillDetails
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
          const name = String(entry.name || '').trim()
          const detailDescription = toOptionalText(entry.description)
          if (!name) return null
          return {
            name,
            description: detailDescription,
          }
        })
        .filter(Boolean)
    : []
  const selectedSkills = Array.isArray(source.selectedSkills)
    ? source.selectedSkills.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  if (!id || !name || !url || selectedSkills.length === 0) {
    throw new Error(`Official preset source is missing required fields: ${id || `index-${index}`}`)
  }

  return {
    id,
    name,
    url,
    description,
    selectedSkillDetails,
    selectedSkills,
  }
}

function normalizeOfficialPreset(preset, index) {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
    throw new Error(`Invalid official preset at index ${index}.`)
  }

  const id = String(preset.id || '').trim()
  const name = String(preset.name || '').trim()
  const description = toOptionalText(preset.description)
  const policy = preset.policy

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error(`Official preset is missing policy metadata: ${id || `index-${index}`}`)
  }

  const policyName = String(policy.name || '').trim()
  const policyTemplate = String(policy.template || '').trim()
  const policyDescription = toOptionalText(policy.description)
  const sources = Array.isArray(preset.sources)
    ? preset.sources.map((entry, sourceIndex) => normalizeOfficialSource(entry, sourceIndex))
    : []

  if (!id || !name || !policyName || !policyTemplate || sources.length === 0) {
    throw new Error(`Official preset is missing required fields: ${id || `index-${index}`}`)
  }

  return {
    id,
    name,
    description,
    policy: {
      name: policyName,
      description: policyDescription,
      template: policyTemplate,
    },
    sources,
  }
}

async function loadOfficialPresetCatalog() {
  const catalogDir = path.resolve(process.env.SKILLS_HUB_OFFICIAL_PRESETS_DIR || DEFAULT_OFFICIAL_PRESETS_DIR)
  const catalogPath = path.join(catalogDir, 'catalog.json')
  const raw = await fs.readJson(catalogPath)
  const presets = Array.isArray(raw?.presets)
    ? raw.presets.map((entry, index) => normalizeOfficialPreset(entry, index))
    : []

  return {
    dirPath: catalogDir,
    version: Number(raw?.version) || 1,
    presets,
  }
}

function getOfficialPolicyTemplatePath(catalogDir, preset) {
  return path.resolve(catalogDir, preset.policy.template)
}

function buildOfficialSourceLoadoutName(preset, source) {
  return `Official Source: ${preset.name} / ${source.name}`
}

function buildOfficialCuratedLoadoutName(preset) {
  return `Official: ${preset.name}`
}

function buildOfficialKitName(preset) {
  return `Official: ${preset.name}`
}

function isOfficialSourceLoadoutName(name) {
  return String(name || '').trim().startsWith('Official Source: ')
}

function pruneUnusedOfficialSourceLoadouts() {
  const referencedLoadoutIds = new Set(
    listKitsCore()
      .map((kit) => String(kit?.loadoutId || '').trim())
      .filter(Boolean)
  )

  const staleLoadouts = listKitLoadoutsCore().filter(
    (loadout) =>
      isOfficialSourceLoadoutName(loadout?.name) && !referencedLoadoutIds.has(loadout.id)
  )

  for (const loadout of staleLoadouts) {
    deleteKitLoadoutCore(loadout.id)
  }

  return staleLoadouts.length
}

function buildOfficialSourceImportKey(source) {
  const parsedSource = parseLoadoutImportUrl(source.url)
  return buildImportSourceKey(parsedSource.repoWebUrl, parsedSource.explicitSubdir || '/')
}

function appendOfficialSourceSelections(selectionMap, preset) {
  for (const source of preset.sources) {
    const sourceKey = buildOfficialSourceImportKey(source)
    const selected = selectionMap.get(sourceKey) || new Set()
    for (const skillName of source.selectedSkills) {
      selected.add(skillName)
    }
    selectionMap.set(sourceKey, selected)
  }
}

function buildOfficialSourceSelectionPlan(catalog, currentPreset) {
  const selectionMap = new Map()
  const presetById = new Map(catalog.presets.map((preset) => [preset.id, preset]))

  for (const kit of listKits()) {
    const presetId = String(kit?.managedSource?.presetId || '').trim()
    if (kit?.managedSource?.kind !== 'official_preset' || !presetId || presetId === currentPreset.id) {
      continue
    }

    const installedPreset = presetById.get(presetId)
    if (!installedPreset) {
      continue
    }

    appendOfficialSourceSelections(selectionMap, installedPreset)
  }

  appendOfficialSourceSelections(selectionMap, currentPreset)
  return selectionMap
}

function buildOfficialManagedSource(preset, catalogVersion, policy, loadout, importedSources) {
  return {
    kind: 'official_preset',
    presetId: preset.id,
    presetName: preset.name,
    catalogVersion,
    installedAt: Date.now(),
    restoreCount: 0,
    baseline: {
      name: buildOfficialKitName(preset),
      description: preset.description,
      policy: {
        id: policy.id,
        name: policy.name,
        description: policy.description,
        content: policy.content,
      },
      loadout: {
        id: loadout.id,
        name: loadout.name,
        description: loadout.description,
        items: loadout.items.map((item) => ({ ...item })),
      },
    },
    securityChecks: importedSources
      .map((source) => {
        const check = source.loadout.importSource?.lastSafetyCheck
        if (!check) {
          return null
        }
        return {
          sourceId: source.id,
          sourceName: source.name,
          check,
        }
      })
      .filter(Boolean),
  }
}

function findByExactName(records, name) {
  return records.find((record) => String(record?.name || '').trim() === name) || null
}

function buildCuratedLoadoutItems(importedSources) {
  const items = []
  const seen = new Set()

  for (const source of importedSources) {
    const itemByName = new Map(
      source.loadout.items.map((item) => [path.basename(item.skillPath), item])
    )
    const missing = []

    for (const skillName of source.selectedSkills) {
      const item = itemByName.get(skillName)
      if (!item) {
        missing.push(skillName)
        continue
      }

      if (seen.has(item.skillPath)) {
        continue
      }

      items.push({
        skillPath: item.skillPath,
        mode: 'copy',
        sortOrder: items.length,
      })
      seen.add(item.skillPath)
    }

    if (missing.length > 0) {
      const available = [...itemByName.keys()].sort().join(', ')
      throw new Error(
        `Official preset source '${source.name}' is missing expected skills: ${missing.join(', ')}. Available skills: ${available}`
      )
    }
  }

  return items
}

async function readRuntimeConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    if (!raw.trim()) {
      return { hubPath: path.join(os.homedir(), 'skills-hub'), projects: [], agents: [] }
    }

    const parsed = JSON.parse(raw)
    const hubPath = String(parsed?.hubPath || path.join(os.homedir(), 'skills-hub'))
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map((entry) => String(entry || '').trim()).filter(Boolean)
      : []
    const agents = Array.isArray(parsed.agents)
      ? parsed.agents.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      : []

    return { hubPath, projects, agents }
  } catch {
    return { hubPath: path.join(os.homedir(), 'skills-hub'), projects: [], agents: [] }
  }
}

function normalizeSkillSelector(value) {
  return String(value || '').trim()
}

function skillSelectorCandidates(skillPath) {
  const normalizedPath = path.resolve(skillPath)
  const base = path.basename(normalizedPath)
  return new Set([normalizedPath, skillPath, base])
}

async function resolveHubSkillPath(hubPath, selector) {
  const normalized = normalizeSkillSelector(selector)
  if (!normalized) {
    throw new Error('Skill selector cannot be empty')
  }

  const resolvedPath = path.resolve(normalized)
  if (await fs.pathExists(resolvedPath)) {
    return resolvedPath
  }

  const candidateInHub = path.join(hubPath, normalized)
  if (await fs.pathExists(candidateInHub)) {
    return candidateInHub
  }

  throw new Error(`Skill not found in hub: ${selector}`)
}

function buildEffectiveLoadoutItems(loadoutItems, includeSkillPaths, excludeSelectors) {
  const excluded = new Set(excludeSelectors.map((entry) => normalizeSkillSelector(entry)).filter(Boolean))
  const effectiveItems = []
  const seenPaths = new Set()

  for (const item of loadoutItems) {
    const candidates = skillSelectorCandidates(item.skillPath)
    if ([...excluded].some((selector) => candidates.has(selector))) {
      continue
    }

    const resolvedPath = path.resolve(item.skillPath)
    if (seenPaths.has(resolvedPath)) {
      continue
    }

    effectiveItems.push({
      skillPath: item.skillPath,
      mode: item.mode,
      sortOrder: effectiveItems.length,
    })
    seenPaths.add(resolvedPath)
  }

  for (const skillPath of includeSkillPaths) {
    const resolvedPath = path.resolve(skillPath)
    if (seenPaths.has(resolvedPath)) {
      continue
    }

    effectiveItems.push({
      skillPath,
      mode: 'copy',
      sortOrder: effectiveItems.length,
    })
    seenPaths.add(resolvedPath)
  }

  return effectiveItems
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
  pruneUnusedOfficialSourceLoadouts()
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

async function importKitLoadoutFromRepo(values) {
  return importKitLoadoutFromRepoService(values)
}

function listKits() {
  return listKitsCore()
}

function addKit(values) {
  return addKitCore(values)
}

function updateKit(values) {
  const updated = updateKitCore(values)
  pruneUnusedOfficialSourceLoadouts()
  return updated
}

function deleteKit(id) {
  const deleted = deleteKitCore(id)
  pruneUnusedOfficialSourceLoadouts()
  return deleted
}

async function listOfficialPresets() {
  const catalog = await loadOfficialPresetCatalog()
  return catalog.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    policyName: preset.policy.name,
    sourceCount: preset.sources.length,
    skillCount: preset.sources.reduce((sum, source) => sum + source.selectedSkills.length, 0),
  }))
}

async function searchOfficialPresets(values) {
  const query = String(values?.query || '').trim().toLowerCase()
  const presets = await listOfficialPresets()
  if (!query) {
    return presets
  }

  const catalog = await loadOfficialPresetCatalog()
  const byId = new Map(catalog.presets.map((preset) => [preset.id, preset]))

  return presets.filter((preset) => {
    const full = byId.get(preset.id)
    if (!full) return false

    const haystacks = [
      preset.id,
      preset.name,
      preset.description || '',
      preset.policyName,
      ...full.sources.flatMap((source) => [
        source.id,
        source.name,
        source.description || '',
        source.url,
        ...source.selectedSkills,
      ]),
    ]

    return haystacks.some((entry) => String(entry || '').toLowerCase().includes(query))
  })
}

async function getOfficialPreset(values) {
  const presetId = String(values?.id || '').trim()
  if (!presetId) {
    throw new Error('Official preset id is required')
  }

  const catalog = await loadOfficialPresetCatalog()
  const preset = catalog.presets.find((entry) => entry.id === presetId)
  if (!preset) {
    throw new Error(`Official preset not found: ${presetId}`)
  }

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    policy: {
      name: preset.policy.name,
      description: preset.policy.description,
      template: preset.policy.template,
    },
    sources: preset.sources.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      description: source.description,
      selectedSkillDetails: source.selectedSkillDetails,
      selectedSkills: [...source.selectedSkills],
    })),
    skillCount: preset.sources.reduce((sum, source) => sum + source.selectedSkills.length, 0),
  }
}

async function installOfficialPreset(values) {
  const presetId = String(values?.id || '').trim()
  if (!presetId) {
    throw new Error('Official preset id is required')
  }

  const catalog = await loadOfficialPresetCatalog()
  const preset = catalog.presets.find((entry) => entry.id === presetId)
  if (!preset) {
    throw new Error(`Official preset not found: ${presetId}`)
  }

  const policyTemplatePath = getOfficialPolicyTemplatePath(catalog.dirPath, preset)
  const policyContent = String(await fs.readFile(policyTemplatePath, 'utf-8') || '').trim()
  if (!policyContent) {
    throw new Error(`Official policy template is empty: ${policyTemplatePath}`)
  }

  const sourceSelectionPlan = buildOfficialSourceSelectionPlan(catalog, preset)
  const importedSources = []
  for (const source of preset.sources) {
    const sourceKey = buildOfficialSourceImportKey(source)
    const requiredSkillNames = [...(sourceSelectionPlan.get(sourceKey) || new Set(source.selectedSkills))]
    const sourceLoadout = await importKitLoadoutFromRepo({
      url: source.url,
      name: buildOfficialSourceLoadoutName(preset, source),
      description: source.description,
      overwrite: values?.overwrite === true,
      skillNames: requiredSkillNames,
    })

    importedSources.push({
      id: source.id,
      name: source.name,
      selectedSkills: source.selectedSkills,
      loadout: sourceLoadout.loadout,
    })
  }

  const curatedItems = buildCuratedLoadoutItems(importedSources)
  const curatedLoadoutName = buildOfficialCuratedLoadoutName(preset)
  const existingPolicy = findByExactName(listKitPolicies(), preset.policy.name)
  const existingCuratedLoadout = findByExactName(listKitLoadouts(), curatedLoadoutName)
  const existingKit = findByExactName(listKits(), buildOfficialKitName(preset))

  const policy = existingPolicy
    ? updateKitPolicy({
        id: existingPolicy.id,
        description: preset.policy.description,
        content: policyContent,
      })
    : addKitPolicy({
        name: preset.policy.name,
        description: preset.policy.description,
        content: policyContent,
      })

  const curatedLoadout = existingCuratedLoadout
    ? updateKitLoadout({
        id: existingCuratedLoadout.id,
        description: preset.description,
        items: curatedItems,
      })
    : addKitLoadout({
        name: curatedLoadoutName,
        description: preset.description,
        items: curatedItems,
      })

  const managedSource = buildOfficialManagedSource(
    preset,
    catalog.version,
    policy,
    curatedLoadout,
    importedSources
  )

  const kit = existingKit
    ? updateKit({
        id: existingKit.id,
        description: preset.description,
        policyId: policy.id,
        loadoutId: curatedLoadout.id,
        managedSource,
      })
    : addKit({
        name: buildOfficialKitName(preset),
        description: preset.description,
        policyId: policy.id,
        loadoutId: curatedLoadout.id,
        managedSource,
      })

  pruneUnusedOfficialSourceLoadouts()

  return {
    preset: {
      id: preset.id,
      name: preset.name,
      description: preset.description,
    },
    policy,
    loadout: curatedLoadout,
    kit,
    importedSources: importedSources.map((source) => ({
      id: source.id,
      name: source.name,
      loadoutId: source.loadout.id,
      importedSkillCount: source.loadout.items.length,
      selectedSkillCount: source.selectedSkills.length,
    })),
  }
}

async function installAllOfficialPresets(values) {
  const presets = await listOfficialPresets()
  const installed = []
  for (const preset of presets) {
    installed.push(
      await installOfficialPreset({
        id: preset.id,
        overwrite: values?.overwrite === true,
      })
    )
  }

  return { installed }
}

async function ensureManagedOfficialPresetsInstalled(values) {
  const catalog = await loadOfficialPresetCatalog()
  const installed = []
  const kits = listKits()

  for (const preset of catalog.presets) {
    const existingKit = kits.find(
      (kit) =>
        kit.managedSource?.kind === 'official_preset' &&
        kit.managedSource?.presetId === preset.id &&
        Number(kit.managedSource?.catalogVersion || 0) >= Number(catalog.version || 1)
    )

    if (existingKit) {
      continue
    }

    installed.push(
      await installOfficialPreset({
        id: preset.id,
        overwrite: values?.overwrite !== false,
      })
    )
  }

  return { installed }
}

function restoreManagedKitBaseline(id) {
  return restoreManagedKitBaselineCore(id)
}

async function applyKit(values) {
  const kitId = String(values?.kitId || '').trim()
  const projectPath = String(values?.projectPath || '').trim()
  const agentName = String(values?.agentName || '').trim()
  const applyMode = normalizeKitMode(values?.mode)
  const overwriteAgentsMd = values?.overwriteAgentsMd === true
  const includeSkills = Array.isArray(values?.includeSkills) ? values.includeSkills : []
  const excludeSkills = Array.isArray(values?.excludeSkills) ? values.excludeSkills : []

  if (!kitId) throw new Error('kitId is required')
  if (!projectPath) throw new Error('projectPath is required')
  if (!agentName) throw new Error('agentName is required')

  const kit = getKitById(kitId)
  if (!kit) throw new Error(`Kit not found: ${kitId}`)
  const policy = kit.policyId ? getKitPolicyById(kit.policyId) : null
  if (kit.policyId && !policy) throw new Error(`AGENTS.md not found: ${kit.policyId}`)
  const loadout = kit.loadoutId ? getKitLoadoutById(kit.loadoutId) : null
  if (kit.loadoutId && !loadout) throw new Error(`Skills package not found: ${kit.loadoutId}`)
  if (!policy && !loadout) {
    throw new Error('Kit must include at least AGENTS.md or Skills package')
  }

  const config = await readRuntimeConfig()
  const projectExists = config.projects.includes(projectPath)
  if (!projectExists) {
    throw new Error('Target project is not registered in Skills Hub.')
  }

  const targetAgent = config.agents.find((agent) => agent.enabled && agent.name === agentName)
  if (!targetAgent) {
    throw new Error('Target agent is not enabled or not found.')
  }

  const loadoutResults = []
  if (loadout) {
    const includeSkillPaths = []
    for (const selector of includeSkills) {
      includeSkillPaths.push(await resolveHubSkillPath(config.hubPath, selector))
    }
    const effectiveItems = buildEffectiveLoadoutItems(loadout.items, includeSkillPaths, excludeSkills)
    const targetSkillParent = path.join(projectPath, targetAgent.projectPath)
    for (const item of effectiveItems) {
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
  }

  let policyPath
  let policyFileName
  let policyExists = false
  if (policy) {
    policyFileName = resolveInstructionFileName(targetAgent)
    policyPath = path.join(projectPath, policyFileName)
    policyExists = await fs.pathExists(policyPath)
    if (policyExists && !overwriteAgentsMd) {
      throw new Error(`POLICY_FILE_EXISTS::${policyPath}`)
    }

    const policyContent = policy.content.endsWith('\n') ? policy.content : `${policy.content}\n`
    await atomicWriteText(policyPath, policyContent)
  }

  const applied = markKitApplied({ id: kitId, projectPath, agentName })
  if (!applied) {
    throw new Error('Failed to record kit application metadata.')
  }

  return {
    kitId,
    kitName: applied.name,
    policyPath,
    policyFileName,
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
  importKitLoadoutFromRepo,
  listOfficialPresets,
  searchOfficialPresets,
  getOfficialPreset,
  installOfficialPreset,
  installAllOfficialPresets,
  ensureManagedOfficialPresetsInstalled,
  listKits,
  addKit,
  updateKit,
  deleteKit,
  restoreManagedKitBaseline,
  applyKit,
  buildEffectiveLoadoutItems,
  resolveHubSkillPath,
}
