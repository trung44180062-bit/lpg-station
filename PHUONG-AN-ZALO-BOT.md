# Phương án tích hợp Zalo Bot — LPGT Công Ca

> Tài liệu thiết kế cho phiên làm việc code. Đọc kèm `MA-TRAN-THONG-BAO.md`.
>
> Bản app: **v5.8** · Ngày lập: **2026-08-03** · Quân số: **20 người** ·
> Repo: `LPGT-CongCa-Web` (GitHub Pages, static, Firebase Realtime DB gói Spark)

---

## 1. Chốt phạm vi

**Zalo Bot chỉ làm MỘT việc: gửi thông báo một chiều.**

| Có | Không |
|---|---|
| App → Zalo: bắn tin 1-1 cho người liên quan | ❌ Duyệt đơn bằng cú pháp Zalo |
| Nhận đúng 1 câu `LK <mã NV> <OTP>` để liên kết | ❌ Tạo đơn bằng cú pháp Zalo |
| | ❌ Bot vào nhóm Zalo *(Zalo không hỗ trợ)* |

Mọi thao tác đăng ký / duyệt / sửa vẫn **hoàn toàn trên app**. Zalo là *cái chuông
kêu to hơn*, không phải giao diện thứ hai. Điều này cắt khoảng một nửa khối lượng
code và tránh phải đồng bộ hai nguồn thao tác.

Toàn bộ thông báo hiện có trong app **giữ nguyên không đổi**. Zalo chạy song song.

---

## 2. Kiến trúc

```
┌──────────────────────────┐
│  GitHub Pages (static)   │   index.html + js/*.js
│  – KHÔNG chứa token –    │   config.js công khai có chủ đích
└───────────┬──────────────┘
            │ ghi
            ▼
┌──────────────────────────┐
│  Firebase Realtime DB    │   S.notifs (đã có) + zaloQueue (mới)
└───────────┬──────────────┘
            │ trigger onCreate
            ▼
┌──────────────────────────┐
│  Cloud Function "fanOut" │   ★ NƠI DUY NHẤT giữ BOT_TOKEN
│  – gộp, lọc, xếp hàng –  │
└───────────┬──────────────┘
            │ HTTPS
            ▼
     Zalo Bot API  ──1-1──▶  Zalo của từng nhân viên
```

### 2.1 Bảo mật — ràng buộc cứng

> **`BOT_TOKEN` tuyệt đối không được nằm trong bất kỳ file nào của repo.**

Repo publish công khai trên GitHub Pages. Ai xem source cũng đọc được `config.js`.
Nếu token lọt ra, người ngoài **gửi tin giả danh công ty** tới toàn bộ nhân viên —
giả thông báo "đơn đã duyệt", "đổi ca gấp". Rủi ro vận hành thật, không phải lý thuyết.

| Bí mật | Nơi lưu |
|---|---|
| `BOT_TOKEN` | Biến môi trường Cloud Function (`firebase functions:config:set zalo.token=...`) |
| `WEBHOOK_SECRET` | Như trên — Zalo gửi kèm để chứng minh request đến từ Zalo |
| `zaloChatId` của NV | Firebase, nhánh **chỉ admin đọc được** (xem Rules mục 3.3) |

Trình duyệt **không bao giờ** gọi thẳng `bot-api.zapps.me`. Nó chỉ ghi vào Firebase.

### 2.2 Vì sao phải có Cloud Function

App hiện là client-only, chưa có backend. Function là bắt buộc vì 3 lý do,
theo thứ tự quan trọng: **(1)** giữ token, **(2)** gộp tin — logic gộp phải chạy
tập trung chứ không thể ở 20 trình duyệt rời rạc, **(3)** hẹn giờ digest & giờ im lặng.

Firebase Cloud Functions cần nâng lên gói **Blaze** (trả theo dùng). Ở mức
~330 tin/tháng, chi phí thực tế **0đ** — nằm gọn trong hạn mức miễn phí
(2 triệu lượt gọi/tháng). Vẫn nên đặt **ngân sách trần cảnh báo 1 USD** cho yên tâm.

*Phương án thay thế nếu không muốn đổi gói:* Google Apps Script (`doPost` làm
webhook + trigger theo phút). Miễn phí tuyệt đối, nhưng phải tự viết vòng lặp đọc
Firebase và độ trễ ~1 phút. Chỉ chọn nếu việc đổi sang Blaze bị vướng.

---

## 3. Dữ liệu

### 3.1 Nhánh mới trong Firebase

