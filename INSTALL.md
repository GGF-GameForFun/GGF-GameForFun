# GameForFun — Beta Install Guide

A desktop app for hosting cracked Minecraft servers (Vanilla / Paper / Forge / Fabric / NeoForge) with built-in playit.gg tunneling — no router config, no port forwarding.

> **Credited to Aingker** · [Discord](https://discord.gg/bF62psq97S)

---

## System Requirements

### Both platforms
| | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB total | 8 GB+ |
| Free disk | 3 GB | 10 GB |
| Internet | Required | 10 Mbps+ |
| CPU | Any 64-bit | 4 cores |

The app downloads on first run:
- **Java 17** or **Java 21** matching your Minecraft version (~45 MB, Eclipse Temurin)
- **Minecraft server jar** for the version you pick (10–50 MB)
- **playit.gg agent** (5 MB)

So your first setup pulls ~150 MB total before the server boots.

### macOS
- macOS **10.15 Catalina** or later
- Apple Silicon (M1/M2/M3/M4) **or** Intel x64

### Windows
- Windows **10 64-bit** (build 1809+) or Windows 11
- x64 only (ARM Windows not supported in this beta)

---

## Install — macOS

1. **Download** `GameForFun_0.1.0_aarch64.dmg` (Apple Silicon) or `GameForFun_0.1.0_x64.dmg` (Intel) from the release page
2. **Double-click** the `.dmg` to open it
3. **Drag** the `GameForFun.app` icon into the **Applications** folder
4. Open Finder → Applications → **right-click** `GameForFun` → click **Open**
   - macOS will warn it's from an unidentified developer (the app is unsigned in beta)
   - Click **Open** in the warning dialog — you only have to do this once
5. The app launches and shows the **Welcome to GameForFun** wizard

> ⚠ **Why right-click?** Apple's Gatekeeper blocks unsigned apps by default. Right-click → Open is the official bypass for trusted apps. Code signing requires a paid Apple Developer certificate which we'll add for the v1.0 release.

### macOS — extra one-time setup
On the very first run, the app will need to install **playit-cli** by compiling it from source. This requires Rust:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After Rust is installed, the app will automatically build playit-cli (3–5 minutes the first time, cached afterward).

> 💡 **Why?** playit.gg doesn't ship a macOS binary on GitHub or Homebrew. Rust is the only no-fuss way to install it. We'll bundle a pre-built copy in v1.0 so this step disappears.

---

## Install — Windows

1. **Download** `GameForFun_0.1.0_x64-setup.exe` (or `.msi`) from the release page
2. **Double-click** the installer
3. Windows SmartScreen will show a blue dialog (the app is unsigned in beta):
   - Click **More info**
   - Click **Run anyway**
4. Follow the installer (Next → Install → Finish)
5. Launch **GameForFun** from the Start menu or desktop shortcut

That's it — Windows users don't need Rust because playit.gg ships a Windows binary that the app downloads directly on first run.

---

## First-Run Walkthrough

1. **Welcome** — confirms Java is detected; click **Get Started**
2. **Choose Server Type** — pick one of the 5 cards (Vanilla / Paper / Forge / Fabric / NeoForge)
3. **Choose Version** — Minecraft version (live from Mojang/PaperMC API)
4. **Loader Version** — only for Paper / Forge / Fabric / NeoForge (auto-picks latest)
5. **Server Config** — server name (MOTD), install path, RAM, max players
6. **Install** — downloads server jar, runs Forge/NeoForge installer if needed, sets up `eula.txt`, creates `mods/` or `plugins/` folder
7. **playit.gg setup** — installs the tunnel agent
8. **Dashboard** opens — click **▶ Start**
9. **Tunnel tab** → click **▶ Start** → on first run, **click the yellow claim URL** → sign in to playit.gg → click **Setup tunnel**
10. After claim, the green address card appears: `xxxxx.joinmc.link:NNNN` — give that to friends

---

## Where Files Live

| | macOS | Windows |
|---|---|---|
| Config | `~/Library/Application Support/mchost/config.json` | `%APPDATA%\mchost\config.json` |
| Java JREs | `~/Library/Application Support/mchost/java/temurin-XX/` | `%LOCALAPPDATA%\mchost\java\temurin-XX\` |
| playit binary | `~/.cargo/bin/playit-cli` | `%LOCALAPPDATA%\mchost\playit\playit.exe` |
| playit secret | `~/Library/Application Support/playit_gg/playit.toml` | `%APPDATA%\playit_gg\playit.toml` |
| Your Minecraft server | wherever you chose in setup (default: `~/minecraft-server`) | wherever you chose (default: `%USERPROFILE%\minecraft-server`) |

---

## Things You Should Know (Beta Limitations)

| Limitation | Workaround |
|---|---|
| App is **not code-signed** | Right-click → Open (mac) / "Run anyway" (Windows) — first time only |
| **macOS needs Rust** for playit-cli | Install rustup once; subsequent app installs skip this |
| **No auto-update yet** | Watch the Discord for new releases |
| **Cracked-only** (online-mode=false) | Required for playit.gg tunneling to work easily; flip in Settings if you want premium accounts |
| **No mod manager from Modrinth/CurseForge yet** | Drop `.jar` files into the Mods tab manually |
| **One server at a time** | Multi-server support coming later |

---

## Troubleshooting

**"Java not found"** — install Java 17+ from [adoptium.net](https://adoptium.net). The app will detect it automatically. Java 26 won't work for MC 1.20.x — install Java 17 specifically.

**Server crashes after a few seconds** — almost always a Java version mismatch. Open Console → look for `Could not reserve enough space for object heap` (raise RAM in Settings) or `UnsupportedClassVersionError` (wrong Java version, the app should auto-pick the right one in v0.1+).

**Tunnel address never appears** — make sure you visited the claim URL in your browser and clicked **Setup tunnel**. The address polls every 3s for up to 2 minutes after Start.

**Console looks garbled** — should never happen now since v0.1; if it does, restart the agent (Tunnel tab → Stop → Start).

**Friends can't connect** — share the **`*.joinmc.link:NNNN`** address from the Tunnel tab, *not* `localhost:25565`. Have them type that exact string in Minecraft's "Add Server" dialog.

---

## Building From Source (Devs Only)

```sh
git clone <repo>
cd mchost
npm install
npm run tauri:dev    # dev mode with hot reload
npm run tauri:build  # produces .dmg / .app on mac, .msi / .exe on Windows
```

Output goes to `src-tauri/target/release/bundle/{macos,dmg,msi,nsis}/`.

---

🟢 Built by Aingker. Questions? → [discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)
