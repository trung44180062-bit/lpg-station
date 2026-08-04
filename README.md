# LPGT Cavern — Quản lý Công Ca (v4)

Ứng dụng web quản lý lịch ca, đăng ký / duyệt đơn và in biểu mẫu chấm công.
Chạy hoàn toàn phía trình duyệt (không cần server), đồng bộ qua Firebase Realtime Database.

---

## ⚠️ Trước khi upload lên GitHub — đọc phần này

| File | Có lên GitHub? | Vì sao |
|---|---|---|
| `index.html`, `css/`, `js/*.js` | ✅ Có | Chỉ là mã nguồn giao diện |
| `js/config.example.js` | ✅ Có | Chỉ chứa giá trị mẫu |
| **`js/config.js`** | ❌ **KHÔNG** | Chứa Firebase key, tên người duyệt, PIN — đã có trong `.gitignore` |
| File `.xlsx`, `.csv`, dữ liệu nhân sự | ❌ KHÔNG | Để **ngoài** folder này |
| `SPEC_*.md` (tài liệu nội bộ) | ❌ KHÔNG | Đã chặn trong `.gitignore` |

**Quy tắc vàng:** chỉ đặt vào folder `LPGT-CongCa-Web/` những gì thuộc về giao diện web.
Mọi dữ liệu công ty (bảng lương, danh sách nhân sự, file Excel) để ở thư mục cha, bên ngoài folder này.

Trước mỗi lần push, chạy nhanh:

```bash
git status          # js/config.js KHÔNG được xuất hiện trong danh sách
```

---

## Cấu trúc

```
LPGT-CongCa-Web/
├── index.html              # Khung HTML + nạp CSS/JS (không chứa logic)
├── css/
│   ├── app.css             # Giao diện chính: biến màu, layout, các tab
│   ├── portal.css          # Cổng đăng nhập + trang chính nhân viên
│   ├── print.css           # Module in đơn (A5 ngang / 2up A4 dọc)
│   └── ui.css              # v5: lớp thiết kế mới (nạp CUỐI, ghi đè 2 file trên)
├── js/
│   ├── config.example.js   # MẪU cấu hình — copy thành config.js
│   ├── config.js           # ❌ Cấu hình thật (gitignored)
│   ├── 01-core.js          # State toàn cục, mã ca, hàm tiện ích
│   ├── 02-storage.js       # localStorage + đồng bộ Firebase
│   ├── 03-nav.js           # Chuyển tab, bottom sheet
│   ├── 04-schedule.js      # Kỳ công 21→20 + bộ sinh lịch ca
│   ├── 05-roster.js        # Nhóm & danh sách nhân sự
│   ├── 06-calendar.js      # Lịch ca: matrix desktop, thẻ tuần/ngày mobile
│   ├── 07-manpower.js      # Nhân lực theo ngày
│   ├── 08-requests.js      # Đăng ký + Duyệt đơn
│   ├── 09-print.js         # Dựng biểu mẫu, in lẻ / hàng loạt, nhật ký in
│   ├── 10-account.js       # PBKDF2, tài khoản, phân quyền, cổng đăng nhập
│   ├── 11-stats-data.js    # Thống kê, khai báo giờ, export XLSX, cài đặt
│   ├── 13-portal.js        # Trang chính nhân viên (lịch tuần/tháng, sheet theo ngày)
│   ├── 14-i18n.js          # Song ngữ Việt/Anh — nạp NGAY SAU 01-core.js
│   ├── 00-icons.js         # v5: icon SVG thay emoji (nạp NGAY SAU 14-i18n.js)
│   ├── 15-report.js        # Tab Báo cáo: Nhân lực · Thống kê · Biểu đồ (SVG thuần)
│   ├── 16-otlog-data.js    # Nhật ký tăng ca lấy từ file Excel của công ty
│   ├── 17-appr-sum.js      # Sub-tab Tổng quan trong tab Duyệt (bảng cho giám đốc)
│   └── 12-main.js          # Boot — luôn nạp CUỐI CÙNG
├── BAO-MAT.md              # Đánh giá bảo mật + việc cần làm
├── firebase-rules.json     # Luật truy cập, dán vào Firebase Console
├── mau-in-A5-xem-thu.html  # Xem thử 6 biểu mẫu in trên khung giấy A5
├── xem-thu-giao-dien.html  # Xem thử màn Duyệt & Báo cáo với dữ liệu mẫu
├── xem-thu-tong-quan-duyet.html # Xem thử sub-tab Tổng quan (dữ liệu giả)
├── .gitignore
└── README.md
```

**Thứ tự nạp script rất quan trọng** — các file dùng biến toàn cục dùng chung, không phải ES module.
`12-main.js` phải nằm cuối vì nó gọi hàm của mọi file khác.
Khi thêm file mới, chèn thẻ `<script>` vào trước `12-main.js`.

### Giao diện v5 (2026-07-31) — icon SVG + lớp `ui.css`

- **`js/00-icons.js`**: template và i18n vẫn viết emoji như cũ; script này quét DOM
  (MutationObserver, giống cơ chế i18n) và thay emoji đã khai trong `IC_MAP` bằng
  icon SVG nét mảnh kiểu Lucide (`.ici`, màu theo `currentColor`). `#printRoot`,
  `data-noic`, script/style/input/svg luôn được bỏ qua — biểu mẫu in giữ nguyên.
  Thêm emoji mới → khai thêm vào `IC_MAP` (+ `IC_SVG` nếu cần icon mới).
- **`css/ui.css`**: lớp ghi đè thiết kế (token màu, nút, thẻ, bottom nav, chip lọc,
  ô số liệu đồng bộ, `details.xp` cho đoạn giải thích gập). Nạp SAU app/portal/print.
- Màn Duyệt: bộ lọc nâng cao gập vào nút "⚙ Bộ lọc khác" (`apprAdvOpen`, 08-requests.js).

---

## Đăng nhập & phân quyền

**Tài khoản = phần số của mã nhân viên.** Khi quản lý thêm một người vào tab *Nhóm & Lịch*
và điền mã NV + họ tên, app tự tạo tài khoản. Không cần cấp tay.

- Mã NV trong dữ liệu giữ nguyên (vd `vc44180062`) — bảng danh sách, biểu mẫu in, file Excel không đổi.
- **Màn hình đăng nhập chỉ dùng phần số**: tên đăng nhập `44180062`, mật khẩu ban đầu cũng `44180062`.
  Hàm `loginKey()` trong `10-account.js` lo việc này; bàn phím điện thoại nhờ vậy bật sẵn chế độ số.
- Vẫn chấp nhận gõ cả mã đầy đủ `vc44180062` để không ai bị kẹt.
- Dòng chưa điền họ tên thì chưa được cấp tài khoản.
- Nếu hai người trùng phần số, app báo lỗi thay vì cho vào nhầm — quản lý phải sửa mã cho khác nhau.
- Đổi mã NV → tài khoản cũ bị thu hồi, tài khoản mới cấp lại với mật khẩu = mã số mới; đơn cũ và lịch ca tự trỏ sang mã mới.
- Xoá nhân viên → thu hồi tài khoản.
- Nhân viên vào mục **Tài khoản** (biểu tượng 🔑 ở trang chính) để đổi mật khẩu.

### Phân quyền

Xem chi tiết ở mục **Phân quyền & ngôn ngữ** phía dưới. Tóm tắt: quyền khai ở bảng
*👤 Tài khoản đăng nhập và phân quyền* (tab ⚙️ Dữ liệu), lưu ở `e.perm` —
`staff` · `sec` (Thư ký) · `appr` · `admin` · `kmgr`.

---

## Trang chính của nhân viên (`13-portal.js`)

Là màn hình đầu tiên ngay sau khi đăng nhập. Bố cục tối ưu cho điện thoại: mở app lên
là **thấy ngay lịch cả tháng**, các thẻ số liệu đẩy xuống dưới lịch.

- **Lịch cá nhân** mặc định xem **Tháng** (đổi được sang Tuần), lấy ca từ *lịch thực tế*
  (`eff()` = lịch chuẩn + điều chỉnh đã duyệt).
- Chế độ Tháng chạy theo **kỳ công của công ty: 21 tháng trước → 20 tháng này**
  (dùng `daysOfPeriod`/`periodFor`), không phải tháng dương lịch. Nút ◀ ▶ nhảy theo kỳ,
  các ngày thuộc tháng đầu kỳ (≥21) có nền nhạt + viền đứt, ngày mùng 1 hiện thêm số tháng.
- **Chạm vào ngày bất kỳ** → sheet hiện ca hôm đó, **nhân sự trong ngày xếp thành cột theo NHÓM CA THỰC TẾ**
  — ai đổi ca đã nằm sẵn ở nhóm mình thật sự đi làm hôm đó; chip viền cam có badge `⇄X` ghi ca chuẩn cũ.
  Nhãn nhóm `Office` viết gọn thành `O` (`teamShort()`). Các cột: O · D · N · OT ·
  **R nghỉ ca** · **AL nghỉ phép** — tên rút gọn 2 chữ kèm nhãn nhóm, ô của mình tô đậm.
  Bên dưới là đơn đang có và 7 nút gửi đơn (nghỉ phép · đổi ca · tăng ca · đổi mã ca · bổ sung công ·
  đi trễ/về sớm · làm liên tục nhiều ngày) — ngày đã điền sẵn.
- **Mỗi ngày 1 dòng** (đúng quy định biểu mẫu công ty): form đơn là một **danh sách dòng**,
  mỗi dòng chọn **1 ngày** + mã ca (hoặc giờ vào/ra) riêng, bấm **＋ Thêm ngày** để khai
  nhiều ngày rời rạc trong cùng một đơn (tối đa `DS_MAX_ROWS` = 10 dòng — bằng số dòng của
  biểu mẫu in). Lưu ở `r.days=[{iso,code,timeIn,timeOut}]`; `r.from`/`r.to` là ngày đầu/cuối
  để tương thích đơn cũ. Riêng **Làm liên tục nhiều ngày** vẫn chọn theo **khoảng ngày**.
