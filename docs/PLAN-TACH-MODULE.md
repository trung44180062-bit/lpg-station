# KẾ HOẠCH TÁCH MODULE — HSVC LPG STATION v4

> Tách `lpg-station-v4_54_0-cavern-collapsible-sections.html` (1 file, ~28.800 dòng,
> 1.93 MB) thành nhiều file nhỏ trong repo `lpg-station-v4-modular/`, **giữ chạy được
> trên GitHub Pages** để đồng nghiệp dùng qua URL, và để mỗi lần sửa chỉ phải mở 1 module
> nhỏ (tốn ít token khi làm với Cowork).

Phiên bản app: `APP_VERSION v4.55.0` (build `p31.5`). Bản `v406` chỉ dùng tham khảo giao diện.

---

## 1. Nguyên tắc tách

1. **Cắt sạch, không refactor.** Mỗi module hiện là một IIFE gán vào biến global
   (`const WG = (function(){…})()`). Khi tách: copy nguyên khối sang file riêng, **giữ
   nguyên tên global**. Không đổi cách các module gọi nhau ⇒ rủi ro thấp nhất.
2. **Không build, nạp bằng `<script>`** (xem §3 — đã chốt cho trường hợp GitHub Pages).
3. **Tách dần theo phase, verify từng bước.** Sau mỗi module: `node --check` + mở
   `index.html` thử chức năng. Không tách ồ ạt.
4. **File gốc V4-54 là "nguồn chân lý"** trong suốt quá trình. Mỗi stub đã ghi sẵn
   **dòng nguồn** để copy. Chỉ xoá file gốc khi bản modular chạy đủ.

---

## 2. Hiện trạng V4-54 (số liệu đo được)

| Vùng | Dòng | Khối lượng | Ghi chú |
|---|---|---|---|
| HEAD + CSS chính | 1–2812 | ~2.800 dòng CSS | nhiều khối, tách theo tiền tố selector |
| Markup `<body>` | 2814–5708 | ~2.900 dòng HTML | 5 `<section class="page">`: fleet, print, engineer, report, staff |
| **Vendor nhúng** | **5715** | **1 dòng = 443.076 ký tự** | **Tabulator** (full, kèm luxon + XLSX). Thủ phạm tốn token |
| CDN libs | 5709–5711 | 3 thẻ | firebase-app, firebase-database, jszip (**thiếu firebase-auth**) |
| JS ứng dụng | 5720–28825 | ~23.100 dòng | 27 module IIFE + lõi global |
| `firebaseConfig` | 8957–8962 | — | project `hsvc-lpg-station`, RTDB asia-southeast1 |
| `CURRENT_USER` + `canWrite()` | 8790 / 8798 | dùng 28 lần | **đã thiết kế sẵn cho whitelist** (xem §7) |

---

## 3. Kiến trúc đích & cơ chế nạp (tư vấn)

**Chốt: tách thành nhiều file `.js`/`.css`, nạp bằng `<script>`/`<link>` theo thứ tự —
KHÔNG dùng bundler, KHÔNG ES Modules.**

Lý do hợp với bạn nhất:

- Bạn phục vụ qua **GitHub Pages** (host tĩnh, HTTPS). Script-tag chạy thẳng, **không
  cần Node/bước build** — workflow của bạn vẫn là "upload file là xong".
- Code hiện **toàn bộ là global IIFE**, các module gọi nhau qua biến global
  (`CT.lookup`, `WGCHECK.badgeHtml`, `canWrite(...)`…). Giữ script-tag ⇒ **gần như
  không phải sửa gì**. Chuyển sang ES Modules (`import/export`) sẽ phải viết lại **mọi**
  lời gọi chéo giữa ~27 module — khối lượng lớn, dễ vỡ, lợi ích không tương xứng.
- Bundler (Vite/esbuild) cho DX tốt hơn nhưng thêm toolchain + thư mục `dist/` phải
  build lại mỗi lần — thừa với nhu cầu "sửa file tĩnh rồi push".

