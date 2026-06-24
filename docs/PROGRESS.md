# NHẬT KÝ TÁCH MODULE — HANDOFF (đọc trước khi tiếp tục)

> File này là **nguồn chân lý về tiến độ** để 2 tài khoản nối tiếp nhau.
> Cập nhật **ngay sau mỗi module**: tick checklist + ghi commit/ghi chú.
> Nguồn gốc: `../lpg-station-v4_54_0-cavern-collapsible-sections.html` (gọi **V4-54**, 28.827 dòng).
> Đích: thư mục `lpg-station-v4-modular/`. Kế hoạch tổng: `PLAN-TACH-MODULE.md`.

Cập nhật gần nhất: **2026-06-20** (phiên 2 — đã bóc xong P5A/B/C + BOOT).

---

## 0. TÓM TẮT NHANH (đang ở đâu)

- [x] **P1** — vendor (Tabulator JS+CSS) + toàn bộ app CSS → `css/core.css` + markup → `index.html`. **XONG.**
- [x] **P2** — core: nav.js, helpers, config, sync(SC), globals.js + VERSION-HISTORY.md + index.html. **XONG** (node --check PASS hết).
- [x] **P3** — data: wg, bulkops, ws, tl, sp, ct, pp. **XONG** (PASS hết).
- [x] **P4** — checks: fcheck, wgcheck. **XONG** (PASS hết).
- [x] **P5A** — staff, tkv, vlog, scx2, mixnotify, notif, sync2. **XONG** (PASS hết).
- [x] **P5B** — fleet(FBA), eng, inv, cav, vmix, mixctrl(MC), ptt-early. **XONG** (PASS hết).
- [x] **P5C** — plan(factory→TP/TMR), scale, rpt. **XONG** (PASS hết).
- [x] **BOOT** — boot.js viết lại 1:1 theo boot gốc + chèn AUTH; node --check 33/33 PASS. **XONG**.
- [x] **AUDIT tham chiếu chéo** — PASS (xem §8). [x] **P6 ĐÃ CHUẨN BỊ** code+docs (xem §9).
- [x] **SMOKE TEST headless (jsdom)** — PASS: nạp + boot end-to-end, 0 lỗi (xem §10).
- [ ] **Còn lại (cần người/Console)**: (1) test trình duyệt Live Server/Pages; (2) bật P6 trên Firebase Console rồi đổi `AUTH_ENFORCE=true`.

**Cần test trình duyệt (Live Server/Pages):** sau khi xong P2 trở đi (app mới chạy được JS).
Hiện tại sau P1: trang hiện markup nhưng JS chưa nối → console sẽ báo `SC is not defined` (BÌNH THƯỜNG).

---

## 1. ⚠ PHÁT HIỆN QUAN TRỌNG (khác với PLAN gốc)

PLAN-TACH-MODULE.md ghi dải dòng **gần đúng** — KHÔNG dùng trực tiếp để cắt. Lý do:

1. **Nhiều "module" = IIFE + khối hàm global đi kèm.** Ranh giới trong PLAN có chỗ cắt giữa code.
2. **Khối GLOBAL HELPERS 9463–9939** (~477 dòng): `escapeHtml`, `toast`, `parseDate`, `daysLeft`,
   `normalizeDate`, `dateState`, `buildColumns`(fleet), `rowFormatter`, `switchFleetTab`, `openPaste`,
   `doPaste`, `MN` month-map (9510)… PLAN **không gán file**. → Tạo **`js/core/globals.js`** chứa khối này,
   nạp trong CORE (trước data) để mọi module dùng được.
3. **`CURRENT_USER`(8790) + `canWrite`(8798)** → **BỎ** (auth.js đã viết lại, là global mới).
4. **PLAN không phải IIFE** — là factory `_makePlanModule(opts)` (9940) tạo `TP`/`TMR` + loạt hàm
   wrapper `tp*`/`tmr*`/`planClear*`/`tmrPromote*`/`switchSalesTab`. plan.js = **9940–12568**.
