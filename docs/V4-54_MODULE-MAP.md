# V4-54 MODULE MAP — chuẩn bị tách phần mềm thành module nhỏ

> File này ghi nhận dần cấu trúc của `lpg-station-v4_54_0-cavern-collapsible-sections.html`
> (gọi tắt **V4-54**) trong quá trình đọc/sửa, để sau này tách thành các module nhỏ
> (HTML/CSS/JS riêng) giúp sửa chữa & nâng cấp tốn ít token hơn khi làm việc với Cowork.
> Bản cũ `lpg-station-v406.html` (**V406**) dùng làm CƠ SỞ THAM KHẢO giao diện.

Cập nhật lần đầu: phiên làm việc port giao diện Plan (Today / Tomorrow / Ledger) theo V406.

---

## 0. Tổng quan kiến trúc V4-54

- **1 file HTML duy nhất** ~28.4k dòng: `<style>` (CSS) → `<body>` (markup các page) → `<script>` (JS, nhiều IIFE/factory).
- Dữ liệu lưu trên **Firebase** + cache `localStorage`. Mỗi page là 1 `<section class="page">`.
- Có 1 dòng dữ liệu/thư viện nhúng **rất dài** ở **dòng 5695 (~443k ký tự)** — KHÔNG sửa, KHÔNG grep nội dung (tràn token). Đây là lý do nên tách module.

### Các "page" chính (theo `<section class="page" id="...">`)
| Page id | Tên hiển thị | Ghi chú |
|---|---|---|
| `page-fleet` | FLEET CERTS | Quản lý cert xe/tài xế. Dùng Tabulator. `buildColumns()` riêng ở **dòng 9578**. |
| `page-sales` | LPG SALES | Chứa các sub-tab: SCALE, **TODAY PLAN**, **TOMORROW PLAN**, … (dòng 2873+). |

---

## 1. MODULE: PLAN (Today / Tomorrow) — trọng tâm phiên này

Plan dùng **một factory dùng chung** tạo ra 2 instance: `TP` (today) và `TMR` (tomorrow).
Mỗi instance có 2 chế độ xem: **Table view** (Tabulator) và **Ledger view** (render thuần).

### 1.1 Markup (trong `<body>`)
| Vùng | Dòng | Mô tả |
|---|---|---|
| Sub-tab buttons | ~2880 | `📅 TODAY PLAN`, `📅 TOMORROW PLAN` (badge count) |
| Today Plan pane | ~3355, toolbar ~3518 | nút `tpViewToggle` (Table/Ledger), `tpClearAll`… |
| Today table host | ~3537 | `#tpGrid` (Tabulator) bên trong `.tp-table-full` |
| Today ledger host | 3550 | `<div class="pl-wrap" id="tpLedger">` |
| Tomorrow pane | 3553+ | mirror; toggle `tmrViewToggle`; nút `tmrPromoteToToday` |
| Tomorrow ledger host | 3586 | `<div class="pl-wrap" id="tmrLedger">` |
| Paste/diff/promote modals | 5311–5480 | Today & Tomorrow paste, choice, diff, promote-to-today |

### 1.2 CSS Plan
| Khối | Dòng | Prefix | Ghi chú |
|---|---|---|---|
| Ledger "pl-" (redesign v4.35.0) | 2549–2715 | `.pl-*` | Container, filter chip, date chip, summary, **bản card grid cũ** (`.pl-ohead/.pl-orow`) — không còn dùng để render chính |
| Ledger "pv-" (V406-style grouped, v4.42.0) | 2554–2640 | `.pv-*` | Bảng nhóm theo khách. **renderLedger dùng nhóm pv-**. ĐÂY là phần được retheme sang V406 (phiên này). |
| Table view row tints | (rải rác) | `.tp-row-done/-loading/-cancel/-temp/-future`, `.tr-wg-warn`, `.tr-wg-warn-plate` | dùng bởi `rowFmt()` |

