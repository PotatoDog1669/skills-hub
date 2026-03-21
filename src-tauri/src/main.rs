#![allow(non_snake_case)]

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use serde_yaml::Value as YamlValue;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, State};

const TRAY_ICON_ID: &str = "skills-hub-tray";
const TRAY_MENU_SWITCH_PROVIDER: &str = "tray-switch-provider";
const TRAY_MENU_OPEN: &str = "tray-open-main";
const TRAY_MENU_QUIT: &str = "tray-quit-app";
const TRAY_MENU_PROVIDER_SWITCH_PREFIX: &str = "tray-provider-switch::";
const TRAY_MENU_PROVIDER_EMPTY_PREFIX: &str = "tray-provider-empty::";
static APP_IS_EXITING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
enum AppType {
  Claude,
  Codex,
  Gemini,
}

impl AppType {
  fn parse(raw: &str) -> Result<Self, String> {
    match raw {
      "claude" => Ok(Self::Claude),
      "codex" => Ok(Self::Codex),
      "gemini" => Ok(Self::Gemini),
      _ => Err(format!("Unsupported app type: {}", raw)),
    }
  }

  fn as_str(&self) -> &'static str {
    match self {
      Self::Claude => "claude",
      Self::Codex => "codex",
      Self::Gemini => "gemini",
    }
  }

  fn label(&self) -> &'static str {
    match self {
      Self::Claude => "Claude",
      Self::Codex => "Codex",
      Self::Gemini => "Gemini",
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum SkillLocation {
  Hub,
  Agent,
  Project,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum KitSyncMode {
  Copy,
  Link,
}

impl KitSyncMode {
  fn parse(raw: &str) -> Result<Self, String> {
    match raw {
      "copy" => Ok(Self::Copy),
      "link" => Ok(Self::Link),
      _ => Err(format!("Unsupported sync mode: {}", raw)),
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ApplyStatus {
  Success,
  Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AgentConfig {
  name: String,
  global_path: String,
  project_path: String,
  instruction_file_name: Option<String>,
  enabled: bool,
  is_custom: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
  hub_path: String,
  projects: Vec<String>,
  scan_roots: Vec<String>,
  agents: Vec<AgentConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Skill {
  id: String,
  name: String,
  description: String,
  path: String,
  location: SkillLocation,
  agent_name: Option<String>,
  project_name: Option<String>,
  project_path: Option<String>,
  #[serde(default = "default_true")]
  enabled: bool,
  source_package_id: Option<String>,
  source_package_name: Option<String>,
  source_kit_id: Option<String>,
  source_kit_name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderRecord {
  id: String,
  app_type: AppType,
  name: String,
  config: Value,
  is_current: bool,
  created_at: i64,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
  model: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UniversalProviderApps {
  claude: bool,
  codex: bool,
  gemini: bool,
}

impl UniversalProviderApps {
  fn with_defaults(input: Option<Self>) -> Self {
    input.unwrap_or(Self {
      claude: true,
      codex: true,
      gemini: true,
    })
  }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UniversalProviderModels {
  claude: Option<ModelConfig>,
  codex: Option<ModelConfig>,
  gemini: Option<ModelConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UniversalProviderRecord {
  id: String,
  name: String,
  base_url: String,
  api_key: String,
  website_url: Option<String>,
  notes: Option<String>,
  apps: UniversalProviderApps,
  models: UniversalProviderModels,
  created_at: i64,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderBackupEntry {
  backup_id: i64,
  provider: ProviderRecord,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchResult {
  app_type: AppType,
  current_provider_id: String,
  backup_id: i64,
  switched_from: Option<String>,
  switched_to: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitLoadoutItem {
  skill_path: String,
  mode: KitSyncMode,
  sort_order: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitLoadoutRecord {
  id: String,
  name: String,
  description: Option<String>,
  items: Vec<KitLoadoutItem>,
  #[serde(default)]
  import_source: Option<KitLoadoutImportSource>,
  created_at: i64,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct KitLoadoutImportSource {
  repo_web_url: String,
  repo_url: String,
  original_url: String,
  branch: Option<String>,
  root_subdir: String,
  imported_at: String,
  last_source_updated_at: String,
  #[serde(default)]
  last_safety_check: Option<KitSafetyCheck>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct KitSafetyCheck {
  checked_at: i64,
  status: String,
  scanned_files: i64,
  warnings: Vec<String>,
  flagged_files: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitPolicyRecord {
  id: String,
  name: String,
  description: Option<String>,
  content: String,
  created_at: i64,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitApplyTarget {
  project_path: String,
  agent_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitRecord {
  id: String,
  name: String,
  description: Option<String>,
  policy_id: Option<String>,
  loadout_id: Option<String>,
  #[serde(default)]
  managed_source: Option<ManagedKitSource>,
  last_applied_at: Option<i64>,
  last_applied_target: Option<KitApplyTarget>,
  created_at: i64,
  updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedKitPolicyBaseline {
  id: String,
  name: String,
  description: Option<String>,
  content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedKitLoadoutBaseline {
  id: String,
  name: String,
  description: Option<String>,
  items: Vec<KitLoadoutItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedKitBaseline {
  name: String,
  description: Option<String>,
  policy: ManagedKitPolicyBaseline,
  loadout: ManagedKitLoadoutBaseline,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedKitSecurityCheck {
  source_id: String,
  source_name: String,
  check: KitSafetyCheck,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedKitSource {
  kind: String,
  preset_id: String,
  preset_name: String,
  catalog_version: i64,
  installed_at: i64,
  last_restored_at: Option<i64>,
  restore_count: i64,
  baseline: ManagedKitBaseline,
  #[serde(default)]
  security_checks: Vec<ManagedKitSecurityCheck>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitApplySkillResult {
  skill_path: String,
  mode: KitSyncMode,
  destination: String,
  status: ApplyStatus,
  error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitApplyResult {
  kit_id: String,
  kit_name: String,
  policy_path: Option<String>,
  policy_file_name: Option<String>,
  project_path: String,
  agent_name: String,
  applied_at: i64,
  overwrote_agents_md: Option<bool>,
  loadout_results: Vec<KitApplySkillResult>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitLoadoutImportResult {
  loadout: KitLoadoutRecord,
  loadout_status: String,
  imported_skill_paths: Vec<String>,
  overwritten_count: i64,
  removed_count: i64,
  discovered_count: i64,
  source: KitLoadoutImportSource,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetPolicy {
  name: String,
  description: Option<String>,
  template: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetSource {
  id: String,
  name: String,
  url: String,
  description: Option<String>,
  #[serde(default)]
  selected_skill_details: Vec<OfficialPresetSkillDetail>,
  selected_skills: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetSkillDetail {
  name: String,
  description: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetRecord {
  id: String,
  name: String,
  description: Option<String>,
  policy: OfficialPresetPolicy,
  sources: Vec<OfficialPresetSource>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetCatalog {
  version: i64,
  presets: Vec<OfficialPresetRecord>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetSummary {
  id: String,
  name: String,
  description: Option<String>,
  policy_name: String,
  source_count: i64,
  skill_count: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetInstallSource {
  id: String,
  name: String,
  loadout_id: String,
  imported_skill_count: i64,
  selected_skill_count: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetInstallResult {
  preset: OfficialPresetSummaryLite,
  policy: KitPolicyRecord,
  loadout: KitLoadoutRecord,
  kit: KitRecord,
  imported_sources: Vec<OfficialPresetInstallSource>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetBatchInstallResult {
  installed: Vec<OfficialPresetInstallResult>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OfficialPresetSummaryLite {
  id: String,
  name: String,
  description: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillDocument {
  metadata: HashMap<String, String>,
  content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillOperationResult {
  success: bool,
  message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopState {
  config: AppConfig,
  skills: Vec<Skill>,
  providers: Vec<ProviderRecord>,
  universal_providers: Vec<UniversalProviderRecord>,
  kit_policies: Vec<KitPolicyRecord>,
  kit_loadouts: Vec<KitLoadoutRecord>,
  kits: Vec<KitRecord>,
  provider_backups: HashMap<String, Vec<ProviderBackupEntry>>,
  skill_documents: HashMap<String, SkillDocument>,
  agents_md_applied: HashMap<String, bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KitLoadoutItemInput {
  skill_path: String,
  mode: Option<String>,
  sort_order: Option<i64>,
}

struct SharedState {
  state: Mutex<DesktopState>,
  counter: AtomicU64,
  state_path: PathBuf,
}

struct SkillWatcherControl {
  tx: Mutex<Sender<SkillWatchMessage>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SkillWatchMessage {
  Refresh,
  Reconfigure,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SkillWatchTarget {
  path: PathBuf,
  recursive_mode: RecursiveMode,
}

impl SharedState {
  fn new() -> Self {
    let state_path = Self::state_file_path();
    let loaded_state = Self::load_state(&state_path);
    let mut state = loaded_state.clone().unwrap_or_else(seed_state);
    let merged_config = merge_config_with_default_agents(state.config.clone());
    let config_was_migrated = state.config != merged_config;
    state.config = merged_config;
    let removed_unused_official_sources = prune_unused_official_source_loadouts(&mut state);
    refresh_skills_in_state(&mut state);

    let shared_state = Self {
      state: Mutex::new(state),
      counter: AtomicU64::new(now_millis().max(1) as u64),
      state_path,
    };

    if loaded_state.is_none() || config_was_migrated || removed_unused_official_sources > 0 {
      let guard = shared_state.state.lock();
      if let Ok(snapshot) = guard {
        let _ = shared_state.persist(&snapshot);
      }
    }

    shared_state
  }

  fn next_id(&self, prefix: &str) -> String {
    let seq = self.counter.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, now_millis(), seq)
  }

  fn state_file_path() -> PathBuf {
    let mut path = home_dir_path().unwrap_or_else(|| PathBuf::from("."));
    path.push(".skills-hub");
    path.push("desktop-state.json");
    path
  }

  fn load_state(path: &Path) -> Option<DesktopState> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<DesktopState>(&content).ok()
  }

  fn persist(&self, state_snapshot: &DesktopState) -> Result<(), String> {
    if let Some(parent) = self.state_path.parent() {
      fs::create_dir_all(parent).map_err(|error| {
        format!(
          "Failed to create state directory {}: {}",
          parent.display(),
          error
        )
      })?;
    }

    let content = serde_json::to_string_pretty(state_snapshot)
      .map_err(|error| format!("Failed to serialize desktop state: {}", error))?;
    fs::write(&self.state_path, content).map_err(|error| {
      format!(
        "Failed to write desktop state {}: {}",
        self.state_path.display(),
        error
      )
    })?;

    Ok(())
  }

  fn clone_config(&self) -> Result<AppConfig, String> {
    let guard = self
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    Ok(guard.config.clone())
  }

  fn refresh_skills_from_disk(&self) -> Result<bool, String> {
    let (config, loadouts, kits) = {
      let guard = self
        .state
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;
      (
        guard.config.clone(),
        guard.kit_loadouts.clone(),
        guard.kits.clone(),
      )
    };
    let next_skills = collect_all_skills(&config, &loadouts, &kits);

    let mut guard = self
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    if guard.skills == next_skills {
      return Ok(false);
    }

    guard.skills = next_skills;
    let snapshot = guard.clone();
    drop(guard);
    self.persist(&snapshot)?;
    Ok(true)
  }
}

impl SkillWatcherControl {
  fn new(tx: Sender<SkillWatchMessage>) -> Self {
    Self { tx: Mutex::new(tx) }
  }

  fn send(&self, message: SkillWatchMessage) {
    let Ok(guard) = self.tx.lock() else {
      return;
    };
    let _ = guard.send(message);
  }
}

#[derive(Serialize)]
struct HealthResponse {
  status: String,
}

#[derive(Serialize)]
struct VersionResponse {
  version: String,
}

fn now_millis() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis() as i64)
    .unwrap_or(0)
}

fn default_true() -> bool {
  true
}

fn normalize_path(raw: &str) -> String {
  let mut value = raw.replace('\\', "/").trim().to_string();
  while value.ends_with('/') {
    value.pop();
  }
  if value.is_empty() {
    "/".to_string()
  } else {
    value
  }
}

fn normalize_relative_path(raw: &str) -> String {
  raw
    .replace('\\', "/")
    .trim()
    .trim_matches('/')
    .to_string()
}

fn path_tail(raw: &str) -> String {
  normalize_path(raw)
    .split('/')
    .filter(|entry| !entry.is_empty())
    .last()
    .map(|entry| entry.to_string())
    .unwrap_or_else(|| raw.to_string())
}

fn merge_agent_lists_preserving_order(existing_agents: Vec<AgentConfig>) -> Vec<AgentConfig> {
  let default_agents = default_agents();
  let default_agents_by_name = default_agents
    .iter()
    .map(|agent| (agent.name.clone(), agent.clone()))
    .collect::<HashMap<_, _>>();
  let mut seen_agent_names = HashSet::new();
  let mut merged_agents = Vec::new();

  for existing_agent in existing_agents.into_iter() {
    if !seen_agent_names.insert(existing_agent.name.clone()) {
      continue;
    }

    if let Some(default_agent) = default_agents_by_name.get(&existing_agent.name) {
      merged_agents.push(AgentConfig {
        name: default_agent.name.clone(),
        global_path: normalize_path(&existing_agent.global_path),
        project_path: normalize_relative_path(&existing_agent.project_path),
        instruction_file_name: Some(agent_instruction_file_name(&existing_agent)),
        enabled: existing_agent.enabled,
        is_custom: default_agent.is_custom,
      });
      continue;
    }

    if existing_agent.is_custom {
      merged_agents.push(AgentConfig {
        instruction_file_name: Some(agent_instruction_file_name(&existing_agent)),
        name: existing_agent.name,
        global_path: normalize_path(&existing_agent.global_path),
        project_path: normalize_relative_path(&existing_agent.project_path),
        enabled: existing_agent.enabled,
        is_custom: true,
      });
    }
  }

  for default_agent in default_agents.into_iter() {
    if seen_agent_names.contains(&default_agent.name) {
      continue;
    }
    merged_agents.push(default_agent);
  }

  merged_agents
}

fn merge_config_with_default_agents(config: AppConfig) -> AppConfig {
  AppConfig {
    hub_path: normalize_path(&config.hub_path),
    projects: config
      .projects
      .into_iter()
      .map(|project| normalize_path(&project))
      .collect(),
    scan_roots: config
      .scan_roots
      .into_iter()
      .map(|scan_root| normalize_path(&scan_root))
      .collect(),
    agents: merge_agent_lists_preserving_order(config.agents),
  }
}

fn reorder_projects(current_projects: &[String], next_projects: &[String]) -> Result<Vec<String>, String> {
  let normalized_current = current_projects
    .iter()
    .map(|project| normalize_path(project))
    .collect::<Vec<_>>();
  let normalized_next = next_projects
    .iter()
    .map(|project| normalize_path(project))
    .collect::<Vec<_>>();

  if normalized_current.len() != normalized_next.len() {
    return Err("Project reorder payload is out of date.".to_string());
  }

  let current_set = normalized_current.iter().cloned().collect::<HashSet<_>>();
  let next_set = normalized_next.iter().cloned().collect::<HashSet<_>>();
  if current_set != next_set || next_set.len() != normalized_next.len() {
    return Err("Project reorder payload must include each existing project exactly once.".to_string());
  }

  Ok(normalized_next)
}

fn reorder_enabled_agents(
  current_agents: &[AgentConfig],
  ordered_enabled_names: &[String],
) -> Result<Vec<AgentConfig>, String> {
  let current_enabled_names = current_agents
    .iter()
    .filter(|agent| agent.enabled)
    .map(|agent| agent.name.clone())
    .collect::<Vec<_>>();
  let next_enabled_names = ordered_enabled_names
    .iter()
    .map(|name| name.trim().to_string())
    .collect::<Vec<_>>();

  if current_enabled_names.len() != next_enabled_names.len() {
    return Err("Agent reorder payload is out of date.".to_string());
  }

  let current_set = current_enabled_names.iter().cloned().collect::<HashSet<_>>();
  let next_set = next_enabled_names.iter().cloned().collect::<HashSet<_>>();
  if current_set != next_set || next_set.len() != next_enabled_names.len() {
    return Err("Agent reorder payload must include each enabled agent exactly once.".to_string());
  }

  let next_positions = next_enabled_names
    .iter()
    .enumerate()
    .map(|(index, name)| (name.clone(), index))
    .collect::<HashMap<_, _>>();
  let mut reordered_enabled_agents = current_agents
    .iter()
    .filter(|agent| agent.enabled)
    .cloned()
    .collect::<Vec<_>>();
  reordered_enabled_agents.sort_by_key(|agent| next_positions.get(&agent.name).copied().unwrap_or(usize::MAX));

  let mut enabled_iter = reordered_enabled_agents.into_iter();
  Ok(current_agents
    .iter()
    .map(|agent| {
      if agent.enabled {
        enabled_iter.next().unwrap_or_else(|| agent.clone())
      } else {
        agent.clone()
      }
    })
    .collect())
}

fn path_tail_relative(raw: &str) -> String {
  normalize_relative_path(raw)
    .split('/')
    .filter(|entry| !entry.is_empty())
    .last()
    .map(|entry| entry.to_string())
    .unwrap_or_else(|| raw.to_string())
}

fn optional_trim(value: Option<String>) -> Option<String> {
  value.and_then(|entry| {
    let trimmed = entry.trim().to_string();
    if trimmed.is_empty() {
      None
    } else {
      Some(trimmed)
    }
  })
}

#[derive(Clone, Debug, Default)]
struct SkillSummary {
  name: String,
  description: String,
  project_relative_path: Option<String>,
  source_package_id: Option<String>,
  source_package_name: Option<String>,
  source_kit_id: Option<String>,
  source_kit_name: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct SkillProvenance {
  source_package_id: Option<String>,
  source_package_name: Option<String>,
  source_kit_id: Option<String>,
  source_kit_name: Option<String>,
}

fn official_preset_catalog() -> Result<OfficialPresetCatalog, String> {
  serde_json::from_str(include_str!("../../data/official-presets/catalog.json"))
    .map_err(|error| format!("Failed to parse official preset catalog: {}", error))
}

fn official_policy_template_content(template: &str) -> Result<&'static str, String> {
  match template {
    "policies/policy-nextjs-ts-strict.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-nextjs-ts-strict.md"
    )),
    "policies/policy-node-api-ts.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-node-api-ts.md"
    )),
    "policies/policy-scientific-python.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-scientific-python.md"
    )),
    "policies/policy-monorepo-turbo.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-monorepo-turbo.md"
    )),
    "policies/policy-fastapi-py.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-fastapi-py.md"
    )),
    "policies/policy-go-service.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-go-service.md"
    )),
    "policies/policy-release-maintainer.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-release-maintainer.md"
    )),
    "policies/policy-fullstack-web.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-fullstack-web.md"
    )),
    "policies/policy-web-frontend.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-web-frontend.md"
    )),
    "policies/policy-python-api.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-python-api.md"
    )),
    "policies/policy-langchain-apps.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-langchain-apps.md"
    )),
    "policies/policy-hf-ml.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-hf-ml.md"
    )),
    "policies/policy-literature-review.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-literature-review.md"
    )),
    "policies/policy-scientific-discovery.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-scientific-discovery.md"
    )),
    "policies/policy-security-audit.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-security-audit.md"
    )),
    "policies/policy-release-ci.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-release-ci.md"
    )),
    "policies/policy-cloudflare-edge.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-cloudflare-edge.md"
    )),
    "policies/policy-azure-cloud.md" => Ok(include_str!(
      "../../data/official-presets/policies/policy-azure-cloud.md"
    )),
    _ => Err(format!("Unsupported official policy template: {}", template)),
  }
}

fn build_official_source_loadout_name(preset_name: &str, source_name: &str) -> String {
  format!("Official Source: {} / {}", preset_name, source_name)
}

fn build_official_curated_loadout_name(preset_name: &str) -> String {
  format!("Official: {}", preset_name)
}

fn build_official_kit_name(preset_name: &str) -> String {
  format!("Official: {}", preset_name)
}

fn is_official_source_loadout_name(name: &str) -> bool {
  name.trim().starts_with("Official Source: ")
}

fn prune_unused_official_source_loadouts(state: &mut DesktopState) -> usize {
  let referenced_loadout_ids = state
    .kits
    .iter()
    .filter_map(|kit| kit.loadout_id.as_deref())
    .collect::<HashSet<_>>();
  let before = state.kit_loadouts.len();
  state.kit_loadouts.retain(|loadout| {
    !is_official_source_loadout_name(&loadout.name)
      || referenced_loadout_ids.contains(loadout.id.as_str())
  });
  before.saturating_sub(state.kit_loadouts.len())
}

fn build_official_source_import_key(source: &OfficialPresetSource) -> Result<String, String> {
  let parsed = parse_skill_import_url(&source.url)?;
  Ok(build_loadout_import_source_key(
    &parsed.repo_web_url,
    parsed.subdir.as_deref().unwrap_or("/"),
  ))
}

fn extend_official_source_selection(
  selection_map: &mut HashMap<String, HashSet<String>>,
  preset: &OfficialPresetRecord,
) -> Result<(), String> {
  for source in preset.sources.iter() {
    let source_key = build_official_source_import_key(source)?;
    let selected = selection_map.entry(source_key).or_default();
    for skill_name in source.selected_skills.iter() {
      selected.insert(skill_name.clone());
    }
  }

  Ok(())
}

fn build_official_source_selection_plan(
  catalog: &OfficialPresetCatalog,
  kits: &[KitRecord],
  current_preset: &OfficialPresetRecord,
) -> Result<HashMap<String, HashSet<String>>, String> {
  let mut selection_map = HashMap::<String, HashSet<String>>::new();
  let preset_by_id = catalog
    .presets
    .iter()
    .map(|preset| (preset.id.clone(), preset))
    .collect::<HashMap<_, _>>();

  for kit in kits.iter() {
    let Some(managed_source) = kit.managed_source.as_ref() else {
      continue;
    };
    if managed_source.kind != "official_preset" || managed_source.preset_id == current_preset.id {
      continue;
    }

    let Some(installed_preset) = preset_by_id.get(&managed_source.preset_id) else {
      continue;
    };
    extend_official_source_selection(&mut selection_map, installed_preset)?;
  }

  extend_official_source_selection(&mut selection_map, current_preset)?;
  Ok(selection_map)
}

fn build_official_managed_source(
  preset: &OfficialPresetRecord,
  catalog_version: i64,
  policy: &KitPolicyRecord,
  loadout: &KitLoadoutRecord,
  imported_sources: &[(OfficialPresetSource, KitLoadoutRecord)],
) -> ManagedKitSource {
  ManagedKitSource {
    kind: "official_preset".to_string(),
    preset_id: preset.id.clone(),
    preset_name: preset.name.clone(),
    catalog_version,
    installed_at: now_millis(),
    last_restored_at: None,
    restore_count: 0,
    baseline: ManagedKitBaseline {
      name: build_official_kit_name(&preset.name),
      description: preset.description.clone(),
      policy: ManagedKitPolicyBaseline {
        id: policy.id.clone(),
        name: policy.name.clone(),
        description: policy.description.clone(),
        content: policy.content.clone(),
      },
      loadout: ManagedKitLoadoutBaseline {
        id: loadout.id.clone(),
        name: loadout.name.clone(),
        description: loadout.description.clone(),
        items: loadout.items.clone(),
      },
    },
    security_checks: imported_sources
      .iter()
      .filter_map(|(source, loadout)| {
        loadout
          .import_source
          .as_ref()
          .and_then(|import_source| import_source.last_safety_check.clone())
          .map(|check| ManagedKitSecurityCheck {
            source_id: source.id.clone(),
            source_name: source.name.clone(),
            check,
          })
      })
      .collect(),
  }
}

fn find_kit_policy_by_name<'a>(
  policies: &'a [KitPolicyRecord],
  name: &str,
) -> Option<&'a KitPolicyRecord> {
  policies.iter().find(|policy| policy.name == name)
}

fn find_kit_loadout_by_name<'a>(
  loadouts: &'a [KitLoadoutRecord],
  name: &str,
) -> Option<&'a KitLoadoutRecord> {
  loadouts.iter().find(|loadout| loadout.name == name)
}

fn find_kit_by_name<'a>(kits: &'a [KitRecord], name: &str) -> Option<&'a KitRecord> {
  kits.iter().find(|kit| kit.name == name)
}