> Khi nào nên đổi: nếu sau này muốn tree-shaking/đóng gói 1 file tối ưu, có thể nâng lên
> ES Modules **sau khi** đã tách xong (lúc đó ranh giới module đã rõ, chuyển dễ hơn nhiều).

Cây thư mục (đã tạo sẵn khung):

```
lpg-station-v4-modular/
├─ index.html              # shell: CDN + <link> css + <script> module đúng thứ tự
├─ README.md               # trang giới thiệu repo + cách bật GitHub Pages
├─ .gitignore  .nojekyll   # .nojekyll để Pages phục vụ file y nguyên
├─ vendor/                 # tabulator.min.js (tách từ dòng 5715) + css
├─ css/                    # core, plan, fleet, scale, cavern, report, engineer, inventory
├─ js/
│  ├─ core/    config · helpers · sync(SC) · auth ★
│  ├─ data/    tl · wg · ws · sp · ct · pp · bulkops
│  ├─ checks/  fcheck · wgcheck
│  ├─ features/ fleet · plan · scale · eng · rpt · inv · tkv · vlog · staff
│  │            · mixctrl · vmix · mixnotify · cav · scx2
│  ├─ integrations/ ptt-early · sync2 · notif
│  └─ boot.js              # init đúng thứ tự (SC.init P0 → AUTH → data → features)
└─ docs/  PLAN-TACH-MODULE.md (file này) · V4-54_MODULE-MAP.md
```

Mỗi file `.js` hiện là **stub có header hợp đồng**: ghi rõ global, **dòng nguồn trong
V4-54**, phụ thuộc, API, và 5 bước copy. Tách module = mở đúng dải dòng, dán vào, test.

---

## 4. Bảng module & ĐÁNH GIÁ KHỐI LƯỢNG

JS (27 module gốc + `auth` mới). Cột "Khó" = độ rủi ro khi tách.

| Module (global) | File đích | Dòng nguồn | ~Dòng | Phụ thuộc chính | Khó |
|---|---|---|---:|---|:--:|
| config | js/core/config.js | 8879–8983 | 105 | — | Dễ |
| helpers | js/core/helpers.js | 8803–8878 | 76 | — | Dễ |
| **SC** (sync) | js/core/sync.js | 8984–9363 | 380 | config | **Cao**¹ |
| **AUTH** ★ mới | js/core/auth.js | 8790–8801 (+mới) | ~15→ | firebase-auth | Trung |
| FBA (fleet) | js/features/fleet.js | 9364–9950 | 587 | SC, FCHECK, Tabulator | Trung² |
| **PLAN**+API | js/features/plan.js | 9951–12568 | **2.618** | CT, PP, WGCHECK, FCHECK, Tabulator | **Cao** |
| WG | js/data/wg.js | 12569–13361 | 793 | SC | Trung |
| BULKOPS | js/data/bulkops.js | 13362–13521 | 160 | SC | Dễ |
| WS | js/data/ws.js | 13522–14217 | 696 | SC | Trung |
| TL | js/data/tl.js | 14218–15159 | 942 | SC | Trung |
| SP | js/data/sp.js | 15160–15504 | 345 | SC | Dễ |
| CT | js/data/ct.js | 15505–15860 | 356 | SC | Dễ |
| PP | js/data/pp.js | 15861–16141 | 281 | SC | Dễ |
| **SCALE** | js/features/scale.js | 16142–18776 | **2.635** | SC, PLAN, CT | **Cao** |
| FCHECK | js/checks/fcheck.js | 18777–19653 | 877 | TL, CT | Trung |
| WGCHECK | js/checks/wgcheck.js | 19654–20615 | 962 | WG, TL, SP | Trung |
| PTT_EARLY | js/integrations/ptt-early.js | 20616–21469 | 854 | SC, PLAN | Trung |
| SYNC | js/integrations/sync2.js | 21470–21651 | 182 | SCALE, PLAN | Dễ |
| ENG | js/features/eng.js | 21652–22524 | 873 | SC, SCALE | Trung |
| MC (mixctrl) | js/features/mixctrl.js | 22525–23672 | 1.148 | SC, VMIX | Trung |
| MIXNOTIFY | js/features/mixnotify.js | 23673–23817 | 145 | MC | Dễ |
| VMIX | js/features/vmix.js | 23818–24745 | 928 | SC, MC | Trung |
| VLOG | js/features/vlog.js | 24746–25058 | 313 | SC | Dễ |
| CAV | js/features/cav.js | 25059–25760 | 702 | TL,WG,WS,SP,VLOG,JSZip | Trung |
| STAFF | js/features/staff.js | 25761–25973 | 213 | SC | Dễ |
| **RPT** | js/features/rpt.js | 25974–27496 | **1.523** | dữ liệu + JSZip | **Cao** |
| NOTIF | js/integrations/notif.js | 27497–27587 | 91 | SC | Dễ |
| TKV | js/features/tkv.js | 27588–27924 | 337 | SC | Dễ |
| INV | js/features/inv.js | 27925–28613 | 689 | SC | Trung |
| SCX2 | js/features/scx2.js | 28614–28824 | 211 | SCALE | Dễ |

