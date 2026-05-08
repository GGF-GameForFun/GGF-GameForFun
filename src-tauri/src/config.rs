use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn default_true() -> bool {
    true
}
fn default_performance_preset() -> String {
    "balanced".to_string()
}
fn default_remote_control_port() -> u16 {
    47992
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerType {
    Vanilla,
    Paper,
    Forge,
    Fabric,
    NeoForge,
}

impl Default for ServerType {
    fn default() -> Self {
        Self::Vanilla
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerConfig {
    pub server_path: String,
    pub java_path: String,
    pub minecraft_version: String,
    pub server_type: ServerType,
    /// Forge / NeoForge / Fabric loader version, or Paper build number as string
    pub loader_version: Option<String>,
    pub ram_mb: u32,
    pub max_players: u32,
    pub server_name: String,
    pub setup_complete: bool,
    /// Auto-restart the server when it exits unexpectedly (not via Stop button).
    /// Defaults to true so existing users get the new behavior automatically.
    #[serde(default = "default_true")]
    pub auto_restart: bool,
    /// Auto-backup interval in minutes. 0 = disabled.
    /// Defaults to 0 so existing users aren't surprised by background backups.
    #[serde(default)]
    pub backup_interval_minutes: u32,
    /// Where auto-backups are written. Empty = system Downloads folder.
    #[serde(default)]
    pub backup_dir: String,
    /// Whether auto-backups should include the logs/ folder.
    #[serde(default)]
    pub backup_include_logs: bool,
    /// Use Minecraft-focused JVM flags to reduce GC pauses and CPU spikes.
    /// Defaults to true because the standard Java defaults are weak for MC servers.
    #[serde(default = "default_true")]
    pub optimized_jvm_flags: bool,
    /// UI-selected performance preset. The app uses this for defaults/hints; server.properties
    /// still remains user-editable.
    #[serde(default = "default_performance_preset")]
    pub performance_preset: String,
    /// Optional LAN remote control API. Disabled by default and protected by a token.
    #[serde(default)]
    pub remote_control_enabled: bool,
    /// Port for the LAN remote control server.
    #[serde(default = "default_remote_control_port")]
    pub remote_control_port: u16,
    /// Bearer/query token required for remote control access.
    #[serde(default)]
    pub remote_control_token: String,
    /// Optional public HTTPS/TCP tunnel URL for remote access outside the LAN.
    #[serde(default)]
    pub remote_control_public_url: String,
    /// Whether the free Cloudflare quick tunnel for the remote dashboard
    /// should auto-start on app launch (when remote_control_enabled is true).
    #[serde(default)]
    pub cloudflare_remote_enabled: bool,
}

pub fn generate_remote_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub fn config_path() -> PathBuf {
    let base = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mchost");
    std::fs::create_dir_all(&base).ok();
    base.join("config.json")
}

pub fn load_config() -> ServerConfig {
    let path = config_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(cfg: &ServerConfig) -> Result<(), String> {
    let path = config_path();
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
