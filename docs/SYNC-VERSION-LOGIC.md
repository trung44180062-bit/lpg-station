# SYNC / VERSION LOGIC — Firebase ↔ localStorage ↔ RAM

> Tài liệu chuẩn bị cho việc tách module. Mô tả cơ chế version-gated sync hiện tại của V4
> (nguồn: `lpg-station-v4_54_0...html`, đã bóc vào các module dưới đây).

## 1. Tầng dữ liệu
- **RAM**: object trong bộ nhớ (`DATA`, `ROWS`, `PLAN`...) → render ra UI.
- **localStorage (cache)**: snapshot `{ schema, savedAt, versions, data }` — nạp ngay khi mở app để offline-safe.
- **Firebase RTDB**: **single source of truth**. App KHÔNG bao giờ tự push dữ liệu mẫu lên.

Luồng khi mở app: cache → RAM (tức thì) → attach Firebase → reconcile (FB thắng) → RAM cập nhật → lưu lại cache.

## 2. KHÔNG có version tổng. Mỗi vùng 1 counter riêng

| Vùng (module)        | Node version Firebase   | Node dữ liệu     |
|----------------------|-------------------------|------------------|
| fleet (sync.js / SC) | `fleet_version`         | `fleet_/{tab}`   |
| TL data (tl.js)      | `raw_data_version`      | `raw_data`       |
| customers (ct.js)    | `cust_version`          | `cust_`          |
| prices (pp.js)       | `price_version`         | `price_`         |
| SAP (sp.js)          | `sap_version`           | `sap_`           |
| WMS GI (wg.js)       | `wms_gi_version`        | `wms_gi_`        |
| WMS ST (ws.js)       | `wms_st_version`        | `wms_st_`        |
| plan today (plan.js) | `plan_today_version`    | `plan_today_`    |
| plan tomorrow        | `plan_tomorrow_version` | `plan_tomorrow_` |

→ Muốn ép sync tay thì phải bump **TẤT CẢ** các node `*_version` (8 cái), không phải 1.

## 3. Bất biến (invariant) — vì sao version-gate an toàn
Mỗi lần ghi đều `_versions.X++` **rồi** ghi data + counter trong **CÙNG một `update()` đa-path (atomic)**, và `saveCache()` lưu data + version cùng lúc.
⇒ **local version == FB version  ⟹  local data == FB data.** Đây là điều kiện để được phép bỏ qua tải lại.
- Qua phần mềm, version **chỉ tăng** (monotonic) — kể cả Clear-all/xóa cũng đi qua `applyAndPush` nên vẫn `++`. (plan rollover set `= Date.now()` → vẫn là tăng).
- Version chỉ **lùi (backward)** khi **sửa tay / xóa node trên Firebase Console** hoặc restore backup cũ.

## 4. Hai pattern hành vi (KHÁC NHAU — cần thống nhất khi tách)

**Pattern A — có xử lý backward** (`fleet` = SC, `TL`):
```
on(version): v < local → adopt + FULL reconcile (xử lý wipe/reset tay)
             v > local → adopt, dữ liệu về qua child events
on(attach):  LUÔN full reconcile (merge remote + prune row local không còn trên FB)
```

**Pattern B — chỉ forward** (`ct, pp, sp, wg, ws, plan`):
```
on(version): v > local → adopt; v < local → BỎ QUA (không phản ứng realtime)
on(attach):  LUÔN once('value') + prune orphan
```

## 5. Hệ quả quan trọng (đối với tình huống "hôm qua xóa trắng")
1. **Hiện tại mọi module ĐỀU full-read khi mở app** (chưa version-gate). Tức là cứ mở là tải full + prune → máy nào mở lại đều hội tụ về FB, **bất kể version**. Đây là lý do "mở lại là đúng".
2. Bump version **không tự di chuyển dữ liệu** — nó chỉ là tín hiệu. Dữ liệu đúng phải nằm sẵn trên Firebase.
3. **Lỗ hổng**: 5 module Pattern B KHÔNG xử lý backward lúc đang mở. Nếu xóa node trên Console (version lùi) khi máy đang mở → 5 vùng đó không re-sync cho tới khi **mở lại**. fleet & TL thì tự chữa ngay.
4. Vì lỗ hổng (3), **bump version LÊN an toàn hơn để version lùi**: forward được cả 8 module adopt đồng nhất.

## 6. Thiết kế mong muốn (version-gate khi mở) — TODO
- Khi mở: chỉ đọc node `*_version` (nhỏ). So với version cache local.
  - **Bằng nhau** → tin cache, **BỎ QUA** tải full data (tiết kiệm quota Spark).
  - **Khác** (forward HOẶC backward) → full reconcile (read + prune).
- Giữ child listeners realtime (delta rẻ) khi đang mở — không gate theo version.
- Thêm nhánh backward cho 5 module Pattern B (đồng bộ với fleet/TL).
- **Tùy chọn**: thêm 1 node tổng `data_epoch` → bump 1 số là ép tải lại tất cả vùng (thay vì bump 8 node).

### Quy tắc thao tác tay (bắt buộc)
Sau **bất kỳ** lần sửa/xóa dữ liệu trực tiếp trên Firebase Console: **bump version LÊN cao hơn max hiện tại** của vùng đó (hoặc cả 8). Nếu sửa data mà quên bump version → máy cùng version sẽ KHÔNG tải về → mất thay đổi.

---

