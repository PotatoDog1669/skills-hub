'use client';

import styles from './SyncModal.module.css'; // Reuse existing modal styles
import { AppConfig, AgentConfig } from '@/lib/config';
import { X, Plus, Terminal, Trash2, Check, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { actionUpdateAgentConfig, actionRemoveAgentConfig } from '@/app/actions';

interface AgentManagerModalProps {
    config: AppConfig;
    isOpen: boolean;
    onClose: () => void;
}

export function AgentManagerModal({ config, isOpen, onClose }: AgentManagerModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

    // Custom Agent Form State
    const [newName, setNewName] = useState('');
    const [newGlobalPath, setNewGlobalPath] = useState('');
    const [newProjectPath, setNewProjectPath] = useState('.agent/skills'); // Default recommendation

    if (!isOpen) return null;

    const handleToggle = async (agent: AgentConfig) => {
        try {
            await actionUpdateAgentConfig({ ...agent, enabled: !agent.enabled });
        } catch (e) {
            alert("Failed to toggle agent: " + e);
        }
    };

    const handleRemoveCustom = async (name: string) => {
        if (confirm(`Remove custom agent "${name}"?`)) {
            try {
                await actionRemoveAgentConfig(name);
            } catch (e) {
                alert("Failed to remove agent: " + e);
            }
        }
    };

    const handleAddCustom = async () => {
        if (!newName || !newGlobalPath || !newProjectPath) return;

        try {
            setIsSubmitting(true);
            const newAgent: AgentConfig = {
                name: newName,
                globalPath: newGlobalPath,
                projectPath: newProjectPath,
                enabled: true,
                isCustom: true
            };
            await actionUpdateAgentConfig(newAgent);
            setShowAddForm(false);
            setNewName('');
            setNewGlobalPath('');
            setNewProjectPath('.agent/skills');
        } catch (e) {
            alert("Failed to add agent: " + e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const builtInAgents = config.agents.filter(a => !a.isCustom);
    const customAgents = config.agents.filter(a => a.isCustom);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.windowHeader}>
                    <div className={styles.title}>
                        <Terminal size={16} />
                        Manage Agents
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={18} /></button>
                </div>

                <div className={styles.content}>
                    {/* Built-in Agents */}
                    <div className={styles.section}>
                        <div className={styles.label}>BUILT-IN AGENTS EXTENSIONS</div>
                        <div className={styles.list}>
                            {builtInAgents.map(agent => (
                                <div key={agent.name} className="border rounded p-3">
                                    <div className="text-sm font-medium mb-2">
                                        {agent.name} <span className="text-muted-foreground font-normal opacity-70">{agent.projectPath}</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={agent.enabled}
                                        onChange={() => handleToggle(agent)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.label}>
                            CUSTOM AGENTS
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded hover:bg-gray-50 text-gray-600"
                            >
                                <Plus size={10} /> Add New
                            </button>
                        </div>

                        {showAddForm && (
                            <div className="bg-gray-50 p-3 rounded mb-3 border border-gray-100 text-sm">
                                <div className="space-y-2">
                                    <input
                                        className="w-full p-1.5 border rounded"
                                        placeholder="Agent Name (e.g. MyBot)"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                    />
                                    <input
                                        className="w-full p-1.5 border rounded"
                                        placeholder="Global Path (~/path/to/skills)"
                                        value={newGlobalPath}
                                        onChange={e => setNewGlobalPath(e.target.value)}
                                    />
                                    <input
                                        className="w-full p-1.5 border rounded"
                                        placeholder="Project Path (.agent/skills)"
                                        value={newProjectPath}
                                        onChange={e => setNewProjectPath(e.target.value)}
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => setShowAddForm(false)} className="px-2 py-1 text-gray-500">Cancel</button>
                                        <button
                                            onClick={handleAddCustom}
                                            className="px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                                            disabled={isSubmitting || !newName}
                                        >
                                            Add Agent
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={styles.list}>
                            {customAgents.map(agent => (
                                <div key={agent.name} className="border rounded p-3">
                                    <div className="text-sm font-medium mb-2">
                                        {agent.name} <span className="text-muted-foreground font-normal opacity-70">{agent.projectPath}</span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            checked={agent.enabled}
                                            onChange={() => handleToggle(agent)}
                                        />
                                        <button
                                            onClick={() => handleRemoveCustom(agent.name)}
                                            className="self-start border rounded p-1.5 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors"
                                            title="Remove Agent"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {customAgents.length === 0 && !showAddForm && (
                                <div className="text-xs text-center text-gray-400 italic py-2">No custom agents added</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
