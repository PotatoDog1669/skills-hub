import { invoke } from '@tauri-apps/api/core';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import type {
  KitApplyResult,
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  KitSyncMode,
} from '@/lib/core/kit-types';
import type {
  ProviderRecord,
  SwitchResult,
  UniversalProviderApps,
  UniversalProviderModels,
  UniversalProviderRecord,
} from '@/lib/core/provider-types';
import type { AgentConfig, AppConfig } from '@/lib/config';
import type { Skill } from '@/lib/skills-types';
import { resolveAgentsFromGithub } from '@/lib/github-agents';
import { updateState } from './desktop-state';

type ProviderBackupEntry = {
  backupId: number;
  provider: ProviderRecord;
};

type PickDirectoryOptions = {
  title?: string;
  initialPath?: string;
};

type PickDirectoryResult =
  | { status: 'selected'; path: string }
  | { status: 'cancelled' }
  | { status: 'unsupported'; message: string }
  | { status: 'error'; message: string };

type SkillOperationResult = {
  success: boolean;
  message: string;
};

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean(((window as unknown) as Record<string, unknown>).__TAURI_INTERNALS__);
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const cause = stringifyError(error);
    if (cause.startsWith('AGENTS_MD_EXISTS::')) {
      throw new Error(cause);
    }
    throw new Error(`${command}: ${cause}`);
  }
}

async function refreshProviderState() {
  const [providers, universalProviders] = await Promise.all([
    invokeCommand<ProviderRecord[]>('provider_list'),
    invokeCommand<UniversalProviderRecord[]>('universal_provider_list'),
  ]);

  updateState((state) => {
    state.providers = providers;
    state.universalProviders = universalProviders;
  });
}

async function refreshKitState() {
  const [kitPolicies, kitLoadouts, kits] = await Promise.all([
    invokeCommand<KitPolicyRecord[]>('kit_policy_list'),
    invokeCommand<KitLoadoutRecord[]>('kit_loadout_list'),
    invokeCommand<KitRecord[]>('kit_list'),
  ]);

  updateState((state) => {
    state.kitPolicies = kitPolicies;
    state.kitLoadouts = kitLoadouts;
    state.kits = kits;
  });
}

async function refreshConfigState() {
  const config = await invokeCommand<AppConfig>('config_get');
  updateState((state) => {
    state.config = config;
  });
}

async function refreshSkillState() {
  const skills = await invokeCommand<Skill[]>('skill_list');
  updateState((state) => {
    state.skills = skills;
  });
}

export async function hydrateTauriState() {
  if (!isTauriRuntime()) {
    return;
  }

  await Promise.all([
    refreshConfigState(),
    refreshSkillState(),
    refreshProviderState(),
    refreshKitState(),
  ]);
}

export async function actionProviderList(appType?: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const providers = await invokeCommand<ProviderRecord[]>('provider_list',
    appType ? { appType } : undefined
  );

  if (!appType) {
    updateState((state) => {
      state.providers = providers;
    });
  }

  return providers;
}

export async function actionProviderCurrent(appType: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<ProviderRecord | null>('provider_current', { appType });
}

export async function actionProviderGetRaw(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<ProviderRecord>('provider_get_raw', { id });
}

