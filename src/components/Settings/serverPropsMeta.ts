// Metadata describing each known server.properties key — used to render
// friendly inputs (toggle / number / select) with descriptions and recommended
// defaults instead of raw text fields. Keys not in this map fall through to
// the "Advanced" section as plain text inputs.

export type PropKind = "toggle" | "select" | "number" | "text";

export interface PropOption {
  value: string;
  label: { en: string; vi: string };
}

export interface PropMeta {
  key: string;
  kind: PropKind;
  category: "gameplay" | "world" | "players" | "network" | "advanced";
  label: { en: string; vi: string };
  desc?: { en: string; vi: string };
  recommended?: string; // recommended value as string
  options?: PropOption[]; // for select
  min?: number; // for number
  max?: number;
  locked?: boolean; // disabled (e.g. online-mode for cracked tunnel)
  lockReason?: { en: string; vi: string };
}

export const PROPERTY_META: PropMeta[] = [
  // ── Gameplay ────────────────────────────────────────────────────────────
  {
    key: "difficulty",
    kind: "select",
    category: "gameplay",
    label: { en: "Difficulty", vi: "Độ khó" },
    desc: {
      en: "How dangerous mobs and survival are.",
      vi: "Độ nguy hiểm của quái và mức độ sinh tồn.",
    },
    recommended: "normal",
    options: [
      { value: "peaceful", label: { en: "Peaceful", vi: "Hòa bình" } },
      { value: "easy",     label: { en: "Easy",     vi: "Dễ" } },
      { value: "normal",   label: { en: "Normal",   vi: "Bình thường" } },
      { value: "hard",     label: { en: "Hard",     vi: "Khó" } },
    ],
  },
  {
    key: "gamemode",
    kind: "select",
    category: "gameplay",
    label: { en: "Game Mode", vi: "Chế độ chơi" },
    desc: {
      en: "Default game mode for new players.",
      vi: "Chế độ chơi mặc định cho người chơi mới.",
    },
    recommended: "survival",
    options: [
      { value: "survival",  label: { en: "Survival",  vi: "Sinh tồn" } },
      { value: "creative",  label: { en: "Creative",  vi: "Sáng tạo" } },
      { value: "adventure", label: { en: "Adventure", vi: "Phiêu lưu" } },
      { value: "spectator", label: { en: "Spectator", vi: "Khán giả" } },
    ],
  },
  {
    key: "hardcore",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Hardcore", vi: "Hardcore" },
    desc: {
      en: "Players are banned permanently after dying.",
      vi: "Người chơi bị ban vĩnh viễn khi chết.",
    },
    recommended: "false",
  },
  {
    key: "pvp",
    kind: "toggle",
    category: "gameplay",
    label: { en: "PvP", vi: "PvP (đánh nhau)" },
    desc: {
      en: "Allow players to damage each other.",
      vi: "Cho phép người chơi đánh lẫn nhau.",
    },
    recommended: "true",
  },
  {
    key: "allow-flight",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Allow Flight", vi: "Cho phép bay" },
    desc: {
      en: "Allow flight for survival players (mods/plugins). Otherwise they get kicked.",
      vi: "Cho phép bay ở chế độ sinh tồn (mod/plugin). Nếu không sẽ bị kick.",
    },
    recommended: "false",
  },
  {
    key: "allow-nether",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Allow Nether", vi: "Cho phép vào Nether" },
    recommended: "true",
  },
  {
    key: "spawn-monsters",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Spawn Monsters", vi: "Sinh quái" },
    recommended: "true",
  },
  {
    key: "spawn-animals",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Spawn Animals", vi: "Sinh động vật" },
    recommended: "true",
  },
  {
    key: "spawn-npcs",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Spawn Villagers (NPCs)", vi: "Sinh dân làng (NPC)" },
    recommended: "true",
  },
  {
    key: "force-gamemode",
    kind: "toggle",
    category: "gameplay",
    label: { en: "Force Game Mode", vi: "Ép chế độ chơi" },
    desc: {
      en: "Force every player into the default game mode on join.",
      vi: "Ép mọi người chơi vào chế độ mặc định khi vào server.",
    },
    recommended: "false",
  },

  // ── World ───────────────────────────────────────────────────────────────
  {
    key: "level-name",
    kind: "text",
    category: "world",
    label: { en: "World Folder Name", vi: "Tên thư mục world" },
    desc: {
      en: "Folder under server directory holding the world.",
      vi: "Tên thư mục trong server chứa world.",
    },
    recommended: "world",
  },
  {
    key: "level-seed",
    kind: "text",
    category: "world",
    label: { en: "World Seed", vi: "Seed của world" },
    desc: {
      en: "Leave empty for random. Only used when generating a new world.",
      vi: "Để trống để random. Chỉ dùng khi tạo world mới.",
    },
  },
  {
    key: "level-type",
    kind: "select",
    category: "world",
    label: { en: "World Type", vi: "Loại world" },
    recommended: "minecraft:normal",
    options: [
      { value: "minecraft:normal",       label: { en: "Normal",       vi: "Bình thường" } },
      { value: "minecraft:flat",         label: { en: "Flat",         vi: "Phẳng" } },
      { value: "minecraft:large_biomes", label: { en: "Large Biomes", vi: "Biome lớn" } },
      { value: "minecraft:amplified",    label: { en: "Amplified",    vi: "Khuếch đại" } },
    ],
  },
  {
    key: "generate-structures",
    kind: "toggle",
    category: "world",
    label: { en: "Generate Structures", vi: "Tạo công trình" },
    desc: {
      en: "Villages, dungeons, strongholds, etc.",
      vi: "Làng, dungeon, stronghold v.v.",
    },
    recommended: "true",
  },
  {
    key: "view-distance",
    kind: "number",
    category: "world",
    label: { en: "View Distance (chunks)", vi: "Tầm nhìn (chunk)" },
    desc: {
      en: "How many chunks players can see. Higher = more lag.",
      vi: "Số chunk người chơi thấy được. Càng cao càng lag.",
    },
    recommended: "10",
    min: 3,
    max: 32,
  },
  {
    key: "simulation-distance",
    kind: "number",
    category: "world",
    label: { en: "Simulation Distance", vi: "Tầm mô phỏng" },
    desc: {
      en: "Chunks where mobs and ticks run. Lower for more performance.",
      vi: "Chunk mà quái và tick chạy. Thấp hơn = hiệu năng tốt hơn.",
    },
    recommended: "10",
    min: 3,
    max: 32,
  },
  {
    key: "spawn-protection",
    kind: "number",
    category: "world",
    label: { en: "Spawn Protection (blocks)", vi: "Bảo vệ vùng spawn (block)" },
    desc: {
      en: "Radius around spawn that non-ops can't break/build. 0 = disabled.",
      vi: "Bán kính quanh spawn mà người chơi thường không phá/xây được. 0 = tắt.",
    },
    recommended: "16",
    min: 0,
    max: 64,
  },
  {
    key: "max-world-size",
    kind: "number",
    category: "world",
    label: { en: "Max World Size (radius)", vi: "Kích thước world tối đa" },
    recommended: "29999984",
    min: 1,
  },

  // ── Players ─────────────────────────────────────────────────────────────
  {
    key: "max-players",
    kind: "number",
    category: "players",
    label: { en: "Max Players", vi: "Số người chơi tối đa" },
    recommended: "10",
    min: 1,
    max: 200,
  },
  {
    key: "white-list",
    kind: "toggle",
    category: "players",
    label: { en: "Whitelist", vi: "Whitelist" },
    desc: {
      en: "Only players on the whitelist can join.",
      vi: "Chỉ người chơi trong whitelist mới vào được.",
    },
    recommended: "false",
  },
  {
    key: "enforce-whitelist",
    kind: "toggle",
    category: "players",
    label: { en: "Enforce Whitelist", vi: "Áp dụng whitelist nghiêm ngặt" },
    desc: {
      en: "Kick non-whitelisted players already online when whitelist updates.",
      vi: "Kick người chơi không có trong whitelist khi whitelist cập nhật.",
    },
    recommended: "false",
  },
  {
    key: "online-mode",
    kind: "toggle",
    category: "players",
    label: { en: "Online Mode (premium check)", vi: "Online Mode (kiểm tra premium)" },
    desc: {
      en: "Verify players against Mojang. Required FALSE for cracked clients & playit.gg tunneling.",
      vi: "Xác minh người chơi qua Mojang. Phải TẮT cho client crack & dùng tunnel playit.gg.",
    },
    recommended: "false",
    locked: true,
    lockReason: {
      en: "Locked off by GameForFun for tunnel compatibility.",
      vi: "Đã khóa tắt bởi GameForFun để tunnel hoạt động.",
    },
  },
  {
    key: "op-permission-level",
    kind: "select",
    category: "players",
    label: { en: "OP Permission Level", vi: "Mức quyền OP" },
    desc: {
      en: "What OPs can do. 4 = full access.",
      vi: "Quyền hạn của OP. 4 = toàn quyền.",
    },
    recommended: "4",
    options: [
      { value: "1", label: { en: "1 — Bypass spawn protection",  vi: "1 — Bỏ qua spawn protection" } },
      { value: "2", label: { en: "2 — Use cheats & command blocks", vi: "2 — Dùng cheat & command block" } },
      { value: "3", label: { en: "3 — Multiplayer admin commands", vi: "3 — Lệnh admin multiplayer" } },
      { value: "4", label: { en: "4 — Full server control",      vi: "4 — Toàn quyền server" } },
    ],
  },

  // ── Network ─────────────────────────────────────────────────────────────
  {
    key: "motd",
    kind: "text",
    category: "network",
    label: { en: "MOTD (server description)", vi: "MOTD (mô tả server)" },
    desc: {
      en: "Shown in the Minecraft multiplayer server list.",
      vi: "Hiển thị trong danh sách server multiplayer.",
    },
  },
  {
    key: "server-port",
    kind: "number",
    category: "network",
    label: { en: "Server Port", vi: "Port server" },
    desc: {
      en: "Default 25565. Don't change unless you know why.",
      vi: "Mặc định 25565. Đừng đổi nếu không cần thiết.",
    },
    recommended: "25565",
    min: 1024,
    max: 65535,
  },
  {
    key: "network-compression-threshold",
    kind: "number",
    category: "network",
    label: { en: "Compression Threshold (bytes)", vi: "Ngưỡng nén (byte)" },
    desc: {
      en: "Packets larger than this are compressed. -1 disables, 256 default.",
      vi: "Gói lớn hơn ngưỡng này sẽ được nén. -1 = tắt, mặc định 256.",
    },
    recommended: "256",
  },
  {
    key: "prevent-proxy-connections",
    kind: "toggle",
    category: "network",
    label: { en: "Prevent Proxy Connections", vi: "Chặn kết nối qua proxy" },
    desc: {
      en: "Reject players connecting through VPNs/proxies.",
      vi: "Từ chối người chơi vào qua VPN/proxy.",
    },
    recommended: "false",
  },
  {
    key: "hide-online-players",
    kind: "toggle",
    category: "network",
    label: { en: "Hide Online Players List", vi: "Ẩn danh sách online" },
    recommended: "false",
  },

  // ── Advanced ────────────────────────────────────────────────────────────
  {
    key: "broadcast-console-to-ops",
    kind: "toggle",
    category: "advanced",
    label: { en: "Broadcast Console To OPs", vi: "Phát console cho OP" },
    recommended: "true",
  },
  {
    key: "broadcast-rcon-to-ops",
    kind: "toggle",
    category: "advanced",
    label: { en: "Broadcast RCON To OPs", vi: "Phát RCON cho OP" },
    recommended: "true",
  },
  {
    key: "enable-command-block",
    kind: "toggle",
    category: "advanced",
    label: { en: "Enable Command Blocks", vi: "Bật command block" },
    recommended: "false",
  },
  {
    key: "enable-rcon",
    kind: "toggle",
    category: "advanced",
    label: { en: "Enable RCON", vi: "Bật RCON" },
    recommended: "false",
  },
  {
    key: "enable-query",
    kind: "toggle",
    category: "advanced",
    label: { en: "Enable Query", vi: "Bật Query" },
    recommended: "false",
  },
  {
    key: "sync-chunk-writes",
    kind: "toggle",
    category: "advanced",
    label: { en: "Sync Chunk Writes", vi: "Ghi chunk đồng bộ" },
    recommended: "true",
  },
  {
    key: "use-native-transport",
    kind: "toggle",
    category: "advanced",
    label: { en: "Use Native Transport (Linux)", vi: "Dùng Native Transport (Linux)" },
    recommended: "true",
  },
];

export const CATEGORY_META: Record<
  PropMeta["category"],
  { label: { en: string; vi: string }; icon: string }
> = {
  gameplay: { label: { en: "Gameplay",       vi: "Gameplay" },        icon: "🎮" },
  world:    { label: { en: "World",          vi: "Thế giới" },        icon: "🌍" },
  players:  { label: { en: "Players",        vi: "Người chơi" },      icon: "👥" },
  network:  { label: { en: "Network",        vi: "Mạng" },            icon: "🌐" },
  advanced: { label: { en: "Advanced",       vi: "Nâng cao" },        icon: "⚙️" },
};

export function metaFor(key: string): PropMeta | undefined {
  return PROPERTY_META.find((m) => m.key === key);
}
