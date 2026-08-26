# HSVC LPG STATION — v4 (modular)

Phần mềm quản lý trạm LPG (đội xe & chứng chỉ, kế hoạch giao hàng, cân xe, pha trộn,
tồn kho cavern, đối soát SAP/WMS, báo cáo). Dữ liệu lưu trên **Firebase Realtime
Database**. Bản này tách từ file đơn `lpg-station-v4_54_0` ra nhiều module để dễ bảo trì.

## ⭐ NGÔN NGỮ: GIAO DIỆN LÀ **TIẾNG ANH**

Chốt của người dùng, áp cho **toàn bộ V4** — không riêng tab nào.

**Phải tiếng Anh** — mọi chuỗi người dùng đọc được: tiêu đề tab/cột/thẻ, nhãn ô nhập,
placeholder, chữ trên nút, tooltip (`title=`), chip trạng thái, dải cảnh báo, `toast()`,
hộp `confirm()`/`alert()`, thông báo lỗi, tiêu đề file Excel/CSV xuất ra, nội dung modal.

**Vẫn tiếng Việt** — những thứ người dùng KHÔNG đọc trong giao diện: chú thích trong mã,
tên biến/hàm, thông điệp commit, tài liệu trong `docs/`, tên và mô tả các bài test.
Lý do giữ tiếng Việt: chú thích ghi lại *vì sao* làm thế, người bảo trì đọc bằng tiếng Việt
nhanh và chính xác hơn.

**Ngoại lệ đang tồn tại** (mã cũ, chưa chuyển): các tab dựng trước v4.106 vẫn còn chuỗi
tiếng Việt lẫn trong giao diện — sửa tới đâu chuyển tới đó, đừng viết THÊM chuỗi tiếng Việt mới.
Phần đã chuyển và **có test canh**: tab SAP/kho ngoại quan (`tests/bond-dom.smoke.js`) và
bảng ⚖ Stock-transfer reconciliation (`tests/stx-recon-dom.smoke.js`) — cả hai đều có mục
quét dấu tiếng Việt trong chuỗi hiển thị, gõ tiếng Việt vào là test đỏ ngay.

## 🔗 ORDER LINKS (v4.109) — một đơn hàng, nhiều dòng kế hoạch

Sale dán kế hoạch theo **dòng xe**, nên một đơn hàng thật hay nằm trên nhiều dòng.
Nút **🔗 Link Orders** trên thanh công cụ Today Plan khai trước điều đó:

| Kiểu | Nghĩa | Phần mềm làm gì |
|---|---|---|
| **ALT** — alternate trucks | Một đơn, khai sẵn 2–3 xe, **chỉ một** xe sẽ vào lấy | Nhóm chỉ tính **MỘT** lần vào PLAN / LOADED / REMAIN (lấy qty lớn nhất). Xe nào vào station trước thì các dòng còn lại tự **park**; xe đó rời station thì tự mở lại |
| **MDO** — multi-DO | Một xe chở nhiều DO | Tổng vẫn cộng đủ. Lúc assign ở tab Scale **gộp thẳng**, bỏ hẳn popup "load together?", chỉ còn hỏi in PTT **gộp hay tách** |

Lưu ngay trên dòng kế hoạch (`_lnkG` · `_lnkK` · `_lnkPrint` · `_altSkip`) và được
mang qua re-paste, nên dán lại kế hoạch không làm mất link.
`TP.lnkTotals()` là **nguồn duy nhất** của dải Plan·Loaded·Remain (Ledger) lẫn thẻ
PLAN (tab Scale) — hai chỗ không bao giờ lệch nhau nữa. Test canh:
`tests/order-link.test.js` + `tests/order-link-dom.smoke.js`.

## 🖨 MULTI-DO: in GỘP hay in TÁCH (v4.110)

Một xe chở nhiều DO thì có hai chứng từ phải quyết định cách in: **PTT** (lúc
assign) và **phiếu cân / Delivery Note** (lúc cân xong).

* **Hỏi đúng MỘT lần, lúc assign.** Cả hai đường — nhóm đã link bằng 🔗 Link
  Orders lẫn nhóm phần mềm tự dò ra — đều hiện cùng một hộp với hai nút
  *1 COMBINED SLIP* / *N SEPARATE SLIPS*. Lựa chọn ghi lên trạm (`_pttMode`),
  nên hộp hỏi phiếu cân lúc PRINT & DONE **mở sẵn đúng ô đó**.