- **Đổi ca chỉ giữa hai người đang có ca thật**: `SWAPPABLE()` chỉ nhận mã ca thuộc nhóm
  *work* / *rest* / *swap* — tức **O · D · N · R** (và mã tự khai cùng loại). Người đang
  **nghỉ phép** (AL8/AL4/NP/OFF) hoặc đang **tăng ca** (OTD/OTN/X) thì không đổi ca được:
  nghỉ phép rồi thì lấy ca đâu ra mà đổi. Kiểm ở ba chỗ — danh sách chọn người (xám, bấm
  không được, có ghi lý do), cảnh báo trực tiếp trong form, và chặn hẳn lúc bấm gửi
  (`swapBlockReason` / `swapBlockList`). Đơn nhiều ngày thì kiểm **từng ngày** cho cả hai người.
- **Đổi ca**: ô **tìm theo tên** (gõ không dấu vẫn khớp, `noAccent()`), người **đang nghỉ (R)**
  ngày đó được xếp lên đầu. Có ô **Người đứng đơn** để **khai hộ** đồng nghiệp — đơn ghi
  `r.byId` (người bấm gửi) khác `r.empId` (người đứng đơn); khi in, mỗi ngày sinh **2 dòng**
  cho cả hai người để thấy rõ việc đổi qua đổi lại.
- **Cảnh báo trùng đơn / trùng ngày / vượt phép năm** trước khi gửi; **thông báo** khi đơn được duyệt / từ chối.
- Cảnh báo khi làm ≥ 7 ngày liên tục.
- **Thẻ số liệu**: giờ công kỳ này · tăng ca đã duyệt + đang chờ · phép năm còn lại · số đơn đang chờ.
- **Phép năm sửa được**: phần mềm đưa vào dùng giữa năm nên nhân viên tự khai **số phép còn lại**
  tại một mốc ngày trong bảng *🏖 Phép năm* (`e.alLeftBase` + `e.alLeftAt`); từ mốc đó hệ thống
  trừ dần các ngày AL. Chưa khai mốc thì vẫn tính theo quỹ `AL_QUOTA_DEFAULT`.

Tham số chỉnh nhanh ở đầu `js/13-portal.js`:
`AL_QUOTA_DEFAULT` (quỹ phép năm), `STREAK_WARN` (ngưỡng cảnh báo ngày làm liên tục),
`DS_MAX_ROWS` (số dòng tối đa mỗi đơn), `CREW_ORDER` (thứ tự nhóm ca trong sheet ngày).

> Tab **📝 Đăng ký** đã bỏ (07/2026) — mọi việc gửi đơn gom về trang chính; quản lý muốn
> nhập hộ thì dùng chính năng **khai hộ** trong đơn đổi ca.

---

## Tab Báo cáo (gộp Nhân lực + Thống kê) — `js/15-report.js`

Trước đây là hai tab riêng và tab **Nhân lực bị lỗi trắng trang**: trong `renderMp()` cũ có
`const f=$('mpFrom').value, t=$('mpTo').value` — biến `t` che mất hàm dịch `t()`, gọi
`t('Hôm nay')` là ném lỗi ngay. Bản mới không dùng biến tên `t` nữa.

Một tab **📊 Báo cáo** với 3 chế độ chọn bằng nút gạt:

| Chế độ | Nội dung |
|---|---|
| 👥 Nhân lực | Biểu đồ cột chồng D/N/O/R theo ngày + đường định mức tối thiểu, rồi danh sách theo ngày (bấm mở tên) |
| 📊 Thống kê | 4 thẻ tổng + bảng số liệu cả tổ, nút Xuất Excel |
| 📈 Biểu đồ | Giờ công theo người · Cơ cấu ca (vành khuyên) · Giờ tăng ca theo nhóm |

Biểu đồ giờ công là **một thanh nối tiếp cho mỗi người** (`chartStackedH`): giờ công · giờ tăng ca ·
giờ phép xếp liền nhau trong cùng thanh, tổng ghi ở cuối — gọn hơn nhiều so với tách ba thanh.
Hai biểu đồ *Nhân lực theo ngày* đã bỏ vì trùng thông tin với bảng nhân lực.

**Phân quyền xem** (`repSeeAll()` = `mgr`):

- **Quản trị · Quản lý người Hàn · Duyệt đơn** → xem toàn bộ nhân sự.
- **Nhân viên thường** → chỉ thấy *📊 Số liệu của tôi* và *📈 Biểu đồ của tôi*; chế độ
  Nhân lực bị ẩn hẳn và tên người khác không xuất hiện ở đâu.

Biểu đồ vẽ bằng **SVG thuần** (`chartStacked` / `chartGroupedH` / `chartDonut`) — không
thêm thư viện ngoài, nên mở offline vẫn chạy và in ra giấy vẫn nét. Tooltip dịch ngay lúc
dựng chuỗi vì bộ quét DOM không khớp được chuỗi có chèn số.

---

## Đơn huỷ — xoá hẳn, không lưu

Huỷ đơn giờ **xoá hẳn** khỏi hệ thống, không giữ bản ghi *đã huỷ*: mỗi đơn nằm lại là thêm dữ
liệu phải đồng bộ, mà gói **Firebase Spark tính băng thông**. Nếu đơn đã duyệt thì
`revertReqSchedule()` gỡ đúng những ô lịch do nó tạo ra trước khi xoá (đổi ca hoàn tác cho cả
hai người). Trạng thái chỉ còn: `pending` · `approved` · `rejected`.

---

## Tab Duyệt — danh sách gọn

Bản cũ mỗi đơn là một thẻ to kèm 5 nút nên rất rối. Bản mới:

- **Một đơn = một dòng**: ô tích · biểu tượng loại đơn · tên · loại · trạng thái · nút ✓ ✕.
  Bấm vào dòng mới bung chi tiết từng ngày, thông tin gửi/duyệt/huỷ và các nút phụ
  (In · Huỷ đơn · Xoá hẳn).
- **Hai hàng chip lọc có số đếm**: trạng thái (Chờ duyệt · Đã duyệt · Từ chối · Tất cả) và
  tình trạng in (Mọi đơn · ○ Chưa in · 🖨️ Đã in). Số đếm tính theo các bộ lọc còn lại nên luôn khớp.
- **Lọc theo thời gian**: chọn kỳ công, hoặc *Khoảng ngày tự chọn…* rồi điền Từ / Đến.
- **🗑️ Dọn dữ liệu đang lọc** (quản trị): xoá hẳn mọi đơn đang khớp bộ lọc — dùng để dọn dữ
  liệu cũ theo kỳ hoặc theo khoảng ngày, giữ dung lượng Firebase ở mức thấp. Hộp xác nhận nói rõ
  khoảng ngày, số đơn còn chờ duyệt và cảnh báo hoàn tác lịch.
- Mỗi dòng có chip **đã in / chưa in**, chi tiết bung ra ghi cả thời điểm in và số lần in.
- **Thanh thao tác hàng loạt** chỉ hiện khi có đơn được chọn, dính trên đầu màn hình:
  Duyệt · Từ chối · In · Xoá đơn · Chọn hết · Bỏ chọn. `decide(id,ok,bulk)` nhận cờ
  `bulk` để không lưu và vẽ lại sau từng đơn.

---

## Tab Duyệt — sub-tab Tổng quan (`js/17-appr-sum.js`)

Tab Duyệt chia **2 sub-tab** (`apprTab`, nhớ ở localStorage): **📋 Danh sách đơn** (mặc định,
có badge số đơn chờ) và **📊 Tổng quan** — bảng cho giám đốc nhà máy, chỉ hiện với người có quyền duyệt.

Sub-tab Tổng quan có **kỳ công riêng** (`asYm`), **mặc định luôn là kỳ hiện tại**, không dính
vào bộ lọc của danh sách đơn. Header có nút ◀ ▶ nhảy kỳ + dropdown + nút *Về kỳ hiện tại*.

Bốn khối:

1. **6 thẻ chỉ số** — tổng đơn (kèm số dòng ngày đã khai) · đang chờ duyệt (kèm số đơn đã quá
   ngày làm) · **tổng giờ đã duyệt** · giờ tăng ca đã duyệt (kèm cờ vượt trần) · ngày phép ·
   duyệt rồi chưa in. Cố tình **không** có "tỉ lệ duyệt": cái cần điều hành là khối lượng giờ,
   không phải tỉ lệ gật/lắc của chính người đang xem.
2. **Dải tồn đọng & rủi ro** — chip chỉ hiện khi số > 0: ⌛ chờ quá 3 ngày · 🚩 quá ngày làm
   · 🖨️ duyệt rồi chưa in · 🔄 đổi ca chờ xác nhận · ✋ đổi ca bị từ chối · 👥 khai hộ.
   Cờ lưu ở `apprFilter.flag`; `apprMatch()` (08-requests.js) gọi ngược `asFlagMatch()`.
3. **Tổng hợp theo loại đơn** — mỗi loại một thẻ: số đơn (to) · tổng giờ đã duyệt · thanh so
   sánh giữa các loại · dòng chân ghi số ngày và phần đang chờ.
4. **Chi tiết theo loại đơn và trạng thái** — ma trận Loại × (Chờ · Duyệt · Từ chối) kèm
   **Tổng đơn · Số ngày · Giờ đã duyệt · Giờ đang chờ** và thanh so sánh giờ.
5. **Bảng theo nhân viên** — sắp xếp được theo tên/đơn/chờ/tổng giờ/ngày phép/giờ OT, mặc định
   top 8; ai **vượt trần** (`S.settings.otLimit`, mặc định 40h/kỳ, khai ở tab Dữ liệu) thì đỏ + 🚨.

