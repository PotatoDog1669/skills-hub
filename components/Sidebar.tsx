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
  actionRemoveProject,
} from '@/apps/desktop-ui/src/tauri-actions'
import { useId, useState } from 'react'
import { SettingsModal } from './SettingsModal'
import { AgentManagerModal } from './AgentManagerModal'
import { useConfirm } from '@/components/ConfirmProvider'

interface SidebarProps {
  config: AppConfig
}

type AgentBrandApp = 'claude' | 'codex' | 'gemini' | 'cursor' | 'antigravity'

const SIDEBAR_CLAUDE_ICON_PATH =
  'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'

const SIDEBAR_CODEX_ICON_PATH =
  'M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z'

const SIDEBAR_GEMINI_ICON_PATH =
  'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z'

const SIDEBAR_CURSOR_ICON_PATH =
  'M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z'

function inferAgentBrandApp(agentName: string): AgentBrandApp | null {
  const normalized = agentName.toLowerCase()
  if (normalized.includes('antigravity')) return 'antigravity'
  if (normalized.includes('claude')) return 'claude'
  if (normalized.includes('codex') || normalized.includes('openai')) return 'codex'
  if (normalized.includes('gemini')) return 'gemini'
  if (normalized.includes('cursor')) return 'cursor'
  return null
}

function AgentBrandIcon({
  app,
  className = 'shrink-0',
}: {
  app: AgentBrandApp
  className?: string
}) {
  const id = useId().replace(/:/g, '')

  if (app === 'antigravity') {
    return <img src="/antigravity.png" alt="" width={16} height={16} className={className} aria-hidden="true" />
  }

  if (app === 'claude') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d={SIDEBAR_CLAUDE_ICON_PATH} fill="#D97757" />
      </svg>
    )
  }

  if (app === 'codex') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d={SIDEBAR_CODEX_ICON_PATH} fillRule="evenodd" fill="#111827" />
      </svg>
    )
  }

  if (app === 'cursor') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d={SIDEBAR_CURSOR_ICON_PATH} fillRule="evenodd" fill="currentColor" />
      </svg>
    )
  }

  const fill0 = `sidebar-gemini-fill-0-${id}`
  const fill1 = `sidebar-gemini-fill-1-${id}`
  const fill2 = `sidebar-gemini-fill-2-${id}`

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={fill0} gradientUnits="userSpaceOnUse" x1="7" y1="15.5" x2="11" y2="12">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={fill1} gradientUnits="userSpaceOnUse" x1="8" y1="5.5" x2="11.5" y2="11">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={fill2} gradientUnits="userSpaceOnUse" x1="3.5" y1="13.5" x2="17.5" y2="12">
          <stop stopColor="#FABC12" />
          <stop offset="0.46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={SIDEBAR_GEMINI_ICON_PATH} fill="#3186FF" />
      <path d={SIDEBAR_GEMINI_ICON_PATH} fill={`url(#${fill0})`} />
      <path d={SIDEBAR_GEMINI_ICON_PATH} fill={`url(#${fill1})`} />
      <path d={SIDEBAR_GEMINI_ICON_PATH} fill={`url(#${fill2})`} />
    </svg>
  )
}

export function Sidebar({ config }: SidebarProps) {
  const searchParams = useSearchParams()
  const rawView = searchParams.get('view') || 'inventory-skills'
  const currentView = rawView === 'deploy' ? 'inventory-skills' : rawView
  const currentId = searchParams.get('id')
  const enabledAgents = config.agents.filter((a) => a.enabled)
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
          <div className={clsx('space-y-0.5', enabledAgents.length > 3 && styles.agentsScrollable)}>
            {enabledAgents.map((agent) => {
              const brandApp = inferAgentBrandApp(agent.name)
              return (
                <Link
                  key={agent.name}
                  href={`/?view=agent&id=${encodeURIComponent(agent.name)}`}
                  className={clsx(
                    styles.navItem,
                    currentView === 'agent' && currentId === agent.name && styles.active
                  )}
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