* **Hộp hỏi là modal thật.** Trước v4.110 nó được vẽ vào ô kết quả tìm kiếm của
  trạm (`#sc-res-N`) — mà ô đó bị handler click-outside ẩn đi, và bị
  `scRenderCtrl()` ghi đè mỗi lần **bất kỳ** trạm nào đổi trạng thái (kể cả do
  máy khác đẩy về). Đó chính là lý do chức năng "khi được khi không".
* **Số chia per-DO sống sót qua F5 / đổi máy.** `tech._mdoNets` +
  `tech._tlTurn` lưu trên trạm; nếu RAM trống thì dựng lại y nguyên N phiếu.
  Không dựng lại được thì **báo rõ**, không âm thầm in một phiếu gộp.
* **Không dead-end.** Hộp hỏi không đóng khi bấm ra nền; bấm Cancel thì có
  toast nhắc bấm lại PRINT & DONE.

Test canh: `tests/mdo-print.test.js`.

## 💾 THÔNG BÁO TRỘN — mất dữ liệu hay không? (v4.113)

Câu hỏi vận hành: nhân viên gõ dở tồn đầu hệ thống ở ô thông báo, chưa kịp ✅, thì bồn
lại trộn xong mẻ mới và đẩy thông báo lot mới vào — có mất số của lot cũ không?

| Dữ liệu | Nằm ở đâu | Có bị đè khi lot mới vào? |
|---|---|---|
| Thông báo C3/C4 gửi Check Booth | `/mix_notify/<TK>_<LOT>` | **Không** — khoá theo TỪNG LOT, đã vậy từ đầu. Chỉ mất khi bấm ✅ hoặc ✕ |
| Tồn đầu hệ thống gõ tay | `/stx_draft/<TK>_<LOT>` (**v4.113**) | **Không** — cũng khoá theo từng lot |
| Kết quả đối chiếu chính thức | 4 cột Tank Log (v4.111) | — nơi lưu chính thức |

**Trước v4.113 con số gõ tay CHỈ nằm trong RAM và chỉ MỘT ô cho mỗi bồn** ⇒ trộn mẻ mới
là mất, F5 là mất, người bấm ✅ ngồi máy khác thì không thấy. Nay nó được ghi tạm lên
`/stx_draft` (ghi gộp 700 ms để gõ từng chữ số không thành một lượt ghi), kèm **người gõ
và thời điểm** — dòng nguồn dưới ô nhập nói rõ cả hai.

**Bản nháp bị xoá ngay khi** kết quả đã lưu vào Tank Log (nút 💾 hoặc ✅ ở ô thông báo),
hoặc khi bấm ⟳ reload. Ghi Tank Log **thất bại** thì bản nháp được **giữ nguyên** — không
bắt gõ lại. Nháp quá **30 ngày** bị dọn lúc nạp (một thông báo trộn được trả lời trong vài
giờ; nháp cả tháng chỉ còn là rác).

Bảng thông báo chỉ có **4 ô**; từ thông báo thứ 5 trở đi vẫn nằm nguyên trên Firebase và
nay có dòng `+ N more mix notifications are waiting` bên dưới — trước đây nhìn vào tưởng
đã hết việc.

⚠ Nếu Firebase Security Rules của dự án liệt kê từng node thì nhớ **mở quyền ghi cho
`/stx_draft`**; ghi hỏng thì app toast cảnh báo và giữ số trong RAM chứ không im lặng.

Test canh: `tests/stx-recon-dom.smoke.js` mục **J**.

## 🚚 MULTI-DO: hai đường phát hiện chạy SONG SONG (v4.112)

Một xe chở nhiều DO có **hai** cách được nhận ra, và từ v4.112 cả hai đều dùng được
cùng lúc — sáng nhiều xe quá không kịp link thì trạm vẫn tự dò ra.

| Đường | Khi nào | Phần mềm hỏi gì |
|---|---|---|
| 🔗 **Link Orders** (Today Plan) | sale khai trước từ sáng | chỉ hỏi **in gộp hay in tách** |
| 🔍 **Dò tìm ở trạm** (lúc assign) | chưa kịp link | hỏi đủ: **bán gộp hay chỉ lấy DO này**, rồi **in gộp hay in tách** |

**Chọn "bán gộp" ở trạm thì Today Plan tự lập nhóm 🔗 MULTI-DO** (`TP.lnkLinkMdo`),
nên kế hoạch, thẻ PLAN và mọi tổng đều hiểu ngay đây là MỘT xe — không phải chờ ai
vào link lại bằng tay. Nhóm đã có sẵn thì chỉ cập nhật cách in, và **không bao giờ**
tự gỡ link người khác đã đặt.