Mọi con số bấm được → `asApply()` đặt lại bộ lọc danh sách (kể cả **kỳ công** đang xem cho khớp
tuyệt đối) rồi chuyển sang sub-tab Danh sách đơn; thanh lọc hiện dòng `.ab-flag` nói rõ đang xem
riêng nhóm nào kèm nút gỡ.

Giờ tính qua **`reqHours()`** cho MỌI loại đơn (`reqDayHours()`: ưu tiên `d.hours` nhân viên khai
→ suy từ mốc giờ `otHours()` → giờ mặc định của mã ca), nên tăng ca 14:00–19:30 ra đúng 5.5h chứ
không phải 12h. Ngày phép qua `reqLeaveDays()` (AL4 = nửa ngày).

Xem thử bố cục bằng dữ liệu giả: mở `xem-thu-tong-quan-duyet.html`.

---

## Tab Lịch — dồn về một hàng

Toàn bộ điều khiển nằm trên **một hàng duy nhất**: ◀ kỳ ▶ · Chuẩn/Thực tế · phạm vi ngày ·
nhóm · "Chỉ ô khác chuẩn" · **❔ Chú giải** (mở sheet, không còn chiếm chỗ cố định).
Đã bỏ khối tiêu đề *"Cavern Process · LỊCH CHUẨN (tham chiếu)"*, dải chú giải inline và
đoạn hướng dẫn dài phía dưới — phần trống nhường hết cho bảng lịch
(`.mtx-scroll` cao thêm ~50px).

Mở `xem-thu-giao-dien.html` bằng trình duyệt để xem thử ba màn hình này với dữ liệu mẫu.

---

## Phân quyền & ngôn ngữ

Quyền khai ở cột **Quyền** trong tab 🛠️ Nhóm & Lịch, lưu ở `e.perm`:

| Giá trị | Nhãn | Làm được gì |
|---|---|---|
| `staff` | Nhân viên | Xem lịch của mình, gửi đơn |
| `appr` | Duyệt đơn | Thêm: duyệt/từ chối đơn, sửa lịch thực tế, in đơn |
| `admin` | Quản trị | Thêm: Nhóm & Lịch, Dữ liệu, cấp/reset mật khẩu |
| `sec` | **Thư ký** | Xem hết lịch & báo cáo, in đơn, khai hộ đơn — **không** duyệt, **không** sửa cấu hình |
| `kmgr` | **Quản lý người Hàn (EN)** | Quyền y hệt `admin`, khác duy nhất: **đăng nhập vào là giao diện tiếng Anh** |

Cờ toàn cục: `adm` (admin/kmgr) · `mgr` (appr/admin/kmgr) · `secr` (sec + mgr — được xem số liệu cả tổ)
· `noSelf` (**sec / kmgr / ai đặt `shiftType='none'`** — không thuộc đối tượng chấm công).

**Người không nằm trong lịch ca** (thư ký, quản lý cấp trên) đặt **Kiểu ca = Không xếp lịch**
(`shiftType='none'`): vẫn có tài khoản và thao tác phần mềm, nhưng `schedEmps()` loại họ khỏi
bảng lịch, định mức nhân lực, thống kê và biểu đồ.

### Bỏ Trang chính với người không chấm công (`noSelf`)

Thư ký (`sec`) và quản lý người Hàn (`kmgr`) không có ca nên **Trang chính cá nhân bị bỏ hẳn**:

- `homeView()` (01-core) trả `'real'` thay vì `'me'` → đăng nhập xong vào thẳng **Lịch · Thực tế**;
  dùng ở `doLogin` và lúc boot (12-main).
- `go('me')` tự chuyển hướng sang `go('real')`; `renderMe()` thoát sớm và xoá rỗng `#meBody`.
- `applyRoleUI()` xử lý thêm hai class: **`.self-only`** (Trang chính, Gửi đơn, Tăng ca của tôi,
  Đơn của tôi) ẩn khi `noSelf`; **`.noself-only`** (nút 🔑 Tài khoản và ↪ Đăng xuất trên header)
  chỉ hiện khi `noSelf`, vì hai nút này vốn nằm trong Trang chính.
- Sheet "Tăng ca / Đơn của tôi / Phép năm / Tài khoản" chỉ còn tab **Tài khoản**.

### Chọn kỳ công bằng dropdown (Nhật ký tăng ca)

Danh sách kỳ trước đây trải thành một rừng chip. Nay gói trong `.dd` (`#otlogDD`):
nút xổ xuống hiện kỳ mới nhất đang chọn + `+N`, panel có **ô gõ để tìm kỳ**
(`otlogPerFilter`), danh sách tích chọn nhiều kỳ, và hai nút *Chỉ kỳ hiện tại* /
*Tải toàn bộ* ở chân panel. Tích chọn gọi `otlogRefresh()` — chỉ vẽ lại nhãn nút,
danh sách và bảng nên **panel không bị đóng**. Bấm ra ngoài mới đóng; bộ nghe click
bỏ qua phần tử đã rời DOM (`isConnected===false`), nếu không dropdown tự đóng ngay
khi vừa tích.

### Màu trong bảng Thống kê

`stCnt(code,n)` tô ô đếm mã ca bằng đúng nền pastel của bảng lịch (`SCHEDBG`/`SCHEDTXT`),
số **0 thì làm mờ** (`td.z`) để mắt chỉ nhìn số có ý nghĩa. Ba cột giờ mỗi cột một tông:
`hl` xanh lá (giờ công) · `hl-ot` cam (tăng ca) · `hl-lv` xanh dương (phép), tiêu đề cột
cùng tông. Cột Nhóm là chip màu `teamChip()` (băm tên nhóm → màu cố định). Dưới bảng có
dải **Chú giải màu**.

### In đơn ngay trên tab Lịch

Nút **🖨️ In đơn** (`#calPrintBtn`, badge `#printBdgCal`) nằm cuối thanh `.cal-bar` — mọi quyền
đều bấm được để chủ động in, không phải vòng qua menu ☰ Thêm hay tab Duyệt. Vẫn mang class
`pc-only` nên điện thoại không thấy. `refreshPrintBadge()` cập nhật cả ba badge
(`printBdgSheet` / `printBdgAppr` / `printBdgCal`).

Toàn bộ việc quản lý người dùng — mã NV, họ tên, nhóm, kiểu ca, **quyền**, **mật khẩu**,
thêm/xoá người — nay gom về **một bảng duy nhất**: *👤 Tài khoản đăng nhập và phân quyền*
trong tab ⚙️ Dữ liệu. Tab *Nhóm & Lịch* chỉ còn lo xếp ca.

`ROOT_ADMIN` (Hoàng Trung, `vc44180062`) luôn là quản trị, không ai hạ quyền được, và là
người đặt lại mật khẩu / thêm / xoá người.

### Mật khẩu — xem `BAO-MAT.md`

- Chưa đặt mật khẩu riêng → **không lưu chuỗi băm nào**, chỉ ghi cờ `{init:true}`; mật khẩu tạm
  thời là chính mã số.
- Đã đặt → **PBKDF2-SHA256 150 000 vòng, muối ngẫu nhiên 16 byte riêng từng người** (WebCrypto).
- Bản băm `sha256` cũ vẫn đăng nhập được và **tự nâng cấp** sang PBKDF2 ngay lần đăng nhập kế tiếp.
- Mật khẩu tối thiểu 6 ký tự, chặn trùng mã NV và các chuỗi dễ đoán.
- **Không xem lại được mật khẩu** (băm một chiều) — chỉ *Đặt lại* hoặc *Về mặc định*.
- Nhớ dán `firebase-rules.json` vào Firebase Console; đó mới là hàng rào thật.

### Khai tăng ca linh động

Đơn tăng ca không còn chỉ chọn một mã ca cứng. Mỗi dòng khai được **mốc bắt đầu → mốc kết thúc**:

| Mẫu | Giờ | Mã lưu |
|---|---|---|
| Nghỉ trưa | 12:00–13:00 | `OTL` |
| Sau giờ HC | 18:00–20:00 | `OT2` |
| Sau giờ HC | 17:00–20:00 | `OT3` |
| Ca ngày | 08:00–20:00 | `OTD` |
| Ca đêm (qua đêm) | 20:00–08:00 | `OTN` |
| Tự điền giờ | người khai nhập | `OTD` |

- Chọn mẫu → `dsSetPreset()` tự điền giờ; mẫu ca đêm tự đặt *Đến ngày* = hôm sau.
- **Một ngày có thể tăng ca nhiều lần** — VD ngày 13 có 12:00–13:00 và 18:00–20:00 là hai dòng.
  Nên nút *Thêm lần tăng ca* **giữ nguyên ngày** (khác nghỉ phép: nhảy sang ngày kế tiếp),
  `dsSubmit()` **không gộp** các dòng trùng ngày, và form không cảnh báo "trùng ngày".
  Khi duyệt, `decide()` **cộng giờ các lần trong cùng ngày** rồi ghi vào ô lịch một lần
  (mã ca lấy theo lần dài nhất cho dễ nhìn).
- **Tăng ca vắt qua nửa đêm**: điền *Đến ngày*; để trống nghĩa là trong cùng ngày. Nếu giờ ra ≤ giờ vào
  mà bỏ trống ngày kết thúc thì `otHours()` tự hiểu là qua nửa đêm.
- Số giờ tính từ hai mốc thật (`otHours`) và lưu ở `d.hours`, không lấy số giờ cứng của mã ca —
  nên OT 14:00→19:30 ra đúng **5,5h**. Khi duyệt, số giờ thật được ghi kèm vào ô lịch
  (`S.over[id][iso].hours`) và **`effHours()`** ưu tiên số này; `calcStats`, `otSummary`,
  bảng *Tăng ca của tôi* và biểu mẫu in đều dùng nó, nên thống kê khớp đúng với giờ đã khai.
- Mã **X (tăng ca nhập tàu)** đã **bỏ khỏi danh sách chọn**, nhưng vẫn giữ trong bảng mã ca
  (`legacy:true`) để những ô lịch cũ đang dùng X vẫn hiện đúng tên và đúng số giờ.

