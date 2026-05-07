use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;

const CONSOLE_BUFFER_CAP: usize = 2000;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

mod backup;
mod config;
mod debug_report;
mod java;
mod playit;
mod server;
mod stats;

use config::{ServerConfig, ServerType};
use playit::PlayitState;
use server::{ServerManager, ServerStatus};
use stats::ServerStats;

// ── App State ─────────────────────────────────────────────────────────────────

pub struct AppState {
    pub server: Mutex<ServerManager>,
    pub playit: Mutex<PlayitState>,
    pub stats: Mutex<ServerStats>,
    pub online_players: Mutex<HashSet<String>>,
    pub console_buffer: Mutex<VecDeque<String>>,
    /// Timestamps of recent auto-restarts. Used to detect crash loops.
    pub recent_auto_restarts: Mutex<VecDeque<std::time::Instant>>,
    /// Recently joined players (most recent first), capped at RECENT_PLAYERS_CAP.
    /// Each entry: (name, ISO 8601 join timestamp).
    pub recent_players: Mutex<VecDeque<(String, String)>>,
    /// Last sampled (in-game tick count, real-time instant) for gametime-based
    /// TPS estimation on Vanilla/Fabric servers (which lack a built-in TPS cmd).
    pub last_gametime_sample: Mutex<Option<(u64, std::time::Instant)>>,
    /// State of the in-progress chunk pre-generation, if any.
    pub pregen: Mutex<PregenState>,
}

#[derive(Default, Clone, Serialize)]
pub struct PregenState {
    pub running: bool,
    pub total: u32,
    pub completed: u32,
    pub cancel_requested: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannedPlayer {
    pub name: String,
    pub uuid: String,
    pub created: String,
    pub source: String,
    pub expires: String,
    pub reason: String,
}

const RECENT_PLAYERS_CAP: usize = 20;

/// Window in which we count restarts (5 minutes), and the max we allow.
/// Beyond this, we consider it a crash loop and stop restarting.
const RESTART_WINDOW_SECS: u64 = 300;
const MAX_RESTARTS_IN_WINDOW: usize = 3;

async fn push_console_line(state: &AppState, line: String) {
    let mut buf = state.console_buffer.lock().await;
    if buf.len() >= CONSOLE_BUFFER_CAP { buf.pop_front(); }
    buf.push_back(line);
}

fn optimized_jvm_flags() -> &'static [&'static str] {
    &[
        "-XX:+UseG1GC",
        "-XX:+ParallelRefProcEnabled",
        "-XX:MaxGCPauseMillis=200",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+DisableExplicitGC",
        "-XX:+AlwaysPreTouch",
        "-XX:G1NewSizePercent=30",
        "-XX:G1MaxNewSizePercent=40",
        "-XX:G1HeapRegionSize=8M",
        "-XX:G1ReservePercent=20",
        "-XX:G1HeapWastePercent=5",
        "-XX:G1MixedGCCountTarget=4",
        "-XX:InitiatingHeapOccupancyPercent=15",
        "-XX:G1MixedGCLiveThresholdPercent=90",
        "-XX:G1RSetUpdatingPauseTimePercent=5",
        "-XX:SurvivorRatio=32",
        "-XX:+PerfDisableSharedMem",
        "-XX:MaxTenuringThreshold=1",
    ]
}

