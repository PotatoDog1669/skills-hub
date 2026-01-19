'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Home, Folder, Layers, Plus, Trash2, Settings } from 'lucide-react';
import styles from './Sidebar.module.css';
import { AppConfig } from '@/lib/config';
import clsx from 'clsx';
import { actionAddProject, actionRemoveProject } from '@/app/actions';
import { useState } from 'react';
import { SettingsModal } from './SettingsModal';
import { AgentManagerModal } from './AgentManagerModal';
import { useConfirm } from './ConfirmProvider';

interface SidebarProps {
    config: AppConfig;
}

export function Sidebar({ config }: SidebarProps) {
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'all';
    const currentId = searchParams.get('id');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAgentManagerOpen, setIsAgentManagerOpen] = useState(false);
    const { confirm, prompt } = useConfirm();

    const handleAddProject = async () => {
        const path = await prompt({
            title: 'Add Project',
            message: 'Enter absolute project path:',
            placeholder: '/Users/username/my-project'
        });

        if (path) {
            await actionAddProject(path);
        }
    };

    const handleRemoveProject = async (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (await confirm({
            title: 'Remove Project',
            message: `Remove project "${path}" from Skills Hub?`,
            type: 'danger',
            confirmText: 'Remove'
        })) {
            await actionRemoveProject(path);
        }
    };

    return (
        <>
            <aside className={styles.sidebar}>
                <div className={styles.title}>
                    <Box size={24} />
                    Skills Hub
                </div>

                <nav className={styles.section}>
                    <div className={styles.sectionTitle}>General</div>
                    <Link
                        href="/"
                        className={clsx(styles.navItem, currentView === 'all' && !currentId && styles.active)}
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
                            <button onClick={() => setIsAgentManagerOpen(true)} className={styles.actionBtn} title="Manage Agents">
                                <Settings size={12} />
                            </button>
                        </div>
                    </div>
                    {config.agents.filter(a => a.enabled).map(agent => (
                        <Link
                            key={agent.name}
                            href={`/?view=agent&id=${encodeURIComponent(agent.name)}`}
                            className={clsx(styles.navItem, currentView === 'agent' && currentId === agent.name && styles.active)}
                        >
                            <span className="truncate">{agent.name}</span>
                        </Link>
                    ))}
                </nav>

                <nav className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <span>PROJECTS</span>
                        <div className={styles.actionsContainer}>
                            <button onClick={() => setIsSettingsOpen(true)} className={styles.actionBtn} title="Auto-scan Settings">
                                <Settings size={12} />
                            </button>
                            <button onClick={handleAddProject} className={styles.actionBtn} title="Add manually">
                                <Plus size={12} />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        {config.projects.map((proj, idx) => {
                            const name = proj.split('/').pop() || proj;
                            return (
                                <Link
                                    key={idx}
                                    href={`/?view=project&id=${encodeURIComponent(proj)}`}
                                    className={clsx(styles.navItem, styles.projectItem, currentView === 'project' && currentId === proj && styles.active)}
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
                            );
                        })}
                        {config.projects.length === 0 && (
                            <div className="text-xs text-muted-foreground italic px-3 py-2">No projects added</div>
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
    );
}
