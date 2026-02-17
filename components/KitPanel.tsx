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
import { Plus } from 'lucide-react'
import {
  actionAddProject,
  actionKitAdd,
  actionKitApply,
  actionKitDelete,
  actionKitLoadoutAdd,
  actionKitLoadoutDelete,
  actionKitLoadoutUpdate,
  actionKitPolicyAdd,
  actionKitPolicyDelete,
  actionKitPolicyResolveGithub,
  actionKitPolicyUpdate,
  actionKitUpdate,
  actionPickDirectory,
} from '@/apps/desktop-ui/src/tauri-actions'
import type { AgentConfig } from '@/lib/config'
import type { Skill } from '@/lib/skills-types'
import type {
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  KitSyncMode,
} from '@/lib/core/kit-types'
import { useConfirm } from '@/components/ConfirmProvider'

interface KitPanelProps {
  policies: KitPolicyRecord[]
  loadouts: KitLoadoutRecord[]
  kits: KitRecord[]
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

type PolicySourceMode = 'drag' | 'github' | 'manual'
type PolicyDraft = {
  name: string
  description: string
  content: string
}

function isPolicyFilenameAccepted(fileName: string): boolean {
  return /^agents?\.md$/i.test(String(fileName || '').trim())
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

export function KitPanel({ policies, loadouts, kits, skills, projects, agents }: KitPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { prompt } = useConfirm()

  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents])
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

  const [selectedLoadoutId, setSelectedLoadoutId] = useState<string>(loadouts[0]?.id || '')
  const [editingLoadoutId, setEditingLoadoutId] = useState<string | null>(loadouts[0]?.id || null)
  const [loadoutName, setLoadoutName] = useState<string>(loadouts[0]?.name || '')
  const [loadoutDescription, setLoadoutDescription] = useState<string>(
    loadouts[0]?.description || ''
  )
  const [selectedLoadoutSkills, setSelectedLoadoutSkills] = useState<string[]>(
    loadouts[0]?.items.map((item) => item.skillPath) || []
  )

  const [selectedKitId, setSelectedKitId] = useState<string>(kits[0]?.id || '')
  const [editingKitId, setEditingKitId] = useState<string | null>(kits[0]?.id || null)
  const [kitName, setKitName] = useState<string>(kits[0]?.name || '')
  const [kitDescription, setKitDescription] = useState<string>(kits[0]?.description || '')

