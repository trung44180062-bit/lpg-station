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
- `auth.js` có sẵn: `MATRIX` quyền, `emailKey()`, `lookupWhitelist()`, `login()/logout()`,
  `onAuthStateChanged`. Đang để **DEV = admin** (dòng `applyRole('admin',...)`).

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

## B4 · Bật cờ trong code (LÀM SAU CÙNG)
Trong `js/core/auth.js`, đổi 1 dòng:
```js
var AUTH_ENFORCE = false;   // ⇦ đổi thành true để bật đăng nhập thật
```
- `false` (mặc định): giữ DEV = admin, app chạy ngay, KHÔNG cần đăng nhập (dùng khi đang phát triển).
- `true`: kích hoạt `onAuthStateChanged` → chưa đăng nhập thì hiện màn **Đăng nhập Google**;
  email không có trong whitelist (hoặc `active:false`) → màn **Bị chặn** + tự đăng xuất.

Commit + push. Mở qua GitHub Pages (domain đã Authorize ở B1).

---

## Kiểm thử
- [ ] Đăng nhập bằng email admin → vào được, nút ghi hiện đủ.
- [ ] Đăng nhập email KHÔNG trong whitelist → bị chặn.
- [ ] Email `viewer` → vào xem được nhưng nút ghi bị ẩn (canWrite=false).
- [ ] Mở DevTools thử `firebase.database().ref('/raw_data').set(...)` bằng tài khoản
      ngoài whitelist → **Rules chặn** (PERMISSION_DENIED). Đây là khoá thật.

## Lỡ tự khoá mình ra ngoài?
- Vẫn sửa được whitelist qua **Firebase Console** (không qua app): thêm lại email mình
  với `active:true, role:admin`. Hoặc tạm sửa Rules về `".read"/".write": "auth != null"`
  để gỡ, rồi dựng lại whitelist.

## Tham chiếu
- Thiết kế chi tiết & ma trận quyền: `PLAN-TACH-MODULE.md` §7.
- Rules deploy: `../firebase.rules.json`. Whitelist mẫu: `users_whitelist.sample.json`.
