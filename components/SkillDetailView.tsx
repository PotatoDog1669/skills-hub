'use client'

import {
  actionGetSkillContent,
  actionOpenExternal,
} from '@/apps/desktop-ui/src/tauri-actions'
import { useState, useEffect, type MouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArrowLeft, Clock3, ExternalLink, Folder, Github } from 'lucide-react'
import Link from '@/apps/desktop-ui/src/shims/link'
import { useSearchParams } from '@/apps/desktop-ui/src/shims/navigation'

interface SkillDetailViewProps {
  path: string
}

interface SkillData {
  content: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>
}

const HIDDEN_METADATA_KEYS = new Set([
  'license',
  'source_repo',
  'source_url',
  'source_branch',
  'source_subdir',
  'source_last_updated',
  'imported_at',
])

function metadataToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeUrl(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('github.com/')) return `https://${raw}`
  return raw
}

function formatDateLabel(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toLocaleString()
}

function buildRepoLabel(repoUrl: string): string {
  if (!repoUrl) return ''
  try {
    const parsed = new URL(repoUrl)
    return parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '')
  } catch {
    return repoUrl
  }
}

function isTauriRuntimeClient(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__)
}

export function SkillDetailView({ path }: SkillDetailViewProps) {
  const [skillData, setSkillData] = useState<SkillData | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

  useEffect(() => {
    let mounted = true
    async function fetchContent() {
      try {
        const result = await actionGetSkillContent(path)
        if (mounted) {
          setSkillData(result)
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchContent()
    return () => {
      mounted = false
    }
  }, [path])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!skillData) {
    return (
      <div className="p-8 text-center bg-red-50 border border-red-100 rounded-lg text-red-600 container max-w-4xl mt-8">
        <h3 className="font-semibold mb-2">Error Loading Skill</h3>
        <p>
          Failed to load skill content from: <code className="bg-red-100 px-1 rounded">{path}</code>
        </p>
        <div className="mt-4">
          <Link href="/" className="text-sm underline hover:no-underline">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const { metadata, content } = skillData

  // Use metadata description if available, otherwise fallback
  const rawDescription = metadataToText(metadata['description'])
  const description =
    rawDescription && !/^[>|]-?$/.test(rawDescription)
      ? rawDescription
      : 'Activates when the user needs this skill.'
  const descriptionLines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const name = path.split('/').pop() || 'Unknown Skill'
  const sourceRepo = normalizeUrl(metadataToText(metadata['source_repo']))
  const sourceUrl = normalizeUrl(metadataToText(metadata['source_url']))
  const sourceSubdir = metadataToText(metadata['source_subdir'])
  const sourceLastUpdated = metadataToText(metadata['source_last_updated'])
  const importedAt = metadataToText(metadata['imported_at'])
  const sourceLink = sourceUrl || sourceRepo
  const sourceRepoLabel = buildRepoLabel(sourceRepo)
  const hasSourceInfo = Boolean(sourceRepo || sourceUrl || sourceSubdir || sourceLastUpdated || importedAt)
  const pinnedMetadataKeys = ['name', 'description'] as const
  const pinnedMetadataEntries = pinnedMetadataKeys
    .map((key) => [key, metadataToText(metadata[key])] as [string, string])
    .filter(([, value]) => value && !/^[>|]-?$/.test(value))
  const pinnedMetadataKeySet = new Set<string>(pinnedMetadataEntries.map(([key]) => key))

  const visibleMetadataEntries = [
    ...pinnedMetadataEntries,
    ...Object.entries(metadata)
      .filter(([key]) => !HIDDEN_METADATA_KEYS.has(key) && !pinnedMetadataKeySet.has(key))
      .map(([key, value]) => [key, metadataToText(value)] as [string, string])
      .filter(([, value]) => Boolean(value)),
  ]

  const returnView = searchParams.get('returnView') || 'all'
  const returnId = searchParams.get('returnId')

  // Construct back link
  const backLink =
    returnView === 'all' ? '/' : `/?view=${returnView}${returnId ? `&id=${returnId}` : ''}`

  const breadcrumbPillClass =
    'flex items-center gap-2 text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full border border-border/50 shadow-sm'

  const handleExternalOpen = async (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    if (!isTauriRuntimeClient()) {
      return
    }

    event.preventDefault()
    try {
      await actionOpenExternal(url)
    } catch (error) {
      console.error('Failed to open external URL:', error)
    }
  }

  return (
    <div className="container max-w-[1400px] py-8 space-y-8 font-mono">
      <div className="grid grid-cols-1 gap-12">
        {/* Main Content */}
        <div className="space-y-8 min-w-0">
          {/* Header Section */}
          <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-3 text-sm">
              <div className={breadcrumbPillClass}>
                <span className="text-green-600 font-bold">$</span>
                <span>pwd:</span>
                <span className="text-blue-500">~</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground font-medium">
                  {path.split('/').slice(-2).join(' / ')}
                </span>
              </div>
              <Link
                href={backLink}
                className={`${breadcrumbPillClass} hover:text-foreground transition-colors`}
              >
                <ArrowLeft size={14} />
                <span>cd ..</span>
              </Link>
            </div>

            <div
              className={
                hasSourceInfo
                  ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-5 lg:items-start'
                  : 'grid grid-cols-1 gap-5 lg:items-start'
              }
            >
              <div className="space-y-4 min-w-0">
                {/* Title */}
                <h1 className="text-5xl font-bold tracking-tight text-[#d97757]">{name}</h1>

                {/* Description */}
                <div
                  className={
                    hasSourceInfo
                      ? 'text-lg leading-relaxed max-w-3xl text-[#6c6c6c]'
                      : 'text-lg leading-relaxed text-[#6c6c6c]'
                  }
                >
                  {descriptionLines.map((line, index) => (
                    <div key={`${line}-${index}`}>
                      <span className="text-[#40a02b]">{'//'}</span> {line}
                    </div>
                  ))}
                </div>
              </div>

              {hasSourceInfo && (
                <div className="w-full lg:max-w-sm lg:justify-self-end rounded-xl border border-[#dbe2ea] bg-white/90 p-4 shadow-sm font-sans">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Github size={15} />
                      <span>GitHub Source</span>
                    </div>
                    {sourceLink && (
                      <a
                        href={sourceLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => handleExternalOpen(event, sourceLink)}
                        className="inline-flex items-center gap-1 text-xs text-[#d97757] hover:underline"
                      >
                        Open <ExternalLink size={12} />
                      </a>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    {sourceRepo && (
                      <div className="flex items-start gap-2">
                        <Github size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        {sourceLink ? (
                          <a
                            href={sourceLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => handleExternalOpen(event, sourceLink)}
                            className="font-mono break-all text-slate-700 hover:text-[#d97757] hover:underline"
                          >
                            {sourceRepoLabel || sourceRepo}
                          </a>
                        ) : (
                          <span className="font-mono break-all text-slate-700">
                            {sourceRepoLabel || sourceRepo}
                          </span>
                        )}
                      </div>
                    )}
                    {sourceSubdir && sourceSubdir !== '/' && (
                      <div className="flex items-start gap-2">
                        <Folder size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        <span className="font-mono break-all">{sourceSubdir}</span>
                      </div>
                    )}
                    {sourceLastUpdated && (
                      <div className="flex items-start gap-2">
                        <Clock3 size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        <span>Updated {formatDateLabel(sourceLastUpdated)}</span>
                      </div>
                    )}
                    {importedAt && (
                      <div className="flex items-start gap-2">
                        <Clock3 size={13} className="mt-0.5 text-slate-400 shrink-0" />
                        <span>Imported {formatDateLabel(importedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content Section */}
          <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
            {/* Windows Traffic Lights Header */}
            <div className="bg-white border-b px-4 py-3 flex items-center gap-2 justify-between">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
              </div>
              <div className="text-xs text-muted-foreground font-mono font-medium opacity-70">
                SKILL.md
              </div>
              <div className="text-xs text-muted-foreground opacity-50 font-sans">readonly</div>
            </div>

            {/* Metadata Table (if exists) */}
            {visibleMetadataEntries.length > 0 && (
              <div className="bg-white px-6 py-8">
                <div className="rounded-xl border border-[#f3d7c7] overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {visibleMetadataEntries.map(([key, value]) => (
                        <tr key={key} className="border-b border-[#f3d7c7] last:border-0">
                          <td className="py-4 px-6 font-bold text-[#d97757] w-[220px] bg-[#fff9f8] align-top border-r border-[#f3d7c7]">
                            {key}
                          </td>
                          <td className="py-4 px-6 text-slate-700 bg-white leading-relaxed">
                            {value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <article
              className="p-10 prose prose-slate dark:prose-invert max-w-none 
                            font-sans
                            prose-headings:font-bold prose-headings:tracking-tight
                            prose-p:leading-7 prose-p:text-slate-600
                            prose-code:font-mono prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({
                    inline,
                    className,
                    children,
                    ...props
                  }: {
                    inline?: boolean
                    className?: string
                    children?: React.ReactNode
                  }) {
                    const match = /language-(\w+)/.exec(className || '')
                    const codeText = String(children).replace(/\n$/, '')
                    return !inline && match ? (
                      <div className="my-4 rounded-2xl overflow-hidden shadow-lg border border-slate-100">
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: '1rem',
                            padding: '1.25rem 1.5rem',
                          }}
                          {...props}
                        >
                          {codeText}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          </div>
        </div>
      </div>
    </div>
  )
}
