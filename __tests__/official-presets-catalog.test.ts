// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { getOfficialPreset, listOfficialPresets } from '../lib/services/kit-service.mjs'
import type { OfficialPresetSummary } from '../lib/core/kit-types'

describe('official presets catalog', () => {
  it('includes the impeccable foundations and advanced presets', async () => {
    const presets = await listOfficialPresets()
    const ids = presets.map((preset: OfficialPresetSummary) => preset.id)

    expect(ids).toContain('impeccable-ui-foundations')
    expect(ids).toContain('impeccable-ui-advanced')

    const foundations = presets.find(
      (preset: OfficialPresetSummary) => preset.id === 'impeccable-ui-foundations'
    )
    const advanced = presets.find(
      (preset: OfficialPresetSummary) => preset.id === 'impeccable-ui-advanced'
    )

    expect(foundations).toMatchObject({
      name: 'Impeccable UI Foundations',
      policyName: 'Impeccable UI Foundations',
      sourceCount: 1,
      skillCount: 10,
    })
    expect(advanced).toMatchObject({
      name: 'Impeccable UI Advanced',
      policyName: 'Impeccable UI Advanced',
      sourceCount: 1,
      skillCount: 11,
    })
  })

  it('exposes the curated impeccable skill selections', async () => {
    const foundations = await getOfficialPreset({ id: 'impeccable-ui-foundations' })
    const advanced = await getOfficialPreset({ id: 'impeccable-ui-advanced' })

    expect(foundations.description).toContain('设计上下文')
    expect(foundations.sources[0]?.url).toContain('github.com/pbakaus/impeccable')
    expect(foundations.sources[0]?.selectedSkills).toEqual([
      'teach-impeccable',
      'frontend-design',
      'typeset',
      'arrange',
      'colorize',
      'clarify',
      'adapt',
      'harden',
      'polish',
      'critique',
    ])

    expect(advanced.description).toContain('高级交互')
    expect(advanced.sources[0]?.selectedSkills).toEqual([
      'animate',
      'delight',
      'bolder',
      'quieter',
      'distill',
      'normalize',
      'extract',
      'onboard',
      'optimize',
      'overdrive',
      'audit',
    ])
  })
})
