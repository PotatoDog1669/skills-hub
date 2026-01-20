'use client'

import { useState } from 'react'
import { Globe } from 'lucide-react'

type Lang = 'en' | 'zh'

const content = {
  en: {
    title: 'Skills Hub Introduction',
    lead: 'Manage, discover, and sync skills across your AI agent projects.',
    overviewTitle: 'Overview',
    overviewText:
      'Skills Hub is a centralized management tool designed to unify the "Skill" assets of AI agents scattered across different projects. It serves as a bridge between your local development environment and a shared skills repository.',
    conceptsTitle: 'Core Concepts',
    hubTitle: '1. Central Hub',
    hubText: (
      <>
        The <strong>Central Hub</strong> (<code>~/skills-hub</code>) is your local &quot;App
        Store&quot; for skills. You can import skills from GitHub or create new ones here. Skills in
        the Hub act as the &quot;Source of Truth&quot;.
      </>
    ),
    projectsTitle: '2. Projects & Agents',
    projectsText:
      'Skills Hub automatically scans your workspace for agent projects. You can also manually add projects. Within each project, you can manage skills for specific Agents (e.g., Codex, Claude Code).',
    guideTitle: 'Quick Start Guide',
    importTitle: 'Importing Skills',
    importText: (
      <>
        Navigate to the <strong>Central Hub</strong> view and click the{' '}
        <span className="custom-text-orange font-bold">Import Skill</span> button. Paste a GitHub
        URL (specific branches supported) to download a skill.
      </>
    ),
    syncTitle: 'Syncing Skills (Hub → Project)',
    syncText: (
      <>
        Click the <strong>Sync</strong> button on a Hub skill card to distribute it to multiple
        agent projects. This ensures all your agents are using the canonical version from the Hub.
      </>
    ),
    saveTitle: 'Saving Skills (Project → Hub)',
    saveText: (
      <>
        If you modify a skill within an agent project, click the{' '}
        <span className="custom-text-orange font-bold">Save</span> button on the project skill card.
        This updates the Central Hub with your latest changes, making them available for other
        projects.
      </>
    ),
    createTitle: 'Creating Skills',
    createText: (
      <>
        Use the <strong>Create Skill</strong> button in the Hub to author new skills from scratch. A
        standard <code>SKILL.md</code> template will be generated for you.
      </>
    ),
    manageProjectTitle: 'Managing Projects',
    manageProjectText: (
      <>
        <strong>Scanning:</strong> Configure &quot;Scan Roots&quot; (e.g. <code>~/workspace</code>)
        in Settings. Skills Hub recursively scans up to 3 levels deep for projects containing valid
        skill directories (e.g., <code>.agent/skills</code>, <code>.claude/skills</code>, etc.)
        based on your active agents.
        <br />
        <strong>Manual Import:</strong> You can also manually add a project path if it&apos;s
        outside your scan roots.
      </>
    ),
    marketTitle: 'Skills Market',
    marketText: (
      <>
        Discover a wide range of community-contributed skills at the{' '}
        <a
          href="https://skillsmp.com/zh"
          target="_blank"
          rel="noopener noreferrer"
          className="custom-text-orange font-bold hover:underline"
        >
          Skills Market
        </a>
        . You can copy skill URLs from there to import into Skills Hub.
      </>
    ),
  },
  zh: {
    title: 'Skills Hub 使用指南',
    lead: '管理、发现并同步您所有 AI Agent 项目中的技能。',
    overviewTitle: '简介',
    overviewText:
      'Skills Hub 是一个集中式管理工具，旨在统一分散在不同项目中的 AI Agent 技能资产。它是您本地开发环境与共享技能仓库之间的桥梁。',
    conceptsTitle: '核心概念',
    hubTitle: '1. 中央仓库 (Central Hub)',
    hubText: (
      <>
        <strong>Central Hub</strong> (<code>~/skills-hub</code>) 是您本地的技能应用商店。 您可以从
        GitHub 导入技能或在此创建新技能。Hub 中的技能是所有项目的“单一事实来源”。
      </>
    ),
    projectsTitle: '2. 项目与 Agent',
    projectsText:
      'Skills Hub 会自动扫描您的工作区以查找 Agent 项目。您也可以手动添加项目。在每个项目中，您可以为特定的 Agent（如 Codex, Claude Code）管理技能。',
    guideTitle: '快速入门',
    importTitle: '导入技能',
    importText: (
      <>
        导航至 <strong>Central Hub</strong> 视图，点击{' '}
        <span className="custom-text-orange font-bold">Import Skill</span> 按钮。 粘贴 GitHub
        URL（支持指定分支）即可下载技能。
      </>
    ),
    syncTitle: '同步技能 (Hub → Project)',
    syncText: (
      <>
        点击 Hub 技能卡片上的 <strong>Sync</strong> 按钮，将技能分发到多个 Agent 项目。
        这能确保您的所有 Agent 都使用来自 Hub 的标准版本。
      </>
    ),
    saveTitle: '保存技能 (Project → Hub)',
    saveText: (
      <>
        如果您在 Agent 项目中修改了技能，请点击项目技能卡片上的{' '}
        <span className="custom-text-orange font-bold">Save</span> 按钮。 这将把您的修改更新到
        Central Hub，使其可供其他项目使用。
      </>
    ),
    createTitle: '创建技能',
    createText: (
      <>
        使用 Hub 中的 <strong>Create Skill</strong> 按钮从头开始编写新技能。
        系统会自动为您生成标准的 <code>SKILL.md</code> 模版。
      </>
    ),
    manageProjectTitle: '项目管理',
    manageProjectText: (
      <>
        <strong>自动扫描:</strong> 在设置中配置 &quot;Scan Roots&quot; (如 <code>~/workspace</code>
        )。Skills Hub 会递归扫描（最多 3 层）并根据您启用的 Agent 查找包含有效技能目录（如{' '}
        <code>.agent/skills</code>, <code>.claude/skills</code> 等）的项目。
        <br />
        <strong>手动导入:</strong> 如果项目不在扫描路径下，您也可以手动添加项目路径.
      </>
    ),
    marketTitle: '技能市场',
    marketText: (
      <>
        在{' '}
        <a
          href="https://skillsmp.com/zh"
          target="_blank"
          rel="noopener noreferrer"
          className="custom-text-orange font-bold hover:underline"
        >
          Skills Market
        </a>{' '}
        发现更多社区贡献的技能。您可以复制技能 URL 并导入到 Skills Hub。
      </>
    ),
  },
}

