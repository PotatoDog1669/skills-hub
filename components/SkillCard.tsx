'use client'

import { Skill } from '@/lib/skills-types'
import Link from 'next/link'
import styles from './SkillCard.module.css'
import { actionDeleteSkill } from '@/app/actions'
import { Share2, Trash2, Layers, Monitor, Folder, Download, Terminal } from 'lucide-react'
import clsx from 'clsx'
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

export function SkillCard({ unifiedSkill, onSync, viewContext }: SkillCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCollecting, setIsCollecting] = useState(false)

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<Skill[]>([])

  const { confirm } = useConfirm()

  const primaryInstance =
    unifiedSkill.instances.find((s) => s.location === 'hub') ||
    unifiedSkill.instances.find((s) => s.location === 'agent') ||
    unifiedSkill.instances[0]

  const hasHubInstance = unifiedSkill.instances.some((s) => s.location === 'hub')

  const handleCollect = async () => {
    const confirmed = await confirm({
      title: 'Save to Hub',
      message: `Save skill "${unifiedSkill.name}" to Central Hub?\n\nThis will create a copy in ~/skills-hub.`,
    })

    if (!confirmed) return

    try {
      setIsCollecting(true)
      const { actionCollectToHub } = await import('@/app/actions')
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

  return (
    <div className={styles.card}>
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

            {unifiedSkill.instances
              .filter((s) => s.location === 'agent')
              .map((s) => (
                <span key={s.id} className={styles.badge} title={`Agent: ${s.agentName}`}>
                  <Monitor size={10} className="inline mr-1" /> {s.agentName}
                </span>
              ))}

            {unifiedSkill.instances
              .filter((s) => s.location === 'project')
              .map((s) => (
                <span key={s.id} className={styles.badge} title={`Project: ${s.projectName}`}>
                  <Folder size={10} className="inline mr-1" /> {s.projectName}
                  {s.agentName ? ` (${s.agentName})` : ''}
                </span>
              ))}
          </div>
        </Link>

        <div className={styles.description} title={unifiedSkill.description}>
          <span className="text-[#40a02b] select-none mr-2 font-bold">{'//'}</span>
          {unifiedSkill.description || 'No description provided.'}
        </div>

        <div className={styles.actions}>
          <button
            className={clsx(styles.btn, styles.btnPrimary)}
            onClick={() => onSync(primaryInstance)}
            title="Sync to other locations"
          >
            <div className="flex items-center justify-center gap-2">
              <Share2 size={14} style={{ transform: 'translateY(1.5px)' }} /> <span>Sync</span>
            </div>
          </button>

          {!hasHubInstance && (
            <button
              className={clsx(styles.btn, styles.btnSave)}
              onClick={handleCollect}
              disabled={isCollecting}
              title="Save this skill to Central Hub"
            >
              <div className="flex items-center justify-center gap-2">
                <Download size={14} style={{ transform: 'translateY(1.5px)' }} /> <span>Save</span>
              </div>
            </button>
          )}

          <button
            className={clsx(styles.btn, styles.btnDestructive)}
            onClick={handleDelete}
            disabled={isDeleting}
            title={
              viewContext.view === 'all' ? 'Delete from ALL locations' : 'Delete from current view'
            }
          >
            <div className="flex items-center justify-center gap-2">
              {isDeleting ? '...' : <Trash2 size={14} />}
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