5. **FBA (fleet) IIFE thật = 9364–9462** (không phải 9364–9950). 9463+ là globals.js.
6. **SCX2 IIFE thật = 28614–28750.** 28751–28823 là **BOOT gốc** (IIFE init, có "[BOOT] ✅ all modules ready").
   → boot.js (đã viết tay) thay nó. Đã lưu boot gốc ra `js/boot.original.js` để đối chiếu.

### Nguyên tắc cắt đã dùng (an toàn, KHÔNG mất code)
- Mỗi module = dải **[start, nextStart−1]** theo **THỨ TỰ NGUỒN** (giữ luôn khối global đi kèm ở cuối module).
- Hệ quả: cuối mỗi file .js có thể dính **banner comment của module kế** → vô hại (comment đóng đủ).
- 5 ngoại lệ tách tay: `fleet.js`(9364–9462), `globals.js`(9463–9939), `plan.js`(9940–12568),
  `scx2.js`(28614–28750), bỏ boot gốc(28751–28823).

---

## 2. BẢN ĐỒ DÒNG ĐÃ KIỂM CHỨNG (start IIFE + close `})();` đo bằng grep cột-0)

| File đích | Dải dòng V4-54 | Ghi chú |
|---|---|---|
| `js/core/nav.js` | 5729 (APP_VERSION) + 8715–8789 | title + PAGES/navGo/navStub/rptSwitchTab/cavToggle. **MỚI** |
| `docs/VERSION-HISTORY.md` | 5730–8714 | comment lịch sử ~2985 dòng (chuyển ra cho nhẹ token) |
| `js/core/helpers.js` | 8803–8878 | isTempOid… (BỎ 8790–8801 = CURRENT_USER/canWrite) |
| `js/core/config.js` | 8879–8983 | CERT_DEFS, DATA, SAMPLE_ARR, firebaseConfig(8957) |
| `js/core/sync.js` (SC) | 8984–9348 | IIFE SC, có firebase.initializeApp → init P0 |
| `js/core/auth.js` | (đã viết tay) | **KHÔNG ĐỤNG** |
| `js/core/globals.js` | 9463–9939 | **MỚI** — global helpers + fleet helpers + MN(9510) |
| `js/features/fleet.js` (FBA) | 9364–9462 | IIFE FBA |
| `js/features/plan.js` | 9940–12568 | factory _makePlanModule + TP/TMR + wrappers |
| `js/data/wg.js` | 12569–13361 | |
| `js/data/bulkops.js` | 13362–13521 | |
| `js/data/ws.js` | 13522–14217 | |
| `js/data/tl.js` | 14218–15159 | |
| `js/data/sp.js` | 15160–15504 | |
| `js/data/ct.js` | 15505–15860 | |
| `js/data/pp.js` | 15861–16141 | |
| `js/features/scale.js` | 16142–18776 | NẶNG |
| `js/checks/fcheck.js` | 18777–19653 | |
| `js/checks/wgcheck.js` | 19654–20615 | gồm IIFE phụ (close 20520) + globals đi kèm |
| `js/integrations/ptt-early.js` | 20616–21469 | gồm globals đi kèm (21104–21469) |
| `js/integrations/sync2.js` (SYNC) | 21470–21651 | |
| `js/features/eng.js` | 21652–22524 | |
| `js/features/mixctrl.js` (MC) | 22525–23672 | |
| `js/features/mixnotify.js` | 23673–23817 | |
| `js/features/vmix.js` | 23818–24745 | |
| `js/features/vlog.js` | 24746–25058 | |
| `js/features/cav.js` | 25059–25760 | |
| `js/features/staff.js` | 25761–25973 | |
| `js/features/rpt.js` | 25974–27496 | NẶNG, gồm globals đi kèm (27399–27496) |
| `js/integrations/notif.js` | 27497–27587 | |
| `js/features/tkv.js` | 27588–27924 | |
| `js/features/inv.js` | 27925–28613 | |
| `js/features/scx2.js` | 28614–28750 | (BỎ boot gốc 28751–28823) |

---

