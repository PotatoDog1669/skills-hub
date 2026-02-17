import type { KitLoadoutRecord, KitPolicyRecord, KitRecord } from '@/lib/core/kit-types';
import type {
  AppType,
  ProviderRecord,
  UniversalProviderRecord,
} from '@/lib/core/provider-types';
import type { AgentConfig, AppConfig } from '@/lib/config';
import type { Skill } from '@/lib/skills-types';

const STORAGE_KEY = 'skills-hub.desktop.m2.state.v1';
const CHANGE_EVENT = 'skills-hub:changed';
const REFRESH_EVENT = 'skills-hub:refresh';

export type SkillDocument = {
  metadata: Record<string, string>;
  content: string;
};

type ProviderBackupEntry = {
  backupId: number;
  provider: ProviderRecord;
};

export type DesktopState = {
  config: AppConfig;
  skills: Skill[];
  providers: ProviderRecord[];
  universalProviders: UniversalProviderRecord[];
  kitPolicies: KitPolicyRecord[];
  kitLoadouts: KitLoadoutRecord[];
  kits: KitRecord[];
  providerBackups: Record<AppType, ProviderBackupEntry[]>;
  skillDocuments: Record<string, SkillDocument>;
  agentsMdApplied: Record<string, boolean>;
};

export type DashboardSnapshot = {
  config: AppConfig;
  skills: Skill[];
  providers: ProviderRecord[];
  universalProviders: UniversalProviderRecord[];
  kitPolicies: KitPolicyRecord[];
  kitLoadouts: KitLoadoutRecord[];
  kits: KitRecord[];
};

const BUILTIN_AGENTS: AgentConfig[] = [
  {
    name: 'Antigravity',
    globalPath: '/Users/leo/.gemini/antigravity/skills',
    projectPath: '.agent/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Claude Code',
    globalPath: '/Users/leo/.claude/skills',
    projectPath: '.claude/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Cursor',
    globalPath: '/Users/leo/.cursor/skills',
    projectPath: '.cursor/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Codex',
    globalPath: '/Users/leo/.codex/skills',
    projectPath: '.codex/skills',
    enabled: true,
    isCustom: false,
  },
  {
    name: 'Gemini CLI',
    globalPath: '/Users/leo/.gemini/skills',
    projectPath: '.gemini/skills',
    enabled: false,
    isCustom: false,
  },
];