export function IntroductionView() {
  const [lang, setLang] = useState<Lang>('en')
  const t = content[lang]

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex justify-end mb-4">
        <div className="relative inline-flex items-center">
          <Globe
            size={14}
            className="absolute left-2.5 text-muted-foreground pointer-events-none"
          />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-transparent hover:bg-muted transition-colors text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      <div className="prose prose-slate max-w-none">
        <h1>{t.title}</h1>
        <p className="text-xl text-muted-foreground lead">{t.lead}</p>

        <hr className="my-8" />

        <h2>{t.overviewTitle}</h2>
        <p>{t.overviewText}</p>

        <h2>{t.conceptsTitle}</h2>

        <h3>{t.hubTitle}</h3>
        <p>{t.hubText}</p>

        <h3>{t.projectsTitle}</h3>
        <p>{t.projectsText}</p>

        <h2>{t.guideTitle}</h2>

        <h3>{t.manageProjectTitle}</h3>
        <p>{t.manageProjectText}</p>

        <h3>{t.importTitle}</h3>
        <p>{t.importText}</p>

        <h3>{t.marketTitle}</h3>
        <p>{t.marketText}</p>

        <h3>{t.syncTitle}</h3>
        <p>{t.syncText}</p>

        <h3>{t.saveTitle}</h3>
        <p>{t.saveText}</p>

        <h3>{t.createTitle}</h3>
        <p>{t.createText}</p>
      </div>
      <style jsx global>{`
        .custom-text-orange {
          color: #d97757;
        }
      `}</style>
    </div>
  )
}
