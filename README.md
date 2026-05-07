# 🎮 GameForFun — Minecraft Server Manager

🌐 [Tiếng Việt](./README_VI.md) | English

**Current small update: `v0.1.1v2`**

A lightweight desktop app for hosting Minecraft servers — Vanilla, Paper, Forge, Fabric, and NeoForge — with built-in [playit.gg](https://playit.gg) tunneling so your friends can join without any router setup or port forwarding.

> Built by **Aingker** · [Discord Community](https://discord.gg/bF62psq97S)

---

## ✨ Features

- **One-click server setup** — pick your version, the app downloads everything
- **5 server types** — Vanilla, Paper, Forge, Fabric, NeoForge
- **Live console** — send commands, watch logs in real time
- **playit.gg tunnel** — public address for friends to join, no port forwarding needed
- **Player management** — view online players, OP or kick directly from the UI
- **Mod / Plugin manager** — add or remove `.jar` files from the app
- **Backup system** — one-click ZIP backup with timestamp
- **English & Vietnamese** — full UI localization
- **macOS & Windows** — native app on both platforms

---

## 🪟 Install on Windows

### Requirements
- Windows 10 (64-bit, build 1809+) or Windows 11
- Java is **not** required beforehand — the app handles it

### Steps

1. Go to the [**Actions**](../../actions) tab on this page
2. Click the latest successful **Build Windows Installer** run
3. Scroll down to **Artifacts** and download **GameForFun-Windows-Installer.zip**
4. Extract the zip — you'll find `GameForFun_0.1.0_x64-setup.exe`
5. Double-click the installer and follow the wizard

> **Windows SmartScreen warning?** The app is unsigned in this beta. Click **More info → Run anyway**. This is normal for indie apps without a Microsoft certificate.

The installer automatically sets up **Microsoft Edge WebView2** (required by all Tauri apps) if it's not already on your system — this is handled for you.

After installing, launch **GameForFun** from the Start menu or desktop shortcut and follow the setup wizard.

---

## 🍎 Install on macOS (Terminal)

### Requirements
- macOS 10.15 Catalina or later (Apple Silicon or Intel)
- [Node.js 18+](https://nodejs.org)
- [Rust](https://rustup.rs)

### Steps

**1. Install Rust** (skip if already installed)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**2. Install Node.js** (skip if already installed)
```bash
brew install node
```

**3. Clone and build**
```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install
npm run tauri:build
```

**4. Open the app**

After the build completes, open the `.dmg`:
```
src-tauri/target/release/bundle/dmg/GameForFun_0.1.0_aarch64.dmg
```

Double-click it, drag **GameForFun** into your Applications folder, and launch it.

> **Gatekeeper warning?** Right-click the app → **Open** → click **Open** in the dialog. You only need to do this once since the app is unsigned in beta.

---

## 🚀 First Run

1. The setup wizard checks for Java — install Java 17+ from [adoptium.net](https://adoptium.net) if prompted
2. Pick your server type (Vanilla / Paper / Forge / Fabric / NeoForge)
3. Choose your Minecraft version
4. Set server name, install path, and RAM allocation
5. Hit **Install** — the app downloads everything automatically
6. Once done, click **▶ Start** on the Dashboard
7. Go to the **Tunnel** tab and click **▶ Start**
8. If you see a **claim link**, click it and log in on the playit.gg page
9. On playit.gg, create a **Minecraft Java** tunnel and set local port to `25565` (or your server port)
10. Return to GameForFun and wait until the tunnel card shows your public address
11. Share that address with friends (`domain:port` if port is shown)

## 🌐 playit.gg Quick Guide (Important)

Many users miss one of these steps, so the tunnel connects but friends still cannot join.

1. Start your Minecraft server first (Dashboard must show **Online**).
2. Open **Tunnel** tab and start playit agent.
3. Complete the claim URL if prompted.
4. In playit dashboard, ensure tunnel type is **Minecraft Java (TCP)**.
5. Local address should point to your server machine and port (`127.0.0.1:25565` or your LAN IP + server port).
6. Wait for GameForFun to show tunnel address card.
7. If address does not appear yet, keep the Tunnel tab open for a bit after claiming.

If friends cannot connect:

1. Confirm server is running and not crashed.
2. Confirm tunnel local port matches `server-port` in `server.properties`.
3. Try direct `IP:PORT` from playit dashboard.
4. Stop/start Tunnel once.

---

## 🛠 Build from Source (Developers)

```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install

# Dev mode with hot reload
npm run dev

# Full native build (.dmg on macOS, .exe on Windows)
npm run tauri:build
```

---

## 📝 Dev Logs

### v0.1.1 — Stability & Polish *(latest)*

**`feat`** — persistent player list, console buffer, and auto-restart on crash *(`01fc1fe`)*
- `src-tauri/src/lib.rs` — backend now tracks online players & buffers last 2000 console lines; emits `auto-restart-requested` event on unexpected exit
- `src-tauri/src/server.rs` — added `stop_requested` flag to reliably distinguish user-stop from crash
- `src-tauri/src/config.rs` — added `auto_restart` config field (default true)
- `src/App.tsx` — listens for `auto-restart-requested` at app level and re-invokes `start_server`
- `src/components/Players/Players.tsx` — hydrates from backend on mount; subscribes to `players-update` event instead of parsing log lines
- `src/components/Console/Console.tsx` — hydrates from backend buffer on mount; **Clear** also clears backend buffer
- `src/components/Settings/ServerSettings.tsx` — added auto-restart toggle in App config card
- `src/types.ts`, `src/tauriMock.ts`, `src/components/Setup/SetupWizard.tsx` — added `auto_restart` to `ServerConfig`

**`feat`** — change server type, MC version, and mod loader from settings *(`f094419`)*
- `src/components/Settings/ServerSettings.tsx` — added `VersionChangeCard` component letting users switch between Vanilla / Paper / Forge / Fabric / NeoForge and pick a different MC version without going through Setup again

**`fix`** — show error and always navigate when version fetch fails *(`6e36dfd`)*
- `src/components/Setup/SetupWizard.tsx` — added `fetchError` state + Retry button so failed Mojang/PaperMC API calls no longer leave the buttons silently dead

### v0.1.0 — Initial Release

**`feat`** — first public release *(`2ba097e`)*
- Full project scaffold: React + Tauri + Rust backend
- Server lifecycle, console, players, mods, settings, tunnel, backup, debug export
- English & Vietnamese localization

---

## 💬 Community & Support

Join the Discord for help, updates, and to hang out:
**[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

*GameForFun is a community project. If you find it useful, consider supporting via the donation QR in the app's About section ❤️*