fn official_preset_skill_count(preset: &OfficialPresetRecord) -> i64 {
  preset
    .sources
    .iter()
    .map(|source| source.selected_skills.len() as i64)
    .sum()
}

fn managed_official_presets_need_install(state: &SharedState) -> Result<bool, String> {
  let catalog = official_preset_catalog()?;
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  for preset in catalog.presets.iter() {
    let has_current = state_guard.kits.iter().any(|kit| {
      kit.managed_source
        .as_ref()
        .map(|source| {
          source.kind == "official_preset"
            && source.preset_id == preset.id
            && source.catalog_version >= catalog.version
        })
        .unwrap_or(false)
    });

    if !has_current {
      return Ok(true);
    }
  }

  Ok(false)
}

fn official_preset_to_summary(preset: &OfficialPresetRecord) -> OfficialPresetSummary {
  OfficialPresetSummary {
    id: preset.id.clone(),
    name: preset.name.clone(),
    description: preset.description.clone(),
    policy_name: preset.policy.name.clone(),
    source_count: preset.sources.len() as i64,
    skill_count: official_preset_skill_count(preset),
  }
}

fn skill_selector_candidates(skill_path: &str) -> HashSet<String> {
  let normalized = normalize_path(skill_path);
  let tail = path_tail_relative(&normalized);
  HashSet::from([normalized, tail])
}

fn resolve_hub_skill_path(hub_path: &str, selector: &str) -> Result<String, String> {
  let trimmed = selector.trim();
  if trimmed.is_empty() {
    return Err("Skill selector cannot be empty.".to_string());
  }

  let normalized_selector = normalize_path(trimmed);
  let normalized_selector_path = PathBuf::from(&normalized_selector);
  if path_exists_or_symlink(&normalized_selector_path) {
    return Ok(normalized_selector);
  }

  let candidate_in_hub = Path::new(hub_path).join(trimmed);
  if path_exists_or_symlink(&candidate_in_hub) {
    return Ok(normalize_path(candidate_in_hub.to_string_lossy().as_ref()));
  }

  Err(format!("Skill not found in hub: {}", selector))
}

fn build_effective_loadout_items(
  loadout_items: &[KitLoadoutItem],
  include_skill_paths: &[String],
  exclude_selectors: &[String],
) -> Vec<KitLoadoutItem> {
  let normalized_excludes = exclude_selectors
    .iter()
    .map(|entry| normalize_path(entry))
    .collect::<HashSet<_>>();

  let mut effective_items = Vec::new();
  let mut seen_paths = HashSet::new();

  for item in loadout_items.iter() {
    let candidates = skill_selector_candidates(&item.skill_path);
    if normalized_excludes.iter().any(|selector| candidates.contains(selector)) {
      continue;
    }

    let normalized_path = normalize_path(&item.skill_path);
    if seen_paths.contains(&normalized_path) {
      continue;
    }

    effective_items.push(KitLoadoutItem {
      skill_path: item.skill_path.clone(),
      mode: item.mode.clone(),
      sort_order: effective_items.len() as i64,
    });
    seen_paths.insert(normalized_path);
  }

  for skill_path in include_skill_paths.iter() {
    let normalized_path = normalize_path(skill_path);
    if seen_paths.contains(&normalized_path) {
      continue;
    }

    effective_items.push(KitLoadoutItem {
      skill_path: normalized_path.clone(),
      mode: KitSyncMode::Copy,
      sort_order: effective_items.len() as i64,
    });
    seen_paths.insert(normalized_path);
  }

  effective_items
}

fn profile_universal_id(provider: &ProviderRecord) -> Option<String> {
  provider
    .config
    .get("_profile")
    .and_then(|profile| profile.get("universalId"))
    .and_then(|id| id.as_str())
    .map(|id| id.to_string())
}

fn home_dir_path() -> Option<PathBuf> {
  std::env::var_os("HOME")
    .or_else(|| std::env::var_os("USERPROFILE"))
    .map(PathBuf::from)
}

fn is_git_repo_root(dir: &Path) -> bool {
  let git_path = dir.join(".git");
  match fs::symlink_metadata(git_path) {
    Ok(metadata) => metadata.is_dir() || metadata.is_file(),
    Err(_) => false,
  }
}

fn is_inside_git_work_tree(path: &Path) -> bool {
  if !path.exists() {
    return false;
  }

  let mut current = path.to_path_buf();
  loop {
    if is_git_repo_root(&current) {
      return true;
    }
    if !current.pop() {
      break;
    }
  }

  false
}

fn should_skip_scan_dir(name: &str) -> bool {
  if name.starts_with('.') {
    return true;
  }

  matches!(name, "node_modules" | "dist" | "build" | "out")
}

fn scan_projects_from_roots(scan_roots: &[String], existing_projects: &[String]) -> Vec<String> {
  const MAX_DEPTH: usize = 5;

  let existing = existing_projects
    .iter()
    .map(|entry| normalize_path(entry))
    .collect::<HashSet<_>>();
  let home_dir = home_dir_path().map(|path| normalize_path(path.to_string_lossy().as_ref()));

  let mut found = HashSet::new();
  let mut stack = scan_roots
    .iter()
    .map(|root| (PathBuf::from(normalize_path(root)), 0usize))
    .collect::<Vec<_>>();

  while let Some((dir, depth)) = stack.pop() {
    if depth > MAX_DEPTH || !dir.exists() {
      continue;
    }

    let normalized_dir = normalize_path(dir.to_string_lossy().as_ref());
    if home_dir.as_deref() == Some(normalized_dir.as_str()) {
      continue;
    }

    if is_git_repo_root(&dir) && !existing.contains(&normalized_dir) {
      found.insert(normalized_dir.clone());
    }

    let entries = match fs::read_dir(&dir) {
      Ok(entries) => entries,
      Err(_) => continue,
    };

    for entry in entries.flatten() {
      let file_type = match entry.file_type() {
        Ok(file_type) => file_type,
        Err(_) => continue,
      };
      if !(file_type.is_dir() || file_type.is_symlink()) {
        continue;
      }

      let file_name = entry.file_name();
      let name = match file_name.to_str() {
        Some(name) => name,
        None => continue,
      };
      if should_skip_scan_dir(name) {
        continue;
      }

      stack.push((entry.path(), depth + 1));
    }
  }

  let mut result = found.into_iter().collect::<Vec<_>>();
  result.sort();
  result
}

fn join_home_path(relative: &str) -> String {
  let relative_path = relative.trim_start_matches('/').trim_start_matches('\\');
  match home_dir_path() {
    Some(home_path) => normalize_path(
      home_path
        .join(relative_path)
        .to_string_lossy()
        .as_ref(),
    ),
    None => normalize_path(&format!("/{}", relative_path)),
  }
}

fn home_relative_path(relative: &str) -> PathBuf {
  let relative_path = relative.trim_start_matches('/').trim_start_matches('\\');
  match home_dir_path() {
    Some(home_path) => home_path.join(relative_path),
    None => PathBuf::from("/").join(relative_path),
  }
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)
      .map_err(|error| format!("Failed to create directory {}: {}", parent.display(), error))?;
  }
  Ok(())
}

fn read_json_file_or_empty_object(path: &Path) -> Result<Value, String> {
  match fs::read_to_string(path) {
    Ok(content) => serde_json::from_str::<Value>(&content)
      .map_err(|error| format!("Failed to parse JSON file {}: {}", path.display(), error)),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(Value::Object(Map::new())),
    Err(error) => Err(format!("Failed to read JSON file {}: {}", path.display(), error)),
  }
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
  ensure_parent_dir(path)?;
  let content = serde_json::to_string_pretty(value)
    .map_err(|error| format!("Failed to serialize JSON for {}: {}", path.display(), error))?;
  fs::write(path, format!("{}\n", content))
    .map_err(|error| format!("Failed to write file {}: {}", path.display(), error))?;
  Ok(())
}

fn read_text_file_or_empty(path: &Path) -> Result<String, String> {
  match fs::read_to_string(path) {
    Ok(content) => Ok(content),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(String::new()),
    Err(error) => Err(format!("Failed to read file {}: {}", path.display(), error)),
  }
}

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
  ensure_parent_dir(path)?;
  fs::write(path, content)
    .map_err(|error| format!("Failed to write file {}: {}", path.display(), error))?;
  Ok(())
}

fn parse_env_text(raw: &str) -> Map<String, Value> {
  let mut result = Map::new();
  for line in raw.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    let Some(eq_index) = trimmed.find('=') else {
      continue;
    };
    if eq_index == 0 {
      continue;
    }

    let key = trimmed[..eq_index].trim();
    if key.is_empty() {
      continue;
    }
    let value = trimmed[eq_index + 1..]
      .trim()
      .trim_matches('"')
      .to_string();
    result.insert(key.to_string(), Value::String(value));
  }

  result
}

fn stringify_env_value(value: &Value) -> String {
  if let Some(text) = value.as_str() {
    return text.to_string();
  }
  if value.is_null() {
    return String::new();
  }
  value.to_string()
}

fn stringify_env_map(env: &Map<String, Value>) -> String {
  let mut keys = env.keys().cloned().collect::<Vec<_>>();
  keys.sort();

  let lines = keys
    .iter()
    .map(|key| {
      if let Some(value) = env.get(key) {
        format!("{}={}", key, stringify_env_value(value))
      } else {
        format!("{}=", key)
      }
    })
    .collect::<Vec<_>>();

  if lines.is_empty() {
    String::new()
  } else {
    format!("{}\n", lines.join("\n"))
  }
}

fn deep_merge_json(base: &Value, next: &Value) -> Value {
  match (base, next) {
    (Value::Object(base_obj), Value::Object(next_obj)) => {
      let mut merged = base_obj.clone();
      for (key, next_value) in next_obj {
        if let Some(base_value) = merged.get(key) {
          if base_value.is_object() && next_value.is_object() {
            merged.insert(key.clone(), deep_merge_json(base_value, next_value));
          } else {
            merged.insert(key.clone(), next_value.clone());
          }
        } else {
          merged.insert(key.clone(), next_value.clone());
        }
      }
      Value::Object(merged)
    }
    _ => next.clone(),
  }
}

fn sanitize_provider_config_for_live(provider_config: &Value) -> Value {
  let mut sanitized = match provider_config {
    Value::Object(config_obj) => config_obj.clone(),
    _ => return provider_config.clone(),
  };
  sanitized.remove("_profile");
  Value::Object(sanitized)
}

fn preserve_provider_profile(next_config: &Value, previous_config: &Value) -> Value {
  let mut next = match next_config {
    Value::Object(config_obj) => config_obj.clone(),
    _ => return next_config.clone(),
  };

  let previous = match previous_config {
    Value::Object(config_obj) => config_obj,
    _ => return Value::Object(next),
  };

  if let Some(profile) = previous.get("_profile") {
    if profile.is_object() {
      next.insert("_profile".to_string(), profile.clone());
    }
  }

  Value::Object(next)
}

fn normalize_codex_auth(auth_value: Option<&Value>) -> Option<Map<String, Value>> {
  let auth_obj = auth_value?.as_object()?;
  let mut normalized = auth_obj.clone();
  let has_openai_key = normalized
    .get("OPENAI_API_KEY")
    .and_then(|value| value.as_str())
    .is_some();

  if !has_openai_key {
    if let Some(api_key) = normalized.get("api_key").and_then(|value| value.as_str()) {
      normalized.insert(
        "OPENAI_API_KEY".to_string(),
        Value::String(api_key.to_string()),
      );
    }
  }

  Some(normalized)
}

fn extract_codex_config_text(config_value: &Value) -> Option<String> {
  config_value
    .get("config")
    .and_then(|value| value.as_str())
    .map(|value| value.to_string())
    .or_else(|| {
      config_value
        .get("configToml")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
    })
}

fn merge_live_config(app_type: &AppType, live_config: &Value, provider_config: &Value) -> Value {
  let sanitized_provider = sanitize_provider_config_for_live(provider_config);

  match app_type {
    AppType::Claude => deep_merge_json(live_config, &sanitized_provider),
    AppType::Codex => {
      let live_auth = normalize_codex_auth(live_config.get("auth"));
      let next_auth = normalize_codex_auth(sanitized_provider.get("auth"));
      let live_toml = extract_codex_config_text(live_config);
      let next_toml = extract_codex_config_text(&sanitized_provider);

      let mut merged = Map::new();
      if let Some(auth) = next_auth.or(live_auth) {
        merged.insert("auth".to_string(), Value::Object(auth));
      }
      if let Some(config_text) = next_toml.or(live_toml) {
        merged.insert("config".to_string(), Value::String(config_text));
      }
      Value::Object(merged)
    }
    AppType::Gemini => {
      let mut merged_env = live_config
        .get("env")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();

      if let Some(next_env) = sanitized_provider
        .get("env")
        .and_then(|value| value.as_object())
        .cloned()
      {
        for (key, value) in next_env {
          merged_env.insert(key, value);
        }
      }

      let live_settings = live_config
        .get("settings")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
      let next_settings = sanitized_provider
        .get("settings")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

      let mut merged = Map::new();
      merged.insert("env".to_string(), Value::Object(merged_env));
      merged.insert(
        "settings".to_string(),
        deep_merge_json(&live_settings, &next_settings),
      );
      Value::Object(merged)
    }
  }
}

fn validate_provider_config_for_live(app_type: &AppType, provider_config: &Value) -> Result<(), String> {
  let config_obj = provider_config
    .as_object()
    .ok_or_else(|| "Provider config must be an object.".to_string())?;

  match app_type {
    AppType::Claude => Ok(()),
    AppType::Codex => {
      let has_auth = config_obj
        .get("auth")
        .and_then(|value| value.as_object())
        .is_some();
      let has_config = config_obj
        .get("config")
        .and_then(|value| value.as_str())
        .is_some();

      if !has_auth && !has_config {
        return Err("Codex provider config must include auth and/or config.".to_string());
      }
      Ok(())
    }
    AppType::Gemini => {
      let has_env = config_obj
        .get("env")
        .and_then(|value| value.as_object())
        .is_some();
      let has_settings = config_obj
        .get("settings")
        .and_then(|value| value.as_object())
        .is_some();

      if !has_env && !has_settings {
        return Err("Gemini provider config must include env and/or settings.".to_string());
      }
      Ok(())
    }
  }
}

fn read_live_provider_config(app_type: &AppType) -> Result<Value, String> {
  match app_type {
    AppType::Claude => read_json_file_or_empty_object(&home_relative_path(".claude/settings.json")),
    AppType::Codex => {
      let auth = read_json_file_or_empty_object(&home_relative_path(".codex/auth.json"))?;
      let config = read_text_file_or_empty(&home_relative_path(".codex/config.toml"))?;
      Ok(json!({
        "auth": auth,
        "config": config,
      }))
    }
    AppType::Gemini => {
      let env = parse_env_text(&read_text_file_or_empty(&home_relative_path(".gemini/.env"))?);
      let settings = read_json_file_or_empty_object(&home_relative_path(".gemini/settings.json"))?;
      Ok(json!({
        "env": Value::Object(env),
        "settings": settings,
      }))
    }
  }
}

fn write_live_provider_config(app_type: &AppType, provider_config: &Value) -> Result<(), String> {
  let config_obj = provider_config
    .as_object()
    .ok_or_else(|| "Provider config must be an object.".to_string())?;

  match app_type {
    AppType::Claude => write_json_file(&home_relative_path(".claude/settings.json"), provider_config),
    AppType::Codex => {
      if let Some(auth) = config_obj.get("auth") {
        if auth.is_object() {
          write_json_file(&home_relative_path(".codex/auth.json"), auth)?;
        }
      }

      if let Some(config_text) = config_obj.get("config").and_then(|value| value.as_str()) {
        write_text_file(&home_relative_path(".codex/config.toml"), config_text)?;
      }
      Ok(())
    }
    AppType::Gemini => {
      if let Some(env_obj) = config_obj.get("env").and_then(|value| value.as_object()) {
        let env_text = stringify_env_map(env_obj);
        write_text_file(&home_relative_path(".gemini/.env"), &env_text)?;
      }

      if let Some(settings) = config_obj.get("settings") {
        if settings.is_object() {
          write_json_file(&home_relative_path(".gemini/settings.json"), settings)?;
        }
      }
      Ok(())
    }
  }
}

fn sanitize_official_capture_config(app_type: &AppType, live_config: &Value) -> Value {
  if *app_type != AppType::Codex {
    return live_config.clone();
  }

  let mut next = match live_config {
    Value::Object(config_obj) => config_obj.clone(),
    _ => return live_config.clone(),
  };

  let mut auth = next
    .get("auth")
    .and_then(|value| value.as_object())
    .cloned()
    .unwrap_or_default();
  auth.insert("OPENAI_API_KEY".to_string(), Value::Null);
  auth.remove("api_key");
  next.insert("auth".to_string(), Value::Object(auth));

  Value::Object(next)
}

fn path_exists_or_symlink(path: &Path) -> bool {
  fs::symlink_metadata(path).is_ok()
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
  let metadata = match fs::symlink_metadata(path) {
    Ok(metadata) => metadata,
    Err(_) => return Ok(()),
  };

  let file_type = metadata.file_type();
  if file_type.is_symlink() || file_type.is_file() {
    fs::remove_file(path)
      .map_err(|error| format!("Failed to remove file {}: {}", path.display(), error))?;
    return Ok(());
  }

  if file_type.is_dir() {
    fs::remove_dir_all(path)
      .map_err(|error| format!("Failed to remove directory {}: {}", path.display(), error))?;
  }

  Ok(())
}

#[cfg(unix)]
fn create_path_symlink(target: &Path, link: &Path) -> Result<(), String> {
  std::os::unix::fs::symlink(target, link).map_err(|error| {
    format!(
      "Failed to create symlink {} -> {}: {}",
      link.display(),
      target.display(),
      error
    )
  })
}

#[cfg(windows)]
fn create_path_symlink(target: &Path, link: &Path) -> Result<(), String> {
  let result = if target.is_dir() {
    std::os::windows::fs::symlink_dir(target, link)
  } else {
    std::os::windows::fs::symlink_file(target, link)
  };

  result.map_err(|error| {
    format!(
      "Failed to create symlink {} -> {}: {}",
      link.display(),
      target.display(),
      error
    )
  })
}

#[cfg(not(any(unix, windows)))]
fn create_path_symlink(_target: &Path, _link: &Path) -> Result<(), String> {
  Err("Symlink is not supported on this platform.".to_string())
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
  fs::create_dir_all(destination).map_err(|error| {
    format!(
      "Failed to create destination directory {}: {}",
      destination.display(),
      error
    )
  })?;

  let entries = fs::read_dir(source)
    .map_err(|error| format!("Failed to read directory {}: {}", source.display(), error))?;

  for entry in entries.flatten() {
    let entry_name = entry.file_name();
    let entry_name_text = match entry_name.to_str() {
      Some(value) => value,
      None => continue,
    };
    if entry_name_text == ".git" {
      continue;
    }

    let source_path = entry.path();
    let destination_path = destination.join(&entry_name);
    let file_type = entry.file_type().map_err(|error| {
      format!(
        "Failed to get file type for {}: {}",
        source_path.display(),
        error
      )
    })?;

    if file_type.is_dir() {
      copy_directory_recursive(&source_path, &destination_path)?;
      continue;
    }

    if file_type.is_symlink() {
      let target = fs::read_link(&source_path).map_err(|error| {
        format!(
          "Failed to read symlink target {}: {}",
          source_path.display(),
          error
        )
      })?;
      create_path_symlink(&target, &destination_path)?;
      continue;
    }

    if let Some(parent) = destination_path.parent() {
      fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create {}: {}", parent.display(), error))?;
    }
    fs::copy(&source_path, &destination_path).map_err(|error| {
      format!(
        "Failed to copy {} -> {}: {}",
        source_path.display(),
        destination_path.display(),
        error
      )
    })?;
  }

  Ok(())
}

fn sync_skill_into_parent(
  source_path: &Path,
  destination_parent_path: &Path,
  mode: &KitSyncMode,
) -> Result<String, String> {
  if !source_path.exists() {
    return Err(format!("Skill path does not exist: {}", source_path.display()));
  }
  if !source_path.join("SKILL.md").exists() {
    return Err(format!("SKILL.md not found in {}", source_path.display()));
  }

  fs::create_dir_all(destination_parent_path).map_err(|error| {
    format!(
      "Failed to create destination parent {}: {}",
      destination_parent_path.display(),
      error
    )
  })?;

  let destination = destination_parent_path.join(path_tail(source_path.to_string_lossy().as_ref()));
  let normalized_source = normalize_path(source_path.to_string_lossy().as_ref());
  let normalized_destination = normalize_path(destination.to_string_lossy().as_ref());
  if normalized_source == normalized_destination {
    return Ok(normalized_destination);
  }

  if path_exists_or_symlink(&destination) {
    remove_path_if_exists(&destination)?;
  }

  match mode {
    KitSyncMode::Copy => {
      let source = fs::canonicalize(source_path).unwrap_or_else(|_| source_path.to_path_buf());
      if !source.is_dir() {
        return Err(format!("Skill source is not a directory: {}", source.display()));
      }
      copy_directory_recursive(&source, &destination)?;
    }
    KitSyncMode::Link => {
      create_path_symlink(source_path, &destination)?;
    }
  }

  Ok(normalized_destination)
}

fn yaml_value_to_string(value: &YamlValue) -> String {
  match value {
    YamlValue::Null => String::new(),
    YamlValue::Bool(flag) => flag.to_string(),
    YamlValue::Number(number) => number.to_string(),
    YamlValue::String(text) => text.trim().to_string(),
    YamlValue::Sequence(items) => items
      .iter()
      .map(yaml_value_to_string)
      .filter(|entry| !entry.is_empty())
      .collect::<Vec<_>>()
      .join(", "),
    YamlValue::Mapping(_) | YamlValue::Tagged(_) => serde_yaml::to_string(value)
      .unwrap_or_default()
      .trim()
      .to_string(),
  }
}

fn parse_frontmatter(frontmatter: &str) -> HashMap<String, String> {
  let mut metadata = HashMap::new();

  let Ok(parsed) = serde_yaml::from_str::<YamlValue>(frontmatter) else {
    return metadata;
  };

  let YamlValue::Mapping(mapping) = parsed else {
    return metadata;
  };

  for (raw_key, raw_value) in mapping {
    let Some(key) = raw_key.as_str() else {
      continue;
    };
    let normalized_key = key.trim();
    if normalized_key.is_empty() {
      continue;
    }
    metadata.insert(normalized_key.to_string(), yaml_value_to_string(&raw_value));
  }

  metadata
}

fn parse_skill_document(raw: &str) -> SkillDocument {
  let normalized = raw.replace("\r\n", "\n");
  if !normalized.starts_with("---\n") {
    return SkillDocument {
      metadata: HashMap::new(),
      content: raw.to_string(),
    };
  }

  let remaining = &normalized[4..];
  let Some(end_index) = remaining.find("\n---\n") else {
    return SkillDocument {
      metadata: HashMap::new(),
      content: raw.to_string(),
    };
  };

  let frontmatter = &remaining[..end_index];
  let body = remaining[end_index + 5..].to_string();
  let metadata = parse_frontmatter(frontmatter);

  SkillDocument { metadata, content: body }
}

fn infer_description(markdown: &str) -> String {
  for line in markdown.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    return trimmed.trim_start_matches('#').trim().to_string();
  }
  String::new()
}

fn skill_document_path(skill_dir: &Path) -> PathBuf {
  skill_dir.join("SKILL.md")
}

fn read_skill_document_from_dir(skill_dir: &Path) -> Result<SkillDocument, String> {
  let skill_md_path = skill_document_path(skill_dir);
  let raw = fs::read_to_string(&skill_md_path)
    .map_err(|error| format!("Failed to read {}: {}", skill_md_path.display(), error))?;
  Ok(parse_skill_document(&raw))
}