### Màu mã ca trong bảng lịch

Trước đây mã phép / tăng ca dùng **chữ trắng trên nền đậm**, mà cột "hôm nay" có nền vàng nhạt
kèm `!important` ghi đè nền → chữ trắng trên vàng nhạt, không đọc được (đúng lỗi AL8 khó nhìn).
Nay mọi mã đều **nền pastel + chữ tối đậm** (`SCHEDBG` / `SCHEDTXT` trong `06-calendar.js`),
đọc được trong mọi trường hợp.

### Kiểu ca

| Giá trị | Nghĩa |
|---|---|
| `type1` | Ca 8 ngày — O O D D N N R R |
| `type2` | Ca 6 ngày — D D N N R R |
| `admin` | Hành chính T2–T6 (nghỉ T7, CN) |
| `office6` | **Hành chính T2–T7** — chỉ nghỉ CN, operator mới nhận việc đi ca này để học việc |
| `none` | Không xếp lịch |

**Người vào làm giữa kỳ**: điền *Ngày vào làm* (`e.joinAt`) ở dòng của họ trong tab Nhóm & Lịch,
rồi bấm **🆕 Lịch cho người mới vào giữa kỳ**. `genForEmp()` tự cắt bỏ các ngày trước `joinAt`,
và `fillScheduleForOne()` chỉ điền cho riêng người đó, không đụng lịch người khác.

### Giao diện Việt / Anh (`js/14-i18n.js`)

- Mã nguồn vẫn viết **tiếng Việt** như cũ — không phải sửa template khi thêm màn hình mới.
- Khi `LANG==='en'`, hàm `i18nApply()` **quét DOM** và thay các nút văn bản khớp **chính xác**
  với khoá trong từ điển `I18N_EN` (≈580 khoá) sau khi chuẩn hoá (gộp khoảng trắng, `&amp;`→`&`).
  Không khớp thì thử `I18N_RE` (quy tắc có chèn số/tên), rồi ghép `MÃ — nhãn`, rồi phần đuôi là ngày/giờ.
- `MutationObserver` gọi lại sau mỗi lần giao diện vẽ lại, nên màn hình mới tự được dịch.
- **`#printRoot` và mọi phần tử `data-noi18n` luôn bị bỏ qua** — biểu mẫu in là giấy tờ chính thức,
  giữ nguyên song ngữ Việt/Anh như bản gốc Hyosung.
- Chuỗi ngoài DOM (`confirm`, `prompt`, chuỗi ghép động) bọc bằng `t('…')`.
  Trong hàm đã có biến cục bộ tên `t` (loại đơn) thì dùng bí danh `t2('…')`.
- Nút **EN / VI** trên thanh tiêu đề cho ai cũng tự đổi được; lựa chọn lưu theo từng mã NV
  (`localStorage`), ưu tiên hơn mặc định theo quyền. Chuyển EN → VI thì tải lại trang
  (tiếng Việt là bản gốc, chữ đã dịch không quay ngược được).
- Thứ trong tuần, định dạng ngày giờ và nhãn kỳ công (`Kỳ T7/2026` ↔ `Period M7/2026`)
  đổi theo `isEN()`.

- **Nhãn có tiền tố biểu tượng tự dịch** (2026-07-30): `i18nLookup()` cắt phần đầu không phải
  chữ/số ra, dịch phần chữ rồi ghép lại — `🗂 Nhật ký tăng ca`, `✓ 📊 Giờ công theo người`
  chỉ cần khoá `Nhật ký tăng ca` / `Giờ công theo người`. Trước đây phải khai riêng từng
  khoá kèm emoji nên rất hay sót chữ Việt trong bản EN.

**Thêm chuỗi mới**: mở `js/14-i18n.js`, thêm một dòng `'chuỗi tiếng Việt':'English string',`
vào đúng nhóm. Khoá phải khớp đúng đoạn văn bản hiển thị (một nút văn bản, không kèm thẻ HTML).

**Rà chữ Việt còn sót**: chạy đoạn Node dưới đây — nó nạp từ điển rồi soi mọi đoạn văn bản
trong `js/*.js` và `index.html` mà `i18nLookup()` trả `null` (bỏ qua `09-print.js` vì biểu
mẫu in cố ý song ngữ):

```bash
node -e "const fs=require('fs'),vm=require('vm');
const ctx=vm.createContext({LS:'x',console,localStorage:{getItem:()=>null},document:{documentElement:{setAttribute(){}}}});
vm.runInContext('var \$=function(){return null};',ctx);
vm.runInContext(fs.readFileSync('js/14-i18n.js','utf8'),ctx);vm.runInContext('LANG=\"en\"',ctx);
const VI=/[ăâđêôơưáàảãạéèẻẽẹíìóòọúùýỳ]/;
for(const f of fs.readdirSync('js').filter(f=>/^[01]/.test(f)&&f.endsWith('.js')&&!/14-i18n|16-otlog|09-print/.test(f))){
  const s=fs.readFileSync('js/'+f,'utf8').replace(/\/\*[\s\S]*?\*\//g,' ');
  for(const m of s.matchAll(/>([^<>{}\`\$]{2,80})</g)){const v=m[1].replace(/\s+/g,' ').trim();
    if(v&&VI.test(v)&&ctx.i18nLookup(ctx.i18nKey(v))==null)console.log(f,'|',v);}}"
```

---

## Huỷ / xoá đơn

Thêm trạng thái thứ tư: `cancelled` (**ĐÃ HUỶ**), bên cạnh `pending` / `approved` / `rejected`.

- **Huỷ đơn đã duyệt thì lịch tự hoàn tác.** Khi duyệt, mỗi ô lịch ghi kèm `reqId`;
  `revertReqSchedule(rid)` gỡ đúng những ô mang mã đơn đó → lịch trả về ca chuẩn.
  Đơn đổi ca hoàn tác cho **cả hai người**.
- **Không xoá hẳn theo mặc định** — đơn chuyển sang `cancelled`, vẫn nằm trong *Lịch sử*
  kèm `cancelledAt` / `cancelledBy` / `cancelReason` để còn tra lại.
- **Quản trị xoá hẳn** bằng `purgeReq()` (nút 🗑️ Xoá hẳn, có `admin-only`), cũng hoàn tác lịch trước khi xoá.
- **Xoá nhiều người một lúc**: màn *Duyệt* có ô tích trên từng đơn (`.rqChk`) +
  các nút *Chọn tất cả · Bỏ chọn · Huỷ đơn đã chọn · Xoá hẳn đã chọn*. Hộp xác nhận
  nói rõ có bao nhiêu đơn đã duyệt (sẽ hoàn tác lịch) và bao nhiêu đơn **đã in nộp nhân sự**.
- **Nhân viên tự huỷ đơn của mình**, kể cả đơn đã duyệt — trừ đơn đã in (`r.printedAt`)
  thì phải nhờ quản lý, xem `canCancelReq(r,who)`.
- Đơn đã huỷ không tính vào cảnh báo trùng đơn, không vào hàng chờ in, và hiện mờ
  (`.req.dead`) trong danh sách.

---

## Biểu mẫu in — bám theo file gốc của công ty

Nguồn: `2023_HSVC - Timekeeping Form (New) VBA`. Sáu sheet biểu mẫu (`Leave`, `Overtime`,
`Change shift`, `WT Confirmation`, `Leave Early`, `Work multiple days`) đều dùng **cùng một
khuôn**, và `js/09-print.js` dựng lại đúng khuôn đó:

| Thông số | Giá trị lấy từ Excel |
|---|---|
| Khổ giấy | **A5 ngang** (paperSize 11, landscape) — 210 × 148 mm |
| Lề | 0.1 inch ≈ 2,5 mm |
| Font | Times New Roman |
| Tiêu đề | 16pt đậm (VN) + 16pt đậm nghiêng (EN), canh giữa |
| Bảng | 11pt, viền `thin`, **10 dòng dữ liệu** (STT 1→10 kể cả dòng trống) |
| Chú giải | 8pt — loại phép (Leave, Leave Early) / loại ca (Change shift) |
| Chữ ký | 3 ô có viền xếp chồng: nhãn → chỗ ký trống → *Ghi rõ họ tên* |

Điểm quan trọng: cột thời gian **tách riêng Giờ và Ngày** (`Từ: Giờ | Ngày`, `Đến: Giờ | Ngày`),
không gộp một ô như bản cũ. Độ rộng cột trong `W_LEAVE`, `W_OT`, `W_SHIFT`, `W_WT`,
`W_LATE`, `W_MULTI` lấy nguyên độ rộng cột của Excel rồi quy ra phần trăm.

- Đơn *Bổ sung công* có ô **Lý do** gộp 10 dòng, in danh sách ☐/☑ đúng như bản gốc,
  và khối chữ ký có thêm cột **Xác nhận bởi Người bảo lãnh**.

### Lý do in trên đơn — mặc định tiếng Anh

Người ký cuối là **Trưởng Bộ Phận người Hàn**, nên mọi lý do do phần mềm tự điền đều
viết bằng tiếng Anh. Nếu nhân viên có tự ghi lý do thì **lấy đúng chữ của nhân viên**,
thay cho lý do mặc định (`printReason()` trong `js/09-print.js`).

| Loại đơn | Lý do phần mềm tự điền |
|---|---|
| Nghỉ phép · Đổi mã ca · Đi trễ/Về sớm · Đổi ca (người đứng đơn) | `Personal matter` |
| Tăng ca · Làm liên tục nhiều ngày | `Operational requirement` |
| Đổi ca — **người nhận ca giúp** | `Cover for <tên người nhờ>` |

Cách này bám theo chính bản Excel gốc: người xin đổi ghi *Personal matter*, người nhận ca
ghi *Cover Mr. …*. Loại đơn Đi trễ/Về sớm cũng in `Come late` / `Leave early`.