export async function actionProviderAdd(values: {
  appType: string;
  name: string;
  config: unknown;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const provider = await invokeCommand<ProviderRecord>('provider_add', {
    appType: values.appType,
    name: values.name,
    config: values.config as Record<string, unknown>,
  });
  await refreshProviderState();
  return provider;
}

export async function actionProviderUpdate(values: {
  id: string;
  name?: string;
  config?: unknown;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const provider = await invokeCommand<ProviderRecord>('provider_update', {
    id: values.id,
    name: values.name,
    config: values.config as Record<string, unknown> | undefined,
  });
  await refreshProviderState();
  return provider;
}

export async function actionProviderDelete(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const deleted = await invokeCommand<boolean>('provider_delete', { id });
  await refreshProviderState();
  return deleted;
}

export async function actionProviderSwitch(values: { appType: string; providerId: string }) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<SwitchResult>('provider_switch', {
    appType: values.appType,
    providerId: values.providerId,
  });
  await refreshProviderState();
  return result;
}

export async function actionProviderLatestBackup(appType: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<ProviderBackupEntry | null>('provider_latest_backup', { appType });
}

export async function actionProviderRestoreLatestBackup(appType: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<ProviderRecord>('provider_restore_latest_backup', { appType });
  await refreshProviderState();
  return result;
}

export async function actionProviderCaptureLive(values: {
  appType: string;
  name: string;
  profile?: Record<string, unknown>;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<ProviderRecord>('provider_capture_live', {
    appType: values.appType,
    name: values.name,
    profile: values.profile,
  });
  await refreshProviderState();
  return result;
}

export async function actionUniversalProviderList() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const universalProviders = await invokeCommand<UniversalProviderRecord[]>('universal_provider_list');
  updateState((state) => {
    state.universalProviders = universalProviders;
  });
  return universalProviders;
}

export async function actionUniversalProviderGetRaw(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<UniversalProviderRecord>('universal_provider_get_raw', { id });
}

export async function actionUniversalProviderAdd(values: {
  name: string;
  baseUrl: string;
  apiKey: string;
  websiteUrl?: string;
  notes?: string;
  apps?: Partial<UniversalProviderApps>;
  models?: UniversalProviderModels;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<UniversalProviderRecord>('universal_provider_add', {
    name: values.name,
    baseUrl: values.baseUrl,
    apiKey: values.apiKey,
    websiteUrl: values.websiteUrl,
    notes: values.notes,
    apps: values.apps,
    models: values.models,
  });
  await refreshProviderState();
  return result;
}

export async function actionUniversalProviderUpdate(values: {
  id: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  websiteUrl?: string;
  notes?: string;
  apps?: Partial<UniversalProviderApps>;
  models?: UniversalProviderModels;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<UniversalProviderRecord>('universal_provider_update', {
    id: values.id,
    name: values.name,
    baseUrl: values.baseUrl,
    apiKey: values.apiKey,
    websiteUrl: values.websiteUrl,
    notes: values.notes,
    apps: values.apps,
    models: values.models,
  });
  await refreshProviderState();
  return result;
}

export async function actionUniversalProviderDelete(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const deleted = await invokeCommand<boolean>('universal_provider_delete', { id });
  await refreshProviderState();
  return deleted;
}

export async function actionUniversalProviderApply(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const applied = await invokeCommand<ProviderRecord[]>('universal_provider_apply', { id });
  await refreshProviderState();
  return applied;
}

export async function actionKitPolicyList() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const kitPolicies = await invokeCommand<KitPolicyRecord[]>('kit_policy_list');
  updateState((state) => {
    state.kitPolicies = kitPolicies;
  });
  return kitPolicies;
}

export async function actionKitPolicyAdd(values: {
  name: string;
  description?: string;
  content: string;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const policy = await invokeCommand<KitPolicyRecord>('kit_policy_add', {
    name: values.name,
    description: values.description,
    content: values.content,
  });
  await refreshKitState();
  return policy;
}

export async function actionKitPolicyUpdate(values: {
  id: string;
  name?: string;
  description?: string;
  content?: string;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const policy = await invokeCommand<KitPolicyRecord>('kit_policy_update', {
    id: values.id,
    name: values.name,
    description: values.description,
    content: values.content,
  });
  await refreshKitState();
  return policy;
}

export async function actionKitPolicyDelete(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const deleted = await invokeCommand<boolean>('kit_policy_delete', { id });
  await refreshKitState();
  return deleted;
}

export async function actionKitPolicyResolveGithub(url: string) {
  return resolveAgentsFromGithub(url);
}

export async function actionKitLoadoutList() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const kitLoadouts = await invokeCommand<KitLoadoutRecord[]>('kit_loadout_list');
  updateState((state) => {
    state.kitLoadouts = kitLoadouts;
  });
  return kitLoadouts;
}

export async function actionKitLoadoutAdd(values: {
  name: string;
  description?: string;
  items: Array<{ skillPath: string; mode?: KitSyncMode; sortOrder?: number }>;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const loadout = await invokeCommand<KitLoadoutRecord>('kit_loadout_add', {
    name: values.name,
    description: values.description,
    items: values.items,
  });
  await refreshKitState();
  return loadout;
}

export async function actionKitLoadoutUpdate(values: {
  id: string;
  name?: string;
  description?: string;
  items?: Array<{ skillPath: string; mode?: KitSyncMode; sortOrder?: number }>;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const loadout = await invokeCommand<KitLoadoutRecord>('kit_loadout_update', {
    id: values.id,
    name: values.name,
    description: values.description,
    items: values.items,
  });
  await refreshKitState();
  return loadout;
}

export async function actionKitLoadoutDelete(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const deleted = await invokeCommand<boolean>('kit_loadout_delete', { id });
  await refreshKitState();
  return deleted;
}

export async function actionKitList() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const kits = await invokeCommand<KitRecord[]>('kit_list');
  updateState((state) => {
    state.kits = kits;
  });
  return kits;
}

export async function actionKitAdd(values: {
  name: string;
  description?: string;
  policyId: string;
  loadoutId: string;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const kit = await invokeCommand<KitRecord>('kit_add', {
    name: values.name,
    description: values.description,
    policyId: values.policyId,
    loadoutId: values.loadoutId,
  });
  await refreshKitState();
  return kit;
}

export async function actionKitUpdate(values: {
  id: string;
  name?: string;
  description?: string;
  policyId?: string;
  loadoutId?: string;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const kit = await invokeCommand<KitRecord>('kit_update', {
    id: values.id,
    name: values.name,
    description: values.description,
    policyId: values.policyId,
    loadoutId: values.loadoutId,
  });
  await refreshKitState();
  return kit;
}

export async function actionKitDelete(id: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const deleted = await invokeCommand<boolean>('kit_delete', { id });
  await refreshKitState();
  return deleted;
}

export async function actionKitApply(values: {
  kitId: string;
  projectPath: string;
  agentName: string;
  mode?: KitSyncMode;
  overwriteAgentsMd?: boolean;
}) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<KitApplyResult>('kit_apply', {
    kitId: values.kitId,
    projectPath: values.projectPath,
    agentName: values.agentName,
    mode: values.mode,
    overwriteAgentsMd: values.overwriteAgentsMd,
  });
  await Promise.all([refreshKitState(), refreshSkillState()]);
  return result;
}

export async function actionSyncSkill(
  source: string,
  destParent: string,
  syncMode?: 'copy' | 'link'
) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<string>('skill_sync', {
    sourcePath: source,
    destParent,
    syncMode,
  });
  await refreshSkillState();
}

export async function actionCollectToHub(sourcePath: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<string>('skill_collect_to_hub', { sourcePath });
  await refreshSkillState();
}

export async function actionDeleteSkill(path: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<boolean>('skill_delete', { path });
  await refreshSkillState();
}

export async function actionAddProject(projectPath: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<string>('project_add', { projectPath });
  await Promise.all([refreshConfigState(), refreshSkillState()]);
}

export async function actionRemoveProject(projectPath: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<boolean>('project_remove', { projectPath });
  await Promise.all([refreshConfigState(), refreshSkillState()]);
}

export async function actionAddScanRoot(rootPath: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<string>('scan_root_add', { rootPath });
  await refreshConfigState();
}

export async function actionRemoveScanRoot(rootPath: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<boolean>('scan_root_remove', { rootPath });
  await refreshConfigState();
}

export async function actionScanProjects() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<string[]>('scan_projects');
}

export async function actionAddScannedProjects(projectPaths: string[]) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const addedCount = await invokeCommand<number>('scanned_projects_add', { projectPaths });
  await Promise.all([refreshConfigState(), refreshSkillState()]);
  return addedCount;
}

export async function actionScanAndAddProjects() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const addedCount = await invokeCommand<number>('scan_and_add_projects');
  await Promise.all([refreshConfigState(), refreshSkillState()]);
  return addedCount;
}

export async function actionPickDirectory(
  options?: PickDirectoryOptions
): Promise<PickDirectoryResult> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  try {
    const selected = await openDirectoryDialog({
      directory: true,
      multiple: false,
      title: options?.title,
      defaultPath: options?.initialPath,
    });

    if (!selected) {
      return { status: 'cancelled' };
    }

    const selectedPath = Array.isArray(selected) ? selected[0] : selected;
    if (!selectedPath) {
      return { status: 'cancelled' };
    }

    return { status: 'selected', path: selectedPath };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to open directory picker: ${stringifyError(error)}`,
    };
  }
}

export async function actionUpdateAgentConfig(agent: AgentConfig) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<void>('agent_config_update', { agent });
  await Promise.all([refreshConfigState(), refreshSkillState()]);
}

export async function actionRemoveAgentConfig(agentName: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  await invokeCommand<boolean>('agent_config_remove', { agentName });
  await Promise.all([refreshConfigState(), refreshSkillState()]);
}

export async function actionGetSkillContent(path: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<{ content: string; metadata: Record<string, string> }>('skill_get_content', {
    path,
  });
}

export async function actionOpenExternal(url: string) {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  return invokeCommand<boolean>('open_external_url', { url });
}

export async function actionImportSkill(url: string): Promise<SkillOperationResult> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<SkillOperationResult>('skill_import', { url });
  await refreshSkillState();
  return result;
}

export async function actionCreateSkill(values: {
  name: string;
  description: string;
  content: string;
}): Promise<SkillOperationResult> {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is required.');
  }

  const result = await invokeCommand<SkillOperationResult>('skill_create', {
    name: values.name,
    description: values.description,
    content: values.content,
  });
  await refreshSkillState();
  return result;
}