fn write_skill_document_to_dir(skill_dir: &Path, document: &SkillDocument) -> Result<(), String> {
  let skill_md_path = skill_document_path(skill_dir);
  let next_raw = if document.metadata.is_empty() {
    document.content.clone()
  } else {
    let frontmatter = serde_yaml::to_string(&document.metadata)
      .map_err(|error| format!("Failed to encode frontmatter: {}", error))?;
    format!("---\n{}---\n{}", frontmatter, document.content)
  };

  fs::write(&skill_md_path, next_raw)
    .map_err(|error| format!("Failed to write {}: {}", skill_md_path.display(), error))
}

fn update_skill_metadata(
  skill_dir: &Path,
  updates: Vec<(String, Option<String>)>,
) -> Result<(), String> {
  let skill_md_path = skill_document_path(skill_dir);
  if !skill_md_path.exists() {
    return Ok(());
  }

  let mut document = read_skill_document_from_dir(skill_dir)?;
  for (key, value) in updates.into_iter() {
    if let Some(value) = optional_trim(Some(value).flatten()) {
      document.metadata.insert(key, value);
    } else {
      document.metadata.remove(&key);
    }
  }

  write_skill_document_to_dir(skill_dir, &document)
}

fn parse_skill_summary(skill_dir: &Path) -> SkillSummary {
  let fallback_name = path_tail(skill_dir.to_string_lossy().as_ref());
  let document = match read_skill_document_from_dir(skill_dir) {
    Ok(document) => document,
    Err(_) => {
      return SkillSummary {
        name: fallback_name,
        description: "Error parsing SKILL.md".to_string(),
        ..SkillSummary::default()
      };
    }
  };

  let name = document
    .metadata
    .get("name")
    .cloned()
    .filter(|entry| !entry.trim().is_empty())
    .unwrap_or_else(|| fallback_name.clone());
  let description = document
    .metadata
    .get("description")
    .cloned()
    .filter(|entry| !entry.trim().is_empty())
    .unwrap_or_else(|| infer_description(&document.content));

  SkillSummary {
    name,
    description: description.chars().take(200).collect(),
    project_relative_path: optional_trim(
      document
        .metadata
        .get("skills_hub_project_relative_path")
        .cloned(),
    ),
    source_package_id: optional_trim(
      document
        .metadata
        .get("skills_hub_source_package_id")
        .cloned(),
    ),
    source_package_name: optional_trim(
      document
        .metadata
        .get("skills_hub_source_package_name")
        .cloned(),
    ),
    source_kit_id: optional_trim(
      document
        .metadata
        .get("skills_hub_source_kit_id")
        .cloned(),
    ),
    source_kit_name: optional_trim(
      document
        .metadata
        .get("skills_hub_source_kit_name")
        .cloned(),
    ),
  }
}

fn should_skip_skill_scan_dir(name: &str) -> bool {
  if name.starts_with('.') {
    return true;
  }
  matches!(name, "node_modules" | "dist" | "build" | "target" | "__pycache__")
}

fn scan_dir_for_skills(base_path: &Path, depth: usize, output: &mut Vec<PathBuf>) {
  const MAX_DEPTH: usize = 3;

  if depth > MAX_DEPTH || !base_path.exists() {
    return;
  }

  let entries = match fs::read_dir(base_path) {
    Ok(entries) => entries,
    Err(_) => return,
  };

  for entry in entries.flatten() {
    let file_name = entry.file_name();
    let name = match file_name.to_str() {
      Some(name) => name,
      None => continue,
    };
    if should_skip_skill_scan_dir(name) {
      continue;
    }

    let file_type = match entry.file_type() {
      Ok(file_type) => file_type,
      Err(_) => continue,
    };
    if !(file_type.is_dir() || file_type.is_symlink()) {
      continue;
    }

    let path = entry.path();
    if path.join("SKILL.md").exists() {
      output.push(path);
      continue;
    }

    scan_dir_for_skills(&path, depth + 1, output);
  }
}

fn collect_skill_dirs(base_path: &Path) -> Vec<PathBuf> {
  if !base_path.exists() {
    return Vec::new();
  }
  let mut result = Vec::new();
  scan_dir_for_skills(base_path, 0, &mut result);
  result
}

fn project_disabled_skill_root(project_path: &str) -> PathBuf {
  Path::new(project_path)
    .join(".skills-hub")
    .join("disabled-skills")
}

fn project_disabled_skill_agent_root(project_path: &str, agent_name: &str) -> PathBuf {
  project_disabled_skill_root(project_path).join(agent_name)
}

fn build_project_skill_provenance_map(
  config: &AppConfig,
  loadouts: &[KitLoadoutRecord],
  kits: &[KitRecord],
) -> HashMap<String, SkillProvenance> {
  let loadouts_by_id = loadouts
    .iter()
    .map(|loadout| (loadout.id.as_str(), loadout))
    .collect::<HashMap<_, _>>();
  let agents_by_name = config
    .agents
    .iter()
    .map(|agent| (agent.name.as_str(), agent))
    .collect::<HashMap<_, _>>();

  let mut applied_kits = kits
    .iter()
    .filter(|kit| kit.loadout_id.is_some() && kit.last_applied_target.is_some())
    .collect::<Vec<_>>();
  applied_kits.sort_by(|left, right| right.last_applied_at.unwrap_or(0).cmp(&left.last_applied_at.unwrap_or(0)));

  let mut result = HashMap::new();
  for kit in applied_kits.into_iter() {
    let Some(loadout_id) = kit.loadout_id.as_deref() else {
      continue;
    };
    let Some(loadout) = loadouts_by_id.get(loadout_id) else {
      continue;
    };
    let Some(target) = kit.last_applied_target.as_ref() else {
      continue;
    };
    let Some(agent) = agents_by_name.get(target.agent_name.as_str()) else {
      continue;
    };

    for item in loadout.items.iter() {
      for parent in project_skill_parent_candidates(&target.project_path, agent) {
        let destination = parent.join(path_tail(&item.skill_path));
        let normalized_destination = normalize_path(destination.to_string_lossy().as_ref());
        result.entry(normalized_destination).or_insert_with(|| SkillProvenance {
          source_package_id: Some(loadout.id.clone()),
          source_package_name: Some(loadout.name.clone()),
          source_kit_id: Some(kit.id.clone()),
          source_kit_name: Some(kit.name.clone()),
        });
      }
    }
  }

  result
}

fn resolve_skill_watch_target(skill_root: &Path) -> Option<SkillWatchTarget> {
  let mut current = skill_root.to_path_buf();
  let mut recursive_mode = RecursiveMode::Recursive;

  loop {
    if current.exists() {
      return Some(SkillWatchTarget {
        path: current,
        recursive_mode,
      });
    }

    let parent = current.parent()?.to_path_buf();
    current = parent;
    recursive_mode = RecursiveMode::NonRecursive;
  }
}

fn project_skill_parent_candidates(project_path: &str, agent: &AgentConfig) -> Vec<PathBuf> {
  let mut relative_paths = vec![agent.project_path.trim().to_string()];

  // Codex supports both .codex/skills and .agents/skills in project roots.
  if agent.name.eq_ignore_ascii_case("codex") {
    relative_paths.push(".agents/skills".to_string());
  }

  let mut seen = HashSet::new();
  relative_paths
    .into_iter()
    .filter(|relative_path| seen.insert(relative_path.clone()))
    .map(|relative_path| Path::new(project_path).join(relative_path))
    .collect()
}

fn skill_watch_targets(config: &AppConfig) -> Vec<SkillWatchTarget> {
  let mut candidates = vec![PathBuf::from(config.hub_path.trim())];
  let active_agents = config
    .agents
    .iter()
    .filter(|agent| agent.enabled)
    .collect::<Vec<_>>();

  for agent in active_agents.iter() {
    candidates.push(PathBuf::from(agent.global_path.trim()));
  }

  for project_path in config.projects.iter() {
    for agent in active_agents.iter() {
      candidates.extend(project_skill_parent_candidates(project_path, agent));
      candidates.push(project_disabled_skill_agent_root(project_path, &agent.name));
    }
  }

  let mut deduped = HashMap::<String, SkillWatchTarget>::new();
  for candidate in candidates {
    let Some(target) = resolve_skill_watch_target(&candidate) else {
      continue;
    };
    let normalized = normalize_path(target.path.to_string_lossy().as_ref());
    deduped
      .entry(normalized)
      .and_modify(|existing| {
        if target.recursive_mode == RecursiveMode::Recursive {
          existing.recursive_mode = RecursiveMode::Recursive;
        }
      })
      .or_insert(target);
  }

  let mut result = deduped.into_values().collect::<Vec<_>>();
  result.sort_by(|left, right| left.path.cmp(&right.path));
  result
}

fn collect_all_skills(
  config: &AppConfig,
  loadouts: &[KitLoadoutRecord],
  kits: &[KitRecord],
) -> Vec<Skill> {
  let active_agents = config
    .agents
    .iter()
    .filter(|agent| agent.enabled)
    .collect::<Vec<_>>();
  let inferred_provenance = build_project_skill_provenance_map(config, loadouts, kits);
  let mut seen = HashSet::new();
  let mut skills = Vec::new();

  let mut push_skill = |path: PathBuf,
                        location: SkillLocation,
                        agent_name: Option<String>,
                        project_name: Option<String>,
                        project_path: Option<String>,
                        enabled: bool| {
    let normalized_path = normalize_path(path.to_string_lossy().as_ref());
    if seen.contains(&normalized_path) {
      return;
    }

    let summary = parse_skill_summary(Path::new(&normalized_path));
    let inferred = if location == SkillLocation::Project {
      inferred_provenance.get(&normalized_path).cloned().unwrap_or_default()
    } else {
      SkillProvenance::default()
    };
    skills.push(Skill {
      id: normalized_path.clone(),
      name: summary.name,
      description: summary.description,
      path: normalized_path.clone(),
      location,
      agent_name,
      project_name,
      project_path,
      enabled,
      source_package_id: summary.source_package_id.or(inferred.source_package_id),
      source_package_name: summary.source_package_name.or(inferred.source_package_name),
      source_kit_id: summary.source_kit_id.or(inferred.source_kit_id),
      source_kit_name: summary.source_kit_name.or(inferred.source_kit_name),
    });
    seen.insert(normalized_path);
  };

  for path in collect_skill_dirs(Path::new(&config.hub_path)) {
    push_skill(path, SkillLocation::Hub, None, None, None, true);
  }

  for agent in active_agents.iter() {
    for path in collect_skill_dirs(Path::new(&agent.global_path)) {
      push_skill(path, SkillLocation::Agent, Some(agent.name.clone()), None, None, true);
    }
  }

  for project_path in config.projects.iter() {
    let project_name = path_tail(project_path);
    for agent in active_agents.iter() {
      for target_path in project_skill_parent_candidates(project_path, agent) {
        for path in collect_skill_dirs(&target_path) {
          push_skill(
            path,
            SkillLocation::Project,
            Some(agent.name.clone()),
            Some(project_name.clone()),
            Some(project_path.clone()),
            true,
          );
        }
      }

      let disabled_root = project_disabled_skill_agent_root(project_path, &agent.name);
      for path in collect_skill_dirs(&disabled_root) {
        push_skill(
          path,
          SkillLocation::Project,
          Some(agent.name.clone()),
          Some(project_name.clone()),
          Some(project_path.clone()),
          false,
        );
      }
    }
  }

  skills.sort_by(|left, right| left.path.cmp(&right.path));
  skills
}

fn resolve_project_skill_restore_relative_path(
  skill: &Skill,
  config: &AppConfig,
  skill_dir: &Path,
) -> String {
  let summary = parse_skill_summary(skill_dir);
  if let Some(relative_path) = summary.project_relative_path {
    return relative_path;
  }

  let basename = path_tail(skill.path.as_str());
  if let Some(project_path) = skill.project_path.as_deref() {
    if let Some(agent_name) = skill.agent_name.as_deref() {
      if let Some(agent) = config.agents.iter().find(|agent| agent.name == agent_name) {
        return normalize_relative_path(
          Path::new(&agent.project_path)
            .join(&basename)
            .to_string_lossy()
            .as_ref(),
        );
      }
    }
    if let Ok(relative) = Path::new(skill.path.as_str()).strip_prefix(project_path) {
      return normalize_relative_path(relative.to_string_lossy().as_ref());
    }
  }

  basename
}

fn persist_project_skill_state_metadata(skill: &Skill, skill_dir: &Path) -> Result<(), String> {
  let relative_path = skill.project_path.as_deref().and_then(|project_path| {
    Path::new(skill.path.as_str())
      .strip_prefix(project_path)
      .ok()
      .map(|value| normalize_relative_path(value.to_string_lossy().as_ref()))
  });

  update_skill_metadata(
    skill_dir,
    vec![
      (
        "skills_hub_project_relative_path".to_string(),
        relative_path,
      ),
      (
        "skills_hub_source_package_id".to_string(),
        skill.source_package_id.clone(),
      ),
      (
        "skills_hub_source_package_name".to_string(),
        skill.source_package_name.clone(),
      ),
      ("skills_hub_source_kit_id".to_string(), skill.source_kit_id.clone()),
      (
        "skills_hub_source_kit_name".to_string(),
        skill.source_kit_name.clone(),
      ),
    ],
  )
}

fn relocate_skill_directory(source_path: &Path, destination_path: &Path) -> Result<(), String> {
  if let Some(parent) = destination_path.parent() {
    fs::create_dir_all(parent).map_err(|error| {
      format!(
        "Failed to create destination parent {}: {}",
        parent.display(),
        error
      )
    })?;
  }

  if path_exists_or_symlink(destination_path) {
    remove_path_if_exists(destination_path)?;
  }

  match fs::rename(source_path, destination_path) {
    Ok(()) => Ok(()),
    Err(_) => {
      copy_directory_recursive(source_path, destination_path)?;
      remove_path_if_exists(source_path)
    }
  }
}

fn set_project_skill_enabled_on_disk(
  config: &AppConfig,
  skill: &Skill,
  enabled: bool,
) -> Result<String, String> {
  if skill.location != SkillLocation::Project {
    return Err("Only project skills can be toggled.".to_string());
  }

  let project_path = skill
    .project_path
    .as_deref()
    .ok_or_else(|| "Project path is missing for this skill.".to_string())?;
  let agent_name = skill
    .agent_name
    .as_deref()
    .ok_or_else(|| "Agent name is missing for this skill.".to_string())?;
  let source_path = PathBuf::from(normalize_path(&skill.path));
  let basename = path_tail(skill.path.as_str());

  if enabled == skill.enabled {
    return Ok(normalize_path(source_path.to_string_lossy().as_ref()));
  }

  let destination = if enabled {
    let relative_path = resolve_project_skill_restore_relative_path(skill, config, &source_path);
    Path::new(project_path).join(relative_path)
  } else {
    persist_project_skill_state_metadata(skill, &source_path)?;
    project_disabled_skill_agent_root(project_path, agent_name).join(&basename)
  };

  let normalized_destination = normalize_path(destination.to_string_lossy().as_ref());
  if normalize_path(source_path.to_string_lossy().as_ref()) == normalized_destination {
    return Ok(normalized_destination);
  }

  relocate_skill_directory(&source_path, &destination)?;
  Ok(normalized_destination)
}

fn matches_project_package(
  skill: &Skill,
  package_id: Option<&str>,
  package_name: Option<&str>,
) -> bool {
  if let Some(package_id) = package_id {
    if skill.source_package_id.as_deref() == Some(package_id) {
      return true;
    }
  }
  if let Some(package_name) = package_name {
    if skill.source_package_name.as_deref() == Some(package_name) {
      return true;
    }
  }
  false
}

fn should_refresh_for_notify_kind(kind: &notify::EventKind) -> bool {
  use notify::event::{
    AccessKind, AccessMode, CreateKind, DataChange, ModifyKind, RemoveKind, RenameMode,
  };

  match kind {
    notify::EventKind::Create(CreateKind::Any)
    | notify::EventKind::Create(CreateKind::File)
    | notify::EventKind::Create(CreateKind::Folder) => true,
    notify::EventKind::Modify(ModifyKind::Any)
    | notify::EventKind::Modify(ModifyKind::Data(DataChange::Any))
    | notify::EventKind::Modify(ModifyKind::Data(DataChange::Content))
    | notify::EventKind::Modify(ModifyKind::Data(DataChange::Size))
    | notify::EventKind::Modify(ModifyKind::Metadata(_))
    | notify::EventKind::Modify(ModifyKind::Name(RenameMode::Any))
    | notify::EventKind::Modify(ModifyKind::Name(RenameMode::Both))
    | notify::EventKind::Modify(ModifyKind::Name(RenameMode::From))
    | notify::EventKind::Modify(ModifyKind::Name(RenameMode::To)) => true,
    notify::EventKind::Remove(RemoveKind::Any)
    | notify::EventKind::Remove(RemoveKind::File)
    | notify::EventKind::Remove(RemoveKind::Folder) => true,
    notify::EventKind::Access(AccessKind::Close(AccessMode::Write)) => true,
    _ => false,
  }
}

fn reconfigure_skill_watcher(
  watcher: &mut RecommendedWatcher,
  watched_targets: &mut Vec<SkillWatchTarget>,
  config: &AppConfig,
) {
  for target in watched_targets.drain(..) {
    let _ = watcher.unwatch(&target.path);
  }

  for target in skill_watch_targets(config) {
    if watcher.watch(&target.path, target.recursive_mode).is_ok() {
      watched_targets.push(target);
    }
  }
}

fn refresh_skills_and_notify<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
  let state = app_handle.state::<SharedState>();
  if let Ok(true) = state.inner().refresh_skills_from_disk() {
    let _ = app_handle.emit("skills://updated", ());
  }
}

fn start_skill_watcher<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> SkillWatcherControl {
  const DEBOUNCE_WINDOW: std::time::Duration = std::time::Duration::from_millis(500);

  let (tx, rx) = mpsc::channel::<SkillWatchMessage>();
  let callback_tx = tx.clone();

  std::thread::spawn(move || {
    let mut watcher = match notify::recommended_watcher(
      move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
          return;
        };
        if should_refresh_for_notify_kind(&event.kind) {
          let _ = callback_tx.send(SkillWatchMessage::Refresh);
        }
      },
    ) {
      Ok(watcher) => watcher,
      Err(_) => return,
    };

    let mut watched_targets = Vec::new();
    if let Ok(config) = app_handle.state::<SharedState>().inner().clone_config() {
      reconfigure_skill_watcher(&mut watcher, &mut watched_targets, &config);
    }

    let mut pending_refresh = false;
    loop {
      let message = if pending_refresh {
        match rx.recv_timeout(DEBOUNCE_WINDOW) {
          Ok(message) => Some(message),
          Err(RecvTimeoutError::Timeout) => {
            pending_refresh = false;
            refresh_skills_and_notify(&app_handle);
            None
          }
          Err(RecvTimeoutError::Disconnected) => break,
        }
      } else {
        match rx.recv() {
          Ok(message) => Some(message),
          Err(_) => break,
        }
      };

      let Some(message) = message else {
        continue;
      };

      match message {
        SkillWatchMessage::Refresh => {
          pending_refresh = true;
        }
        SkillWatchMessage::Reconfigure => {
          if let Ok(config) = app_handle.state::<SharedState>().inner().clone_config() {
            reconfigure_skill_watcher(&mut watcher, &mut watched_targets, &config);
          }
          pending_refresh = true;
        }
      }
    }
  });

  SkillWatcherControl::new(tx)
}

fn sanitize_skill_name(input: &str) -> String {
  let mut value = String::new();
  let mut previous_dash = false;

  for character in input.trim().chars() {
    let normalized = character.to_ascii_lowercase();
    if normalized.is_ascii_alphanumeric() || normalized == '_' || normalized == '-' {
      value.push(normalized);
      previous_dash = false;
      continue;
    }

    if !previous_dash {
      value.push('-');
      previous_dash = true;
    }
  }

  let value = value.trim_matches('-').to_string();
  if value.is_empty() {
    "imported-skill".to_string()
  } else {
    value
  }
}

#[derive(Clone)]
struct ParsedImportSource {
  repo_url: String,
  repo_web_url: String,
  source_url: String,
  repo_name: String,
  branch: Option<String>,
  subdir: Option<String>,
  skill_name: String,
  is_github: bool,
}

fn parse_skill_import_url(url: &str) -> Result<ParsedImportSource, String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("Missing URL for import.".to_string());
  }

  if let Some(path_part) = trimmed.strip_prefix("https://github.com/") {
    let segments = path_part
      .split('/')
      .filter(|segment| !segment.is_empty())
      .collect::<Vec<_>>();

    if segments.len() < 2 {
      return Err("Invalid GitHub URL.".to_string());
    }

    let owner = segments[0];
    let repo = segments[1].trim_end_matches(".git");
    let mut branch: Option<String> = None;
    let mut subdir: Option<String> = None;

    if segments.len() >= 4 && segments[2] == "tree" {
      branch = Some(segments[3].to_string());
      if segments.len() > 4 {
        subdir = Some(segments[4..].join("/"));
      }
    }

    let inferred_name = subdir
      .as_deref()
      .map(path_tail)
      .unwrap_or_else(|| repo.to_string());

    return Ok(ParsedImportSource {
      repo_url: format!("https://github.com/{}/{}.git", owner, repo),
      repo_web_url: format!("https://github.com/{}/{}", owner, repo),
      source_url: trimmed.to_string(),
      repo_name: repo.to_string(),
      branch,
      subdir,
      skill_name: sanitize_skill_name(&inferred_name),
      is_github: true,
    });
  }

  let inferred_name = trimmed
    .split('/')
    .filter(|segment| !segment.is_empty())
    .last()
    .map(|segment| segment.trim_end_matches(".git"))
    .unwrap_or("imported-skill");

  Ok(ParsedImportSource {
    repo_url: trimmed.to_string(),
    repo_web_url: trimmed.trim_end_matches(".git").trim_end_matches('/').to_string(),
    source_url: trimmed.to_string(),
    repo_name: sanitize_skill_name(inferred_name),
    branch: None,
    subdir: None,
    skill_name: sanitize_skill_name(inferred_name),
    is_github: false,
  })
}

fn run_git_clone(source: &ParsedImportSource, destination: &Path) -> Result<(), String> {
  let mut command = Command::new("git");
  command.arg("clone").arg("--depth").arg("1");
  if let Some(branch) = &source.branch {
    command.arg("--branch").arg(branch);
  }
  command.arg(&source.repo_url).arg(destination);

  let output = command
    .output()
    .map_err(|error| format!("Failed to execute git clone: {}", error))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    return Err(format!("git clone failed: {}", detail));
  }

  Ok(())
}

