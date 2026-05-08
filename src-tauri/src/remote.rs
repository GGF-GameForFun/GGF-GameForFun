use crate::{config, AppState};
use crate::server::ServerStatus;
use serde::Serialize;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const MAX_REQUEST_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct RemoteControlState {
    pub enabled: bool,
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub token: String,
    pub lan_url: String,
    pub public_url: String,
    pub url: String,
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

pub fn local_lan_ip() -> String {
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|socket| {
            socket.connect((Ipv4Addr::new(8, 8, 8, 8), 80))?;
            socket.local_addr()
        })
        .ok()
        .and_then(|addr| match addr.ip() {
            IpAddr::V4(ip) if !ip.is_loopback() => Some(ip.to_string()),
            _ => None,
        })
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

pub fn state_from_config(running: bool) -> RemoteControlState {
    let cfg = config::load_config();
    let host = local_lan_ip();
    let token = cfg.remote_control_token;
    let lan_url = if cfg.remote_control_enabled && !token.is_empty() {
        format!(
            "http://{}:{}/?token={}",
            host, cfg.remote_control_port, token
        )
    } else {
        String::new()
    };
    let public_url = build_public_url(&cfg.remote_control_public_url, &token);
    let url = if !public_url.is_empty() {
        public_url.clone()
    } else {
        lan_url.clone()
    };

    RemoteControlState {
        enabled: cfg.remote_control_enabled,
        running,
        host,
        port: cfg.remote_control_port,
        token,
        lan_url,
        public_url,
        url,
    }
}

fn build_public_url(raw: &str, token: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() || token.is_empty() {
        return String::new();
    }
    let base = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{}", trimmed)
    };
    if base.contains("token=") {
        base
    } else {
        let separator = if base.contains('?') { '&' } else { '?' };
        format!("{}{}token={}", base, separator, token)
    }
}

pub async fn sync(app: &AppHandle) -> Result<RemoteControlState, String> {
    let cfg = config::load_config();
    let state = app.state::<AppState>();
    let mut task = state.remote_control.lock().await;

    if cfg.remote_control_enabled
        && task.is_some()
        && tokio::net::TcpStream::connect(("127.0.0.1", cfg.remote_control_port))
            .await
            .is_ok()
    {
        return Ok(state_from_config(true));
    }

    if let Some(handle) = task.take() {
        handle.abort();
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
    }

    if !cfg.remote_control_enabled {
        return Ok(state_from_config(false));
    }

    if cfg.remote_control_token.trim().is_empty() {
        return Err(
            "Remote control token is empty. Generate a token before enabling remote control."
                .to_string(),
        );
    }

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], cfg.remote_control_port));
    let listener = TcpListener::bind(bind_addr).await.map_err(|e| {
        format!(
            "Remote control failed to bind port {}: {}",
            cfg.remote_control_port, e
        )
    })?;

    let app_handle = app.clone();
    let token = cfg.remote_control_token.clone();
    let handle = tokio::spawn(async move {
        loop {
            let Ok((stream, _peer)) = listener.accept().await else {
                continue;
            };
            let app_request = app_handle.clone();
            let token_request = token.clone();
            tokio::spawn(async move {
                handle_connection(stream, app_request, token_request)
                    .await
                    .ok();
            });
        }
    });

    *task = Some(handle);
    Ok(state_from_config(true))
}

pub async fn status(app: &AppHandle) -> RemoteControlState {
    let state = app.state::<AppState>();
    let running = if state.remote_control.lock().await.is_some() {
        let cfg = config::load_config();
        tokio::net::TcpStream::connect(("127.0.0.1", cfg.remote_control_port))
            .await
            .is_ok()
    } else {
        false
    };
    state_from_config(running)
}

async fn handle_connection(
    mut stream: TcpStream,
    app: AppHandle,
    token: String,
) -> Result<(), String> {
    let request = read_request(&mut stream).await?;
    let response = route_request(request, app, &token).await;
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| e.to_string())
}

async fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut data = Vec::new();
    let mut buf = [0_u8; 4096];
    let mut header_end = None;

    while data.len() < MAX_REQUEST_BYTES {
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        if let Some(pos) = find_header_end(&data) {
            header_end = Some(pos);
            break;
        }
    }

    let header_end = header_end.ok_or_else(|| "Invalid HTTP request".to_string())?;
    let headers_raw = String::from_utf8_lossy(&data[..header_end]);
    let mut lines = headers_raw.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Missing request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("/").to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    let body_start = header_end + 4;
    while data.len() < body_start + content_length && data.len() < MAX_REQUEST_BYTES {
        let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
    }

    let body_end = (body_start + content_length).min(data.len());
    let body = data[body_start..body_end].to_vec();
    let (path, query) = parse_target(&target);

    Ok(HttpRequest {
        method,
        path,
        query,
        headers,
        body,
    })
}

fn find_header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == b"\r\n\r\n")
}

fn parse_target(target: &str) -> (String, HashMap<String, String>) {
    let (path, raw_query) = target.split_once('?').unwrap_or((target, ""));
    let mut query = HashMap::new();
    for pair in raw_query.split('&').filter(|p| !p.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        query.insert(percent_decode(key), percent_decode(value));
    }
    (path.to_string(), query)
}

