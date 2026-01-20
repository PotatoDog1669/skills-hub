'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Home, Folder, Layers, Plus, Trash2, Settings, BookOpen } from 'lucide-react'
import styles from './Sidebar.module.css'
import { AppConfig } from '@/lib/config'
import clsx from 'clsx'
import { actionAddProject, actionRemoveProject } from '@/app/actions'
import { useState } from 'react'
import { SettingsModal } from './SettingsModal'
import { AgentManagerModal } from './AgentManagerModal'
import { useConfirm } from './ConfirmProvider'

interface SidebarProps {
  config: AppConfig
}

export function Sidebar({ config }: SidebarProps) {
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'all'
  const currentId = searchParams.get('id')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false)
  const { confirm, prompt } = useConfirm()

  const handleAddProject = async () => {
    const path = await prompt({
      title: 'Add Project',
      message: 'Enter absolute project path:',
      placeholder: '/Users/username/my-project',
    })

    if (path) {
      await actionAddProject(path)
    }
  }

  const handleRemoveProject = async (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (
      await confirm({
        title: 'Remove Project',
        message: `Remove project "${path}" from Skills Hub?`,
        type: 'danger',
        confirmText: 'Remove',
      })
    ) {
      await actionRemoveProject(path)
    }
  }

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.title}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="28" height="28">
            <path
              d="M100 20 L170 60 L100 100 L30 60 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinejoin="round"
            />
            <path
              d="M30 60 L100 100 L100 180 L30 140 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinejoin="round"
            />
            <path
              d="M100 100 L170 60 L170 140 L100 180 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinejoin="round"
            />
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M55 118 L47 125 L55 132" />
              <path d="M60 135 L72 115" />
              <path d="M77 118 L85 125 L77 132" />
            </g>
          </svg>
          Skills Hub
        </div>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>General</div>
          <Link
            href="/?view=introduction"
            className={clsx(styles.navItem, currentView === 'introduction' && styles.active)}
          >
            <BookOpen size={16} className="shrink-0" />
            <span>Introduction</span>
          </Link>
          <Link
            href="/"
            className={clsx(
              styles.navItem,
              (currentView === 'all' || !currentView) && !currentId && styles.active
            )}
          >
            <Home size={16} className="shrink-0" />
            <span>All Skills</span>
          </Link>
          <Link
            href="/?view=hub"
            className={clsx(styles.navItem, currentView === 'hub' && styles.active)}
          >
            <Layers size={16} className="shrink-0" />
            <span>Central Hub</span>
          </Link>
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Agents</span>
            <div className={styles.actionsContainer}>
              <button
                onClick={() => setIsAgentManagerOpen(true)}
                className={styles.actionBtn}
                title="Manage Agents"
              >
                <Settings size={12} />
              </button>
            </div>
          </div>
          {config.agents
            .filter((a) => a.enabled)
            .map((agent) => (
              <Link
                key={agent.name}
                href={`/?view=agent&id=${encodeURIComponent(agent.name)}`}
                className={clsx(
                  styles.navItem,
                  currentView === 'agent' && currentId === agent.name && styles.active
                )}
              >
                <span className="truncate">{agent.name}</span>
              </Link>
            ))}
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>PROJECTS</span>
            <div className={styles.actionsContainer}>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className={styles.actionBtn}
                title="Auto-scan Settings"
              >
                <Settings size={12} />
              </button>
              <button onClick={handleAddProject} className={styles.actionBtn} title="Add manually">
                <Plus size={12} />
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {config.projects.map((proj, idx) => {
              const name = proj.split('/').pop() || proj
              return (
                <Link
                  key={idx}
                  href={`/?view=project&id=${encodeURIComponent(proj)}`}
                  className={clsx(
                    styles.navItem,
                    styles.projectItem,
                    currentView === 'project' && currentId === proj && styles.active
                  )}
                >
                  <div className={styles.projectLabel} title={proj}>
                    <Folder size={16} className="shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={(e) => handleRemoveProject(e, proj)}
                  >
                    <Trash2 size={12} />
                  </button>
                </Link>
              )
            })}
            {config.projects.length === 0 && (
              <div className="text-xs text-muted-foreground italic px-3 py-2">
                No projects added
              </div>
            )}
          </div>
        </nav>
      </aside>

      <SettingsModal
        config={config}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <AgentManagerModal
        config={config}
        isOpen={isAgentManagerOpen}
        onClose={() => setIsAgentManagerOpen(false)}
      />
    </>
  )
}
