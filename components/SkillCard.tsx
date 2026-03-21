'use client'

import { Skill } from '@/lib/skills-types'
import Link from '@/apps/desktop-ui/src/shims/link'
import styles from './SkillCard.module.css'
import {
  actionDeleteSkill,
  actionSetProjectSkillEnabled,
  actionSetProjectSkillPackageEnabled,
} from '@/apps/desktop-ui/src/tauri-actions'
import {
  Share2,
  Trash2,
  Layers,
  Monitor,
  Folder,
  Download,
  Terminal,
  Package,
  EyeOff,
  Eye,
} from 'lucide-react'
import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useConfirm } from './ConfirmProvider'
import { DeleteSkillModal } from './DeleteSkillModal'

export interface UnifiedSkill {
  name: string
  description: string
  instances: Skill[]
}

export interface ViewContext {
  view: string
  id: string | null
}

interface SkillCardProps {
  unifiedSkill: UnifiedSkill
  onSync: (primarySkill: Skill) => void
  viewContext: ViewContext
}

interface ActionButtonConfig {
  key: string
  label: string
  showLabel?: boolean
  title: string
  className: string
  disabled?: boolean
  onClick: () => void
  icon: typeof Share2
}

function chunkActions<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function SkillCard({ unifiedSkill, onSync, viewContext }: SkillCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCollecting, setIsCollecting] = useState(false)
  const [isUpdatingProjectSkill, setIsUpdatingProjectSkill] = useState(false)
  const [isUpdatingProjectPackage, setIsUpdatingProjectPackage] = useState(false)

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<Skill[]>([])

  const { confirm } = useConfirm()
  const projectViewId = viewContext.view === 'project' ? viewContext.id : null

  const projectInstancesInView =
    projectViewId
      ? unifiedSkill.instances.filter(
          (instance) =>
            instance.location === 'project' &&
            (instance.projectPath === projectViewId || instance.path.startsWith(projectViewId))
        )
      : []
  const primaryInstance =
    (viewContext.view === 'project' ? projectInstancesInView[0] : undefined) ||
    (viewContext.view === 'agent'
      ? unifiedSkill.instances.find((instance) => instance.agentName === viewContext.id)
      : undefined) ||
    unifiedSkill.instances.find((s) => s.location === 'hub') ||
    unifiedSkill.instances.find((s) => s.location === 'agent') ||
    unifiedSkill.instances[0]
  const hasHubInstance = unifiedSkill.instances.some((s) => s.location === 'hub')
  const agentBadges = unifiedSkill.instances.filter((s) => s.location === 'agent')
  const projectBadges =
    viewContext.view === 'project'
      ? []
      : unifiedSkill.instances.filter((s) => s.location === 'project')
  const enabledProjectInstances = projectInstancesInView.filter((instance) => instance.enabled !== false)
  const disabledProjectInstances = projectInstancesInView.filter((instance) => instance.enabled === false)
  const projectPackages = Array.from(
    new Map(
      projectInstancesInView
        .filter((instance) => instance.sourcePackageName)
        .map((instance) => [
          instance.sourcePackageId || instance.sourcePackageName || instance.path,
          {
            id: instance.sourcePackageId,
            name: instance.sourcePackageName || '',
          },
        ])
    ).values()
  )
  const singleProjectPackage = projectPackages.length === 1 ? projectPackages[0] : null

  const handleCollect = async () => {
    const confirmed = await confirm({
      title: 'Save to Hub',
      message: `Save skill "${unifiedSkill.name}" to Central Hub?\n\nThis will create a copy in ~/skills-hub.`,
    })

    if (!confirmed) return

    try {
      setIsCollecting(true)
      const { actionCollectToHub } = await import('@/apps/desktop-ui/src/tauri-actions')
      await actionCollectToHub(primaryInstance.path)
    } catch (e) {
      alert('Failed to collect: ' + e)
    } finally {
      setIsCollecting(false)
    }
  }

  const handleDelete = async () => {
    let targets: Skill[] = []

    if (viewContext.view === 'hub') {
      targets = unifiedSkill.instances.filter((s) => s.location === 'hub')
    } else if (viewContext.view === 'agent' && viewContext.id) {
      targets = unifiedSkill.instances.filter((s) => s.agentName === viewContext.id)
    } else if (viewContext.view === 'project' && viewContext.id) {
      targets = unifiedSkill.instances.filter((s) => s.path.startsWith(viewContext.id!))
    } else {
      targets = unifiedSkill.instances
    }

    if (targets.length === 0) {
      alert('No instances found to delete in this view.')
      return
    }

    setDeleteTargets(targets)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = async (selectedPaths: string[]) => {
    setIsDeleting(true)
    try {
      for (const path of selectedPaths) {
        await actionDeleteSkill(path)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleProjectSkillEnabledChange = async (enabled: boolean) => {
    const targets = enabled ? disabledProjectInstances : enabledProjectInstances
    if (targets.length === 0) {
      return
    }

    try {
      setIsUpdatingProjectSkill(true)
      for (const target of targets) {
        await actionSetProjectSkillEnabled(target.path, enabled)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to update skill: ${String(error)}`)
    } finally {
      setIsUpdatingProjectSkill(false)
    }
  }

  const handleProjectPackageEnabledChange = async (enabled: boolean) => {
    if (!viewContext.id || !singleProjectPackage) {
      return
    }

    try {
      setIsUpdatingProjectPackage(true)
      await actionSetProjectSkillPackageEnabled({
        projectPath: viewContext.id,
        enabled,
        packageId: singleProjectPackage.id,
        packageName: singleProjectPackage.name,
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to update skills package: ${String(error)}`)
    } finally {
      setIsUpdatingProjectPackage(false)
    }
  }

  const actionButtons: ActionButtonConfig[] = [
    {
      key: 'sync',
      label: '同步',
      showLabel: true,
      title: 'Sync to other locations',
      className: clsx(styles.btn, styles.btnWithText, styles.btnPrimary),
      onClick: () => onSync(primaryInstance),
      icon: Share2,
    },
  ]

  if (!hasHubInstance) {
    actionButtons.push({
      key: 'save',
      label: isCollecting ? '...' : '保存',
      showLabel: true,
      title: 'Save this skill to Central Hub',
      className: clsx(styles.btn, styles.btnWithText, styles.btnSave),
      disabled: isCollecting,
      onClick: handleCollect,
      icon: Download,
    })
  }

  if (viewContext.view === 'project' && enabledProjectInstances.length > 0) {
    actionButtons.push({
      key: 'disable-skill',
      label: isUpdatingProjectSkill ? '...' : 'Disable',
      title: 'Temporarily disable this skill in the current project',
      className: clsx(styles.btn, styles.btnGhost),
      disabled: isUpdatingProjectSkill,
      onClick: () => handleProjectSkillEnabledChange(false),
      icon: EyeOff,
    })
  }

  if (viewContext.view === 'project' && disabledProjectInstances.length > 0) {
    actionButtons.push({
      key: 'enable-skill',
      label: isUpdatingProjectSkill ? '...' : 'Enable',
      title: 'Re-enable this skill in the current project',
      className: clsx(styles.btn, styles.btnGhost),
      disabled: isUpdatingProjectSkill,
      onClick: () => handleProjectSkillEnabledChange(true),
      icon: Eye,
    })
  }

  if (viewContext.view === 'project' && singleProjectPackage && enabledProjectInstances.length > 0) {
    actionButtons.push({
      key: 'disable-package',
      label: isUpdatingProjectPackage ? '...' : 'Disable Package',
      title: `Temporarily disable all skills from ${singleProjectPackage.name}`,
      className: clsx(styles.btn, styles.btnPackage),
      disabled: isUpdatingProjectPackage,
      onClick: () => handleProjectPackageEnabledChange(false),
      icon: Package,
    })
  }

  if (viewContext.view === 'project' && singleProjectPackage && disabledProjectInstances.length > 0) {
    actionButtons.push({
      key: 'enable-package',
      label: isUpdatingProjectPackage ? '...' : 'Enable Package',
      title: `Re-enable all skills from ${singleProjectPackage.name}`,
      className: clsx(styles.btn, styles.btnPackage),
      disabled: isUpdatingProjectPackage,
      onClick: () => handleProjectPackageEnabledChange(true),
      icon: Package,
    })
  }

  const renderActionButton = (action: ActionButtonConfig) => {
    const Icon = action.icon
    return (
      <button
        key={action.key}
        className={action.className}
        onClick={action.onClick}
        disabled={action.disabled}
        title={action.showLabel ? action.title : action.label}
      >
        <div className={clsx("flex items-center justify-center", action.showLabel && "gap-1.5")}>
          <Icon size={13.5} strokeWidth={2.5} />
          {action.showLabel && <span className="font-medium text-[12px]">{action.label}</span>}
        </div>
      </button>
    )
  }

  return (
    <div
      className={clsx(
        styles.card,
        projectInstancesInView.length > 0 && disabledProjectInstances.length === projectInstancesInView.length
          ? styles.cardDisabled
          : undefined
      )}
    >
      {/* Window Header */}
      <div className={styles.windowHeader}>
        <div className={styles.dots}>
          <div className={clsx(styles.dot, styles.dotRed)} />
          <div className={clsx(styles.dot, styles.dotYellow)} />
          <div className={clsx(styles.dot, styles.dotGreen)} />
        </div>
        <div className="flex items-center gap-2 ml-2 text-xs font-mono text-muted-foreground opacity-70">
          <Terminal size={10} />
          {unifiedSkill.name}
        </div>
      </div>

      <div className={styles.content}>
        <Link
          href={`/?view=detail&path=${encodeURIComponent(primaryInstance.path)}&returnView=${viewContext.view || 'all'}&returnId=${viewContext.id || ''}`}
          className="block w-full cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className={styles.title}>{unifiedSkill.name}</div>

          <div className={styles.badges}>
            {unifiedSkill.instances.some((s) => s.location === 'hub') && (
              <span
                className={clsx(styles.badge, styles.badgePrimary)}
                title="Present in Central Hub"
              >
                <Layers size={10} className="inline mr-1" /> Hub
              </span>
            )}

            {agentBadges.map((s) => (
              <span key={s.id} className={styles.badge} title={`Agent: ${s.agentName}`}>
                <Monitor size={10} className="inline mr-1" /> {s.agentName}
              </span>
            ))}

            {projectBadges.map((s) => (
              <span key={s.id} className={styles.badge} title={`Project: ${s.projectName}`}>
                <Folder size={10} className="inline mr-1" /> {s.projectName}
                {s.agentName ? ` (${s.agentName})` : ''}
              </span>
            ))}

            {viewContext.view === 'project' &&
              projectInstancesInView.some((instance) => instance.enabled === false) && (
                <span className={clsx(styles.badge, styles.badgeMuted)} title="Temporarily disabled in this project">
                  <EyeOff size={10} className="inline mr-1" /> Disabled
                </span>
              )}

            {viewContext.view === 'project' &&
              projectPackages.map((pkg) => (
                <span
                  key={pkg.id || pkg.name}
                  className={clsx(styles.badge, styles.badgePackage)}
                  title={`Skills package: ${pkg.name}`}
                >
                  <Package size={10} className="inline mr-1" /> {pkg.name}
                </span>
              ))}
          </div>
        </Link>

        <div className={styles.description} title={unifiedSkill.description}>
          <span className="text-[#40a02b] select-none mr-2 font-bold">{'//'}</span>
          {unifiedSkill.description || 'No description provided.'}
        </div>

        <div className={styles.actions}>
          {actionButtons.map(renderActionButton)}
          <button
            className={clsx(styles.btn, styles.btnDestructive)}
            style={{ marginLeft: 'auto' }}
            onClick={handleDelete}
            disabled={isDeleting}
            title={
              viewContext.view === 'all'
                ? 'Delete from ALL locations'
                : 'Delete from current view'
            }
          >
            <div className="flex items-center justify-center">
              {isDeleting ? '...' : <Trash2 size={12.5} strokeWidth={2.5} />}
            </div>
          </button>
        </div>
      </div>

      <DeleteSkillModal
        skillName={unifiedSkill.name}
        targets={deleteTargets}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