fn select_import_source_path(temp_repo_path: &Path, source: &ParsedImportSource) -> Result<PathBuf, String> {
  if let Some(subdir) = &source.subdir {
    let target = temp_repo_path.join(subdir);
    if !target.exists() {
      return Err(format!("Import path does not exist in repository: {}", subdir));
    }
    return Ok(target);
  }

  if temp_repo_path.join("SKILL.md").exists() {
    return Ok(temp_repo_path.to_path_buf());
  }

  let discovered = collect_skill_dirs(temp_repo_path);
  if discovered.len() == 1 {
    return Ok(discovered[0].clone());
  }

  if discovered.is_empty() {
    return Err("No SKILL.md found in repository. Provide a direct skill subdirectory URL.".to_string());
  }

  Err("Multiple skills found in repository. Provide a direct subdirectory URL.".to_string())
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RemoteSkillEntry {
  name: String,
  relative_path: String,
  full_path: PathBuf,
}

fn resolve_git_head_branch(temp_repo_path: &Path, fallback: Option<&str>) -> String {
  let output = Command::new("git")
    .arg("-C")
    .arg(temp_repo_path)
    .arg("rev-parse")
    .arg("--abbrev-ref")
    .arg("HEAD")
    .output();

  match output {
    Ok(output) if output.status.success() => {
      let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
      if branch.is_empty() || branch == "HEAD" {
        fallback.unwrap_or("unknown").to_string()
      } else {
        branch
      }
    }
    _ => fallback.unwrap_or("unknown").to_string(),
  }
}

fn resolve_loadout_import_root(
  temp_repo_path: &Path,
  source: &ParsedImportSource,
) -> Result<(PathBuf, String), String> {
  if let Some(subdir) = &source.subdir {
    let target = temp_repo_path.join(subdir);
    if !target.exists() {
      return Err(format!("Import path does not exist in repository: {}", subdir));
    }

    return Ok((target, normalize_relative_path(subdir)));
  }

  let skills_root = temp_repo_path.join("skills");
  if skills_root.exists() {
    return Ok((skills_root, "skills".to_string()));
  }

  Ok((temp_repo_path.to_path_buf(), "/".to_string()))
}

fn collect_installable_skill_dirs(
  base_path: &Path,
  current_path: &Path,
  output: &mut Vec<RemoteSkillEntry>,
) -> Result<(), String> {
  if current_path.join("SKILL.md").exists() {
    let relative_path = normalize_relative_path(
      current_path
        .strip_prefix(base_path)
        .unwrap_or(current_path)
        .to_string_lossy()
        .as_ref(),
    );

    output.push(RemoteSkillEntry {
      name: path_tail(current_path.to_string_lossy().as_ref()),
      relative_path: if relative_path.is_empty() {
        ".".to_string()
      } else {
        relative_path
      },
      full_path: current_path.to_path_buf(),
    });
    return Ok(());
  }

  let entries = fs::read_dir(current_path)
    .map_err(|error| format!("Failed to read directory {}: {}", current_path.display(), error))?;

  for entry in entries.flatten() {
    let file_type = match entry.file_type() {
      Ok(file_type) => file_type,
      Err(_) => continue,
    };
    if !file_type.is_dir() {
      continue;
    }

    let name = entry.file_name().to_string_lossy().to_string();
    if name == ".git" || name == "node_modules" {
      continue;
    }

    collect_installable_skill_dirs(base_path, &entry.path(), output)?;
  }

  Ok(())
}

fn assert_unique_remote_skill_names(entries: &[RemoteSkillEntry]) -> Result<(), String> {
  let mut collisions = HashMap::<String, Vec<String>>::new();
  for entry in entries.iter() {
    collisions
      .entry(entry.name.clone())
      .or_default()
      .push(entry.relative_path.clone());
  }

  let conflicts = collisions
    .into_iter()
    .filter_map(|(name, paths)| {
      if paths.len() < 2 {
        None
      } else {
        Some(format!("{}: {}", name, paths.join(", ")))
      }
    })
    .collect::<Vec<_>>();

  if conflicts.is_empty() {
    return Ok(());
  }

  Err(format!(
    "Duplicate skill directory names found in remote source: {}",
    conflicts.join("; ")
  ))
}

fn select_remote_skill_entries(
  entries: &[RemoteSkillEntry],
  skill_names: &[String],
  source_label: &str,
) -> Result<Vec<RemoteSkillEntry>, String> {
  let normalized_names = skill_names
    .iter()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>();
  if normalized_names.is_empty() {
    return Ok(entries.to_vec());
  }

  let entry_by_name = entries
    .iter()
    .map(|entry| (entry.name.clone(), entry.clone()))
    .collect::<HashMap<_, _>>();
  let mut selected = Vec::new();
  let mut seen = HashSet::new();
  let mut missing = Vec::new();

  for skill_name in normalized_names {
    if !seen.insert(skill_name.clone()) {
      continue;
    }

    let Some(entry) = entry_by_name.get(&skill_name) else {
      missing.push(skill_name);
      continue;
    };
    selected.push(entry.clone());
  }

  if !missing.is_empty() {
    let available = entries
      .iter()
      .map(|entry| entry.name.clone())
      .collect::<Vec<_>>()
      .join(", ");
    return Err(format!(
      "Remote source '{}' is missing expected skills: {}. Available skills: {}",
      source_label,
      missing.join(", "),
      available
    ));
  }

  selected.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
  Ok(selected)
}

fn join_relative_segments(parts: &[&str]) -> String {
  parts
    .iter()
    .map(|part| normalize_relative_path(part))
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("/")
}

fn build_loadout_import_source_key(repo_web_url: &str, root_subdir: &str) -> String {
  format!(
    "{}::{}",
    normalize_path(repo_web_url).to_lowercase(),
    normalize_relative_path(root_subdir).to_lowercase()
  )
}

fn same_loadout_import_source(
  import_source: &Option<KitLoadoutImportSource>,
  repo_web_url: &str,
  root_subdir: &str,
) -> bool {
  import_source
    .as_ref()
    .map(|value| {
      build_loadout_import_source_key(&value.repo_web_url, &value.root_subdir)
        == build_loadout_import_source_key(repo_web_url, root_subdir)
    })
    .unwrap_or(false)
}

fn build_default_loadout_name(source: &ParsedImportSource, root_subdir: &str) -> String {
  if let Some(subdir) = &source.subdir {
    let subdir_name = path_tail_relative(subdir);
    if !subdir_name.is_empty() && !subdir_name.eq_ignore_ascii_case("skills") {
      return subdir_name;
    }
  }

  if normalize_relative_path(root_subdir).eq_ignore_ascii_case("skills") {
    return source.repo_name.clone();
  }

  source.repo_name.clone()
}

fn build_skill_source_url(
  source: &ParsedImportSource,
  resolved_branch: &str,
  source_subdir: &str,
) -> String {
  if !source.is_github || resolved_branch.is_empty() || resolved_branch == "unknown" {
    return source.source_url.clone();
  }

  let normalized_subdir = normalize_relative_path(source_subdir);
  if normalized_subdir.is_empty() {
    format!("{}/tree/{}", source.repo_web_url, resolved_branch)
  } else {
    format!("{}/tree/{}/{}", source.repo_web_url, resolved_branch, normalized_subdir)
  }
}

fn read_git_last_updated_at(temp_repo_path: &Path, subdir: &str) -> String {
  let mut command = Command::new("git");
  command
    .arg("-C")
    .arg(temp_repo_path)
    .arg("log")
    .arg("-1")
    .arg("--format=%cI");

  let normalized_subdir = normalize_relative_path(subdir);
  if !normalized_subdir.is_empty() {
    command.arg("--").arg(normalized_subdir);
  }

  match command.output() {
    Ok(output) if output.status.success() => {
      let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
      if value.is_empty() {
        fallback_timestamp_string()
      } else {
        value
      }
    }
    _ => fallback_timestamp_string(),
  }
}

fn fallback_timestamp_string() -> String {
  now_millis().to_string()
}

fn read_skill_loadout_key(skill_dir: &Path) -> Option<String> {
  let skill_md_path = skill_dir.join("SKILL.md");
  let raw = fs::read_to_string(skill_md_path).ok()?;
  let parsed = parse_skill_document(&raw);
  optional_trim(parsed.metadata.get("source_loadout_key").cloned())
}

fn write_skill_import_metadata(
  skill_dir: &Path,
  source_repo: &str,
  source_url: &str,
  source_subdir: &str,
  source_last_updated: &str,
  imported_at: &str,
  source_loadout_key: &str,
) -> Result<(), String> {
  let skill_md_path = skill_dir.join("SKILL.md");
  if !skill_md_path.exists() {
    return Ok(());
  }

  let raw = fs::read_to_string(&skill_md_path)
    .map_err(|error| format!("Failed to read {}: {}", skill_md_path.display(), error))?;
  let parsed = parse_skill_document(&raw);
  let mut metadata = parsed.metadata;
  metadata.remove("source_branch");
  metadata.insert("source_repo".to_string(), source_repo.to_string());
  metadata.insert("source_url".to_string(), source_url.to_string());
  metadata.insert("source_subdir".to_string(), source_subdir.to_string());
  metadata.insert(
    "source_last_updated".to_string(),
    source_last_updated.to_string(),
  );
  metadata.insert("imported_at".to_string(), imported_at.to_string());
  metadata.insert(
    "source_loadout_key".to_string(),
    source_loadout_key.to_string(),
  );

  let frontmatter = serde_yaml::to_string(&metadata)
    .map_err(|error| format!("Failed to encode frontmatter: {}", error))?;
  let next_raw = format!("---\n{}---\n{}", frontmatter, parsed.content);
  fs::write(&skill_md_path, next_raw)
    .map_err(|error| format!("Failed to write {}: {}", skill_md_path.display(), error))
}

fn assess_imported_entries_safety(entries: &[RemoteSkillEntry]) -> Result<KitSafetyCheck, String> {
  let flagged_extensions = HashSet::from([
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".jar",
    ".app",
  ]);

  let mut warnings = Vec::new();
  let mut flagged_files = Vec::new();
  let mut scanned_files = 0_i64;
  let mut has_executable_like_file = false;
  let mut has_large_file = false;

  for entry in entries {
    let mut stack = vec![entry.full_path.clone()];
    while let Some(current_path) = stack.pop() {
      let metadata = fs::metadata(&current_path)
        .map_err(|error| format!("Failed to inspect {}: {}", current_path.display(), error))?;

      if metadata.is_dir() {
        for child in fs::read_dir(&current_path)
          .map_err(|error| format!("Failed to read {}: {}", current_path.display(), error))?
        {
          let child =
            child.map_err(|error| format!("Failed to read child entry: {}", error))?;
          stack.push(child.path());
        }
        continue;
      }

      scanned_files += 1;
      let ext = current_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
        .unwrap_or_default();

      if flagged_extensions.contains(ext.as_str()) {
        has_executable_like_file = true;
        flagged_files.push(normalize_path(current_path.to_string_lossy().as_ref()));
      }

      if metadata.len() > 1024 * 1024 {
        has_large_file = true;
        flagged_files.push(normalize_path(current_path.to_string_lossy().as_ref()));
      }
    }
  }

  if has_executable_like_file {
    warnings.push(
      "Imported skills contain shell/binary style executable files that should be reviewed."
        .to_string(),
    );
  }
  if has_large_file {
    warnings.push("Imported skills contain files larger than 1MB that should be reviewed.".to_string());
  }

  Ok(KitSafetyCheck {
    checked_at: now_millis(),
    status: if warnings.is_empty() {
      "pass".to_string()
    } else {
      "warn".to_string()
    },
    scanned_files,
    warnings,
    flagged_files,
  })
}

fn make_temp_directory(prefix: &str) -> Result<PathBuf, String> {
  let mut path = std::env::temp_dir();
  path.push(format!("{}-{}", prefix, now_millis()));
  fs::create_dir_all(&path)
    .map_err(|error| format!("Failed to create temp directory {}: {}", path.display(), error))?;
  Ok(path)
}

fn default_agents() -> Vec<AgentConfig> {
  vec![
    AgentConfig {
      name: "Antigravity".to_string(),
      global_path: join_home_path(".gemini/antigravity/skills"),
      project_path: ".agent/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Claude Code".to_string(),
      global_path: join_home_path(".claude/skills"),
      project_path: ".claude/skills".to_string(),
      instruction_file_name: Some("CLAUDE.md".to_string()),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Cursor".to_string(),
      global_path: join_home_path(".cursor/skills"),
      project_path: ".cursor/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "OpenClaw".to_string(),
      global_path: join_home_path(".openclaw/skills"),
      project_path: "skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "CodeBuddy".to_string(),
      global_path: join_home_path(".codebuddy/skills"),
      project_path: ".codebuddy/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "OpenCode".to_string(),
      global_path: join_home_path(".config/opencode/skills"),
      project_path: ".agents/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Codex".to_string(),
      global_path: join_home_path(".codex/skills"),
      project_path: ".codex/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Kimi Code CLI".to_string(),
      global_path: join_home_path(".config/agents/skills"),
      project_path: ".agents/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Kilo Code".to_string(),
      global_path: join_home_path(".kilocode/skills"),
      project_path: ".kilocode/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Kiro CLI".to_string(),
      global_path: join_home_path(".kiro/skills"),
      project_path: ".kiro/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Gemini CLI".to_string(),
      global_path: join_home_path(".gemini/skills"),
      project_path: ".gemini/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "GitHub Copilot".to_string(),
      global_path: join_home_path(".copilot/skills"),
      project_path: ".github/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Windsurf".to_string(),
      global_path: join_home_path(".codeium/windsurf/skills"),
      project_path: ".windsurf/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Trae".to_string(),
      global_path: join_home_path(".trae/skills"),
      project_path: ".trae/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Trae CN".to_string(),
      global_path: join_home_path(".trae-cn/skills"),
      project_path: ".trae/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Qoder".to_string(),
      global_path: join_home_path(".qoder/skills"),
      project_path: ".qoder/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
    AgentConfig {
      name: "Qwen Code".to_string(),
      global_path: join_home_path(".qwen/skills"),
      project_path: ".qwen/skills".to_string(),
      instruction_file_name: Some("AGENTS.md".to_string()),
      enabled: false,
      is_custom: false,
    },
  ]
}

fn agent_instruction_file_name(agent: &AgentConfig) -> String {
  if let Some(file_name) = agent
    .instruction_file_name
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    return file_name.to_string();
  }

  if agent.name.trim().eq_ignore_ascii_case("Claude Code") {
    "CLAUDE.md".to_string()
  } else {
    "AGENTS.md".to_string()
  }
}

fn seed_state() -> DesktopState {
  let created_at = now_millis();
  let hub_path = join_home_path("skills-hub");
  let sample_skill_path = format!("{}/agent-browser", hub_path);
  let sample_skill_path2 = format!("{}/skill-installer", hub_path);
  let default_project = std::env::current_dir()
    .ok()
    .map(|path| normalize_path(path.to_string_lossy().as_ref()));
  let default_scan_root = default_project
    .as_deref()
    .and_then(|project| {
      Path::new(project)
        .parent()
        .map(|path| normalize_path(path.to_string_lossy().as_ref()))
    })
    .unwrap_or_else(|| join_home_path("workspace"));

  let providers = vec![
    ProviderRecord {
      id: "provider-claude-official".to_string(),
      app_type: AppType::Claude,
      name: "Anthropic Official".to_string(),
      config: json!({
        "_profile": {
          "kind": "official",
          "vendorKey": "anthropic-official",
          "accountName": "default",
          "website": "https://claude.ai"
        }
      }),
      is_current: true,
      created_at,
      updated_at: created_at,
    },
    ProviderRecord {
      id: "provider-codex-api".to_string(),
      app_type: AppType::Codex,
      name: "OpenAI API".to_string(),
      config: json!({
        "_profile": {
          "kind": "api",
          "vendorKey": "openai",
          "endpoint": "https://api.openai.com/v1",
          "model": "gpt-5.2"
        },
        "auth": {
          "OPENAI_API_KEY": "sk-***"
        }
      }),
      is_current: true,
      created_at,
      updated_at: created_at,
    },
    ProviderRecord {
      id: "provider-gemini-api".to_string(),
      app_type: AppType::Gemini,
      name: "Google AI Studio API".to_string(),
      config: json!({
        "_profile": {
          "kind": "api",
          "vendorKey": "google-ai-studio",
          "endpoint": "https://generativelanguage.googleapis.com",
          "model": "gemini-2.5-pro"
        },
        "apiKey": "gsk_***"
      }),
      is_current: true,
      created_at,
      updated_at: created_at,
    },
  ];

  let universal_providers = vec![UniversalProviderRecord {
    id: "universal-openrouter".to_string(),
    name: "OpenRouter Shared".to_string(),
    base_url: "https://openrouter.ai/api/v1".to_string(),
    api_key: "or-***".to_string(),
    website_url: Some("https://openrouter.ai".to_string()),
    notes: Some("Bootstrap sample".to_string()),
    apps: UniversalProviderApps {
      claude: true,
      codex: true,
      gemini: true,
    },
    models: UniversalProviderModels {
      claude: Some(ModelConfig {
        model: Some("anthropic/claude-sonnet-4".to_string()),
      }),
      codex: Some(ModelConfig {
        model: Some("openai/gpt-5".to_string()),
      }),
      gemini: Some(ModelConfig {
        model: Some("google/gemini-2.5-pro".to_string()),
      }),
    },
    created_at,
    updated_at: created_at,
  }];

  let kit_policies = vec![KitPolicyRecord {
    id: "policy-general".to_string(),
    name: "General Development".to_string(),
    description: Some("Default AGENTS.md policy template".to_string()),
    content: "# AGENTS.md\n\n## Rules\n- Keep changes minimal and testable.\n".to_string(),
    created_at,
    updated_at: created_at,
  }];

  let kit_loadouts = vec![KitLoadoutRecord {
    id: "loadout-default".to_string(),
    name: "Default Hub Skills".to_string(),
    description: Some("Two starter skills".to_string()),
    items: vec![
      KitLoadoutItem {
        skill_path: sample_skill_path.clone(),
        mode: KitSyncMode::Copy,
        sort_order: 0,
      },
      KitLoadoutItem {
        skill_path: sample_skill_path2.clone(),
        mode: KitSyncMode::Copy,
        sort_order: 1,
      },
    ],
    import_source: None,
    created_at,
    updated_at: created_at,
  }];

  let kits = vec![KitRecord {
    id: "kit-onboarding".to_string(),
    name: "Onboarding Kit".to_string(),
    description: Some("Policy + default skill package".to_string()),
    policy_id: Some("policy-general".to_string()),
    loadout_id: Some("loadout-default".to_string()),
    managed_source: None,
    last_applied_at: None,
    last_applied_target: None,
    created_at,
    updated_at: created_at,
  }];

  let mut skill_documents = HashMap::new();
  skill_documents.insert(
    sample_skill_path.clone(),
    SkillDocument {
      metadata: HashMap::from([
        ("name".to_string(), "agent-browser".to_string()),
        (
          "description".to_string(),
          "Browser automation CLI for AI agents.".to_string(),
        ),
      ]),
      content:
        "# agent-browser\n\nUse this skill to automate browsing flows and extract data from web pages."
          .to_string(),
    },
  );
  skill_documents.insert(
    sample_skill_path2.clone(),
    SkillDocument {
      metadata: HashMap::from([
        ("name".to_string(), "skill-installer".to_string()),
        (
          "description".to_string(),
          "Install and manage Codex skills.".to_string(),
        ),
      ]),
      content:
        "# skill-installer\n\nUse this skill to discover and install skills from curated sources."
          .to_string(),
    },
  );

  DesktopState {
    config: AppConfig {
      hub_path,
      projects: default_project.into_iter().collect(),
      scan_roots: vec![default_scan_root],
      agents: default_agents(),
    },
    skills: vec![
      Skill {
        id: "skill-agent-browser-hub".to_string(),
        name: "agent-browser".to_string(),
        description: "Browser automation CLI for AI agents.".to_string(),
        path: sample_skill_path,
        location: SkillLocation::Hub,
        agent_name: None,
        project_name: None,
        project_path: None,
        enabled: true,
        source_package_id: None,
        source_package_name: None,
        source_kit_id: None,
        source_kit_name: None,
      },
      Skill {
        id: "skill-installer-hub".to_string(),
        name: "skill-installer".to_string(),
        description: "Install and manage Codex skills.".to_string(),
        path: sample_skill_path2,
        location: SkillLocation::Hub,
        agent_name: None,
        project_name: None,
        project_path: None,
        enabled: true,
        source_package_id: None,
        source_package_name: None,
        source_kit_id: None,
        source_kit_name: None,
      },
    ],
    providers,
    universal_providers,
    kit_policies,
    kit_loadouts,
    kits,
    provider_backups: HashMap::from([
      ("claude".to_string(), vec![]),
      ("codex".to_string(), vec![]),
      ("gemini".to_string(), vec![]),
    ]),
    skill_documents,
    agents_md_applied: HashMap::new(),
  }
}

fn ensure_backups_for<'a>(
  state: &'a mut DesktopState,
  app_type: &AppType,
) -> &'a mut Vec<ProviderBackupEntry> {
  state
    .provider_backups
    .entry(app_type.as_str().to_string())
    .or_default()
}

fn refresh_skills_in_state(state: &mut DesktopState) {
  state.skills = collect_all_skills(&state.config, &state.kit_loadouts, &state.kits);
}

fn build_provider_config_for_universal(
  app_type: &AppType,
  universal: &UniversalProviderRecord,
) -> Value {
  let mut profile = Map::new();
  profile.insert("kind".to_string(), Value::String("api".to_string()));
  profile.insert("vendorKey".to_string(), Value::String("universal".to_string()));
  profile.insert(
    "universalId".to_string(),
    Value::String(universal.id.clone()),
  );

  if let Some(website) = &universal.website_url {
    profile.insert("website".to_string(), Value::String(website.clone()));
  }
  if let Some(note) = &universal.notes {
    profile.insert("note".to_string(), Value::String(note.clone()));
  }

  let model = match app_type {
    AppType::Claude => universal.models.claude.as_ref().and_then(|value| value.model.clone()),
    AppType::Codex => universal.models.codex.as_ref().and_then(|value| value.model.clone()),
    AppType::Gemini => universal.models.gemini.as_ref().and_then(|value| value.model.clone()),
  };

  if let Some(model_value) = &model {
    profile.insert("model".to_string(), Value::String(model_value.clone()));
  }

  profile.insert(
    "endpoint".to_string(),
    Value::String(universal.base_url.clone()),
  );

  if *app_type == AppType::Codex {
    let model_value = model.unwrap_or_else(|| "gpt-5.2".to_string());
    return json!({
      "_profile": Value::Object(profile),
      "auth": {
        "OPENAI_API_KEY": universal.api_key
      },
      "config": format!("model = \"{}\"\\napi_base_url = \"{}\"\\n", model_value, universal.base_url)
    });
  }

  let mut config = Map::new();
  config.insert("_profile".to_string(), Value::Object(profile));
  config.insert(
    "apiKey".to_string(),
    Value::String(universal.api_key.clone()),
  );
  config.insert(
    "endpoint".to_string(),
    Value::String(universal.base_url.clone()),
  );
  if let Some(model_value) = model {
    config.insert("model".to_string(), Value::String(model_value));
  }

  Value::Object(config)
}

#[tauri::command]
fn health() -> HealthResponse {
  HealthResponse {
    status: "ok".to_string(),
  }
}

#[tauri::command]
fn version() -> VersionResponse {
  VersionResponse {
    version: env!("CARGO_PKG_VERSION").to_string(),
  }
}

#[tauri::command]
fn config_get(state: State<SharedState>) -> Result<AppConfig, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  Ok(state_guard.config.clone())
}

#[tauri::command]
fn project_add(
  app: tauri::AppHandle,
  state: State<SharedState>,
  projectPath: String,
) -> Result<String, String> {
  let normalized = normalize_path(&projectPath);
  if normalized == "/" {
    return Err("Project path is required.".to_string());
  }

  if !is_inside_git_work_tree(Path::new(&normalized)) {
    return Err("Only git repositories can be added as projects.".to_string());
  }

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  if !state_guard
    .config
    .projects
    .iter()
    .any(|entry| normalize_path(entry) == normalized)
  {
    state_guard.config.projects.push(normalized.clone());
  }

  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;
  drop(state_guard);
  app.state::<SkillWatcherControl>()
    .send(SkillWatchMessage::Reconfigure);

  Ok(normalized)
}

#[tauri::command]
fn project_remove(
  app: tauri::AppHandle,
  state: State<SharedState>,
  projectPath: String,
) -> Result<bool, String> {
  let normalized = normalize_path(&projectPath);
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let before = state_guard.config.projects.len();
  state_guard
    .config
    .projects
    .retain(|entry| normalize_path(entry) != normalized);
  let removed = before != state_guard.config.projects.len();
  if removed {
    refresh_skills_in_state(&mut state_guard);
  }
  state.persist(&state_guard)?;
  drop(state_guard);
  if removed {
    app.state::<SkillWatcherControl>()
      .send(SkillWatchMessage::Reconfigure);
  }
  Ok(removed)
}

#[tauri::command]
fn scan_root_add(state: State<SharedState>, rootPath: String) -> Result<String, String> {
  let normalized = normalize_path(&rootPath);
  if normalized == "/" {
    return Err("Workspace path is required.".to_string());
  }

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  if !state_guard
    .config
    .scan_roots
    .iter()
    .any(|entry| normalize_path(entry) == normalized)
  {
    state_guard.config.scan_roots.push(normalized.clone());
    state_guard.config.scan_roots.sort();
  }

  state.persist(&state_guard)?;

  Ok(normalized)
}

