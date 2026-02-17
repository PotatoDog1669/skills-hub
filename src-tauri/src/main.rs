#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use serde_yaml::Value as YamlValue;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

const TRAY_ICON_ID: &str = "skills-hub-tray";
const TRAY_MENU_OPEN: &str = "tray-open-main";
const TRAY_MENU_QUIT: &str = "tray-quit-app";
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfig {
  name: String,
  global_path: String,
  project_path: String,
  enabled: bool,
  is_custom: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
  hub_path: String,
  projects: Vec<String>,
  scan_roots: Vec<String>,
  agents: Vec<AgentConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Skill {
  id: String,
  name: String,
  description: String,
  path: String,
  location: SkillLocation,
  agent_name: Option<String>,
  project_name: Option<String>,
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
  created_at: i64,
  updated_at: i64,
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
  policy_id: String,
  loadout_id: String,
  last_applied_at: Option<i64>,
  last_applied_target: Option<KitApplyTarget>,
  created_at: i64,
  updated_at: i64,
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
  policy_path: String,
  project_path: String,
  agent_name: String,
  applied_at: i64,
  overwrote_agents_md: Option<bool>,
  loadout_results: Vec<KitApplySkillResult>,
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

impl SharedState {
  fn new() -> Self {
    let state_path = Self::state_file_path();
    let loaded_state = Self::load_state(&state_path);
    let mut state = loaded_state.clone().unwrap_or_else(seed_state);
    refresh_skills_in_state(&mut state);

    let shared_state = Self {
      state: Mutex::new(state),
      counter: AtomicU64::new(now_millis().max(1) as u64),
      state_path,
    };

    if loaded_state.is_none() {
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

fn path_tail(raw: &str) -> String {
  normalize_path(raw)
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

fn parse_skill_summary(skill_dir: &Path) -> (String, String) {
  let fallback_name = path_tail(skill_dir.to_string_lossy().as_ref());
  let skill_md_path = skill_dir.join("SKILL.md");
  let content = match fs::read_to_string(skill_md_path) {
    Ok(content) => content,
    Err(_) => {
      return (fallback_name, "Error parsing SKILL.md".to_string());
    }
  };

  let parsed = parse_skill_document(&content);
  let name = parsed
    .metadata
    .get("name")
    .cloned()
    .filter(|entry| !entry.trim().is_empty())
    .unwrap_or_else(|| fallback_name.clone());
  let description = parsed
    .metadata
    .get("description")
    .cloned()
    .filter(|entry| !entry.trim().is_empty())
    .unwrap_or_else(|| infer_description(&parsed.content));

  (name, description.chars().take(200).collect())
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

fn collect_all_skills(config: &AppConfig) -> Vec<Skill> {
  let active_agents = config
    .agents
    .iter()
    .filter(|agent| agent.enabled)
    .collect::<Vec<_>>();
  let mut seen = HashSet::new();
  let mut skills = Vec::new();

  let mut push_skill = |path: PathBuf,
                        location: SkillLocation,
                        agent_name: Option<String>,
                        project_name: Option<String>| {
    let normalized_path = normalize_path(path.to_string_lossy().as_ref());
    if seen.contains(&normalized_path) {
      return;
    }

    let (name, description) = parse_skill_summary(Path::new(&normalized_path));
    skills.push(Skill {
      id: normalized_path.clone(),
      name,
      description,
      path: normalized_path.clone(),
      location,
      agent_name,
      project_name,
    });
    seen.insert(normalized_path);
  };

  for path in collect_skill_dirs(Path::new(&config.hub_path)) {
    push_skill(path, SkillLocation::Hub, None, None);
  }

  for agent in active_agents.iter() {
    for path in collect_skill_dirs(Path::new(&agent.global_path)) {
      push_skill(path, SkillLocation::Agent, Some(agent.name.clone()), None);
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
          );
        }
      }
    }
  }

  skills.sort_by(|left, right| left.path.cmp(&right.path));
  skills
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
  source_url: String,
  branch: Option<String>,
  subdir: Option<String>,
  skill_name: String,
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
      source_url: trimmed.to_string(),
      branch,
      subdir,
      skill_name: sanitize_skill_name(&inferred_name),
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
    source_url: trimmed.to_string(),
    branch: None,
    subdir: None,
    skill_name: sanitize_skill_name(inferred_name),
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
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Claude Code".to_string(),
      global_path: join_home_path(".claude/skills"),
      project_path: ".claude/skills".to_string(),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Cursor".to_string(),
      global_path: join_home_path(".cursor/skills"),
      project_path: ".cursor/skills".to_string(),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Codex".to_string(),
      global_path: join_home_path(".codex/skills"),
      project_path: ".codex/skills".to_string(),
      enabled: true,
      is_custom: false,
    },
    AgentConfig {
      name: "Gemini CLI".to_string(),
      global_path: join_home_path(".gemini/skills"),
      project_path: ".gemini/skills".to_string(),
      enabled: false,
      is_custom: false,
    },
  ]
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
    created_at,
    updated_at: created_at,
  }];

  let kits = vec![KitRecord {
    id: "kit-onboarding".to_string(),
    name: "Onboarding Kit".to_string(),
    description: Some("Policy + default skill package".to_string()),
    policy_id: "policy-general".to_string(),
    loadout_id: "loadout-default".to_string(),
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
      },
      Skill {
        id: "skill-installer-hub".to_string(),
        name: "skill-installer".to_string(),
        description: "Install and manage Codex skills.".to_string(),
        path: sample_skill_path2,
        location: SkillLocation::Hub,
        agent_name: None,
        project_name: None,
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
  state.skills = collect_all_skills(&state.config);
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
fn project_add(state: State<SharedState>, projectPath: String) -> Result<String, String> {
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
    state_guard.config.projects.sort();
  }

  refresh_skills_in_state(&mut state_guard);
  state.persist(&state_guard)?;

  Ok(normalized)
}

#[tauri::command]
fn project_remove(state: State<SharedState>, projectPath: String) -> Result<bool, String> {
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
fn scanned_projects_add(state: State<SharedState>, projectPaths: Vec<String>) -> Result<i64, String> {
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
    state_guard.config.projects.sort();
    refresh_skills_in_state(&mut state_guard);
  }
  state.persist(&state_guard)?;
  Ok(added)
}

#[tauri::command]
fn scan_and_add_projects(state: State<SharedState>) -> Result<i64, String> {
  let candidates = scan_projects(state.clone())?;
  scanned_projects_add(state, candidates)
}

#[tauri::command]
fn skill_list(state: State<SharedState>) -> Result<Vec<Skill>, String> {
  let config = {
    let state_guard = state
      .state
      .lock()
      .map_err(|_| "state lock poisoned".to_string())?;
    state_guard.config.clone()
  };

  Ok(collect_all_skills(&config))
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
fn agent_config_update(state: State<SharedState>, agent: AgentConfig) -> Result<(), String> {
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

  let normalized_agent = AgentConfig {
    name: name.clone(),
    global_path,
    project_path,
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
  Ok(())
}

#[tauri::command]
fn agent_config_remove(state: State<SharedState>, agentName: String) -> Result<bool, String> {
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
  Ok(provider)
}

#[tauri::command]
fn provider_update(
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
  Ok(updated)
}

#[tauri::command]
fn provider_delete(state: State<SharedState>, id: String) -> Result<bool, String> {
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
  Ok(true)
}

#[tauri::command]
fn provider_switch(
  state: State<SharedState>,
  appType: String,
  providerId: String,
) -> Result<SwitchResult, String> {
  let app_type = AppType::parse(&appType)?;
  let backup_id = now_millis();
  let mut state_guard = state
    .state
    .lock()
    .map_err(|_| "state lock poisoned".to_string())?;

  let target = state_guard
    .providers
    .iter()
    .find(|provider| provider.app_type == app_type && provider.id == providerId)
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

    provider.is_current = provider.id == providerId;
    provider.updated_at = updated_at;
  }

  state.persist(&state_guard)?;
  Ok(SwitchResult {
    app_type,
    current_provider_id: providerId.clone(),
    backup_id,
    switched_from,
    switched_to: providerId,
  })
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

  if state_guard.kits.iter().any(|kit| kit.policy_id == id) {
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

  if state_guard.kits.iter().any(|kit| kit.loadout_id == id) {
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
  policyId: String,
  loadoutId: String,
) -> Result<KitRecord, String> {
  let trimmed_name = name.trim().to_string();
  if trimmed_name.is_empty() {
    return Err("Kit name is required.".to_string());
  }

  let record = KitRecord {
    id: state.next_id("kit"),
    name: trimmed_name,
    description: optional_trim(description),
    policy_id: policyId,
    loadout_id: loadoutId,
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

  let updated = {
    let kit = state_guard
      .kits
      .iter_mut()
      .find(|kit| kit.id == id)
      .ok_or_else(|| "Kit not found.".to_string())?;

    if let Some(next_name) = optional_trim(name) {
      kit.name = next_name;
    }
    if let Some(next_description) = optional_trim(description) {
      kit.description = Some(next_description);
    }
    if let Some(policy_id) = policyId {
      kit.policy_id = policy_id;
    }
    if let Some(loadout_id) = loadoutId {
      kit.loadout_id = loadout_id;
    }

    kit.updated_at = now_millis();
    kit.clone()
  };

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
    state.persist(&state_guard)?;
  }
  Ok(deleted)
}

#[tauri::command]
fn kit_apply(
  state: State<SharedState>,
  kitId: String,
  projectPath: String,
  agentName: String,
  mode: Option<String>,
  overwriteAgentsMd: Option<bool>,
) -> Result<KitApplyResult, String> {
  let normalized_project_path = normalize_path(&projectPath);
  if normalized_project_path == "/" {
    return Err("Project path is required.".to_string());
  }
  let overwrite = overwriteAgentsMd.unwrap_or(false);
  let requested_mode = mode.as_deref().map(KitSyncMode::parse).transpose()?;

  let (kit, policy, loadout, agent_relative_path) = {
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
    let policy = state_guard
      .kit_policies
      .iter()
      .find(|entry| entry.id == kit.policy_id)
      .cloned()
      .ok_or_else(|| "Kit references missing policy/loadout.".to_string())?;
    let loadout = state_guard
      .kit_loadouts
      .iter()
      .find(|entry| entry.id == kit.loadout_id)
      .cloned()
      .ok_or_else(|| "Kit references missing policy/loadout.".to_string())?;
    let agent_relative_path = state_guard
      .config
      .agents
      .iter()
      .find(|agent| agent.name == agentName)
      .map(|agent| agent.project_path.clone())
      .unwrap_or_else(|| ".agent/skills".to_string());

    (kit, policy, loadout, agent_relative_path)
  };

  let project_path_buffer = PathBuf::from(&normalized_project_path);
  fs::create_dir_all(&project_path_buffer).map_err(|error| {
    format!(
      "Failed to create project directory {}: {}",
      project_path_buffer.display(),
      error
    )
  })?;

  let policy_file_path = project_path_buffer.join("AGENTS.md");
  let normalized_policy_path = normalize_path(policy_file_path.to_string_lossy().as_ref());
  if policy_file_path.exists() && !overwrite {
    return Err(format!("AGENTS_MD_EXISTS::{}", normalized_policy_path));
  }

  fs::write(&policy_file_path, &policy.content).map_err(|error| {
    format!(
      "Failed to write AGENTS.md at {}: {}",
      policy_file_path.display(),
      error
    )
  })?;

  let destination_parent_path = project_path_buffer.join(&agent_relative_path);
  fs::create_dir_all(&destination_parent_path).map_err(|error| {
    format!(
      "Failed to create destination directory {}: {}",
      destination_parent_path.display(),
      error
    )
  })?;

  let destination_parent_normalized = normalize_path(destination_parent_path.to_string_lossy().as_ref());
  let mut sorted_items = loadout.items.clone();
  sorted_items.sort_by_key(|item| item.sort_order);

  let mut loadout_results = Vec::new();
  for item in sorted_items.iter() {
    let effective_mode = requested_mode.clone().unwrap_or_else(|| item.mode.clone());
    let source_path = PathBuf::from(normalize_path(&item.skill_path));
    let fallback_destination = format!(
      "{}/{}",
      destination_parent_normalized,
      path_tail(&item.skill_path)
    );

    match sync_skill_into_parent(&source_path, &destination_parent_path, &effective_mode) {
      Ok(destination) => loadout_results.push(KitApplySkillResult {
        skill_path: item.skill_path.clone(),
        mode: effective_mode,
        destination,
        status: ApplyStatus::Success,
        error: None,
      }),
      Err(error) => loadout_results.push(KitApplySkillResult {
        skill_path: item.skill_path.clone(),
        mode: effective_mode,
        destination: fallback_destination,
        status: ApplyStatus::Failed,
        error: Some(error),
      }),
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

fn create_tray_icon<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
  use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
  use tauri::tray::TrayIconBuilder;

  let open_item = MenuItem::with_id(app, TRAY_MENU_OPEN, "打开主界面", true, None::<&str>)?;
  let separator = PredefinedMenuItem::separator(app)?;
  let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&open_item, &separator, &quit_item])?;

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
      _ => {}
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

  fn build_agent(name: &str, project_path: &str) -> AgentConfig {
    AgentConfig {
      name: name.to_string(),
      global_path: String::new(),
      project_path: project_path.to_string(),
      enabled: true,
      is_custom: false,
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
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(SharedState::new())
    .setup(|app| {
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
      scan_root_add,
      scan_root_remove,
      scan_projects,
      scanned_projects_add,
      scan_and_add_projects,
      skill_list,
      skill_sync,
      skill_collect_to_hub,
      skill_delete,
      agent_config_update,
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
      kit_loadout_list,
      kit_loadout_add,
      kit_loadout_update,
      kit_loadout_delete,
      kit_list,
      kit_add,
      kit_update,
      kit_delete,
      kit_apply,
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Skills Hub Tauri app");
}