### ⚠ Bốn cửa chặn IM LẶNG đã gỡ — gốc của lỗi "đã link mà vẫn chỉ hiện 1 đơn"

1. **Anh em đang xếp HÀNG ĐỢI bị tính là "đã cam kết"** ⇒ nhóm co lại còn một dòng ⇒
   assign lặng lẽ thành đơn lẻ. Nay xe chờ vẫn gộp được, và anh em được gộp thì bị dọn
   khỏi hàng đợi ngay sau khi trạm nhận.
2. **Phép dò tìm đòi trùng TÀI XẾ tuyệt đối** — kế hoạch thật hay bỏ trống ô tài xế ở
   dòng thứ hai. Nay biển số + ngày là bắt buộc, tài xế chỉ dùng để LOẠI khi hai tên
   khác hẳn nhau.
3. **Cửa chặn `tổng ≤ 27 MT`** nuốt luôn popup. Quá tải chính là lúc cần hỏi nhất —
   nay popup vẫn hiện, kèm dòng cảnh báo đỏ, và vẫn chọn được "chỉ lấy DO này".
4. **Nhóm còn nhưng hết anh em gộp được thì không nói gì.** Nay nêu đích danh lý do
   (đã done / đã huỷ / đang ở trạm khác). Thẻ trạm cũng hiện dòng nhắc
   `🔗 MULTI-DO — N more DO not on this load` khi sale link SAU lúc xe đã vào trạm.

### Phiếu PTT của xe gộp

`pttPrint` nay đọc `station._linkedRows`: ô **DO Info** liệt kê **từng DO kèm số của
nó** (hai cột, mỗi DO một dòng), tiêu đề có nhãn `COMBINED · N DO`, ô Loading Q'ty
ghi thêm `(total)`. Xe một DO giữ **nguyên** hình dạng phiếu cũ. Ô sửa tay
`#pttov-do` / `#pttov-doqty` vẫn còn nguyên.

### TL Data: cột `Multi-DO` (mdoG)

Một lượt xe gộp ghi thành **nhiều dòng TL** (mỗi DO một dòng) nhưng ngoài bãi chỉ có
**một** lượt xe. Mấy dòng đi chung một chuyến nay mang cùng một khoá
`MDO-<ddmmyy>-S<trạm>-T<turn>-<biển số>`. Cột **Trips** của báo cáo gộp theo khoá này
⇒ không còn đếm dư đúng bằng số DO phụ. Cột **không cho sửa tay**.

Test canh: `tests/mdo-station-detect.test.js` + `tests/mdo-print.test.js`.

## ⚖ ĐỐI CHIẾU CHUYỂN KHO — lưu lại thành dữ liệu (v4.111)

Bảng **📏 Stock-transfer reconciliation** (nút 📏 trên thẻ tank, tab Inventory) từ
v4.108 đã gợi ý được con số chuyển kho đúng. v4.111 biến nó từ *máy tính tạm* thành
*dữ liệu có thể tra cứu*, và đưa phần cần dùng hằng ngày ra ngay chỗ nhân viên cân
đang đứng.

* **Lot đang tính nằm cùng hàng với TK-3501 / TK-3502.** Ô nhập LOT hầu như luôn để
  trống vì lot được lấy tự động, nên trước đây nhìn bảng không biết mấy con số thuộc
  mẻ nào. Nay có chip `LOT LPG-2026-xxx` ngay cạnh tên bồn — gõ số trần "900" thì chip
  vẫn in **lot đầy đủ** đúng như Tank Log lưu.
* **Nút 💾 Save to Tank Log** ghi kết quả xuống **4 cột mới** của Tank Log (đơn vị **kg**):

  | Cột | Ý nghĩa |
  |---|---|
  | `[69]` Gap C3 | tồn đầu THỰC TẾ − tồn đầu HỆ THỐNG, phần C3 |
  | `[70]` Gap C4 | như trên, phần C4 |
  | `[71]` Adj ST C3 | số chuyển kho ĐÃ ĐIỀU CHỈNH = tồn cuối thực − tồn đầu hệ thống |
  | `[72]` Adj ST C4 | như trên, phần C4 |

  Ô trống nghĩa là **chưa ai đối chiếu lot đó**, không phải "lệch 0" — bảng in dấu `·`
  chứ không in số 0. Phần mềm không bao giờ tự điền; chỉ ghi khi có người bấm.
  `ROW_W` 69 → **73** (phải khớp ở cả `eng.js` lẫn `mixctrl.js`).
