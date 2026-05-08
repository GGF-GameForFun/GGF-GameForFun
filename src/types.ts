export type ServerStatus = "stopped" | "starting" | "running" | "stopping";
export type ServerType = "vanilla" | "paper" | "forge" | "fabric" | "neoforge";

export interface ServerConfig {
  server_path: string;
  java_path: string;
  minecraft_version: string;
  server_type: ServerType;
  loader_version: string | null;
  ram_mb: number;
  max_players: number;
  server_name: string;
  setup_complete: boolean;
  auto_restart: boolean;
  backup_interval_minutes: number;
  backup_dir: string;
  backup_include_logs: boolean;
  optimized_jvm_flags: boolean;
  performance_preset: string;
  remote_control_enabled: boolean;
  remote_control_port: number;
  remote_control_token: string;
  remote_control_public_url: string;
  cloudflare_remote_enabled: boolean;
}

export interface RemoteControlState {
  enabled: boolean;
  running: boolean;
  host: string;
  port: number;
  token: string;
  lan_url: string;
  public_url: string;
  url: string;
}

export interface CloudflareTunnelState {
  running: boolean;
  url: string | null;
  pid: number | null;
  message: string;
}

export interface McVersion {
  id: string;
  release_time: string;
}

export interface LoaderVersion {
  version: string;
  label: string;
}

export interface PlayitState {
  running: boolean;
  address: string | null;
  claim_url: string | null;
  pid: number | null;
}

export interface InstallProgress {
  message: string;
  progress: number;
}

export interface ServerStats {
  cpu_percent: number;
  ram_used_mb: number;
  ram_max_mb: number;
  disk_read_kb_s: number;
  disk_write_kb_s: number;
  disk_used_mb: number;
  disk_total_mb: number;
  /** 0 = unknown / not yet sampled / unsupported server type */
  tps: number;
  players_online: number;
  players_max: number;
  uptime_seconds: number;
}

export interface BannedPlayer {
  name: string;
  uuid: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface ServerTypeMeta {
  id: ServerType;
  name: string;
  icon: string;
  description: string;
  needsLoader: boolean;
}

export const SERVER_TYPES: ServerTypeMeta[] = [
  { id: "vanilla",  name: "Vanilla",  icon: "🌐", description: "Pure Minecraft, no plugins or mods", needsLoader: false },
  { id: "paper",    name: "Paper",    icon: "🚀", description: "Optimized server with plugin support", needsLoader: true },
  { id: "forge",    name: "Forge",    icon: "🔧", description: "Classic mod loader, huge ecosystem",  needsLoader: true },
  { id: "fabric",   name: "Fabric",   icon: "🧵", description: "Lightweight modern mod loader",        needsLoader: true },
  { id: "neoforge", name: "NeoForge", icon: "🔨", description: "Modern fork of Forge",                  needsLoader: true },
];