### 1.3 JS Plan (factory) — các hàm chính & dòng
| Hàm / biến | Dòng | Vai trò |
|---|---|---|
| `PLAN = {}` | 9931 | RAM store: `_oid` → row |
| `viewMode = localStorage... \|\| 'ledger'` | 9949 | **Mặc định Ledger** (key `lpg_v4_planview_<ID>`) |
| `STATUS_OPTS` | 10963 | 5 trạng thái: ''(pending), entered, loading, done, cancel |
| paste parse (gán `_subGroup`, `_status`, `_actualQty`, `_forDate`) | ~10167 | mỗi row có `_subGroup: subGroupIdx` ⇒ **dùng được dải màu sub-group V406** |
| `planRows()` | 11278 | filter (date chips + search) → **sort theo customer → no** (phục vụ gom nhóm ledger) |
| `buildColumns()` (PLAN) | 11216 | cột Tabulator: #, ☑AUTO, Date, Status, Customer, Plate, Rmooc, Driver, Qty, Tol, Actual, Gate, Load, DO No., Note, Last Edit, 🗑, DO Var |
| `buildTable()` | 11301 | tạo Tabulator `#<ID>Grid`, `data: planRows()` |
| `rowFmt(row)` | 11253 | gán class tint theo status/warn cho table view |
| `rebuildTableData()` | 11341 | `table.replaceData(planRows())` + `renderLedger()` |
| `_ledChipKey/_ledBay/_ledDoneTime/_ledWarn` | 11883–11924 | helper trạng thái/bay/giờ done/cảnh báo cert |
| `applyView()` | 11925 | show/hide table vs ledger, đổi nhãn nút, gọi `renderLedger()` |
| `toggleView()` | 11938 | đổi viewMode + lưu localStorage |
| `setLedgerFilter / toggleGroup` | 11943 | filter chip / gập nhóm (sẽ KHÔNG dùng gập sau khi sang bảng phẳng V406) |
| `ledgerEdit / ledgerDel` | 11950 | sửa (nhảy sang table) / xoá |
| `_ledgerCommit / ledgerCellEdit / ledgerToggleGL / ledgerPickStatus` | 11972–12034 | inline edit ô / toggle Gate-Load / chọn status (chỉ khi manual) |
| `_fmtMT` | 12035 | format MT |
| **`renderLedger()`** | 12040 | **Hàm render ledger — phiên này VIẾT LẠI thành bảng phẳng liên tục kiểu V406** |
| API export (init/buildTable/…) | 12247+ | object `API` công khai ra `TP`/`TMR` |

### 1.4 Phụ thuộc bên ngoài factory (cross-check / lookup)
- `CT.lookup(customer)` → tên short của khách.
- `WGCHECK.badgeHtml(r)`, `.plateHasDiff(r)`, `.rowLevel(r)`, `.recheckRow(r)` → đối soát WMS/GI.
- `FCHECK.plateInFleet(plate)`, `.cellWarn(r,field)`, `.orderWarning(r,date)`, `.recompute()` → cert fleet.
- `PP.planLookupPrice(cust,type,'')` → giá.
- `isRealDO / isTempOid / dosOverlap`, `isoToday / isoLabel / parseDate`, `escapeHtml`, `toast`.

> **Gợi ý tách module sau này:** `plan-core` (PLAN store + planRows + paste/diff + Firebase),
> `plan-table` (Tabulator + buildColumns + rowFmt), `plan-ledger` (renderLedger + CSS pv-),
> `plan-status` (STATUS_OPTS + effective status + auto-sync), tách `WGCHECK`/`FCHECK`/`CT`/`PP`
> thành các module dịch vụ độc lập nạp qua 1 file index.

---

## 2. THAM CHIẾU V406 — giao diện Plan gốc (người dùng đã quen)

### 2.1 Markup V406
- Today: `#sc-sub-today` → `.plan-toolbar` + `.plan-table-wrap` > `<table class="plan-tbl" id="tbl-today">` (thead/tbody render động). Dòng ~2420.
- Tomorrow: `#sc-sub-tomorrow` tương tự, có `📅 Plan Date` picker. Dòng ~2456.