#[tauri::command]
fn scan_root_remove(state: State<SharedState>, rootPath: String) -> Result<bool, String> {
  let normalized = normalize_path(&rootPath);
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let before = state_guard.config.scan_roots.len();
  state_guard
    .config
    .scan_roots
    .retain(|entry| normalize_path(entry) != normalized);
  let removed = before != state_guard.config.scan_roots.len();
  state.persist(&state_guard)?;
  Ok(removed)
}

#[tauri::command]
fn scan_projects(state: State<SharedState>) -> Result<Vec<String>, String> {
  let (scan_roots, existing_projects) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    (
      state_guard.config.scan_roots.clone(),
      state_guard.config.projects.clone(),
    )
  };

  Ok(scan_projects_from_roots(&scan_roots, &existing_projects))
}

#[tauri::command]
fn scanned_projects_add(
  app: tauri::AppHandle,
  state: State<SharedState>,
  projectPaths: Vec<String>,
) -> Result<i64, String> {
  if projectPaths.is_empty() {
    return Ok(0);
  }

  let mut valid_paths = projectPaths
    .into_iter()
    .map(|entry| normalize_path(&entry))
    .filter(|entry| entry != "/")
    .filter(|entry| is_inside_git_work_tree(Path::new(entry)))
    .collect::<Vec<_>>();
  valid_paths.sort();
  valid_paths.dedup();

  if valid_paths.is_empty() {
    return Ok(0);
  }

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  let mut existing = state_guard
    .config
    .projects
    .iter()
    .map(|entry| normalize_path(entry))
    .collect::<HashSet<_>>();

  let mut added = 0_i64;
  for project_path in valid_paths {
    if existing.contains(&project_path) {
      continue;
    }
    state_guard.config.projects.push(project_path.clone());
    existing.insert(project_path);
    added += 1;
  }

  if added > 0 {
    refresh_skills_in_state(&mut state_guard);
  }
  state.persist(&state_guard)?;
  drop(state_guard);
  if added > 0 {
    app.state::<SkillWatcherControl>()
      .send(SkillWatchMessage::Reconfigure);
  }
  Ok(added)
}

#[tauri::command]
fn scan_and_add_projects(app: tauri::AppHandle, state: State<SharedState>) -> Result<i64, String> {
  let candidates = scan_projects(state.clone())?;
  scanned_projects_add(app, state, candidates)
}

#[tauri::command]
fn project_reorder(
  state: State<SharedState>,
  projectPaths: Vec<String>,
) -> Result<Vec<String>, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let reordered_projects = reorder_projects(&state_guard.config.projects, &projectPaths)?;
  if reordered_projects == state_guard.config.projects {
    return Ok(reordered_projects);
  }

  state_guard.config.projects = reordered_projects.clone();
  state.persist(&state_guard)?;
  Ok(reordered_projects)
}

#[tauri::command]
fn skill_list(state: State<SharedState>) -> Result<Vec<Skill>, String> {
  let (config, loadouts, kits) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    (
      state_guard.config.clone(),
      state_guard.kit_loadouts.clone(),
      state_guard.kits.clone(),
    )
  };

  Ok(collect_all_skills(&config, &loadouts, &kits))
}

#[tauri::command]
fn skill_sync(
  state: State<SharedState>,
  sourcePath: String,
  destParent: String,
  syncMode: Option<String>,
) -> Result<String, String> {
  let mode = syncMode
    .as_deref()
    .map(KitSyncMode::parse)
    .transpose()?
    .unwrap_or(KitSyncMode::Copy);

  let source_path = PathBuf::from(normalize_path(&sourcePath));
  let destination_parent_path = PathBuf::from(normalize_path(&destParent));
  let destination = sync_skill_into_parent(&source_path, &destination_parent_path, &mode)?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(destination)
}

#[tauri::command]
fn skill_collect_to_hub(state: State<SharedState>, sourcePath: String) -> Result<String, String> {
  let source_path = PathBuf::from(normalize_path(&sourcePath));
  let hub_path = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    state_guard.config.hub_path.clone()
  };

  let destination = sync_skill_into_parent(&source_path, Path::new(&hub_path), &KitSyncMode::Copy)?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(destination)
}

#[tauri::command]
fn skill_delete(state: State<SharedState>, path: String) -> Result<bool, String> {
  let normalized_path = normalize_path(&path);
  remove_path_if_exists(Path::new(&normalized_path))?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.skill_documents.remove(&normalized_path);
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(true)
}

#[tauri::command]
fn project_skill_set_enabled(
  state: State<SharedState>,
  path: String,
  enabled: bool,
) -> Result<String, String> {
  let normalized_path = normalize_path(&path);
  let (config, skill) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    let skill = state_guard
      .skills
      .iter()
      .find(|skill| skill.path == normalized_path)
      .cloned()
      .ok_or_else(|| format!("Skill not found: {}", normalized_path))?;
    (state_guard.config.clone(), skill)
  };

  let destination = set_project_skill_enabled_on_disk(&config, &skill, enabled)?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;
  Ok(destination)
}

#[tauri::command]
fn project_skill_package_set_enabled(
  state: State<SharedState>,
  projectPath: String,
  enabled: bool,
  packageId: Option<String>,
  packageName: Option<String>,
) -> Result<i64, String> {
  let normalized_project_path = normalize_path(&projectPath);
  let trimmed_package_id = optional_trim(packageId);
  let trimmed_package_name = optional_trim(packageName);
  if trimmed_package_id.is_none() && trimmed_package_name.is_none() {
    return Err("A skills package id or name is required.".to_string());
  }

  let (config, targets) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    let targets = state_guard
      .skills
      .iter()
      .filter(|skill| skill.location == SkillLocation::Project)
      .filter(|skill| skill.project_path.as_deref() == Some(normalized_project_path.as_str()))
      .filter(|skill| skill.enabled != enabled)
      .filter(|skill| {
        matches_project_package(
          skill,
          trimmed_package_id.as_deref(),
          trimmed_package_name.as_deref(),
        )
      })
      .cloned()
      .collect::<Vec<_>>();
    (state_guard.config.clone(), targets)
  };

  if targets.is_empty() {
    return Ok(0);
  }

  for skill in targets.iter() {
    set_project_skill_enabled_on_disk(&config, skill, enabled)?;
  }

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;
  Ok(targets.len() as i64)
}

#[tauri::command]
fn agent_config_update(
  app: tauri::AppHandle,
  state: State<SharedState>,
  agent: AgentConfig,
) -> Result<(), String> {
  let name = agent.name.trim().to_string();
  if name.is_empty() {
    return Err("Agent name is required.".to_string());
  }

  let global_path = normalize_path(&agent.global_path);
  if global_path == "/" {
    return Err("Agent global path is required.".to_string());
  }

  let project_path = agent.project_path.trim().to_string();
  if project_path.is_empty() {
    return Err("Agent project path is required.".to_string());
  }

  let instruction_file_name = agent_instruction_file_name(&agent);

  let normalized_agent = AgentConfig {
    name: name.clone(),
    global_path,
    project_path,
    instruction_file_name: Some(instruction_file_name),
    enabled: agent.enabled,
    is_custom: agent.is_custom,
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  if let Some(index) = state_guard
    .config
    .agents
    .iter()
    .position(|entry| entry.name == name)
  {
    state_guard.config.agents[index] = normalized_agent;
  } else {
    state_guard.config.agents.push(normalized_agent);
  }

  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;
  drop(state_guard);
  app.state::<SkillWatcherControl>()
    .send(SkillWatchMessage::Reconfigure);
  Ok(())
}

#[tauri::command]
fn agent_reorder(
  state: State<SharedState>,
  agentNames: Vec<String>,
) -> Result<Vec<String>, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let reordered_agents = reorder_enabled_agents(&state_guard.config.agents, &agentNames)?;
  let reordered_names = reordered_agents
    .iter()
    .filter(|agent| agent.enabled)
    .map(|agent| agent.name.clone())
    .collect::<Vec<_>>();

  if reordered_agents == state_guard.config.agents {
    return Ok(reordered_names);
  }

  state_guard.config.agents = reordered_agents;
  state.persist(&state_guard)?;
  Ok(reordered_names)
}

#[tauri::command]
fn agent_config_remove(
  app: tauri::AppHandle,
  state: State<SharedState>,
  agentName: String,
) -> Result<bool, String> {
  let trimmed_name = agentName.trim().to_string();
  if trimmed_name.is_empty() {
    return Err("Agent name is required.".to_string());
  }

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let before = state_guard.config.agents.len();
  state_guard
    .config
    .agents
    .retain(|agent| agent.name != trimmed_name);
  let removed = before != state_guard.config.agents.len();

  if removed {
    refresh_skills_in_state(&mut state_guard);
    state.persist(&state_guard)?;
  }
  drop(state_guard);
  if removed {
    app.state::<SkillWatcherControl>()
      .send(SkillWatchMessage::Reconfigure);
  }

  Ok(removed)
}

#[tauri::command]
fn skill_get_content(path: String) -> Result<SkillDocument, String> {
  let normalized_path = normalize_path(&path);
  let skill_md_path = Path::new(&normalized_path).join("SKILL.md");
  if !skill_md_path.exists() {
    return Err(format!("Skill not found: {}", normalized_path));
  }

  let raw_content = fs::read_to_string(&skill_md_path).map_err(|error| {
    format!(
      "Failed to read {}: {}",
      skill_md_path.display(),
      error
    )
  })?;

  Ok(parse_skill_document(&raw_content))
}

#[tauri::command]
fn skill_import(state: State<SharedState>, url: String) -> Result<SkillOperationResult, String> {
  let source = parse_skill_import_url(&url)?;
  let hub_path = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    state_guard.config.hub_path.clone()
  };

  let target_path = Path::new(&hub_path).join(&source.skill_name);
  if path_exists_or_symlink(&target_path) {
    return Err(format!(
      "Skill '{}' already exists at {}",
      source.skill_name,
      target_path.display()
    ));
  }

  let temp_repo_path = make_temp_directory("skills-hub-import")?;
  let import_result = (|| {
    run_git_clone(&source, &temp_repo_path)?;
    let source_path = select_import_source_path(&temp_repo_path, &source)?;
    if !source_path.join("SKILL.md").exists() {
      return Err("No SKILL.md found in source path.".to_string());
    }
    copy_directory_recursive(&source_path, &target_path)?;
    Ok::<(), String>(())
  })();

  let _ = remove_path_if_exists(&temp_repo_path);
  import_result?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(SkillOperationResult {
    success: true,
    message: format!("Imported {} from {}.", source.skill_name, source.source_url),
  })
}

#[tauri::command]
fn skill_create(
  state: State<SharedState>,
  name: String,
  description: String,
  content: String,
) -> Result<SkillOperationResult, String> {
  if name.trim().is_empty() {
    return Err("Name is required.".to_string());
  }
  if content.trim().is_empty() {
    return Err("Content is required.".to_string());
  }

  let safe_name = sanitize_skill_name(&name);
  let hub_path = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    state_guard.config.hub_path.clone()
  };
  let target_path = Path::new(&hub_path).join(&safe_name);
  if path_exists_or_symlink(&target_path) {
    return Err(format!("Skill '{}' already exists.", safe_name));
  }

  fs::create_dir_all(&target_path).map_err(|error| {
    format!(
      "Failed to create skill directory {}: {}",
      target_path.display(),
      error
    )
  })?;

  let file_content = if content.trim_start().starts_with("---") {
    content
  } else {
    let normalized_description = description.trim().replace('\n', " ");
    format!(
      "---\nname: {}\ndescription: {}\n---\n\n{}\n",
      name.trim(),
      normalized_description,
      content
    )
  };

  let skill_md_path = target_path.join("SKILL.md");
  fs::write(&skill_md_path, file_content).map_err(|error| {
    format!("Failed to write {}: {}", skill_md_path.display(), error)
  })?;

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(SkillOperationResult {
    success: true,
    message: format!("Successfully created skill: {}", safe_name),
  })
}

#[tauri::command]
fn open_external_url(url: String) -> Result<bool, String> {
  let normalized_url = url.trim();
  if normalized_url.is_empty() {
    return Err("URL is required.".to_string());
  }

  let lower = normalized_url.to_ascii_lowercase();
  if !(lower.starts_with("http://") || lower.starts_with("https://")) {
    return Err("Only http(s) URLs are supported.".to_string());
  }

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(normalized_url)
      .spawn()
      .map_err(|error| format!("Failed to open URL: {}", error))?;
    return Ok(true);
  }

  #[cfg(target_os = "windows")]
  {
    Command::new("cmd")
      .args(["/C", "start", "", normalized_url])
      .spawn()
      .map_err(|error| format!("Failed to open URL: {}", error))?;
    return Ok(true);
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    Command::new("xdg-open")
      .arg(normalized_url)
      .spawn()
      .map_err(|error| format!("Failed to open URL: {}", error))?;
    return Ok(true);
  }

  #[allow(unreachable_code)]
  Err("Unsupported platform for opening external URLs.".to_string())
}

#[tauri::command]
fn provider_list(state: State<SharedState>, appType: Option<String>) -> Result<Vec<ProviderRecord>, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  if let Some(app_value) = appType {
    let app_type = AppType::parse(&app_value)?;
    return Ok(state_guard
      .providers
      .iter()
      .filter(|provider| provider.app_type == app_type)
      .cloned()
      .collect());
  }

  Ok(state_guard.providers.clone())
}

#[tauri::command]
fn provider_current(state: State<SharedState>, appType: String) -> Result<Option<ProviderRecord>, String> {
  let app_type = AppType::parse(&appType)?;
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  Ok(
    state_guard
      .providers
      .iter()
      .find(|provider| provider.app_type == app_type && provider.is_current)
      .cloned(),
  )
}

#[tauri::command]
fn provider_get_raw(state: State<SharedState>, id: String) -> Result<ProviderRecord, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  state_guard
    .providers
    .iter()
    .find(|provider| provider.id == id)
    .cloned()
    .ok_or_else(|| "Provider not found.".to_string())
}

#[tauri::command]
fn provider_add(
  app: tauri::AppHandle,
  state: State<SharedState>,
  appType: String,
  name: String,
  config: Value,
) -> Result<ProviderRecord, String> {
  let app_type = AppType::parse(&appType)?;
  let created_at = now_millis();
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let has_current = state_guard
    .providers
    .iter()
    .any(|provider| provider.app_type == app_type && provider.is_current);

  let provider = ProviderRecord {
    id: state.next_id(&format!("provider-{}", app_type.as_str())),
    app_type,
    name: if name.trim().is_empty() {
      format!("{} provider", appType)
    } else {
      name.trim().to_string()
    },
    config,
    is_current: !has_current,
    created_at,
    updated_at: created_at,
  };

  state_guard.providers.push(provider.clone());
  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(provider)
}

#[tauri::command]
fn provider_update(
  app: tauri::AppHandle,
  state: State<SharedState>,
  id: String,
  name: Option<String>,
  config: Option<Value>,
) -> Result<ProviderRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let provider_index = state_guard
    .providers
    .iter()
    .position(|provider| provider.id == id)
    .ok_or_else(|| "Provider not found.".to_string())?;

  let existing = state_guard.providers[provider_index].clone();
  let mut updated = existing.clone();

  if let Some(next_name) = optional_trim(name) {
    updated.name = next_name;
  }

  let mut should_apply_live = false;
  if let Some(next_config) = config {
    should_apply_live = existing.is_current;
    updated.config = next_config;
  }

  updated.updated_at = now_millis();

  if should_apply_live {
    let live_before = read_live_provider_config(&updated.app_type)?;
    let next_config = merge_live_config(&updated.app_type, &live_before, &updated.config);
    validate_provider_config_for_live(&updated.app_type, &next_config)?;
    write_live_provider_config(&updated.app_type, &next_config)?;
  }

  state_guard.providers[provider_index] = updated.clone();

  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(updated)
}

#[tauri::command]
fn provider_delete(
  app: tauri::AppHandle,
  state: State<SharedState>,
  id: String,
) -> Result<bool, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let target = state_guard
    .providers
    .iter()
    .find(|provider| provider.id == id)
    .cloned()
    .ok_or_else(|| "Provider not found.".to_string())?;

  state_guard.providers.retain(|provider| provider.id != id);

  let has_current = state_guard
    .providers
    .iter()
    .any(|provider| provider.app_type == target.app_type && provider.is_current);

  if !has_current {
    if let Some(fallback) = state_guard
      .providers
      .iter_mut()
      .find(|provider| provider.app_type == target.app_type)
    {
      fallback.is_current = true;
      fallback.updated_at = now_millis();
    }
  }

  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(true)
}

#[tauri::command]
fn provider_switch(
  app: tauri::AppHandle,
  state: State<SharedState>,
  appType: String,
  providerId: String,
) -> Result<SwitchResult, String> {
  let app_type = AppType::parse(&appType)?;
  let result = switch_provider_internal(&state, app_type, &providerId)?;
  let _ = refresh_tray_menu(&app);
  Ok(result)
}

#[tauri::command]
fn provider_latest_backup(
  state: State<SharedState>,
  appType: String,
) -> Result<Option<ProviderBackupEntry>, String> {
  let app_type = AppType::parse(&appType)?;
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  Ok(state_guard
    .provider_backups
    .get(app_type.as_str())
    .and_then(|entries| entries.last())
    .cloned())
}

#[tauri::command]
fn provider_restore_latest_backup(
  app: tauri::AppHandle,
  state: State<SharedState>,
  appType: String,
) -> Result<SwitchResult, String> {
  let app_type = AppType::parse(&appType)?;
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let latest_backup = state_guard
    .provider_backups
    .get(app_type.as_str())
    .and_then(|entries| entries.last())
    .cloned()
    .ok_or_else(|| "No backup found for this app.".to_string())?;

  let live_before = read_live_provider_config(&app_type)?;
  let next_config = merge_live_config(&app_type, &live_before, &latest_backup.provider.config);
  validate_provider_config_for_live(&app_type, &next_config)?;
  write_live_provider_config(&app_type, &next_config)?;

  let switched_from = state_guard
    .providers
    .iter()
    .find(|provider| provider.app_type == app_type && provider.is_current)
    .map(|provider| provider.id.clone());

  for provider in state_guard
    .providers
    .iter_mut()
    .filter(|provider| provider.app_type == app_type)
  {
    provider.is_current = false;
    provider.updated_at = now_millis();
  }

  let restored_id = if let Some(existing) = state_guard
    .providers
    .iter_mut()
    .find(|provider| provider.id == latest_backup.provider.id)
  {
    existing.name = latest_backup.provider.name.clone();
    existing.config = latest_backup.provider.config.clone();
    existing.is_current = true;
    existing.updated_at = now_millis();
    existing.id.clone()
  } else {
    let id = state.next_id(&format!("provider-{}-restored", app_type.as_str()));
    let restored = ProviderRecord {
      id: id.clone(),
      app_type: app_type.clone(),
      name: latest_backup.provider.name.clone(),
      config: latest_backup.provider.config.clone(),
      is_current: true,
      created_at: now_millis(),
      updated_at: now_millis(),
    };
    state_guard.providers.push(restored);
    id
  };

  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(SwitchResult {
    app_type,
    current_provider_id: restored_id.clone(),
    backup_id: now_millis(),
    switched_from,
    switched_to: restored_id,
  })
}

#[tauri::command]
fn provider_capture_live(
  app: tauri::AppHandle,
  state: State<SharedState>,
  appType: String,
  name: String,
  profile: Option<Value>,
) -> Result<ProviderRecord, String> {
  let app_type = AppType::parse(&appType)?;
  let live_config = read_live_provider_config(&app_type)?;
  let mut config_obj = match sanitize_official_capture_config(&app_type, &live_config) {
    Value::Object(config_map) => config_map,
    _ => Map::new(),
  };

  let mut profile_obj = Map::new();
  profile_obj.insert("kind".to_string(), Value::String("official".to_string()));

  if let Some(Value::Object(profile_map)) = profile {
    for (key, value) in profile_map.into_iter() {
      profile_obj.insert(key, value);
    }
  }

  profile_obj.insert("kind".to_string(), Value::String("official".to_string()));
  config_obj.insert("_profile".to_string(), Value::Object(profile_obj));

  let provider = ProviderRecord {
    id: state.next_id(&format!("provider-{}-official", app_type.as_str())),
    app_type,
    name: if name.trim().is_empty() {
      format!("{} official", appType)
    } else {
      name.trim().to_string()
    },
    config: Value::Object(config_obj),
    is_current: false,
    created_at: now_millis(),
    updated_at: now_millis(),
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.providers.push(provider.clone());
  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(provider)
}

#[tauri::command]
fn universal_provider_list(state: State<SharedState>) -> Result<Vec<UniversalProviderRecord>, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  Ok(state_guard.universal_providers.clone())
}

#[tauri::command]
fn universal_provider_get_raw(
  state: State<SharedState>,
  id: String,
) -> Result<UniversalProviderRecord, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard
    .universal_providers
    .iter()
    .find(|provider| provider.id == id)
    .cloned()
    .ok_or_else(|| "Universal provider not found.".to_string())
}

#[tauri::command]
fn universal_provider_add(
  state: State<SharedState>,
  name: String,
  baseUrl: String,
  apiKey: String,
  websiteUrl: Option<String>,
  notes: Option<String>,
  apps: Option<UniversalProviderApps>,
  models: Option<UniversalProviderModels>,
) -> Result<UniversalProviderRecord, String> {
  let trimmed_name = name.trim().to_string();
  let trimmed_base_url = baseUrl.trim().to_string();
  let trimmed_api_key = apiKey.trim().to_string();

  if trimmed_name.is_empty() || trimmed_base_url.is_empty() || trimmed_api_key.is_empty() {
    return Err("Universal provider name/baseUrl/apiKey are required.".to_string());
  }

  let record = UniversalProviderRecord {
    id: state.next_id("universal"),
    name: trimmed_name,
    base_url: trimmed_base_url,
    api_key: trimmed_api_key,
    website_url: optional_trim(websiteUrl),
    notes: optional_trim(notes),
    apps: UniversalProviderApps::with_defaults(apps),
    models: models.unwrap_or_default(),
    created_at: now_millis(),
    updated_at: now_millis(),
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.universal_providers.push(record.clone());
  state.persist(&state_guard)?;
  Ok(record)
}

#[tauri::command]
fn universal_provider_update(
  state: State<SharedState>,
  id: String,
  name: Option<String>,
  baseUrl: Option<String>,
  apiKey: Option<String>,
  websiteUrl: Option<String>,
  notes: Option<String>,
  apps: Option<UniversalProviderApps>,
  models: Option<UniversalProviderModels>,
) -> Result<UniversalProviderRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let updated = {
    let provider = state_guard
      .universal_providers
      .iter_mut()
      .find(|provider| provider.id == id)
      .ok_or_else(|| "Universal provider not found.".to_string())?;

    if let Some(next_name) = optional_trim(name) {
      provider.name = next_name;
    }
    if let Some(next_base_url) = optional_trim(baseUrl) {
      provider.base_url = next_base_url;
    }
    if let Some(next_api_key) = optional_trim(apiKey) {
      provider.api_key = next_api_key;
    }
    provider.website_url = optional_trim(websiteUrl).or(provider.website_url.clone());
    provider.notes = optional_trim(notes).or(provider.notes.clone());

    if let Some(next_apps) = apps {
      provider.apps = next_apps;
    }
    if let Some(next_models) = models {
      provider.models = next_models;
    }

    provider.updated_at = now_millis();
    provider.clone()
  };

  state.persist(&state_guard)?;
  Ok(updated)
}

#[tauri::command]
fn universal_provider_delete(state: State<SharedState>, id: String) -> Result<bool, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  let before = state_guard.universal_providers.len();
  state_guard.universal_providers.retain(|provider| provider.id != id);
  let deleted = before != state_guard.universal_providers.len();
  if deleted {
    state.persist(&state_guard)?;
  }
  Ok(deleted)
}

