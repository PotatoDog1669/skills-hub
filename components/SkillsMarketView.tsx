'use client'

import { actionOpenExternal } from '@/apps/desktop-ui/src/tauri-actions'
import { ExternalLink } from 'lucide-react'
import type { MouseEvent } from 'react'

const MARKET_LINKS = [
  {
    name: 'skills.sh',
    url: 'https://skills.sh/',
    description: 'Community skill index. Useful for quickly browsing public skills by topic.',
  },
  {
    name: 'skillsmp.com',
    url: 'https://skillsmp.com/',
    description: 'Skills marketplace with categorized entries and direct links for importing.',
  },
]

export function SkillsMarketView() {
  const isTauriRuntimeClient = (): boolean => {
    if (typeof window === 'undefined') return false
    return Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__)
  }

  const handleExternalOpen = async (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    if (!isTauriRuntimeClient()) return
    event.preventDefault()
    try {
      await actionOpenExternal(url)
    } catch (error) {
      console.error('Failed to open external URL:', error)
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Skills Market</h1>
        <p className="text-sm text-gray-600">
          在这里快速访问常用 Skills 商店，找到技能后复制链接回 Central Hub 导入。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MARKET_LINKS.map((item) => (
          <div key={item.url} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="text-lg font-semibold">{item.name}</div>
            <p className="text-sm text-gray-600">{item.description}</p>
            <div className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs font-mono text-gray-600 break-all">
              {item.url}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => void handleExternalOpen(event, item.url)}
              className="inline-flex items-center gap-2 rounded-md bg-[#d97757] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c05f3e]"
            >
              打开网站
              <ExternalLink size={14} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
