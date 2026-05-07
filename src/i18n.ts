// Lightweight i18n system — no deps. Locale state in localStorage, dynamic switching, no restart needed.
import { createContext, useContext, useState, useEffect, useCallback, createElement, ReactNode } from "react";

export type Locale = "en" | "vi";

const STORAGE_KEY = "gameforfun.locale";

type Dict = Record<string, string>;

export const TRANSLATIONS: Record<Locale, Dict> = {
  en: {
    // Generic
    "common.start": "Start",
    "common.stop": "Stop",
    "common.restart": "Restart",
    "common.starting": "Starting…",
    "common.stopping": "Stopping…",
    "common.online": "Online",
    "common.offline": "Offline",
    "common.connected": "Connected",
    "common.disconnected": "Disconnected",
    "common.copy": "Copy",
    "common.copied": "Copied",
    "common.close": "Close",
    "common.send": "Send",
    "common.clear": "Clear",
    "common.save": "Save",
    "common.back": "Back",
    "common.next": "Next",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.idle": "idle",
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.saved": "Saved",

    // Sidebar / navigation
    "nav.dashboard": "Dashboard",
    "nav.console": "Console",
    "nav.tunnel": "Tunnel",
    "nav.players": "Players",
    "nav.mods": "Mods",
    "nav.settings": "Settings",

    // Top bar
    "topbar.language": "Language",
    "topbar.info": "About",

    // Dashboard
    "dashboard.title": "Dashboard",
    "dashboard.serverStatus": "Server Status",
    "dashboard.uptime": "Uptime",
    "dashboard.ram": "RAM",
    "dashboard.cpu": "CPU",
    "dashboard.players": "Players",
    "dashboard.disk": "Disk",
    "dashboard.tps": "TPS",
    "dashboard.diskWrite": "Disk Write",
    "dashboard.diskRead": "Disk Read",
    "tier.good": "Good",
    "tier.normal": "Normal",
    "tier.critical": "Critical",
    "tier.na": "N/A",
    "dashboard.server": "Server",
    "dashboard.tunnel": "Tunnel",
    "dashboard.tunnelHint": "Manage in the Tunnel tab →",
    "dashboard.connectingTunnel": "Connecting…",
    "dashboard.quickActions": "Quick Actions",
    "dashboard.openServerFolder": "Open Server Folder",

    // Console
    "console.title": "Console",
    "console.placeholder": "Server console output will appear here…",
    "console.commandPrompt": "Enter server command…",

    // Tunnel
    "tunnel.title": "playit.gg Tunnel",
    "tunnel.active": "Tunnel is active",
    "tunnel.inactive": "Tunnel is offline",
    "tunnel.starting": "Starting tunnel…",
    "tunnel.claimTitle": "Action Required — Claim your tunnel",
    "tunnel.claimDesc": "Open the URL below in your browser, sign into playit.gg, and click \"Setup tunnel\" so the agent can authenticate. After that, the address will appear here automatically.",
    "tunnel.serverAddress": "Server Address",
    "tunnel.shareHint": "Share this with friends — they connect to it in Minecraft as a server address.",
    "tunnel.agentLog": "playit.gg Agent Log",
    "tunnel.logPlaceholder": "playit.gg agent output will appear here when the tunnel is running…",

    // Players
    "players.title": "Players",
    "players.online": "Online players",
    "players.empty": "No players online. They will appear here when they join.",
    "players.serverOffline": "Server is offline. Start the server to see players.",
    "players.op": "OP",
    "players.kick": "Kick",
    "players.deop": "Remove OP",
    "players.confirmKick": "Kick {name} from the server?",
    "players.confirmOp": "Give operator privileges to {name}?",
    "players.confirmDeop": "Remove operator privileges from {name}?",

    // Mods
    "mods.title": "Mods / Plugins",
    "mods.empty": "No mods yet. Drag a .jar file here or use the upload button.",
    "mods.upload": "Upload .jar",
    "mods.remove": "Remove",
    "mods.add": "Add Mod",
    "mods.warnRunning": "ℹ Stop the server before adding or removing mods to avoid corruption.",
    "mods.loadingList": "Loading mods…",

    // Settings
    "settings.title": "Settings",
    "settings.serverName": "Server Name",
    "settings.ram": "RAM (MB)",
    "settings.maxPlayers": "Max Players",
    "settings.serverPath": "Server Path",
    "settings.javaPath": "Java Path",
    "settings.serverProperties": "server.properties",
    "settings.restartHint": "Restart the server for changes to take effect.",
    "settings.serverConfigSection": "Server Config",

    // Setup wizard
    "setup.welcomeTitle": "Welcome to GameForFun",
    "setup.welcomeDesc": "Host a cracked Minecraft server (Vanilla, Paper, Forge, Fabric, or NeoForge) with playit.gg tunneling — no router config needed.",
    "setup.javaDetected": "✓ Java detected: {path}",
    "setup.getStarted": "Get Started →",
    "setup.chooseType": "Choose Server Type",
    "setup.chooseTypeDesc": "Pick the server software for your Minecraft world.",
    "setup.chooseVersion": "{name} — Choose Version",
    "setup.chooseVersionDesc": "Pick the Minecraft version for your {name} server.",
    "setup.minecraftVersion": "Minecraft Version",
    "setup.fetchingVersions": "Fetching versions…",
    "setup.fetching": "Fetching…",
    "setup.loaderHeaderBuild": "{name} Build",
    "setup.loaderHeaderVersion": "{name} Version",
    "setup.loaderDescBuild": "Select a {name} build for Minecraft {mc}.",
    "setup.loaderDescVersion": "Select a {name} loader for Minecraft {mc}.",
    "setup.loaderLabelBuild": "{name} Build",
    "setup.loaderLabelVersion": "{name} Version",
    "setup.notFoundFor": "No {name} versions found for {mc}. Try a different MC version.",
    "setup.serverConfig": "Server Config",
    "setup.serverConfigDesc": "Configure your server settings.",
    "setup.serverNameMOTD": "Server Name (MOTD)",
    "setup.installPath": "Install Path",
    "setup.crackedNote": "✓ Cracked mode (online-mode=false) will be set automatically.",
    "setup.installButton": "Install Server →",
    "setup.installing": "Installing…",
    "setup.preparing": "Preparing…",
    "setup.playitTitle": "Setting up playit.gg",
    "setup.playitDesc": "playit.gg gives your server a public address without port forwarding.",
    "setup.playitDownloading": "Downloading playit.gg…",
    "setup.playitFailed": "⚠ playit.gg setup failed: {err}",

    // Tools (Backup / Debug Export)
    "tools.title": "Tools & Maintenance",
    "tools.backup.title": "Server Backup",
    "tools.backup.desc": "Create a ZIP archive of your world, mods/plugins, configs, and server.properties. Stop the server first for a consistent snapshot.",
    "tools.backup.button": "Create Backup",
    "tools.backup.includeLogs": "Include logs/ folder",
    "tools.backup.running": "Backing up… {files} files · {mb} MB",
    "tools.backup.success": "✓ Backup saved: {files} files, {mb} MB → {path}",
    "tools.backup.warnRunning": "⚠ Server is running. Stop it first to avoid an inconsistent backup.",
    "tools.debug.title": "Debug Report",
    "tools.debug.desc": "Bundle app version, system specs, recent server logs, and crash reports into a single ZIP. Useful when reporting bugs.",
    "tools.debug.button": "Export Debug Report",
    "tools.debug.success": "✓ Debug report saved: {files} files → {path}",

    // Info popup
    "info.body": "Yo, I'm Tiến Anh — you can call me Aindrew or Aingker.\n\nThis app was crafted from the ground up with the power of ChatGPT, OpenClaw, and Claude Code. Built by passion, fueled by late nights 🌙, and made for the community 🎮.\n\nIf you enjoy the app and want to support the grind ⚡, feel free to drop a donation through the QR code below ❤️",
    "info.donateLabel": "Scan with your banking app to donate",
  },

  vi: {
    "common.start": "Bắt đầu",
    "common.stop": "Dừng",
    "common.restart": "Khởi động lại",
    "common.starting": "Đang khởi động…",
    "common.stopping": "Đang dừng…",
    "common.online": "Đang chạy",
    "common.offline": "Đã tắt",
    "common.connected": "Đã kết nối",
    "common.disconnected": "Chưa kết nối",
    "common.copy": "Sao chép",
    "common.copied": "Đã chép",
    "common.close": "Đóng",
    "common.send": "Gửi",
    "common.clear": "Xoá",
    "common.save": "Lưu",
    "common.back": "Quay lại",
    "common.next": "Tiếp",
    "common.cancel": "Huỷ",
    "common.confirm": "Xác nhận",
    "common.idle": "đang nghỉ",
    "common.loading": "Đang tải…",
    "common.retry": "Thử lại",
    "common.saved": "Đã lưu",

    "nav.dashboard": "Tổng quan",
    "nav.console": "Console",
    "nav.tunnel": "Tunnel",
    "nav.players": "Người chơi",
    "nav.mods": "Mods",
    "nav.settings": "Cài đặt",

    "topbar.language": "Ngôn ngữ",
    "topbar.info": "Thông tin",

    "dashboard.title": "Tổng quan",
    "dashboard.serverStatus": "Trạng thái server",
    "dashboard.uptime": "Thời gian chạy",
    "dashboard.ram": "RAM",
    "dashboard.cpu": "CPU",
    "dashboard.players": "Người chơi",
    "dashboard.disk": "Ổ đĩa",
    "dashboard.tps": "TPS",
    "dashboard.diskWrite": "Ghi đĩa",
    "dashboard.diskRead": "Đọc đĩa",
    "tier.good": "Tốt",
    "tier.normal": "Bình thường",
    "tier.critical": "Quá tải",
    "tier.na": "Không khả dụng",
    "dashboard.server": "Server",
    "dashboard.tunnel": "Tunnel",
    "dashboard.tunnelHint": "Quản lý trong tab Tunnel →",
    "dashboard.connectingTunnel": "Đang kết nối…",
    "dashboard.quickActions": "Hành động nhanh",
    "dashboard.openServerFolder": "Mở thư mục server",

    "console.title": "Console",
    "console.placeholder": "Log của server sẽ hiển thị ở đây…",
    "console.commandPrompt": "Nhập lệnh server…",

    "tunnel.title": "Tunnel playit.gg",
    "tunnel.active": "Tunnel đang hoạt động",
    "tunnel.inactive": "Tunnel chưa hoạt động",
    "tunnel.starting": "Đang khởi động tunnel…",
    "tunnel.claimTitle": "Cần xử lý — Kết nối tunnel với tài khoản",
    "tunnel.claimDesc": "Mở link bên dưới trong trình duyệt, đăng nhập vào playit.gg và bấm \"Setup tunnel\" để xác thực agent. Sau đó địa chỉ server sẽ tự động xuất hiện ở đây.",
    "tunnel.serverAddress": "Địa chỉ server",
    "tunnel.shareHint": "Chia sẻ địa chỉ này cho bạn bè — họ dùng nó để kết nối trong Minecraft.",
    "tunnel.agentLog": "Log agent playit.gg",
    "tunnel.logPlaceholder": "Log của agent playit.gg sẽ xuất hiện ở đây khi tunnel chạy…",

    "players.title": "Người chơi",
    "players.online": "Đang online",
    "players.empty": "Chưa có người chơi nào online. Họ sẽ xuất hiện ở đây khi tham gia.",
    "players.serverOffline": "Server chưa chạy. Hãy bật server để xem người chơi.",
    "players.op": "OP",
    "players.kick": "Kick",
    "players.deop": "Bỏ OP",
    "players.confirmKick": "Kick {name} khỏi server?",
    "players.confirmOp": "Cấp quyền OP cho {name}?",
    "players.confirmDeop": "Gỡ quyền OP của {name}?",

    "mods.title": "Mods / Plugins",
    "mods.empty": "Chưa có mod nào. Kéo file .jar vào hoặc bấm Upload.",
    "mods.upload": "Tải file .jar",
    "mods.remove": "Xoá",
    "mods.add": "Thêm mod",
    "mods.warnRunning": "ℹ Hãy tắt server trước khi thêm/xoá mod để tránh hỏng dữ liệu.",
    "mods.loadingList": "Đang tải danh sách mods…",

    "settings.title": "Cài đặt",
    "settings.serverName": "Tên server",
    "settings.ram": "RAM (MB)",
    "settings.maxPlayers": "Số người tối đa",
    "settings.serverPath": "Đường dẫn server",
    "settings.javaPath": "Đường dẫn Java",
    "settings.serverProperties": "server.properties",
    "settings.restartHint": "Khởi động lại server để áp dụng thay đổi.",
    "settings.serverConfigSection": "Cấu hình server",

    "setup.welcomeTitle": "Chào mừng đến với GameForFun",
    "setup.welcomeDesc": "Host server Minecraft cracked (Vanilla, Paper, Forge, Fabric hoặc NeoForge) qua tunnel playit.gg — không cần mở port router.",
    "setup.javaDetected": "✓ Đã tìm thấy Java: {path}",
    "setup.getStarted": "Bắt đầu →",
    "setup.chooseType": "Chọn loại Server",
    "setup.chooseTypeDesc": "Chọn phần mềm server cho thế giới Minecraft của bạn.",
    "setup.chooseVersion": "{name} — Chọn phiên bản",
    "setup.chooseVersionDesc": "Chọn phiên bản Minecraft cho server {name}.",
    "setup.minecraftVersion": "Phiên bản Minecraft",
    "setup.fetchingVersions": "Đang tải danh sách phiên bản…",
    "setup.fetching": "Đang tải…",
    "setup.loaderHeaderBuild": "Build {name}",
    "setup.loaderHeaderVersion": "Phiên bản {name}",
    "setup.loaderDescBuild": "Chọn một build {name} cho Minecraft {mc}.",
    "setup.loaderDescVersion": "Chọn loader {name} cho Minecraft {mc}.",
    "setup.loaderLabelBuild": "Build {name}",
    "setup.loaderLabelVersion": "Phiên bản {name}",
    "setup.notFoundFor": "Không tìm thấy phiên bản {name} cho {mc}. Hãy thử phiên bản MC khác.",
    "setup.serverConfig": "Cấu hình server",
    "setup.serverConfigDesc": "Tuỳ chỉnh cài đặt server của bạn.",
    "setup.serverNameMOTD": "Tên server (MOTD)",
    "setup.installPath": "Đường dẫn cài đặt",
    "setup.crackedNote": "✓ Chế độ cracked (online-mode=false) sẽ được bật tự động.",
    "setup.installButton": "Cài đặt server →",
    "setup.installing": "Đang cài đặt…",
    "setup.preparing": "Đang chuẩn bị…",
    "setup.playitTitle": "Đang cài đặt playit.gg",
    "setup.playitDesc": "playit.gg cấp địa chỉ public cho server mà không cần mở port router.",
    "setup.playitDownloading": "Đang tải playit.gg…",
    "setup.playitFailed": "⚠ Cài đặt playit.gg thất bại: {err}",

    "tools.title": "Công cụ & Bảo trì",
    "tools.backup.title": "Sao lưu server",
    "tools.backup.desc": "Tạo file ZIP chứa world, mods/plugins, configs và server.properties. Nên tắt server trước để bản sao lưu được nhất quán.",
    "tools.backup.button": "Tạo bản sao lưu",
    "tools.backup.includeLogs": "Bao gồm cả thư mục logs/",
    "tools.backup.running": "Đang sao lưu… {files} files · {mb} MB",
    "tools.backup.success": "✓ Đã lưu: {files} files, {mb} MB → {path}",
    "tools.backup.warnRunning": "⚠ Server đang chạy. Hãy tắt trước để tránh sao lưu lỗi.",

    "tools.debug.title": "Báo cáo lỗi",
    "tools.debug.desc": "Đóng gói thông tin app, cấu hình máy, log server gần nhất và crash report vào một file ZIP. Hữu ích khi báo bug.",
    "tools.debug.button": "Xuất báo cáo lỗi",
    "tools.debug.success": "✓ Đã xuất báo cáo: {files} files → {path}",

    "info.body": "Yo, mình là Tiến Anh — mọi người có thể gọi mình là Aindrew hoặc Aingker.\n\nApp này được mình build từ đầu với sự hỗ trợ của ChatGPT, OpenClaw và Claude Code. Tất cả đều bắt đầu từ đam mê, những đêm thức khuya 🌙, và mong muốn tạo ra thứ gì đó dành cho cộng đồng 🎮.\n\nNếu bạn thấy app hữu ích và muốn ủng hộ mình tiếp tục phát triển ⚡, có thể donate qua mã QR bên dưới nhé ❤️",
    "info.donateLabel": "Quét mã bằng app ngân hàng để donate",
  },
};

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const Ctx = createContext<LocaleCtx>({
  locale: "en",
  setLocale: () => {},
  t: (k) => k,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    return saved === "vi" || saved === "en" ? saved : "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: string, vars?: Record<string, string>) => {
    const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
    let s = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, v);
      }
    }
    return s;
  }, [locale]);

  return createElement(Ctx.Provider, { value: { locale, setLocale, t } }, children);
}

export function useT() {
  return useContext(Ctx);
}