fn upsert_managed_jvm_args(server_dir: &Path, cfg: &ServerConfig) -> Result<(), String> {
    let path = server_dir.join("user_jvm_args.txt");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let start = "# GameForFun managed JVM flags - start";
    let end = "# GameForFun managed JVM flags - end";

    let mut kept = Vec::new();
    let mut skipping = false;
    for line in existing.lines() {
        if line.trim() == start {
            skipping = true;
            continue;
        }
        if line.trim() == end {
            skipping = false;
            continue;
        }
        if !skipping {
            kept.push(line.to_string());
        }
    }

    let mut managed = vec![
        start.to_string(),
        format!("-Xmx{}M", cfg.ram_mb),
        format!("-Xms{}M", (cfg.ram_mb / 2).max(512)),
    ];
    if cfg.optimized_jvm_flags {
        managed.extend(optimized_jvm_flags().iter().map(|s| s.to_string()));
    }
    managed.push(end.to_string());

    while kept.last().is_some_and(|line| line.trim().is_empty()) {
        kept.pop();
    }
    let mut output = managed.join("\n");
    if !kept.is_empty() {
        output.push_str("\n\n");
        output.push_str(&kept.join("\n"));
    }
    output.push('\n');

    std::fs::write(&path, output)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

/// Parse a player name out of a "joined the game" / "left the game" / "lost connection" line.
/// MC log format example: "...MinecraftServer/]: Fishgod212 joined the game"
fn parse_player_event(line: &str) -> Option<(String, bool)> {
    // Returns (name, is_join)
    let body = line.rsplit("]:").next()?.trim();
    if let Some(name) = body.strip_suffix(" joined the game") {
        let n = name.trim();
        if is_valid_player_name(n) { return Some((n.to_string(), true)); }
    }
    if let Some(name) = body.strip_suffix(" left the game") {
        let n = name.trim();
        if is_valid_player_name(n) { return Some((n.to_string(), false)); }
    }
    if let Some(rest) = body.strip_suffix(": Disconnected") {
        if let Some(name) = rest.strip_suffix(" lost connection") {
            let n = name.trim();
            if is_valid_player_name(n) { return Some((n.to_string(), false)); }
        }
    }
    // Generic "<name> lost connection: <reason>"
    if let Some(idx) = body.find(" lost connection:") {
        let n = body[..idx].trim();
        if is_valid_player_name(n) { return Some((n.to_string(), false)); }
    }
    None
}

fn is_valid_player_name(s: &str) -> bool {
    let len = s.chars().count();
    (2..=16).contains(&len) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

// ── Helper types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McVersion {
    pub id: String,
    pub release_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionManifest {
    versions: Vec<VersionEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionEntry {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
    url: String,
    #[serde(rename = "releaseTime")]
    release_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionData {
    downloads: Downloads,
}

#[derive(Debug, Serialize, Deserialize)]
struct Downloads {
    server: Option<DownloadItem>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadItem {
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ForgePromotions {
    promos: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaperProject {
    versions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaperVersion {
    builds: Vec<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaperBuild {
    downloads: PaperDownloads,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaperDownloads {
    application: PaperApp,
}

#[derive(Debug, Serialize, Deserialize)]
struct PaperApp {
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FabricLoader {
    loader: FabricLoaderInfo,
}

#[derive(Debug, Serialize, Deserialize)]
struct FabricLoaderInfo {
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct NeoForgeVersions {
    versions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstallProgress {
    pub message: String,
    pub progress: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoaderVersion {
    pub version: String,
    pub label: String,
}

// ── Config commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> ServerConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(cfg: ServerConfig) -> Result<(), String> {
    config::save_config(&cfg)
}

// ── Java commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn check_java() -> Result<String, String> {
    let candidates: Vec<PathBuf> = {
        let mut v = vec![];

        #[cfg(target_os = "macos")]
        {
            v.push(PathBuf::from("/usr/bin/java"));
            if let Ok(home) = std::env::var("HOME") {
                v.push(PathBuf::from(format!("{}/.sdkman/candidates/java/current/bin/java", home)));
            }
            if let Ok(entries) = std::fs::read_dir("/Library/Java/JavaVirtualMachines") {
                for entry in entries.flatten() {
                    v.push(entry.path().join("Contents/Home/bin/java"));
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Ok(pf) = std::env::var("PROGRAMFILES") {
                for vendor in &["Java", "Eclipse Adoptium", "Microsoft", "Amazon Corretto"] {
                    if let Ok(entries) = std::fs::read_dir(format!("{}\\{}", pf, vendor)) {
                        for entry in entries.flatten() {
                            v.push(entry.path().join("bin\\java.exe"));
                        }
                    }
                }
            }
        }

        if let Ok(jh) = std::env::var("JAVA_HOME") {
            #[cfg(target_os = "windows")]
            v.push(PathBuf::from(format!("{}\\bin\\java.exe", jh)));
            #[cfg(not(target_os = "windows"))]
            v.push(PathBuf::from(format!("{}/bin/java", jh)));
        }

        v
    };

    for path in &candidates {
        if path.exists() {
            if let Ok(out) = tokio::process::Command::new(path).arg("-version").output().await {
                if out.status.success() || !out.stderr.is_empty() {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
    }

    if let Ok(out) = tokio::process::Command::new("java").arg("-version").output().await {
        if out.status.success() || !out.stderr.is_empty() {
            return Ok("java".to_string());
        }
    }

    Err("Java not found. Please install Java 17+ (e.g. Eclipse Temurin).".to_string())
}

// ── Version fetch commands ────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_mc_versions() -> Result<Vec<McVersion>, String> {
    let client = reqwest::Client::new();
    let manifest: VersionManifest = client
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    Ok(manifest.versions.into_iter()
        .filter(|v| v.version_type == "release")
        .take(40)
        .map(|v| McVersion { id: v.id, release_time: v.release_time })
        .collect())
}

#[tauri::command]
async fn fetch_paper_versions() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let proj: PaperProject = client.get("https://api.papermc.io/v2/projects/paper")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let mut versions = proj.versions;
    versions.reverse();
    Ok(versions.into_iter().take(40).collect())
}

#[tauri::command]
async fn fetch_paper_builds(mc_version: String) -> Result<Vec<LoaderVersion>, String> {
    let client = reqwest::Client::new();
    let v: PaperVersion = client
        .get(format!("https://api.papermc.io/v2/projects/paper/versions/{}", mc_version))
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let latest = v.builds.last().copied().unwrap_or(0);
    Ok(vec![LoaderVersion {
        version: latest.to_string(),
        label: format!("{} (latest)", latest),
    }])
}

#[tauri::command]
async fn fetch_forge_versions(mc_version: String) -> Result<Vec<LoaderVersion>, String> {
    let client = reqwest::Client::new();
    let promos: ForgePromotions = client
        .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
        .header("User-Agent", "MCHost/0.1")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let mut versions = vec![];
    if let Some(v) = promos.promos.get(&format!("{}-recommended", mc_version)) {
        versions.push(LoaderVersion {
            version: v.clone(),
            label: format!("{} (recommended)", v),
        });
    }
    if let Some(v) = promos.promos.get(&format!("{}-latest", mc_version)) {
        if !versions.iter().any(|x| &x.version == v) {
            versions.push(LoaderVersion {
                version: v.clone(),
                label: format!("{} (latest)", v),
            });
        }
    }
    Ok(versions)
}

#[tauri::command]
async fn fetch_fabric_versions(mc_version: String) -> Result<Vec<LoaderVersion>, String> {
    let client = reqwest::Client::new();
    let loaders: Vec<FabricLoader> = client
        .get(format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version))
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let mut out = vec![];
    if let Some(latest) = loaders.first() {
        out.push(LoaderVersion {
            version: latest.loader.version.clone(),
            label: format!("{} (latest)", latest.loader.version),
        });
    }
    Ok(out)
}

#[tauri::command]
async fn fetch_neoforge_versions(mc_version: String) -> Result<Vec<LoaderVersion>, String> {
    // NeoForge versions look like "20.4.244" → MC 1.20.4. We want the prefix matching mc_version.
    let client = reqwest::Client::new();
    let v: NeoForgeVersions = client
        .get("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let mc_prefix = mc_version.strip_prefix("1.").unwrap_or(&mc_version);
    let matches: Vec<String> = v.versions.iter()
        .filter(|x| x.starts_with(&format!("{}.", mc_prefix)))
        .cloned().collect();

    let mut out = vec![];
    if let Some(latest) = matches.last() {
        out.push(LoaderVersion {
            version: latest.clone(),
            label: format!("{} (latest)", latest),
        });
    }
    Ok(out)
}

// ── Download helper ───────────────────────────────────────────────────────────

async fn download_file(app: &AppHandle, url: &str, dest: &Path, label: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("MCHost/0.1")
        .build().map_err(|e| e.to_string())?;

    let resp = client.get(url).send().await.map_err(|e| format!("Download failed: {}", e))?;
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest).await.map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let progress = if total > 0 { downloaded as f32 / total as f32 } else { 0.0 };
        app.emit("install-progress", InstallProgress {
            message: format!("Downloading {}… {:.1}%", label, progress * 100.0),
            progress,
        }).ok();
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, message: &str, progress: f32) {
    app.emit("install-progress", InstallProgress {
        message: message.to_string(), progress,
    }).ok();
}

// ── Server install ────────────────────────────────────────────────────────────

#[tauri::command]
async fn install_server(app: AppHandle, mut cfg: ServerConfig) -> Result<ServerConfig, String> {
    let server_dir = PathBuf::from(&cfg.server_path);
    tokio::fs::create_dir_all(&server_dir).await.map_err(|e| e.to_string())?;

    if cfg.java_path.is_empty() {
        cfg.java_path = check_java().await.unwrap_or_else(|_| "java".to_string());
    }

    match cfg.server_type {
        ServerType::Vanilla => install_vanilla(&app, &cfg, &server_dir).await?,
        ServerType::Paper => install_paper(&app, &cfg, &server_dir).await?,
        ServerType::Forge => install_forge(&app, &cfg, &server_dir).await?,
        ServerType::Fabric => install_fabric(&app, &cfg, &server_dir).await?,
        ServerType::NeoForge => install_neoforge(&app, &cfg, &server_dir).await?,
    }

    // Common files
    tokio::fs::write(server_dir.join("eula.txt"), "eula=true\n").await
        .map_err(|e| e.to_string())?;
    let (view_distance, simulation_distance) = match cfg.performance_preset.as_str() {
        "low_cpu" => (6, 4),
        "heavy_modpack" => (8, 5),
        "max_performance" => (10, 8),
        _ => (8, 6),
    };
    tokio::fs::write(
        server_dir.join("server.properties"),
        format!(
            "online-mode=false\nmax-players={}\nmotd={}\nserver-port=25565\nview-distance={}\nsimulation-distance={}\n",
            cfg.max_players, cfg.server_name, view_distance, simulation_distance
        ),
    ).await.map_err(|e| e.to_string())?;

    // Always create mods/plugins folder
    let extras_dir = match cfg.server_type {
        ServerType::Forge | ServerType::Fabric | ServerType::NeoForge => "mods",
        ServerType::Paper => "plugins",
        ServerType::Vanilla => "mods",
    };
    tokio::fs::create_dir_all(server_dir.join(extras_dir)).await.ok();

    cfg.setup_complete = true;
    config::save_config(&cfg)?;
    emit_progress(&app, "Setup complete!", 1.0);
    Ok(cfg)
}

async fn install_vanilla(app: &AppHandle, cfg: &ServerConfig, server_dir: &Path) -> Result<(), String> {
    emit_progress(app, "Fetching version info…", 0.05);
    let client = reqwest::Client::new();
    let manifest: VersionManifest = client
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let url = manifest.versions.iter()
        .find(|v| v.id == cfg.minecraft_version)
        .map(|v| v.url.clone())
        .ok_or_else(|| format!("Version {} not found", cfg.minecraft_version))?;
    let data: VersionData = client.get(&url).send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let server_url = data.downloads.server.ok_or("No server download")?.url;
    emit_progress(app, "Downloading Minecraft server…", 0.15);
    download_file(app, &server_url, &server_dir.join("server.jar"), "server.jar").await
}

async fn install_paper(app: &AppHandle, cfg: &ServerConfig, server_dir: &Path) -> Result<(), String> {
    let build = cfg.loader_version.as_deref().ok_or("No build selected")?;
    let mc = &cfg.minecraft_version;
    emit_progress(app, "Fetching Paper build info…", 0.1);
    let client = reqwest::Client::new();
    let info: PaperBuild = client
        .get(format!("https://api.papermc.io/v2/projects/paper/versions/{}/builds/{}", mc, build))
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let url = format!(
        "https://api.papermc.io/v2/projects/paper/versions/{}/builds/{}/downloads/{}",
        mc, build, info.downloads.application.name
    );
    emit_progress(app, "Downloading Paper…", 0.2);
    download_file(app, &url, &server_dir.join("server.jar"), "Paper").await
}

async fn install_forge(app: &AppHandle, cfg: &ServerConfig, server_dir: &Path) -> Result<(), String> {
    let lv = cfg.loader_version.as_deref().ok_or("No Forge version")?;
    let url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{fv}/forge-{mc}-{fv}-installer.jar",
        mc = cfg.minecraft_version, fv = lv
    );
    let installer = server_dir.join("forge-installer.jar");
    emit_progress(app, "Downloading Forge installer…", 0.2);
    download_file(app, &url, &installer, "Forge installer").await?;
    emit_progress(app, "Running Forge installer (may take a minute)…", 0.6);
    let out = tokio::process::Command::new(&cfg.java_path)
        .args(["-jar", "forge-installer.jar", "--installServer"])
        .current_dir(server_dir)
        .output().await
        .map_err(|e| format!("Failed to run Forge installer: {}", e))?;
    if !out.status.success() {
        return Err(format!("Forge installer failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    tokio::fs::remove_file(&installer).await.ok();
    Ok(())
}

async fn install_fabric(app: &AppHandle, cfg: &ServerConfig, server_dir: &Path) -> Result<(), String> {
    let loader = cfg.loader_version.as_deref().ok_or("No Fabric loader version")?;
    // Direct server-launcher download endpoint
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/1.0.1/server/jar",
        mc = cfg.minecraft_version, loader = loader
    );
    emit_progress(app, "Downloading Fabric server…", 0.2);
    download_file(app, &url, &server_dir.join("server.jar"), "Fabric server").await
}

async fn install_neoforge(app: &AppHandle, cfg: &ServerConfig, server_dir: &Path) -> Result<(), String> {
    let lv = cfg.loader_version.as_deref().ok_or("No NeoForge version")?;
    let url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar",
        v = lv
    );
    let installer = server_dir.join("neoforge-installer.jar");
    emit_progress(app, "Downloading NeoForge installer…", 0.2);
    download_file(app, &url, &installer, "NeoForge installer").await?;
    emit_progress(app, "Running NeoForge installer…", 0.6);
    let out = tokio::process::Command::new(&cfg.java_path)
        .args(["-jar", "neoforge-installer.jar", "--installServer"])
        .current_dir(server_dir)
        .output().await
        .map_err(|e| format!("Failed to run NeoForge installer: {}", e))?;
    if !out.status.success() {
        return Err(format!("NeoForge installer failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    tokio::fs::remove_file(&installer).await.ok();
    Ok(())
}

// ── Server runtime ────────────────────────────────────────────────────────────

#[tauri::command]
async fn start_server(app: AppHandle) -> Result<(), String> {
    do_start_server(app).await
}

/// The actual start logic, callable both from the public command and from the
/// auto-restart task on the wait-for-child handler.
async fn do_start_server(app: AppHandle) -> Result<(), String> {
    let cfg = config::load_config();
    if !cfg.setup_complete {
        return Err("Server not set up yet".to_string());
    }
    {
        let state = app.state::<AppState>();
        let srv = state.server.lock().await;
        if srv.status != ServerStatus::Stopped {
            return Err("Server is already running".to_string());
        }
    }

    let server_dir = PathBuf::from(&cfg.server_path);
    let ram = cfg.ram_mb;
    if matches!(cfg.server_type, ServerType::Forge | ServerType::NeoForge) {
        upsert_managed_jvm_args(&server_dir, &cfg)?;
    }

    // Pick the Java version that matches the Minecraft version (1.20.1 → 17, 1.21+ → 21, etc.)
    let required_major = java::required_java_for_mc(&cfg.minecraft_version);
    let java_bin = java::find_java_with_version(required_major)
        .unwrap_or_else(|| {
            if !cfg.java_path.is_empty() && std::path::Path::new(&cfg.java_path).exists() {
                PathBuf::from(&cfg.java_path)
            } else {
                PathBuf::from("java")
            }
        });
    let java_home = java::java_home_from_bin(&java_bin);
    let banner = format!("[mchost] Using Java {} at {}", required_major, java_bin.display());
    {
        let s = app.state::<AppState>();
        push_console_line(&s, banner.clone()).await;
    }
    app.emit("mc-line", &banner).ok();

    let mut cmd = match cfg.server_type {
        ServerType::Forge | ServerType::NeoForge => {
            // Forge/NeoForge generate run scripts that call bare `java`.
            // We override PATH/JAVA_HOME so the right Java version is picked up.
            #[cfg(target_os = "windows")]
            let mut c = {
                let mut c = tokio::process::Command::new("cmd");
                c.args(["/c", "run.bat", "nogui"]);
                c
            };
            #[cfg(not(target_os = "windows"))]
            let mut c = {
                let mut c = tokio::process::Command::new("/bin/bash");
                c.args(["run.sh", "nogui"]);
                c
            };
            if let Some(jh) = &java_home {
                c.env("JAVA_HOME", jh);
                let bin_dir = jh.join("bin");
                let sep = if cfg!(windows) { ";" } else { ":" };
                let new_path = match std::env::var("PATH") {
                    Ok(p) => format!("{}{}{}", bin_dir.display(), sep, p),
                    Err(_) => bin_dir.display().to_string(),
                };
                c.env("PATH", new_path);
            }
            c
        }
        // Vanilla, Paper, Fabric all use a single server.jar
        _ => {
            let mut c = tokio::process::Command::new(&java_bin);
            c.arg(format!("-Xmx{}M", ram));
            c.arg(format!("-Xms{}M", (ram / 2).max(512)));
            if cfg.optimized_jvm_flags {
                c.args(optimized_jvm_flags());
            }
            c.args(["-jar", "server.jar", "nogui"]);
            c
        }
    };

    cmd.current_dir(&server_dir)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start server: {}", e))?;
    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    let pid = child.id();

    {
        let state = app.state::<AppState>();
        let mut srv = state.server.lock().await;
        srv.stdin = Some(stdin); srv.pid = pid;
        srv.status = ServerStatus::Starting;
        srv.stop_requested = false;
    }
    app.emit("server-status", ServerStatus::Starting).ok();

    let players_max = cfg.max_players;
    {
        let s = app.state::<AppState>();
        let mut st = s.stats.lock().await;
        *st = ServerStats::default();
        st.players_max = players_max;
        st.ram_max_mb = ram;
    }

    let app3 = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.contains("Done") && line.contains("For help") {
                let s = app3.state::<AppState>();
                let mut srv = s.server.lock().await;
                if srv.status == ServerStatus::Starting {
                    srv.status = ServerStatus::Running;
                    app3.emit("server-status", ServerStatus::Running).ok();
                }
            }
            // TPS parsing (Paper / Forge / NeoForge response to `tps` command)
            if let Some(tps) = parse_tps_line(&line) {
                let s = app3.state::<AppState>();
                let mut st = s.stats.lock().await;
                st.tps = tps;
                app3.emit("server-stats", st.clone()).ok();
            }
            // Gametime-based TPS for Vanilla/Fabric: response to `time query gametime`
            // Format: "...]: The time is 12345"
            if let Some(tick) = parse_gametime_line(&line) {
                let s = app3.state::<AppState>();
                let now = std::time::Instant::now();
                let mut last = s.last_gametime_sample.lock().await;
                if let Some((prev_tick, prev_inst)) = *last {
                    let elapsed_secs = now.duration_since(prev_inst).as_secs_f32();
                    let tick_delta = tick.saturating_sub(prev_tick) as f32;
                    if elapsed_secs > 0.5 && tick_delta >= 0.0 {
                        // 20 ticks per second is "perfect" TPS
                        let tps = (tick_delta / elapsed_secs).clamp(0.0, 20.0);
                        let mut st = s.stats.lock().await;
                        st.tps = tps;
                        app3.emit("server-stats", st.clone()).ok();
                    }
                }
                *last = Some((tick, now));
            }

            // Player join/leave parsing — vanilla, paper, forge, fabric all use same format
            if let Some((name, is_join)) = parse_player_event(&line) {
                let s = app3.state::<AppState>();
                let mut players = s.online_players.lock().await;
                if is_join { players.insert(name.clone()); }
                else       { players.remove(&name); }
                let list: Vec<String> = players.iter().cloned().collect();
                let count = players.len() as u32;
                drop(players);

                if is_join {
                    // Track in recent-joins history (move to top if already present)
                    let mut recent = s.recent_players.lock().await;
                    recent.retain(|(n, _)| n != &name);
                    let ts = chrono::Utc::now().to_rfc3339();
                    recent.push_front((name.clone(), ts));
                    while recent.len() > RECENT_PLAYERS_CAP { recent.pop_back(); }
                    let recent_list: Vec<(String, String)> = recent.iter().cloned().collect();
                    drop(recent);
                    app3.emit("recent-players-update", &recent_list).ok();
                }

                let mut st = s.stats.lock().await;
                st.players_online = count;
                app3.emit("server-stats", st.clone()).ok();
                app3.emit("players-update", &list).ok();
            }
            {
                let s = app3.state::<AppState>();
                push_console_line(&s, line.clone()).await;
            }
            app3.emit("mc-line", &line).ok();
        }
        let s = app3.state::<AppState>();
        let mut srv = s.server.lock().await;
        srv.status = ServerStatus::Stopped;
        srv.stdin = None; srv.pid = None;
        app3.emit("server-status", ServerStatus::Stopped).ok();
        // Reset stats on stop
        let mut st = s.stats.lock().await;
        *st = ServerStats::default();
        app3.emit("server-stats", st.clone()).ok();
        // Reset player roster on stop
        let mut players = s.online_players.lock().await;
        players.clear();
        app3.emit("players-update", Vec::<String>::new()).ok();
    });

    let app4 = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let formatted = format!("[ERR] {}", line);
            {
                let s = app4.state::<AppState>();
                push_console_line(&s, formatted.clone()).await;
            }
            app4.emit("mc-line", &formatted).ok();
        }
    });

    let app5 = app.clone();
    tokio::spawn(async move {
        let _ = child.wait().await;
        let s = app5.state::<AppState>();

        // The user-initiated stop_server / restart_server commands set
        // `stop_requested = true`. If it's still false here, the process exited
        // on its own — which we treat as a crash and may auto-restart.
        let was_unexpected = {
            let srv = s.server.lock().await;
            !srv.stop_requested
        };

        {
            let mut srv = s.server.lock().await;
            if srv.status != ServerStatus::Stopped {
                srv.status = ServerStatus::Stopped;
                srv.stdin = None;
                srv.pid = None;
                app5.emit("server-status", ServerStatus::Stopped).ok();
            }
        }

        // Auto-restart if enabled in config and the exit was unexpected.
        let cfg_now = config::load_config();
        if was_unexpected && cfg_now.auto_restart {
            // Crash-loop guard: at most MAX_RESTARTS_IN_WINDOW restarts in RESTART_WINDOW_SECS.
            let now = std::time::Instant::now();
            let window = std::time::Duration::from_secs(RESTART_WINDOW_SECS);
            let allow = {
                let mut hist = s.recent_auto_restarts.lock().await;
                while let Some(&front) = hist.front() {
                    if now.duration_since(front) > window { hist.pop_front(); } else { break; }
                }
                if hist.len() >= MAX_RESTARTS_IN_WINDOW {
                    false
                } else {
                    hist.push_back(now);
                    true
                }
            };

            if !allow {
                let msg = format!(
                    "[mchost] Auto-restart disabled — server crashed {}+ times in {} seconds. Fix the issue and start manually.",
                    MAX_RESTARTS_IN_WINDOW, RESTART_WINDOW_SECS
                );
                push_console_line(&s, msg.clone()).await;
                app5.emit("mc-line", &msg).ok();
                return;
            }

            let msg = "[mchost] Server exited unexpectedly. Auto-restart in 3s…".to_string();
            push_console_line(&s, msg.clone()).await;
            app5.emit("mc-line", &msg).ok();
            // Tell the frontend to invoke start_server again. The frontend is
            // responsible for the actual restart call — this avoids Send
            // issues that would arise from calling do_start_server() from
            // inside this spawned task.
            app5.emit("auto-restart-requested", 3000_u32).ok();
        }
    });

    // Stats poller — emits server-stats every 2s while server is running
    let app_stats = app.clone();
    let started_at = std::time::Instant::now();
    let server_dir_for_stats = server_dir.clone();
    tokio::spawn(async move {
        let mut poller = stats::StatsPoller::new();
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            let s = app_stats.state::<AppState>();
            let server_pid = {
                let srv = s.server.lock().await;
                if srv.status == ServerStatus::Stopped { break; }
                match srv.pid { Some(p) => p, None => continue }
            };
            if let Some((cpu, ram_mb, disk_r, disk_w, disk_used, disk_total)) =
                poller.sample(server_pid, &server_dir_for_stats)
            {
                let mut st = s.stats.lock().await;
                st.cpu_percent = cpu;
                st.ram_used_mb = ram_mb;
                st.disk_read_kb_s = disk_r;
                st.disk_write_kb_s = disk_w;
                st.disk_used_mb = disk_used;
                st.disk_total_mb = disk_total;
                st.uptime_seconds = started_at.elapsed().as_secs();
                app_stats.emit("server-stats", st.clone()).ok();
            }
        }
    });

    // Reset gametime tracker for the new run (used by Vanilla/Fabric TPS estimation)
    {
        let state = app.state::<AppState>();
        *state.last_gametime_sample.lock().await = None;
    }

    // TPS query loop — every 10s, send a server-type-appropriate command.
    //   Paper:           `tps`
    //   Forge/NeoForge:  `forge tps`
    //   Vanilla/Fabric:  `time query gametime` (we measure tick rate ourselves)
    let tps_cmd: Option<&'static str> = match cfg.server_type {
        ServerType::Paper => Some("tps\n"),
        ServerType::Forge | ServerType::NeoForge => Some("forge tps\n"),
        ServerType::Vanilla | ServerType::Fabric => Some("time query gametime\n"),
    };
    if let Some(cmd_bytes) = tps_cmd {
        let app_tps = app.clone();
        tokio::spawn(async move {
            // Wait until the server actually finishes booting before pinging it
            tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
            loop {
                let s = app_tps.state::<AppState>();
                {
                    let mut srv = s.server.lock().await;
                    if srv.status == ServerStatus::Stopped { break; }
                    if srv.status == ServerStatus::Running {
                        if let Some(stdin) = &mut srv.stdin {
                            let _ = stdin.write_all(cmd_bytes.as_bytes()).await;
                        }
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
            }
        });
    }

    Ok(())
}

/// Parse a "The time is N" log line that responds to `time query gametime`.
/// Returns the in-game tick count.
fn parse_gametime_line(line: &str) -> Option<u64> {
    // Format: "[12:34:56] [Server thread/INFO]: The time is 12345"
    let body = line.rsplit("]:").next()?.trim();
    let rest = body.strip_prefix("The time is ")?;
    rest.trim().parse().ok()
}

/// Parse a TPS value out of an MC log line.
/// Recognised formats:
///   • Paper:  "TPS from last 1m, 5m, 15m: §a*20.0, §a*20.0, §a*20.0"
///   • Forge:  "Overall: Mean tick time: 12.345 ms. Mean TPS: 20.000"
///   • NeoForge: same as Forge
fn parse_tps_line(line: &str) -> Option<f32> {
    if line.contains("Mean TPS:") {
        let after = line.rsplit("Mean TPS:").next()?;
        let tok = after.trim().split_whitespace().next()?;
        let cleaned = tok.trim_end_matches('.');
        let v: f32 = cleaned.parse().ok()?;
        if v > 0.0 && v <= 25.0 { return Some(v); }
    }
    if line.contains("TPS from last") {
        // Strip Minecraft color codes (§ + 1 char) and the "*" marker
        let after = line.split(':').nth(1)?;
        let cleaned: String = after.chars().filter(|c| !matches!(c, '§' | '*')).collect();
        // The cleaned string still contains "a20.0," etc. since we kept the letter that follows §
        // Walk and grab the first plausible TPS value (1-25)
        let mut buf = String::new();
        for c in cleaned.chars() {
            if c.is_ascii_digit() || c == '.' { buf.push(c); }
            else if !buf.is_empty() {
                if let Ok(v) = buf.parse::<f32>() {
                    if v > 0.0 && v <= 25.0 { return Some(v); }
                }
                buf.clear();
            }
        }
        if !buf.is_empty() {
            if let Ok(v) = buf.parse::<f32>() { if v > 0.0 && v <= 25.0 { return Some(v); } }
        }
    }
    None
}

#[tauri::command]
async fn get_server_stats(state: State<'_, AppState>) -> Result<ServerStats, String> {
    Ok(state.stats.lock().await.clone())
}

#[tauri::command]
async fn get_online_players(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.online_players.lock().await.iter().cloned().collect())
}

#[tauri::command]
async fn get_recent_players(state: State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    Ok(state.recent_players.lock().await.iter().cloned().collect())
}

#[tauri::command]
async fn get_banned_players() -> Result<Vec<BannedPlayer>, String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path).join("banned-players.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut players: Vec<BannedPlayer> = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?;
    players.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(players)
}

#[tauri::command]
async fn unban_player(name: String, state: State<'_, AppState>) -> Result<Vec<BannedPlayer>, String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path).join("banned-players.json");
    let raw = if path.exists() {
        tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?
    } else {
        "[]".to_string()
    };

    let mut players: Vec<BannedPlayer> = if raw.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))?
    };

    let target = name.to_lowercase();
    players.retain(|p| p.name.to_lowercase() != target);
    players.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    let json = serde_json::to_string_pretty(&players).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, format!("{}\n", json))
        .await
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    // If the server is running, also ask Minecraft to update its in-memory ban list.
    // Editing banned-players.json handles stopped servers; `pardon` handles live servers.
    let mut srv = state.server.lock().await;
    if let Some(stdin) = &mut srv.stdin {
        stdin
            .write_all(format!("pardon {}\n", name).as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(players)
}

#[tauri::command]
async fn get_console_buffer(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.console_buffer.lock().await.iter().cloned().collect())
}

#[tauri::command]
async fn clear_console_buffer(state: State<'_, AppState>) -> Result<(), String> {
    state.console_buffer.lock().await.clear();
    Ok(())
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut srv = state.server.lock().await;
    match srv.status {
        ServerStatus::Running | ServerStatus::Starting => {
            srv.stop_requested = true;
            if let Some(stdin) = &mut srv.stdin {
                stdin.write_all(b"stop\n").await.map_err(|e| e.to_string())?;
            }
            srv.status = ServerStatus::Stopping;
            Ok(())
        }
        _ => Err("Server is not running".to_string()),
    }
}

#[tauri::command]
async fn restart_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    stop_server(state).await?;
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    do_start_server(app).await
}

#[tauri::command]
async fn send_command(cmd: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut srv = state.server.lock().await;
    if let Some(stdin) = &mut srv.stdin {
        stdin.write_all(format!("{}\n", cmd).as_bytes()).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Server is not running".to_string())
    }
}

#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    Ok(state.server.lock().await.status.clone())
}

// ── Mod / plugin commands ─────────────────────────────────────────────────────

fn extras_folder(cfg: &ServerConfig) -> &'static str {
    match cfg.server_type {
        ServerType::Paper => "plugins",
        _ => "mods",
    }
}

#[tauri::command]
fn list_mods() -> Result<Vec<String>, String> {
    let cfg = config::load_config();
    let dir = PathBuf::from(&cfg.server_path).join(extras_folder(&cfg));
    if !dir.exists() { return Ok(vec![]); }
    Ok(std::fs::read_dir(&dir).map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| e.path().extension().map(|x| x == "jar").unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
async fn add_mod(file_path: String) -> Result<(), String> {
    let cfg = config::load_config();
    let src = PathBuf::from(&file_path);
    let name = src.file_name().ok_or("Invalid file path")?.to_string_lossy().to_string();
    let dest = PathBuf::from(&cfg.server_path).join(extras_folder(&cfg)).join(&name);
    tokio::fs::create_dir_all(dest.parent().unwrap()).await.map_err(|e| e.to_string())?;
    tokio::fs::copy(&src, &dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn remove_mod(mod_name: String) -> Result<(), String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path).join(extras_folder(&cfg)).join(&mod_name);
    tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Server properties ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_server_properties() -> Result<HashMap<String, String>, String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path).join("server.properties");
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() { continue; }
        if let Some((k, v)) = line.split_once('=') {
            map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    Ok(map)
}

#[tauri::command]
fn save_server_properties(props: HashMap<String, String>) -> Result<(), String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path).join("server.properties");
    let mut lines = vec!["# Minecraft server properties".to_string()];
    let mut sorted: Vec<_> = props.iter().collect();
    sorted.sort_by_key(|(k, _)| k.as_str());
    for (k, v) in sorted {
        lines.push(format!("{}={}", k, v));
    }
    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

// ── playit.gg ─────────────────────────────────────────────────────────────────

/// Resolve the playit binary path: check existing install on PATH first,
/// then the cached download. Returns None if neither exists.
fn resolve_playit_binary() -> Option<PathBuf> {
    if let Some(p) = playit::find_existing_playit() { return Some(p); }
    let cached = playit::playit_cached_binary();
    if cached.exists() { Some(cached) } else { None }
}

#[tauri::command]
async fn setup_playit(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // 1. Already installed somewhere?
    if let Some(_path) = resolve_playit_binary() {
        emit_progress(&app, "playit.gg already installed", 1.0);
        return start_playit(app, state).await;
    }

    // 2. Try direct download (Linux/Windows)
    if let Some(url) = playit::playit_download_url() {
        let bin_path = playit::playit_cached_binary();
        emit_progress(&app, "Downloading playit.gg agent…", 0.1);
        download_file(&app, url, &bin_path, "playit").await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&bin_path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&bin_path, perms).map_err(|e| e.to_string())?;
        }
        emit_progress(&app, "playit.gg ready", 1.0);
        return start_playit(app, state).await;
    }

    // 3. macOS — no prebuilt binary; build playit-cli from source via cargo
    #[cfg(target_os = "macos")]
    {
        emit_progress(&app, "Building playit-cli from source via cargo (3–5 minutes, first time only)…", 0.2);
        playit::cargo_install_playit().await?;
        emit_progress(&app, "playit.gg ready", 1.0);
        return start_playit(app, state).await;
    }

    #[allow(unreachable_code)]
    Err("No playit.gg installer available for this platform. Download manually from https://playit.gg/download".to_string())
}

#[tauri::command]
async fn start_playit(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let bin_path = resolve_playit_binary()
        .ok_or_else(|| "playit.gg not installed. Run setup first.".to_string())?;
    {
        let pl = state.playit.lock().await;
        if pl.running { return Ok(()); }
    }

    let mut child = tokio::process::Command::new(&bin_path)
        .arg("--stdout")  // disable TUI; emit clean log lines instead of escape codes
        .stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("Failed to start playit: {}", e))?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr_pipe = child.stderr.take().ok_or("No stderr")?;

    {
        let mut pl = state.playit.lock().await;
        pl.running = true; pl.pid = pid;
        pl.address = None; pl.claim_url = None;
    }
    app.emit("playit-update", state.playit.lock().await.clone()).ok();

    let app2 = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            parse_playit_line(&app2, &line).await;
            app2.emit("playit-line", line).ok();
        }
        let s = app2.state::<AppState>();
        let mut pl = s.playit.lock().await;
        pl.running = false; pl.pid = None;
        app2.emit("playit-update", pl.clone()).ok();
    });

    let app_err = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr_pipe);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            parse_playit_line(&app_err, &line).await;
            app_err.emit("playit-line", line).ok();
        }
    });

    tokio::spawn(async move { child.wait().await.ok(); });

    // Poll the playit API for the tunnel address every few seconds.
    // The CLI's --stdout mode may not print a stable address in all builds,
    // so we keep polling while the agent is running until an address is found.
    let app_poll = app;
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            let s = app_poll.state::<AppState>();
            {
                let pl = s.playit.lock().await;
                if !pl.running { return; }
                if pl.address.is_some() { return; }
            }
            if let Some(addr) = playit::query_tunnel_address().await {
                let mut pl = s.playit.lock().await;
                if pl.address.as_deref() != Some(&addr) {
                    pl.address = Some(addr);
                    pl.claim_url = None;
                    app_poll.emit("playit-update", pl.clone()).ok();
                }
                return;
            }
        }
    });

    Ok(())
}