  const [applyProjectPath, setApplyProjectPath] = useState<string>(projects[0] || '')
  const [applyAgentName, setApplyAgentName] = useState<string>(enabledAgents[0]?.name || '')
  const [applySyncMode, setApplySyncMode] = useState<KitSyncMode>('copy')
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false)
  const [isCreatingPolicy, setIsCreatingPolicy] = useState(false)
  const [isCreatingLoadout, setIsCreatingLoadout] = useState(false)
  const [policySourceMode, setPolicySourceMode] = useState<PolicySourceMode>('drag')
  const [policyGithubUrl, setPolicyGithubUrl] = useState('')
  const [isPolicyDragOver, setIsPolicyDragOver] = useState(false)
  const policyFileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) || null
  const selectedLoadout = loadouts.find((loadout) => loadout.id === selectedLoadoutId) || null
  const activePolicyDraft = policyDrafts[policySourceMode]
  const displayMessageText =
    message?.type === 'error' ? message.text.replace(/^[a-z_]+:\s*/i, '') : message?.text || ''

  useEffect(() => {
    if (!message || message.type !== 'success') return
    const timer = window.setTimeout(() => setMessage(null), 2600)
    return () => window.clearTimeout(timer)
  }, [message])

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
    const fallback = policies[0]
    setSelectedPolicyId(fallback?.id || '')
    setEditingPolicyId(fallback?.id || null)
    const nextDraft = createPolicyDraft({
      name: fallback?.name || '',
      description: fallback?.description || '',
      content: fallback?.content || '',
    })
    setPolicyDrafts({
      drag: { ...nextDraft },
      github: { ...nextDraft },
      manual: { ...nextDraft },
    })
  }, [policies, selectedPolicyId])

  useEffect(() => {
    if (selectedLoadoutId && loadouts.some((loadout) => loadout.id === selectedLoadoutId)) {
      return
    }
    const fallback = loadouts[0]
    setSelectedLoadoutId(fallback?.id || '')
    setEditingLoadoutId(fallback?.id || null)
    setLoadoutName(fallback?.name || '')
    setLoadoutDescription(fallback?.description || '')
    setSelectedLoadoutSkills(fallback?.items.map((item) => item.skillPath) || [])
  }, [loadouts, selectedLoadoutId])

  useEffect(() => {
    if (selectedKitId && kits.some((kit) => kit.id === selectedKitId)) {
      return
    }
    const fallback = kits[0]
    setSelectedKitId(fallback?.id || '')
    setEditingKitId(fallback?.id || null)
    setKitName(fallback?.name || '')
    setKitDescription(fallback?.description || '')
    if (fallback) {
      setSelectedPolicyId(fallback.policyId)
      setSelectedLoadoutId(fallback.loadoutId)
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

  const selectPolicy = (policy: KitPolicyRecord) => {
    setIsCreatingPolicy(false)
    setSelectedPolicyId(policy.id)
    setEditingPolicyId(policy.id)
    const nextDraft = createPolicyDraft({
      name: policy.name,
      description: policy.description || '',
      content: policy.content,
    })
    setPolicyDrafts({
      drag: { ...nextDraft },
      github: { ...nextDraft },
      manual: { ...nextDraft },
    })
  }

  const openPolicyEditor = (policy?: KitPolicyRecord | null) => {
    const target = policy || selectedPolicy
    if (!target) {
      setMessage({ type: 'error', text: '请先选择一个 AGENTS.md。' })
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
      drag: { ...nextDraft },
      github: { ...nextDraft },
      manual: { ...nextDraft },
    })
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
      throw new Error('请导入文件名为 AGENTS.md（或 AGENT.md）的 Markdown 文件。')
    }

    const content = await file.text()
    if (!content.trim()) {
      throw new Error('AGENTS.md 文件内容为空。')
    }

    const droppedPath = normalizeDroppedPath(file)
    const sourceLabel = droppedPath || fileName

    setPolicyDrafts((prev) => ({
      ...prev,
      drag: {
        ...prev.drag,
        content,
        name: normalizeText(prev.drag.name) ? prev.drag.name : 'Imported AGENTS',
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
        text: error instanceof Error ? error.message : `导入 AGENTS.md 失败：${String(error)}`,
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
          text: '未在拖拽内容中找到 AGENTS.md 或 AGENT.md。',
        })
        return
      }

      await importPolicyFile(file)
    })().catch((error) => {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : `导入 AGENTS.md 失败：${String(error)}`,
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
          throw new Error('获取到的 AGENTS.md 内容为空。')
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
            error instanceof Error ? error.message : `从 GitHub 导入 AGENTS.md 失败：${String(error)}`,
        })
      }
    })
  }

  const savePolicy = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(activePolicyDraft.name)
        const content = activePolicyDraft.content.trim()
        if (!name) throw new Error('AGENTS.md 名称不能为空。')
        if (!content) throw new Error('AGENTS.md 内容不能为空。')

        if (editingPolicyId) {
          const updated = await actionKitPolicyUpdate({
            id: editingPolicyId,
            name,
            description: normalizeText(activePolicyDraft.description) || undefined,
            content,
          })
          if (!updated) throw new Error('更新 AGENTS.md 失败。')
          setSelectedPolicyId(updated.id)
          setEditingPolicyId(updated.id)
          setIsCreatingPolicy(false)
          setMessage({ type: 'success', text: 'AGENTS.md 已更新。' })
        } else {
          const created = await actionKitPolicyAdd({
            name,
            description: normalizeText(activePolicyDraft.description) || undefined,
            content,
          })
          if (!created) throw new Error('创建 AGENTS.md 失败。')
          setSelectedPolicyId(created.id)
          setEditingPolicyId(created.id)
          setIsCreatingPolicy(false)
          setMessage({ type: 'success', text: 'AGENTS.md 已创建。' })
        }

        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `保存 AGENTS.md 失败：${String(error)}`,
        })
      }
    })
  }

  const deletePolicy = () => {
    const targetId = editingPolicyId || selectedPolicyId
    if (!targetId) {
      setMessage({ type: 'error', text: '请先选择一个 AGENTS.md。' })
      return
    }

    startTransition(async () => {
      try {
        await actionKitPolicyDelete(targetId)
        setMessage({ type: 'success', text: 'AGENTS.md 已删除。' })
        resetPolicyDraft()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : `删除 AGENTS.md 失败：${String(error)}`,
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
    setIsCreatingLoadout(true)
  }

  const cancelCreateLoadout = () => {
    setIsCreatingLoadout(false)
  }

  const selectLoadout = (loadout: KitLoadoutRecord) => {
    setIsCreatingLoadout(false)
    setSelectedLoadoutId(loadout.id)
    setEditingLoadoutId(loadout.id)
    setLoadoutName(loadout.name)
    setLoadoutDescription(loadout.description || '')
    setSelectedLoadoutSkills(loadout.items.map((item) => item.skillPath))
  }

  const openLoadoutEditor = (loadout?: KitLoadoutRecord | null) => {
    const target = loadout || selectedLoadout
    if (!target) {
      setMessage({ type: 'error', text: '请先选择一个 Skills package。' })
      return
    }

    setSelectedLoadoutId(target.id)
    setEditingLoadoutId(target.id)
    setLoadoutName(target.name)
    setLoadoutDescription(target.description || '')
    setSelectedLoadoutSkills(target.items.map((item) => item.skillPath))
    setIsCreatingPolicy(false)
    setIsCreatingLoadout(true)
  }

  const toggleSkill = (skillPath: string, checked: boolean) => {
    setSelectedLoadoutSkills((prev) => {
      if (checked) {
        if (prev.includes(skillPath)) return prev
        return [...prev, skillPath]
      }
      return prev.filter((entry) => entry !== skillPath)
    })
  }

  const saveLoadout = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(loadoutName)
        if (!name) throw new Error('Skills package 名称不能为空。')
        if (selectedLoadoutSkills.length === 0)
          throw new Error('Skills package 至少选择一个 Skill。')

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
          if (!updated) throw new Error('更新 Skills package 失败。')
          setSelectedLoadoutId(updated.id)
          setEditingLoadoutId(updated.id)
          setIsCreatingLoadout(false)
          setMessage({ type: 'success', text: 'Skills package 已更新。' })
        } else {
          const created = await actionKitLoadoutAdd({
            name,
            description: normalizeText(loadoutDescription) || undefined,
            items,
          })
          if (!created) throw new Error('创建 Skills package 失败。')
          setSelectedLoadoutId(created.id)
          setEditingLoadoutId(created.id)
          setIsCreatingLoadout(false)
          setMessage({ type: 'success', text: 'Skills package 已创建。' })
        }

        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error ? error.message : `保存 Skills package 失败：${String(error)}`,
        })
      }
    })
  }

  const deleteLoadout = () => {
    const targetId = editingLoadoutId || selectedLoadoutId
    if (!targetId) {
      setMessage({ type: 'error', text: '请先选择一个 Skills package。' })
      return
    }

    startTransition(async () => {
      try {
        await actionKitLoadoutDelete(targetId)
        setMessage({ type: 'success', text: 'Skills package 已删除。' })
        resetLoadoutDraft()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error ? error.message : `删除 Skills package 失败：${String(error)}`,
        })
      }
    })
  }

  const resetKitDraft = () => {
    setEditingKitId(null)
    setKitName('')
    setKitDescription('')
  }

  const selectKit = (kit: KitRecord) => {
    setSelectedKitId(kit.id)
    setEditingKitId(kit.id)
    setKitName(kit.name)
    setKitDescription(kit.description || '')
    setSelectedPolicyId(kit.policyId)
    setSelectedLoadoutId(kit.loadoutId)
  }

  const saveKit = () => {
    startTransition(async () => {
      try {
        const name = normalizeText(kitName)
        if (!name) throw new Error('Kit 名称不能为空。')
        if (!selectedPolicyId) throw new Error('请先选择 AGENTS.md。')
        if (!selectedLoadoutId) throw new Error('请先选择 Skills package。')

        if (editingKitId) {
          const updated = await actionKitUpdate({
            id: editingKitId,
            name,
            description: normalizeText(kitDescription) || undefined,
            policyId: selectedPolicyId,
            loadoutId: selectedLoadoutId,
          })
          if (!updated) throw new Error('更新 Kit 失败。')
          setSelectedKitId(updated.id)
          setEditingKitId(updated.id)
          setMessage({ type: 'success', text: 'Kit 已更新。' })
        } else {
          const created = await actionKitAdd({
            name,
            description: normalizeText(kitDescription) || undefined,
            policyId: selectedPolicyId,
            loadoutId: selectedLoadoutId,
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

  const deleteCurrentKit = () => {
    const targetId = editingKitId || selectedKitId
    if (!targetId) {
      setMessage({ type: 'error', text: '请先选择一个 Kit。' })
      return
    }

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
        })

      const showSuccess = (params: {
        successCount: number
        policyPath: string
        overwrote: boolean
      }) => {
        const overwriteSuffix = params.overwrote ? '（已确认覆盖现有 AGENTS.md）' : ''
        setMessage({
          type: 'success',
          text: `Kit 应用完成：${params.successCount} 个 Skills 已同步，AGENTS.md 已写入 ${params.policyPath}${overwriteSuffix}`,
        })
      }

      try {
        const result = await applyOnce(false)
        const successCount = result.loadoutResults.filter((row) => row.status === 'success').length
        showSuccess({
          successCount,
          policyPath: result.policyPath,
          overwrote: Boolean(result.overwroteAgentsMd),
        })
        setIsApplyDialogOpen(false)
        router.refresh()
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error)
        if (errorText.startsWith('AGENTS_MD_EXISTS::')) {
          const policyPath = errorText.replace('AGENTS_MD_EXISTS::', '')
          setMessage({
            type: 'error',
            text: `检测到项目中已存在 AGENTS.md：\n${policyPath}\n\n请先手动处理后再应用。`,
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
    setIsApplyDialogOpen(true)
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
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">AGENTS.md</div>
                <div className="text-xs text-gray-500">已完成模板</div>
              </div>
              <button
                type="button"
                onClick={startCreatePolicy}
                disabled={isPending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d97757] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#c76444] disabled:cursor-not-allowed disabled:bg-[#e3a48f] disabled:text-white/90"
                title="新建 AGENTS.md 模板"
                aria-label="新建 AGENTS.md 模板"
              >
                <Plus size={18} strokeWidth={2.5} />
              </button>
            </div>

            {policies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                还没有 AGENTS.md 模板，先创建一个。
              </div>
            ) : (
              <div className="max-h-36 overflow-auto space-y-1">
                {policies.map((policy) => (
                  <button
                    key={policy.id}
                    type="button"
                    onClick={() => selectPolicy(policy)}
                    className={`w-full rounded-md border px-2.5 py-1.5 text-left text-sm ${
                      selectedPolicyId === policy.id
                        ? 'border-[#e6b8a1]'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {policy.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openPolicyEditor()}
                disabled={isPending || policies.length === 0}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
              >
                查看/编辑
              </button>
              <button
                type="button"
                onClick={deletePolicy}
                disabled={isPending || policies.length === 0 || isCreatingPolicy}
                className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                删除
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Skills package</div>
                <div className="text-xs text-gray-500">已打包组合</div>
              </div>
              <button
                type="button"
                onClick={startCreateLoadout}
                disabled={isPending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#d97757] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition-colors hover:bg-[#c76444] disabled:cursor-not-allowed disabled:bg-[#e3a48f] disabled:text-white/90"
                title="新建 Skills package"
                aria-label="新建 Skills package"
              >
                <Plus size={18} strokeWidth={2.5} />
              </button>
            </div>

            {loadouts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500">
                还没有 Skills package，先创建一个技能包。
              </div>
            ) : (
              <div className="max-h-32 overflow-auto space-y-1">
                {loadouts.map((loadout) => (
                  <button
                    key={loadout.id}
                    type="button"
                    onClick={() => selectLoadout(loadout)}
                    className={`w-full rounded-md border px-2.5 py-1.5 text-left text-sm ${
                      selectedLoadoutId === loadout.id
                        ? 'border-[#e6b8a1]'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">{loadout.name}</div>
                    <div className="text-xs text-gray-500">{loadout.items.length} skills</div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openLoadoutEditor()}
                disabled={isPending || loadouts.length === 0}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
              >
                查看/编辑
              </button>
              <button
                type="button"
                onClick={deleteLoadout}
                disabled={isPending || loadouts.length === 0 || isCreatingLoadout}
                className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                删除
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div>
            <div className="text-lg font-semibold">Kit 组合</div>
            <div className="text-xs text-gray-500">右侧保存与应用场景化装备</div>
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">当前组合</div>
            <div className="text-sm">
              AGENTS.md: <span className="font-medium">{selectedPolicy?.name || '未选择'}</span>
            </div>
            <div className="text-sm">
              Skills package:{' '}
              <span className="font-medium">{selectedLoadout?.name || '未选择'}</span>
            </div>
          </div>

          <div className="grid gap-2">
            <input
              value={kitName}
              onChange={(event) => setKitName(event.target.value)}
              placeholder="Kit 名称（如：Frontend Kit）"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              value={kitDescription}
              onChange={(event) => setKitDescription(event.target.value)}
              placeholder="描述（可选）"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
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
                className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                删除
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">已保存 Kits</div>
            {kits.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
                暂无 Kit，先保存一个组合。
              </div>
            ) : (
              <div className="max-h-44 overflow-auto space-y-1">
                {kits.map((kit) => {
                  const policyNameById =
                    policies.find((policy) => policy.id === kit.policyId)?.name || '未知 AGENTS.md'
                  const loadoutNameById =
                    loadouts.find((loadout) => loadout.id === kit.loadoutId)?.name ||
                    '未知 Skills package'
                  return (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => selectKit(kit)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left text-xs ${
                        selectedKitId === kit.id
                          ? 'border-[#e6b8a1]'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{kit.name}</div>
                      <div className="mt-0.5 text-gray-500">{policyNameById}</div>
                      <div className="text-gray-500">{loadoutNameById}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="text-sm font-medium">应用 Kit</div>
            <div className="text-xs text-gray-500">
              点击后在弹窗里选择项目、Agent 和 sync 方式。
            </div>
            <button
              type="button"
              onClick={openApplyDialog}
              disabled={isPending || !(selectedKitId || editingKitId)}
              className="w-full rounded bg-[#d97757] px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              应用
            </button>
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
                  {editingPolicyId ? '查看 / 编辑 AGENTS.md 模板' : '新建 AGENTS.md 模板'}
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
                <div className="text-sm font-medium text-gray-800">把 AGENTS.md 拖拽到这里</div>
                <div className="text-xs text-gray-500">
                  支持拖拽文件或文件夹，会自动查找 AGENTS.md / AGENT.md
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
                <div className="text-sm font-medium">从 GitHub 自动查找 AGENTS.md</div>
                <div className="text-xs text-gray-500">
                  支持 repo / tree / blob / raw 链接，系统会自动定位 AGENTS.md 并导入。
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
                在下方输入框中直接编写 AGENTS.md 内容。
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
                <div className="text-xs text-gray-500">AGENTS.md 内容（可编辑）</div>
                <textarea
                  value={activePolicyDraft.content}
                  onChange={(event) => setActivePolicyDraft({ content: event.target.value })}
                  placeholder="输入 AGENTS.md 模板内容"
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

      {isCreatingLoadout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {editingLoadoutId ? '查看 / 编辑 Skills package' : '新建 Skills package'}
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
                placeholder="Skills package 名称"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={loadoutDescription}
                onChange={(event) => setLoadoutDescription(event.target.value)}
                placeholder="描述（可选）"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium">Hub Skills</div>
              {hubSkills.length === 0 ? (
                <div className="text-xs text-gray-500">
                  Hub 还没有 Skill，先在 Skills 创建或导入。
                </div>
              ) : (
                <div className="max-h-64 overflow-auto space-y-1.5">
                  {hubSkills.map((skill) => {
                    const isChecked = selectedSkillSet.has(skill.path)
                    return (
                      <label
                        key={skill.path}
                        className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(event) => toggleSkill(skill.path, event.target.checked)}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium">{skill.name}</div>
                            <div className="truncate text-[11px] text-gray-500">
                              {getPathTail(skill.path)}
                            </div>
                          </div>
                        </div>

                        {isChecked && (
                          <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500">
                            selected
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
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
                {editingLoadoutId ? '保存更改' : '保存 Skills package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
