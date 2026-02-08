'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Boxes,
  Folder,
  Layers,
  Plus,
  Trash2,
  Settings,
  BookOpen,
  Rocket,
  Shield,
  Package,
  ScrollText,
  Bot,
} from 'lucide-react'
import styles from './Sidebar.module.css'
import { AppConfig } from '@/lib/config'
import clsx from 'clsx'
import { actionAddProject, actionPickDirectory, actionRemoveProject } from '@/app/actions'
import { useState } from 'react'
import { SettingsModal } from './SettingsModal'
import { AgentManagerModal } from './AgentManagerModal'
import { useConfirm } from '@/components/ConfirmProvider'

interface SidebarProps {
  config: AppConfig
}

export function Sidebar({ config }: SidebarProps) {
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'inventory-skills'
  const currentId = searchParams.get('id')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false)
  const { confirm, prompt } = useConfirm()

  const handleAddProject = async () => {
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

    if (selectedPath) {
      try {
        await actionAddProject(selectedPath)
      } catch (error) {
        alert(error instanceof Error ? error.message : `Failed to add project: ${String(error)}`)
      }
    }
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (
      await confirm({
        title: 'Remove Project',
        message: `Remove project "${projectPath}" from Skills Hub?`,
        type: 'danger',
        confirmText: 'Remove',
      })
    ) {
      await actionRemoveProject(projectPath)
    }
  }

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.title}>
          <Boxes size={20} />
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
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>Inventory</div>
          <Link
            href="/?view=inventory-providers"
            className={clsx(styles.navItem, currentView === 'inventory-providers' && styles.active)}
          >
            <Shield size={16} className="shrink-0" />
            <span>Providers</span>
          </Link>
          <Link
            href="/?view=inventory-skills"
            className={clsx(
              styles.navItem,
              (currentView === 'inventory-skills' || currentView === 'all') && styles.active
            )}
          >
            <Layers size={16} className="shrink-0" />
            <span>Skills</span>
          </Link>
          <Link
            href="/?view=inventory-loadouts"
            className={clsx(styles.navItem, currentView === 'inventory-loadouts' && styles.active)}
          >
            <Package size={16} className="shrink-0" />
            <span>Loadouts</span>
          </Link>
          <Link
            href="/?view=inventory-policies"
            className={clsx(styles.navItem, currentView === 'inventory-policies' && styles.active)}
          >
            <ScrollText size={16} className="shrink-0" />
            <span>Policies</span>
          </Link>
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Projects</span>
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

          <Link
            href="/?view=projects"
            className={clsx(styles.navItem, currentView === 'projects' && styles.active)}
          >
            <Folder size={16} className="shrink-0" />
            <span>All Projects</span>
          </Link>

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
                <Bot size={16} className="shrink-0" />
                <span className="truncate">{agent.name}</span>
              </Link>
            ))}
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>Deploy</div>
          <Link
            href="/?view=deploy"
            className={clsx(styles.navItem, currentView === 'deploy' && styles.active)}
          >
            <Rocket size={16} className="shrink-0" />
            <span>Apply</span>
          </Link>
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
