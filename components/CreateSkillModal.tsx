'use client'

import { useState, useEffect } from 'react'
import styles from './SyncModal.module.css' // Reuse styles
import { X, Plus, Save } from 'lucide-react'
import { actionCreateSkill } from '@/app/actions'

interface CreateSkillModalProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_TEMPLATE = `
## Description
<!-- Detailed description of what this skill does -->

## Requirements
<!-- List required tools or environment variables -->

## Usage
<!-- Example usage instructions -->
`.trim()

export function CreateSkillModal({ isOpen, onClose }: CreateSkillModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState(DEFAULT_TEMPLATE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setName('')
      setDescription('')
      setContent(DEFAULT_TEMPLATE)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const res = await actionCreateSkill({
        name,
        description,
        content,
      })

      if (res?.success) {
        // Success! Close and reset
        onClose()
        setName('')
        setDescription('')
        setContent(DEFAULT_TEMPLATE)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '800px', maxWidth: '95vw' }}
      >
        {/* Header */}
        <div className={styles.windowHeader}>
          <div className={styles.title}>
            <Plus size={16} />
            Create New Skill
          </div>
          <button onClick={onClose} className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Basic Info Row */}
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Skill Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-awesome-skill"
                className="p-2 border rounded bg-white text-sm font-mono w-full"
                disabled={isLoading}
              />
            </div>
            <div className="flex-[2] flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary for the card..."
                className="p-2 border rounded bg-white text-sm w-full"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex flex-col gap-2 flex-grow min-h-[300px]">
            <label className="text-xs font-semibold text-gray-500 uppercase">
              SKILL.md Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-grow p-3 border rounded bg-slate-50 font-mono text-sm leading-relaxed resize-none focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
              placeholder="# My Skill..."
              disabled={isLoading}
              spellCheck={false}
            />
            <p className="text-xs text-gray-400">
              Frontmatter (name, description) will be automatically added if missing.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded text-sm bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? (
              'Creating...'
            ) : (
              <>
                <Save size={14} className="mr-1" /> Create Skill
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