function now() {
  return Date.now();
}

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function tail(inputPath: string): string {
  const normalized = normalizePath(inputPath);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSeedState(): DesktopState {
  const createdAt = now();
  const hubPath = '/Users/leo/skills-hub';
  const sampleSkillPath = `${hubPath}/agent-browser`;
  const sampleSkillPath2 = `${hubPath}/skill-installer`;

  const providers: ProviderRecord[] = [
    {
      id: 'provider-claude-official',
      appType: 'claude',
      name: 'Anthropic Official',
      config: {
        _profile: {
          kind: 'official',
          vendorKey: 'anthropic-official',
          accountName: 'default',
          website: 'https://claude.ai',
        },
      },
      isCurrent: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'provider-codex-api',
      appType: 'codex',
      name: 'OpenAI API',
      config: {
        _profile: {
          kind: 'api',
          vendorKey: 'openai',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-5.2',
        },
        auth: { OPENAI_API_KEY: 'sk-***' },
      },
      isCurrent: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'provider-gemini-api',
      appType: 'gemini',
      name: 'Google AI Studio API',
      config: {
        _profile: {
          kind: 'api',
          vendorKey: 'google-ai-studio',
          endpoint: 'https://generativelanguage.googleapis.com',
          model: 'gemini-2.5-pro',
        },
        apiKey: 'gsk_***',
      },
      isCurrent: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const universalProviders: UniversalProviderRecord[] = [
    {
      id: 'universal-openrouter',
      name: 'OpenRouter Shared',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'or-***',
      websiteUrl: 'https://openrouter.ai',
      notes: 'Bootstrap sample',
      apps: {
        claude: true,
        codex: true,
        gemini: true,
      },
      models: {
        claude: { model: 'anthropic/claude-sonnet-4' },
        codex: { model: 'openai/gpt-5' },
        gemini: { model: 'google/gemini-2.5-pro' },
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const kitPolicies: KitPolicyRecord[] = [
    {
      id: 'policy-general',
      name: 'General Development',
      description: 'Default AGENTS.md policy template',
      content: '# AGENTS.md\n\n## Rules\n- Keep changes minimal and testable.\n',
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const kitLoadouts: KitLoadoutRecord[] = [
    {
      id: 'loadout-default',
      name: 'Default Hub Skills',
      description: 'Two starter skills',
      items: [
        { skillPath: sampleSkillPath, mode: 'copy', sortOrder: 0 },
        { skillPath: sampleSkillPath2, mode: 'copy', sortOrder: 1 },
      ],
      createdAt,
      updatedAt: createdAt,
    },
  ];

  const kits: KitRecord[] = [
    {
      id: 'kit-onboarding',
      name: 'Onboarding Kit',
      description: 'Policy + default skill package',
      policyId: 'policy-general',
      loadoutId: 'loadout-default',
      createdAt,
      updatedAt: createdAt,
    },
  ];

  return {
    config: {
      hubPath,
      projects: ['/Users/leo/workspace/skills-hub'],
      scanRoots: ['/Users/leo/workspace'],
      agents: clone(BUILTIN_AGENTS),
    },
    skills: [
      {
        id: 'skill-agent-browser-hub',
        name: 'agent-browser',
        description: 'Browser automation CLI for AI agents.',
        path: sampleSkillPath,
        location: 'hub',
      },
      {
        id: 'skill-installer-hub',
        name: 'skill-installer',
        description: 'Install and manage Codex skills.',
        path: sampleSkillPath2,
        location: 'hub',
      },
    ],
    providers,
    universalProviders,
    kitPolicies,
    kitLoadouts,
    kits,
    providerBackups: {
      claude: [],
      codex: [],
      gemini: [],
    },
    skillDocuments: {
      [sampleSkillPath]: {
        metadata: {
          name: 'agent-browser',
          description: 'Browser automation CLI for AI agents.',
        },
        content:
          '# agent-browser\n\nUse this skill to automate browsing flows and extract data from web pages.',
      },
      [sampleSkillPath2]: {
        metadata: {
          name: 'skill-installer',
          description: 'Install and manage Codex skills.',
        },
        content:
          '# skill-installer\n\nUse this skill to discover and install skills from curated sources.',
      },
    },
    agentsMdApplied: {},
  };
}

let inMemoryState: DesktopState | null = null;

function readFromStorage(): DesktopState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesktopState;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state: DesktopState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureState(): DesktopState {
  if (inMemoryState) {
    return inMemoryState;
  }

  const fromStorage = readFromStorage();
  inMemoryState = fromStorage || createSeedState();
  if (!fromStorage) {
    saveToStorage(inMemoryState);
  }
  return inMemoryState;
}

function emitChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function emitRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

export function getMutableState(): DesktopState {
  return ensureState();
}

export function updateState(mutator: (state: DesktopState) => void): DesktopState {
  const state = ensureState();
  mutator(state);
  saveToStorage(state);
  emitChanged();
  return state;
}

export function resetState() {
  inMemoryState = createSeedState();
  saveToStorage(inMemoryState);
  emitChanged();
}

export function getSnapshot(): DashboardSnapshot {
  const state = ensureState();
  return {
    config: clone(state.config),
    skills: clone(state.skills),
    providers: clone(state.providers),
    universalProviders: clone(state.universalProviders),
    kitPolicies: clone(state.kitPolicies),
    kitLoadouts: clone(state.kitLoadouts),
    kits: clone(state.kits),
  };
}

export function subscribeSnapshot(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener(REFRESH_EVENT, handler);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener(REFRESH_EVENT, handler);
  };
}

export function generateId(prefix: string): string {
  return `${prefix}-${now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function timestamp(): number {
  return now();
}

export function normalizeDesktopPath(inputPath: string): string {
  return normalizePath(inputPath);
}

export function pathTail(inputPath: string): string {
  return tail(inputPath);
}
