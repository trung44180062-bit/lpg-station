# Phân tích: TL phantom rows 1–3 & WMS GI match không ổn định

_Soạn cho việc tách module (P3 WG/TL). Nguồn: `js/data/wg.js`, `js/data/tl.js`, export RTDB (5)._

## 1. 3 dòng lỗi trong TL Data (rows 1,2,3) — KHÔNG phải do WMS sinh ra

Khóa của 3 dòng lỗi: `mqp3xl0g01htxb`, `mqp3xl0gslcfv8`, `mqp3xl0gzjos9g` — **14 ký tự**, cùng tiền tố thời gian `mqp3xl0g`.

- `TL._genRid()` = `Date.now().toString(36)`(8) + random(6) = **14 ký tự** ✅ khớp.
- `newRid()` (WG/Fleet) = 8 + random(4) = **12 ký tự** ✗ không khớp.

→ 3 dòng này do **chính nút "Paste from Excel" của tab TL Data (`TL.doPaste`) tạo ra**, trong cùng một lần dán (cùng `Date.now()`). Không có đường nào để WMS GI tự ghi vào `raw_data`.

Lý do trông "giống cấu trúc WMS/SAP": ai đó đã **dán một bảng lạ (dữ liệu SAP/giao hàng — có "ZLFE", số chứng từ `0086671887`, mã `2000420749`, ngày `20260622`)** vào ô paste của TL. `doPaste` map cột **thuần theo vị trí** (`PASTE_COLS`) và gần như **không kiểm tra hợp lệ** — chỉ cần `obj.doNo || obj.truck` có giá trị là tạo dòng:

```js
if(!obj.doNo && !obj.truck) continue;   // tl.js ~589  → quá lỏng
```

Kết quả: cột bị lệch hoàn toàn → `date="L0"`, `doNo="20260622"`, `giDate="0086671887"`, `type="HUYỀN PHẠM ĐÌNH"` (tên tài xế), v.v.

**Cách xử lý ngay:** xóa 3 dòng đó (nút ✕ hoặc Range delete).

**Cách chặn tái diễn (đề xuất sửa `doPaste`):** thêm validate trước khi nhận dòng, ví dụ:
- `parseDate(date)` phải ra đúng định dạng `DD/MM/YY` (loại "L0", "20260622").
- `doNo` phải là token DO hợp lệ (`^\d{6,}$` hoặc `^[A-Za-z]{2,4}\d{6,}$`), không phải ngày.
- Nếu >30% số dòng fail validate → từ chối cả lần dán + báo "Sai định dạng, đây có phải bảng TL Data không?".

## 2. Logic match của WMS GI (hàm `_autoFillTlGiDate`, wg.js 615–681)

Chạy **sau mỗi lần confirm paste WMS GI** (`confirmDiff → runTlSync`, sau modal promotion).
Biến chốt: `wmsDate` = **ngày trong ô date picker của lần paste hiện tại** (ISO `YYYY-MM-DD`).

**B1 — Dựng pool DO từ WMS (`wmsByDo`)** — quét TẤT CẢ `WG.ROWS`, nhận 1 dòng khi:
1. `delivId` là token DO: `^\d{6,}$` HOẶC `^[A-Za-z]{2,4}\d{6,}$` (vd `KNH26061101`).
2. `pickKg > 0`.
3. `_wmsDate === wmsDate` (**bằng đúng ngày picker hiện tại**).
   Key = `delivId` viết HOA. Nếu pool rỗng → **thoát, không match gì**.

**B2 — Quét ứng viên trong TL.ROWS** — mỗi dòng TL nhận khi:
1. Không `disabled`.
2. `giDate` rỗng (chưa GI).
3. `_isoFromDDMMYY(r.date) === wmsDate` (**ngày xuất của dòng TL = ngày picker**).
4. `r.doNo` tách token, có ít nhất 1 token DO, và token đó **có trong `wmsByDo`**.
5. `TL.previewWmsSync` cho `hasChanges === true`.

**B3 — Mở modal TL sync.** Khi xác nhận → `TL.applyWmsSync` đóng dấu:
`giDate ← HÔM NAY`, `lpgQty ← pickKg`, `c3Kg/c4Kg ← propane/butane`, `c3Pct/c4Pct ← tính lại`.

> Khóa match = **DO trùng khít (uppercase)** GIỮA `TL.doNo` và `WMS.delivId`, **VÀ cả 3 ngày bằng nhau**: picker = `WMS._wmsDate` = `TL.date`.

## 3. Vì sao match "không ổn định" (paste 2 không khớp, clear-all + paste cả cục thì khớp)

Nguyên nhân gốc: **điều kiện match khóa cứng theo NGÀY ở cả 3 nơi**, trong khi **ô date picker tự reset về HÔM NAY mỗi lần mở modal paste**:

```js
function openPaste(){ ... pasteDateToday(); ... }   // wg.js 397-403
```

Diễn biến gây lỗi:
- Ngày xuất hàng = 23/06. Sáng 24/06 mới đi GI.
- **Paste 1:** nhân viên chỉnh picker về 23/06 → match đúng vài DO, confirm → các DO đó bị đóng `giDate`.
- **Paste 2 (DO mới):** mở modal, picker **âm thầm nhảy lại = hôm nay 24/06**. Nếu nhân viên quên chỉnh:
  - `wmsByDo` chỉ lấy WMS có `_wmsDate === 2026-06-24` → các DO mới vừa dán bị stamp `_wmsDate=24/06`.
  - Dòng TL tương ứng có `date = 23/06` → `tlIso=2026-06-23 ≠ 2026-06-24` → **trượt B2 → không match**.
- **Clear all + dán 1 cục:** chỉ còn 1 ngày picker duy nhất → cả pool WMS và TL cùng rơi vào 1 cửa sổ ngày → **match lại bình thường**.

Các yếu tố khuếch đại:
- **Pool loại trừ theo ngày:** WMS dán ở ngày picker khác bị vô hình với match dù DO trùng 100%.
- **Không có phản hồi:** khi cửa sổ ngày lệch, `_autoFillTlGiDate` chỉ `return` lặng lẽ — không toast "DO nào chưa match" → người dùng thấy như "lúc được lúc không".
- Dòng TL đã có `giDate` (đã match lần trước) sẽ bị bỏ qua (đúng thiết kế) nhưng nhìn cũng giống "không match".

## 4. Đề xuất sửa để match ổn định trên mọi lần paste

1. **Match chính theo DO, không khóa cứng theo ngày.** Pool WMS lấy MỌI dòng DO thật có `pick>0` (bỏ điều kiện `_wmsDate===wmsDate`); ở B2 cũng bỏ/nới điều kiện `tlIso===wmsDate`. Chỉ dùng ngày làm **tie-break** khi 1 DO xuất hiện ở nhiều ngày (hiếm).
2. **Đừng reset picker về hôm nay mỗi lần.** Nhớ ngày picker lần trước (localStorage), hoặc suy ra ngày xuất từ chính dữ liệu dán.
3. **Báo cáo DO chưa match** sau mỗi paste (toast/list) để nhân viên biết lý do thay vì đoán.

## 5. Vị trí code liên quan (tách module)
- TL paste lỏng lẻo: `js/data/tl.js` `doPaste` (~566–635), `PASTE_COLS` (~558).
- WMS match: `js/data/wg.js` `_autoFillTlGiDate` (~615–681), `submitPaste` (~413–465), `confirmDiff` (~527–574), `openPaste/pasteDateToday` (~397–409).
- Đóng dấu TL: `js/data/tl.js` `applyWmsSync` / `previewWmsSync`.