async fn parse_playit_line(app: &AppHandle, line: &str) {
    let s = app.state::<AppState>();
    let mut pl = s.playit.lock().await;
    let mut updated = false;

    // Claim URL: "Visit link to setup https://playit.gg/claim/6fb06ff080"
    if line.contains("playit.gg/claim/") {
        if let Some(start) = line.find("https://playit.gg/claim/") {
            let url: String = line[start..]
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
                .collect();
            if pl.claim_url.as_deref() != Some(url.as_str()) {
                pl.claim_url = Some(url);
                updated = true;
            }
        }
    }

    // Tunnel address: accept known playit domains and generic host:port tokens.
    for word in line.split(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ',') {
        let w = word.trim_end_matches(|c: char| c == '.' || c == ')' || c == ']');
        let Some(idx) = w.rfind(':') else { continue };
        let host = &w[..idx];
        let port = &w[idx + 1..];
        let has_host = host.contains('.') || host.eq_ignore_ascii_case("localhost");
        if has_host && port.parse::<u16>().is_ok() {
            if pl.address.as_deref() != Some(w) {
                pl.address = Some(w.to_string());
                pl.claim_url = None; // hide the claim banner once we have an address
                updated = true;
            }
            break;
        }
    }

    // Detect "agent secret loaded" / "authenticated" → claim was successful even before
    // we see the tunnel address, so hide the claim banner.
    if line.contains("authenticated") || line.contains("got secret") || line.contains("logged in") {
        if pl.claim_url.is_some() {
            pl.claim_url = None;
            updated = true;
        }
    }

    if updated {
        app.emit("playit-update", pl.clone()).ok();
    }
}

