'use client'

import Link from '@/apps/desktop-ui/src/shims/link'
import { useSearchParams } from '@/apps/desktop-ui/src/shims/navigation'
import {
  Folder,
  Layers,
  Plus,
  Trash2,
  Settings,
  BookOpen,
  Store,
  Shield,
  Package,
  Bot,
  Warehouse,
} from 'lucide-react'
import styles from './Sidebar.module.css'
import { AppConfig } from '@/lib/config'
import clsx from 'clsx'
import {
  actionAddProject,
  actionPickDirectory,
  actionReorderAgents,
  actionReorderProjects,
  actionRemoveProject,
} from '@/apps/desktop-ui/src/tauri-actions'
import { useState } from 'react'
import { SettingsModal } from './SettingsModal'
import { AgentManagerModal } from './AgentManagerModal'
import { useConfirm } from '@/components/ConfirmProvider'
import { AgentBrandIcon, inferAgentBrand } from './AgentBrandIcon'

interface SidebarProps {
  config: AppConfig
}

function moveItemBefore<T>(items: T[], sourceItem: T, targetItem: T): T[] {
  const sourceIndex = items.indexOf(sourceItem)
  const targetIndex = items.indexOf(targetItem)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items
  }

  const nextItems = [...items]
  const [movedItem] = nextItems.splice(sourceIndex, 1)
  nextItems.splice(targetIndex, 0, movedItem)
  return nextItems
}