```
zalo/
  link/                          ← liên kết NV ↔ Zalo
    vc44180062: { chatId:"8471029384", linkedAt:1754..., name:"Hoàng Trung" }
  otp/                           ← mã liên kết tạm, tự hết hạn 10 phút
    "738214": { empId:"vc44180062", exp:1754... }
  queue/                         ← hàng đợi tin chờ gửi
    -Nxyz: {
      to:      "vc44180062",     ← mã NV, KHÔNG phải chatId
      group:   "reqResult",      ← khoá gộp
      pri:     "now",            ← now | batch | digest
      title:   "✅ Đơn tăng ca đã được duyệt",
      lines:   ["05/08 · 20:00–08:00 · OTN"],
      link:    "?go=me&rid=abc",
      notifId: "abc123",         ← đối chiếu ngược S.notifs
      state:   "pending",        ← pending | sent | failed | cancelled
      createdAt: 1754...,
      sendAfter: 1754...         ← mốc được phép gửi (gộp / giờ im lặng)
    }
  sent/                          ← log đã gửi, giữ 62 ngày như NOTIF_KEEP_DAYS
  quota/
    "2026-08": { count: 327 }
```

### 3.2 Không đụng vào `S.notifs`

Cấu trúc thông báo trong app giữ **nguyên xi**. Function đọc `S.notifs` để biết
có gì mới, rồi ghi sang `zalo/queue`. Nếu Zalo hỏng, app vẫn chạy y như cũ —
đây là nguyên tắc thiết kế bắt buộc, không được để Zalo thành điểm chết.

### 3.3 Firebase Rules cần thêm

```json
"zalo": {
  "link":  { ".read": "auth != null", ".write": false },
  "otp":   { ".read": false,          ".write": false },
  "queue": { ".read": false,          ".write": false },
  "quota": { ".read": "auth != null", ".write": false }
}
```

Chỉ Cloud Function (chạy quyền admin SDK) ghi được. Trình duyệt không đọc được
`chatId` của người khác — tránh rò rỉ danh tính Zalo trong nội bộ.

---

## 4. Liên kết tài khoản

Làm một lần cho mỗi người, khoảng 30 giây.

```
① NV mở app → menu Tài khoản → "Kết nối Zalo"
② App sinh OTP 6 số, ghi zalo/otp/738214 = {empId, exp:+10 phút}
   Màn hình hiện QR bot + câu mẫu:  LK vc44180062 738214
③ NV bấm QR → Zalo mở chat với bot → dán câu đó, gửi
④ Zalo POST vào webhook:  { chat_id:"8471029384", text:"LK vc44180062 738214" }
⑤ Function: kiểm OTP còn hạn & khớp empId
   → ghi zalo/link/vc44180062 = { chatId:"8471029384", ... }
   → xoá OTP
   → bot reply: "✅ Đã kết nối. Chào Hoàng Trung. Bot chỉ gửi thông báo,
                 mọi thao tác vui lòng làm trên app."
⑥ App hiện "Đã kết nối Zalo ✓" (lắng nghe zalo/link)
```

**Xử lý tin ngoài luồng:** bất kỳ tin nào không khớp `LK <mã> <otp>` → reply cứng
*"Bot chỉ gửi thông báo. Vui lòng thao tác trên app: `<link>`"*. Không parse gì thêm.

**Đổi điện thoại / cài lại Zalo:** làm lại đúng quy trình trên, ghi đè `chatId` cũ.

**Màn quản trị** cần một bảng: ai đã liên kết, ai chưa, nút gỡ liên kết.

---

## 5. Cơ chế Nháp → Công bố cho lịch

Đây là thay đổi có giá trị **ngay cả khi chưa có Zalo bot**: hiện tại bạn sửa ô lịch
là `06-calendar.js:264` bắn `schedChange` tức thì. Sửa 5 lần cho 1 người =
5 thông báo, nhân viên xác nhận nhầm bản nửa vời.

### 5.1 Dữ liệu

```
lichNhap/2026-W32/          ← bản đang sửa, chỉ admin thấy
   vc44240012: { "2026-08-04":"D", "2026-08-06":"O" }
lichCongBo                  ← chính là S.over hiện tại, KHÔNG đổi
```

Nhân viên luôn đọc `S.over`. Bản nháp vô hình với họ.

### 5.2 Luồng