#[tauri::command]
async fn stop_playit(state: State<'_, AppState>) -> Result<(), String> {
    let mut pl = state.playit.lock().await;
    if let Some(pid) = pl.pid {
        #[cfg(unix)]
        unsafe { libc::kill(pid as i32, libc::SIGTERM); }
        #[cfg(windows)]
        {
            tokio::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output().await.ok();
        }
    }
    pl.running = false; pl.pid = None;
    Ok(())
}

#[tauri::command]
async fn get_playit_status(state: State<'_, AppState>) -> Result<PlayitState, String> {
    Ok(state.playit.lock().await.clone())
}

// ── Utility ───────────────────────────────────────────────────────────────────

#[tauri::command]
fn open_server_folder() -> Result<(), String> {
    let cfg = config::load_config();
    let path = PathBuf::from(&cfg.server_path);
    if !path.exists() { return Err("Server folder does not exist".to_string()); }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupResult {
    pub files: u64,
    pub bytes: u64,
    pub path: String,
}

#[tauri::command]
fn default_backup_filename() -> String {
    backup::default_backup_filename()
}

#[tauri::command]
fn default_debug_filename() -> String {
    debug_report::default_debug_filename()
}

#[tauri::command]
async fn create_backup(
    app: AppHandle,
    dest: String,
    include_logs: bool,
) -> Result<BackupResult, String> {
    let cfg = config::load_config();
    let server_path = PathBuf::from(&cfg.server_path);
    let dest_path = PathBuf::from(&dest);
    let app_clone = app.clone();
    // Run on a blocking task so the UI thread stays responsive
    let result = tokio::task::spawn_blocking(move || {
        backup::create_server_backup(&app_clone, &server_path, &dest_path, include_logs)
    })
    .await
    .map_err(|e| format!("Backup task failed: {}", e))??;
    Ok(BackupResult {
        files: result.0,
        bytes: result.1,
        path: dest,
    })
}

// ── Chunk pre-generation ─────────────────────────────────────────────────────
//
// Uses the vanilla `/forceload add` command in batches, which is supported by
// Vanilla / Paper / Forge / Fabric / NeoForge. Each `forceload add` rectangle
// is capped at 256 chunks by the server, so we split into 16x16 chunk batches.
// After all batches finish (or if cancelled), we run `/forceload remove all`.

#[tauri::command]
async fn pregenerate_chunks(app: AppHandle, total_chunks: u32) -> Result<(), String> {
    if total_chunks == 0 {
        return Err("total_chunks must be > 0".to_string());
    }
    {
        let state = app.state::<AppState>();
        let srv = state.server.lock().await;
        if srv.status != ServerStatus::Running {
            return Err("Server must be running to pre-generate chunks".to_string());
        }
    }
    {
        let state = app.state::<AppState>();
        let mut pg = state.pregen.lock().await;
        if pg.running {
            return Err("A pre-generation task is already running".to_string());
        }
        // Compute the side length of a square big enough for total_chunks.
        // We always pick an odd side so it's centered on (0,0).
        let mut side = (total_chunks as f64).sqrt().ceil() as u32;
        if side % 2 == 0 { side += 1; }
        let total = side * side;
        *pg = PregenState { running: true, total, completed: 0, cancel_requested: false };
        app.emit("pregen-update", pg.clone()).ok();
    }

    let app_task = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_pregen(&app_task, total_chunks).await;
        let s = app_task.state::<AppState>();

        // Cleanup: always remove forceloads to free server resources
        {
            let mut srv = s.server.lock().await;
            if srv.status == ServerStatus::Running {
                if let Some(stdin) = &mut srv.stdin {
                    let _ = stdin.write_all(b"forceload remove all\n").await;
                }
            }
        }

        let final_msg = match result {
            Ok(completed) => format!("[mchost] Pre-generation complete: {} chunks", completed),
            Err(e) if e == "cancelled" => "[mchost] Pre-generation cancelled".to_string(),
            Err(e) => format!("[mchost] Pre-generation failed: {}", e),
        };
        push_console_line(&s, final_msg.clone()).await;
        app_task.emit("mc-line", &final_msg).ok();

        let mut pg = s.pregen.lock().await;
        pg.running = false;
        pg.cancel_requested = false;
        app_task.emit("pregen-update", pg.clone()).ok();
    });

    Ok(())
}

