'use client'

import { useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'

type Lang = 'en' | 'zh'

const content = {
  en: {
    title: 'Skills Hub Project Introduction',
    lead: 'Current version focuses on a local-first workflow: manage Skills, Providers, and Kits across Git projects and multiple agents.',
    overviewTitle: 'Current Status',
    overviewText:
      'Skills Hub now has both Desktop UI and CLI entry points. Desktop is for visual operations, while CLI is for repeatable scripts and automation. Both paths share the same core capability set.',
    capabilitiesTitle: 'Implemented Capabilities',
    capabilitiesText: (
      <ul>
        <li>
          Manage skills in <strong>Central Hub</strong> as the single source of truth.
        </li>
        <li>
          Import skills from GitHub URLs, including branch-specific links.
        </li>
        <li>
          Sync Hub skills to project agents with <code>copy</code> or <code>link</code> mode.
        </li>
        <li>
          Save project-side skill changes back to Hub.
        </li>
        <li>
          Build and apply Kits: AGENTS.md template + Skills package + target project/agent.
        </li>
        <li>
          Manage app-specific and universal Providers (switch, restore, re-apply).
        </li>
      </ul>
    ),
    workflowsTitle: 'Core Workflows',
    hubTitle: '1. Skills Workflow (Hub ↔ Project)',
    hubText: (
      <>
        Use Hub to import/create skills, then distribute them to projects. If a project copy is
        improved, save it back to Hub to keep a canonical version.
      </>
    ),
    projectsTitle: '2. Projects & Agents',
    projectsText:
      'Project discovery is Git-only. Auto scan and manual add both require paths inside a Git work tree. You can manage skills per project and per enabled agent.',
    kitTitle: '3. Kit Workflow (Template + Package + Apply)',
    kitText: (
      <>
        In <strong>Kit</strong> view, AGENTS.md templates support drag import, GitHub import, and
        manual editing. Skills package can be composed from Hub skills, then saved as Kit and
        applied to a target project + agent in one action.
      </>
    ),
    providerTitle: '4. Provider Workflow',
    providerText: (
      <>
        In <strong>Providers</strong>, manage Claude/Codex/Gemini provider profiles and universal
        provider configuration with backup-aware switch and re-apply flow.
      </>
    ),
    guideTitle: 'Recommended Onboarding Order',
    importTitle: 'Step 2: Prepare Hub Skills',
    importText: (
      <>
        In <strong>Central Hub</strong>, use{' '}
        <span className="custom-text-orange font-bold">Import Skill</span> for GitHub skills or{' '}
        <span className="custom-text-orange font-bold">Create Skill</span> for new ones.
      </>
    ),
    syncTitle: 'Step 3: Sync or Save Back',
    syncText: (
      <>
        Use <strong>Sync</strong> to publish Hub skills to target agents. Use{' '}
        <span className="custom-text-orange font-bold">Save</span> on project skills to send
        updates back to Hub.
      </>
    ),
    saveTitle: 'Step 4: Compose and Apply Kit',
    saveText: (
      <>
        Create AGENTS.md template and Skills package, save them into a Kit, then apply the Kit to
        the target project + agent.
      </>
    ),
    createTitle: 'Step 5: Manage Providers',
    createText: (
      <>
        Configure and switch providers in <strong>Providers</strong>, then re-apply when needed so
        agent environments stay consistent.
      </>
    ),
    manageProjectTitle: 'Step 1: Configure Project Sources',
    manageProjectText: (
      <>
        <strong>Auto Scan:</strong> set Scan Roots in Settings (for example <code>~/workspace</code>
        ) to discover Git repositories recursively.
        <br />
        <strong>Manual Add:</strong> add project path manually when needed (Git work tree required).
      </>
    ),
    cliTitle: 'CLI Mapping',
    cliText: (
      <>
        Key groups: <code>skills-hub list/import/sync</code>, <code>provider ...</code>,{' '}
        <code>kit policy-*</code>, <code>kit loadout-*</code>, <code>kit add/update/apply</code>.
      </>
    ),
    marketTitle: 'Skill Sources',
    marketText: (
      <>
        You can use GitHub directly, or browse{' '}
        <a
          href="https://skillsmp.com/zh"
          target="_blank"
          rel="noopener noreferrer"
          className="custom-text-orange font-bold hover:underline"
        >
          Skills Market
        </a>{' '}
        and import via copied URLs.
      </>
    ),
  },
  zh: {
    title: 'Skills Hub 项目介绍',
    lead: '当前版本聚焦本地优先工作流：在 Git 项目与多 Agent 场景下统一管理 Skills、Providers 和 Kit。',
    overviewTitle: '项目现状',
    overviewText:
      'Skills Hub 目前提供 Desktop UI + CLI 双入口。桌面端用于可视化操作，CLI 用于脚本化与自动化；两者共用同一套核心能力。',
    capabilitiesTitle: '当前已实现能力',
    capabilitiesText: (
      <ul>
        <li>
          在 <strong>Central Hub</strong> 集中管理技能，作为单一事实来源。
        </li>
        <li>支持从 GitHub URL 导入技能（含分支链接）。</li>
        <li>
          支持将 Hub 技能以 <code>copy</code> / <code>link</code> 同步到项目 Agent。
        </li>
        <li>支持把项目内技能改动保存回 Hub。</li>
        <li>支持 Kit 组合与应用：AGENTS.md 模板 + Skills package + 目标项目/Agent。</li>
        <li>支持应用级与通用 Provider 管理（切换、恢复、重新应用）。</li>
      </ul>
    ),
    workflowsTitle: '核心流程',
    hubTitle: '1. 技能流程（Hub ↔ Project）',
    hubText: (
      <>
        在 Hub 导入/创建技能后分发到项目。若项目侧能力增强，可保存回 Hub，持续维护标准版本。
      </>
    ),
    projectsTitle: '2. 项目与 Agent',
    projectsText:
      '项目发现是 Git-only：自动扫描和手动添加都要求路径在 Git 工作树内。你可以按项目、按已启用 Agent 进行独立管理。',
    kitTitle: '3. Kit 流程（模板 + 打包 + 应用）',
    kitText: (
      <>
        在 <strong>Kit</strong> 视图中，AGENTS.md 模板支持拖拽导入、GitHub 导入和手动编辑。
        Skills package 可从 Hub 技能中组合，保存为 Kit 后可一键应用到目标项目 + Agent。
      </>
    ),
    providerTitle: '4. Provider 流程',
    providerText: (
      <>
        在 <strong>Providers</strong> 视图中管理 Claude/Codex/Gemini 的 Provider，以及通用
        Provider，支持带备份的切换与重新应用。
      </>
    ),
    guideTitle: '推荐上手顺序',
    importTitle: '第 2 步：准备 Hub 技能',
    importText: (
      <>
        进入 <strong>Central Hub</strong>，使用{' '}
        <span className="custom-text-orange font-bold">Import Skill</span> 导入 GitHub 技能，或用{' '}
        <span className="custom-text-orange font-bold">Create Skill</span> 新建技能。
      </>
    ),
    syncTitle: '第 3 步：同步与回写',
    syncText: (
      <>
        用 <strong>Sync</strong> 将 Hub 技能发布到目标 Agent；用项目卡片上的{' '}
        <span className="custom-text-orange font-bold">Save</span> 把更新回写到 Hub。
      </>
    ),
    saveTitle: '第 4 步：组合并应用 Kit',
    saveText: (
      <>
        先创建 AGENTS.md 模板和 Skills package，再保存为 Kit，然后应用到目标项目 + Agent。
      </>
    ),
    createTitle: '第 5 步：管理 Providers',
    createText: (
      <>
        在 <strong>Providers</strong> 中管理与切换供应商配置，必要时重新应用，保持不同 Agent
        运行环境一致。
      </>
    ),
    manageProjectTitle: '第 1 步：配置项目来源',
    manageProjectText: (
      <>
        <strong>自动扫描：</strong>在设置中配置 Scan Roots（例如 <code>~/workspace</code>），系统将递归发现
        Git 仓库项目。
        <br />
        <strong>手动添加：</strong>项目不在扫描根目录时可手动添加（仍要求 Git 工作树）。
      </>
    ),
    cliTitle: 'CLI 对照',
    cliText: (
      <>
        常用命令组：<code>skills-hub list/import/sync</code>、<code>provider ...</code>、
        <code>kit policy-*</code>、<code>kit loadout-*</code>、<code>kit add/update/apply</code>。
      </>
    ),
    marketTitle: '技能来源',
    marketText: (
      <>
        你可以直接使用 GitHub，也可以在{' '}
        <a
          href="https://skillsmp.com/zh"
          target="_blank"
          rel="noopener noreferrer"
          className="custom-text-orange font-bold hover:underline"
        >
          Skills Market
        </a>{' '}
        浏览技能并复制 URL 导入。
      </>
    ),
  },
}

export function IntroductionView() {
  const [lang, setLang] = useState<Lang>('zh')
  const t = content[lang]

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex justify-end mb-4">
        <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5">
          <Globe size={14} className="text-gray-500" />
          <span className="text-xs text-gray-500">Language</span>
          <div className="relative">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="appearance-none rounded-md border border-gray-200 bg-white pl-2.5 pr-7 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#d97757]"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>
      </div>

      <div className="prose prose-slate max-w-none">
        <h1>{t.title}</h1>
        <p className="text-xl text-muted-foreground lead">{t.lead}</p>

        <hr className="my-8" />

        <h2>{t.overviewTitle}</h2>
        <p>{t.overviewText}</p>

        <h2>{t.capabilitiesTitle}</h2>
        <div>{t.capabilitiesText}</div>

        <h2>{t.workflowsTitle}</h2>

        <h3>{t.hubTitle}</h3>
        <p>{t.hubText}</p>

        <h3>{t.projectsTitle}</h3>
        <p>{t.projectsText}</p>

        <h3>{t.kitTitle}</h3>
        <p>{t.kitText}</p>

        <h3>{t.providerTitle}</h3>
        <p>{t.providerText}</p>

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

        <h3>{t.cliTitle}</h3>
        <p>{t.cliText}</p>
      </div>
    </div>
  )
}