export function Sidebar({ config }: SidebarProps) {
  const searchParams = useSearchParams()
  const rawView = searchParams.get('view') || 'inventory-skills'
  const currentView = rawView === 'deploy' ? 'inventory-skills' : rawView
  const currentId = searchParams.get('id')
  const enabledAgents = config.agents.filter((a) => a.enabled)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false)
  const [draggingProjectPath, setDraggingProjectPath] = useState<string | null>(null)
  const [projectDropTargetPath, setProjectDropTargetPath] = useState<string | null>(null)
  const [draggingAgentName, setDraggingAgentName] = useState<string | null>(null)
  const [agentDropTargetName, setAgentDropTargetName] = useState<string | null>(null)
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

  const clearProjectDragState = () => {
    setDraggingProjectPath(null)
    setProjectDropTargetPath(null)
  }

  const handleProjectDragStart = (
    event: React.DragEvent<HTMLAnchorElement>,
    projectPath: string
  ) => {
    setDraggingProjectPath(projectPath)
    setProjectDropTargetPath(projectPath)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', projectPath)
    }
  }

  const handleProjectDragOver = (
    event: React.DragEvent<HTMLAnchorElement>,
    projectPath: string
  ) => {
    event.preventDefault()
    if (!draggingProjectPath || draggingProjectPath === projectPath) {
      return
    }
    setProjectDropTargetPath(projectPath)
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleProjectDrop = async (
    event: React.DragEvent<HTMLAnchorElement>,
    projectPath: string
  ) => {
    event.preventDefault()
    const sourcePath = draggingProjectPath || event.dataTransfer?.getData('text/plain') || ''
    const nextProjects = moveItemBefore(config.projects, sourcePath, projectPath)
    clearProjectDragState()
    if (nextProjects === config.projects) {
      return
    }

    try {
      await actionReorderProjects(nextProjects)
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to reorder projects: ${String(error)}`)
    }
  }

  const clearAgentDragState = () => {
    setDraggingAgentName(null)
    setAgentDropTargetName(null)
  }

  const handleAgentDragStart = (event: React.DragEvent<HTMLAnchorElement>, agentName: string) => {
    setDraggingAgentName(agentName)
    setAgentDropTargetName(agentName)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', agentName)
    }
  }

  const handleAgentDragOver = (event: React.DragEvent<HTMLAnchorElement>, agentName: string) => {
    event.preventDefault()
    if (!draggingAgentName || draggingAgentName === agentName) {
      return
    }
    setAgentDropTargetName(agentName)
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleAgentDrop = async (event: React.DragEvent<HTMLAnchorElement>, agentName: string) => {
    event.preventDefault()
    const sourceName = draggingAgentName || event.dataTransfer?.getData('text/plain') || ''
    const enabledAgentNames = enabledAgents.map((agent) => agent.name)
    const nextAgentNames = moveItemBefore(enabledAgentNames, sourceName, agentName)
    clearAgentDragState()
    if (nextAgentNames === enabledAgentNames) {
      return
    }

    try {
      await actionReorderAgents(nextAgentNames)
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to reorder agents: ${String(error)}`)
    }
  }

  return (
    <>
      <aside className={styles.sidebar}>
        <nav className={styles.section}>
          <div className={styles.sectionTitle}>Inventory</div>
          <Link
            href="/?view=hub"
            className={clsx(styles.navItem, currentView === 'hub' && styles.active)}
          >
            <Warehouse size={16} className="shrink-0" />
            <span>Central Hub</span>
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
            href="/?view=inventory-kit"
            className={clsx(styles.navItem, currentView === 'inventory-kit' && styles.active)}
          >
            <Package size={16} className="shrink-0" />
            <span>Kit</span>
          </Link>
          <Link
            href="/?view=inventory-providers"
            className={clsx(styles.navItem, currentView === 'inventory-providers' && styles.active)}
          >
            <Shield size={16} className="shrink-0" />
            <span>Providers</span>
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

          <div
            className={clsx('space-y-0.5', config.projects.length > 4 && styles.projectsScrollable)}
          >
            {config.projects.map((proj) => {
              const name = proj.split('/').pop() || proj
              const isProjectDropTarget =
                projectDropTargetPath === proj &&
                draggingProjectPath &&
                draggingProjectPath !== proj
              return (
                <Link
                  key={proj}
                  href={`/?view=project&id=${encodeURIComponent(proj)}`}
                  className={clsx(
                    styles.navItem,
                    styles.projectItem,
                    styles.draggableItem,
                    draggingProjectPath === proj && styles.dragging,
                    isProjectDropTarget && styles.dropTarget,
                    currentView === 'project' && currentId === proj && styles.active
                  )}
                  draggable
                  onDragStart={(event) => handleProjectDragStart(event, proj)}
                  onDragOver={(event) => handleProjectDragOver(event, proj)}
                  onDrop={(event) => handleProjectDrop(event, proj)}
                  onDragEnd={clearProjectDragState}
                  data-testid={`sidebar-project-${encodeURIComponent(proj)}`}
                >
                  <div className={styles.projectLabel} title={proj}>
                    <Folder size={16} className="shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={(e) => handleRemoveProject(e, proj)}
                    draggable={false}
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
          <div className={clsx('space-y-0.5', enabledAgents.length > 3 && styles.agentsScrollable)}>
            {enabledAgents.map((agent) => {
              const brandApp = inferAgentBrand(agent.name)
              const isAgentDropTarget =
                agentDropTargetName === agent.name &&
                draggingAgentName &&
                draggingAgentName !== agent.name
              return (
                <Link
                  key={agent.name}
                  href={`/?view=agent&id=${encodeURIComponent(agent.name)}`}
                  className={clsx(
                    styles.navItem,
                    styles.draggableItem,
                    draggingAgentName === agent.name && styles.dragging,
                    isAgentDropTarget && styles.dropTarget,
                    currentView === 'agent' && currentId === agent.name && styles.active
                  )}
                  draggable
                  onDragStart={(event) => handleAgentDragStart(event, agent.name)}
                  onDragOver={(event) => handleAgentDragOver(event, agent.name)}
                  onDrop={(event) => handleAgentDrop(event, agent.name)}
                  onDragEnd={clearAgentDragState}
                  data-testid={`sidebar-agent-${encodeURIComponent(agent.name)}`}
                >
                  {brandApp ? (
                    <AgentBrandIcon app={brandApp} className="h-4 w-4 shrink-0" />
                  ) : (
                    <Bot size={16} className="shrink-0" />
                  )}
                  <span className="truncate">{agent.name}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <nav className={styles.section}>
          <div className={styles.sectionTitle}>Help</div>
          <Link
            href="/?view=introduction"
            className={clsx(styles.navItem, currentView === 'introduction' && styles.active)}
          >
            <BookOpen size={16} className="shrink-0" />
            <span>Introduction</span>
          </Link>
          <Link
            href="/?view=skills-market"
            className={clsx(styles.navItem, currentView === 'skills-market' && styles.active)}
          >
            <Store size={16} className="shrink-0" />
            <span>Skills Market</span>
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
