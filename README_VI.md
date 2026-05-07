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

1. Vào tab [**Actions**](../../actions) trên trang này
2. Click vào lần chạy **Build Windows Installer** thành công gần nhất
3. Kéo xuống phần **Artifacts** và tải **GameForFun-Windows-Installer.zip**
4. Giải nén — bên trong có file `GameForFun_0.1.0_x64-setup.exe`
5. Double-click vào file cài đặt và làm theo hướng dẫn

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
7. Vào tab **Tunnel** → **▶ Start** → click vào claim URL → thiết lập tunnel playit.gg
8. Chia sẻ địa chỉ `xxxxx.joinmc.link:NNNNN` cho bạn bè — dán thẳng vào ô Add Server trong Minecraft

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

## 💬 Cộng Đồng & Hỗ Trợ

Tham gia Discord để được hỗ trợ, cập nhật tin tức mới nhất và giao lưu:
**[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

*GameForFun là dự án cộng đồng. Nếu bạn thấy app hữu ích, hãy ủng hộ mình qua mã QR trong phần About của app nhé ❤️*