### 2.2 CSS V406 (đã port sang V4-54 phiên này)
| Class | Dòng V406 | Đặc trưng |
|---|---|---|
| `.plan-tbl` | 680 | bảng phẳng `border-collapse`, `min-width:1100px`, thead **sticky** |
| `.plan-tbl th` | 682 | nền `#f7f9fc`, Oswald 9px, letter-spacing, viền dưới 2px |
| `.tr-cust td` | 723 | **dòng header khách** nền xanh nhạt `rgba(0,119,182,.05)`, viền trên 2px |
| `.cust-name / .cust-qty` | 724 | tên khách Oswald 13px xanh `--ce`; tổng qty |
| `.tr-sg-divider td` | 749 | **dải phân cách sub-group** cao 2px (màu theo SG_BORDERS) |
| `.row-entered/-loading/-done/-cancel` | 796–800 | tint dòng theo status (done mờ + xám, cancel gạch ngang) |
| `.sbtn / .sbtn-split / .sbtn-arrow / .sbtn-entered…` | 822–836 | **status split-button** (label cycle + ▾ dropdown) |
| `.badge-ok / .badge-no` | 783 | Gate/Load OK xanh / NO đỏ |
| `.cert-badge / .plan-blink` | 1854 | badge cert hết hạn + nhấp nháy đỏ |
| `.cargo-flag / .flag-*` | 738 | cờ loại hàng (3070/pure/c4/des) |
| `.warn-badge / .wb-*` | 1842 | badge cảnh báo DO/WMS/diff/cust |
| `.note-badge` | 780 | note kiểu nhãn vàng |

### 2.3 Bảng màu V406 (dùng khi retheme)
```
--ce #0077b6 (xanh chủ đạo)   --cc #e76f00 (cam)   --cl #2d8a4e (xanh lá)   --cw/--rd #d62839 (đỏ)
--tx #1e3a5f (chữ)            --mt #6b8299 (mờ)    --bd #dde4ec (viền)      --pn #f7f9fc (nền nhạt)
```
Sub-group tint (SG_COLORS) & viền (SG_BORDERS): cyan/cam/tím/lá/hồng/xanh/vàng/nâu, dòng V406 12336–12355.

### 2.4 Render rows V406 (tham chiếu logic)
- `renderPlanTab(tab)` dòng 12292: dựng thead (today có Status+Actual; tomorrow ẩn 2 cột này).
- `renderPlanRows(tab,data)` dòng 12380: gom theo **customer → type → sub-group**; chèn `tr-cust`, `tr-sg-divider`; tint dòng theo status; status split-button (`cycleStatus` + `toggleStatusDD`).

---

## 3. THAY ĐỔI ĐÃ THỰC HIỆN (phiên này)

1. **Ledger view (TP+TMR)** → viết lại `renderLedger()` thành **MỘT bảng phẳng liên tục** kiểu V406:
   thead dính trên cùng, dòng header khách trong bảng, dải màu sub-group, status split-button,
   tint dòng theo status, Gate/Load badge, cột Price. Bỏ kiểu thẻ gập (collapsible cards).
2. **Retheme CSS `.pv-*`** (scope trong `.pl-wrap`) sang bảng màu/ font V406; thêm
   `.pv-cust`, `.pv-sgdiv`, tint sub-group, `.pv-sbtn*`.
3. **Ledger là mặc định**: `viewMode` đã mặc định `'ledger'` (dòng 9949) — giữ nguyên.
4. **Table view (Tabulator)**: TẮT sort (giữ thứ tự paste = thứ tự Excel nguồn) — `columnDefaults.headerSort=false`
   + dữ liệu sắp theo cột `no`.

### Chi tiết dòng đã sửa (tham chiếu nhanh cho lần sau)
| Vùng | Dòng (sau sửa) | Nội dung |
|---|---|---|
| CSS `.pl-wrap` / `.pl-fbar` | ~2552 | `.pl-wrap` thành flex-column, nền trắng, viền; `.pl-fbar` cố định trên cùng |
| CSS khối `.pv-*` (retheme V406) | ~2556–2645 | bảng phẳng, thead **sticky**, `.pv-cust`, `.pv-sgdiv`, tint status, split-button `.pv-sbtn*`, badge Gate/Load, nút ✎/✕, cert badge/blink |
| JS `tableRows()` (mới) | ~11311 | dữ liệu **table view** theo thứ tự paste (sort theo `_forDate` rồi `no`) |
| JS `buildTable()` | ~11333–11342 | `data: tableRows()`, thêm `columnDefaults:{headerSort:false}`, `movableColumns:false` |
| JS `rebuildTableData()` | ~11375 | `replaceData(tableRows())` |
| JS `buildColumns()` (PLAN) | ~11248–11277 | tất cả cột `headerSort:false` (no/_forDate/_status/lastAt) |
| JS `renderLedger()` (viết lại) | ~12072–12296 | MỘT bảng `.pv-tbl` liên tục: header dính, `tr.pv-cust` mỗi khách, dải màu sub-group (SG_COLORS/SG_BORDERS), status split-button, tint dòng, Gate/Load, Price; bỏ thẻ gập |