**Mã loại phép** quy đổi theo chú giải in trên biểu mẫu (`printLeaveCode()`):
`AL8` và `AL4` → **AL**, `NP` → **NPL**, `OFF` → **COM**. Nửa ngày vẫn phân biệt được
vì cột *Tổng ngày* ghi `0.5`.

### Logo

Logo nhúng trong `LOGO_B64` **bị mất đúng 1 byte cuối** (18 020 / 18 021 byte, thiếu dấu
kết thúc `FF D9`) nên trình duyệt vẽ ra ảnh vỡ. Đã thay bằng ảnh gốc lấy từ chính file
biểu mẫu công ty (`xl/media/image1.jpeg`, 358 × 86 px). CSS cũng đổi sang **khoá chiều cao**
(`height:8mm; width:auto`) để ảnh không bao giờ bị bóp méo.
- Ca đêm (20:00 → 08:00) tự đẩy cột *Đến / Ngày* sang hôm sau.
- **Bộ phận** in trên đơn lấy từ `S.settings.deptDefault` (mặc định `LPG Terminal`),
  chỉ khi bỏ trống mới rơi về tên nhóm.
- Bố cục in mặc định là **1 đơn / tờ A5 ngang** (đúng chuẩn công ty); vẫn giữ tuỳ chọn
  *2 đơn / tờ A4 đứng* cho ai muốn tiết kiệm giấy. Trên 10 dòng thì tự tách thêm tờ.
- **Màn In đơn** là một danh sách chia hai nhóm: *Chưa in* (mặc định **tích hết**) và
  *Đã in rồi* (mặc định **bỏ tích**, chỉ tích lại khi cần in bù). Mỗi nhóm có ô tích ở đầu để
  chọn/bỏ cả nhóm, kèm ô tìm theo tên và lọc khoảng ngày.
- **Ai đăng nhập cũng in được.** Riêng **điện thoại ẩn hẳn mọi nút in** (class `pc-only`) vì
  công ty không cho điện thoại kết nối máy in.

Mở `mau-in-A5-xem-thu.html` bằng trình duyệt để xem thử cả 6 biểu mẫu trên khung giấy
đúng kích thước, bấm Ctrl+P chọn khổ A5 để in đối chiếu với file Excel.

---

## Cài đặt trên máy mới

1. Clone / tải repo về.
2. Copy `js/config.example.js` → `js/config.js`.
3. Mở `js/config.js`, điền `firebase`, `deptDefault`, `approver1/2`, `defaultPin`.
4. Mở `index.html` bằng trình duyệt (double-click là chạy được, không cần server).

Nếu thiếu `js/config.js`, app vẫn mở được nhưng chỉ chạy offline (localStorage), thanh trạng thái báo *"Chưa có config"*.

---

## Publish lên GitHub Pages

```bash
cd LPGT-CongCa-Web
git init
git add .
git commit -m "LPGT Cong Ca v4"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Vào **Settings → Pages → Source: main / (root)** → link dạng `https://<user>.github.io/<repo>/`.

> Vì `js/config.js` không được push, bản GitHub Pages sẽ chạy offline.
> Muốn bản online đồng bộ Firebase: hoặc để repo **Private** rồi bỏ dòng `js/config.js` khỏi `.gitignore`,
> hoặc người dùng tự dán `firebaseConfig` một lần ở tab **Dữ liệu** (lưu trong localStorage của máy họ).

---

## Bảo mật Firebase

API key của Firebase Web **không phải mật khẩu** — ai mở app cũng đọc được từ trình duyệt.
Lớp bảo vệ thật nằm ở **Realtime Database Rules**. Hãy giới hạn quyền đọc/ghi trên node `shiftwork_v2`
(ví dụ chỉ cho user đã xác thực), thay vì trông cậy vào việc giấu key.

---

## Nâng cấp về sau

- Sửa giao diện → `css/app.css`; sửa biểu mẫu in → `css/print.css` + `js/09-print.js`.
- Thêm mã ca mặc định → `DEFAULT_CODES` / `DEFAULT_HOURS` trong `js/01-core.js`.
- Đổi quy tắc sinh lịch → `js/04-schedule.js`.
- Thêm tab mới → thêm `<section class="view" id="v-xxx">` trong `index.html`, thêm file JS mới, khai báo script ở cuối `index.html`.

---

## v4.7 — Trợ lý duyệt đơn · tách khối sản xuất/văn phòng · đồng bộ theo delta

### 1. Hai khối nhân lực (`js/01-core.js`)

Nhóm **A / B / C / D** là khối **sản xuất** (trực vận hành theo ca), nhóm **Office** là khối
**văn phòng**. Hai khối **không trực thay ca / tăng ca cover cho nhau**, nên phần mềm gắn một
"khoá ẩn" suy ra từ tên nhóm:

```js
poolOf(emp)        // 'prod' | 'office'
poolOfId(empId)
samePool(a,b)
isOfficeTeam(tm)   // khớp: office / văn phòng / vp / hành chính / hc / admin
shiftKey(id,code)  // 'O@prod' | 'O@office' — CHỈ dùng nội bộ
```

> **Ký hiệu in ra giấy vẫn là `O` cho cả hai** theo quy định công ty. Khoá ẩn không bao giờ
> xuất hiện trên biểu mẫu — nó chỉ để phần mềm đếm đúng.

Ảnh hưởng: `mpBuckets(iso, pool)` và `mpBucketsByPool(iso)` đếm tách khối; định mức
`minD/minN` chỉ áp cho khối sản xuất; `crewGroupOfEmp()` tách cột `O` (sản xuất) và `OVP`
(văn phòng) trong "Nhân sự trong ngày"; `swapBlockList()` chặn thẳng đổi ca khác khối.

### 2. Trợ lý duyệt đơn (`js/18-advice.js`)

Chạy **hoàn toàn bằng logic trên state `S` đã nằm sẵn trong bộ nhớ** — không gọi thêm Firebase.

| Hàm | Việc |
|---|---|
| `offListOfDay(iso)` | ai vắng mặt ngày đó: ô lịch đã mang mã nghỉ (**đã duyệt**) + đơn nghỉ **đang chờ duyệt** |
| `leaveAdvice(empId,iso,newCode,skipReqId)` | khuyến nghị cho một người – một ngày |
| `reqAdvice(r)` / `reqAdviceHtml(r)` | khuyến nghị cho cả một đơn (panel trong màn Duyệt) |
| `advForFormHtml(empId,rows,type)` | nhắc nhở cho người **làm đơn** trước khi bấm gửi |
| `apprAdviceBadge(r)` | chip 🟢🟡🔴 hiện ngay trên dòng đơn chưa cần bung |

**Xếp hạng khuyến nghị**

1. *Tiêu chí chính* — cùng **NHÓM** đã có bao nhiêu người nghỉ ngày đó.
   Chạm trần `S.settings.maxOffTeam` (mặc định 1) → 🔴 **không nên duyệt**;
   đã có người nghỉ nhưng chưa chạm trần → 🟡; chưa ai nghỉ → 🟢.
   Còn đơn cùng nhóm **đang chờ duyệt** cùng ngày cũng đẩy lên 🟡.
2. *Tiêu chí phụ* — sau khi duyệt thì ca của **đúng khối đó** còn mấy người so với
   `minD` / `minN` / `minO`. Dưới định mức → 🔴, vừa sát định mức → 🟡.

Panel còn liệt kê **ai đã nghỉ kèm trạng thái đơn của họ** (✓ đã duyệt / ⏳ chờ duyệt),
đếm quân số **trước → sau** khi duyệt, và gợi ý **ai đang nghỉ ca R cùng khối** có thể huy động.

Ngưỡng khai ở tab **Dữ liệu → Cài đặt**: `setMinO`, `setMaxOffTeam` (cạnh `setMinD/setMinN/setOtLimit`).

> ⚠️ Bộ đệm `_advCache` khoá theo `S.rev`. Nếu viết test hoặc sửa `S` trực tiếp mà không qua
> `save()`, phải tự tăng `S.rev` rồi reset `_advCache`, nếu không kết quả cũ vẫn được dùng lại.

### 3. Lịch trên điện thoại = danh sách theo ngày (`js/06-calendar.js`)

Trên màn hình < 768px, tab **Lịch** không dựng ma trận / thẻ tuần nữa (không dựng luôn cho nhẹ
máy, chứ không phải chỉ ẩn bằng CSS) mà hiện `#calMpBox`: **mỗi ngày một dòng gọn**, chạm mới
bung tên người, tách sẵn khối sản xuất / văn phòng, có ô lọc *Chỉ ngày thiếu người*.
Hàm: `renderCalMpList()`, `calMpToggle(iso)`, `calMpSetLow(on)`. Máy tính giữ nguyên như cũ.
Hai nút **Thu/Mở** và **Theo ngày** đổi sang class `pc-only`.

### 4. Nhật ký tăng ca → sub-tab của Duyệt

`apprTab` nay có 3 giá trị: `list` | `sum` | `otlog` (`APPR_TABS`, nhớ ở `localStorage[LS+'_apprtab']`).
Panel mới `#apprOtlog` trong `index.html`; `renderAppr()` gọi `repOtLog()` của `js/15-report.js`.
`repModes()` ở tab Báo cáo đã bỏ `'otlog'` — các hàm `otlog*` vẫn nằm nguyên chỗ cũ.

### 5. Firebase đồng bộ theo DELTA (`js/02-storage.js`) — quan trọng

Bản cũ nghe `on('value')` ngay **gốc** và ghi bằng `set(S)`: đổi **một ô lịch** là **mọi máy tải
lại toàn bộ cây dữ liệu**. Gói **Spark** tính tiền theo băng thông tải xuống nên rất phí.

Bản mới chia nhánh và nghe ở mức con:

```js
FB_MAP_BRANCHES = ['base','over','requests','accounts','printLog','notifs']  // child_added/changed/removed
FB_VAL_BRANCHES = ['employees','settings','meta']                            // on('value')
```

