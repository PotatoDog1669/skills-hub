'use client';

import React, { createContext, useContext, useState, ReactNode, useRef, useEffect } from 'react';
import styles from './SyncModal.module.css'; // Reuse modal styles
import { AlertTriangle, HelpCircle, Terminal } from 'lucide-react';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

interface PromptOptions {
    title?: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    // State for Confirm Dialog
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
        resolve: ((value: boolean) => void) | null;
    }>({ isOpen: false, options: { message: '' }, resolve: null });

    // State for Prompt Dialog
    const [promptState, setPromptState] = useState<{
        isOpen: boolean;
        options: PromptOptions;
        value: string;
        resolve: ((value: string | null) => void) | null;
    }>({ isOpen: false, options: {}, value: '', resolve: null });

    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when prompt opens
    useEffect(() => {
        if (promptState.isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [promptState.isOpen]);

    const confirm = (opts: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({ isOpen: true, options: opts, resolve });
        });
    };

    const prompt = (opts: PromptOptions) => {
        return new Promise<string | null>((resolve) => {
            setPromptState({
                isOpen: true,
                options: opts,
                value: opts.defaultValue || '',
                resolve
            });
        });
    };

    const handleConfirmClose = (result: boolean) => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        confirmState.resolve?.(result);
    };

    const handlePromptClose = (result: string | null) => {
        setPromptState(prev => ({ ...prev, isOpen: false }));
        promptState.resolve?.(result);
    };

    return (
        <ConfirmContext.Provider value={{ confirm, prompt }}>
            {children}

            {/* Confirm Modal */}
            {confirmState.isOpen && (
                <div className={styles.overlay} onClick={() => handleConfirmClose(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
                        <div className={styles.windowHeader}>
                            <div className={styles.title}>
                                {confirmState.options.type === 'danger' ? <AlertTriangle size={16} className="text-red-500" /> : <HelpCircle size={16} />}
                                {confirmState.options.title || 'Confirm'}
                            </div>
                        </div>
                        <div className={styles.content}>
                            <p className="text-sm font-mono whitespace-pre-wrap">{confirmState.options.message}</p>
                        </div>
                        <div className={styles.actions}>
                            <button className={styles.btn} onClick={() => handleConfirmClose(false)}>
                                {confirmState.options.cancelText || 'Cancel'}
                            </button>
                            <button
                                className={`${styles.btn} ${confirmState.options.type === 'danger' ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : styles.btnPrimary}`}
                                onClick={() => handleConfirmClose(true)}
                            >
                                {confirmState.options.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Prompt Modal */}
            {promptState.isOpen && (
                <div className={styles.overlay} onClick={() => handlePromptClose(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ width: '450px' }}>
                        <div className={styles.windowHeader}>
                            <div className={styles.title}>
                                <Terminal size={16} />
                                {promptState.options.title || 'Input'}
                            </div>
                        </div>
                        <div className={styles.content}>
                            {promptState.options.message && (
                                <p className="text-sm text-muted-foreground font-mono mb-2">{promptState.options.message}</p>
                            )}
                            <input
                                ref={inputRef}
                                type="text"
                                className="w-full bg-background border border-border rounded p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder={promptState.options.placeholder}
                                value={promptState.value}
                                onChange={e => setPromptState(prev => ({ ...prev, value: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handlePromptClose(promptState.value);
                                    if (e.key === 'Escape') handlePromptClose(null);
                                }}
                            />
                        </div>
                        <div className={styles.actions}>
                            <button className={styles.btn} onClick={() => handlePromptClose(null)}>
                                {promptState.options.cancelText || 'Cancel'}
                            </button>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                onClick={() => handlePromptClose(promptState.value)}
                            >
                                {promptState.options.confirmText || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context;
}
