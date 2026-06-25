# MONTHLY REPORT (MTHR) — nguồn dữ liệu & RAM stores

> Chuẩn bị cho việc tách module sau này. Tab **📅 Monthly Report** (`js/features/mthr.js`)
> giờ **tự chủ dữ liệu**: paste thẳng vào RAM, không cần qua tab SAP / Cavern.
> **Tất cả RAM-only**: không `localStorage`, không Firebase — tắt app là mất.

## 1. Các nguồn dữ liệu (data sources)

| Nguồn | Module gốc | Store trong MTHR | Vai trò |
|---|---|---|---|
| SAP ZMMFR022 | `data/sp.js` (`SP.ROWS`, FB+local) | `SAP_RAM` (RAM) | Khung báo cáo (init/gr/gi/trs/end). |
| WMS-SAP batch X (OL1 EX-PETCHEM, C3사용량) | `features/cav.js` (`CAV.ROWS` ol1·X, FB) | `X_RAM` (RAM) | Điền ô **OL1 GI batch X (C3)**. |
| TL Data (sheet Raw Data) | paste sẵn có | `TL_ROWS` (RAM) | Pure C3/C4 + đối chiếu SAP⇄TL. |

### Quy tắc ưu tiên (đã chốt với user)
- **SAP**: khi `SAP_RAM` có **bất kỳ** dòng nào → báo cáo dùng **RIÊNG `SAP_RAM`**, bỏ qua `SP.ROWS`.
  `SAP_RAM` rỗng → fallback `SP.ROWS` (hành vi cũ). Hàm: `sapUsingRam()`, `sapRows()`.
- **Batch X**: ô X **chỉ** lấy từ `X_RAM` (KHÔNG đọc `CAV.ROWS`). Tự điền khi đổi tháng / sau paste
  (`autoFillXFromWms`): ghi đè nếu `force`, nếu không chỉ điền khi X đang trống.

## 2. Schema RAM

```
SAP_RAM[date|sloc|mat|batch] = {date, sloc(1100/2100/2101/B100), mat(C3/C4),
                                batch(P/X/D/E), init, gr, gi, trs, end}   // kg, đã Math.round
X_RAM['YYYY-MM-DD'] = kg            // tổng theo ngày (J actual ưu tiên, fallback H plan)
SAP_INFO / X_INFO = {n, months:[], pastedAt}
```

## 3. Parser (port, giữ logic 1:1 với nguồn gốc)

- `parseSapSheet(tsvRows)` — port từ `sp.js`. Cột: mat@2, sloc@4, date@6, batch@7,
  init@8, gr@11, gi@13, trs@15, end@17. Gom theo `date|sloc|mat|batch`. Bỏ mat/sloc lạ, bỏ header.
  Helpers: `sapNum`, `sapParseDate`, `sapBatch`, `SAP_MAT_MAP`, `SAP_ALLOWED_SLOC`.
- `parseXText(text, yr)` — port từ `cav.js` (`cavParseXText`). Map theo **header tiếng Hàn**
  (`관세유예` + `실적`=J / `계획·추정`=H), cột `월`/`일자`. MT→kg (×1000). Miễn nhiễm cột ẩn.
  Năm `yr` lấy theo tháng báo cáo đang chọn.

## 4. API mới (window.MTHR)

```
openSapPaste/closeSapPaste/submitSapPaste/clearSap   // SAP RAM
openXPaste/closeXPaste/submitXPaste/clearX/fillXFromWms  // WMS-SAP X RAM
```
UI: `index.html` toolbar (`📥 Paste SAP`, `📥 Paste WMS-X`, `⚡ X←WMS`), 2 modal
(`#mthrSapModal`, `#mthrXModal`), badge nguồn (`#mthr-src-badge`, `#mthr-x-badge`),
CSS `.mthr-src` / `.mthr-cell-req` trong `css/monthly.css`.

## 5. Mục tiêu cuối
Có **SAP RAM + WMS-SAP X RAM + TL** → báo cáo auto mọi thứ, **chỉ còn batch P phải nhập tay**
(ô được tô viền vàng `.mthr-cell-req`, tag `★ nhập tay`).
