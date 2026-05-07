// Browser-safe mock for Tauri invoke — used when running outside the desktop app
import { ServerConfig } from "./types";

const MOCK_CONFIG: ServerConfig = {
  server_path: "/Users/demo/minecraft-server",
  java_path: "/usr/bin/java",
  minecraft_version: "1.21.1",
  server_type: "paper",
  loader_version: "132",
  ram_mb: 2048,
  max_players: 10,
  server_name: "My Minecraft Server",
  setup_complete: true,
  auto_restart: true,
  backup_interval_minutes: 0,
  backup_dir: "",
  backup_include_logs: false,
  optimized_jvm_flags: true,
  performance_preset: "balanced",
};

const handlers: Record<string, (...args: unknown[]) => unknown> = {
  get_config: () => ({ ...MOCK_CONFIG }),
  save_config: () => undefined,
  check_java: () => "/usr/bin/java",
  fetch_mc_versions: () => [
    { id: "1.21.1", release_time: "2024-08-08T12:00:00Z" },
    { id: "1.21",   release_time: "2024-06-13T12:00:00Z" },
    { id: "1.20.6", release_time: "2024-04-29T12:00:00Z" },
    { id: "1.20.4", release_time: "2023-12-07T12:00:00Z" },
    { id: "1.20.1", release_time: "2023-06-12T12:00:00Z" },
    { id: "1.19.4", release_time: "2023-03-14T12:00:00Z" },
  ],
  fetch_paper_versions: () => ["1.21.1", "1.21", "1.20.6", "1.20.4", "1.19.4"],
  fetch_paper_builds: () => [{ version: "132", label: "132 (latest)" }],
  fetch_forge_versions: () => [
    { version: "49.0.48", label: "49.0.48 (recommended)" },
    { version: "49.2.0",  label: "49.2.0 (latest)" },
  ],
  fetch_fabric_versions: () => [{ version: "0.15.11", label: "0.15.11 (latest)" }],
  fetch_neoforge_versions: () => [{ version: "20.4.244", label: "20.4.244 (latest)" }],
  default_server_path: () => "/Users/demo/minecraft-server",
  get_server_status: () => "running",
  get_server_stats: () => ({
    cpu_percent: 42.4, ram_used_mb: 1340, ram_max_mb: 2048,
    disk_read_kb_s: 12.3, disk_write_kb_s: 142.7,
    disk_used_mb: 412_000, disk_total_mb: 1_000_000,
    tps: 19.6,
    players_online: 2, players_max: 10, uptime_seconds: 3725,
  }),
  get_playit_status: () => ({ running: false, address: null, claim_url: null, pid: null }),
  start_server: () => undefined,
  stop_server: () => undefined,
  restart_server: () => undefined,
  send_command: () => undefined,
  get_recent_players: () => [["DemoPlayer1", new Date(Date.now() - 600_000).toISOString()]],
  get_banned_players: () => [
    {
      name: "BadSteve",
      uuid: "00000000-0000-0000-0000-000000000000",
      created: new Date(Date.now() - 3_600_000).toISOString(),
      source: "Server",
      expires: "forever",
      reason: "Banned by an operator.",
    },
  ],
  unban_player: () => [],
  list_mods: () => ["EssentialsX-2.20.1.jar", "WorldEdit-7.3.0.jar"],
  add_mod: () => undefined,
  remove_mod: () => undefined,
  get_server_properties: () => ({
    "online-mode": "false",
    "max-players": "10",
    "motd": "My Minecraft Server",
    "server-port": "25565",
    "difficulty": "normal",
    "gamemode": "survival",
    "pvp": "true",
    "view-distance": "10",
  }),
  save_server_properties: () => undefined,
  setup_playit: () => undefined,
  start_playit: () => undefined,
  stop_playit: () => undefined,
  open_server_folder: () => undefined,
  install_server: () => ({ ...MOCK_CONFIG, setup_complete: true }),
};

export function mockInvoke(cmd: string, _args?: unknown): Promise<unknown> {
  const handler = handlers[cmd];
  if (handler) return Promise.resolve(handler());
  console.warn(`[mock] unhandled invoke: ${cmd}`);
  return Promise.resolve(null);
}

export function mockListen(
  _event: string,
  _cb: (e: { payload: unknown }) => void
): Promise<() => void> {
  return Promise.resolve(() => {});
}
