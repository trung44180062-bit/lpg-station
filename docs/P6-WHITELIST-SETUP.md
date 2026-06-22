# P6 — BẬT WHITELIST / ĐĂNG NHẬP THẬT (handoff)

> Mục tiêu: chuyển app từ **chế độ DEV** (ai mở cũng là admin) sang **chế độ THẬT**
> (chỉ email có trong whitelist mới vào được; quyền ghi theo vai trò).
> Toàn bộ logic người dùng nằm ở **`js/core/auth.js`** (module duy nhất).
>
> ⚠ **THỨ TỰ CỰC KỲ QUAN TRỌNG để KHÔNG tự khoá mình ra ngoài:**
> làm Firebase Console **TRƯỚC** (B1→B3), bật cờ code **SAU CÙNG** (B4).
> Nếu bật Rules mà chưa có email mình trong whitelist → không ai ghi được.

Trạng thái wiring (đã kiểm 2026-06-20):
- `index.html` đã nạp `firebase-auth-compat.js` (dòng ~2926) ✓
- `firebaseConfig` (config.js): project `hsvc-lpg-station`, RTDB `asia-southeast1` ✓
- `auth.js`: `MATRIX` quyền, `emailKey()`, `lookupWhitelist()`, `login()/logout()`,
  `onAuthStateChanged`. **Đăng nhập BẮT BUỘC** — đã gỡ DEV/admin mặc định (mặc định = viewer khách, `canWrite=false`).

---

## B1 · Firebase Console → bật Google Sign-in
1. console.firebase.google.com → project **hsvc-lpg-station**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
   (Dùng Google cho tiện vì đồng nghiệp đều có Gmail; không phải quản mật khẩu.)
3. **Authentication → Settings → Authorized domains → Add domain:** thêm domain
   GitHub Pages của bạn (vd `phuong.github.io`) và `localhost` (để test Live Server).

## B2 · Tạo whitelist trong Realtime Database
1. **Build → Realtime Database.** (Đã có sẵn, asia-southeast1.)
2. Bấm **⋮ → Import JSON** ở node gốc, nạp file mẫu `docs/users_whitelist.sample.json`
   (SỬA email của bạn cho đúng). **Key = email, thay mọi dấu `.` bằng `,`**
   (vì RTDB key không chứa `.`). Ví dụ:
   ```json
   {
     "users_whitelist": {
       "hoangphuongg39@gmail,com": { "active": true, "role": "admin", "name": "Phương" }
     }
   }
   ```
   `role`: `admin` (ghi mọi vùng) · `editor` (ghi plan/scale/cavern/vlog/raw_data) · `viewer` (chỉ xem).
   Khoá tạm 1 người: đặt `active:false`.

## B3 · Đặt Security Rules (KHOÁ THẬT — phía server)
1. **Realtime Database → Rules.**
2. Dán **nguyên** nội dung file `firebase.rules.json` (ở thư mục gốc repo) → **Publish.**
3. Ý nghĩa: chỉ user đã đăng nhập **và** có trong whitelist (`active:true`) mới đọc/ghi;
   chỉ **admin** sửa được nhánh `users_whitelist`.
   > Lưu ý: trong RTDB rules, `.replace('.', ',')` thay **mọi** dấu `.` (khớp `emailKey` ở client).
   > `apiKey` công khai trong source là **bình thường** (Firebase thiết kế vậy); an toàn đến từ Rules + Auth.

## B4 · Đăng nhập LUÔN bật — không còn công tắc, không còn dev/admin mặc định
> **Cập nhật bảo mật:** đã **gỡ bỏ** công tắc `AUTH_ENFORCE` và mọi tài khoản dev/admin nhúng cứng.
> Đăng nhập Firebase nay **bắt buộc** ở mọi lúc; không có cửa hậu trong mã nguồn.

Hành vi hiện tại của `js/core/auth.js`:
- Khi nạp: `CURRENT_USER` mặc định = **viewer khách, không danh tính, không quyền ghi** (`canWrite()` luôn `false`).
- `AUTH.init()` (gọi trong boot) **luôn** chạy `onAuthStateChanged`:
  - Chưa đăng nhập → hiện màn **Đăng nhập** (Email/Mật khẩu), app **KHÔNG** boot.
  - Đăng nhập xong nhưng email không có trong whitelist (hoặc `active:false`) → màn **Bị chặn** + nút Đăng xuất.
  - Hợp lệ → nạp `role` (admin/editor/viewer) từ `/users_whitelist` rồi mới boot các module.
- **FAIL CLOSED:** nếu thư viện `firebase-auth` không nạp được → **chặn truy cập**, tuyệt đối không cấp quyền.

Vai trò `admin` vẫn tồn tại nhưng **chỉ** được gán qua `/users_whitelist` trên Firebase — không có tài khoản admin nào trong code.

---

## Kiểm thử
- [ ] Đăng nhập bằng email admin → vào được, nút ghi hiện đủ.
- [ ] Đăng nhập email KHÔNG trong whitelist → bị chặn.
- [ ] Email `viewer` → vào xem được nhưng nút ghi bị ẩn (canWrite=false).
- [ ] Mở DevTools → Console: gõ `canWrite("scale")` — viewer trả `false`, editor/admin trả `true`.
- [ ] Chặn `firebase-auth-compat.js` (mạng) → app phải **bị chặn**, KHÔNG vào được (fail closed).
