# 🎮 GameForFun — Quản Lý Server Minecraft

🌐 [English](./README.md) | Tiếng Việt

Ứng dụng desktop nhẹ để host server Minecraft — Vanilla, Paper, Forge, Fabric và NeoForge — tích hợp sẵn [playit.gg](https://playit.gg) giúp bạn bè có thể vào chơi mà không cần cấu hình router hay mở port.

> Được tạo bởi **Aingker** · [Cộng đồng Discord](https://discord.gg/bF62psq97S)

---

## ✨ Tính Năng

- **Cài đặt server một chạm** — chọn phiên bản, app tự tải mọi thứ
- **5 loại server** — Vanilla, Paper, Forge, Fabric, NeoForge
- **Console trực tiếp** — gửi lệnh, xem log theo thời gian thực
- **Tunnel playit.gg** — địa chỉ công khai để bạn bè vào chơi, không cần mở port
- **Quản lý người chơi** — xem danh sách online, OP hoặc kick ngay trong app
- **Quản lý Mod / Plugin** — thêm hoặc xoá file `.jar` trực tiếp từ app
- **Hệ thống backup** — backup ZIP một chạm với timestamp tự động
- **Tiếng Anh & Tiếng Việt** — hỗ trợ đa ngôn ngữ đầy đủ
- **macOS & Windows** — ứng dụng native trên cả hai nền tảng

---

## 🪟 Cài Đặt Trên Windows

### Yêu Cầu
- Windows 10 (64-bit, build 1809 trở lên) hoặc Windows 11
- **Không cần** cài Java trước — app tự xử lý

### Các Bước

1. Vào trang [**Releases**](../../releases)
2. Mở bản phát hành mới nhất
3. Tải asset bộ cài Windows (ví dụ `GameForFun_0.1.0_x64-setup.exe` hoặc tên mới nhất tương đương)
4. Double-click vào file cài đặt và làm theo hướng dẫn

> **Bị Windows SmartScreen chặn?** App chưa được ký số trong bản beta này. Click **More info → Run anyway**. Đây là bình thường với các app indie chưa có chứng chỉ Microsoft.

Trình cài đặt sẽ tự động cài **Microsoft Edge WebView2** (yêu cầu bắt buộc của Tauri) nếu máy bạn chưa có — bước này được xử lý hoàn toàn tự động.

Sau khi cài xong, mở **GameForFun** từ Start menu hoặc shortcut trên desktop và làm theo wizard thiết lập.

---

## 🍎 Cài Đặt Trên macOS (Terminal)

### Yêu Cầu
- macOS 10.15 Catalina trở lên (Apple Silicon hoặc Intel)
- [Node.js 18+](https://nodejs.org)
- [Rust](https://rustup.rs)

### Các Bước

**1. Cài Rust** (bỏ qua nếu đã có)
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**2. Cài Node.js** (bỏ qua nếu đã có)
```bash
brew install node
```

**3. Clone và build**
```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install
npm run tauri:build
```

**4. Mở app**

Sau khi build xong, mở file `.dmg`:
```
src-tauri/target/release/bundle/dmg/GameForFun_0.1.0_aarch64.dmg
```

Double-click vào `.dmg`, kéo **GameForFun** vào thư mục Applications và mở lên.

> **Bị Gatekeeper chặn?** Right-click vào app → **Open** → click **Open** trong hộp thoại. Chỉ cần làm một lần vì app chưa được ký số trong bản beta.

---

## 🚀 Lần Đầu Chạy App

1. Wizard kiểm tra Java — cài Java 17+ từ [adoptium.net](https://adoptium.net) nếu được yêu cầu
2. Chọn loại server (Vanilla / Paper / Forge / Fabric / NeoForge)
3. Chọn phiên bản Minecraft
4. Đặt tên server, đường dẫn cài đặt và dung lượng RAM
5. Bấm **Install** — app tự tải mọi thứ
6. Sau khi xong, bấm **▶ Start** trên Dashboard
7. Mở tab **Tunnel** và bấm **▶ Start**
8. Nếu hiện **claim URL**, bấm vào và đăng nhập trên playit.gg
9. Trên playit.gg, tạo tunnel loại **Minecraft Java** và đặt local port là `25565` (hoặc đúng port server của bạn)
10. Quay lại GameForFun và chờ card Tunnel hiển thị địa chỉ public
11. Chia sẻ địa chỉ đó cho bạn bè (`domain:port` nếu có port)

## 🌐 Hướng Dẫn Nhanh playit.gg (Quan Trọng)

Nhiều người dùng bị thiếu 1 bước nên tunnel chạy nhưng bạn bè vẫn không vào được.

1. Bật Minecraft server trước (Dashboard phải hiện **Online**).
2. Mở tab **Tunnel** và bật playit agent.
3. Nếu có claim URL thì hoàn tất claim.
4. Trong dashboard playit, tunnel type phải là **Minecraft Java (TCP)**.
5. Local address phải trỏ đúng máy/port server (`127.0.0.1:25565` hoặc LAN IP + server port).
6. Chờ GameForFun hiển thị địa chỉ trong card Tunnel.
7. Nếu chưa thấy địa chỉ ngay, giữ tab Tunnel mở thêm một lúc sau khi claim.

Nếu bạn bè không kết nối được:

1. Kiểm tra server còn chạy ổn định.
2. Kiểm tra local port tunnel trùng `server-port` trong `server.properties`.
3. Thử dùng trực tiếp `IP:PORT` từ playit dashboard.
4. Tắt/bật lại Tunnel một lần.

---

## 🛠 Build Từ Source (Dành Cho Dev)

```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install

# Chế độ dev với hot reload
npm run dev

# Build native đầy đủ (.dmg trên macOS, .exe trên Windows)
npm run tauri:build
```

---

## 📝 Nhật Ký Phát Triển

### v0.1.1-v2 — Bản cập nhật nhỏ *(mới nhất)*

**`fix`** — cải thiện hiển thị địa chỉ playit.gg sau khi claim/setup
- `src-tauri/src/lib.rs` — tiếp tục poll API playit khi agent còn chạy, không dừng sau ~2 phút
- `src-tauri/src/playit.rs` — parse địa chỉ tunnel chắc chắn hơn với nhiều dạng response API

**`feat`** — cải thiện nhập Mod
- `src/components/Mods/ModManager.tsx` — kéo/thả file `.jar` + chọn nhiều file cùng lúc
- `src/tauri.ts` — wrapper file dialog hỗ trợ multi-select
- `src/styles/globals.css` — bỏ chặn text-selection toàn cục để `Ctrl/Cmd + A` hoạt động trong input

**`feat`** — tùy chọn dọn dữ liệu khi gỡ cài đặt trên Windows
- `src-tauri/windows/hooks.nsh` + `src-tauri/tauri.conf.json` — prompt khi uninstall để tùy chọn xóa data app/playit và thư mục server đã cấu hình

**`docs`** — onboarding rõ ràng hơn và tải bản phát hành dễ hơn
- `README.md`, `README_VI.md` — thêm hướng dẫn nhanh playit.gg, bước cài đặt trỏ thẳng đến Releases

### v0.1.1 — Ổn định & Hoàn thiện

**`feat`** — danh sách người chơi bền vững, bộ đệm console, và tự động khởi động lại khi crash *(`01fc1fe`)*
- `src-tauri/src/lib.rs` — backend giờ tracking người chơi online & đệm 2000 dòng console gần nhất; emit event `auto-restart-requested` khi server thoát bất ngờ
- `src-tauri/src/server.rs` — thêm flag `stop_requested` để phân biệt rõ user dừng hay server crash
- `src-tauri/src/config.rs` — thêm field `auto_restart` (mặc định bật)
- `src/App.tsx` — lắng nghe `auto-restart-requested` ở cấp app và tự gọi lại `start_server`
- `src/components/Players/Players.tsx` — load lại từ backend khi mount; subscribe event `players-update` thay vì parse log
- `src/components/Console/Console.tsx` — load lại từ buffer backend khi mount; nút **Clear** cũng xóa buffer backend
- `src/components/Settings/ServerSettings.tsx` — thêm toggle bật/tắt auto-restart trong phần App config
- `src/types.ts`, `src/tauriMock.ts`, `src/components/Setup/SetupWizard.tsx` — thêm `auto_restart` vào `ServerConfig`

**`feat`** — đổi loại server, phiên bản MC, mod loader từ Settings *(`f094419`)*
- `src/components/Settings/ServerSettings.tsx` — thêm component `VersionChangeCard` cho phép người dùng chuyển giữa Vanilla / Paper / Forge / Fabric / NeoForge hoặc chọn phiên bản MC khác mà không cần làm lại Setup

**`fix`** — hiển thị lỗi và luôn điều hướng khi fetch version thất bại *(`6e36dfd`)*
- `src/components/Setup/SetupWizard.tsx` — thêm state `fetchError` + nút Retry để khi gọi API Mojang/PaperMC fail thì các nút không bị "chết" im lặng

### v0.1.0 — Bản Phát Hành Đầu Tiên

**`feat`** — bản public đầu tiên *(`2ba097e`)*
- Khung dự án đầy đủ: React + Tauri + Rust backend
- Vòng đời server, console, người chơi, mods, settings, tunnel, backup, export debug
- Hỗ trợ song ngữ Tiếng Anh & Tiếng Việt

---

## 💬 Cộng Đồng & Hỗ Trợ

Tham gia Discord để được hỗ trợ, cập nhật tin tức mới nhất và giao lưu:
**[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

*GameForFun là dự án cộng đồng. Nếu bạn thấy app hữu ích, hãy ủng hộ mình qua mã QR trong phần About của app nhé ❤️*
