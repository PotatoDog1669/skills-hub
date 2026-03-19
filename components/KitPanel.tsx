'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { useRouter } from '@/apps/desktop-ui/src/shims/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  actionOfficialPresetInstall,
  actionOfficialPresetInstallAll,
  actionAddProject,
  actionKitAdd,
  actionKitApply,
  actionKitDelete,
  actionKitLoadoutAdd,
  actionKitLoadoutDelete,
  actionKitLoadoutImportFromRepo,
  actionKitLoadoutUpdate,
  actionKitPolicyAdd,
  actionKitPolicyDelete,
  actionKitPolicyResolveGithub,
  actionKitPolicyUpdate,
  actionKitRestoreManagedBaseline,
  actionKitUpdate,
  actionPickDirectory,
} from '@/apps/desktop-ui/src/tauri-actions'
import { getAgentInstructionFileName } from '@/lib/core/agent-config'
import type { AgentConfig } from '@/lib/config'
import type { Skill } from '@/lib/skills-types'
import type {
  KitLoadoutImportResult,
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  KitSyncMode,
  OfficialPresetSummary,
} from '@/lib/core/kit-types'
import { useConfirm } from '@/components/ConfirmProvider'

interface KitPanelProps {
  policies: KitPolicyRecord[]
  loadouts: KitLoadoutRecord[]
  kits: KitRecord[]
  officialPresets: OfficialPresetSummary[]
  skills: Skill[]
  projects: string[]
  agents: AgentConfig[]
}

function getPathTail(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || inputPath
}

function normalizeText(value: string): string {
  return value.trim()
}

function stripDisplayPrefixes(value?: string | null): string {
  return String(value || '')
    .replace(/^Recommended:\s*/i, '')
    .replace(/^Official Source:\s*/i, '')
    .replace(/^Official:\s*/i, '')
    .replace(/^Bundled Source:\s*/i, '')
    .replace(/^Bundled:\s*/i, '')
    .trim()
}

function getReferencingKitNames(
  kits: KitRecord[],
  predicate: (kit: KitRecord) => boolean
): string[] {
  return kits
    .filter(predicate)
    .map((kit) => stripDisplayPrefixes(kit.name) || '未命名 Kit')
}

function formatDeleteBlockedDialogMessage(
  label: string,
  itemName: string,
  kitNames: string[]
): string {
  const displayName = stripDisplayPrefixes(itemName) || `未命名${label}`
  return `${label}「${displayName}」当前还不能删除。\n\n正在使用它的 Kit：${kitNames.join('、')}\n\n请先修改这些 Kit，或先删除相关 Kit。`
}

type DisplaySkill = {
  name: string
  path: string
  description?: string
  isMissingFromHub?: boolean
}

type PolicySourceMode = 'drag' | 'github' | 'manual'
type PolicyDraft = {
  name: string
  description: string
  content: string
}

const POLICY_TEMPLATE_LABEL = 'Instruction 模板'
const POLICY_TEMPLATE_HELPER = 'AGENTS.md / CLAUDE.md'
const POLICY_IMPORT_FILE_LABEL = 'AGENTS.md、AGENT.md 或 CLAUDE.md'
const LOADOUT_LABEL = 'skills 包'
const LOADOUT_SUBTITLE = '可复用技能集合'

function isPolicyFilenameAccepted(fileName: string): boolean {
  return /^(agents?|claude)\.md$/i.test(String(fileName || '').trim())
}

function createPolicyDraft(seed?: Partial<PolicyDraft>): PolicyDraft {
  return {
    name: seed?.name || '',
    description: seed?.description || '',
    content: seed?.content || '',
  }
}

function normalizeDroppedPath(file: File): string {
  const relativePath = String(
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
  ).trim()
  if (!relativePath) return file.name
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

function scorePolicyFileCandidate(file: File): number {
  const normalizedPath = normalizeDroppedPath(file).toLowerCase()
  const segments = normalizedPath.split('/').filter(Boolean)
  const depth = Math.max(segments.length - 1, 0)
  const base = segments[segments.length - 1] || ''

  if (base === 'agents.md') return depth
  if (base === 'claude.md') return depth + 50
  if (base === 'agent.md') return depth + 100
  return 10_000 + depth
}

function pickBestPolicyFile(files: File[]): File | null {
  const candidates = files.filter((file) => isPolicyFilenameAccepted(file.name))
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((left, right) => {
    const scoreDiff = scorePolicyFileCandidate(left) - scorePolicyFileCandidate(right)
    if (scoreDiff !== 0) return scoreDiff

    const pathA = normalizeDroppedPath(left)
    const pathB = normalizeDroppedPath(right)
    return pathA.localeCompare(pathB)
  })

  return sorted[0] || null
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, (error) => reject(error || new Error('读取文件失败。')))
  })
}

async function collectEntryFiles(entry: FileSystemEntry, maxFiles = 3000): Promise<File[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntry)]
  }

  const files: File[] = []
  let queue: FileSystemEntry[] = [entry]

  while (queue.length > 0 && files.length < maxFiles) {
    const current = queue.shift()
    if (!current) continue

    if (current.isFile) {
      files.push(await readFileEntry(current as FileSystemFileEntry))
      continue
    }

    // Directory reader is stateful and returns entries in chunks.
    // Re-create reader per directory and drain until empty.
    const reader = (current as FileSystemDirectoryEntry).createReader()
    while (files.length < maxFiles) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, (error) => reject(error || new Error('读取目录失败。')))
      })
      if (entries.length === 0) break
      queue = [...entries, ...queue]
    }
  }

  return files
}

async function pickDroppedPolicyFile(dataTransfer: DataTransfer | null): Promise<File | null> {
  if (!dataTransfer) return null

  const directFiles = Array.from(dataTransfer.files || [])
  const directMatch = pickBestPolicyFile(directFiles)
  if (directMatch) return directMatch

  const fallbackCandidates: File[] = []
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()

    if (entry) {
      try {
        const files = await collectEntryFiles(entry)
        fallbackCandidates.push(...files)
        const matched = pickBestPolicyFile(fallbackCandidates)
        if (matched) return matched
      } catch {
        // ignore and continue scanning other items
      }
      continue
    }

    const file = item.getAsFile()
    if (file) fallbackCandidates.push(file)
  }

  return pickBestPolicyFile(fallbackCandidates)
}