async fn run_pregen(app: &AppHandle, _requested_total: u32) -> Result<u32, String> {
    let s = app.state::<AppState>();

    // Read the planned total from state (we already computed the square side)
    let total = { s.pregen.lock().await.total };
    let side_len = (total as f64).sqrt() as u32;
    let half = (side_len / 2) as i32;

    // Generate batches of 16x16 chunks (256 chunks max per /forceload command)
    const BATCH: i32 = 16;
    let mut completed: u32 = 0;

    let banner = format!(
        "[mchost] Pre-generating {} chunks ({}x{} grid centered on spawn)…",
        total, side_len, side_len
    );
    push_console_line(&s, banner.clone()).await;
    app.emit("mc-line", &banner).ok();

    let mut z = -half;
    while z <= half {
        let z_end = (z + BATCH - 1).min(half);
        let mut x = -half;
        while x <= half {
            // Cancellation check
            {
                let pg = s.pregen.lock().await;
                if pg.cancel_requested { return Err("cancelled".to_string()); }
            }
            // Check server still running
            {
                let srv = s.server.lock().await;
                if srv.status != ServerStatus::Running {
                    return Err("Server stopped during pre-generation".to_string());
                }
            }

            let x_end = (x + BATCH - 1).min(half);
            let cmd = format!("forceload add {} {} {} {}\n", x, z, x_end, z_end);
            {
                let mut srv = s.server.lock().await;
                if let Some(stdin) = &mut srv.stdin {
                    stdin.write_all(cmd.as_bytes()).await.map_err(|e| e.to_string())?;
                }
            }

            // Wait for the server to actually generate these chunks. Roughly
            // 100ms per chunk in this batch is conservative for typical hardware.
            let batch_chunks =
                ((x_end - x + 1) as u32) * ((z_end - z + 1) as u32);
            tokio::time::sleep(std::time::Duration::from_millis(
                (batch_chunks as u64 * 120).max(1500),
            )).await;

            completed += batch_chunks;
            {
                let mut pg = s.pregen.lock().await;
                pg.completed = completed.min(total);
                app.emit("pregen-update", pg.clone()).ok();
            }

            // Periodically clear forceloads in the middle of a long run so the
            // server doesn't keep too many chunks loaded at once.
            if completed % 1024 == 0 {
                let mut srv = s.server.lock().await;
                if let Some(stdin) = &mut srv.stdin {
                    let _ = stdin.write_all(b"forceload remove all\n").await;
                }
            }

            x += BATCH;
        }
        z += BATCH;
    }

    Ok(completed.min(total))
}

