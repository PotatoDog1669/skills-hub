'use client'

import { actionGetSkillContent } from '@/app/actions'
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

interface SkillDetailViewProps {
  path: string
}

interface SkillData {
  content: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>
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
  const description = metadata['description'] || 'Activates when the user needs this skill.'

  const name = path.split('/').pop() || 'Unknown Skill'

  const returnView = searchParams.get('returnView') || 'all'
  const returnId = searchParams.get('returnId')

  // Construct back link
  const backLink =
    returnView === 'all' ? '/' : `/?view=${returnView}${returnId ? `&id=${returnId}` : ''}`

  return (
    <div className="container max-w-[1400px] py-8 space-y-8 font-mono">
      <div className="grid grid-cols-1 gap-12">
        {/* Main Content */}
        <div className="space-y-8 min-w-0">
          {/* Header Section */}
          <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground bg-muted/30 px-4 py-1.5 rounded-full border border-border/50 shadow-sm">
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
                className="px-3 py-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 border border-transparent hover:border-border"
              >
                <ArrowLeft size={14} />
                <span>cd ..</span>
              </Link>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <h1 className="text-5xl font-bold tracking-tight text-[#d97757]">{name}</h1>

              {/* Description */}
              <div className="text-lg leading-relaxed max-w-3xl text-[#6c6c6c]">
                <span className="text-[#40a02b]">{'//'}</span> {description}
                <br />
                <span className="text-[#40a02b]">{'//'}</span> Use for discovering, retrieving, and
                installing skills.
              </div>
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
            {Object.keys(metadata).length > 0 && (
              <div className="bg-white px-6 py-8">
                <div className="rounded-xl border border-[#f3e6e2] overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(metadata).map(([key, value]) => (
                        <tr key={key} className="border-b border-[#f3e6e2] last:border-0">
                          <td className="py-4 px-6 font-bold text-[#d97757] w-[220px] bg-[#fff9f8] align-top border-r border-[#f3e6e2]">
                            {key}
                          </td>
                          <td className="py-4 px-6 text-slate-700 bg-white leading-relaxed">
                            {/* Render value, handle objects if necessary or JSON stringify */}
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
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
