'use client';

import { Skill } from '@/lib/skills-types';
import { AppConfig } from '@/lib/config';
import styles from './SyncModal.module.css';
import { useState } from 'react';
import { actionSyncSkill } from '@/app/actions';
import { X, Share2, Folder, Monitor } from 'lucide-react';

interface SyncModalProps {
    skill: Skill;
    config: AppConfig;
    isOpen: boolean;
    onClose: () => void;
}

interface Target {
    id: string;
    type: 'agent' | 'project';
    name: string;
    path: string; // Destination PARENT path
}

export function SyncModal({ skill, config, isOpen, onClose }: SyncModalProps) {
    const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    if (!isOpen) return null;

    const targets: Target[] = [];

    const activeAgents = config.agents.filter(a => a.enabled);

    // Agents (Global)
    for (const agent of activeAgents) {
        targets.push({
            id: `agent-${agent.name}`,
            type: 'agent',
            name: `${agent.name} (Global)`,
            path: agent.globalPath,
        });
    }

    // Projects
    for (const projectPath of config.projects) {
        const projName = projectPath.split('/').pop();

        for (const agent of activeAgents) {
            targets.push({
                id: `proj-${projName}-${agent.name}`,
                type: 'project',
                name: `${projName} (${agent.name})`,
                path: selectedJoin(projectPath, agent.projectPath),
            });
        }
    }

    function selectedJoin(p1: string, p2: string) {
        if (p1.endsWith('/')) return p1 + p2;
        return p1 + '/' + p2;
    }

    const toggleTarget = (id: string) => {
        setSelectedTargets(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            const targetsToSync = targets.filter(t => selectedTargets.includes(t.id));

            for (const target of targetsToSync) {
                await actionSyncSkill(skill.path, target.path);
            }

            onClose();
        } catch (e) {
            alert('Sync failed: ' + e);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.windowHeader}>
                    <div className={styles.title}>
                        <Share2 size={16} />
                        Sync: {skill.name}
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={18} /></button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    <div className={styles.section}>
                        <div className={styles.label}>Select Targets</div>
                        <div className={styles.list}>
                            {targets.map(target => (
                                <div
                                    key={target.id}
                                    className={styles.option}
                                    onClick={() => toggleTarget(target.id)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedTargets.includes(target.id)}
                                        onChange={() => { }}
                                    />
                                    {target.type === 'agent' ? <Monitor size={14} className="text-blue-500" /> : <Folder size={14} className="text-yellow-500" />}
                                    <span className="font-mono text-sm">{target.name}</span>
                                </div>
                            ))}
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
    );
}