#[tauri::command]
async fn cancel_pregenerate(state: State<'_, AppState>) -> Result<(), String> {
    let mut pg = state.pregen.lock().await;
    if pg.running {
        pg.cancel_requested = true;
    }
    Ok(())
}

#[tauri::command]
async fn get_pregen_state(state: State<'_, AppState>) -> Result<PregenState, String> {
    Ok(state.pregen.lock().await.clone())
}

/// Force-quit the app from the frontend after the user confirms the close
/// dialog (or after stopping the server).
#[tauri::command]
fn force_quit(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|e| e.to_string())
}

#[tauri::command]
async fn restore_backup(app: AppHandle, src: String) -> Result<u64, String> {
    let cfg = config::load_config();
    let server_path = PathBuf::from(&cfg.server_path);
    let src_path = PathBuf::from(&src);
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        backup::restore_server_backup(&app_clone, &src_path, &server_path)
    })
    .await
    .map_err(|e| format!("Restore task failed: {}", e))?
}

#[tauri::command]
async fn export_debug(dest: String) -> Result<u64, String> {
    let cfg = config::load_config();
    let dest_path = PathBuf::from(&dest);
    tokio::task::spawn_blocking(move || debug_report::export_debug_report(&cfg, &dest_path))
        .await
        .map_err(|e| format!("Debug export task failed: {}", e))?
}

