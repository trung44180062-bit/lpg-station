# HSVC LPG STATION — v4 (modular)

Phần mềm quản lý trạm LPG (đội xe & chứng chỉ, kế hoạch giao hàng, cân xe, pha trộn,
tồn kho cavern, đối soát SAP/WMS, báo cáo). Dữ liệu lưu trên **Firebase Realtime
Database**. Bản này tách từ file đơn `lpg-station-v4_54_0` ra nhiều module để dễ bảo trì.

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