## 7. FORCESYNC — node tổng ép đồng bộ (ĐÃ IMPLEMENT, 2026-06-23)

> Giải quyết lỗi: máy giữ `fleet_version` cũ, nhân viên edit ghi đè version cao đã sửa tay
> (vd 6300 → 65). Cần một "nút đỏ" độc lập với 8 `*_version`, **app không bao giờ tự ghi** nên
> không bị reset.

**Node:** `settings/force_sync_version` (số nguyên). **Module:** `js/core/forcesync.js` (`window.FORCESYNC`).
**Cache epoch local:** `localStorage['lpg_v4_force_sync_epoch']`.

**Cơ chế** — 1 listener `on('value')` (gọi trong `AUTH.init` callback, **sau đăng nhập** vì rules cần auth):
```
fb >  local  → lưu epoch=fb (trước) → xóa toàn bộ data-cache lpg_v4_* (chỉ key có nguồn FB)
               → toast → location.reload() → nạp lại 100% từ Firebase (ghi đè local+RAM,
               reset luôn mọi *_version desync)
fb <= local  → không làm gì → chạy tiếp logic version từng node (mục 4)
```
`on('value')` bắn cả lúc attach (mở app kiểm tra) lẫn mỗi lần đổi ⇒ **auto-reload khi đang mở**.

**An toàn:**
- Lưu epoch **trước** reload ⇒ không lặp reload. Cờ `_busy` chặn double-reload.
- Chỉ xóa 11 key data có nguồn Firebase; **KHÔNG** đụng config local-only (`lpg_v4_mc_config_v1`, `lpg_v4_gi_auto`, `lpg_v4_planview_*`).
- Rules: `"settings": { ".write": false }` ⇒ **client chỉ ĐỌC**, chỉ sửa được từ Firebase Console (chống cửa hậu, không máy nào reset được).

**Cách dùng:** Firebase Console → tạo/sửa `settings/force_sync_version` → **tăng lên** (cao hơn số hiện tại). Máy đang mở auto-reload; máy khác mở lên sẽ tải lại → tất cả đồng bộ về đúng Firebase.

**Lưu ý vận hành:**
- Chỉ hiệu lực khi **mọi máy đã chạy bản có `forcesync.js`** (đã publish GitHub → OK).
- Khi tách thêm module mới có cache đồng bộ Firebase → **thêm key vào `DATA_CACHE_KEYS`** trong `forcesync.js`.
- Đây là biện pháp "ép cứng". Gốc rễ desync (forward bump không kéo lại khi đang mở; 5 module Pattern B bỏ qua backward) vẫn nên xử lý ở mục 6 để giảm số lần phải ép.

---

## 8. FIX lỗi "force xong fleet mất trắng" + version-gate fleet (2026-06-23)

**Triệu chứng:** sau FORCESYNC, fleet trắng toàn bộ trên mọi máy dù Firebase còn đủ dữ liệu (export: driver 373, rmooc 219, tanklorry 110, tractor 219, twavg 384). Các module khác bình thường.

**Nguyên nhân gốc:** `SC.init()` (fleet) chạy ở **P0 — TRƯỚC khi đăng nhập** (vì phải `firebase.initializeApp()` trước AUTH). Trong đó nó gắn listener + đọc `fleet_/*`. Nhưng Security Rules `.read` yêu cầu `auth != null + whitelist` ⇒ đọc lúc CHƯA đăng nhập bị **PERMISSION_DENIED**, listener bị huỷ, không tự phục hồi sau login → fleet rỗng. **Trước đây cache che lỗi** (loadCache hiện dữ liệu cũ); FORCESYNC xoá cache nên lộ ra. Fleet là **module DUY NHẤT init ở P0** — mọi module khác init trong `AUTH onReady` (sau login) nên không dính → đúng "chỉ mỗi fleet lỗi".

**Fix (sync.js + boot.js):**
1. **Tách init/attach:** `SC.init()` ở P0 chỉ `initializeApp` + instrumentation (KHÔNG đọc fleet). Việc gắn listener + tải chuyển sang **`SC.attach()` gọi trong AUTH onReady** (sau login) — boot.js, ngay sau `FORCESYNC.init()`.
2. **Version-gate fleet (1 listener `fleet_version.on('value')` lo cả MỞ + realtime):**
   - `fb < local` → wipe/reset tay → `_loadFleet` (tải + prune).
   - `fb > local` → máy khác sửa / vừa bị FORCESYNC (local=0) → `_loadFleet` (tải).
   - `fb == local` → **KHÔNG tải**, dùng cache/RAM (đỡ quota). ⇒ đúng "chỉ tải khi local < firebase".
3. **Row listeners (child_added/changed/removed) gắn LAZY** trong `_loadFleet` (idempotent) — khi version khớp KHÔNG replay ⇒ không tải full mỗi lần mở. (Trước đây gắn vô điều kiện nên mỗi lần mở replay ~1300 dòng = tải full.)

**Sau khi deploy:** mỗi máy local fleet_version=0 (cache đã bị FORCESYNC xoá) < firebase 65 → tải full về → fleet phục hồi + cache dựng lại ở v65. Lần mở sau version khớp → dùng cache, không tải. **Chỉ cần push sync.js + boot.js lên GitHub rồi Ctrl+F5** (không cần đụng force_sync nữa).

**Đã verify:** node --check khối mới PASS; mock 4 kịch bản (khớp→không tải; force/local=0→tải; wipe tay→tải; máy khác sửa→tải) đều đúng.