## 3. QUY TRÌNH TÁCH 1 MODULE (lặp lại)

```bash
cd "/path/.../HSVC LPG STATION COWORK"      # nơi chứa V4-54 + thư mục modular
SRC="lpg-station-v4_54_0-cavern-collapsible-sections.html"
M="lpg-station-v4-modular"
# 1) Append thân module vào sau header stub (GIỮ header stub):
sed -n 'START,ENDp' "$SRC" >> "$M/js/.../xxx.js"
# 2) Kiểm cú pháp:
node --check "$M/js/.../xxx.js"      # PHẢI PASS
# 3) Tick file này + commit "tach module XXX (Pn)"
```
> Mẹo: nếu node báo lỗi "Unexpected end of input" → khả năng dải dòng cắt thiếu `})();` cuối.
> Đối chiếu lại bảng §2. KHÔNG grep nội dung dòng 5715/dòng 9 (vendor, rất dài, tràn token).

---

## 4. CSS (P1) — ghi chú quyết định
Toàn bộ app CSS (V4-54 dòng 13–2811) đang gom ở **`css/core.css`** (giữ nguyên thứ tự = an toàn cascade).
7 file css còn lại (plan/fleet/scale/cavern/report/engineer/inventory) là stub, **link đã comment** trong
index.html. Tách mịn theo prefix là **bước tuỳ chọn sau** (rủi ro cascade + có vùng WMS/print/staff không
có file riêng). Tabulator CSS (v6.4.0) đã tách → `vendor/tabulator.min.css` (V4-54 dòng 9).

## 5. THỨ TỰ NẠP `<script>` trong index.html
Giữ nhóm core→data→checks→features→integrations→boot, **thêm `nav.js` + `globals.js` vào CORE**.
Bắt buộc: globals.js nạp TRƯỚC data (vì chứa escapeHtml/toast/parseDate). boot.js cuối cùng.
**Việc cần làm ở bước BOOT:** đối chiếu boot.js (tay) với `boot.original.js` (28751–28823) — đảm bảo
không double-init (vài module tự init qua DOMContentLoaded riêng: BULKOPS ~13473, FCHECK/WGCHECK ~19622).

## 6. CHECKLIST (tick khi xong)
P2: [x] nav.js  [x] helpers.js  [x] config.js  [x] sync.js  [x] globals.js  [x] VERSION-HISTORY.md  [x] update index.html (nav+globals)
P3: [x] wg  [x] bulkops  [x] ws  [x] tl  [x] sp  [x] ct  [x] pp
P4: [x] fcheck  [x] wgcheck
P5A: [x] staff  [x] tkv  [x] vlog  [x] scx2  [x] mixnotify  [x] notif  [x] sync2
P5B: [x] fleet  [x] eng  [x] inv  [x] cav  [x] vmix  [x] mixctrl  [x] ptt-early
P5C: [x] plan  [x] scale  [x] rpt
BOOT: [x] đối chiếu boot.js  [x] node --check tất cả (33/33 PASS)  [ ] test trình duyệt

---

## 7. PHIÊN 2 (2026-06-20) — GHI CHÚ BOOT (quan trọng cho P6 + về sau)

Đã bóc nốt 17 module (P5A/B/C) bằng cắt dải dòng [start, nextStart−1] đúng bảng §2 —
mọi `node --check` PASS, không khai báo global trùng, mọi file đã có trong index.html.

**boot.js viết lại 1:1 theo `boot.original.js`** (KHÔNG dùng bản nháp cũ). Lý do & phát hiện:
- Bản boot.js nháp cũ gọi `FCHECK.init()`/`WGCHECK.init()` → **double-init** (FCHECK tự init
  qua DOMContentLoaded; BULKOPS cũng vậy). Bản mới **bỏ** các lời gọi đó.
- Thứ tự init thật (đo từ boot gốc): SC → navGo('sales') → SCALE,CT,PP → SP,TL,INV →
  TP,TMR → WG,WS,ENG,MC,MIXNOTIFY,VMIX,VLOG,CAV,STAFF,SCX2 → buildFleetSubs()+switchFleetTab.