* **✅ ở ô thông báo Tank Mix cũng ghi.** Xác nhận đã chuyển kho trên WMS là đúng thời
  điểm chốt số, nên nút đó ghi 4 ô trên **trước**, rồi mới tick cờ ST. Thiếu tồn đầu hệ
  thống thì chỉ nhắc bằng toast — **không bao giờ chặn** việc tick ST.
* **Ô thông báo Tank Mix hiện đủ 4 dòng**: NOTIFIED (COQ) · SYSTEM OPENING (**sửa được
  tại chỗ**) · GAP AT OPENING · ADJUSTED TRANSFER. Nhân viên cân xử lý gọn ngay trong ô
  thông báo, chỉ mở bảng 📏 khi cần xem chi tiết.
* **Tồn đầu hệ thống chỉ có MỘT nguồn** (`INV._stxSys`, khoá theo bồn + lot): gõ ở ô
  thông báo đúng bằng gõ trong bảng đối chiếu, hai màn hình không thể nói khác nhau.
* **⚠ Bẫy đã vá sẵn:** `ENG.upsertRow` giữ lại 4 ô này khi MC/paste ghi đè dòng — y như
  cách nó giữ cờ ST từ v4.68. Không có nó thì mỗi lần *CALC + SAVE* lại một lot là xoá
  sạch kết quả đối chiếu.

Test canh: `tests/stx-recon-dom.smoke.js` (mục F–I).

## Chạy / xuất bản

Đây là web tĩnh, **không cần build**. Đẩy repo lên GitHub rồi bật **Settings → Pages**
(branch `main`, thư mục gốc). Đồng nghiệp dùng qua URL Pages. File `.nojekyll` đảm bảo
GitHub phục vụ file y nguyên. Chạy thử cục bộ: dùng **Live Server** (VS Code) — đừng mở
thẳng bằng `file://` vì sẽ chặn vài request.

## Cấu trúc

```
index.html        shell: nạp CDN + css + module theo thứ tự
vendor/           tabulator.min.js/.css (thư viện ngoài)
css/              core, plan, fleet, scale, cavern, report, engineer, inventory
js/core/          config · helpers · sync(SC) · auth ★
js/data/          tl · wg · ws · sp · ct · pp · bulkops
js/checks/        fcheck · wgcheck
js/features/      fleet · plan · scale · eng · rpt · inv · tkv · vlog · staff
                  · mixctrl · vmix · mixnotify · cav · scx2
js/integrations/  ptt-early · sync2 · notif
js/boot.js        khởi động đúng thứ tự
docs/             PLAN-TACH-MODULE.md · V4-54_MODULE-MAP.md
```

**Đã tách xong toàn bộ** (P1–P5 + boot): mọi file JS đã chứa code thật, `node --check`
33/33 PASS, smoke test headless PASS (xem [`docs/PROGRESS.md`](docs/PROGRESS.md)). Module dùng
kiểu **global** (IIFE gán biến như `WG`, `TP`, `SC`…) nên **thứ tự `<script>` trong
`index.html` rất quan trọng**: core → data → checks → features → integrations → boot.

## Phân quyền người dùng (whitelist)

Logic user/whitelist gom trong [`js/core/auth.js`](js/core/auth.js): `CURRENT_USER`,
`canWrite(area)`, đăng nhập Google, kiểm tra email theo `/users_whitelist`. **Khoá thật**
nằm ở **Firebase Security Rules** (phía server), không phải ở client — chi tiết & rules mẫu
trong `docs/PLAN-TACH-MODULE.md` §7. `apiKey` trong cấu hình Firebase là công khai theo
thiết kế, commit được.

## Kiểm thử nhanh (không cần trình duyệt)

```bash
npm i jsdom && node test/smoke.mjs
```
Kiểm: nạp đủ 33 script · không lỗi "X is not defined" · boot chạy hết · không module init lỗi.

## Trạng thái

✅ **Tách module HOÀN TẤT** (P1–P5 + boot). `node --check` 33/33 PASS · audit tham chiếu chéo PASS ·
smoke test headless PASS. Nhật ký chi tiết: [`docs/PROGRESS.md`](docs/PROGRESS.md).

**Còn lại:** (1) test 1 lượt trên trình duyệt (Live Server/Pages) cho chức năng & giao diện;
(2) bật whitelist thật — theo [`docs/P6-WHITELIST-SETUP.md`](docs/P6-WHITELIST-SETUP.md) rồi đổi
`AUTH_ENFORCE=true` trong `js/core/auth.js`.