Ghi cũng vậy: `fbSnapshot()` chụp JSON từng khoá, `fbDiff()` so với lần đồng bộ trước,
`fbPush()` chỉ `update()` đúng những đường dẫn đã đổi. `_fbLast` được ghi **trước** khi gửi nên
tiếng vọng của chính mình bị bỏ qua, không gây vẽ lại thừa. `fbTouch()` gộp nhiều sự kiện con
thành một lần `renderAll()`.

`fbBootSync()` chạy sau khi đợt sự kiện đầu tiên lặng ~900ms:
máy chủ còn trắng → đẩy toàn bộ dữ liệu máy này lên; máy chủ mới hơn (`rev` lớn hơn) → xoá những
bản ghi máy này còn giữ mà máy chủ đã bỏ (`_fbSeen`); máy này mới hơn → đẩy phần còn thiếu lên.

**SCHEMA GIỮ NGUYÊN** — dữ liệu Firebase cũ dùng lại được ngay, không cần chuyển đổi.

Đo trên bộ dữ liệu cỡ thật (40 NV · 12 kỳ lịch · 400 đơn ≈ **344 KB**):

| Thao tác | Cũ | Mới |
|---|---|---|
| Mở app lần đầu | 344 KB | 344 KB |
| Sửa 1 ô lịch (mỗi máy đang mở) | 344 KB | **~0,1 KB** |
| Duyệt 1 đơn | 344 KB | **~0,3 KB** |
| `save()` khi không có gì đổi | 344 KB | **0 KB** |

100 lượt sửa/ngày × 8 máy: **269 MB/ngày → 0,26 MB/ngày** (chưa kể lần tải đầu).

---

## v5.4 — Người OT cover · thanh lọc màn Duyệt gộp lại · dòng đơn duyệt-ngay

### 1. Chế độ in mặc định theo LOẠI ĐƠN
`REQ_MUST_PRINT=['wt','swap']` + `defaultNoPrint(type)` ở `js/08-requests.js`.
Chỉ **bổ sung công** và **đổi ca** là giấy tờ phải nộp nhân sự nên mặc định vào
hàng **chờ in**; nghỉ phép / tăng ca / đổi mã ca / đi trễ / làm liên tục mặc
định **không cần in**. `dsForm()` (13-portal) đặt `dsNoPrint=defaultNoPrint(t)`
— người khai vẫn bấm đổi được ngay trong form, quản lý đổi ở màn Duyệt bằng
`apprToggleNoPrint()` / `pbToggleNoPrint()`. Không đụng schema: vẫn là cờ
`r.noPrint` như cũ.

### 2. Thanh lọc màn Duyệt — hết trùng lặp
Trước đây kỳ công khai ở **hai** chỗ (thanh ◀▶ và select trong "Bộ lọc khác"),
chip lọc in cũng dựng **hai** lần. Nay:

| Hàng | Nội dung |
|---|---|
| `.ab-period` | ◀ · **một** dropdown kỳ công (`.ab-per-sel`, có cả *Tất cả các kỳ* và *Khoảng ngày tự chọn…*) · ▶ · chip phạm vi (Kỳ hiện tại / Kỳ này + kỳ trước / Cả năm nay) |
| `.ab-range` | chỉ hiện khi chọn *Khoảng ngày tự chọn…* |
| `.ab-chips` | chip trạng thái (có đếm) |
| `.ab-chips` | chip in: Mọi đơn / ○ Chờ in / 🚫 Không in / 🖨️ Đã in — **một lần duy nhất** |
| `.ab-tools` | ô tìm tên · select loại đơn · ↺ Bỏ lọc (chỉ hiện khi đang lọc) · ⚙ Công cụ dữ liệu (admin) · 🖨️ In đơn |
| `.ab-adv` | gập lại: xuất Excel / xuất & xoá / xoá theo năm |

⚠️ **Đừng gắn `admin-only` lên `.ab-adv`** — `applyRoleUI()` ghi thẳng
`el.style.display` nên panel gập sẽ bị bung ra với tài khoản quản trị. Gắn
`admin-only` cho từng nút bên trong.

### 3. Dòng đơn hiện sẵn thông tin quyết định (PC)
`apprQuickHtml(r)` → khối `.ar-sum.pc-only` nằm **ngoài** `.ar-d`, nên trên máy
tính nhìn vào là bấm ✓ được luôn:

* `apprDayBrief()` — mỗi ngày một viên `.aq-d`: ngày + thứ + **ca cũ → ca mới**
  (đổi ca là `A ⇄ B`, tăng ca kèm mốc giờ + số giờ). Quá `AQ_MAX_DAYS=4` ngày
  thì gộp `+N ngày`.
* `apprMetric()` — con số quyết định: `x ngày phép` (AL4 = 0,5) / `x h tăng ca`
  / số ngày khai.
* Lý do–ghi chú của nhân viên, lý do bổ sung công + người bảo lãnh, người OT cover.

Bung `▾` giờ chỉ còn **thông tin phụ**: chuỗi duyệt nhiều cấp, chi tiết đầy đủ,
cảnh báo quân số, Trợ lý duyệt đơn, mốc thời gian và các nút phụ.
Điện thoại vẫn giữ dòng gọn như cũ (`.ar-sum` mang `pc-only`), chỉ thêm badge
`🤝` nhỏ (`.mob-only`) khi đơn có người cover.

### 4. Người OT cover cho đơn nghỉ phép
Lưu trên đơn: **`r.coverId`** + **`r.coverSt`** = `pending | confirmed | declined`.

* **Khai đơn**: form nghỉ phép có `dsCoverHtml()` — ô tìm người
  (`dsPersonPicker('cover',…)`, chỉ **cùng khối**, ai đang nghỉ ca **R** hôm đó
  xếp lên đầu) + dải gợi ý nhanh lấy từ `leaveAdvice(...).cover` (18-advice).
  Không bắt buộc.
* **Thông báo**: gửi `newNotif({kind:'coverConfirm'})`. `CONFIRM_KINDS` nay gồm
  `schedChange · swapConfirm · coverConfirm` → tự vào mục *Cần bạn xác nhận* ở
  chuông 🔔 và được `notifUnseenCount()` đếm.
* **Xác nhận**: `confirmCover(nid)` / `declineCover(nid)` chỉ đặt cờ + báo lại
  người làm đơn. **KHÔNG tự sinh đơn tăng ca** — người cover muốn được tính giờ
  thì gửi đơn tăng ca như thường (đã ghi rõ trong lời nhắc).
* **Từ chối KHÔNG chặn duyệt** — chỉ hiện cờ đỏ `.cvw.declined`. Người làm đơn
  *hoặc* người duyệt bấm 🤝 mở `openCoverPicker()` đổi sang người khác:
  `reqSetCover(rid,newId,byId)` gỡ yêu cầu đang chờ của người cũ, báo người cũ
  đã được gỡ vai trò, gửi yêu cầu mới cho người mới. Quyền: `canSetCover()`.
* **Hiển thị**: `reqCoverChip()` dùng chung ở dòng đơn màn Duyệt, chi tiết đơn
  (`reqDetail`), *Đơn của tôi* và sheet theo ngày. Bảng Tổng quan thêm 2 cờ rủi
  ro `cvw` (chờ xác nhận) và `cvno` (đã từ chối) trong `AS_FLAGS`/`asFlagMatch`.
* `cancelReq()` dọn luôn thông báo `coverConfirm` của đơn bị xoá.

Modal chọn người: `#coverMask` / `#coverBody` trong `index.html`.

### 5. Ghi chú vận hành
* i18n: +39 khoá EN cuối `I18N_EN`. 8 khoá trùng trong file là **tồn tại từ
  trước**, không phải do bản này.
* `00-icons.js`: thêm `🤝→users`, `🙅→hand`.
* **Cache bump `?v=54`** trong `index.html` — mỗi lần sửa code phải tăng số này.
* Verify: 2 harness Node (`defaultNoPrint`, vòng đời cover, `apprQuickHtml`,
  bộ lọc in) — 50/50 kiểm tra đạt.

---

## v5.5 — Ẩn sub-tab Tổng quan/Biểu đồ · bấm tên xem tổng hợp cả kỳ

### 1. Tab Duyệt chỉ còn 3 sub-tab
`APPR_TABS_OFF=['sum','chart']` + `apprTabOn(v)` ở `js/08-requests.js`.
📊 **Tổng quan** và 📈 **Biểu đồ** **hiện tại chưa sử dụng** nên đã ẩn khỏi thanh
sub-tab; thanh còn *📋 Danh sách đơn · 🗂 Nhật ký tăng ca · 🧾 Bảng công tổng hợp*.

* **Code vẫn giữ nguyên** — `js/17-appr-sum.js` (`asRender`, `AS_FLAGS`,
  `asFlagMatch`) và `repChartPanel()` không bị xoá. **Bật lại = xoá tên khỏi
  `APPR_TABS_OFF`**, không phải sửa gì thêm.
* `apprTab` đọc từ localStorage cũng đi qua `apprTabOn()`, và `renderAppr()` tự
  đẩy về `'list'` nếu tab đang lưu đã bị tắt → người dùng từng mở Tổng quan hôm
  trước không bị màn trắng.
* Thanh sub-tab để lại một ghi chú mờ `.aptab-off`
  *"📊 Tổng quan · 📈 Biểu đồ: hiện tại chưa sử dụng"* (ẩn trên điện thoại).
* Bộ lọc theo cờ rủi ro (`apprFilter.flag`) vẫn chạy bình thường.

### 2. Bảng công tổng hợp — bấm tên mở tổng hợp cả kỳ của người đó
`openEmpSum(id)` / `renderEmpSum()` / `closeEmpSum()` trong `js/15-report.js`,
modal `#empSumMask` / `#empSumBody` (`.modal.wide`, 760px) trong `index.html`.
Cột **Họ tên** ở bảng PC và tên trên **thẻ mobile** đều thành nút `.st-nm`.