### Lưu ý cho lần tách module / sửa sau
- `viewMode` lưu ở `localStorage['lpg_v4_planview_<ID>']`. Nếu trước đó người dùng từng bật Table view,
  nó sẽ nhớ Table. Mặc định khi chưa có lưu = **Ledger**.
- `toggleGroup` / `_grpOpen` / `_grpAutoOpen` (gập nhóm) **không còn dùng** trong render mới
  (giữ lại để không vỡ API). Có thể xoá khi tách module `plan-ledger`.
- Bảng màu/khoảng cách của ledger nằm trong khối `.pv-*` — sửa tại đây nếu cần tinh chỉnh giao diện.
- `tableRows()` sắp theo cột `no` (số thứ tự Excel). Nếu nguồn Excel đổi cách đánh số, chỉnh ở đây.

---

## 4. MODULE: CAV — SAP-WMS data wiring + Preview readiness (v4.55.0)

> Phiên này: viết lại `CAV.preview()` (trong IIFE `const CAV` ~dòng 25045) thành **bảng kiểm tra
> dữ liệu (readiness dashboard)** — kéo số THẬT theo ngày từ mọi nguồn, báo đủ/thiếu, đối chiếu chéo.
> Khối code mới nằm ngay trên `_dateRange()` (thay cho `_fillMapC3`+`preview`+`exportReport` cũ).