- Module **không** init ở boot (lazy / tự init / gọi theo nhu cầu): FCHECK, BULKOPS, WGCHECK,
  FBA(dùng buildFleetSubs), PLAN(chỉ factory; instance TP/TMR), RPT, TKV, PTT_EARLY, SYNC, NOTIF.
- AUTH.init() chèn ngay sau SC.init(); mọi feature chạy TRONG callback onReady (dev=admin tức thì).

**Việc còn lại:** (1) test trình duyệt qua Live Server/GitHub Pages; (2) **P6** bật whitelist
(Firebase Console + Rules + đổi `AUTH_ENFORCE=true`). Tách mịn CSS là tuỳ chọn.

---

## 8. AUDIT THAM CHIẾU CHÉO (2026-06-20) — PASS ✅

Chạy script tĩnh bắt rủi ro "X is not defined" (rủi ro lớn nhất của kiểu nạp script-tag no-build):
- **(A) Handler inline trong index.html** (onclick/oninput/onkeydown/onblur/onfocus): **100% có global
  tương ứng**. (Lần quét đầu báo nhầm ctSubmitPaste/pp*/sp* — thực ra chúng khai báo nhiều `function`
  trên CÙNG 1 dòng trong ct.js/pp.js/sp.js; regex bắt thiếu. Đã xác nhận đủ.)
- **(B) Lời gọi UPPER.method giữa module**: mọi namespace thật (SC, CT, PLAN, SCALE, WGCHECK…) đều
  định nghĩa. Tên còn lại (C3, DO, MODULE, V406, KNH26060201…) là biến cục bộ/destructure, chuỗi, hoặc
  chữ trong comment — KHÔNG phải global (đã spot-check: C3 ở comment, DO ở string, MODULE = "…-MODULE.md").
- **Không có** lời gọi cross-module ở cấp load-time (top-level) → không có bẫy thứ-tự-nạp mới.

**Kết luận:** vì cắt KHÔNG mất/khớp dòng (ranges liền mạch + node --check 33/33 + không global trùng +
A sạch) ⇒ JS gộp của bản modular tương đương monolith đã chạy → mọi global phân giải y như cũ.

## 9. P6 — ĐÃ CHUẨN BỊ SẴN (2026-06-20)

Chỉ cần **cấu hình Console + đổi 1 dòng** là bật được whitelist:
- **`js/core/auth.js` viết lại** (125 dòng, node --check PASS): thêm công tắc **`var AUTH_ENFORCE = false`**.
  - `false` (mặc định) = DEV admin, app chạy ngay, KHÔNG cần đăng nhập — **đồng thời sửa 1 lỗi tiềm ẩn**:
    vì index.html đã nạp firebase-auth-compat nên `init()` cũ rẽ nhánh real-auth → chưa login sẽ thành
    **viewer (ẩn hết nút ghi)**. Công tắc ép DEV=admin nên hết lỗi này.
  - `true` = bật `onAuthStateChanged`: chưa login → overlay **Đăng nhập Google**; email ngoài whitelist
    / `active:false` → overlay **Bị chặn** + đăng xuất. Guard onReady chạy đúng 1 lần (chống double-init).
  - Overlay tạo bằng JS (không sửa index.html) ⇒ DEV mode không đụng gì.
- **`firebase.rules.json`** (gốc repo): Security Rules khoá theo whitelist email — dán thẳng vào RTDB Rules.
- **`docs/users_whitelist.sample.json`**: mẫu whitelist (key=email, thay `.`→`,`).
- **`docs/P6-WHITELIST-SETUP.md`**: hướng dẫn B1→B4 (Console TRƯỚC, đổi cờ SAU — tránh tự khoá mình ra).

**Khi bật thật:** theo P6-WHITELIST-SETUP.md → Console (Google Auth + Authorized domains) → tạo whitelist
→ dán Rules → đổi `AUTH_ENFORCE=true` → commit/push.

## 10. SMOKE TEST HEADLESS jsdom (2026-06-20) — PASS ✅

