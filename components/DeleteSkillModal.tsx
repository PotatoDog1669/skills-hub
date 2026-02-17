'use client';

import { Skill } from '@/lib/skills-types';
import styles from './SyncModal.module.css';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Layers, Monitor, Folder } from 'lucide-react';
import clsx from 'clsx';

interface DeleteSkillModalProps {
    skillName: string;
    targets: Skill[];
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedPaths: string[]) => Promise<void>;
}

export function DeleteSkillModal({ skillName, targets, isOpen, onClose, onConfirm }: DeleteSkillModalProps) {
    const [selectedPaths, setSelectedPaths] = useState<string[]>(targets.map(t => t.path));
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSelectedPaths(targets.map(t => t.path));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const togglePath = (path: string) => {
        setSelectedPaths(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    const handleDelete = async () => {
        if (selectedPaths.length === 0) return;

        try {
            setIsDeleting(true);
            await onConfirm(selectedPaths);
            onClose();
        } catch (e) {
            alert('Delete failed: ' + e);
        } finally {
            setIsDeleting(false);
        }
    };

    // Use Portal to render outside of the card's stacking context
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.windowHeader}>
                    <div className={clsx(styles.title, "text-red-600")}>
                        <Trash2 size={16} />
                        Delete Skill: {skillName}
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={18} /></button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    <p className="text-sm text-gray-600">
                        Select the instances you want to delete. This action cannot be undone.
                    </p>

                    <div className={styles.section}>
                        <div className={styles.label}>Targets to Delete</div>
                        <div className={styles.list}>
                            {targets.map(target => (
                                <div
                                    key={target.path}
                                    className={styles.option}
                                    onClick={() => togglePath(target.path)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedPaths.includes(target.path)}
                                        onChange={() => { }}
                                        className="accent-red-500"
                                    />

                                    {/* Icon based on location */}
                                    {target.location === 'hub' && <Layers size={14} className="text-purple-500" />}
                                    {target.location === 'agent' && <Monitor size={14} className="text-[#d97757]" />}
                                    {target.location === 'project' && <Folder size={14} className="text-yellow-500" />}

                                    <div className="flex flex-col min-w-0">
                                        <span className="font-medium text-sm flex items-center gap-1">
                                            {target.location === 'hub' ? 'Central Hub' :
                                                target.location === 'agent' ? `${target.agentName} (Global)` :
                                                    `${target.agentName} (Project: ${target.projectName})`
                                            }
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={styles.actions}>
                    <button className={styles.btn} onClick={onClose} disabled={isDeleting}>
                        Cancel
                    </button>
                    <button
                        className={clsx(styles.btn, styles.btnDestructive, "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300")}
                        onClick={handleDelete}
                        disabled={isDeleting || selectedPaths.length === 0}
                    >
                        {isDeleting ? 'Deleting...' : `Delete (${selectedPaths.length})`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
