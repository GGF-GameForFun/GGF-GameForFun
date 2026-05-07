use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;

const CONSOLE_BUFFER_CAP: usize = 2000;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
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
}

/// Window in which we count restarts (5 minutes), and the max we allow.
/// Beyond this, we consider it a crash loop and stop restarting.
const RESTART_WINDOW_SECS: u64 = 300;
const MAX_RESTARTS_IN_WINDOW: usize = 3;

async fn push_console_line(state: &AppState, line: String) {
    let mut buf = state.console_buffer.lock().await;
    if buf.len() >= CONSOLE_BUFFER_CAP { buf.pop_front(); }
    buf.push_back(line);
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
    tokio::fs::write(
        server_dir.join("server.properties"),
        format!(
            "online-mode=false\nmax-players={}\nmotd={}\nserver-port=25565\n",
            cfg.max_players, cfg.server_name
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
            c.args([
                &format!("-Xmx{}M", ram),
                &format!("-Xms{}M", ram / 2),
                "-jar", "server.jar", "nogui",
            ]);
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

            // Player join/leave parsing — vanilla, paper, forge, fabric all use same format
            if let Some((name, is_join)) = parse_player_event(&line) {
                let s = app3.state::<AppState>();
                let mut players = s.online_players.lock().await;
                if is_join { players.insert(name); }
                else       { players.remove(&name); }
                let list: Vec<String> = players.iter().cloned().collect();
                let count = players.len() as u32;
                drop(players);

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

    // TPS query loop — every 10s, send the right `tps` command for this server type.
    // Vanilla and Fabric servers don't have a built-in TPS command, so we skip them.
    let tps_cmd: Option<&'static str> = match cfg.server_type {
        ServerType::Paper => Some("tps\n"),
        ServerType::Forge | ServerType::NeoForge => Some("forge tps\n"),
        _ => None,
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
    // The CLI's --stdout mode never prints the address (only the TUI does),
    // so we have to fetch it from api.playit.gg directly.
    let app_poll = app;
    tokio::spawn(async move {
        for _ in 0..40 { // ~2 minutes at 3s intervals
            tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
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

    // Tunnel address: matches things like "xxxx.joinmc.link:25565", "...play.gg:25565",
    // "tunnel.playit.gg:25565", or anything ending in :NNNN that looks like a host.
    for word in line.split(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ',') {
        let w = word.trim_end_matches(|c: char| c == '.' || c == ')' || c == ']');
        let is_tunnel_host = w.contains(".joinmc.link")
            || w.contains(".play.gg")
            || w.contains(".playit.gg");
        if !is_tunnel_host { continue; }
        // Must have a port
        let last_colon = w.rfind(':');
        if let Some(idx) = last_colon {
            let port = &w[idx + 1..];
            if port.parse::<u16>().is_ok() {
                if pl.address.as_deref() != Some(w) {
                    pl.address = Some(w.to_string());
                    pl.claim_url = None; // hide the claim banner once we have an address
                    updated = true;
                }
                break;
            }
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
        })
        .invoke_handler(tauri::generate_handler![
            get_config, save_config, check_java,
            fetch_mc_versions, fetch_paper_versions, fetch_paper_builds,
            fetch_forge_versions, fetch_fabric_versions, fetch_neoforge_versions,
            install_server, start_server, stop_server, restart_server,
            send_command, get_server_status, get_server_stats, get_online_players,
            get_console_buffer, clear_console_buffer,
            list_mods, add_mod, remove_mod,
            get_server_properties, save_server_properties,
            setup_playit, start_playit, stop_playit, get_playit_status,
            open_server_folder, default_server_path, default_downloads_dir,
            create_backup, export_debug,
            default_backup_filename, default_debug_filename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
