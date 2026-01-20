'use client'

import { useState } from 'react'
import styles from './SyncModal.module.css' // Reusing modal styles
import { X, Download, GitBranch } from 'lucide-react'
import { actionImportSkill } from '@/app/actions'

interface ImportSkillModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ImportSkillModal({ isOpen, onClose }: ImportSkillModalProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  if (!isOpen) return null

  const handleImport = async () => {
    if (!url.trim()) return

    try {
      setIsLoading(true)
      setResult(null)

      const res = await actionImportSkill(url)

      if (res?.success) {
        setResult({ success: true, message: res.message })
        setUrl('')
        // Close after a short delay on success or let user close?
        // Let's keep it open to show success message, or close immediately.
        // Better to show success.
      }
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.windowHeader}>
          <div className={styles.title}>
            <GitBranch size={16} />
            Import Skill from Git
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.label}>Git Repository URL</div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/tree/main/skills/my-skill"
              className="w-full p-2 border rounded bg-white text-sm font-mono mt-2"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Supports GitHub URLs. You can paste a link to a subdirectory to import just that
              folder.
            </p>

            {result && (
              <div
                className={`mt-4 p-3 rounded text-sm ${result.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
              >
                {result.message}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleImport}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? (
              'Importing...'
            ) : (
              <>
                <Download size={14} className="mr-1" /> Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