export function KitPanel({
  policies,
  loadouts,
  kits,
  officialPresets,
  skills,
  projects,
  agents,
}: KitPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { confirm, prompt } = useConfirm()

  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
  const visibleLoadouts = useMemo(() => loadouts, [loadouts])
  const hubSkills = useMemo(
    () =>
      skills
        .filter((skill) => skill.location === 'hub')
        .sort((a, b) => a.name.localeCompare(b.name, 'en-US')),
    [skills]
  )

  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policies[0]?.id || '')
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(policies[0]?.id || null)
  const [policyDrafts, setPolicyDrafts] = useState<Record<PolicySourceMode, PolicyDraft>>(() => {
    const initialDraft = createPolicyDraft({
      name: policies[0]?.name || '',
      description: policies[0]?.description || '',
      content: policies[0]?.content || '',
    })
    return {
      drag: { ...initialDraft },
      github: { ...initialDraft },
      manual: { ...initialDraft },
    }
  })

  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string>(visibleLoadouts[0]?.id || '')
  const [editingLoadoutId, setEditingLoadoutId] = useState<string | null>(visibleLoadouts[0]?.id || null)
  const [loadoutName, setLoadoutName] = useState<string>(
    stripDisplayPrefixes(visibleLoadouts[0]?.name || '')
  )
  const [loadoutDescription, setLoadoutDescription] = useState<string>(
    visibleLoadouts[0]?.description || ''
  )
  const [selectedLoadoutSkills, setSelectedLoadoutSkills] = useState<string[]>(
    visibleLoadouts[0]?.items.map((item) => item.skillPath) || []
  )

  const [selectedKitId, setSelectedKitId] = useState<string>(kits[0]?.id || '')
  const [editingKitId, setEditingKitId] = useState<string | null>(kits[0]?.id || null)
  const [kitName, setKitName] = useState<string>(stripDisplayPrefixes(kits[0]?.name || ''))
  const [kitDescription, setKitDescription] = useState<string>(kits[0]?.description || '')

  const [applyProjectPath, setApplyProjectPath] = useState<string>(projects[0] || '')
  const [applyAgentName, setApplyAgentName] = useState<string>(enabledAgents[0]?.name || '')
  const [applySyncMode, setApplySyncMode] = useState<KitSyncMode>('copy')
  const [applyIncludeSkills, setApplyIncludeSkills] = useState('')
  const [applyExcludeSkills, setApplyExcludeSkills] = useState('')
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false)
  const [isCreatingPolicy, setIsCreatingPolicy] = useState(false)
  const [isCreatingLoadout, setIsCreatingLoadout] = useState(false)
  const [isImportingLoadout, setIsImportingLoadout] = useState(false)
  const [policySourceMode, setPolicySourceMode] = useState<PolicySourceMode>('drag')
  const [policyGithubUrl, setPolicyGithubUrl] = useState('')
  const [isPolicyDragOver, setIsPolicyDragOver] = useState(false)
  const policyFileInputRef = useRef<HTMLInputElement | null>(null)
  const kitDescriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const policyCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const loadoutCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [loadoutImportUrl, setLoadoutImportUrl] = useState('')
  const [loadoutImportName, setLoadoutImportName] = useState('')
  const [loadoutImportDescription, setLoadoutImportDescription] = useState('')
  const [loadoutImportOverwrite, setLoadoutImportOverwrite] = useState(false)
  const [draggingLoadoutSkillPath, setDraggingLoadoutSkillPath] = useState<string | null>(null)
  const [loadoutDropTargetPath, setLoadoutDropTargetPath] = useState<string | null>(null)

  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) || null
  const selectedLoadout = visibleLoadouts.find((loadout) => loadout.id === selectedLoadoutId) || null
  const selectedKit = kits.find((kit) => kit.id === (selectedKitId || editingKitId)) || null
  const selectedApplyAgent =
    enabledAgents.find((agent) => agent.name === applyAgentName) || enabledAgents[0] || null
  const selectedInstructionFileName = getAgentInstructionFileName(selectedApplyAgent)
  const activePolicyDraft = policyDrafts[policySourceMode]
  const displayMessageText =
    message?.type === 'error' ? message.text.replace(/^[a-z_]+:\s*/i, '') : message?.text || ''

  useEffect(() => {
    if (!message || message.type !== 'success') return
    const timer = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!selectedPolicyId) return
    policyCardRefs.current[selectedPolicyId]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [selectedPolicyId])

  useEffect(() => {
    if (!selectedLoadoutId) return
    loadoutCardRefs.current[selectedLoadoutId]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [selectedLoadoutId])

  useEffect(() => {
    const textarea = kitDescriptionRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`
  }, [kitDescription])

  useEffect(() => {
    if (!isCreatingPolicy) return

    const preventWindowFileDrop = (event: Event) => {
      event.preventDefault()
    }

    window.addEventListener('dragover', preventWindowFileDrop)
    window.addEventListener('drop', preventWindowFileDrop)
    return () => {
      window.removeEventListener('dragover', preventWindowFileDrop)
      window.removeEventListener('drop', preventWindowFileDrop)
    }
  }, [isCreatingPolicy])

  useEffect(() => {
    if (selectedPolicyId && policies.some((policy) => policy.id === selectedPolicyId)) {
      return
    }
    if (selectedPolicyId) {
      setSelectedPolicyId('')
    }
    if (editingPolicyId && !policies.some((policy) => policy.id === editingPolicyId)) {
      setEditingPolicyId(null)
    }
  }, [policies, selectedPolicyId])

  useEffect(() => {
    if (selectedLoadoutId && visibleLoadouts.some((loadout) => loadout.id === selectedLoadoutId)) {
      return
    }
    const fallback = visibleLoadouts[0]
    setSelectedLoadoutId(fallback?.id || '')
    if (editingLoadoutId && !visibleLoadouts.some((loadout) => loadout.id === editingLoadoutId)) {
      setEditingLoadoutId(null)
    }
  }, [visibleLoadouts, selectedLoadoutId, editingLoadoutId])

  useEffect(() => {
    if (!selectedKitId) {
      return
    }
    if (kits.some((kit) => kit.id === selectedKitId)) {
      return
    }
    const fallback = kits[0]
    setSelectedKitId(fallback?.id || '')
    setEditingKitId(fallback?.id || null)
    setKitName(stripDisplayPrefixes(fallback?.name || ''))
    setKitDescription(fallback?.description || '')
    if (fallback) {
      setSelectedPolicyId(fallback.policyId || '')
      setSelectedLoadoutId(fallback.loadoutId || '')
    }
  }, [kits, selectedKitId])

  useEffect(() => {
    if (projects.length === 0) {
      setApplyProjectPath('')
      return
    }
    if (!projects.includes(applyProjectPath)) {
      setApplyProjectPath(projects[0])
    }
  }, [projects, applyProjectPath])

  useEffect(() => {
    if (enabledAgents.length === 0) {
      setApplyAgentName('')
      return
    }
    if (!enabledAgents.some((agent) => agent.name === applyAgentName)) {
      setApplyAgentName(enabledAgents[0].name)
    }
  }, [enabledAgents, applyAgentName])

  const selectedSkillSet = useMemo(() => new Set(selectedLoadoutSkills), [selectedLoadoutSkills])
  const hubSkillByPath = useMemo(
    () => new Map(hubSkills.map((skill) => [skill.path, skill])),
    [hubSkills]
  )
  const currentLoadoutSkills = useMemo<DisplaySkill[]>(
    () =>
      selectedLoadoutSkills.map((skillPath) => {
        const hubSkill = hubSkillByPath.get(skillPath)
        if (hubSkill) {
          return {
            name: hubSkill.name,
            path: hubSkill.path,
            description: hubSkill.description,
          }
        }

        return {
          name: getPathTail(skillPath),
          path: skillPath,
          description: '当前 Hub 中未找到这个 Skill',
          isMissingFromHub: true,
        }
      }),
    [hubSkillByPath, selectedLoadoutSkills]
  )
  const availableHubSkills = useMemo(
    () => hubSkills.filter((skill) => !selectedSkillSet.has(skill.path)),
    [hubSkills, selectedSkillSet]
  )

  const setPolicyDraftForMode = (mode: PolicySourceMode, patch: Partial<PolicyDraft>) => {
    setPolicyDrafts((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        ...patch,
      },
    }))
  }

  const setActivePolicyDraft = (patch: Partial<PolicyDraft>) => {
    setPolicyDraftForMode(policySourceMode, patch)
  }

  const resetPolicyDraft = () => {
    setEditingPolicyId(null)
    const empty = createPolicyDraft()
    setPolicyDrafts({
      drag: { ...empty },
      github: { ...empty },
      manual: { ...empty },
    })
  }

  const startCreatePolicy = () => {
    resetPolicyDraft()
    setIsImportingLoadout(false)
    setIsCreatingLoadout(false)
    setIsCreatingPolicy(true)
    setPolicySourceMode('drag')
    setPolicyGithubUrl('')
    setIsPolicyDragOver(false)
  }

  const cancelCreatePolicy = () => {
    setIsCreatingPolicy(false)
    setIsPolicyDragOver(false)
  }

  const openPolicyEditor = (policy?: KitPolicyRecord | null) => {
    const target = policy || selectedPolicy
    if (!target) {
      setMessage({ type: 'error', text: `请先选择一个${POLICY_TEMPLATE_LABEL}。` })
      return
    }

    const nextDraft = createPolicyDraft({
      name: target.name,
      description: target.description || '',
      content: target.content,
    })
    setSelectedPolicyId(target.id)
    setEditingPolicyId(target.id)
    setPolicyDrafts({
      drag: { ...nextDraft, name: stripDisplayPrefixes(nextDraft.name) },
      github: { ...nextDraft, name: stripDisplayPrefixes(nextDraft.name) },
      manual: { ...nextDraft, name: stripDisplayPrefixes(nextDraft.name) },
    })
    setIsImportingLoadout(false)
    setIsCreatingLoadout(false)
    setIsCreatingPolicy(true)
    setPolicySourceMode('manual')
    setPolicyGithubUrl('')
    setIsPolicyDragOver(false)
  }

  const importPolicyFile = async (file: File) => {
    const fileName = String(file?.name || '').trim()
    if (!fileName) {
      throw new Error('未读取到文件名。')
    }
    if (!isPolicyFilenameAccepted(fileName)) {
      throw new Error(`请导入文件名为 ${POLICY_IMPORT_FILE_LABEL} 的 Markdown 文件。`)
    }

    const content = await file.text()
    if (!content.trim()) {
      throw new Error('指令文件内容为空。')
    }

    const droppedPath = normalizeDroppedPath(file)
    const sourceLabel = droppedPath || fileName

    setPolicyDrafts((prev) => ({
      ...prev,
      drag: {
        ...prev.drag,
        content,
        name: normalizeText(prev.drag.name) ? prev.drag.name : 'Imported Instructions',
        description: normalizeText(prev.drag.description)
          ? prev.drag.description
          : `导入来源：本地 ${sourceLabel}`,
      },
    }))
    setMessage({ type: 'success', text: `已导入 ${fileName}。` })
  }

  const handlePolicyFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    void importPolicyFile(file).catch((error) => {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : `导入${POLICY_TEMPLATE_LABEL}失败：${String(error)}`,
      })
    })
  }

  const handlePolicyDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setIsPolicyDragOver(true)
  }

  const handlePolicyDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsPolicyDragOver(true)
  }

  const handlePolicyDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const nextTarget = event.relatedTarget
    if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
      return
    }
    setIsPolicyDragOver(false)
  }

  const handlePolicyDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsPolicyDragOver(false)
    void (async () => {
      const file = await pickDroppedPolicyFile(event.dataTransfer)
      if (!file) {
        setMessage({
          type: 'error',
          text: `未在拖拽内容中找到 ${POLICY_IMPORT_FILE_LABEL}。`,
        })
        return
      }

      await importPolicyFile(file)
    })().catch((error) => {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : `导入${POLICY_TEMPLATE_LABEL}失败：${String(error)}`,
      })
    })
  }

  const importPolicyFromGithub = () => {
    const sourceUrl = normalizeText(policyGithubUrl)
    if (!sourceUrl) {
      setMessage({ type: 'error', text: '请先输入 GitHub 链接。' })
      return
    }

    startTransition(async () => {
      try {
        const result = await actionKitPolicyResolveGithub(sourceUrl)
        if (!result.content.trim()) {
          throw new Error('获取到的指令文件内容为空。')
        }

        setPolicyDrafts((prev) => ({
          ...prev,
          github: {
            ...prev.github,
            content: result.content,
            name: normalizeText(prev.github.name) ? prev.github.name : result.suggestedName,
            description: normalizeText(prev.github.description)
              ? prev.github.description
              : `导入来源：${result.sourceUrl}`,
          },
        }))
        setMessage({
          type: 'success',
          text: `已导入 ${result.filePath}（${result.branch}）。`,
        })
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error ? error.message : `从 GitHub 导入${POLICY_TEMPLATE_LABEL}失败：${String(error)}`,
        })
      }
    })
  }

  const savePolicy = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(activePolicyDraft.name)
        const content = activePolicyDraft.content.trim()
        if (!name) throw new Error(`${POLICY_TEMPLATE_LABEL}名称不能为空。`)
        if (!content) throw new Error(`${POLICY_TEMPLATE_LABEL}内容不能为空。`)

        if (editingPolicyId) {
          const updated = await actionKitPolicyUpdate({
            id: editingPolicyId,
            name,
            description: normalizeText(activePolicyDraft.description) || undefined,
            content,
          })
          if (!updated) throw new Error(`更新${POLICY_TEMPLATE_LABEL}失败。`)
          setSelectedPolicyId(updated.id)
          setEditingPolicyId(updated.id)
          setIsCreatingPolicy(false)
          setMessage({ type: 'success', text: `${POLICY_TEMPLATE_LABEL}已更新。` })
        } else {
          const created = await actionKitPolicyAdd({
            name,
            description: normalizeText(activePolicyDraft.description) || undefined,
            content,
          })
          if (!created) throw new Error(`创建${POLICY_TEMPLATE_LABEL}失败。`)
          setSelectedPolicyId(created.id)
          setEditingPolicyId(created.id)
          setIsCreatingPolicy(false)
          setMessage({ type: 'success', text: `${POLICY_TEMPLATE_LABEL}已创建。` })
        }

        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `保存${POLICY_TEMPLATE_LABEL}失败：${String(error)}`,
        })
      }
    })
  }

  const deletePolicy = async () => {
    const targetId = editingPolicyId || selectedPolicyId
    const targetPolicy =
      policies.find((policy) => policy.id === targetId) ||
      policies.find((policy) => policy.id === editingPolicyId) ||
      selectedPolicy
    if (!targetId) {
      setMessage({ type: 'error', text: `请先选择一个${POLICY_TEMPLATE_LABEL}。` })
      return
    }

    const referencingKitNames = getReferencingKitNames(kits, (kit) => kit.policyId === targetId)
    if (referencingKitNames.length > 0) {
      await confirm({
        title: `无法删除${POLICY_TEMPLATE_LABEL}`,
        message: formatDeleteBlockedDialogMessage(
          POLICY_TEMPLATE_LABEL,
          targetPolicy?.name || '',
          referencingKitNames
        ),
        type: 'info',
        confirmText: '知道了',
        cancelText: '关闭',
      })
      return
    }

    const confirmed = await confirm({
      title: `删除${POLICY_TEMPLATE_LABEL}`,
      message: `删除${POLICY_TEMPLATE_LABEL}「${stripDisplayPrefixes(targetPolicy?.name || '') || '未命名模板'}」？`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    startTransition(async () => {
      try {
        await actionKitPolicyDelete(targetId)
        setMessage({ type: 'success', text: `${POLICY_TEMPLATE_LABEL}已删除。` })
        resetPolicyDraft()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `删除${POLICY_TEMPLATE_LABEL}失败：${String(error)}`,
        })
      }
    })
  }

  const resetLoadoutDraft = () => {
    setEditingLoadoutId(null)
    setLoadoutName('')
    setLoadoutDescription('')
    setSelectedLoadoutSkills([])
  }

  const startCreateLoadout = () => {
    resetLoadoutDraft()
    setIsCreatingPolicy(false)
    setIsImportingLoadout(false)
    setIsCreatingLoadout(true)
  }

  const cancelCreateLoadout = () => {
    setIsCreatingLoadout(false)
  }

  const openLoadoutImport = () => {
    setIsCreatingPolicy(false)
    setIsCreatingLoadout(false)
    setIsImportingLoadout(true)
    setLoadoutImportUrl('')
    setLoadoutImportName('')
    setLoadoutImportDescription('')
    setLoadoutImportOverwrite(false)
  }

  const cancelLoadoutImport = () => {
    setIsImportingLoadout(false)
  }

  const openLoadoutEditor = (loadout?: KitLoadoutRecord | null) => {
    const target = loadout || selectedLoadout
    if (!target) {
      setMessage({ type: 'error', text: `请先选择一个${LOADOUT_LABEL}。` })
      return
    }

    setSelectedLoadoutId(target.id)
    setEditingLoadoutId(target.id)
    setLoadoutName(stripDisplayPrefixes(target.name))
    setLoadoutDescription(target.description || '')
    setSelectedLoadoutSkills(target.items.map((item) => item.skillPath))
    setIsCreatingPolicy(false)
    setIsImportingLoadout(false)
    setIsCreatingLoadout(true)
  }

  const addSkillToLoadout = (skillPath: string) => {
    setDraggingLoadoutSkillPath(null)
    setLoadoutDropTargetPath(null)
    setSelectedLoadoutSkills((prev) => {
      if (prev.includes(skillPath)) return prev
      return [...prev, skillPath]
    })
  }

  const removeSkillFromLoadout = (skillPath: string) => {
    setDraggingLoadoutSkillPath(null)
    setLoadoutDropTargetPath(null)
    setSelectedLoadoutSkills((prev) => prev.filter((entry) => entry !== skillPath))
  }

  const moveLoadoutSkill = (fromSkillPath: string, toSkillPath: string) => {
    if (!fromSkillPath || !toSkillPath || fromSkillPath === toSkillPath) {
      return
    }

    setSelectedLoadoutSkills((prev) => {
      const fromIndex = prev.indexOf(fromSkillPath)
      const toIndex = prev.indexOf(toSkillPath)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return prev
      }

      const next = [...prev]
      const [movedItem] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, movedItem)
      return next
    })
  }

  const handleLoadoutSkillDragStart = (event: DragEvent<HTMLDivElement>, skillPath: string) => {
    setDraggingLoadoutSkillPath(skillPath)
    setLoadoutDropTargetPath(skillPath)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', skillPath)
    }
  }

  const handleLoadoutSkillDragOver = (event: DragEvent<HTMLDivElement>, skillPath: string) => {
    event.preventDefault()
    if (!draggingLoadoutSkillPath || draggingLoadoutSkillPath === skillPath) {
      return
    }
    setLoadoutDropTargetPath(skillPath)
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleLoadoutSkillDrop = (event: DragEvent<HTMLDivElement>, skillPath: string) => {
    event.preventDefault()
    const sourcePath =
      draggingLoadoutSkillPath || event.dataTransfer?.getData('text/plain') || ''
    moveLoadoutSkill(sourcePath, skillPath)
    setDraggingLoadoutSkillPath(null)
    setLoadoutDropTargetPath(null)
  }

  const clearLoadoutDragState = () => {
    setDraggingLoadoutSkillPath(null)
    setLoadoutDropTargetPath(null)
  }

  const saveLoadout = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(loadoutName)
        if (!name) throw new Error(`${LOADOUT_LABEL}名称不能为空。`)
        if (selectedLoadoutSkills.length === 0)
          throw new Error(`${LOADOUT_LABEL}至少选择一个 Skill。`)

        const items = selectedLoadoutSkills.map((skillPath, index) => ({
          skillPath,
          mode: 'copy' as const,
          sortOrder: index,
        }))

        if (editingLoadoutId) {
          const updated = await actionKitLoadoutUpdate({
            id: editingLoadoutId,
            name,
            description: normalizeText(loadoutDescription) || undefined,
            items,
          })
          if (!updated) throw new Error(`更新${LOADOUT_LABEL}失败。`)
          setSelectedLoadoutId(updated.id)
          setEditingLoadoutId(updated.id)
          setIsCreatingLoadout(false)
          setMessage({ type: 'success', text: `${LOADOUT_LABEL}已更新。` })
        } else {
          const created = await actionKitLoadoutAdd({
            name,
            description: normalizeText(loadoutDescription) || undefined,
            items,
          })
          if (!created) throw new Error(`创建${LOADOUT_LABEL}失败。`)
          setSelectedLoadoutId(created.id)
          setEditingLoadoutId(created.id)
          setIsCreatingLoadout(false)
          setMessage({ type: 'success', text: `${LOADOUT_LABEL}已创建。` })
        }

        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error ? error.message : `保存${LOADOUT_LABEL}失败：${String(error)}`,
        })
      }
    })
  }

  const formatLoadoutImportMessage = (result: KitLoadoutImportResult) => {
    const parts =
      result.loadoutStatus === 'updated'
        ? [`已更新已有${LOADOUT_LABEL}「${result.loadout.name}」`]
        : [`已导入 ${result.discoveredCount} 个 Skills`]

    if (result.loadoutStatus === 'updated') {
      parts.push(`本次识别 ${result.discoveredCount} 个 Skills`)
    }
    if (result.overwrittenCount > 0) {
      parts.push(`覆盖 ${result.overwrittenCount} 个`)
    }
    if (result.removedCount > 0) {
      parts.push(`清理 ${result.removedCount} 个旧 Skill`)
    }
    if (result.loadoutStatus === 'updated') {
      return `${parts.join('，')}。`
    }

    return `${parts.join('，')}，已同步到${LOADOUT_LABEL}「${result.loadout.name}」。`
  }

  const submitLoadoutImport = () => {
    startTransition(async () => {
      try {
        const url = normalizeText(loadoutImportUrl)
        if (!url) {
          throw new Error('仓库 URL 不能为空。')
        }

        const result = await actionKitLoadoutImportFromRepo({
          url,
          name: normalizeText(loadoutImportName) || undefined,
          description: normalizeText(loadoutImportDescription) || undefined,
          overwrite: loadoutImportOverwrite,
        })

        setSelectedLoadoutId(result.loadout.id)
        setEditingLoadoutId(result.loadout.id)
        setLoadoutName(result.loadout.name)
        setLoadoutDescription(result.loadout.description || '')
        setSelectedLoadoutSkills(result.loadout.items.map((item) => item.skillPath))
        setIsImportingLoadout(false)
        setMessage({
          type: 'success',
          text: formatLoadoutImportMessage(result),
        })
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `导入仓库失败：${String(error)}`,
        })
      }
    })
  }

  const deleteLoadout = async () => {
    const targetId = editingLoadoutId || selectedLoadoutId
    const targetLoadout =
      visibleLoadouts.find((loadout) => loadout.id === targetId) ||
      visibleLoadouts.find((loadout) => loadout.id === editingLoadoutId) ||
      selectedLoadout
    if (!targetId) {
      setMessage({ type: 'error', text: `请先选择一个${LOADOUT_LABEL}。` })
      return
    }

    const referencingKitNames = getReferencingKitNames(kits, (kit) => kit.loadoutId === targetId)
    if (referencingKitNames.length > 0) {
      await confirm({
        title: `无法删除${LOADOUT_LABEL}`,
        message: formatDeleteBlockedDialogMessage(
          LOADOUT_LABEL,
          targetLoadout?.name || '',
          referencingKitNames
        ),
        type: 'info',
        confirmText: '知道了',
        cancelText: '关闭',
      })
      return
    }

    const confirmed = await confirm({
      title: `删除${LOADOUT_LABEL}`,
      message: `删除${LOADOUT_LABEL}「${stripDisplayPrefixes(targetLoadout?.name || '') || '未命名 skills 包'}」？`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    startTransition(async () => {
      try {
        await actionKitLoadoutDelete(targetId)
        setMessage({ type: 'success', text: `${LOADOUT_LABEL}已删除。` })
        resetLoadoutDraft()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error ? error.message : `删除${LOADOUT_LABEL}失败：${String(error)}`,
        })
      }
    })
  }

  const resetKitDraft = () => {
    setSelectedKitId('')
    setEditingKitId(null)
    setKitName('')
    setKitDescription('')
    setSelectedPolicyId('')
    setSelectedLoadoutId('')
  }

  const selectKit = (kit: KitRecord) => {
    setSelectedKitId(kit.id)
    setEditingKitId(kit.id)
    setKitName(stripDisplayPrefixes(kit.name))
    setKitDescription(kit.description || '')
    setSelectedPolicyId(kit.policyId || '')
    setSelectedLoadoutId(kit.loadoutId || '')
  }

  const saveKit = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(kitName)
        if (!name) throw new Error('Kit 名称不能为空。')
        if (!selectedPolicyId && !selectedLoadoutId) {
          throw new Error(`请至少选择${POLICY_TEMPLATE_LABEL}或${LOADOUT_LABEL}。`)
        }

        if (editingKitId) {
          const updated = await actionKitUpdate({
            id: editingKitId,
            name,
            description: normalizeText(kitDescription) || undefined,
            policyId: selectedPolicyId || '',
            loadoutId: selectedLoadoutId || '',
          })
          if (!updated) throw new Error('更新 Kit 失败。')
          setSelectedKitId(updated.id)
          setEditingKitId(updated.id)
          setMessage({ type: 'success', text: 'Kit 已更新。' })
        } else {
          const created = await actionKitAdd({
            name,
            description: normalizeText(kitDescription) || undefined,
            policyId: selectedPolicyId || undefined,
            loadoutId: selectedLoadoutId || undefined,
          })
          if (!created) throw new Error('保存 Kit 失败。')
          setSelectedKitId(created.id)
          setEditingKitId(created.id)
          setMessage({ type: 'success', text: 'Kit 已保存。' })
        }

        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `保存 Kit 失败：${String(error)}`,
        })
      }
    })
  }

  const deleteCurrentKit = async () => {
    const targetId = editingKitId || selectedKitId
    const targetKit =
      kits.find((kit) => kit.id === targetId) ||
      kits.find((kit) => kit.id === editingKitId) ||
      selectedKit
    if (!targetId) {
      setMessage({ type: 'error', text: '请先选择一个 Kit。' })
      return
    }

    const confirmed = await confirm({
      title: '删除 Kit',
      message: `删除 Kit「${stripDisplayPrefixes(targetKit?.name || '') || '未命名 Kit'}」？`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    startTransition(async () => {
      try {
        await actionKitDelete(targetId)
        setMessage({ type: 'success', text: 'Kit 已删除。' })
        resetKitDraft()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `删除 Kit 失败：${String(error)}`,
        })
      }
    })
  }

  const applyKit = () => {
    const targetKitId = selectedKitId || editingKitId
    if (!targetKitId) {
      setMessage({ type: 'error', text: '请先保存并选择一个 Kit。' })
      return
    }

    startTransition(async () => {
      const applyOnce = async (overwriteAgentsMd: boolean) =>
        actionKitApply({
          kitId: targetKitId,
          projectPath: applyProjectPath,
          agentName: applyAgentName,
          mode: applySyncMode,
          overwriteAgentsMd,
          includeSkills: applyIncludeSkills
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
          excludeSkills: applyExcludeSkills
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        })

      const showSuccess = (params: {
        successCount: number
        policyPath?: string
        policyFileName?: string
        overwrote: boolean
      }) => {
        const policyFileName = params.policyFileName || selectedInstructionFileName
        const overwriteSuffix = params.overwrote ? `（已确认覆盖现有 ${policyFileName}）` : ''
        const policySummary = params.policyPath
          ? `，${policyFileName} 已写入 ${params.policyPath}`
          : ''
        setMessage({
          type: 'success',
          text: `Kit 应用完成：${params.successCount} 个 Skills 已同步${policySummary}${overwriteSuffix}`,
        })
      }

      try {
        const result = await applyOnce(false)
        const successCount = result.loadoutResults.filter((row) => row.status === 'success').length
        showSuccess({
          successCount,
          policyPath: result.policyPath,
          policyFileName: result.policyFileName,
          overwrote: Boolean(result.overwroteAgentsMd),
        })
        setIsApplyDialogOpen(false)
        router.refresh()
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error)
        if (
          errorText.startsWith('AGENTS_MD_EXISTS::') ||
          errorText.startsWith('POLICY_FILE_EXISTS::')
        ) {
          const policyPath = errorText.replace(/^AGENTS_MD_EXISTS::|^POLICY_FILE_EXISTS::/, '')
          const policyFileName = getPathTail(policyPath) || selectedInstructionFileName
          setMessage({
            type: 'error',
            text: `检测到项目中已存在 ${policyFileName}：\n${policyPath}\n\n请先手动处理后再应用。`,
          })
          return
        }

        setMessage({
          type: 'error',
          text: errorText || `应用 Kit 失败：${String(error)}`,
        })
      }
    })
  }

  const openApplyDialog = () => {
    const targetKitId = selectedKitId || editingKitId
    if (!targetKitId) {
      setMessage({ type: 'error', text: '请先保存并选择一个 Kit。' })
      return
    }
    setSelectedKitId(targetKitId)
    setApplyIncludeSkills('')
    setApplyExcludeSkills('')
    setIsApplyDialogOpen(true)
  }

  const installAllOfficialPresets = () => {
    startTransition(async () => {
      try {
        const result = await actionOfficialPresetInstallAll()
        setMessage({
          type: 'success',
          text: `已补齐 ${result.installed.length} 个内置推荐 Kit。`,
        })
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `补齐内置推荐 Kit 失败：${String(error)}`,
        })
      }
    })
  }

  const syncManagedKit = (kit: KitRecord) => {
    const presetId = kit.managedSource?.presetId
    if (!presetId) {
      setMessage({ type: 'error', text: '当前 Kit 没有关联的内置来源。' })
      return
    }

    void (async () => {
      const confirmed = await confirm({
        title: '重新同步 Kit',
        message: `重新同步 Kit「${stripDisplayPrefixes(kit.name) || '未命名 Kit'}」？\n\n这会用内置来源的最新内容覆盖当前受管理的 Kit。`,
        type: 'info',
        confirmText: '重新同步',
        cancelText: '取消',
      })
      if (!confirmed) return

      startTransition(async () => {
        try {
          const result = await actionOfficialPresetInstall({ id: presetId, overwrite: true })
          setSelectedKitId(result.kit.id)
          setEditingKitId(result.kit.id)
          setKitName(stripDisplayPrefixes(result.kit.name))
          setKitDescription(result.kit.description || '')
          setSelectedPolicyId(result.kit.policyId || result.policy.id)
          setSelectedLoadoutId(result.kit.loadoutId || result.loadout.id)
          setSelectedLoadoutSkills(result.loadout.items.map((item) => item.skillPath))
          setMessage({
            type: 'success',
            text: `已重新同步内置内容：${result.preset.name}`,
          })
          router.refresh()
        } catch (error) {
          setMessage({
            type: 'error',
            text: error instanceof Error ? error.message : `重新同步 Kit 失败：${String(error)}`,
          })
        }
      })
    })()
  }

  const restoreSelectedManagedKit = () => {
    const targetKit = selectedKit
    if (!targetKit?.managedSource) {
      setMessage({ type: 'error', text: '当前 Kit 没有可恢复的导入基线。' })
      return
    }

    void (async () => {
      const confirmed = await confirm({
        title: '恢复 Kit',
        message: `恢复 Kit「${stripDisplayPrefixes(targetKit.name) || '未命名 Kit'}」到导入基线？\n\n这会用 ${targetKit.managedSource?.presetName} 的内置基线内容覆盖当前受管理的 Kit。`,
        type: 'info',
        confirmText: '恢复',
        cancelText: '取消',
      })
      if (!confirmed) return

      startTransition(async () => {
        try {
          const restored = await actionKitRestoreManagedBaseline(targetKit.id)
          setSelectedKitId(restored.id)
          setEditingKitId(restored.id)
          setKitName(stripDisplayPrefixes(restored.name))
          setKitDescription(restored.description || '')
          setSelectedPolicyId(restored.policyId || '')
          setSelectedLoadoutId(restored.loadoutId || '')
          setSelectedLoadoutSkills(
            targetKit.managedSource?.baseline.loadout.items.map((item) => item.skillPath) || []
          )
          setMessage({
            type: 'success',
            text: `已恢复到 ${targetKit.managedSource?.presetName} 的内置基线。`,
          })
          router.refresh()
        } catch (error) {
          setMessage({
            type: 'error',
            text: error instanceof Error ? error.message : `恢复 Kit 失败：${String(error)}`,
          })
        }
      })
    })()
  }

  const handleAddProjectForApply = () => {
    startTransition(async () => {
      try {
        const result = await actionPickDirectory({ title: 'Select Project Folder' })

        let selectedPath: string | null = null
        if (result.status === 'selected') {
          selectedPath = result.path
        } else if (result.status === 'unsupported' || result.status === 'error') {
          selectedPath = await prompt({
            title: 'Add Project',
            message: 'Enter absolute project path:',
            placeholder: '/Users/username/my-project',
          })
        }

        if (!selectedPath) return

        await actionAddProject(selectedPath)
        setApplyProjectPath(selectedPath)
        setMessage({ type: 'success', text: `项目已添加：${selectedPath}` })
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `添加项目失败：${String(error)}`,
        })
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
        <div className="flex min-h-0 flex-col gap-4 lg:h-full">
          <div className="flex min-h-0 flex-[0.92] flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{POLICY_TEMPLATE_LABEL}</div>
                <div className="text-xs text-gray-500">可兼容 {POLICY_TEMPLATE_HELPER}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={deletePolicy}
                  disabled={isPending || policies.length === 0 || isCreatingPolicy}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-60"
                  title={`删除${POLICY_TEMPLATE_LABEL}`}
                  aria-label={`删除${POLICY_TEMPLATE_LABEL}`}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={startCreatePolicy}
                  disabled={isPending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d97757] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#c76444] disabled:cursor-not-allowed disabled:bg-[#e3a48f] disabled:text-white/90"
                  title={`新建${POLICY_TEMPLATE_LABEL}`}
                  aria-label={`新建${POLICY_TEMPLATE_LABEL}`}
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {policies.length === 0 ? (
              <div className="mt-3 flex-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                还没有{POLICY_TEMPLATE_LABEL}，先创建一个。
              </div>
            ) : (
              <div data-testid="policy-list-scroll" className="mt-3 flex-1 overflow-y-auto pr-1">
                <div className="space-y-1">
                  {policies.map((policy) => (
                    <div
                      key={policy.id}
                      ref={(node) => {
                        policyCardRefs.current[policy.id] = node
                      }}
                      data-testid={`policy-card-${policy.id}`}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                        selectedPolicyId === policy.id
                          ? 'border-[#e6b8a1] bg-[#fff8f5]'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPolicyId(policy.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate">{stripDisplayPrefixes(policy.name)}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openPolicyEditor(policy)}
                        aria-label={`编辑${POLICY_TEMPLATE_LABEL} ${policy.name}`}
                        className="shrink-0 rounded border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="flex min-h-0 flex-[1.08] flex-col rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{LOADOUT_LABEL}</div>
                <div className="text-xs text-gray-500">{LOADOUT_SUBTITLE}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openLoadoutImport}
                  disabled={isPending}
                  className="rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
                >
                  从仓库导入
                </button>
                <button
                  type="button"
                  onClick={deleteLoadout}
                  disabled={isPending || visibleLoadouts.length === 0 || isCreatingLoadout}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-60"
                  title={`删除${LOADOUT_LABEL}`}
                  aria-label={`删除${LOADOUT_LABEL}`}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={startCreateLoadout}
                  disabled={isPending}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d97757] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#c76444] disabled:cursor-not-allowed disabled:bg-[#e3a48f] disabled:text-white/90"
                  title={`新建${LOADOUT_LABEL}`}
                  aria-label={`新建${LOADOUT_LABEL}`}
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {visibleLoadouts.length === 0 ? (
              <div className="mt-3 flex-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                还没有{LOADOUT_LABEL}，先创建一个。
              </div>
            ) : (
              <div data-testid="loadout-list-scroll" className="mt-3 flex-1 overflow-y-auto pr-1">
                <div className="space-y-1">
                  {visibleLoadouts.map((loadout) => (
                    <div
                      key={loadout.id}
                      ref={(node) => {
                        loadoutCardRefs.current[loadout.id] = node
                      }}
                      data-testid={`loadout-card-${loadout.id}`}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                        selectedLoadoutId === loadout.id
                          ? 'border-[#e6b8a1] bg-[#fff8f5]'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedLoadoutId(loadout.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-medium">{stripDisplayPrefixes(loadout.name)}</div>
                        <div className="text-xs text-gray-500">{loadout.items.length} skills</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openLoadoutEditor(loadout)}
                        aria-label={`编辑${LOADOUT_LABEL} ${loadout.name}`}
                        className="shrink-0 rounded border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-100"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="text-lg font-semibold">Kit 组合</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={saveKit}
                disabled={isPending}
                className="rounded bg-[#d97757] px-3 py-1.5 text-xs text-white hover:bg-[#c05f3e] disabled:opacity-60"
              >
                保存 Kit
              </button>
              <button
                type="button"
                onClick={resetKitDraft}
                disabled={isPending}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
              >
                新建
              </button>
              <button
                type="button"
                onClick={deleteCurrentKit}
                disabled={isPending || kits.length === 0}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                title="删除 Kit"
                aria-label="删除 Kit"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">当前组合</div>
                <div className="mt-1 truncate text-sm font-medium text-gray-900">
                  {stripDisplayPrefixes(selectedPolicy?.name) || '未选择模板'}
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">
                  {stripDisplayPrefixes(selectedLoadout?.name) || '未选择 skills 包'}
                </div>
              </div>
              {selectedKit?.managedSource ? (
                <button
                  type="button"
                  onClick={restoreSelectedManagedKit}
                  disabled={isPending}
                  className="shrink-0 rounded border border-[#e6b8a1] bg-white px-2 py-1 text-[11px] text-[#8f4d35] hover:bg-[#fff8f5] disabled:opacity-60"
                >
                  恢复
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1">
            <input
              value={kitName}
              onChange={(event) => setKitName(event.target.value)}
              placeholder="Kit 名称（如：Frontend Kit）"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              ref={kitDescriptionRef}
              value={kitDescription}
              onChange={(event) => setKitDescription(event.target.value)}
              placeholder="一句中文简介，说明这个 Kit 适合做什么"
              rows={1}
              className="min-h-[72px] w-full resize-none overflow-hidden rounded-md border border-gray-200 px-3 py-2 text-sm leading-6"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">已保存 Kits</div>
              <div className="flex items-center gap-2">
                {officialPresets.length > 0 ? (
                  <button
                    type="button"
                    onClick={installAllOfficialPresets}
                    disabled={isPending}
                    className="rounded border border-gray-200 px-2.5 py-1 text-[11px] hover:bg-gray-50 disabled:opacity-60"
                  >
                    补齐内置推荐 Kits
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openApplyDialog}
                  disabled={isPending || !(selectedKitId || editingKitId)}
                  className="rounded bg-[#d97757] px-3 py-1 text-[11px] text-white disabled:opacity-60"
                >
                  应用
                </button>
              </div>
            </div>
            {officialPresets.length === 0 && kits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
                暂无 Kit，先保存一个组合。
              </div>
            ) : (
              <div data-testid="kit-list-scroll" className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-1">
                  {kits.map((kit) => {
                    const isManaged = Boolean(kit.managedSource?.presetId)
                    return (
                      <div
                        key={kit.id}
                        className={`w-full rounded-md border px-2.5 py-2 text-left text-xs ${
                          selectedKitId === kit.id
                            ? 'border-[#e6b8a1]'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => selectKit(kit)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="text-sm font-medium text-gray-900">
                              {stripDisplayPrefixes(kit.name)}
                            </div>
                            <div className="mt-1 line-clamp-2 text-gray-500">
                              {kit.description || '暂无简介'}
                            </div>
                          </button>
                          {isManaged ? (
                            <button
                              type="button"
                              onClick={() => syncManagedKit(kit)}
                              disabled={isPending}
                              className="shrink-0 rounded border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50 disabled:opacity-60"
                            >
                              重新同步
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isApplyDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">应用 Kit</div>
                <div className="text-xs text-gray-500">
                  {kits.find((kit) => kit.id === selectedKitId)?.name || '当前 Kit'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyDialogOpen(false)}
                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                关闭
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">目标项目</div>
                <button
                  type="button"
                  onClick={handleAddProjectForApply}
                  disabled={isPending}
                  className="inline-flex items-center justify-center rounded border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                  title="添加项目"
                >
                  <Plus size={12} />
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
                  请先添加项目
                </div>
              ) : (
                <div className="max-h-40 overflow-auto space-y-1">
                  {projects.map((projectPath) => {
                    const projectName = projectPath.split('/').pop() || projectPath
                    const isActive = applyProjectPath === projectPath
                    return (
                      <button
                        key={projectPath}
                        type="button"
                        onClick={() => setApplyProjectPath(projectPath)}
                        className={`w-full rounded-md border px-2.5 py-2 text-left ${
                          isActive
                            ? 'border-[#e6b8a1]'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="truncate text-sm font-medium text-gray-900">
                          {projectName}
                        </div>
                        <div className="truncate text-[11px] text-gray-500">{projectPath}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">目标 Agent</div>
              <select
                value={applyAgentName}
                onChange={(event) => setApplyAgentName(event.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                disabled={enabledAgents.length === 0}
              >
                {enabledAgents.length === 0 ? (
                  <option value="">请先启用 Agent</option>
                ) : (
                  enabledAgents.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))
                )}
              </select>
              {selectedPolicyId ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  当前 Agent 会把模板写入项目根目录的 <code>{selectedInstructionFileName}</code>。
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">Sync 方式</div>
              <select
                value={applySyncMode}
                onChange={(event) =>
                  setApplySyncMode(event.target.value === 'link' ? 'link' : 'copy')
                }
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="copy">copy</option>
                <option value="link">link</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">本次额外追加 Skills（逗号分隔，可选）</div>
              <input
                value={applyIncludeSkills}
                onChange={(event) => setApplyIncludeSkills(event.target.value)}
                placeholder="例如：extra-toolkit,release-notes"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">本次排除 Skills（逗号分隔，可选）</div>
              <input
                value={applyExcludeSkills}
                onChange={(event) => setApplyExcludeSkills(event.target.value)}
                placeholder="例如：perf-audit"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsApplyDialogOpen(false)}
                className="rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyKit}
                disabled={
                  isPending ||
                  projects.length === 0 ||
                  enabledAgents.length === 0 ||
                  !applyProjectPath ||
                  !applyAgentName
                }
                className="rounded bg-[#d97757] px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                应用
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4"
          onClick={() => setMessage(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div
                className={`text-sm font-semibold ${
                  message.type === 'success' ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {message.type === 'success' ? '操作成功' : '操作失败'}
              </div>
              <button
                type="button"
                onClick={() => setMessage(null)}
                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                关闭
              </button>
            </div>
            <div
              className={`rounded-md border px-3 py-2 text-sm whitespace-pre-wrap ${
                message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {displayMessageText}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMessage(null)}
                className="rounded bg-[#d97757] px-3 py-1.5 text-xs text-white hover:bg-[#c05f3e]"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreatingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {editingPolicyId ? `查看 / 编辑${POLICY_TEMPLATE_LABEL}` : `新建${POLICY_TEMPLATE_LABEL}`}
                </div>
                <div className="text-xs text-gray-500">支持拖拽导入、GitHub 导入或手动编辑</div>
              </div>
              <button
                type="button"
                onClick={cancelCreatePolicy}
                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                关闭
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-200 p-1">
              <button
                type="button"
                onClick={() => setPolicySourceMode('drag')}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  policySourceMode === 'drag'
                    ? 'border border-[#e6b8a1] text-[#9f4f34]'
                    : 'border border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                拖拽文件
              </button>
              <button
                type="button"
                onClick={() => setPolicySourceMode('github')}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  policySourceMode === 'github'
                    ? 'border border-[#e6b8a1] text-[#9f4f34]'
                    : 'border border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                GitHub 链接
              </button>
              <button
                type="button"
                onClick={() => setPolicySourceMode('manual')}
                className={`rounded-md px-2.5 py-1.5 text-xs ${
                  policySourceMode === 'manual'
                    ? 'border border-[#e6b8a1] text-[#9f4f34]'
                    : 'border border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                编辑
              </button>
            </div>

            {policySourceMode === 'drag' && (
              <div
                onDragEnter={handlePolicyDragEnter}
                onDragOver={handlePolicyDragOver}
                onDragLeave={handlePolicyDragLeave}
                onDrop={handlePolicyDrop}
                className={`space-y-2 rounded-lg border border-dashed p-4 ${
                  isPolicyDragOver
                    ? 'border-[#d97757] bg-[#fff8f5]'
                    : 'border-gray-300 bg-gray-50'
                }`}
              >
                <div className="text-sm font-medium text-gray-800">把指令文件拖拽到这里</div>
                <div className="text-xs text-gray-500">
                  支持拖拽文件或文件夹，会自动查找 {POLICY_IMPORT_FILE_LABEL}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => policyFileInputRef.current?.click()}
                    className="rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs hover:bg-gray-50"
                  >
                    选择文件
                  </button>
                  <input
                    ref={policyFileInputRef}
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    className="hidden"
                    onChange={handlePolicyFileInputChange}
                  />
                </div>
              </div>
            )}

            {policySourceMode === 'github' && (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-medium">从 GitHub 自动查找指令文件</div>
                <div className="text-xs text-gray-500">
                  支持 repo / tree / blob / raw 链接，系统会自动定位 {POLICY_TEMPLATE_HELPER} 并导入。
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={policyGithubUrl}
                    onChange={(event) => setPolicyGithubUrl(event.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={importPolicyFromGithub}
                    disabled={isPending}
                    className="shrink-0 rounded bg-[#d97757] px-3 py-2 text-xs text-white hover:bg-[#c05f3e] disabled:opacity-60"
                  >
                    导入
                  </button>
                </div>
              </div>
            )}

            {policySourceMode === 'manual' && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                在下方输入框中直接编写模板内容。
              </div>
            )}

            <div className="grid gap-2">
              <input
                value={activePolicyDraft.name}
                onChange={(event) => setActivePolicyDraft({ name: event.target.value })}
                placeholder="模板名称（例如：General Development）"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={activePolicyDraft.description}
                onChange={(event) => setActivePolicyDraft({ description: event.target.value })}
                placeholder="模板说明（可选）"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="space-y-1">
                <div className="text-xs text-gray-500">模板内容（可编辑）</div>
                <textarea
                  value={activePolicyDraft.content}
                  onChange={(event) => setActivePolicyDraft({ content: event.target.value })}
                  placeholder="输入模板内容"
                  className="min-h-56 w-full rounded-md border border-gray-200 bg-slate-50 px-3 py-2 text-sm font-mono"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelCreatePolicy}
                disabled={isPending}
                className="rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={savePolicy}
                disabled={isPending}
                className="rounded bg-[#d97757] px-3 py-2 text-sm text-white hover:bg-[#c05f3e] disabled:opacity-60"
              >
                {editingPolicyId ? '保存更改' : '保存模板'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportingLoadout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">从仓库导入{LOADOUT_LABEL}</div>
                <div className="text-xs text-gray-500">
                  支持 GitHub 仓库根链接或 `tree/.../skills` 链接
                </div>
              </div>
              <button
                type="button"
                onClick={cancelLoadoutImport}
                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                关闭
              </button>
            </div>

            <div className="grid gap-2">
              <input
                value={loadoutImportUrl}
                onChange={(event) => setLoadoutImportUrl(event.target.value)}
                placeholder="https://github.com/obra/superpowers 或 /tree/main/skills"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={loadoutImportName}
                onChange={(event) => setLoadoutImportName(event.target.value)}
                placeholder={`${LOADOUT_LABEL}名称（可选）`}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={loadoutImportDescription}
                onChange={(event) => setLoadoutImportDescription(event.target.value)}
                placeholder="描述（可选）"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={loadoutImportOverwrite}
                onChange={(event) => setLoadoutImportOverwrite(event.target.checked)}
              />
              覆盖已存在的同名 Hub Skills
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelLoadoutImport}
                disabled={isPending}
                className="rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitLoadoutImport}
                disabled={isPending}
                className="rounded bg-[#d97757] px-3 py-2 text-sm text-white hover:bg-[#c05f3e] disabled:opacity-60"
              >
                导入并创建 package
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreatingLoadout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {editingLoadoutId ? `查看 / 编辑${LOADOUT_LABEL}` : `新建${LOADOUT_LABEL}`}
                </div>
                <div className="text-xs text-gray-500">在弹窗中选择并打包 Skills</div>
              </div>
              <button
                type="button"
                onClick={cancelCreateLoadout}
                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
              >
                关闭
              </button>
            </div>

            <div className="grid gap-2">
              <input
                value={loadoutName}
                onChange={(event) => setLoadoutName(event.target.value)}
                placeholder={`${LOADOUT_LABEL}名称`}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={loadoutDescription}
                onChange={(event) => setLoadoutDescription(event.target.value)}
                placeholder="描述（可选）"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">当前 package Skills</div>
                  <div className="text-[11px] text-gray-500">
                    {currentLoadoutSkills.length} selected
                  </div>
                </div>
                {currentLoadoutSkills.length === 0 ? (
                  <div className="text-xs text-gray-500">当前 package 还没有 Skill。</div>
                ) : (
                  <div className="max-h-64 overflow-auto space-y-1.5">
                    {currentLoadoutSkills.map((skill) => (
                      <div
                        key={skill.path}
                        draggable
                        onDragStart={(event) => handleLoadoutSkillDragStart(event, skill.path)}
                        onDragOver={(event) => handleLoadoutSkillDragOver(event, skill.path)}
                        onDrop={(event) => handleLoadoutSkillDrop(event, skill.path)}
                        onDragEnd={clearLoadoutDragState}
                        data-testid={`loadout-skill-${getPathTail(skill.path)}`}
                        className={`flex cursor-move items-center justify-between gap-2 rounded border px-2 py-1.5 ${
                          skill.isMissingFromHub
                            ? 'border-amber-200 bg-amber-50'
                            : loadoutDropTargetPath === skill.path &&
                                draggingLoadoutSkillPath &&
                                draggingLoadoutSkillPath !== skill.path
                              ? 'border-[#d97757] bg-[#fff8f5]'
                              : 'border-gray-100 bg-gray-50'
                        } ${draggingLoadoutSkillPath === skill.path ? 'opacity-70' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-xs font-medium">{skill.name}</div>
                          </div>
                          <div className="truncate text-[11px] text-gray-500">
                            {getPathTail(skill.path)}
                          </div>
                          {skill.isMissingFromHub && (
                            <div className="text-[11px] text-amber-700">Hub 中暂未找到此 Skill</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSkillFromLoadout(skill.path)}
                          className="shrink-0 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Hub Skills</div>
                  <div className="text-[11px] text-gray-500">
                    {availableHubSkills.length} available
                  </div>
                </div>
                {hubSkills.length === 0 ? (
                  <div className="text-xs text-gray-500">
                    Hub 还没有 Skill，先在 Skills 创建或导入。
                  </div>
                ) : availableHubSkills.length === 0 ? (
                  <div className="text-xs text-gray-500">Hub 里的 Skill 已全部加入当前 package。</div>
                ) : (
                  <div className="max-h-64 overflow-auto space-y-1.5">
                    {availableHubSkills.map((skill) => (
                      <div
                        key={skill.path}
                        className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{skill.name}</div>
                          <div className="truncate text-[11px] text-gray-500">
                            {getPathTail(skill.path)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addSkillToLoadout(skill.path)}
                          className="shrink-0 rounded border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                        >
                          添加
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelCreateLoadout}
                disabled={isPending}
                className="rounded border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveLoadout}
                disabled={isPending}
                className="rounded bg-[#d97757] px-3 py-2 text-sm text-white hover:bg-[#c05f3e] disabled:opacity-60"
              >
                {editingLoadoutId ? '保存更改' : `保存${LOADOUT_LABEL}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