```
Admin bật chế độ Nháp (nút 📝 trên cal-bar)
   → mọi setCell() ghi vào lichNhap, KHÔNG gọi newNotif, KHÔNG ghi S.over
   → ô đã sửa tô cam, sửa bao nhiêu lần cũng được

Thanh cố định dưới màn hình:
┌──────────────────────────────────────────────────────────────┐
│ ⚠️ 14 thay đổi chưa công bố · 8 người bị ảnh hưởng           │
│   [Xem đối chiếu]  [Gửi thử cho tôi]  [Huỷ]  [Công bố ▶]     │
└──────────────────────────────────────────────────────────────┘

Bấm Công bố:
   1. diff từng ô lichNhap vs S.over
   2. LOẠI ô sửa rồi sửa về như cũ            ← chỗ tiết kiệm chính
   3. ghi S.over, gọi newNotif('schedChange') — MỖI NGƯỜI ĐÚNG 1 BẢN GHI
      (gộp nhiều ngày vào 1 notif, cần mở rộng schema: thêm mảng `changes[]`)
   4. đẩy zalo/queue: 1 tin/người, gộp mọi thay đổi
   5. xoá lichNhap
```

### 5.3 Tin gộp gửi đi

```
📅 Lịch tuần 32 (03–09/08) đã cập nhật:
• T3 04/08:  N  →  D
• T5 06/08:  Nghỉ  →  O
• T7 08/08:  O  →  O+N
Vào app xác nhận: hsvc.../?go=me
```

3 thay đổi = **1 tin**, không phải 3.

### 5.4 Chi tiết cần lưu ý

- **Tận dụng `revokeSchedChange()` đã có** — cơ chế thu hồi khi trả về ca chuẩn
  (`13-portal.js:209`) vẫn giữ nguyên, phục vụ trường hợp sửa **sau khi** đã công bố.
- **Nháp treo quá 12h** → nhắc admin trong app (không tốn tin Zalo).
- **Mô hình tham chiếu:** `evSendNotifs()` ở `20-events.js:126` đã làm đúng ý tưởng này
  (luôn `evRevokeNotifs()` trước khi gửi). Nhân rộng sang lịch, không phát minh lại.

---

## 6. Quy tắc chống spam

Áp cho mọi tin, cài trong Cloud Function.

| # | Quy tắc | Cắt được gì |
|---|---|---|
| R1 | **Bỏ tin trạng thái trung gian** — `fe` và `provapproved` không bắn Zalo, chỉ báo khi có kết quả cuối (`approved`/`rejected`) | ~135 tin/tháng — lớn nhất |
| R2 | **Cửa sổ gộp 10 phút** — cùng `to` + cùng `group` → gộp thành 1 tin nhiều dòng. Đặc biệt hiệu quả với *Duyệt gộp* | ~25 tin |
| R3 | **Huỷ nếu đã đọc trong app** — tin nằm hàng đợi 10 phút; nếu `lastSeen(empId)` vượt `createdAt` thì `state='cancelled'`, không gửi | ~10% tổng |
| R4 | **Giờ im lặng 21:30–06:30** — `pri:'batch'` xếp hàng tới 06:30. `pri:'now'` vẫn đi ngay. **Miễn trừ người đang trực ca N** *(chờ bạn quyết — Q1)* | không cắt tin, cắt phiền |
| R5 | **Digest rỗng thì không gửi** — không có đơn chờ thì im lặng, tuyệt đối không gửi "hôm nay không có gì" | ~30 tin |
| R6 | **Chống trùng** — cùng `notifId` chỉ vào hàng đợi 1 lần *(quan trọng: `02-storage.js` đồng bộ theo delta, dễ trigger lặp)* | lỗi tiềm ẩn |

---

## 7. Ngân sách hạn mức

| | |
|---|---|
| Gói free Zalo Bot | 3 bot · **50 user** · **3.000 tin/tháng** |
| Dự kiến dùng (20 người) | **~330 tin/tháng — 11%** |
| Nếu bê nguyên mọi tin | ~410 tin — 14% |
| Trần quy mô ở 3.000 tin | ~180 người |
| Ràng buộc thật | **50 user** — đang dùng 20, dư 30 |

> Hạn mức **không phải** lý do để lọc tin. Lý do duy nhất là giữ độ tin cậy của kênh:
> bot kêu 25 lần/tháng toàn tin vặt → người ta tắt thông báo Zalo → tin "đơn bị từ chối"
> cũng không ai đọc. Mục tiêu là **~16 tin/người/tháng**, khoảng 1 tin mỗi 2 ngày.

**Đồng hồ trong app** (trang quản trị):

```
Tháng 8/2026   ███░░░░░░░░░░░░░░░░░   327 / 3.000  (11%)
Dự báo cuối tháng ~340
Top: Kết quả duyệt 29% · Sự kiện 24% · Digest 23%
```