#[tauri::command]
fn universal_provider_apply(
  app: tauri::AppHandle,
  state: State<SharedState>,
  id: String,
) -> Result<Vec<ProviderRecord>, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let universal = state_guard
    .universal_providers
    .iter()
    .find(|provider| provider.id == id)
    .cloned()
    .ok_or_else(|| "Universal provider not found.".to_string())?;

  let mut applied = Vec::new();

  for app_type in [AppType::Claude, AppType::Codex, AppType::Gemini] {
    let enabled = match app_type {
      AppType::Claude => universal.apps.claude,
      AppType::Codex => universal.apps.codex,
      AppType::Gemini => universal.apps.gemini,
    };

    if !enabled {
      continue;
    }

    let config = build_provider_config_for_universal(&app_type, &universal);
    if let Some(existing) = state_guard.providers.iter_mut().find(|provider| {
      provider.app_type == app_type
        && profile_universal_id(provider).as_deref() == Some(universal.id.as_str())
    }) {
      existing.name = format!("{} ({})", universal.name, app_type.as_str());
      existing.config = config;
      existing.updated_at = now_millis();
      applied.push(existing.clone());
      continue;
    }

    let created = ProviderRecord {
      id: state.next_id(&format!("provider-{}-universal", app_type.as_str())),
      app_type: app_type.clone(),
      name: format!("{} ({})", universal.name, app_type.as_str()),
      config,
      is_current: false,
      created_at: now_millis(),
      updated_at: now_millis(),
    };

    state_guard.providers.push(created.clone());
    applied.push(created);
  }

  state.persist(&state_guard)?;
  drop(state_guard);
  let _ = refresh_tray_menu(&app);
  Ok(applied)
}

#[tauri::command]
fn kit_policy_list(state: State<SharedState>) -> Result<Vec<KitPolicyRecord>, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  Ok(state_guard.kit_policies.clone())
}

#[tauri::command]
fn kit_policy_add(
  state: State<SharedState>,
  name: String,
  description: Option<String>,
  content: String,
) -> Result<KitPolicyRecord, String> {
  let trimmed_name = name.trim().to_string();
  if trimmed_name.is_empty() || content.trim().is_empty() {
    return Err("Policy name/content are required.".to_string());
  }

  let record = KitPolicyRecord {
    id: state.next_id("kit-policy"),
    name: trimmed_name,
    description: optional_trim(description),
    content,
    created_at: now_millis(),
    updated_at: now_millis(),
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.kit_policies.push(record.clone());
  state.persist(&state_guard)?;
  Ok(record)
}

#[tauri::command]
fn kit_policy_update(
  state: State<SharedState>,
  id: String,
  name: Option<String>,
  description: Option<String>,
  content: Option<String>,
) -> Result<KitPolicyRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  let updated = {
    let policy = state_guard
      .kit_policies
      .iter_mut()
      .find(|policy| policy.id == id)
      .ok_or_else(|| "Policy not found.".to_string())?;

    if let Some(next_name) = optional_trim(name) {
      policy.name = next_name;
    }
    if let Some(next_description) = optional_trim(description) {
      policy.description = Some(next_description);
    }
    if let Some(next_content) = content {
      policy.content = next_content;
    }

    policy.updated_at = now_millis();
    policy.clone()
  };

  state.persist(&state_guard)?;
  Ok(updated)
}

#[tauri::command]
fn kit_policy_delete(state: State<SharedState>, id: String) -> Result<bool, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  if state_guard
    .kits
    .iter()
    .any(|kit| kit.policy_id.as_deref() == Some(id.as_str()))
  {
    return Err("该 AGENTS.md 正在被 Kit 使用，无法删除。".to_string());
  }

  let before = state_guard.kit_policies.len();
  state_guard.kit_policies.retain(|policy| policy.id != id);
  let deleted = before != state_guard.kit_policies.len();
  if deleted {
    state.persist(&state_guard)?;
  }
  Ok(deleted)
}

#[tauri::command]
fn kit_loadout_list(state: State<SharedState>) -> Result<Vec<KitLoadoutRecord>, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  Ok(state_guard.kit_loadouts.clone())
}

#[tauri::command]
fn kit_loadout_add(
  state: State<SharedState>,
  name: String,
  description: Option<String>,
  items: Vec<KitLoadoutItemInput>,
) -> Result<KitLoadoutRecord, String> {
  let trimmed_name = name.trim().to_string();
  if trimmed_name.is_empty() {
    return Err("Loadout name is required.".to_string());
  }
  if items.is_empty() {
    return Err("Loadout requires at least one skill.".to_string());
  }

  let parsed_items = items
    .into_iter()
    .enumerate()
    .map(|(index, item)| {
      let mode = item
        .mode
        .as_deref()
        .map(KitSyncMode::parse)
        .transpose()?
        .unwrap_or(KitSyncMode::Copy);

      Ok::<KitLoadoutItem, String>(KitLoadoutItem {
        skill_path: normalize_path(&item.skill_path),
        mode,
        sort_order: item.sort_order.unwrap_or(index as i64),
      })
    })
    .collect::<Result<Vec<_>, _>>()?;

  let record = KitLoadoutRecord {
    id: state.next_id("kit-loadout"),
    name: trimmed_name,
    description: optional_trim(description),
    items: parsed_items,
    import_source: None,
    created_at: now_millis(),
    updated_at: now_millis(),
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.kit_loadouts.push(record.clone());
  state.persist(&state_guard)?;
  Ok(record)
}

#[tauri::command]
fn kit_loadout_update(
  state: State<SharedState>,
  id: String,
  name: Option<String>,
  description: Option<String>,
  items: Option<Vec<KitLoadoutItemInput>>,
) -> Result<KitLoadoutRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let updated = {
    let loadout = state_guard
      .kit_loadouts
      .iter_mut()
      .find(|loadout| loadout.id == id)
      .ok_or_else(|| "Loadout not found.".to_string())?;

    if let Some(next_name) = optional_trim(name) {
      loadout.name = next_name;
    }
    if let Some(next_description) = optional_trim(description) {
      loadout.description = Some(next_description);
    }

    if let Some(next_items) = items {
      if next_items.is_empty() {
        return Err("Loadout requires at least one skill.".to_string());
      }

      loadout.items = next_items
        .into_iter()
        .enumerate()
        .map(|(index, item)| {
          let mode = item
            .mode
            .as_deref()
            .map(KitSyncMode::parse)
            .transpose()?
            .unwrap_or(KitSyncMode::Copy);

          Ok::<KitLoadoutItem, String>(KitLoadoutItem {
            skill_path: normalize_path(&item.skill_path),
            mode,
            sort_order: item.sort_order.unwrap_or(index as i64),
          })
        })
        .collect::<Result<Vec<_>, _>>()?;
    }

    loadout.updated_at = now_millis();
    loadout.clone()
  };

  state.persist(&state_guard)?;
  Ok(updated)
}

#[tauri::command]
fn kit_loadout_delete(state: State<SharedState>, id: String) -> Result<bool, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  if state_guard
    .kits
    .iter()
    .any(|kit| kit.loadout_id.as_deref() == Some(id.as_str()))
  {
    return Err("该 Skills package 正在被 Kit 使用，无法删除。".to_string());
  }

  let before = state_guard.kit_loadouts.len();
  state_guard.kit_loadouts.retain(|loadout| loadout.id != id);
  let deleted = before != state_guard.kit_loadouts.len();
  if deleted {
    state.persist(&state_guard)?;
  }
  Ok(deleted)
}

fn import_kit_loadout_from_repo_internal(
  state: State<SharedState>,
  url: String,
  name: Option<String>,
  description: Option<String>,
  overwrite: Option<bool>,
  skill_names: Option<Vec<String>>,
) -> Result<KitLoadoutImportResult, String> {
  let source = parse_skill_import_url(&url)?;
  let (hub_path, existing_loadouts) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    (
      state_guard.config.hub_path.clone(),
      state_guard.kit_loadouts.clone(),
    )
  };

  let temp_repo_path = make_temp_directory("skills-hub-kit-import")?;
  let result = (|| -> Result<KitLoadoutImportResult, String> {
    run_git_clone(&source, &temp_repo_path)?;
    let resolved_branch = resolve_git_head_branch(&temp_repo_path, source.branch.as_deref());
    let (root_path, root_subdir) = resolve_loadout_import_root(&temp_repo_path, &source)?;

    let mut entries = Vec::new();
    collect_installable_skill_dirs(&root_path, &root_path, &mut entries)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    if entries.is_empty() {
      return Err("No installable skills found in remote source.".to_string());
    }

    assert_unique_remote_skill_names(&entries)?;
    let selected_entries =
      select_remote_skill_entries(&entries, &skill_names.unwrap_or_default(), &source.repo_web_url)?;

    let import_source_key = build_loadout_import_source_key(&source.repo_web_url, &root_subdir);
    let existing_loadout = existing_loadouts
      .iter()
      .find(|loadout| same_loadout_import_source(&loadout.import_source, &source.repo_web_url, &root_subdir))
      .cloned();

    let explicit_name = optional_trim(name.clone());
    let explicit_description = if description.is_some() {
      optional_trim(description.clone())
    } else {
      None
    };
    let derived_name = build_default_loadout_name(&source, &root_subdir);
    let loadout_name = explicit_name
      .clone()
      .or_else(|| existing_loadout.as_ref().map(|loadout| loadout.name.clone()))
      .unwrap_or(derived_name);

    if existing_loadout.is_none() && explicit_name.is_none() {
      let has_conflicting_local_name = existing_loadouts.iter().any(|loadout| {
        loadout.import_source.is_none() && loadout.name == loadout_name
      });
      if has_conflicting_local_name {
        return Err(format!(
          "Skills package name '{}' is already used by a local package. Use a custom package name.",
          loadout_name
        ));
      }
    }

    fs::create_dir_all(&hub_path)
      .map_err(|error| format!("Failed to create hub directory {}: {}", hub_path, error))?;

    let overwrite_requested = overwrite.unwrap_or(false);
    let mut conflicts = Vec::new();
    let mut overwritten_count = 0_i64;
    for entry in selected_entries.iter() {
      let destination = Path::new(&hub_path).join(&entry.name);
      if !path_exists_or_symlink(&destination) {
        continue;
      }

      overwritten_count += 1;
      let existing_key = read_skill_loadout_key(&destination);
      if existing_key.as_deref() == Some(import_source_key.as_str()) {
        continue;
      }

      conflicts.push(normalize_path(destination.to_string_lossy().as_ref()));
    }

    if !conflicts.is_empty() && !overwrite_requested {
      return Err(format!(
        "Hub skill destinations already exist: {}. Enable overwrite to replace them.",
        conflicts.join(", ")
      ));
    }

    let imported_at = fallback_timestamp_string();
    let source_last_updated_at = read_git_last_updated_at(
      &temp_repo_path,
      if root_subdir == "/" { "" } else { root_subdir.as_str() },
    );
    let last_safety_check = assess_imported_entries_safety(&selected_entries)?;
    let import_source = KitLoadoutImportSource {
      repo_web_url: source.repo_web_url.clone(),
      repo_url: source.repo_url.clone(),
      original_url: source.source_url.clone(),
      branch: Some(resolved_branch.clone()),
      root_subdir: root_subdir.clone(),
      imported_at: imported_at.clone(),
      last_source_updated_at: source_last_updated_at,
      last_safety_check: Some(last_safety_check),
    };

    let mut imported_skill_paths = Vec::new();
    let mut items = Vec::new();

    for (index, entry) in selected_entries.iter().enumerate() {
      let destination = Path::new(&hub_path).join(&entry.name);
      let source_subdir = join_relative_segments(&[
        root_subdir.as_str(),
        if entry.relative_path == "." {
          ""
        } else {
          entry.relative_path.as_str()
        },
      ]);
      let source_url = build_skill_source_url(&source, &resolved_branch, &source_subdir);
      let source_last_updated = read_git_last_updated_at(&temp_repo_path, &source_subdir);

      remove_path_if_exists(&destination)?;
      copy_directory_recursive(&entry.full_path, &destination)?;
      write_skill_import_metadata(
        &destination,
        &source.repo_web_url,
        &source_url,
        if source_subdir.is_empty() {
          "/"
        } else {
          source_subdir.as_str()
        },
        &source_last_updated,
        &imported_at,
        &import_source_key,
      )?;

      let normalized_destination = normalize_path(destination.to_string_lossy().as_ref());
      imported_skill_paths.push(normalized_destination.clone());
      items.push(KitLoadoutItem {
        skill_path: normalized_destination,
        mode: KitSyncMode::Copy,
        sort_order: index as i64,
      });
    }

    let mut removed_count = 0_i64;
    if let Some(existing_loadout) = &existing_loadout {
      let imported_path_set = imported_skill_paths.iter().cloned().collect::<HashSet<_>>();
      for item in existing_loadout.items.iter() {
        if imported_path_set.contains(&item.skill_path) {
          continue;
        }

        let existing_key = read_skill_loadout_key(Path::new(&item.skill_path));
        if existing_key.as_deref() != Some(import_source_key.as_str()) {
          continue;
        }

        remove_path_if_exists(Path::new(&item.skill_path))?;
        removed_count += 1;
      }
    }

    let now = now_millis();
    let loadout_status = if existing_loadout.is_some() {
      "updated".to_string()
    } else {
      "created".to_string()
    };
    let loadout = if let Some(existing_loadout) = existing_loadout {
      KitLoadoutRecord {
        id: existing_loadout.id,
        name: explicit_name.unwrap_or(existing_loadout.name),
        description: if description.is_some() {
          explicit_description
        } else {
          existing_loadout.description
        },
        items,
        import_source: Some(import_source.clone()),
        created_at: existing_loadout.created_at,
        updated_at: now,
      }
    } else {
      KitLoadoutRecord {
        id: state.next_id("kit-loadout"),
        name: loadout_name,
        description: explicit_description,
        items,
        import_source: Some(import_source.clone()),
        created_at: now,
        updated_at: now,
      }
    };

    {
      let mut state_guard = state
        .state
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

      if let Some(existing_index) = state_guard
        .kit_loadouts
        .iter()
        .position(|entry| entry.id == loadout.id)
      {
        state_guard.kit_loadouts[existing_index] = loadout.clone();
      } else {
        state_guard.kit_loadouts.push(loadout.clone());
      }

      refresh_skills_in_state(&mut state_guard);
      state.persist(&state_guard)?;
    }

    Ok(KitLoadoutImportResult {
      loadout,
      loadout_status,
      imported_skill_paths,
      overwritten_count,
      removed_count,
      discovered_count: selected_entries.len() as i64,
      source: import_source,
    })
  })();

  let _ = remove_path_if_exists(&temp_repo_path);
  result
}

#[tauri::command]
fn kit_loadout_import_from_repo(
  state: State<SharedState>,
  url: String,
  name: Option<String>,
  description: Option<String>,
  overwrite: Option<bool>,
) -> Result<KitLoadoutImportResult, String> {
  import_kit_loadout_from_repo_internal(state, url, name, description, overwrite, None)
}

#[tauri::command]
fn official_preset_list() -> Result<Vec<OfficialPresetSummary>, String> {
  let catalog = official_preset_catalog()?;
  Ok(catalog
    .presets
    .iter()
    .map(official_preset_to_summary)
    .collect())
}

#[tauri::command]
fn official_preset_get(id: String) -> Result<OfficialPresetRecord, String> {
  let catalog = official_preset_catalog()?;
  catalog
    .presets
    .into_iter()
    .find(|preset| preset.id == id)
    .ok_or_else(|| format!("Official preset not found: {}", id))
}

#[tauri::command]
fn official_preset_install(
  state: State<SharedState>,
  id: String,
  overwrite: Option<bool>,
) -> Result<OfficialPresetInstallResult, String> {
  let catalog = official_preset_catalog()?;
  let catalog_version = catalog.version;
  let preset = catalog
    .presets
    .iter()
    .find(|entry| entry.id == id)
    .cloned()
    .ok_or_else(|| format!("Official preset not found: {}", id))?;
  let source_selection_plan = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    build_official_source_selection_plan(&catalog, &state_guard.kits, &preset)?
  };

  let policy_content = official_policy_template_content(&preset.policy.template)?
    .trim()
    .to_string();
  if policy_content.is_empty() {
    return Err(format!(
      "Official policy template is empty: {}",
      preset.policy.template
    ));
  }

  let mut imported_sources = Vec::new();
  for source in preset.sources.iter() {
    let source_key = build_official_source_import_key(source)?;
    let required_skill_names = source_selection_plan
      .get(&source_key)
      .map(|selected| selected.iter().cloned().collect::<Vec<_>>())
      .unwrap_or_else(|| source.selected_skills.clone());
    let loadout_result = import_kit_loadout_from_repo_internal(
      state.clone(),
      source.url.clone(),
      Some(build_official_source_loadout_name(&preset.name, &source.name)),
      source.description.clone(),
      overwrite,
      Some(required_skill_names),
    )?;

    imported_sources.push((source.clone(), loadout_result.loadout));
  }

  let curated_name = build_official_curated_loadout_name(&preset.name);
  let kit_name = build_official_kit_name(&preset.name);

  let (policy_record, curated_loadout_record, kit_record, imported_source_rows) = {
    let mut state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;

    let policy_record = if let Some(existing) =
      find_kit_policy_by_name(&state_guard.kit_policies, &preset.policy.name).cloned()
    {
      let next = KitPolicyRecord {
        id: existing.id,
        name: existing.name,
        description: preset.policy.description.clone(),
        content: policy_content.clone(),
        created_at: existing.created_at,
        updated_at: now_millis(),
      };
      if let Some(index) = state_guard
        .kit_policies
        .iter()
        .position(|entry| entry.id == next.id)
      {
        state_guard.kit_policies[index] = next.clone();
      }
      next
    } else {
      let next = KitPolicyRecord {
        id: state.next_id("kit-policy"),
        name: preset.policy.name.clone(),
        description: preset.policy.description.clone(),
        content: policy_content.clone(),
        created_at: now_millis(),
        updated_at: now_millis(),
      };
      state_guard.kit_policies.push(next.clone());
      next
    };

    let mut curated_items = Vec::new();
    let mut curated_paths = HashSet::new();
    for (source, loadout) in imported_sources.iter() {
      let by_name = loadout
        .items
        .iter()
        .map(|item| {
          (
            path_tail_relative(&item.skill_path),
            item.clone(),
          )
        })
        .collect::<HashMap<_, _>>();

      let mut missing = Vec::new();
      for skill_name in source.selected_skills.iter() {
        let Some(item) = by_name.get(skill_name) else {
          missing.push(skill_name.clone());
          continue;
        };

        if curated_paths.insert(item.skill_path.clone()) {
          curated_items.push(KitLoadoutItem {
            skill_path: item.skill_path.clone(),
            mode: KitSyncMode::Copy,
            sort_order: curated_items.len() as i64,
          });
        }
      }

      if !missing.is_empty() {
        let available = by_name.keys().cloned().collect::<Vec<_>>().join(", ");
        return Err(format!(
          "Official preset source '{}' is missing expected skills: {}. Available skills: {}",
          source.name,
          missing.join(", "),
          available
        ));
      }
    }

    let curated_loadout_record = if let Some(existing) =
      find_kit_loadout_by_name(&state_guard.kit_loadouts, &curated_name).cloned()
    {
      let next = KitLoadoutRecord {
        id: existing.id,
        name: existing.name,
        description: preset.description.clone(),
        items: curated_items,
        import_source: None,
        created_at: existing.created_at,
        updated_at: now_millis(),
      };
      if let Some(index) = state_guard
        .kit_loadouts
        .iter()
        .position(|entry| entry.id == next.id)
      {
        state_guard.kit_loadouts[index] = next.clone();
      }
      next
    } else {
      let next = KitLoadoutRecord {
        id: state.next_id("kit-loadout"),
        name: curated_name.clone(),
        description: preset.description.clone(),
        items: curated_items,
        import_source: None,
        created_at: now_millis(),
        updated_at: now_millis(),
      };
      state_guard.kit_loadouts.push(next.clone());
      next
    };

    let managed_source = build_official_managed_source(
      &preset,
      catalog_version,
      &policy_record,
      &curated_loadout_record,
      &imported_sources,
    );

    let kit_record = if let Some(existing) = find_kit_by_name(&state_guard.kits, &kit_name).cloned() {
      let next = KitRecord {
        id: existing.id,
        name: existing.name,
        description: preset.description.clone(),
        policy_id: Some(policy_record.id.clone()),
        loadout_id: Some(curated_loadout_record.id.clone()),
        managed_source: Some(managed_source.clone()),
        last_applied_at: existing.last_applied_at,
        last_applied_target: existing.last_applied_target,
        created_at: existing.created_at,
        updated_at: now_millis(),
      };
      if let Some(index) = state_guard.kits.iter().position(|entry| entry.id == next.id) {
        state_guard.kits[index] = next.clone();
      }
      next
    } else {
      let next = KitRecord {
        id: state.next_id("kit"),
        name: kit_name.clone(),
        description: preset.description.clone(),
        policy_id: Some(policy_record.id.clone()),
        loadout_id: Some(curated_loadout_record.id.clone()),
        managed_source: Some(managed_source),
        last_applied_at: None,
        last_applied_target: None,
        created_at: now_millis(),
        updated_at: now_millis(),
      };
      state_guard.kits.push(next.clone());
      next
    };

    let imported_source_rows = imported_sources
      .iter()
      .map(|(source, loadout)| OfficialPresetInstallSource {
        id: source.id.clone(),
        name: source.name.clone(),
        loadout_id: loadout.id.clone(),
        imported_skill_count: loadout.items.len() as i64,
        selected_skill_count: source.selected_skills.len() as i64,
      })
      .collect::<Vec<_>>();

    prune_unused_official_source_loadouts(&mut state_guard);
    refresh_skills_in_state(&mut state_guard);
    state.persist(&state_guard)?;

    Ok::<_, String>((
      policy_record,
      curated_loadout_record,
      kit_record,
      imported_source_rows,
    ))
  }?;

  Ok(OfficialPresetInstallResult {
    preset: OfficialPresetSummaryLite {
      id: preset.id,
      name: preset.name,
      description: preset.description,
    },
    policy: policy_record,
    loadout: curated_loadout_record,
    kit: kit_record,
    imported_sources: imported_source_rows,
  })
}

#[tauri::command]
fn official_preset_install_all(
  state: State<SharedState>,
  overwrite: Option<bool>,
) -> Result<OfficialPresetBatchInstallResult, String> {
  let catalog = official_preset_catalog()?;
  let mut installed = Vec::new();
  for preset in catalog.presets {
    installed.push(official_preset_install(
      state.clone(),
      preset.id,
      overwrite,
    )?);
  }
  Ok(OfficialPresetBatchInstallResult { installed })
}

#[tauri::command]
fn kit_list(state: State<SharedState>) -> Result<Vec<KitRecord>, String> {
  let state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  Ok(state_guard.kits.clone())
}

#[tauri::command]
fn kit_add(
  state: State<SharedState>,
  name: String,
  description: Option<String>,
  policyId: Option<String>,
  loadoutId: Option<String>,
) -> Result<KitRecord, String> {
  let trimmed_name = name.trim().to_string();
  if trimmed_name.is_empty() {
    return Err("Kit name is required.".to_string());
  }
  let policy_id = optional_trim(policyId);
  let loadout_id = optional_trim(loadoutId);
  if policy_id.is_none() && loadout_id.is_none() {
    return Err("Kit must include at least AGENTS.md or Skills package.".to_string());
  }

  {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    if let Some(policy_id) = policy_id.as_deref() {
      if !state_guard.kit_policies.iter().any(|entry| entry.id == policy_id) {
        return Err("Selected AGENTS.md not found.".to_string());
      }
    }
    if let Some(loadout_id) = loadout_id.as_deref() {
      if !state_guard.kit_loadouts.iter().any(|entry| entry.id == loadout_id) {
        return Err("Selected Skills package not found.".to_string());
      }
    }
  }

  let record = KitRecord {
    id: state.next_id("kit"),
    name: trimmed_name,
    description: optional_trim(description),
    policy_id,
    loadout_id,
    managed_source: None,
    last_applied_at: None,
    last_applied_target: None,
    created_at: now_millis(),
    updated_at: now_millis(),
  };

  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  state_guard.kits.push(record.clone());
  prune_unused_official_source_loadouts(&mut state_guard);
  state.persist(&state_guard)?;
  Ok(record)
}