Đã thêm **`test/smoke.mjs`** (chạy: `npm i jsdom && node test/smoke.mjs`). Nó nạp 33 file js
theo đúng thứ tự index.html với firebase/Tabulator/XLSX/JSZip được STUB (proxy gọi chuỗi vô hạn),
bắn `DOMContentLoaded`, chạy thật boot, rồi kiểm. Kết quả lần chạy 2026-06-20:
- ✓ 33/33 script nạp xong.
- ✓ 35 global bắt buộc đều có (kiểm bằng `eval('typeof X')` vì `const` global nằm ở
  global-lexical-scope, KHÔNG lên `window.X` — đây là lý do boot gọi bareword `SC.init()` chạy được).
- ✓ **0 ReferenceError "is not defined"** (tín hiệu quan trọng nhất — không sai thứ tự nạp/thiếu global).
- ✓ **boot.js chạy hết** (`[BOOT] ✅ all modules ready`, 46 dòng log), **0 module init FAILED**.

⚠ Giới hạn: vì stub firebase/Tabulator nên test này CHỈ xác nhận nạp + wiring + boot + đủ global;
CHƯA kiểm render bảng Tabulator thật, sync Firebase, hay layout. **Vẫn nên test 1 lượt trên trình duyệt**
(Live Server/Pages) cho chức năng. Ghi chú: `PLAN` KHÔNG phải global — là property trên `TP`/`TMR`
(code đọc `TP.PLAN`/`TMR.PLAN`); global thật của plan là `TP` và `TMR`.

## 11. THAY ĐỔI UI (2026-06-20)
- **Today Plan & Tomorrow Plan: mặc định mở Ledger view.** `js/features/plan.js` (factory dùng
  chung TP/TMR), đổi `viewMode` khởi tạo thành `'ledger'` cố định (trước đó đọc localStorage
  `lpg_v4_planview_*` nên nếu người dùng từng bật Table thì lần sau vẫn mở Table). Nút toggle
  Table/Ledger vẫn hoạt động trong phiên; mỗi lần tải lại luôn về Ledger. node --check + smoke PASS.

## 12. THAY ĐỔI UI + LOGIC (2026-06-24)

Gom 7 chỉnh sửa nhỏ. Ghi lại field/đường đi dữ liệu liên quan để phục vụ tách module sau này.

1. **Dashboard donut — STOCK LEFT căn cùng độ cao với TODAY PLAN.** `css/core.css`:
   `.sc-pp-row` đổi `align-items:center → flex-start` (cột TODAY PLAN cao hơn vì có dòng
   P/L/R ở đáy nên donut bị lệch xuống ở cột STOCK); `.sc-r1-plan-legend` thêm `align-self:center`
   để legend vẫn căn giữa so với donut. Chỉ CSS, không đụng JS render (`SCALE.scRenderCtrl`,
   `INV.renderRow1`).
