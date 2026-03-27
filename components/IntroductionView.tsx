'use client'

import { useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'

type Lang = 'en' | 'zh'

const content = {
  en: {
    title: 'Skills Hub Introduction',
    lead: 'Skills Hub is a local-first control center for skills, instruction templates, kits, and providers across Git projects and multiple AI agents.',
    overviewTitle: 'Product Snapshot',
    overviewText:
      'The current version provides both Desktop UI and CLI. Desktop is optimized for visual management, while CLI covers repeatable scripting and automation. Both entry points share the same core data model and workflows.',
    capabilitiesTitle: 'What You Can Do Today',
    capabilitiesText: (
      <ul>
        <li>
          Use <strong>Central Hub</strong> as the source of truth for reusable skills.
        </li>
        <li>
          Import skills from GitHub URLs, including tree and branch links.
        </li>
        <li>
          Sync skills to many supported agents such as Claude Code, Codex, Cursor, Gemini CLI,
          Copilot, Windsurf, Trae, and more.
        </li>
        <li>
          Publish Hub skills to target agents with <code>copy</code> or <code>link</code> mode,
          then save project-side improvements back to Hub.
        </li>
        <li>
          Build Kits from instruction templates and reusable loadouts, or import ready-made
          loadouts from repositories.
        </li>
        <li>
          Start from bundled curated Kits, then re-sync or restore their baseline later when
          needed.
        </li>
        <li>
          Manage app-specific and universal Providers with switch, restore, capture, and re-apply
          flows.
        </li>
      </ul>
    ),
    workflowsTitle: 'Core Workflows',
    hubTitle: '1. Skills Workflow (Hub ↔ Project)',
    hubText: (
      <>
        Import or create skills in Hub first, then distribute them to projects and agents. If a
        project copy evolves, save it back to Hub so the shared version stays current.
      </>
    ),
    projectsTitle: '2. Projects & Agents',
    projectsText:
      'Project discovery is Git-only. Auto scan and manual add both require a Git work tree. Inside each project, you can manage enabled agents individually and keep different instruction files aligned.',
    kitTitle: '3. Kit Workflow (Template + Package + Apply)',
    kitText: (
      <>
        In <strong>Kit</strong>, instruction templates support drag import, GitHub import, and
        manual editing for <code>AGENTS.md</code> or <code>CLAUDE.md</code>. Loadouts can be built
        from Hub skills or imported from a repository, then combined into Kits and applied to a
        target project + agent in one step. Bundled recommendations are treated as local Kits once
        installed.
      </>
    ),
    providerTitle: '4. Provider Workflow',
    providerText: (
      <>
        In <strong>Providers</strong>, manage Claude, Codex, and Gemini profiles plus universal
        provider configs with backup-aware switching, restore, capture, and re-apply support.
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
        Create or import an instruction template, assemble a loadout, or start from a bundled
        recommendation. Save the result as a Kit, then apply it to the target project + agent.
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
        <strong>Manual Add:</strong> add a project path manually when needed, and enable the agents
        you want to manage there.
      </>
    ),
    cliTitle: 'CLI Mapping',
    cliText: (
      <>
        Key groups: <code>skills-hub list/import/sync</code>, <code>provider ...</code>,{' '}
        <code>kit policy-*</code>, <code>kit package-*</code>, <code>kit list/add/update/apply</code>.
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
    title: 'Skills Hub 使用简介',
    lead: 'Skills Hub 是一个本地优先的控制中心，用来在 Git 项目与多 Agent 场景下统一管理 Skills、指令模板、Kit 和 Providers。',
    overviewTitle: '当前定位',
    overviewText:
      '当前版本同时提供 Desktop UI 和 CLI。桌面端适合可视化管理，CLI 适合脚本化与自动化；两条路径共用同一套核心数据模型和工作流。',
    capabilitiesTitle: '当前已落地能力',
    capabilitiesText: (
      <ul>
        <li>
          在 <strong>Central Hub</strong> 集中管理可复用技能，作为单一事实来源。
        </li>
        <li>
          支持从 GitHub URL 导入技能，包含仓库树链接和分支链接。
        </li>
        <li>
          支持将技能同步到多种 Agent，包括 Claude Code、Codex、Cursor、Gemini CLI、Copilot、Windsurf、Trae 等。
        </li>
        <li>
          支持将 Hub 技能以 <code>copy</code> / <code>link</code> 发布到目标 Agent，并把项目内改动回写到 Hub。
        </li>
        <li>
          支持用指令模板和 skills 包组合 Kit，也支持直接从仓库导入 skills 包。
        </li>
        <li>支持从内置精选内容出发生成受管理的 Kit，并在后续重新同步或恢复基线。</li>
        <li>支持应用级与通用 Provider 管理，包含切换、恢复、抓取当前配置和重新应用。</li>
      </ul>
    ),
    workflowsTitle: '核心流程',
    hubTitle: '1. 技能流程（Hub ↔ Project）',
    hubText: (
      <>
        先在 Hub 导入或创建技能，再分发到项目与 Agent。若项目侧版本持续演进，可以保存回 Hub，保持共享版本始终最新。
      </>
    ),
    projectsTitle: '2. 项目与 Agent',
    projectsText:
      '项目发现目前仍是 Git-only：自动扫描和手动添加都要求路径位于 Git 工作树内。进入项目后，可以按已启用的 Agent 独立管理技能和指令文件。',
    kitTitle: '3. Kit 流程（模板 + 打包 + 应用）',
    kitText: (
      <>
        在 <strong>Kit</strong> 视图中，指令模板支持拖拽导入、GitHub 导入和手动编辑，可用于
        <code>AGENTS.md</code> 或 <code>CLAUDE.md</code>。skills 包既可以从 Hub 技能组合，也可以直接从仓库导入；随后可与模板组装成 Kit，并一键应用到目标项目和 Agent。内置推荐内容一旦导入，也按本地 Kit 管理。
      </>
    ),
    providerTitle: '4. Provider 流程',
    providerText: (
      <>
        在 <strong>Providers</strong> 视图中管理 Claude、Codex、Gemini 的 Provider，以及通用
        Provider，支持带备份的切换、恢复、抓取当前配置与重新应用。
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
        先创建或导入指令模板，再组装 skills 包，或者直接从内置推荐内容开始。保存为 Kit 后，再应用到目标项目和 Agent。
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
        <strong>手动添加：</strong>项目不在扫描根目录时可手动添加；添加后再启用你想管理的 Agent。
      </>
    ),
    cliTitle: 'CLI 对照',
    cliText: (
      <>
        常用命令组：<code>skills-hub list/import/sync</code>、<code>provider ...</code>、
        <code>kit policy-*</code>、<code>kit package-*</code>、<code>kit list/add/update/apply</code>。
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
