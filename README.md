# GameForFun

<p align="center">
  <img src="./src/assets/gameforfun-logo-ui.png" alt="GameForFun logo" width="132" />
</p>

<h3 align="center">Minecraft hosting made simple for friends, small communities, and chaos testing.</h3>

<p align="center">
  <a href="./README_VI.md">🇻🇳 Tiếng Việt</a>
  ·
  <a href="../../releases">⬇️ Download</a>
  ·
  <a href="https://discord.gg/bF62psq97S">💬 Discord</a>
</p>

GameForFun is a desktop app for hosting Minecraft Java servers without touching your router. Pick a server type, choose a Minecraft version, let the app install it, then share a public playit.gg address with friends.

Built for **Vanilla**, **Paper**, **Forge**, **Fabric**, and **NeoForge** servers.

> Built by **Aingker** · Monkey Zoo Crew approved

---

## ✨ What It Does

| Area | What you get |
|---|---|
| **🧩 Server setup** | Install Vanilla, Paper, Forge, Fabric, or NeoForge from a guided wizard |
| **🌐 Tunneling** | Built-in playit.gg tunnel so friends can join without port forwarding |
| **🖥️ Console** | Live server logs, command input, and retained console history |
| **👥 Players** | View online players, OP, kick, ban, unban, and teleport |
| **📦 Mods / Plugins** | Add or remove `.jar` files with upload or drag-and-drop |
| **💾 Backups** | Create ZIP backups, restore backups, and schedule auto-backups |
| **⚡ Performance** | JVM optimization presets, TPS monitoring, and chunk pre-generation |
| **🌍 Languages** | English and Vietnamese UI |

---

## ⬇️ Download

Go to the [Releases page](../../releases) and download the latest version.

| Platform | File to download | Notes |
|---|---|---|
| **Windows** | `GameForFun_*_x64-setup.exe` | Windows 10/11, 64-bit |
| **macOS Apple Silicon** | `GameForFun_*_aarch64.dmg` | M1 / M2 / M3 / M4 Macs |

The app is still unsigned during beta.

**Windows SmartScreen:** click **More info → Run anyway**.<br>
**macOS Gatekeeper:** right-click the app → **Open** → **Open**.

---

## 🚀 First Run

1. Open **GameForFun**.
2. Pick a server type: Vanilla, Paper, Forge, Fabric, or NeoForge.
3. Choose a Minecraft version and loader/build version if needed.
4. Set your server name, folder, RAM, and max players.
5. Click **Install Server**.
6. Open the Dashboard and click **Start**.
7. Open the Tunnel tab and start playit.gg.
8. Complete the claim link if playit.gg asks for it.
9. Share the public tunnel address with friends.

That is the basic loop: **install → start → tunnel → share**.

---

## 🌐 playit.gg Quick Guide

If friends cannot join, check these first:

1. Dashboard shows the Minecraft server is **Online**.
2. Tunnel tab shows playit.gg is running.
3. playit.gg tunnel type is **Minecraft Java / TCP**.
4. The local tunnel port matches `server-port` in `server.properties`, usually `25565`.
5. Use the exact address shown by GameForFun or playit.gg, including the port if one is shown.

If the tunnel address does not appear immediately after claiming, keep the Tunnel tab open for a bit. The app keeps polling playit.gg while the agent is running.

---

## ⚡ Performance Tips

Creative-mode flying and heavy modpacks can load chunks extremely fast. If CPU usage spikes:

- Use **Settings → Performance → Low CPU**.
- Keep **Optimized JVM flags** enabled.
- Lower **View Distance** to `6–8`.
- Lower **Simulation Distance** to `4–6`.
- Use **Pre-generate Chunks** before players explore far from spawn.

GameForFun starts Minecraft as a normal Java process. The app helps tune launch flags and settings, but CPU/RAM limits still depend on your machine and modpack.

---

## 🧰 Main Features

### 🎮 Server Control

- Start, stop, restart, and auto-restart after crashes
- Crash-loop protection so broken servers do not restart forever
- Open server folder directly from the app
- Change Minecraft version or loader from Settings

### 👥 Player Admin

- Online player list
- Recently joined list
- Minecraft head avatars
- OP / de-OP
- Kick
- Ban
- Banned player list
- Unban
- Teleport one player to another

### 🛠️ Tools

- Manual ZIP backup
- Restore from backup ZIP
- Auto-backup scheduler
- Debug report export
- Pre-generate chunks to reduce exploration lag

---

## 🧑‍💻 Build From Source

Requirements:

- Node.js 18+
- Rust stable
- Tauri dependencies for your OS

```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install

# Browser dev preview
npm run dev

# Native Tauri dev app
npm run tauri:dev

# Native release build
npm run tauri:build
```

Build output appears under:

```text
src-tauri/target/release/bundle/
```

---

## Project Status

GameForFun is in beta. The current focus is:

- cleaner UI
- lower resource usage
- better modded-server workflows
- safer backups and restore tools
- smoother playit.gg onboarding

Planned future ideas:

- server update checker
- modpack installer
- richer TPS and resource graphs
- Discord notifications
- multi-server support

---

## Dev Logs

<details open>
<summary><strong>v0.1.3 — Windows Polish, Updates & Tunnel Fixes</strong></summary>

- Added friendlier emojis to the GitHub homepage.
- Hid Windows child-process console windows for Java/server/playit.gg background launches.
- Prevented private/local addresses from replacing the public playit.gg tunnel address.
- Added a launch-time GitHub Release update check with a confirmation popup.
- Kept remote console and file transfer on the roadmap for a future secure implementation.

</details>

<details>
<summary><strong>v0.1.2 — Branding, Performance & Admin Tools</strong></summary>

### Branding and UI

- Replaced native app icons with the new GameForFun logo.
- Added lightweight sidebar logo asset.
- Refreshed the UI with a blue-purple dark theme.
- Updated sidebar branding with the Monkey Zoo Crew subtitle.

### Performance

- Added performance presets: Balanced, Low CPU, Heavy Modpack, Max Performance.
- Added optimized JVM flags toggle.
- Applied Minecraft-focused G1GC flags during server launch.
- Managed Forge / NeoForge JVM flags through `user_jvm_args.txt`.
- Reduced console render cost by showing the latest visible log window.
- Removed forced page remounting during tab switches.

### Player Admin

- Added Banned Players list.
- Added reliable Unban that edits `banned-players.json` and sends `pardon` when running.
- Added ban metadata display.

### Localization

- Moved remaining hardcoded UI text into the EN/VI localization system.

</details>

<details>
<summary><strong>v0.1.1-v2 — playit.gg and Installer Reliability</strong></summary>

- Improved playit.gg address polling after claim/setup.
- Improved tunnel address extraction from playit.gg API responses.
- Added drag-and-drop `.jar` import.
- Added multi-file mod/plugin picker.
- Added optional cleanup prompt during Windows uninstall.
- Updated docs to point users to GitHub Releases.

</details>

<details>
<summary><strong>v0.1.1 — Stability & Polish</strong></summary>

- Persistent online player tracking.
- Backend console buffer.
- Auto-restart on crash.
- Change server type/version/loader from Settings.
- Better error handling when version fetching fails.

</details>

<details>
<summary><strong>v0.1.0 — Initial Release</strong></summary>

- React + Tauri + Rust app scaffold.
- Server lifecycle controls.
- Console, Players, Mods, Settings, Tunnel, Backup, and Debug Export.
- English and Vietnamese localization.

</details>

---

## Community

Need help, want to test builds, or just want to hang out?

Join the Discord: **[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

GameForFun is a community project. If you find it useful, the app includes a donation QR in the About section.