### 4.1 Nguồn dữ liệu & shape (RAM, không đọc lại Excel)
| Module (global) | Định nghĩa | Trường dùng cho CAV |
|---|---|---|
| `TL.ROWS` (TL Data) | ~14204 | `giDate`, `ltank`(TK-3501/3502), `c3Kg`,`c4Kg`,`lpgQty`, `trade`, `type`(LPG Type: 50:50/30:70/**pure**/vessel), `dest`, `doNo`, `cust`, `disabled` |
| `WG.ROWS` (WMS GI) | ~12555 | `arrival`/`_wmsDate`, `propane`(=C3 kg), `butane`(=C4 kg), `pickKg`, **`shipToId`** (cột "G-To-InternalCode" → Domestic/Export), `txType` |
| `WS.ROWS` (WMS ST) | ~13508 | `transDate`/`erpDate`, `matLabel`(C3/C4), `kg`, `fromLoc`,`toLoc`, `reason`(D/E), `status` |
| `SP.ROWS` (SAP ZMMFR022) | ~15146 | `date`, `sloc`(1100/2100/2101/**B100**), `mat`(C3/C4), `batch`(P/X/D/E), `init`,`gr`,`gi`,`trs`,`end` (kg) |
| `VLOG.ROWS` (Vessel Log) | ~24732 | `date`, `type`(user nhập Dom/Exp), `qty`/`cTotal`, `ship`; (C3 split: `c3`/`cC3` nếu có) |

### 4.2 Hàm mới trong CAV (tất cả thuần, dễ tách module sau)
- `_n(x)` parse số (bỏ dấu phẩy). `_anyISO(s)` chuẩn hoá ngày: ISO / DD/MM/YY / YYYYMMDD / **Excel serial**.
- **Phân loại (CHỈNH Ở ĐÂY nếu sai):** `_dir(s)` → 'E'/'D'/'' (khớp EX/EXPORT/수출 · DOM/DOMESTIC/내수);
  `_tlDir(r)` = `_dir(trade) || _dir(dest) || _dir(type)`; `_isPure(r)` = type chứa "pure"/순수 **hoặc** một trong C3/C4 = 0.
- Collectors theo ngày: `_srcTL` (tank×D/E×C3/C4 + `pure` + `unc`[] dòng chưa phân loại + `trades`/`types` đã thấy),
  `_srcWG` (D/E theo `shipToId`, + `codes` đã thấy — để đối chiếu), `_srcWS` (NET transfer vào tank = từ 1100 trừ về 1100),
  `_srcSAP` (`E(sl,b,m)`/`GR(sl,b,m)` + `b100` GI để check Heater), `_srcVLOG` (Export/Domestic qty+C3).
- `_fill(date)` → `{rows[], checks[], tl,wg,ws,sp,vl, sapHas, tlMiss}`. `rows` = mọi cột Propane(C3) cần GHI
  với `status`: `man/app/sap`(đã có số) · `wait`(chờ nhập, có thể =0 hợp lệ) · `miss`(nguồn trống) · `warn`(lệch).

### 4.3 Bản đồ cột Propane (1-based Excel) → nguồn (đã wired, ĐÃ kiểm thử với số liệu 17/06)
- **MANUAL** (từ `_agg`): 9 VLGC · 13/14/15/16 GR P/X/D/E · 34 OL1 P · 37 OL1 X · 40 OL1 total · 44 Heater.
- **APP**: 43 Pure C3 (TL `pure`) · 48/49 Domestic 2100/2101 (TL `dom`) · 52 Export vessel (VLOG `exp.c3`) · 54/55 Export 2100/2101 (TL `exp`).
- **SAP** (`E(sl,b,m)`): 58 1100|P · 60 1100|X · 62 1100|D · 64 2100|D · 66 2101|D · 69 1100|E · 73 2100|E · 74 2101|E.
- **Giá ($/ton)** 59/61/63/65/67/70/72: user input, trống → lấy giá ngày trước (chưa wired, để bước sau).

### 4.4 Đối chiếu chéo (trong `_fill`)
1. Heater C3 manual ↔ **SAP B100 GI** (chỉ khi SAP có dòng B100). 2. GR P/X/D/E manual ↔ **SAP GR 1100|batch**.
3. Domestic/Export C3: **WMS GI ↔ TL net**. Lệch > 0.001 ton → `warn` (đỏ). `unc[]` (TL chưa phân loại) → cảnh báo riêng + liệt kê dòng.

### 4.5 Chiến lược CÔNG THỨC trong file .xlsx (đã chốt với user — làm khi viết cell-write)
**Chọn: tạo sẵn công thức cho MỌI dòng ngày tương lai, bọc IF để tự ẩn khi thiếu** (không copy mỗi ngày).
- `Initial Stock (N)` = `=IF(End(N-1)="","",End(N-1))` → dòng chưa báo cáo hiện TRỐNG, không kéo số rác.
- Các cột `total`/`Actual`/derived = `=IF(COUNT(vùng giá trị)=0,"",SUM/ċông thức)` → chỉ hiện khi ngày đó đã có dữ liệu.
- App chỉ GHI VALUE vào cột MANUAL/APP/SAP (9,13…74); **không đụng** ô công thức (Initial, total, Actual, Remain…).
- Lý do ưu việt so với "copy ngày trước kéo xuống": ổn định, không phụ thuộc thao tác export đúng thứ tự ngày;
  dòng tương lai luôn sạch; khi đủ dữ liệu số tự xuất hiện. Nhược điểm: phải seed công thức 1 lần cho dải ngày.

### 4.6b Sửa/Xóa dữ liệu nhập tay NGAY trong Preview (v4.55.0)
- State `_editRid` + 4 hàm public: `delEntry(rid)` (xóa + re-preview), `editEntry(rid)` (mở ô input inline),
  `cancelEdit()`, `saveEntry(rid)` (đọc `#cavEditInp` → cập nhật `qty` vào RAM + Firebase `child(rid).update({qty,_ts})` → re-render).
- Preview có bảng "📝 Dữ liệu nhập tay ngày X" ở đầu: mỗi entry (Loại/Prod/Batch/Qty kg/Note) + nút ✎ sửa inline / ✕ xóa.
  Enter = Lưu, Esc = Hủy. Sửa xong tự tính lại toàn bộ readiness + đối chiếu. (Ngoài ra ENTRIES LOG cũ ở `#cavBodyLog` vẫn còn.)

### 4.6c Ô NHẬP dữ liệu mới theo comment Excel (v4.55.0)
Bổ sung đúng các ô input mà cột J (comment) trong `Cavern_SAP_WMS_FillMap` yêu cầu:
- **VLGC Get-out** (ledger col 10): thêm 2 ô `cavVlgcOutC3/4` trong thẻ VLGC (kind mới `vlgcout`, vào `_agg`, hiện ở Preview là `manRow(10,...)`).
  Thẻ VLGC đổi nhãn rõ IN (입고) / OUT (출고).
- **SAP PRICES $/ton** (ledger 59/61/63/65/67/70): thẻ mới "💲 SAP PRICES" 6 ô `cavPriceP/XP/D1/D21/D22/E1` + nút 💾 Save.
  Lưu 1 bản ghi/ngày tại Firebase `/cavern_price/{date}` = `{pP,pXP,pD1,pD21,pD22,pE1,_ts,by}`.
  `_priceFor(date,key)`: có giá ngày đó → dùng; trống → lấy **giá ngày gần nhất trước đó** (placeholder hiện "↩ giá (ngày)").
  Preview có bảng "💲 Giá ($/ton)" + báo thiếu vào verdict. API: `CAV.savePrices()`. Đổ lại input khi đổi ngày qua `_fillPriceInputs()` (gọi trong `render`/`init`).
- Lưu ý logic còn chờ user xác nhận (comment): OL1 **P nên = (X+P) − X** (tự suy ra thay vì nhập tay) — chưa đổi, để nguyên 3 ô.

### 4.6 TODO bước sau
1. **Cell-write .xlsx** (`exportReport` thật): JSZip như `RPT` (xem `RPT.pickFile`/`findSheet`/`findDateRow`/`parseRows` ~25592–26110) →
   ghi value cột 9..74 vào đúng dòng ngày (kg→ton ÷1000), seed công thức IF theo §4.5, `generateAsync` tải file mới.
2. **Butane (C4)**: dùng lại collectors (đã gom cả c4) + bản đồ cột sheet Butane (58 cột).
3. **Giá $/ton**: thêm ô user input + fallback giá ngày trước.
4. **Xác nhận mapping D/E thực tế**: đọc legend "Phân loại" trong Preview để chốt giá trị `trade`/`shipToId` → chỉnh `_dir` nếu cần.

---

## 5. VLOG — IMPORT từ Excel (paste) — v4.55.x  ⬆
> Tab **Eng ▸ 📋 Vessel Log**. Nút **⬆ IMPORT** mở modal `#vlogImpModal`.
> **UI giống Tank Log** (class `.tl-paste-modal/.tl-paste-box` trong core.css) — KHÔNG dùng bảng preview lớn (đã bỏ vì bể layout).
> Nguồn tham chiếu cấu trúc cột: **`VesselLog_2026-06-22.xlsx`** (sheet "Vessel Log", **44 cột**, A1:AR).

### 5.1 Luồng (Tank-Log style)
Paste TSV (Ctrl+V) vào `#vlogImpArea` → 1 nút **⬆ Import** gọi `VLOG.doImport()`: parse → `pushEntry` từng dòng → đóng modal →
hiện popup tóm tắt nhỏ `#vlogImpDiffModal` ("✅ Added N row(s)"). Paste rỗng → `#vlogImpInfo` báo "⚠ No data found".
**1 dòng paste = 1 entry VLOG** (`pushEntry` → RAM + 1 child Firebase `/vessel_mix_log`). Helper parse thuần: `_parseRows()`.
- **Tự nhận header**: nếu dòng đầu chuẩn hoá (lowercase, bỏ ký tự không phải a-z0-9) chứa `lot` **và** `tank` → map theo **tên cột**; nếu không → dùng **thứ tự cột cố định** `IMP_ORDER` (đúng layout Excel).
- **Trùng lặp = giữ tất cả** (thêm mới, theo yêu cầu user 2026-06-22). Không skip/overwrite.
- **Ngày → DD/MM/YY** qua `normalizeDate`. `_impDate` sửa lỗi gõ **YYYY-DD-MM** (phần giữa > 12) trước khi chuẩn hoá: `2026-17-06`→`17/06/26`. ⚠️ Trường hợp cả hai ≤12 vẫn nhập nhằng (vd `2026-12-06`→`06/12/26` thay vì 12/06) — user phải soát ở Preview.

### 5.2 Bản đồ cột Excel → field entry VLOG  (`IMP_MAP` trong vlog.js)
| # | Cột Excel | field | | # | Cột Excel | field |
|---|---|---|---|---|---|---|
| 0 | No | *(bỏ)* | | 22–28 | T1 C3H8/i-C4/n-C4/1.3BD/C5+/Ole/Dens | `gc.prop/ibut/nbut/buta/c5/ole`, `labdens` |
| 1 | Lot | `lot` | | 29–37 | T2 CH4…Dens | `gc2.*`, `labdens2` |
| 2 | Tank | `tank` | | 38 | FQ C3 | `c3fq` |
| 3 | Ship | `ship` | | 39 | FQ C4 | `c4fq` |
| 4 | Customer | `customer` | | 40 | Odo T1 | `odoTk1` |
| 5 | Date | `date` (chuẩn hoá) | | 41 | Odo T2 | `odoTk2` |
| 6/7 | Start/Finish | `tStart`/`tEnd` | | 42 | Quality | `quality` |
| 8 | Qty | `qty` (+`cTotal`) | | 43 | Remark | `remark` |
| 9/10 | %Vol C3/C4 | `volC3`/`volC4` | | | | |
| 11 | LPG Mix | `lpgMixQty` (+`lpgWt` nếu trống) | | | | |
| 12/13/14 | Tgt/Min/Max | `targetC3`/`minC3`/`maxC3` | | | | |
| 15/16 | %Wt C3/C4 | `wtC3`/`wtC4` | | | | |
| 17/18/19 | C3 Wt/C4 Wt/LPG Wt | `stC3`/`stC4`/`lpgWt` | | 20/21 | T1 CH4/C2H6 | `gc.meth`/`gc.eth` |

- `type` tự suy từ chữ giữa lot: `LPG-2026-S-25`→`'S'` (regex `-([A-Za-z])-`).
- **GC giữ nguyên T1→`gc`, T2→`gc2`** (không gán theo số tank); bảo toàn dữ liệu thô cho module export/edit/GC view sau.
- Số: bỏ dấu phẩy, `parseFloat`; ô trống → bỏ field. Text: lot/tank/ship/customer/date/start/finish/quality/remark.

### 5.3 API VLOG mới
`openImport()`, `closeImport()`, `doImport()` (đã export trong return). Không còn state preview.
Helper: `_normHdr`, `_impNum`, `_impDate`, `_setPath`, `_rowToEntry`, `_parseRows`. Audit: `eng:vessel_log:import`.
UI: `index.html` toolbar nút ⬆ IMPORT + 2 modal `#vlogImpModal` (paste) & `#vlogImpDiffModal` (summary) — đều style `.tl-paste-*`.

---

## 6. INV — Export tách C3/C4 (sửa lọc EXPORT + chọn dòng) — v4.55.x
> Modal `#invExportModal`, mở từ tab **Inventory** nút "📋 Export C3/C4 split" → `INV.openExport()`. Code: `inv.js` `_renderExport`.

### 6.1 Bug đã sửa: chỉ tính khách EXPORT
Trước đây `_renderExport` lấy **mọi** xe TL hôm nay của tank (chỉ lọc ngày + tank), gồm cả **domestic**. Đã thêm bộ lọc
`_isExport(r)` → `/EX|EXPORT|수출|XK|XUAT/` test trên `r.trade` (+ `dest`/`cust` fallback). **Domestic bị loại.**
- Nguồn chân lý: `scale.js` set `r.trade = isExport ? 'Export' : 'Domestic'` với `isExport = /export/i.test(custFull)`
  (tên khách trong plan có chữ "export"). `_isExport` của INV mirror đúng logic này + `CAV._dir`.

### 6.2 Tính năng mới: chọn/bỏ chọn dòng để tính tổng
- State: `_exportRows[]` (`{doNo,cust,lpg,c3,c4,sel}`), `_exportMeta{sloc,pctC3,dmy}`.
- Mỗi dòng có checkbox + click cả dòng để toggle; header có ô "select all" `#invExportAll` (có trạng thái indeterminate).
- `_recalcExport()` tính lại 4 ô tổng (SỐ XE hiện "n / N" khi lọc bớt) + TSV copy **chỉ từ dòng được chọn**.
- API thêm: `toggleExportRow(i)`, `toggleExportAll(on)`. CSS: `inventory.css` `.inv-export-row.off`, `td.pick`.
- Lưu ý: `_renderExport` không còn dùng biến `ds()` thừa. Đã bỏ khối comment SCHEDULER mồ côi (unterminated) ở cuối `inv.js` — scheduler thật nằm trong `boot.js`.