¹ **SC** chứa `firebase.initializeApp()` ⇒ phải nạp & init **trước tiên** (P0).
² **FBA** (vùng fleet) còn lẫn `MN` (month-map, dòng 9510) — tách `MN` về `config.js`.

**Tổng kết khối lượng:**

| Hạng mục | Số file | ~Dòng | Token-win |
|---|---:|---:|---|
| Vendor Tabulator (dòng 5715) | 1 | 1 dòng (443k ký tự) | **Rất lớn** — bỏ khỏi file làm việc |
| CSS | 8 | ~2.800 | Lớn |
| Markup HTML | (trong index.html) | ~2.900 | Lớn |
| JS module | 29 | ~23.100 | Lớn (mở từng file ~vài trăm dòng) |
| **Cộng** | **~38 file** | **~28.800** | |

Quy đổi công sức theo **"lượt tách"** (1 lượt = cắt → dán → `node --check` → thử trên
trình duyệt): **~35–40 lượt**, nhưng mỗi lượt nhỏ & độc lập. 3 module nặng nhất
(PLAN, SCALE, RPT ≈ 6.800 dòng) chiếm ~30% công sức và rủi ro — để **sau cùng**.

---

## 5. Thứ tự tách theo PHASE

| Phase | Nội dung | File | Rủi ro | Vì sao thứ tự này |
|:--:|---|---|:--:|---|
| **P1** | Vendor + CSS + Markup | tabulator, 8 css, index.html | Thấp | Bỏ ngay dòng 5715 + 2.8k CSS ⇒ **token-win lớn nhất, đổi ít logic** |
| **P2** | Lõi: config, helpers, sync(SC), **auth** | js/core/* | Trung | Mọi thứ phụ thuộc lõi; SC.init là P0 |
| **P3** | Dữ liệu: tl, wg, ws, sp, ct, pp, bulkops | js/data/* | Thấp–Trung | Parser tương đối độc lập |
| **P4** | Đối soát: fcheck, wgcheck | js/checks/* | Trung | Cần data của P3 |
| **P5A** | Feature nhỏ: staff, tkv, vlog, scx2, mixnotify, notif, sync2 | — | Thấp | Lấy đà, ít phụ thuộc |
| **P5B** | Feature vừa: fleet, eng, inv, cav, vmix, mixctrl, ptt-early | — | Trung | — |
| **P5C** | **Feature nặng: plan, scale, rpt** | — | Cao | Để cuối, khi quy trình đã quen |
| **P6** | **Bật whitelist/auth thật** | auth + Firebase console + Rules | Trung | Sau khi app modular chạy ổn |

Sau P5C có thể tách con module PLAN: `plan-core` / `plan-table` / `plan-ledger` /
`plan-status` (đã gợi ý trong `V4-54_MODULE-MAP.md`).

---

## 6. Quy trình tách 1 module (lặp lại mỗi lượt)

1. Mở file gốc V4-54, tới **dải dòng** ghi trong header stub.
2. Copy nguyên khối `const XXX = (function(){ … })();` → dán xuống dưới phần header của stub.
3. `node --check js/.../xxx.js` → phải PASS.
4. Mở `index.html` (qua Live Server hoặc Pages) → thử đúng chức năng module đó.
5. Trong V4-54, **xoá** khối vừa tách (hoặc comment) để tránh khai báo trùng khi so sánh.
6. Tick `[x]` module ở §9; commit: `tách module XXX (Pn)`.

> Mẹo verify rẻ token: chỉ cần `node --check` bắt lỗi cú pháp + thử nhanh trên trình duyệt;
> không cần đọc lại toàn file.

---

## 7. ★ WHITELIST / USER — CÓ NÊN TÁCH RIÊNG? → **CÓ, CHẮC CHẮN**

**Trả lời ngắn:** Có. Và codebase của bạn **đã được thiết kế sẵn** đúng hướng đó — chỉ cần
gom về 1 file `js/core/auth.js` (đã tạo sẵn skeleton chạy được).

**Vì sao phải là module riêng:**

1. **Mối quan tâm xuyên suốt (cross-cutting).** Quyền ghi đụng tới **mọi** module qua
   `canWrite(area)` — đã gọi **28 lần** khắp app. Logic này phải nằm **một chỗ duy nhất**,
   không rải rác.
2. **Code đã trỏ sẵn vào đây.** `CURRENT_USER` (dòng 8790) + `canWrite()` (8798) vốn là
   "cổng" trung tâm; chú thích gốc ghi rõ *"khi whitelist+roles tới, đây là nơi DUY NHẤT
   mã hoá ma trận quyền"*, đọc từ `/users_whitelist` + `/users_roles`. Tách ra = đúng ý đồ.
3. **Ranh giới bảo mật, dễ kiểm toán.** Bạn publish source công khai ⇒ gom toàn bộ logic
   truy cập vào 1 file để soi/được review dễ.
4. **Tiến hoá độc lập.** Thêm user, đổi vai trò, sửa màn login… diễn ra thường xuyên mà
   **không đụng** code tính năng.
5. **Thứ tự khởi động rõ ràng.** Auth phải init sớm (sau Firebase, trước feature) để
   `canWrite()` sẵn sàng — `boot.js` đã đặt `AUTH.init()` ngay sau `SC.init()`.

**`auth.js` chứa gì (đã viết sẵn skeleton):** `CURRENT_USER`, `canWrite(area)` + ma trận
quyền `MATRIX`, `emailKey()` (đổi `.`→`,` cho RTDB key), `lookupWhitelist(email)`,
`login()/logout()` (Google), `onAuthStateChanged` → chặn nếu email không có trong whitelist.

### 7.1 Việc cần làm để BẬT thật (Phase 6)

1. **index.html**: thêm `firebase-auth-compat.js` (đã có sẵn dòng `<script>` ★ trong shell).
2. **Firebase console**: bật **Authentication → Google** (đăng nhập Google hợp với đồng
   nghiệp dùng Gmail; không phải quản lý mật khẩu). Thêm domain GitHub Pages của bạn vào
   **Authorized domains**.
3. **Tạo whitelist** trong RTDB, ví dụ:
   ```json
   {
     "users_whitelist": {
       "hoangphuongg39@gmail,com": { "active": true, "role": "admin", "name": "Phương" },
       "dongnghiep@gmail,com":     { "active": true, "role": "editor", "name": "..." }
     }
   }
   ```
   (key = email, thay mọi dấu `.` bằng `,`).
4. **Bỏ chế độ dev**: trong `auth.js`, dòng cuối `applyRole('admin','Dev User'…)` chỉ để
   app chạy trước P6 — khi bật auth thật, để `onAuthStateChanged` quyết định vai trò.

### 7.2 ⚠ KHÓA THẬT nằm ở Firebase Security Rules (không phải ở client)

`canWrite()` phía client **chỉ ẩn nút** — ai mở DevTools vẫn gọi thẳng RTDB được. Vì bạn
**công khai source + apiKey** trên GitHub, **bắt buộc** đặt luật phía server. `apiKey` công
khai là **bình thường** (Firebase thiết kế vậy); an toàn đến từ Rules + Auth.

Mẫu **Realtime Database Rules** khoá theo whitelist email (chỉnh theo nhu cầu):

```json
{
  "rules": {
    ".read":  "auth != null && root.child('users_whitelist').child(auth.token.email.replace('.', ',')).child('active').val() === true",
    ".write": "auth != null && root.child('users_whitelist').child(auth.token.email.replace('.', ',')).child('active').val() === true",

    "users_whitelist": {
      ".read":  "auth != null",
      ".write": "auth != null && root.child('users_whitelist').child(auth.token.email.replace('.', ',')).child('role').val() === 'admin'"
    }
  }
}
```

Ý nghĩa: chỉ user đã đăng nhập **và** có trong whitelist (`active:true`) mới đọc/ghi; chỉ
**admin** mới sửa được danh sách whitelist. (RTDB rules có hỗ trợ `.replace()` nên đổi
`.`→`,` ngay trong luật được.) Muốn phân quyền sâu hơn (editor chỉ ghi vài nhánh) thì thêm
rule theo từng path con — nhưng **luôn** giữ tầng Rules này làm khoá chính.

---

## 8. Rủi ro & lưu ý

- **Thứ tự nạp**: sai thứ tự `<script>` ⇒ "XXX is not defined". Giữ đúng thứ tự trong
  `index.html` (core → data → checks → features → integrations → boot).
- **Khai báo trùng**: trong lúc tách, nếu để khối vừa tách còn ở cả V4-54 lẫn file mới và
  nạp cả hai ⇒ `const` trùng. Chỉ nạp một nguồn.
- **`file://`**: mở thẳng `index.html` bằng double-click có thể chặn vài request. Test qua
  **Live Server** hoặc đẩy lên **GitHub Pages** (đúng môi trường thật).
- **Tabulator CSS**: nhớ kèm `vendor/tabulator.min.css` đúng version, nếu không bảng vỡ giao diện.
- **CSS phụ thuộc thứ tự**: `core.css` nạp trước; biến `--ce/--cc…` định nghĩa ở core.
- **Markup**: tách HTML ra file riêng cần JS để chèn (vì no-build). Đơn giản nhất: **giữ
  toàn bộ markup trong `index.html`** (đã bố trí chỗ), tách HTML là tuỳ chọn Phase sau.

---

## 9. Checklist trạng thái (cập nhật khi tách)

**P1** — [ ] vendor/tabulator.js · [ ] vendor/tabulator.css · [ ] css×8 · [ ] markup vào index.html
**P2** — [ ] config · [ ] helpers · [ ] sync(SC) · [ ] auth
**P3** — [ ] tl · [ ] wg · [ ] ws · [ ] sp · [ ] ct · [ ] pp · [ ] bulkops
**P4** — [ ] fcheck · [ ] wgcheck
**P5A** — [ ] staff · [ ] tkv · [ ] vlog · [ ] scx2 · [ ] mixnotify · [ ] notif · [ ] sync2
**P5B** — [ ] fleet · [ ] eng · [ ] inv · [ ] cav · [ ] vmix · [ ] mixctrl · [ ] ptt-early
**P5C** — [ ] plan · [ ] scale · [ ] rpt
**P6** — [ ] thêm firebase-auth · [ ] bật Google Auth · [ ] tạo whitelist · [ ] Security Rules · [ ] bỏ dev mode