#[tauri::command]
fn kit_update(
  state: State<SharedState>,
  id: String,
  name: Option<String>,
  description: Option<String>,
  policyId: Option<String>,
  loadoutId: Option<String>,
) -> Result<KitRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let current_kit = state_guard
    .kits
    .iter()
    .find(|kit| kit.id == id)
    .cloned()
    .ok_or_else(|| "Kit not found.".to_string())?;

  let next_name = optional_trim(name).unwrap_or(current_kit.name.clone());
  let next_description = if description.is_some() {
    optional_trim(description)
  } else {
    current_kit.description.clone()
  };
  let next_policy_id = if let Some(policy_id) = policyId {
    optional_trim(Some(policy_id))
  } else {
    current_kit.policy_id.clone()
  };
  let next_loadout_id = if let Some(loadout_id) = loadoutId {
    optional_trim(Some(loadout_id))
  } else {
    current_kit.loadout_id.clone()
  };

  if next_policy_id.is_none() && next_loadout_id.is_none() {
    return Err("Kit must include at least AGENTS.md or Skills package.".to_string());
  }
  if let Some(policy_id) = next_policy_id.as_deref() {
    if !state_guard.kit_policies.iter().any(|entry| entry.id == policy_id) {
      return Err("Selected AGENTS.md not found.".to_string());
    }
  }
  if let Some(loadout_id) = next_loadout_id.as_deref() {
    if !state_guard.kit_loadouts.iter().any(|entry| entry.id == loadout_id) {
      return Err("Selected Skills package not found.".to_string());
    }
  }

  let updated = {
    let kit = state_guard
      .kits
      .iter_mut()
      .find(|kit| kit.id == id)
      .ok_or_else(|| "Kit not found.".to_string())?;

    kit.name = next_name.clone();
    kit.description = next_description.clone();
    kit.policy_id = next_policy_id.clone();
    kit.loadout_id = next_loadout_id.clone();
    kit.managed_source = current_kit.managed_source.clone();
    kit.updated_at = now_millis();
    kit.clone()
  };

  prune_unused_official_source_loadouts(&mut state_guard);
  state.persist(&state_guard)?;
  Ok(updated)
}

#[tauri::command]
fn kit_delete(state: State<SharedState>, id: String) -> Result<bool, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;
  let before = state_guard.kits.len();
  state_guard.kits.retain(|kit| kit.id != id);
  let deleted = before != state_guard.kits.len();
  if deleted {
    prune_unused_official_source_loadouts(&mut state_guard);
    state.persist(&state_guard)?;
  }
  Ok(deleted)
}

#[tauri::command]
fn kit_restore_managed_baseline(
  state: State<SharedState>,
  id: String,
) -> Result<KitRecord, String> {
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let kit_index = state_guard
    .kits
    .iter()
    .position(|entry| entry.id == id)
    .ok_or_else(|| "Kit not found.".to_string())?;
  let existing = state_guard.kits[kit_index].clone();
  let mut managed_source = existing
    .managed_source
    .clone()
    .ok_or_else(|| "Only managed official kits can be restored.".to_string())?;
  if managed_source.kind != "official_preset" {
    return Err("Only managed official kits can be restored.".to_string());
  }

  let ts = now_millis();
  let baseline = managed_source.baseline.clone();

  let policy_record = KitPolicyRecord {
    id: baseline.policy.id.clone(),
    name: baseline.policy.name.clone(),
    description: baseline.policy.description.clone(),
    content: baseline.policy.content.clone(),
    created_at: state_guard
      .kit_policies
      .iter()
      .find(|entry| entry.id == baseline.policy.id)
      .map(|entry| entry.created_at)
      .unwrap_or(ts),
    updated_at: ts,
  };
  if let Some(index) = state_guard
    .kit_policies
    .iter()
    .position(|entry| entry.id == policy_record.id)
  {
    state_guard.kit_policies[index] = policy_record.clone();
  } else {
    state_guard.kit_policies.push(policy_record.clone());
  }

  let loadout_record = KitLoadoutRecord {
    id: baseline.loadout.id.clone(),
    name: baseline.loadout.name.clone(),
    description: baseline.loadout.description.clone(),
    items: baseline.loadout.items.clone(),
    import_source: None,
    created_at: state_guard
      .kit_loadouts
      .iter()
      .find(|entry| entry.id == baseline.loadout.id)
      .map(|entry| entry.created_at)
      .unwrap_or(ts),
    updated_at: ts,
  };
  if let Some(index) = state_guard
    .kit_loadouts
    .iter()
    .position(|entry| entry.id == loadout_record.id)
  {
    state_guard.kit_loadouts[index] = loadout_record.clone();
  } else {
    state_guard.kit_loadouts.push(loadout_record.clone());
  }

  managed_source.last_restored_at = Some(ts);
  managed_source.restore_count += 1;

  let updated = KitRecord {
    id: existing.id,
    name: baseline.name,
    description: baseline.description,
    policy_id: Some(policy_record.id),
    loadout_id: Some(loadout_record.id),
    managed_source: Some(managed_source),
    last_applied_at: existing.last_applied_at,
    last_applied_target: existing.last_applied_target,
    created_at: existing.created_at,
    updated_at: ts,
  };
  state_guard.kits[kit_index] = updated.clone();
  state.persist(&state_guard)?;
  Ok(updated)
}

#[tauri::command]
fn kit_apply(
  state: State<SharedState>,
  kitId: String,
  projectPath: String,
  agentName: String,
  mode: Option<String>,
  overwriteAgentsMd: Option<bool>,
  includeSkills: Option<Vec<String>>,
  excludeSkills: Option<Vec<String>>,
) -> Result<KitApplyResult, String> {
  let normalized_project_path = normalize_path(&projectPath);
  if normalized_project_path == "/" {
    return Err("Project path is required.".to_string());
  }
  let overwrite = overwriteAgentsMd.unwrap_or(false);
  let requested_mode = mode.as_deref().map(KitSyncMode::parse).transpose()?;
  let include_skills = includeSkills.unwrap_or_default();
  let exclude_skills = excludeSkills.unwrap_or_default();

  let (kit, policy, loadout, hub_path, agent_relative_path, instruction_file_name) = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;

    let kit = state_guard
      .kits
      .iter()
      .find(|entry| entry.id == kitId)
      .cloned()
      .ok_or_else(|| "Kit not found.".to_string())?;
    let policy = if let Some(policy_id) = kit.policy_id.as_deref() {
      Some(
        state_guard
          .kit_policies
          .iter()
          .find(|entry| entry.id == policy_id)
          .cloned()
          .ok_or_else(|| "Kit references missing AGENTS.md.".to_string())?,
      )
    } else {
      None
    };
    let loadout = if let Some(loadout_id) = kit.loadout_id.as_deref() {
      Some(
        state_guard
          .kit_loadouts
          .iter()
          .find(|entry| entry.id == loadout_id)
          .cloned()
          .ok_or_else(|| "Kit references missing Skills package.".to_string())?,
      )
    } else {
      None
    };
    let hub_path = state_guard.config.hub_path.clone();
    let agent_relative_path = state_guard
      .config
      .agents
      .iter()
      .find(|agent| agent.name == agentName)
      .map(|agent| agent.project_path.clone())
      .unwrap_or_else(|| ".agent/skills".to_string());
    let instruction_file_name = state_guard
      .config
      .agents
      .iter()
      .find(|agent| agent.name == agentName)
      .map(agent_instruction_file_name)
      .unwrap_or_else(|| "AGENTS.md".to_string());

    (kit, policy, loadout, hub_path, agent_relative_path, instruction_file_name)
  };

  if policy.is_none() && loadout.is_none() {
    return Err("Kit must include at least AGENTS.md or Skills package.".to_string());
  }

  let project_path_buffer = PathBuf::from(&normalized_project_path);
  fs::create_dir_all(&project_path_buffer).map_err(|error| {
    format!(
      "Failed to create project directory {}: {}",
      project_path_buffer.display(),
      error
    )
  })?;

  let normalized_policy_path = if let Some(policy) = &policy {
    let policy_file_path = project_path_buffer.join(&instruction_file_name);
    let normalized_policy_path = normalize_path(policy_file_path.to_string_lossy().as_ref());
    if policy_file_path.exists() && !overwrite {
      return Err(format!("POLICY_FILE_EXISTS::{}", normalized_policy_path));
    }

    fs::write(&policy_file_path, &policy.content).map_err(|error| {
      format!(
        "Failed to write {} at {}: {}",
        instruction_file_name,
        policy_file_path.display(),
        error
      )
    })?;
    Some(normalized_policy_path)
  } else {
    None
  };

  let mut loadout_results = Vec::new();
  if let Some(loadout) = &loadout {
    let include_skill_paths = include_skills
      .iter()
      .map(|selector| resolve_hub_skill_path(&hub_path, selector))
      .collect::<Result<Vec<_>, _>>()?;
    let destination_parent_path = project_path_buffer.join(&agent_relative_path);
    fs::create_dir_all(&destination_parent_path).map_err(|error| {
      format!(
        "Failed to create destination directory {}: {}",
        destination_parent_path.display(),
        error
      )
    })?;

    let destination_parent_normalized =
      normalize_path(destination_parent_path.to_string_lossy().as_ref());
    let mut sorted_items =
      build_effective_loadout_items(&loadout.items, &include_skill_paths, &exclude_skills);
    sorted_items.sort_by_key(|item| item.sort_order);

    for item in sorted_items.iter() {
      let effective_mode = requested_mode.clone().unwrap_or_else(|| item.mode.clone());
      let source_path = PathBuf::from(normalize_path(&item.skill_path));
      let fallback_destination = format!(
        "{}/{}",
        destination_parent_normalized,
        path_tail(&item.skill_path)
      );

      match sync_skill_into_parent(&source_path, &destination_parent_path, &effective_mode) {
        Ok(destination) => {
          let destination_path = PathBuf::from(&destination);
          match update_skill_metadata(
            &destination_path,
            vec![
              (
                "skills_hub_project_relative_path".to_string(),
                destination_path
                  .strip_prefix(&project_path_buffer)
                  .ok()
                  .map(|value| normalize_relative_path(value.to_string_lossy().as_ref())),
              ),
              (
                "skills_hub_source_package_id".to_string(),
                Some(loadout.id.clone()),
              ),
              (
                "skills_hub_source_package_name".to_string(),
                Some(loadout.name.clone()),
              ),
              ("skills_hub_source_kit_id".to_string(), Some(kit.id.clone())),
              ("skills_hub_source_kit_name".to_string(), Some(kit.name.clone())),
            ],
          ) {
            Ok(()) => loadout_results.push(KitApplySkillResult {
              skill_path: item.skill_path.clone(),
              mode: effective_mode,
              destination,
              status: ApplyStatus::Success,
              error: None,
            }),
            Err(error) => loadout_results.push(KitApplySkillResult {
              skill_path: item.skill_path.clone(),
              mode: effective_mode,
              destination,
              status: ApplyStatus::Failed,
              error: Some(error),
            }),
          }
        }
        Err(error) => loadout_results.push(KitApplySkillResult {
          skill_path: item.skill_path.clone(),
          mode: effective_mode,
          destination: fallback_destination,
          status: ApplyStatus::Failed,
          error: Some(error),
        }),
      }
    }
  }

  let applied_at = now_millis();
  {
    let mut state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;

    let apply_key = format!("{}::{}", normalized_project_path, agentName);
    state_guard.agents_md_applied.insert(apply_key, true);
    if let Some(current_kit) = state_guard.kits.iter_mut().find(|entry| entry.id == kitId) {
      current_kit.last_applied_at = Some(applied_at);
      current_kit.last_applied_target = Some(KitApplyTarget {
        project_path: normalized_project_path.clone(),
        agent_name: agentName.clone(),
      });
      current_kit.updated_at = applied_at;
    }
    refresh_skills_in_state(&mut state_guard);
    state.persist(&state_guard)?;
  }

  Ok(KitApplyResult {
    kit_id: kit.id,
    kit_name: kit.name,
    policy_path: normalized_policy_path,
    policy_file_name: policy.as_ref().map(|_| instruction_file_name),
    project_path: normalized_project_path,
    agent_name: agentName,
    applied_at,
    overwrote_agents_md: Some(overwrite),
    loadout_results,
  })
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  #[cfg(target_os = "macos")]
  {
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
  }

  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn load_tray_icon_from_logo_white_svg() -> Option<tauri::image::Image<'static>> {
  let svg_text = include_str!("../../docs/logo_white.svg");
  let options = resvg::usvg::Options::default();
  let tree = resvg::usvg::Tree::from_str(svg_text, &options).ok()?;

  let target_size: u32 = 32;
  // Slightly reduce fill ratio in macOS menu bar to avoid looking oversized.
  let icon_scale_boost: f32 = 1.17;
  let mut pixmap = resvg::tiny_skia::Pixmap::new(target_size, target_size)?;
  let tree_size = tree.size();
  let scale_x = target_size as f32 / tree_size.width();
  let scale_y = target_size as f32 / tree_size.height();
  let scale = scale_x.min(scale_y) * icon_scale_boost;
  let translate_x = (target_size as f32 - tree_size.width() * scale) / 2.0;
  let translate_y = (target_size as f32 - tree_size.height() * scale) / 2.0;
  let transform = resvg::tiny_skia::Transform::from_row(
    scale,
    0.0,
    0.0,
    scale,
    translate_x,
    translate_y,
  );

  let mut pixmap_mut = pixmap.as_mut();
  resvg::render(&tree, transform, &mut pixmap_mut);

  // Convert to monochrome white (premultiplied alpha) for better status bar visibility.
  let mut rgba = pixmap.data().to_vec();
  for pixel in rgba.chunks_exact_mut(4) {
    let alpha = pixel[3];
    if alpha == 0 {
      continue;
    }
    pixel[0] = alpha;
    pixel[1] = alpha;
    pixel[2] = alpha;
  }

  Some(tauri::image::Image::new_owned(
    rgba,
    target_size,
    target_size,
  ))
}

fn tray_provider_switch_menu_id(app_type: &AppType, provider_id: &str) -> String {
  format!(
    "{TRAY_MENU_PROVIDER_SWITCH_PREFIX}{}::{}",
    app_type.as_str(),
    provider_id
  )
}

fn tray_provider_empty_menu_id(app_type: &AppType) -> String {
  format!("{TRAY_MENU_PROVIDER_EMPTY_PREFIX}{}", app_type.as_str())
}

fn parse_tray_provider_switch_menu_id(raw: &str) -> Option<(AppType, String)> {
  let payload = raw.strip_prefix(TRAY_MENU_PROVIDER_SWITCH_PREFIX)?;
  let (app_raw, provider_id) = payload.split_once("::")?;
  if provider_id.trim().is_empty() {
    return None;
  }

  Some((AppType::parse(app_raw).ok()?, provider_id.to_string()))
}

fn tray_providers_for_app(providers: &[ProviderRecord], app_type: AppType) -> Vec<ProviderRecord> {
  providers
    .iter()
    .filter(|provider| provider.app_type == app_type)
    .cloned()
    .collect()
}

fn build_tray_menu<R: tauri::Runtime>(
  app: &tauri::AppHandle<R>,
  providers: &[ProviderRecord],
) -> tauri::Result<tauri::menu::Menu<R>> {
  use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};

  let app_submenus = [AppType::Codex, AppType::Claude, AppType::Gemini]
    .into_iter()
    .map(|app_type| {
      let app_providers = tray_providers_for_app(providers, app_type.clone());

      if app_providers.is_empty() {
        let empty_item = MenuItem::with_id(
          app,
          tray_provider_empty_menu_id(&app_type),
          "暂无已配置账号",
          false,
          None::<&str>,
        )?;
        return Submenu::with_id_and_items(
          app,
          format!("tray-provider-group::{}", app_type.as_str()),
          app_type.label(),
          true,
          &[&empty_item],
        );
      }

      let provider_items = app_providers
        .iter()
        .map(|provider| {
          CheckMenuItem::with_id(
            app,
            tray_provider_switch_menu_id(&app_type, &provider.id),
            &provider.name,
            !provider.is_current,
            provider.is_current,
            None::<&str>,
          )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
      let provider_item_refs = provider_items
        .iter()
        .map(|item| item as &dyn tauri::menu::IsMenuItem<R>)
        .collect::<Vec<_>>();

      Submenu::with_id_and_items(
        app,
        format!("tray-provider-group::{}", app_type.as_str()),
        app_type.label(),
        true,
        &provider_item_refs,
      )
    })
    .collect::<tauri::Result<Vec<_>>>()?;
  let app_submenu_refs = app_submenus
    .iter()
    .map(|submenu| submenu as &dyn tauri::menu::IsMenuItem<R>)
    .collect::<Vec<_>>();

  let switch_provider_submenu = Submenu::with_id_and_items(
    app,
    TRAY_MENU_SWITCH_PROVIDER,
    "快捷切换供应商",
    true,
    &app_submenu_refs,
  )?;
  let open_item = MenuItem::with_id(app, TRAY_MENU_OPEN, "打开主界面", true, None::<&str>)?;
  let separator = PredefinedMenuItem::separator(app)?;
  let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出", true, None::<&str>)?;

  Menu::with_items(
    app,
    &[&switch_provider_submenu, &separator, &open_item, &quit_item],
  )
}

fn refresh_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
  let providers = {
    let shared_state: State<SharedState> = app.state();
    let state_guard = shared_state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    state_guard.providers.clone()
  };

  let tray = app
    .tray_by_id(TRAY_ICON_ID)
    .ok_or_else(|| "tray icon not found".to_string())?;
  let menu = build_tray_menu(app, &providers).map_err(|error| error.to_string())?;
  tray.set_menu(Some(menu)).map_err(|error| error.to_string())?;
  Ok(())
}

fn switch_provider_internal(
  state: &SharedState,
  app_type: AppType,
  provider_id: &str,
) -> Result<SwitchResult, String> {
  let backup_id = now_millis();
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let target = state_guard
    .providers
    .iter()
    .find(|provider| provider.app_type == app_type && provider.id == provider_id)
    .cloned()
    .ok_or_else(|| "Target provider does not exist for this app.".to_string())?;

  let current = state_guard
    .providers
    .iter()
    .find(|provider| provider.app_type == app_type && provider.is_current)
    .cloned();
  let switched_from = current.as_ref().map(|provider| provider.id.clone());

  let live_before = read_live_provider_config(&app_type)?;
  let current_snapshot = current.as_ref().and_then(|previous_current| {
    if previous_current.id == target.id {
      return None;
    }

    let updated_config = preserve_provider_profile(&live_before, &previous_current.config);
    let mut backup_provider = previous_current.clone();
    backup_provider.config = updated_config.clone();
    backup_provider.is_current = false;
    backup_provider.updated_at = now_millis();
    Some((backup_provider, updated_config))
  });

  let next_config = merge_live_config(&app_type, &live_before, &target.config);
  validate_provider_config_for_live(&app_type, &next_config)?;
  write_live_provider_config(&app_type, &next_config)?;

  let updated_at = now_millis();
  if let Some((backup_provider, updated_config)) = current_snapshot {
    if let Some(previous_entry) = state_guard
      .providers
      .iter_mut()
      .find(|provider| provider.id == backup_provider.id)
    {
      previous_entry.config = updated_config;
      previous_entry.updated_at = updated_at;
    }

    ensure_backups_for(&mut state_guard, &app_type).push(ProviderBackupEntry {
      backup_id,
      provider: backup_provider,
    });
  }

  for provider in state_guard.providers.iter_mut() {
    if provider.app_type != app_type {
      continue;
    }

    provider.is_current = provider.id == provider_id;
    provider.updated_at = updated_at;
  }

  state.persist(&state_guard)?;
  Ok(SwitchResult {
    app_type,
    current_provider_id: provider_id.to_string(),
    backup_id,
    switched_from,
    switched_to: provider_id.to_string(),
  })
}

