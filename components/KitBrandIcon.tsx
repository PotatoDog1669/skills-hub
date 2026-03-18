'use client'

import type { ReactNode } from 'react'
import {
  Blocks,
  BookOpenText,
  Brain,
  Cloud,
  FlaskConical,
  LayoutTemplate,
  Rocket,
  SearchCheck,
  Shield,
  Sparkles,
  Workflow,
  Wrench,
} from 'lucide-react'

type KitBrandSpec = {
  label: string
  icon: ReactNode
  className: string
}

const KIT_BRAND_SPECS: Record<string, KitBrandSpec> = {
  'fullstack-product-engineering': {
    label: 'FS',
    icon: <Blocks size={18} strokeWidth={2.2} />,
    className: 'bg-[#fff3eb] text-[#9a4d1d] border-[#f0c4a8]',
  },
  'web-frontend-excellence': {
    label: 'UI',
    icon: <LayoutTemplate size={18} strokeWidth={2.2} />,
    className: 'bg-[#eef7ff] text-[#1d5e9a] border-[#bfd8f3]',
  },
  'python-service-api': {
    label: 'PY',
    icon: <Wrench size={18} strokeWidth={2.2} />,
    className: 'bg-[#f3f6ea] text-[#5e7124] border-[#d8e2b2]',
  },
  'langchain-langgraph-apps': {
    label: 'LC',
    icon: <Workflow size={18} strokeWidth={2.2} />,
    className: 'bg-[#eef9f3] text-[#1c7a48] border-[#b9e5ca]',
  },
  'hf-ml-training-evaluation': {
    label: 'ML',
    icon: <Brain size={18} strokeWidth={2.2} />,
    className: 'bg-[#fff8e8] text-[#9c6b10] border-[#f0dd9c]',
  },
  'literature-review-scientific-writing': {
    label: 'LR',
    icon: <BookOpenText size={18} strokeWidth={2.2} />,
    className: 'bg-[#f7f1ff] text-[#6f44a6] border-[#dccaf5]',
  },
  'scientific-discovery-bioinformatics': {
    label: 'RD',
    icon: <FlaskConical size={18} strokeWidth={2.2} />,
    className: 'bg-[#edf9f7] text-[#0f6d62] border-[#bbe5dd]',
  },
  'security-audit-vulnerability-detection': {
    label: 'SEC',
    icon: <Shield size={18} strokeWidth={2.2} />,
    className: 'bg-[#fff0f0] text-[#a33f3f] border-[#efc1c1]',
  },
  'release-ci-automation': {
    label: 'CI',
    icon: <Rocket size={18} strokeWidth={2.2} />,
    className: 'bg-[#fff5ea] text-[#a15b19] border-[#efcfaf]',
  },
  'cloudflare-serverless-edge': {
    label: 'EDGE',
    icon: <Cloud size={18} strokeWidth={2.2} />,
    className: 'bg-[#fff4ee] text-[#b55417] border-[#f2c8ae]',
  },
  'azure-cloud-development': {
    label: 'AZ',
    icon: <Sparkles size={18} strokeWidth={2.2} />,
    className: 'bg-[#eef5ff] text-[#245da8] border-[#c5d7f2]',
  },
}

const DEFAULT_BRAND_SPEC: KitBrandSpec = {
  label: 'KIT',
  icon: <SearchCheck size={18} strokeWidth={2.2} />,
  className: 'bg-[#f5f5f5] text-[#555] border-[#dddddd]',
}

export function KitBrandIcon({
  presetId,
  className = '',
}: {
  presetId?: string | null
  className?: string
}) {
  const spec = (presetId && KIT_BRAND_SPECS[presetId]) || DEFAULT_BRAND_SPEC

  return (
    <div
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${spec.className} ${className}`}
      title={spec.label}
    >
      {spec.icon}
    </div>
  )
}
