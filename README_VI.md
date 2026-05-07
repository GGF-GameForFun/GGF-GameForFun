# GameForFun

<p align="center">
  <img src="./src/assets/gameforfun-logo-ui.png" alt="Logo GameForFun" width="132" />
</p>

<h3 align="center">Host server Minecraft dễ hơn cho bạn bè, cộng đồng nhỏ, và những buổi test hơi hỗn loạn.</h3>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="../../releases">Tải bản mới nhất</a>
  ·
  <a href="https://discord.gg/bF62psq97S">Discord</a>
</p>

GameForFun là app desktop giúp bạn host Minecraft Java server mà không cần mở port router. Chọn loại server, chọn phiên bản Minecraft, để app tự cài đặt, rồi chia sẻ địa chỉ playit.gg public cho bạn bè.

Hỗ trợ **Vanilla**, **Paper**, **Forge**, **Fabric**, và **NeoForge**.

> Build bởi **Aingker** · Một bầy khỉ trong sở thú

---

## App Làm Được Gì?

| Mục | Tính năng |
|---|---|
| **Cài server** | Cài Vanilla, Paper, Forge, Fabric, hoặc NeoForge bằng wizard dễ dùng |
| **Tunnel** | Tích hợp playit.gg để bạn bè join mà không cần port forwarding |
| **Console** | Xem log live, nhập command, giữ lịch sử console |
| **Người chơi** | Xem online, OP, kick, ban, gỡ ban, dịch chuyển |
| **Mods / Plugins** | Thêm/xóa file `.jar` bằng upload hoặc kéo thả |
| **Backup** | Tạo ZIP backup, phục hồi backup, và lên lịch auto-backup |
| **Hiệu năng** | JVM preset, TPS monitor, và tạo trước chunk |
| **Ngôn ngữ** | Giao diện Tiếng Anh và Tiếng Việt |

---

## Tải App

Vào trang [Releases](../../releases) và tải bản mới nhất.

| Nền tảng | File cần tải | Ghi chú |
|---|---|---|
| **Windows** | `GameForFun_*_x64-setup.exe` | Windows 10/11, 64-bit |
| **macOS Apple Silicon** | `GameForFun_*_aarch64.dmg` | Mac M1 / M2 / M3 / M4 |

App hiện vẫn là bản beta chưa ký chứng chỉ.

**Windows SmartScreen:** bấm **More info → Run anyway**.<br>
**macOS Gatekeeper:** chuột phải vào app → **Open** → **Open**.

---

## Lần Chạy Đầu Tiên

1. Mở **GameForFun**.
2. Chọn loại server: Vanilla, Paper, Forge, Fabric, hoặc NeoForge.
3. Chọn phiên bản Minecraft và loader/build nếu cần.
4. Cài tên server, thư mục, RAM, và số người chơi tối đa.
5. Bấm **Install Server**.
6. Vào Dashboard và bấm **Start**.
7. Vào tab Tunnel và bật playit.gg.
8. Nếu có claim link, bấm vào và đăng nhập playit.gg.
9. Chia sẻ địa chỉ public tunnel cho bạn bè.

Luồng cơ bản là: **cài đặt → chạy server → bật tunnel → gửi địa chỉ**.

---

## Hướng Dẫn Nhanh playit.gg

Nếu bạn bè không vào được server, kiểm tra các mục này trước:

1. Dashboard phải hiện Minecraft server đang **Online**.
2. Tab Tunnel phải hiện playit.gg đang chạy.
3. Tunnel trên playit.gg phải là **Minecraft Java / TCP**.
4. Port local của tunnel phải khớp `server-port` trong `server.properties`, thường là `25565`.
5. Dùng đúng địa chỉ GameForFun hoặc playit.gg hiển thị, gồm cả port nếu có.

Nếu vừa claim xong mà địa chỉ chưa hiện ngay, giữ tab Tunnel mở thêm một chút. App sẽ tiếp tục poll playit.gg khi agent còn chạy.

---

## Mẹo Giảm Lag / CPU

Bay creative và modpack nặng có thể tải chunk cực nhanh. Nếu CPU tăng cao:

- Dùng **Settings → Performance → Low CPU**.
- Bật **Optimized JVM flags**.
- Giảm **View Distance** xuống `6–8`.
- Giảm **Simulation Distance** xuống `4–6`.
- Dùng **Pre-generate Chunks** trước khi người chơi đi khám phá xa spawn.

GameForFun chạy Minecraft như một Java process bình thường. App hỗ trợ tinh chỉnh flags và settings, nhưng giới hạn CPU/RAM vẫn phụ thuộc vào máy và modpack của bạn.

---

## Tính Năng Chính