fn create_tray_icon<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
  use tauri::tray::TrayIconBuilder;
  let providers = {
    let shared_state: State<SharedState> = app.state();
    let state_guard = shared_state
      .state
      .lock()
      .map_err(|_| std::io::Error::new(ErrorKind::Other, "state lock poisoned while creating tray icon"))?;
    state_guard.providers.clone()
  };
  let menu = build_tray_menu(app, &providers)?;

  let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
    .menu(&menu)
    .tooltip("Skills Hub")
    .show_menu_on_left_click(true)
    .on_menu_event(|app_handle, event| match event.id().as_ref() {
      TRAY_MENU_OPEN => show_main_window(app_handle),
      TRAY_MENU_QUIT => {
        APP_IS_EXITING.store(true, Ordering::SeqCst);
        app_handle.exit(0);
      }
      id => {
        if let Some((app_type, provider_id)) = parse_tray_provider_switch_menu_id(id) {
          let shared_state: State<SharedState> = app_handle.state();
          if switch_provider_internal(&shared_state, app_type, &provider_id).is_ok() {
            let _ = refresh_tray_menu(app_handle);
          }
        }
      }
    });

  #[cfg(target_os = "macos")]
  {
    tray_builder = tray_builder.icon_as_template(true);
  }

  if let Some(icon) = load_tray_icon_from_logo_white_svg() {
    tray_builder = tray_builder.icon(icon);
  } else if let Some(icon) = app.default_window_icon().cloned() {
    tray_builder = tray_builder.icon(icon);
  }

  let _ = tray_builder.build(app)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs::{create_dir_all, remove_dir_all};

  fn build_agent(name: &str, project_path: &str) -> AgentConfig {
    AgentConfig {
      name: name.to_string(),
      global_path: String::new(),
      project_path: project_path.to_string(),
      instruction_file_name: None,
      enabled: true,
      is_custom: false,
    }
  }

  fn write_skill_dir(path: &Path, name: &str, description: &str) {
    create_dir_all(path).unwrap();
    std::fs::write(
      path.join("SKILL.md"),
      format!(
        "---\nname: {}\ndescription: {}\n---\n# {}\n\n{}\n",
        name, description, name, description
      ),
    )
    .unwrap();
  }

  fn build_official_source(id: &str, url: &str, selected_skills: &[&str]) -> OfficialPresetSource {
    OfficialPresetSource {
      id: id.to_string(),
      name: id.to_string(),
      url: url.to_string(),
      description: None,
      selected_skill_details: Vec::new(),
      selected_skills: selected_skills.iter().map(|value| value.to_string()).collect(),
    }
  }

  fn build_official_preset(
    id: &str,
    name: &str,
    sources: Vec<OfficialPresetSource>,
  ) -> OfficialPresetRecord {
    OfficialPresetRecord {
      id: id.to_string(),
      name: name.to_string(),
      description: None,
      policy: OfficialPresetPolicy {
        name: format!("Policy {}", name),
        description: None,
        template: "policies/policy-demo.md".to_string(),
      },
      sources,
    }
  }

  fn build_managed_official_kit(preset: &OfficialPresetRecord) -> KitRecord {
    KitRecord {
      id: format!("kit-{}", preset.id),
      name: format!("Official: {}", preset.name),
      description: preset.description.clone(),
      policy_id: None,
      loadout_id: None,
      managed_source: Some(ManagedKitSource {
        kind: "official_preset".to_string(),
        preset_id: preset.id.clone(),
        preset_name: preset.name.clone(),
        catalog_version: 1,
        installed_at: 0,
        last_restored_at: None,
        restore_count: 0,
        baseline: ManagedKitBaseline {
          name: format!("Official: {}", preset.name),
          description: None,
          policy: ManagedKitPolicyBaseline {
            id: "policy".to_string(),
            name: "policy".to_string(),
            description: None,
            content: String::new(),
          },
          loadout: ManagedKitLoadoutBaseline {
            id: "loadout".to_string(),
            name: "loadout".to_string(),
            description: None,
            items: Vec::new(),
          },
        },
        security_checks: Vec::new(),
      }),
      last_applied_at: None,
      last_applied_target: None,
      created_at: 0,
      updated_at: 0,
    }
  }

  #[test]
  fn codex_project_paths_include_agents_alias() {
    let agent = build_agent("Codex", ".codex/skills");
    let paths = project_skill_parent_candidates("/tmp/browseruse_bench", &agent)
      .into_iter()
      .map(|entry| normalize_path(entry.to_string_lossy().as_ref()))
      .collect::<Vec<_>>();

    assert_eq!(
      paths,
      vec![
        "/tmp/browseruse_bench/.codex/skills".to_string(),
        "/tmp/browseruse_bench/.agents/skills".to_string(),
      ]
    );
  }

  #[test]
  fn codex_project_paths_dedupe_agents_alias() {
    let agent = build_agent("codex", ".agents/skills");
    let paths = project_skill_parent_candidates("/tmp/browseruse_bench", &agent)
      .into_iter()
      .map(|entry| normalize_path(entry.to_string_lossy().as_ref()))
      .collect::<Vec<_>>();

    assert_eq!(paths, vec!["/tmp/browseruse_bench/.agents/skills".to_string()]);
  }

  #[test]
  fn non_codex_project_paths_keep_single_target() {
    let agent = build_agent("Claude Code", ".claude/skills");
    let paths = project_skill_parent_candidates("/tmp/browseruse_bench", &agent)
      .into_iter()
      .map(|entry| normalize_path(entry.to_string_lossy().as_ref()))
      .collect::<Vec<_>>();

    assert_eq!(paths, vec!["/tmp/browseruse_bench/.claude/skills".to_string()]);
  }

  #[test]
  fn claude_agent_defaults_to_claude_md() {
    let agent = build_agent("Claude Code", ".claude/skills");
    assert_eq!(agent_instruction_file_name(&agent), "CLAUDE.md".to_string());
  }

  #[test]
  fn explicit_instruction_file_name_wins() {
    let mut agent = build_agent("Claude Code", ".claude/skills");
    agent.instruction_file_name = Some("TEAM.md".to_string());
    assert_eq!(agent_instruction_file_name(&agent), "TEAM.md".to_string());
  }

  #[test]
  fn resolve_skill_watch_target_uses_existing_parent_non_recursive() {
    let base = std::env::temp_dir().join(format!("skills-hub-watch-target-{}", now_millis()));
    let codex_dir = base.join(".codex");
    create_dir_all(&codex_dir).unwrap();

    let target = resolve_skill_watch_target(&codex_dir.join("skills")).unwrap();
    assert_eq!(
      normalize_path(target.path.to_string_lossy().as_ref()),
      normalize_path(codex_dir.to_string_lossy().as_ref())
    );
    assert_eq!(target.recursive_mode, RecursiveMode::NonRecursive);

    let _ = remove_dir_all(base);
  }

  #[test]
  fn skill_watch_targets_include_project_and_global_paths() {
    let base = std::env::temp_dir().join(format!("skills-hub-watch-layout-{}", now_millis()));
    let hub_path = base.join("hub");
    let global_path = base.join("global");
    let project_path = base.join("repo");
    create_dir_all(&hub_path).unwrap();
    create_dir_all(&global_path).unwrap();
    create_dir_all(project_path.join(".codex/skills")).unwrap();

    let config = AppConfig {
      hub_path: normalize_path(hub_path.to_string_lossy().as_ref()),
      projects: vec![normalize_path(project_path.to_string_lossy().as_ref())],
      scan_roots: Vec::new(),
      agents: vec![AgentConfig {
        name: "Codex".to_string(),
        global_path: normalize_path(global_path.to_string_lossy().as_ref()),
        project_path: ".codex/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      }],
    };

    let watched = skill_watch_targets(&config)
      .into_iter()
      .map(|target| normalize_path(target.path.to_string_lossy().as_ref()))
      .collect::<Vec<_>>();

    assert!(watched.contains(&normalize_path(hub_path.to_string_lossy().as_ref())));
    assert!(watched.contains(&normalize_path(global_path.to_string_lossy().as_ref())));
    assert!(watched.contains(&normalize_path(
      project_path.join(".codex/skills").to_string_lossy().as_ref()
    )));

    let _ = remove_dir_all(base);
  }

  #[test]
  fn loadout_import_prefers_skills_root_and_repo_name() {
    let base = std::env::temp_dir().join(format!("skills-hub-loadout-root-{}", now_millis()));
    create_dir_all(base.join("skills/demo")).unwrap();

    let source = ParsedImportSource {
      repo_url: "https://github.com/obra/superpowers.git".to_string(),
      repo_web_url: "https://github.com/obra/superpowers".to_string(),
      source_url: "https://github.com/obra/superpowers".to_string(),
      repo_name: "superpowers".to_string(),
      branch: None,
      subdir: None,
      skill_name: "superpowers".to_string(),
      is_github: true,
    };

    let (root_path, root_subdir) = resolve_loadout_import_root(&base, &source).unwrap();
    assert_eq!(normalize_relative_path(root_subdir.as_str()), "skills");
    assert_eq!(normalize_path(root_path.to_string_lossy().as_ref()), normalize_path(base.join("skills").to_string_lossy().as_ref()));
    assert_eq!(build_default_loadout_name(&source, &root_subdir), "superpowers");

    let _ = remove_dir_all(base);
  }

  #[test]
  fn loadout_import_uses_explicit_subdir_name_when_not_skills() {
    let source = ParsedImportSource {
      repo_url: "https://github.com/acme/workflows.git".to_string(),
      repo_web_url: "https://github.com/acme/workflows".to_string(),
      source_url: "https://github.com/acme/workflows/tree/main/templates".to_string(),
      repo_name: "workflows".to_string(),
      branch: Some("main".to_string()),
      subdir: Some("templates".to_string()),
      skill_name: "templates".to_string(),
      is_github: true,
    };

    assert_eq!(build_default_loadout_name(&source, "templates"), "templates");
  }

  #[test]
  fn duplicate_remote_skill_names_are_rejected() {
    let entries = vec![
      RemoteSkillEntry {
        name: "demo".to_string(),
        relative_path: "backend/demo".to_string(),
        full_path: PathBuf::from("/tmp/backend/demo"),
      },
      RemoteSkillEntry {
        name: "demo".to_string(),
        relative_path: "frontend/demo".to_string(),
        full_path: PathBuf::from("/tmp/frontend/demo"),
      },
    ];

    let error = assert_unique_remote_skill_names(&entries).unwrap_err();
    assert!(error.contains("Duplicate skill directory names"));
  }

  #[test]
  fn remote_skill_selection_filters_unselected_entries() {
    let entries = vec![
      RemoteSkillEntry {
        name: "app-router-helper".to_string(),
        relative_path: "app-router-helper".to_string(),
        full_path: PathBuf::from("/tmp/app-router-helper"),
      },
      RemoteSkillEntry {
        name: "ssr-ssg-advisor".to_string(),
        relative_path: "ssr-ssg-advisor".to_string(),
        full_path: PathBuf::from("/tmp/ssr-ssg-advisor"),
      },
      RemoteSkillEntry {
        name: "unselected-helper".to_string(),
        relative_path: "unselected-helper".to_string(),
        full_path: PathBuf::from("/tmp/unselected-helper"),
      },
    ];

    let selected = select_remote_skill_entries(
      &entries,
      &vec![
        "app-router-helper".to_string(),
        "ssr-ssg-advisor".to_string(),
      ],
      "https://github.com/acme/skills",
    )
    .unwrap();

    assert_eq!(
      selected
        .iter()
        .map(|entry| entry.name.clone())
        .collect::<Vec<_>>(),
      vec![
        "app-router-helper".to_string(),
        "ssr-ssg-advisor".to_string(),
      ]
    );
  }

  #[test]
  fn official_source_selection_plan_merges_shared_source_skills() {
    let shared_url = "https://github.com/acme/skills/tree/main/skills";
    let preset_a = build_official_preset(
      "preset-a",
      "Preset A",
      vec![build_official_source(
        "shared-source-a",
        shared_url,
        &["app-router-helper", "ssr-ssg-advisor"],
      )],
    );
    let preset_b = build_official_preset(
      "preset-b",
      "Preset B",
      vec![build_official_source(
        "shared-source-b",
        shared_url,
        &["web-design-guidelines"],
      )],
    );
    let catalog = OfficialPresetCatalog {
      version: 1,
      presets: vec![preset_a.clone(), preset_b.clone()],
    };

    let selection_plan = build_official_source_selection_plan(
      &catalog,
      &vec![build_managed_official_kit(&preset_a)],
      &preset_b,
    )
    .unwrap();

    let source_key = build_official_source_import_key(&preset_b.sources[0]).unwrap();
    let mut selected = selection_plan
      .get(&source_key)
      .unwrap()
      .iter()
      .cloned()
      .collect::<Vec<_>>();
    selected.sort();

    assert_eq!(
      selected,
      vec![
        "app-router-helper".to_string(),
        "ssr-ssg-advisor".to_string(),
        "web-design-guidelines".to_string(),
      ]
    );
  }

  #[test]
  fn prune_unused_official_source_loadouts_removes_only_unreferenced_entries() {
    let mut state = seed_state();
    state.kit_loadouts.push(KitLoadoutRecord {
      id: "loadout-source-unused".to_string(),
      name: "Official Source: Demo / Unused".to_string(),
      description: None,
      items: Vec::new(),
      import_source: None,
      created_at: 0,
      updated_at: 0,
    });
    state.kit_loadouts.push(KitLoadoutRecord {
      id: "loadout-source-used".to_string(),
      name: "Official Source: Demo / Used".to_string(),
      description: None,
      items: Vec::new(),
      import_source: None,
      created_at: 0,
      updated_at: 0,
    });
    state.kits.push(KitRecord {
      id: "kit-source".to_string(),
      name: "Kit Source".to_string(),
      description: None,
      policy_id: None,
      loadout_id: Some("loadout-source-used".to_string()),
      managed_source: None,
      last_applied_at: None,
      last_applied_target: None,
      created_at: 0,
      updated_at: 0,
    });

    let removed = prune_unused_official_source_loadouts(&mut state);

    assert_eq!(removed, 1);
    assert!(state
      .kit_loadouts
      .iter()
      .any(|loadout| loadout.id == "loadout-source-used"));
    assert!(!state
      .kit_loadouts
      .iter()
      .any(|loadout| loadout.id == "loadout-source-unused"));
    assert!(state
      .kit_loadouts
      .iter()
      .any(|loadout| loadout.id == "loadout-default"));
  }

  #[test]
  fn merge_config_with_default_agents_adds_missing_builtins_and_preserves_custom_agents() {
    let config = AppConfig {
      hub_path: "/tmp/hub".to_string(),
      projects: vec!["/tmp/project".to_string()],
      scan_roots: vec!["/tmp/workspace".to_string()],
      agents: vec![
        AgentConfig {
          name: "Codex".to_string(),
          global_path: "/tmp/custom-codex".to_string(),
          project_path: ".codex/custom".to_string(),
          instruction_file_name: Some("TEAM.md".to_string()),
          enabled: false,
          is_custom: false,
        },
        AgentConfig {
          name: "My Agent".to_string(),
          global_path: "/tmp/my-agent".to_string(),
          project_path: ".my-agent/skills".to_string(),
          instruction_file_name: None,
          enabled: true,
          is_custom: true,
        },
      ],
    };

    let merged = merge_config_with_default_agents(config);
    let codex = merged
      .agents
      .iter()
      .find(|agent| agent.name == "Codex")
      .expect("Codex should exist");
    let openclaw = merged
      .agents
      .iter()
      .find(|agent| agent.name == "OpenClaw")
      .expect("OpenClaw should be added");
    let custom = merged
      .agents
      .iter()
      .find(|agent| agent.name == "My Agent")
      .expect("custom agent should be preserved");

    assert_eq!(codex.global_path, "/tmp/custom-codex".to_string());
    assert_eq!(codex.project_path, ".codex/custom".to_string());
    assert_eq!(codex.instruction_file_name, Some("TEAM.md".to_string()));
    assert!(!codex.enabled);

    assert!(openclaw.global_path.ends_with("/.openclaw/skills"));
    assert_eq!(openclaw.project_path, "skills".to_string());

    assert_eq!(custom.project_path, ".my-agent/skills".to_string());
    assert!(custom.is_custom);
  }

  #[test]
  fn merge_config_with_default_agents_preserves_existing_agent_order() {
    let config = AppConfig {
      hub_path: "/tmp/hub".to_string(),
      projects: Vec::new(),
      scan_roots: Vec::new(),
      agents: vec![
        AgentConfig {
          name: "Codex".to_string(),
          global_path: "/tmp/custom-codex".to_string(),
          project_path: ".codex/custom".to_string(),
          instruction_file_name: None,
          enabled: true,
          is_custom: false,
        },
        AgentConfig {
          name: "My Agent".to_string(),
          global_path: "/tmp/my-agent".to_string(),
          project_path: ".my-agent/skills".to_string(),
          instruction_file_name: None,
          enabled: true,
          is_custom: true,
        },
        AgentConfig {
          name: "Cursor".to_string(),
          global_path: "/tmp/custom-cursor".to_string(),
          project_path: ".cursor/custom".to_string(),
          instruction_file_name: None,
          enabled: false,
          is_custom: false,
        },
      ],
    };

    let merged = merge_config_with_default_agents(config);

    assert_eq!(
      merged
        .agents
        .iter()
        .take(3)
        .map(|agent| agent.name.clone())
        .collect::<Vec<_>>(),
      vec![
        "Codex".to_string(),
        "My Agent".to_string(),
        "Cursor".to_string(),
      ]
    );
    assert!(merged.agents.iter().any(|agent| agent.name == "Antigravity"));
  }

  #[test]
  fn reorder_enabled_agents_only_moves_visible_agents() {
    let agents = vec![
      AgentConfig {
        name: "Antigravity".to_string(),
        global_path: "/tmp/a".to_string(),
        project_path: ".agent/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      },
      AgentConfig {
        name: "Hidden Agent".to_string(),
        global_path: "/tmp/hidden".to_string(),
        project_path: ".hidden/skills".to_string(),
        instruction_file_name: None,
        enabled: false,
        is_custom: true,
      },
      AgentConfig {
        name: "Codex".to_string(),
        global_path: "/tmp/codex".to_string(),
        project_path: ".codex/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      },
      AgentConfig {
        name: "Cursor".to_string(),
        global_path: "/tmp/cursor".to_string(),
        project_path: ".cursor/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      },
    ];

    let reordered = reorder_enabled_agents(
      &agents,
      &vec![
        "Codex".to_string(),
        "Antigravity".to_string(),
        "Cursor".to_string(),
      ],
    )
    .unwrap();

    assert_eq!(
      reordered
        .iter()
        .map(|agent| (agent.name.clone(), agent.enabled))
        .collect::<Vec<_>>(),
      vec![
        ("Codex".to_string(), true),
        ("Hidden Agent".to_string(), false),
        ("Antigravity".to_string(), true),
        ("Cursor".to_string(), true),
      ]
    );
  }

  #[test]
  fn collect_all_skills_infers_project_package_from_applied_kit() {
    let base = std::env::temp_dir().join(format!("skills-hub-project-origin-{}", now_millis()));
    let hub_path = base.join("hub");
    let global_path = base.join("global");
    let project_path = base.join("repo");
    let hub_skill_path = hub_path.join("demo-skill");
    let project_skill_path = project_path.join(".codex/skills/demo-skill");
    let normalized_project_path = normalize_path(project_path.to_string_lossy().as_ref());

    create_dir_all(&global_path).unwrap();
    write_skill_dir(&hub_skill_path, "demo-skill", "Demo hub skill");
    write_skill_dir(&project_skill_path, "demo-skill", "Demo project skill");

    let config = AppConfig {
      hub_path: normalize_path(hub_path.to_string_lossy().as_ref()),
      projects: vec![normalized_project_path.clone()],
      scan_roots: Vec::new(),
      agents: vec![AgentConfig {
        name: "Codex".to_string(),
        global_path: normalize_path(global_path.to_string_lossy().as_ref()),
        project_path: ".codex/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      }],
    };

    let loadout = KitLoadoutRecord {
      id: "loadout-frontend".to_string(),
      name: "Frontend Pack".to_string(),
      description: None,
      items: vec![KitLoadoutItem {
        skill_path: normalize_path(hub_skill_path.to_string_lossy().as_ref()),
        mode: KitSyncMode::Copy,
        sort_order: 0,
      }],
      import_source: None,
      created_at: 0,
      updated_at: 0,
    };
    let kit = KitRecord {
      id: "kit-frontend".to_string(),
      name: "Frontend Kit".to_string(),
      description: None,
      policy_id: None,
      loadout_id: Some(loadout.id.clone()),
      managed_source: None,
      last_applied_at: Some(1),
      last_applied_target: Some(KitApplyTarget {
        project_path: normalized_project_path.clone(),
        agent_name: "Codex".to_string(),
      }),
      created_at: 0,
      updated_at: 0,
    };

    let skills = collect_all_skills(&config, &vec![loadout], &vec![kit]);
    let project_skill = skills
      .iter()
      .find(|skill| skill.path == normalize_path(project_skill_path.to_string_lossy().as_ref()))
      .expect("project skill should be collected");

    assert_eq!(project_skill.source_package_id.as_deref(), Some("loadout-frontend"));
    assert_eq!(project_skill.source_package_name.as_deref(), Some("Frontend Pack"));
    assert_eq!(project_skill.source_kit_id.as_deref(), Some("kit-frontend"));
    assert_eq!(project_skill.source_kit_name.as_deref(), Some("Frontend Kit"));
    assert_eq!(project_skill.project_path.as_deref(), Some(normalized_project_path.as_str()));
    assert!(project_skill.enabled);

    let _ = remove_dir_all(base);
  }

  #[test]
  fn project_skill_toggle_round_trips_between_active_and_disabled_locations() {
    let base = std::env::temp_dir().join(format!("skills-hub-project-toggle-{}", now_millis()));
    let hub_path = base.join("hub");
    let global_path = base.join("global");
    let project_path = base.join("repo");
    let hub_skill_path = hub_path.join("demo-skill");
    let project_skill_path = project_path.join(".codex/skills/demo-skill");
    let normalized_project_path = normalize_path(project_path.to_string_lossy().as_ref());

    create_dir_all(&global_path).unwrap();
    write_skill_dir(&hub_skill_path, "demo-skill", "Demo hub skill");
    write_skill_dir(&project_skill_path, "demo-skill", "Demo project skill");

    let config = AppConfig {
      hub_path: normalize_path(hub_path.to_string_lossy().as_ref()),
      projects: vec![normalized_project_path.clone()],
      scan_roots: Vec::new(),
      agents: vec![AgentConfig {
        name: "Codex".to_string(),
        global_path: normalize_path(global_path.to_string_lossy().as_ref()),
        project_path: ".codex/skills".to_string(),
        instruction_file_name: None,
        enabled: true,
        is_custom: false,
      }],
    };

    let loadout = KitLoadoutRecord {
      id: "loadout-frontend".to_string(),
      name: "Frontend Pack".to_string(),
      description: None,
      items: vec![KitLoadoutItem {
        skill_path: normalize_path(hub_skill_path.to_string_lossy().as_ref()),
        mode: KitSyncMode::Copy,
        sort_order: 0,
      }],
      import_source: None,
      created_at: 0,
      updated_at: 0,
    };
    let kit = KitRecord {
      id: "kit-frontend".to_string(),
      name: "Frontend Kit".to_string(),
      description: None,
      policy_id: None,
      loadout_id: Some(loadout.id.clone()),
      managed_source: None,
      last_applied_at: Some(1),
      last_applied_target: Some(KitApplyTarget {
        project_path: normalized_project_path,
        agent_name: "Codex".to_string(),
      }),
      created_at: 0,
      updated_at: 0,
    };

    let skills = collect_all_skills(&config, &vec![loadout.clone()], &vec![kit.clone()]);
    let active_skill = skills
      .iter()
      .find(|skill| skill.path == normalize_path(project_skill_path.to_string_lossy().as_ref()))
      .cloned()
      .expect("active project skill should exist");

    let disabled_destination =
      set_project_skill_enabled_on_disk(&config, &active_skill, false).unwrap();
    assert!(Path::new(&disabled_destination).exists());
    assert!(!project_skill_path.exists());

    let disabled_skills = collect_all_skills(&config, &vec![loadout.clone()], &vec![kit.clone()]);
    let disabled_skill = disabled_skills
      .iter()
      .find(|skill| skill.path == disabled_destination)
      .cloned()
      .expect("disabled project skill should be collected");
    assert!(!disabled_skill.enabled);
    assert_eq!(disabled_skill.source_package_name.as_deref(), Some("Frontend Pack"));

    let restored_destination =
      set_project_skill_enabled_on_disk(&config, &disabled_skill, true).unwrap();
    assert_eq!(
      restored_destination,
      normalize_path(project_skill_path.to_string_lossy().as_ref())
    );
    assert!(project_skill_path.exists());

    let restored_skills = collect_all_skills(&config, &vec![loadout], &vec![kit]);
    let restored_skill = restored_skills
      .iter()
      .find(|skill| skill.path == normalize_path(project_skill_path.to_string_lossy().as_ref()))
      .expect("restored project skill should be collected");
    assert!(restored_skill.enabled);
    assert_eq!(restored_skill.source_package_name.as_deref(), Some("Frontend Pack"));

    let _ = remove_dir_all(base);
  }

  #[test]
  fn tray_provider_switch_menu_id_round_trips() {
    let raw_id = tray_provider_switch_menu_id(&AppType::Codex, "provider-codex-api");
    let parsed = parse_tray_provider_switch_menu_id(&raw_id);

    assert_eq!(
      parsed,
      Some((AppType::Codex, "provider-codex-api".to_string()))
    );
  }

  #[test]
  fn tray_providers_for_app_filters_and_preserves_order() {
    let providers = vec![
      ProviderRecord {
        id: "provider-claude-1".to_string(),
        app_type: AppType::Claude,
        name: "Claude Official".to_string(),
        config: Value::Null,
        is_current: false,
        created_at: 1,
        updated_at: 1,
      },
      ProviderRecord {
        id: "provider-codex-1".to_string(),
        app_type: AppType::Codex,
        name: "Codex Work".to_string(),
        config: Value::Null,
        is_current: true,
        created_at: 2,
        updated_at: 2,
      },
      ProviderRecord {
        id: "provider-codex-2".to_string(),
        app_type: AppType::Codex,
        name: "Codex Personal".to_string(),
        config: Value::Null,
        is_current: false,
        created_at: 3,
        updated_at: 3,
      },
    ];

    let codex_providers = tray_providers_for_app(&providers, AppType::Codex);

    assert_eq!(
      codex_providers
        .iter()
        .map(|provider| (provider.id.clone(), provider.is_current))
        .collect::<Vec<_>>(),
      vec![
        ("provider-codex-1".to_string(), true),
        ("provider-codex-2".to_string(), false),
      ]
    );
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(SharedState::new())
    .setup(|app| {
      let shared_state: State<SharedState> = app.state();
      if managed_official_presets_need_install(&shared_state)? {
        let _ = official_preset_install_all(shared_state.clone(), Some(true));
      }
      let skill_watcher = start_skill_watcher(app.handle().clone());
      app.manage(skill_watcher);
      create_tray_icon(app.handle())?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }

      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if APP_IS_EXITING.load(Ordering::SeqCst) {
          return;
        }
        api.prevent_close();
        let _ = window.hide();
        #[cfg(target_os = "macos")]
        {
          let _ = window
            .app_handle()
            .set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      health,
      version,
      config_get,
      project_add,
      project_remove,
      project_reorder,
      scan_root_add,
      scan_root_remove,
      scan_projects,
      scanned_projects_add,
      scan_and_add_projects,
      skill_list,
      skill_sync,
      skill_collect_to_hub,
      skill_delete,
      project_skill_set_enabled,
      project_skill_package_set_enabled,
      agent_config_update,
      agent_reorder,
      agent_config_remove,
      skill_get_content,
      skill_import,
      skill_create,
      open_external_url,
      provider_list,
      provider_current,
      provider_get_raw,
      provider_add,
      provider_update,
      provider_delete,
      provider_switch,
      provider_latest_backup,
      provider_restore_latest_backup,
      provider_capture_live,
      universal_provider_list,
      universal_provider_get_raw,
      universal_provider_add,
      universal_provider_update,
      universal_provider_delete,
      universal_provider_apply,
      kit_policy_list,
      kit_policy_add,
      kit_policy_update,
      kit_policy_delete,
      official_preset_list,
      official_preset_get,
      official_preset_install,
      official_preset_install_all,
      kit_loadout_list,
      kit_loadout_add,
      kit_loadout_update,
      kit_loadout_import_from_repo,
      kit_loadout_delete,
      kit_list,
      kit_add,
      kit_update,
      kit_delete,
      kit_restore_managed_baseline,
      kit_apply,
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Skills Hub Tauri app");
}
