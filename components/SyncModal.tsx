'use client'

import { Skill } from '@/lib/skills-types'
import { AppConfig } from '@/lib/config'
import styles from './SyncModal.module.css'
import { useEffect, useState } from 'react'
import { actionSyncSkill } from '@/app/actions'
import { X, Share2, Folder, Monitor, Copy, Link as LinkIcon } from 'lucide-react'

interface SyncModalProps {
  skill: Skill
  config: AppConfig
  isOpen: boolean
  onClose: () => void
}

interface Target {
  id: string
  type: 'agent' | 'project'
  name: string
  path: string // Destination PARENT path
}

export function SyncModal({ skill, config, isOpen, onClose }: SyncModalProps) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [syncMode, setSyncMode] = useState<'copy' | 'link'>('copy')
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedTargets([])
    }
  }, [isOpen, skill.path])

  if (!isOpen) return null

  const targets: Target[] = []

  const activeAgents = config.agents.filter((a) => a.enabled)

  // Agents (Global)
  for (const agent of activeAgents) {
    targets.push({
      id: `agent-${agent.name}`,
      type: 'agent',
      name: `${agent.name} (Global)`,
      path: agent.globalPath,
    })
  }

  // Projects
  for (const projectPath of config.projects) {
    const projName = projectPath.split('/').pop()

    for (const agent of activeAgents) {
      targets.push({
        id: `proj-${projName}-${agent.name}`,
        type: 'project',
        name: `${projName} (${agent.name})`,
        path: selectedJoin(projectPath, agent.projectPath),
      })
    }
  }

  function selectedJoin(p1: string, p2: string) {
    if (p1.endsWith('/')) return p1 + p2
    return p1 + '/' + p2
  }

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const handleSync = async () => {
    try {
      setIsSyncing(true)
      const targetsToSync = targets.filter((t) => selectedTargets.includes(t.id))

      for (const target of targetsToSync) {
        await actionSyncSkill(skill.path, target.path, syncMode)
      }

      onClose()
    } catch (e) {
      alert('Sync failed: ' + e)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.windowHeader}>
          <div className={styles.title}>
            <Share2 size={16} />
            Sync: {skill.name}
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.label}>Select Targets</div>
            <div className={styles.list}>
              {targets.map((target) => (
                <div
                  key={target.id}
                  className={styles.option}
                  onClick={() => toggleTarget(target.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTargets.includes(target.id)}
                    onChange={() => {}}
                  />
                  {target.type === 'agent' ? (
                    <Monitor size={14} className="text-blue-500" />
                  ) : (
                    <Folder size={14} className="text-yellow-500" />
                  )}
                  <span className="font-mono text-sm">{target.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sync Mode Selection */}
          <div className={styles.section} style={{ marginTop: '16px' }}>
            <div className={styles.label}>Sync Mode</div>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="syncMode"
                  value="copy"
                  checked={syncMode === 'copy'}
                  onChange={() => setSyncMode('copy')}
                />
                <Copy size={14} className="text-gray-500" />
                <span className="text-sm">Copy (Clone)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="syncMode"
                  value="link"
                  checked={syncMode === 'link'}
                  onChange={() => setSyncMode('link')}
                />
                <LinkIcon size={14} className="text-gray-500" />
                <span className="text-sm">Link (Symlink)</span>
              </label>
            </div>
            <div className="text-xs text-gray-400 mt-1 ml-1">
              {syncMode === 'copy'
                ? 'Creates an independent copy. Changes to source are not reflected until re-sync.'
                : 'Creates a symbolic link. Changes to source are immediately reflected.'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose} disabled={isSyncing}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSync}
            disabled={isSyncing || selectedTargets.length === 0}
          >
            {isSyncing ? 'Syncing...' : `Sync (${selectedTargets.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