Vượt 85% → khoá mềm nút gửi hàng loạt cho tới khi admin xác nhận. Không bao giờ
để cạn hạn mức giữa tháng rồi tin quan trọng không bay được.

---

## 8. Lộ trình triển khai

Làm theo thứ tự — mỗi giai đoạn tự đứng được, dừng giữa chừng vẫn dùng được.

### GĐ 1 — Nháp → Công bố lịch ⭐ làm trước

Không phụ thuộc Zalo, không phụ thuộc Cloud Function. Có giá trị ngay: hết cảnh
nhân viên nhìn thấy lịch nửa vời.

- `06-calendar.js` — cờ chế độ nháp, `setCell()` rẽ nhánh ghi `lichNhap`
- Thanh trạng thái + màn đối chiếu diff
- `newNotif('schedChange')` mở rộng: thêm mảng `changes[]` thay vì 1 `iso`
- Cập nhật `13-portal.js` render thông báo nhiều dòng
- Test: mở rộng `_test/harness-v58.js`

### GĐ 2 — Hạ tầng Zalo

- Tạo bot ở `bot.zapps.me`, lấy token
- Nâng Firebase lên Blaze, đặt trần cảnh báo 1 USD
- Cloud Function: webhook `LK`, ghi `zalo/link`
- Màn "Kết nối Zalo" trong app + OTP + QR
- Màn quản trị: ai đã/chưa liên kết
- Firebase Rules cho nhánh `zalo/`

### GĐ 3 — Bắn tin thật

- Function `fanOut`: đọc `S.notifs` mới → map sang `zalo/queue` theo ma trận
- Bộ gửi: gộp R2, huỷ R3, giờ im lặng R4, chống trùng R6
- Đồng hồ hạn mức trong app
- Chạy thử **chỉ với 1 người (bạn)** ít nhất 3 ngày trước khi mở cho cả xưởng

### GĐ 4 — Thông báo mới

- Digest 11:00 & 16:30 cho người duyệt *(giá trị cao nhất — cân nhắc đẩy lên sớm hơn)*
- Đơn gấp bắn ngay, đơn treo >24h
- Nhắc chốt công ngày 18–19
- Màn soạn thông báo chung

### GĐ 5 — PWA + badge *(tuỳ chọn, độc lập hoàn toàn)*

`manifest.json` + service worker + FCM Web Push → số chưa đọc trên icon.
Nhân viên phải cài lại app dạng PWA thay vì lối tắt Chrome. Không ảnh hưởng
gì tới Zalo bot, làm lúc nào cũng được.

---

## 9. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Token lọt lên GitHub | **Cao** | Token chỉ ở env Function. Thêm `functions/.env*` vào `.gitignore`. Trước khi push: `git grep -i "bot.*token"` |
| Zalo đổi chính sách / khoá bot | Trung bình | App không phụ thuộc — Zalo hỏng thì thông báo trong app vẫn chạy nguyên vẹn |
| Trigger lặp do đồng bộ delta | Trung bình | R6 chống trùng theo `notifId`, bắt buộc |
| Vượt 50 user | Thấp *(đang 20)* | Cảnh báo ở đồng hồ khi chạm 45 |
| Chi phí Blaze bất ngờ | Thấp | Trần ngân sách 1 USD + cảnh báo email |
| Nhân viên không liên kết | Trung bình | Không chặn gì. Màn quản trị hiện danh sách để nhắc trực tiếp |

---

## 10. Tóm tắt cho phiên code

**Đã chốt:** dùng Zalo Bot, một chiều, chỉ gửi thông báo. Token ở Cloud Function.
App giữ nguyên mọi thông báo hiện có, Zalo chạy song song.

**Đầu vào cần có trước khi code:** `MA-TRAN-THONG-BAO.md` đã điền cột QUYẾT ĐỊNH
và trả lời Q1–Q5. Chưa điền thì lấy cột Đề xuất làm mặc định.

**Bắt đầu từ GĐ 1** — Nháp→Công bố lịch, không cần Zalo, không cần đổi gói Firebase.

**File sẽ đụng tới:**
`06-calendar.js` (nháp lịch) · `13-portal.js` (notif nhiều dòng, màn kết nối Zalo) ·
`08-requests.js` (bỏ tin trung gian) · `10-account.js` (nút Kết nối Zalo) ·
`14-i18n.js` (khoá EN mới) · `_test/` (test mới) · `functions/` (thư mục mới)