fn percent_decode(input: &str) -> String {
    let mut out = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn route_request(request: HttpRequest, app: AppHandle, token: &str) -> String {
    if request.path == "/" && request.method == "GET" {
        return html_response(remote_page());
    }

    if !authorized(&request, token) {
        return json_response(
            401,
            &serde_json::json!({
                "error": "Unauthorized. Provide Authorization: Bearer <token> or ?token=<token>."
            }),
        );
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/api/status") => remote_status_response(app).await,
        ("GET", "/api/console") => remote_console_response(app).await,
        ("POST", "/api/command") => remote_command_response(app, request.body).await,
        ("POST", "/api/server/start") => remote_start_server(app).await,
        ("POST", "/api/server/stop") => remote_stop_server(app).await,
        ("POST", "/api/server/restart") => remote_restart_server(app).await,
        _ => json_response(404, &serde_json::json!({ "error": "Not found" })),
    }
}

fn authorized(request: &HttpRequest, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    if request.query.get("token").is_some_and(|v| v == token) {
        return true;
    }
    request
        .headers
        .get("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|v| v.trim() == token)
}

async fn remote_status_response(app: AppHandle) -> String {
    let state = app.state::<AppState>();
    let cfg = config::load_config();
    let status = state.server.lock().await.status.clone();
    let stats = state.stats.lock().await.clone();
    let players = state
        .online_players
        .lock()
        .await
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    let playit = state.playit.lock().await.clone();
    json_response(
        200,
        &serde_json::json!({
            "app": "GameForFun",
            "server_name": cfg.server_name,
            "minecraft_version": cfg.minecraft_version,
            "server_type": cfg.server_type,
            "status": status,
            "stats": stats,
            "players": players,
            "playit": playit,
        }),
    )
}

async fn remote_console_response(app: AppHandle) -> String {
    let state = app.state::<AppState>();
    let lines = state
        .console_buffer
        .lock()
        .await
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    json_response(200, &serde_json::json!({ "lines": lines }))
}

async fn remote_command_response(app: AppHandle, body: Vec<u8>) -> String {
    let cmd = serde_json::from_slice::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v.get("cmd").and_then(|c| c.as_str()).map(str::to_string))
        .or_else(|| String::from_utf8(body).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    if cmd.is_empty() {
        return json_response(400, &serde_json::json!({ "error": "Missing command" }));
    }

    let state = app.state::<AppState>();
    let mut srv = state.server.lock().await;
    let Some(stdin) = srv.stdin.as_mut() else {
        return json_response(
            409,
            &serde_json::json!({ "error": "Server is not running" }),
        );
    };

    match stdin.write_all(format!("{}\n", cmd).as_bytes()).await {
        Ok(_) => json_response(200, &serde_json::json!({ "ok": true })),
        Err(e) => json_response(500, &serde_json::json!({ "error": e.to_string() })),
    }
}

async fn remote_start_server(app: AppHandle) -> String {
    match crate::do_start_server(app).await {
        Ok(_) => json_response(200, &serde_json::json!({ "ok": true })),
        Err(e) => json_response(409, &serde_json::json!({ "error": e })),
    }
}

async fn remote_stop_server(app: AppHandle) -> String {
    let state = app.state::<AppState>();
    let mut srv = state.server.lock().await;
    match srv.status {
        ServerStatus::Running | ServerStatus::Starting => {
            srv.stop_requested = true;
            if let Some(stdin) = &mut srv.stdin {
                if let Err(e) = stdin.write_all(b"stop\n").await {
                    return json_response(500, &serde_json::json!({ "error": e.to_string() }));
                }
            }
            srv.status = ServerStatus::Stopping;
            json_response(200, &serde_json::json!({ "ok": true }))
        }
        _ => json_response(409, &serde_json::json!({ "error": "Server is not running" })),
    }
}

async fn remote_restart_server(app: AppHandle) -> String {
    let stop_result = remote_stop_server(app.clone()).await;
    if !stop_result.starts_with("HTTP/1.1 200") {
        return stop_result;
    }
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    remote_start_server(app).await
}

fn remote_page() -> &'static str {
    r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GameForFun Remote</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #0f0b1d; color: #f4f1ff; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    .card { background: #171226; border: 1px solid #40345f; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
    .row { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    button { background: #7c3aed; color: white; border: 0; border-radius: 8px; padding: 9px 12px; font-weight: 700; cursor: pointer; }
    input { flex: 1; min-width: 240px; background: #100c1a; color: #fff; border: 1px solid #40345f; border-radius: 8px; padding: 10px; }
    pre { white-space: pre-wrap; max-height: 420px; overflow: auto; background: #08060f; border-radius: 8px; padding: 12px; }
    .muted { color: #b8add7; }
  </style>
</head>
<body>
  <main>
    <h1>GameForFun Remote</h1>
    <div class="card">
      <div id="status" class="muted">Loading status...</div>
    </div>
    <div class="card">
      <div class="row">
        <button onclick="serverAction('start')">Start</button>
        <button onclick="serverAction('restart')">Restart</button>
        <button onclick="serverAction('stop')">Stop</button>
      </div>
      <div id="action" class="muted" style="margin-top: 10px;"></div>
    </div>
    <div class="card">
      <div class="row">
        <input id="cmd" placeholder="Minecraft command, e.g. say hello" />
        <button onclick="sendCommand()">Send</button>
      </div>
    </div>
    <div class="card">
      <div class="row"><strong>Console</strong><button onclick="refresh()">Refresh</button></div>
      <pre id="console"></pre>
    </div>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    async function api(path, opts = {}) {
      const sep = path.includes("?") ? "&" : "?";
      const res = await fetch(path + sep + "token=" + encodeURIComponent(token), opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    async function refresh() {
      try {
        const status = await api("/api/status");
        document.getElementById("status").textContent =
          `${status.server_name || "Server"} | ${status.status} | TPS ${status.stats?.tps ?? 0} | Players ${(status.players || []).length}/${status.stats?.players_max ?? 0} | ${status.playit?.address || "No public tunnel address"}`;
        const consoleData = await api("/api/console");
        document.getElementById("console").textContent = (consoleData.lines || []).slice(-200).join("\n");
      } catch (e) {
        document.getElementById("status").textContent = String(e);
      }
    }
    async function sendCommand() {
      const input = document.getElementById("cmd");
      const cmd = input.value.trim();
      if (!cmd) return;
      await api("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd }) });
      input.value = "";
      refresh();
    }
    async function serverAction(action) {
      const out = document.getElementById("action");
      out.textContent = `${action} requested...`;
      try {
        await api(`/api/server/${action}`, { method: "POST" });
        out.textContent = `${action} ok`;
        setTimeout(refresh, 700);
      } catch (e) {
        out.textContent = String(e);
      }
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>"#
}

fn html_response(body: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
}

fn json_response(status: u16, value: &serde_json::Value) -> String {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        409 => "Conflict",
        _ => "Internal Server Error",
    };
    let body = serde_json::to_string(value)
        .unwrap_or_else(|_| "{\"error\":\"serialization failed\"}".to_string());
    format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        reason,
        body.len(),
        body
    )
}
