# 🎮 GameForFun — Minecraft Server Manager

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
7. Go to the **Tunnel** tab → **▶ Start** → click the claim URL → set up your playit.gg tunnel
8. Share the `xxxxx.joinmc.link:NNNNN` address with your friends — they paste it directly into Minecraft's Add Server screen

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

## 💬 Community & Support

Join the Discord for help, updates, and to hang out:
**[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

*GameForFun is a community project. If you find it useful, consider supporting via the donation QR in the app's About section ❤️*