2. **Dòng đếm đơn (P/L/R) viết đầy đủ + tô màu đồng bộ legend PLAN.** `js/features/scale.js`
   (`scRenderCtrl`, ô `#scPlanOrderCount`): đổi từ `textContent 'P: .. L: .. R: ..'` sang
   `innerHTML` 3 span `.oc-plan/.oc-load/.oc-remain` = `PLAN/LOADED/REMAIN`. CSS màu khớp
   `.plan-total`(ink)/`.plan-done`(#2d8a4e)/`.plan-remain`(navy). Placeholder trong `index.html`
   cập nhật theo + tooltip.
3. **Lưu Price vào TL Data khi bán xong xe.** `js/features/scale.js` — `_buildTLPayload` và
   `_mdoBuildPayloadFor` (multi-DO): thêm `payload.price` lấy từ `PP.planLookupPrice(shortCust,
   contract, '')` (cùng nguồn giá Today Plan hiển thị). Field `price` đã có sẵn trong TL
   (`js/data/tl.js` cột `{k:'price'}` + danh sách paste). `TL.upsertFromScale` ghi field tổng quát
   nên không cần sửa. → **DATA FLOW: PP price_ → SCALE payload.price → TL raw_data/{rid}/price.**
4. **Cỡ chữ Rmooc = Plate ở cả Today & Tomorrow Plan.** Bảng plan dùng CHUNG 1 Tabulator
   (lọc theo PLAN DATE). `js/features/plan.js` cột Rmooc thêm `cssClass:'tp-rmooc'`; `css/core.css`
   thêm `.tp-rmooc{font-weight:700;font-size:13.5px;color:#0a5c96}` (đặt cả `.tp-plate` = 13.5px
   để bằng nhau, vẫn khác màu để phân biệt tractor/trailer).
5. **Paste sale plan không ghi product type → mặc định 50:50.** `js/checks/wgcheck.js`
   `_pfDeriveType()`: nhánh fallback cuối đổi `'LPG' → 'LPG (C3:50/C4:50)'` (giống hệt khi hợp đồng
   ghi rõ "50:50"). Đây là **nguồn duy nhất** suy ra product type cho PTT/DN/TL nên áp dụng đồng
   bộ. Lưu ý: `type` rỗng hoàn toàn vẫn trả `''` (không bịa) — chỉ default khi có chuỗi hợp đồng
   nhưng thiếu tỉ lệ.
6. **PTT in sớm — Safe Fill Allow to bằng Loading Q'ty.** `js/integrations/ptt-early.js`
   (`_buildPage` + bản combined): ô Safe Fill Allow đổi sang số `20pt/900` + "kg" `11pt` (khớp
   số Loading Q'ty 20pt và nhãn "Ton" 11pt).
7b. **Rmooc trong Ledger view** (`.pv-rmooc`) nâng 11px → 13px/700 + letter-spacing 2px bằng
   `.pv-plate` (bổ sung sau khi mới chỉ sửa Table view ở mục 4). Ledger render ở `plan.js`
   `renderLedger()` dùng class `pv-plate`/`pv-rmooc`.
8. **Cảnh báo Staff on duty khi assign xe.** `js/features/scale.js` `scAssignToStation` (funnel
   trung tâm của MỌI đường assign: search-click, queue 📍, multi-DO picker, waitPop). Gộp nhắc
   vào chính toast assign cuối cùng (đặt riêng sẽ bị toast 'ok' ghi đè): nếu `#scEngineer` hoặc
   `#scCheckBooth` rỗng → toast màu cam `'warn'` "⚠ Chưa điền Staff on duty: …". KHÔNG chặn (xe
   vẫn được assign) vì staff có thể điền trước khi in PTT. Thêm style `#toast.warn{background:#e76f00}`
   ở `css/core.css`. (Lưu ý latent: `globals.js` `toast(m,t)` chỉ nhận 2 tham số, hardcode 2600ms —
   chỗ gọi `toast(..,'er',4500)` ở scale.js dòng ~981 bỏ qua tham số thứ 3.)
8b. **Đếm đơn LOADED tạm tính cả xe đang nạp.** `js/features/scale.js` `scRenderCtrl` vòng-2
   (station-level pass): chỗ cộng `planDoneLoadMt += q` cho trạm `status==='loading'` nay thêm
   `planDoneCount++` → số đơn LOADED giờ = đơn 'done' + xe đang nạp ở trạm, **khớp 1:1 cách tính
   LOADED qty (MT)**. REMAIN count = `max(0, planRowCount − planDoneCount)` nên tự giảm theo.
   Tooltip `#scPlanOrderCount` cập nhật. (Đơn 'done' đã chống trùng qua `countedOids`; loading
   không dedup riêng để count & qty đồng bộ tuyệt đối.)
9. **Lưu ý kỹ thuật:** mount bash của workspace có thể là snapshot CŨ (thấy file bị cắt cụt) —
   dùng file tools (Read/Edit) làm chân lý; node --check chạy trên bản bash cũ KHÔNG đáng tin.
   File thật đầy đủ & comment đóng đúng. (Có 1 ký tự `�` cũ trong comment cuối wgcheck.js dòng ~991,
   vô hại vì nằm trong comment.)