Nội dung popup (tất cả tính từ state đã có, **không tải thêm Firebase**):

1. Đầu trang: nhóm · họ tên · vị trí · mã NV · ngày vào làm.
2. Thanh kỳ công riêng `esYm` với ◀ ▶ + *Kỳ hiện tại* (`esShiftYm`,
   `esPeriod()` rơi về `repYm` khi để trống) — **không đụng** bộ lọc của bảng.
3. 4 thẻ: Giờ công · Giờ tăng ca (kèm số lần) · Nghỉ phép (ngày, AL4 = 0,5) ·
   Phép năm còn lại.
4. Bảng đếm ca D/N/O/R/AL8/AL4/NP/OFF/Ca OT + dải chip mọi mã ca xuất hiện.
5. Nhắc số giờ tăng ca **đang chờ duyệt** (`otSummary`).
6. Danh sách **các lần tăng ca** trong kỳ (ngày · mã · số giờ thật).
7. **Đơn trong kỳ** — mọi loại, mọi trạng thái, kể cả đơn đứng tên người khác mà
   người này là bên đổi ca; hiện cả người OT cover. Người duyệt có nút
   *Mở trong Danh sách đơn ›* → `esGoRequests()` đặt `apprFilter.q` = tên,
   `ym` = kỳ đang xem rồi nhảy sang sub-tab Danh sách.
8. **Chi tiết từng ngày**: ngày · mã ca (ô `~` = tạm duyệt, `⇄X` = khác lịch
   chuẩn) · giờ công / OT / phép + hàng tổng.

Ghi chú kỹ thuật: `SCHEDBG` / `SCHEDTXT` đọc qua `typeof … !== 'undefined'` để
hàm chạy được cả khi nạp thiếu `06-calendar.js` (harness test).

### 3. Ghi chú vận hành
* i18n: +12 khoá EN. 8 khoá trùng trong file vẫn là tồn tại từ trước.
* **Cache bump `?v=55`**.
* Verify: 3 harness Node — 80/80 kiểm tra đạt.

## v5.6 — Tách Kỹ sư/Operator ở Nhân lực · Đặt cơm tăng ca

### 1. Nhân lực theo ngày tách **Kỹ sư** và **Operator**

Đủ đầu người chưa chắc đã đủ *đúng loại* người: một ca phải có kỹ sư (Field
Engineer ngoài hiện trường + DCS Boardman trong phòng điều khiển) và operator
vận hành — ba operator không thay được một kỹ sư. Nên bảng Nhân lực nay đếm
tách hai nhóm này.

* `js/01-core.js` — `POSG_ENG`/`POSG_OPER`/`POSG_OTHER`, `POSG_LABEL/FULL/ICON/COLOR`,
  **`posGroupOf(e)`** (field_eng + boardman → `eng`, operator → `oper`, còn lại →
  `other`; chưa khai vị trí thì rơi về `e.role` cũ) và **`splitEO(list)`** chia
  một mảng nhân viên thành 3 rổ.
* `js/15-report.js` `repManpower()` (PC) — pill quân số D/N/O khối sản xuất có
  thêm `<em class="mpp-eo">🛠️n ⚙️n</em>`; bung chi tiết thì `lineEO()` xếp tên
  thành 2 hàng con Kỹ sư / Operator thay vì một dãy tên liền.
* `js/06-calendar.js` `renderCalMpList()` (điện thoại) — `calMpEoTag()` gắn chỉ
  số vào pill, `calMpNamesEO()` tách tên theo nhóm vị trí.
* CSS `.mpp-eo` `.mp-eo-sub` `.cmp-eot` `.cmp-eo` ở cuối `css/ui.css`.

Ma trận lịch, Bảng công tổng hợp và Nhân sự trong ngày **giữ nguyên** — user chỉ
yêu cầu tách ở Nhân lực theo ngày.

### 2. Cơm phát sinh — `js/19-meal.js` (nạp sau 18-advice)

Công ty nấu 4 bữa cố định: **06:00 sáng · 12:00 trưa · 18:00 tối · 22:00 khuya**.
Nhà bếp đặt cơm **một lần từ đầu kỳ theo BẢNG LỊCH CHUẨN** (`S.base`):

| Ca | Khung giờ | Suất bếp đã đặt |
|----|-----------|-----------------|
| D / SD | 08:00–20:00 | trưa + tối |
| N / SN | 20:00–08:00 | khuya + **sáng NGÀY HÔM SAU** |
| O / SO | 08:00–17:00 | trưa |
| R, nghỉ phép | — | không có |

Quy tắc gói gọn trong `SHIFT_WIN` + `mealsInWin()`: **một mốc bữa ăn nằm trong
khung giờ ca thì có suất** (`abs >= start && abs < end` — chạm đúng giờ bắt đầu
vẫn tính, kết thúc đúng mốc thì không).

**Bài toán = so LỊCH CHUẨN với LỊCH THỰC TẾ.** Trong kỳ phát sinh tăng ca, đổi
ca, nghỉ phép đột xuất, quản lý sửa tay ô lịch… nên lịch thực tế (`base + over`)
khác lịch chuẩn. Chênh lệch chính là phần phải báo bếp — **hai chiều**:

* thực tế CÓ mà chuẩn KHÔNG → **đặt thêm** (`d:+1`)
* chuẩn CÓ mà thực tế KHÔNG → **báo bớt** (`d:-1`), bếp khỏi nấu

Ví dụ: chuẩn ca D mà xin nghỉ phép cả ngày → **bớt 2 suất**; chuẩn nghỉ ca R mà
vào trực thay ca D → **thêm 2 suất**; chuẩn ca D mà đổi sang ca N → **bớt trưa +
tối, thêm khuya + sáng hôm sau**; đang ca O mà tăng ca 17–20 → **thêm 1 suất tối**.

Các hàm chính:

* `plannedMealsOf(empId,iso)` — suất theo **lịch chuẩn** (`S.base`, bếp đã đặt).
* `actualMealsOf(empId,iso,inclPending)` — suất theo **lịch thực tế** (`eff()`)
  **cộng** các lần tăng ca. Ô lịch bị mã OT ghi đè thì ca nền vẫn lấy ở `S.base`.
* `otWinFromRow(d)` — khung giờ một dòng OT trong đơn (`timeIn/timeOut/isoEnd`;
  bỏ trống ngày kết thúc mà giờ ra ≤ giờ vào thì hiểu là qua nửa đêm). Dòng
  không có mốc giờ thì suy theo `OT_CODE_WIN` (OTL 12–13, OT2 18–20, OT3 17–20,
  OTD 08–20, OTN 20–08).
* `otIndex()` — **đánh chỉ mục `S.requests` theo khoá `mã NV|ngày`**, nhớ theo
  `S.rev`. Không có chỉ mục thì badge (vẽ lại sau mỗi render) phải quét toàn bộ
  đơn cho từng người từng ngày. **Dữ liệu về từ máy khác không đi qua `save()`
  nên `S.rev` không đổi → `fbTouch()` trong `02-storage.js` gọi `mealResetCache()`.**
* `mealDiffOf(empId,srcDays,inclPending)` — hợp hai tập trên rồi lấy phần chỉ
  thuộc một bên. Mỗi dòng ghi kèm `planCode`/`realCode` để biết vì sao lệch.
* `mealPlan({from,to,team,onlyMe,inclPending})` → `{days, byDay[iso][bữa], rows,
  add, cut, nPend}`. Ngày **nguồn** quét thêm hôm trước `from` (bắt ca đêm vắt
  sang) và hiện thêm ngày sau `to` nếu có suất rơi vào đó.
* `mealCell(P,iso,v)` → `{list, add, cut, pend}`; `mealAddOf()` cộng cả phần sửa tay.

**Popup**: nút `🍚 Cơm phát sinh` + badge `#mealBdg` (đếm cả thêm lẫn bớt) cuối
thanh `.cal-bar` (tab Lịch, mọi quyền đều mở được) → modal `#mealMask`/`#mealBody`.
Gồm thanh khoảng ngày (mặc định **từ hôm nay tới hết kỳ**, không lùi về quá khứ),
lọc nhóm / *Chỉ mình tôi* / *Tính cả đơn chờ duyệt*, 5 thẻ tổng (số `+` xanh trên,
số `−` đỏ dưới), bảng **ngày × 4 bữa** (bấm ngày bung danh sách ai thêm/bớt bữa
nào, kèm `chuẩn → thực tế`), nút **＋ −** sửa tay từng ô, và **📋 Copy tóm tắt
(2 mục CAN DAT THEM / CAN BOT) / 📤 Xuất Excel (2 sheet) / 🖨️ In**.

> **KHÔNG ghi lên Firebase** — user chọn bản chỉ tính & xem, schema không đổi.
> Số sửa tay (`mealAdj`) chỉ sống trong phiên, đóng app là mất; chốt xong phải
> Copy / Xuất Excel gửi bếp.

### 3. Icon & i18n

`js/00-icons.js` thêm `sunrise/sun/sunset/moon/utensils/bowl` và map
`🌅 🍚 🌆 🌙 🍽`. `js/14-i18n.js` thêm **32 khoá EN** (`Kỹ sư`, `Khác`,
`chờ duyệt` đã có sẵn từ trước và dùng lại được). Cache bump **`?v=57`**.

### 4. Kiểm thử

3 harness Node (không cần trình duyệt, xem thư mục tạm của phiên làm việc):

* `meal-harness.js` — **50 kiểm tra**: suất chuẩn theo ca; các kịch bản OT (ca O
  + OT 17–20, ca D + OT 20–24, ngày nghỉ R + OT ca đêm, ca N hôm trước vắt sang,
  chạm/không chạm mốc bữa); nhiều lần OT trong ngày; đơn chờ duyệt / bị từ chối;
  ô lịch OT điền tay; **so chuẩn ↔ thực tế** (nghỉ phép → bớt, đổi ca D→N → vừa
  bớt vừa thêm, trực thay ca R→D → thêm); `mealPlan` đếm hai chiều & lọc
  nhóm/cá nhân; `posGroupOf`/`splitEO`.