#[tauri::command]
fn default_downloads_dir() -> String {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

// ── Update checker ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: String,
    html_url: String,
    body: String,
    prerelease: bool,
    draft: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_name: String,
    pub release_url: String,
    pub release_notes: String,
}

#[tauri::command]
async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent(format!("GameForFun/{}", current))
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let releases: Vec<GithubRelease> = client
        .get("https://api.github.com/repos/GGF-GameForFun/GGF-GameForFun/releases")
        .send().await.map_err(|e| format!("Network error: {}", e))?
        .json().await.map_err(|e| format!("Parse error: {}", e))?;

    let latest = releases
        .into_iter()
        .find(|r| !r.draft && !r.prerelease)
        .ok_or_else(|| "No releases found".to_string())?;
    let latest_version = latest.tag_name.trim_start_matches('v').to_string();
    let update_available = is_newer(&latest_version, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version,
        update_available,
        release_name: latest.name,
        release_url: latest.html_url,
        release_notes: latest.body,
    })
}

/// Compare two semver-ish versions ("0.1.1" > "0.1.0"). Tolerant of suffixes.
fn is_newer(candidate: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split(|c: char| !c.is_ascii_digit())
            .filter(|t| !t.is_empty())
            .filter_map(|t| t.parse().ok())
            .collect()
    };
    let c = parse(candidate);
    let n = parse(current);
    for i in 0..c.len().max(n.len()) {
        let a = c.get(i).copied().unwrap_or(0);
        let b = n.get(i).copied().unwrap_or(0);
        if a > b { return true; }
        if a < b { return false; }
    }
    false
}

