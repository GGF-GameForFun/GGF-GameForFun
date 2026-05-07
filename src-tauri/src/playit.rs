use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Where playit-cli stores the agent secret on this OS
pub fn secret_file_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    return dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("playit_gg")
        .join("playit.toml");
    #[cfg(target_os = "linux")]
    return dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("playit_gg")
        .join("playit.toml");
    #[cfg(target_os = "windows")]
    return dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("playit_gg")
        .join("playit.toml");
}

/// Read the agent secret key from the playit.toml file
pub fn read_secret() -> Option<String> {
    let content = std::fs::read_to_string(secret_file_path()).ok()?;
    for line in content.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("secret_key") {
            let after_eq = rest.split_once('=')?.1.trim();
            let key = after_eq.trim_matches(|c| c == '"' || c == '\'').to_string();
            if !key.is_empty() { return Some(key); }
        }
    }
    None
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    status: String,
    data: serde_json::Value,
}

/// Query the playit API for the current agent's tunnels and return the first
/// Minecraft tunnel address as "host:port", or None if no Minecraft tunnel is set up yet.
pub async fn query_tunnel_address() -> Option<String> {
    let secret = read_secret()?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.playit.gg/agents/rundata")
        .header("Authorization", format!("agent-key {}", secret))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .ok()?;
    let parsed: ApiResponse = resp.json().await.ok()?;
    if parsed.status != "success" { return None; }
    let tunnels = parsed.data.get("tunnels")?.as_array()?;

    // Prefer a tunnel with tunnel_type == "minecraft-java"
    let preferred = tunnels.iter().find(|t| {
        t.get("tunnel_type").and_then(|v| v.as_str()) == Some("minecraft-java")
    });
    let tunnel = preferred.or_else(|| tunnels.first())?;

    let domain = tunnel.get("custom_domain")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or_else(|| tunnel.get("assigned_domain").and_then(|v| v.as_str()))?;

    let port = tunnel.get("port")?.get("from")?.as_u64()?;
    Some(format!("{}:{}", domain, port))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayitState {
    pub running: bool,
    pub address: Option<String>,
    pub claim_url: Option<String>,
    pub pid: Option<u32>,
}

impl PlayitState {
    pub fn new() -> Self {
        Self { running: false, address: None, claim_url: None, pid: None }
    }
}

pub fn playit_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mchost")
        .join("playit");
    std::fs::create_dir_all(&base).ok();
    base
}

pub fn playit_cached_binary() -> PathBuf {
    #[cfg(target_os = "windows")]
    return playit_dir().join("playit.exe");
    #[cfg(not(target_os = "windows"))]
    return playit_dir().join("playit");
}

/// Try to find an existing playit install on PATH or common locations.
pub fn find_existing_playit() -> Option<PathBuf> {
    let names = ["playit-cli", "playit"];
    let mut v: Vec<PathBuf> = vec![];

    // Try `which <name>` for each
    for name in &names {
        if let Ok(out) = std::process::Command::new("which").arg(name).output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() { v.push(PathBuf::from(path)); }
            }
        }
    }

    // Cargo install location (any platform)
    if let Some(home) = dirs::home_dir() {
        for name in &names {
            v.push(home.join(".cargo/bin").join(name));
        }
    }

    #[cfg(target_os = "macos")]
    for name in &names {
        v.push(PathBuf::from("/opt/homebrew/bin").join(name));
        v.push(PathBuf::from("/usr/local/bin").join(name));
        v.push(PathBuf::from(format!("/Applications/playit.app/Contents/MacOS/{}", name)));
    }

    #[cfg(target_os = "linux")]
    for name in &names {
        v.push(PathBuf::from("/usr/bin").join(name));
        v.push(PathBuf::from("/usr/local/bin").join(name));
    }

    for path in v {
        if path.exists() { return Some(path); }
    }
    None
}

/// Download URL for the GitHub release binary, or None if no direct download available
/// (macOS — install via Homebrew instead).
pub fn playit_download_url() -> Option<&'static str> {
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return Some("https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-aarch64");
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return Some("https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64");
    #[cfg(target_os = "windows")]
    return Some("https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-windows-x86_64-signed.exe");
    #[cfg(target_os = "macos")]
    return None;
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    return None;
}

/// Build playit from source via cargo. Slow (3-5 min first time) but works on any platform with Rust.
/// Used as fallback on macOS where there's no prebuilt binary.
pub async fn cargo_install_playit() -> Result<PathBuf, String> {
    // Verify cargo is available
    let cargo_check = tokio::process::Command::new("which")
        .arg("cargo")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !cargo_check.status.success() {
        return Err(
            "Rust/Cargo not found. Install from https://rustup.rs/ first, or download playit manually from https://playit.gg/download"
                .to_string(),
        );
    }

    let out = tokio::process::Command::new("cargo")
        .args([
            "install",
            "--git", "https://github.com/playit-cloud/playit-agent.git",
            "--locked",
            "playit-cli",
        ])
        .output()
        .await
        .map_err(|e| format!("cargo install failed to launch: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let last = stderr.lines().filter(|l| !l.trim().is_empty()).rev().take(3).collect::<Vec<_>>();
        let mut tail = last;
        tail.reverse();
        return Err(format!("cargo install failed:\n{}", tail.join("\n")));
    }

    find_existing_playit()
        .ok_or_else(|| "playit-cli built but binary not found at ~/.cargo/bin/playit-cli".to_string())
}