* `meal-render-smoke.js` — **24 kiểm tra** dựng HTML popup, bung chi tiết ngày,
  sửa tay, tóm tắt văn bản 2 mục, bộ lọc, badge, chiều báo bớt.
* `mp-render-smoke.js` — **7 kiểm tra** bảng Nhân lực có tách Kỹ sư/Operator.

Sandbox vẫn không chạy được trình duyệt → phần hiển thị phải mở thật trên máy để
mắt nhìn.

---

## v5.8 — Ca kép · lịch tuần trên điện thoại · sự kiện trên lịch · thu hồi thông báo

Bốn việc trong một bản. Cache bump `?v=58` (nhớ tăng số này mỗi lần sửa code,
nếu không trình duyệt vẫn giữ bản cũ).

### 1. Mã ca kép `O+N` và `D+N`

Trước đây người vừa trực ca O vừa tăng ca đêm chỉ ghi được `OTN` vào ô lịch —
nhìn vào không biết hôm đó họ đã làm ca O. Nay có hai mã ghép:

| Mã | Nghĩa | Giờ mặc định |
|----|-------|--------------|
| `O+N` | trực ca hành chính O rồi tăng ca đêm | 20h (8 công + 12 tăng ca) |
| `D+N` | trực ca ngày D rồi tăng ca đêm | 24h (12 công + 12 tăng ca) |

- **Nhìn ra ngay**: `chip()` vẽ chip **hai nửa** `O|N`, mỗi nửa giữ màu của ca
  tương ứng; ô trong bảng lịch dùng nền `linear-gradient` chia đôi chéo
  (`cellStyle`, `SCHEDBG['O+N']`). CSS ở `css/ui.css` mục `.cc.combo`.
- **Loại mã riêng `cat:'combo'`** — cố ý KHÔNG dùng `'work'` cũng không dùng
  `'ot'`, để mọi chỗ cộng giờ không nhầm cả 20h thành giờ công.
  `comboSplitHours(code,total)` tách lại: phần công lấy trọn giờ ca chuẩn,
  phần dôi ra tính tăng ca. Quản lý ghi tổng thực tế 14h → 8h công + 6h OT.
- **Helper ở `01-core.js`**: `comboOf` · `isCombo` · `comboSplitHours` ·
  `workCodeOf` (mã ca chuẩn của ô) · `otCodeOf` (mã tăng ca của ô) ·
  `cntShift(cnt,'D'|'N'|'O')` (đếm ca, gộp `SD/SN/SO` và ca kép).
- **Đã sửa theo ở**: `calcStats` + `otShifts` (10-account), `mpBuckets` /
  `mpBucketsByPool` qua `mpPut()` — ca kép **đếm hai lần có chủ đích**: vẫn là
  một đầu người ở ca chuẩn VÀ vẫn nằm trong danh sách tăng ca; `baseShiftOf`
  (08-requests) trả nửa ca chuẩn; `otSummary` / `myPanelOt` / `myPanelSum`
  (13-portal); `repStatsAll` / `esBody` / `otlogRowsForPeriod` (15-report);
  `baseShiftWin` / `otBlocksOf` / `actualMealsOf` (19-meal — ca kép vẫn tính đủ
  suất cơm của cả ca chuẩn lẫn ca tăng); tổng D/N/O ở chân ma trận và bản Excel.
- **Không lọt vào form gửi đơn**: `dsCodesFor()` lọc theo `cat` nên `combo`
  tự động bị loại — mã ghép chỉ quản lý chọn được ở hộp sửa ô lịch.
- **Khi in**: biểu mẫu công ty không có ký hiệu ghép. Nhân viên bấm xác nhận ô
  ca kép thì `inferReqFromChange()` sinh **đơn Bổ sung công 2 dòng** (một dòng
  ca chuẩn, một dòng ca tăng) đúng như bản Excel gốc.

> Thêm tổ hợp khác (VD `N+D`) chỉ cần thêm 1 dòng vào `COMBO_CODES`,
> `DEFAULT_CODES`, `DEFAULT_HOURS` và `SCHEDBG`/`SCHEDTXT` — phần còn lại tự chạy.

### 2. Lịch trên điện thoại đổi sang LỊCH TUẦN dạng lưới

Bỏ hẳn danh sách theo ngày (`renderCalMpList`, `#calMpBox`) — quân số từng ngày
đã có sub-tab **👥 Nhân lực** lo. Thay bằng `renderCalWeekGrid()` / `#calWkGrid`:

- **Lưới người × 7 ngày**: hàng = từng người, cột = từng ngày. Nhìn ngang biết
  lịch cả tuần của mình, nhìn dọc biết hôm đó cả nhóm ai trực ca gì.
- **Mặc định đúng nhóm của người đăng nhập** (`calWkDefaultTeams()`); người
  không có nhóm thì mở nhóm đầu danh sách.
- **Chuyển tuần** `◀ ▶` + nút *Tuần này* (`calWkShift` / `calWkToday`,
  state `calWkMon`).
- **Xem thêm nhóm khác**: hàng chip nhóm cuộn ngang, chạm để thêm/bớt
  (`calWkToggleTeam`, luôn chừa lại ít nhất 1 nhóm) + nút *Tất cả* / *Nhóm của tôi*.
- Chạm ô: quản lý ở chế độ *Thực tế* → sửa ca; nhân viên → mở sheet ngày.
- Thanh `cal-bar` **ẩn chọn kỳ / khoảng ngày / nhóm khi ở điện thoại**
  (`calMonth`, `calRange`, `calGroupFilter`, `calPrevBtn`, `calNextBtn`) vì lưới
  tuần đã có thanh điều hướng riêng — tránh hai chỗ điều khiển đá nhau.

### 3. Sự kiện trên lịch — `js/20-events.js`, nhánh Firebase `events`

Ngày đặc biệt (nhập tàu, bảo dưỡng, kiểm định…) đánh dấu thẳng trên lịch thay vì
nhắn tay từng nhóm. Nút **📌 Sự kiện** (`admin-only`) ở thanh `cal-bar`.

- **Chọn ngày bằng lịch nhỏ**: chạm ngày để chọn/bỏ chọn, nút *Chọn cả dải*
  (bấm 2 ngày rồi lấp đầy khoảng giữa), *Bỏ chọn hết*. Ngày liên tục lưu gọn
  bằng `from`/`to`; ngày rời rạc lưu mảng `days`.
- **Một màu duy nhất** cho mọi sự kiện (`--evc`) — yêu cầu chỉ cần khác ngày
  thường, không phân loại. Hiện ở: ma trận máy tính (`th.evday`), lưới tuần
  điện thoại (`.cwg-row.hd .c.ev`), lịch trang chính nhân viên (`.pv-d.evday`
  + nhãn tên sự kiện), dải nhắc `evBannerHtml()` ở trang chính và sheet ngày.
- **Chọn người nhận từng lần** (`EV_SCOPE`): *Tất cả mọi người* / *Chỉ nhóm có
  làm việc ngày đó* (`evIsWorkingCode` — có ca làm, kể cả tăng ca) / *Chọn nhóm
  cụ thể*. Trước khi lưu, màn hình hiện luôn **sẽ gửi tới bao nhiêu người** và
  nhóm nào đang có người làm việc trong khoảng ngày đó.
- **Sửa & xoá thu hồi thông báo**: `evSendNotifs()` LUÔN gọi `evRevokeNotifs()`
  trước, nên lưu lại không bao giờ đẻ ra hai thông báo lệch nhau; `evDelete()`
  xoá sự kiện kèm toàn bộ thông báo của nó.
- Thông báo mang `kind:'event'`, `status:'sent'` (không phải `'pending'`) để
  `pruneOldNotifs()` dọn được sau ~2 kỳ. Chuông đếm qua `SEEN_KINDS`.
- Bộ đệm `evIndex()` khoá theo `S.rev`; `evResetCache()` gọi trong `fbTouch()`.

### 4. Thu hồi thông báo khi trả lịch về ca chuẩn

Lỗi cũ: quản lý đổi ca của một người → nhân viên nhận thông báo xác nhận; quản
lý đổi ý, trả ô về ca chuẩn → **thông báo vẫn nằm đó**, nhân viên xác nhận nhầm
một thay đổi không còn tồn tại.

`setCell()` nay so mã sau khi sửa với **ca chuẩn** (`S.base`), bằng nhau thì gọi
`revokeSchedChange(empId,iso,stdCode)` ở `13-portal.js` — bắt cả hai đường:
bấm *↩︎ Về ca chuẩn* lẫn gán tay đúng mã chuẩn.

| Trạng thái thông báo | Xử lý |
|---|---|
| `pending` (chưa xác nhận) | **xoá hẳn, im lặng** — không làm phiền ai |
| `confirmed` (đã xác nhận) | chuyển `revoked` + **gửi thông báo thu hồi**, nhắc nhân viên vào *Đơn của tôi* huỷ đơn đã gửi |

### Kiểm thử

* `_test/harness-v58.js` — **42 kiểm tra** logic: tách giờ ca kép, quân số theo
  ngày, suất cơm, ngày/người nhận/thu hồi của sự kiện, hai nhánh thu hồi thông báo.
* `_test/render-v58.js` — **23 kiểm tra** dựng HTML thật (DOM giả) cho chip ca
  kép, lưới lịch tuần, ma trận có ngày sự kiện, màn quản lý sự kiện, `setCell`.

```bash
cd LPGT-CongCa-Web && node _test/harness-v58.js && node _test/render-v58.js
```

i18n: **+60 khoá EN** ở cuối `I18N_EN` (đã kiểm không trùng — 8 khoá trùng còn
lại là tồn tại từ trước). Sandbox vẫn không chạy được trình duyệt → phần hiển thị
phải mở thật trên máy để mắt nhìn.