### Điều Khiển Server

- Start, stop, restart, và auto-restart khi crash
- Chống crash-loop để server lỗi không restart vô hạn
- Mở thư mục server trực tiếp từ app
- Đổi phiên bản Minecraft hoặc loader trong Settings

### Quản Lý Người Chơi

- Danh sách người chơi online
- Danh sách người vừa tham gia
- Avatar đầu Minecraft
- OP / bỏ OP
- Kick
- Ban
- Danh sách người chơi bị ban
- Gỡ ban
- Dịch chuyển người chơi

### Công Cụ

- ZIP backup thủ công
- Phục hồi từ file backup ZIP
- Auto-backup theo lịch
- Xuất debug report
- Tạo trước chunk để giảm lag khi khám phá

---

## Build Từ Source

Yêu cầu:

- Node.js 18+
- Rust stable
- Dependencies Tauri theo hệ điều hành

```bash
git clone https://github.com/GGF-GameForFun/GGF-GameForFun.git
cd GGF-GameForFun
npm install

# Dev preview trên browser
npm run dev

# Native Tauri dev app
npm run tauri:dev

# Build bản release native
npm run tauri:build
```

File build nằm trong:

```text
src-tauri/target/release/bundle/
```

---

## Trạng Thái Dự Án

GameForFun đang ở giai đoạn beta. Trọng tâm hiện tại:

- UI sạch và dễ dùng hơn
- giảm tài nguyên sử dụng
- workflow tốt hơn cho server modded
- backup/restore an toàn hơn
- onboarding playit.gg mượt hơn

Ý tưởng tương lai:

- kiểm tra cập nhật server
- cài modpack tự động
- biểu đồ TPS và tài nguyên chi tiết hơn
- thông báo Discord
- hỗ trợ nhiều server

---

## Nhật Ký Phát Triển

<details>
<summary><strong>v0.1.2 — Thương hiệu, Hiệu năng & Công cụ Admin</strong></summary>

### Thương hiệu và UI

- Thay icon app native bằng logo GameForFun mới.
- Thêm logo nhẹ cho sidebar.
- Làm mới UI với theme tối xanh-tím.
- Cập nhật sidebar với subtitle “Monkey Zoo Crew” / “Một bầy khỉ trong sở thú”.

### Hiệu năng

- Thêm preset: Cân bằng, Tiết kiệm CPU, Modpack nặng, Hiệu năng tối đa.
- Thêm toggle JVM flags tối ưu.
- Áp dụng G1GC flags dành cho Minecraft khi chạy server.
- Quản lý JVM flags cho Forge / NeoForge qua `user_jvm_args.txt`.
- Giảm render console bằng cách chỉ hiển thị vùng log mới nhất.
- Bỏ remount trang không cần thiết khi đổi tab.

### Admin Người Chơi

- Thêm danh sách người chơi bị ban.
- Gỡ ban ổn định hơn: sửa trực tiếp `banned-players.json` và gửi `pardon` nếu server đang chạy.
- Hiển thị thông tin ban.

### Localization

- Chuyển các text còn hardcode sang hệ thống dịch EN/VI.

</details>

<details>
<summary><strong>v0.1.1-v2 — playit.gg và Installer ổn định hơn</strong></summary>

- Cải thiện polling địa chỉ playit.gg sau khi claim/setup.
- Parse địa chỉ tunnel chắc hơn từ API playit.gg.
- Thêm kéo-thả `.jar`.
- Thêm chọn nhiều file mod/plugin.
- Thêm prompt dọn dữ liệu khi uninstall trên Windows.
- Cập nhật docs trỏ người dùng đến GitHub Releases.

</details>

<details>
<summary><strong>v0.1.1 — Ổn định & Hoàn thiện</strong></summary>

- Theo dõi người chơi online bền vững.
- Buffer console ở backend.
- Auto-restart khi crash.
- Đổi server type/version/loader từ Settings.
- Hiển thị lỗi rõ hơn khi fetch version thất bại.

</details>

<details>
<summary><strong>v0.1.0 — Bản đầu tiên</strong></summary>

- Scaffold app React + Tauri + Rust.
- Điều khiển vòng đời server.
- Console, Players, Mods, Settings, Tunnel, Backup, Debug Export.
- Localization Tiếng Anh và Tiếng Việt.

</details>

---

## Cộng Đồng

Cần hỗ trợ, muốn test bản mới, hoặc chỉ muốn vào chơi?

Tham gia Discord: **[discord.gg/bF62psq97S](https://discord.gg/bF62psq97S)**

---

GameForFun là dự án cộng đồng. Nếu bạn thấy app hữu ích, trong app có mã QR donate ở phần About.