#[tauri::command]
fn default_server_path() -> String {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
        .join("minecraft-server").to_string_lossy().to_string()
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            server: Mutex::new(ServerManager::new()),
            playit: Mutex::new(PlayitState::new()),
            stats: Mutex::new(ServerStats::default()),
            online_players: Mutex::new(HashSet::new()),
            console_buffer: Mutex::new(VecDeque::with_capacity(CONSOLE_BUFFER_CAP)),
            recent_auto_restarts: Mutex::new(VecDeque::new()),
            recent_players: Mutex::new(VecDeque::with_capacity(RECENT_PLAYERS_CAP)),
            last_gametime_sample: Mutex::new(None),
            pregen: Mutex::new(PregenState::default()),
        })
        .invoke_handler(tauri::generate_handler![
            get_config, save_config, check_java,
            fetch_mc_versions, fetch_paper_versions, fetch_paper_builds,
            fetch_forge_versions, fetch_fabric_versions, fetch_neoforge_versions,
            install_server, start_server, stop_server, restart_server,
            send_command, get_server_status, get_server_stats, get_online_players,
            get_recent_players, get_banned_players, unban_player, get_console_buffer, clear_console_buffer,
            list_mods, add_mod, remove_mod,
            get_server_properties, save_server_properties,
            setup_playit, start_playit, stop_playit, get_playit_status,
            open_server_folder, default_server_path, default_downloads_dir,
            create_backup, restore_backup, export_debug,
            default_backup_filename, default_debug_filename,
            pregenerate_chunks, cancel_pregenerate, get_pregen_state,
            check_for_update, force_quit,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Always prevent the close — the frontend listens for
                // "close-requested" and decides whether to confirm with the
                // user (server running) or immediately call force_quit.
                api.prevent_close();
                window.emit("close-requested", ()).ok();
            }
        })
        .setup(|app| {
            // Auto-backup scheduler — wakes every minute and runs a backup
            // when `backup_interval_minutes` minutes have elapsed since the
            // last one. Runs for the lifetime of the app.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last_backup = std::time::Instant::now();
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                    let cfg = config::load_config();
                    if cfg.backup_interval_minutes == 0 { continue; }
                    let interval =
                        std::time::Duration::from_secs(cfg.backup_interval_minutes as u64 * 60);
                    if last_backup.elapsed() < interval { continue; }
                    if !cfg.setup_complete { continue; }

                    // Resolve dest dir
                    let dest_dir = if cfg.backup_dir.is_empty() {
                        dirs::download_dir()
                            .or_else(dirs::home_dir)
                            .unwrap_or_else(|| PathBuf::from("."))
                    } else {
                        PathBuf::from(&cfg.backup_dir)
                    };
                    let dest = dest_dir.join(backup::default_backup_filename());
                    let server_path = PathBuf::from(&cfg.server_path);
                    let include_logs = cfg.backup_include_logs;
                    let app_for_task = app_handle.clone();

                    let result = tokio::task::spawn_blocking(move || {
                        backup::create_server_backup(&app_for_task, &server_path, &dest, include_logs)
                    })
                    .await;

                    let msg = match result {
                        Ok(Ok((files, bytes))) => format!(
                            "[mchost] Auto-backup created: {} files, {:.1} MB",
                            files,
                            bytes as f64 / 1024.0 / 1024.0
                        ),
                        Ok(Err(e)) => format!("[mchost] Auto-backup failed: {}", e),
                        Err(e) => format!("[mchost] Auto-backup task panicked: {}", e),
                    };
                    {
                        let s = app_handle.state::<AppState>();
                        push_console_line(&s, msg.clone()).await;
                    }
                    app_handle.emit("mc-line", &msg).ok();
                    last_backup = std::time::Instant::now();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
