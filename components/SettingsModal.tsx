'use client'

import { useState } from 'react'
import { AppConfig } from '@/lib/config'
import { actionAddScanRoot, actionRemoveScanRoot, actionScanAndAddProjects } from '@/app/actions'
import { X, Trash2, Plus, Terminal, CheckCircle2, AlertCircle } from 'lucide-react'
import styles from './SyncModal.module.css'
import { useConfirm } from './ConfirmProvider'

interface SettingsModalProps {
  config: AppConfig
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ config, isOpen, onClose }: SettingsModalProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { confirm, prompt } = useConfirm()

  if (!isOpen) return null

  const handleAddRoot = async () => {
    const path = await prompt({
      title: 'Add Workspace',
      message: 'Enter absolute workspace path:',
      placeholder: '/Users/username/workspace',
      defaultValue: '/Users/liyaocong/workspace',
    })

    if (path) await actionAddScanRoot(path)
  }

  const handleRemoveRoot = async (path: string) => {
    if (
      await confirm({
        title: 'Remove Workspace',
        message: `Stop scanning ${path}?`,
        type: 'danger',
        confirmText: 'Remove',
      })
    ) {
      await actionRemoveScanRoot(path)
    }
  }

  const handleScan = async () => {
    setIsScanning(true)
    setMessage(null)
    try {
      const count = await actionScanAndAddProjects()
      setMessage({ type: 'success', text: `Found ${count} new projects` })
    } catch (e) {
      setMessage({ type: 'error', text: 'Scan failed: ' + e })
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.windowHeader}>
          <div className={styles.title}>
            <Terminal size={16} />
            Settings
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.label}>
              <div>Scan Workspaces</div>
              <button onClick={handleAddRoot} className={styles.iconBtn} title="Add workspace">
                <Plus size={16} />
              </button>
            </div>

            <div className={styles.list}>
              {config.scanRoots?.map((root, idx) => (
                <div
                  key={idx}
                  className="w-full py-2 px-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors gap-3"
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    className="text-sm font-mono pr-2"
                    title={root}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {root}
                  </div>
                  <button
                    onClick={() => handleRemoveRoot(root)}
                    className={`${styles.itemBtn} shrink-0`}
                    title="Remove workspace"
                    style={{ flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {(!config.scanRoots || config.scanRoots.length === 0) && (
                <div className="text-sm text-muted-foreground italic p-2 text-center">
                  No workspaces configured
                </div>
              )}
            </div>
          </div>

          {/* Status Message */}
          {message && (
            <div
              className={`text-sm p-3 rounded flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 size={16} style={{ transform: 'translateY(1.5px)' }} />
              ) : (
                <AlertCircle size={16} style={{ transform: 'translateY(1.5px)' }} />
              )}
              {message.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleScan}
            disabled={isScanning}
          >
            <div className="flex items-center gap-2">
              <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
