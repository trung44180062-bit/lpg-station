# Ma trận thông báo — LPGT Công Ca

> Bảng này liệt kê **toàn bộ thông báo app đang phát** (rà từ source, không phỏng đoán)
> cùng đề xuất kênh gửi. Cột **QUYẾT ĐỊNH** để trống cho bạn điền.
> Điền xong file này là đủ đầu vào để phiên chat khác viết code.
>
> Ngày rà soát: 2026-08-03 · Bản app: v5.8 · Quân số thực tế: **20 người**

---

## Ký hiệu kênh

| Ký hiệu | Nghĩa | Hệ quả |
|---|---|---|
| 🔴 **ZALO-NGAY** | Bắn Zalo 1-1 tức thì | Tốn 1 tin · làm phiền · dùng khi chậm biết là hỏng việc |
| 🟡 **ZALO-GỘP** | Xếp hàng, gộp 10 phút rồi bắn | Tốn <1 tin · ít phiền |
| 🔵 **DIGEST** | Gom vào bản tin 11:00 & 16:30 | Rất tiết kiệm · dùng cho việc chờ xử lý |
| ⚪ **APP-ONLY** | Chỉ chuông + badge trong app, **không** Zalo | 0 tin · người dùng tự thấy khi mở app |

Mọi dòng đều **vẫn hiện trong app như hiện tại**. Cột kênh chỉ quyết định *có bắn Zalo kèm hay không*.

---

## A. Thông báo CẦN NGƯỜI NHẬN BẤM XÁC NHẬN

Đây là nhóm nguy hiểm nhất nếu bỏ lỡ — việc sẽ treo vô thời hạn.

| # | Mã `kind` | Sự kiện phát sinh | Nguồn | Người nhận | Đề xuất | Lý do | **QUYẾT ĐỊNH** |
|---|---|---|---|---|---|---|---|
| A1 | `schedChange` | Quản lý/thư ký sửa ô lịch thực tế của một người | `06-calendar.js:264` | NV bị đổi ca | 🔴 ZALO-NGAY *(qua Công bố)* | Đổi ca mà không biết = đi làm sai giờ | |
| A2 | `swapConfirm` | A gửi đơn đổi ca với B | `13-portal.js:1358` | B | 🔴 ZALO-NGAY | B không xác nhận thì đơn kẹt ở hàng duyệt | |
| A3 | `coverConfirm` | Đơn nghỉ phép chỉ định người OT cover | `13-portal.js:1366` | Người được nhờ cover | 🔴 ZALO-NGAY | Người này hay bị quên nhất | |
| A4 | `coverConfirm` | **Đổi** người OT cover sang người khác | `08-requests.js:112` | Người cover **mới** | 🔴 ZALO-NGAY | Như A3 | |

---

## B. Kết quả DUYỆT ĐƠN (`notifyReqParties` → `08-requests.js:882`)

Gửi tới `apprPartyIds` = người đứng đơn + người làm hộ + người đổi ca cùng, **trừ** người vừa thao tác.

> ⚠️ **Vấn đề hiện tại:** một đơn khối sản xuất đi qua 3 cấp (`fe → trung → kmgr`)
> sẽ bắn **3 tin cho cùng một người**. Đây là nguồn spam lớn nhất nếu bê nguyên sang Zalo.

| # | `kind` | Ý nghĩa | Người nhận | Đề xuất | Lý do | **QUYẾT ĐỊNH** |
|---|---|---|---|---|---|---|
| B1 | `fe` | Field Engineer đã duyệt, **chờ cấp trên** | Các bên | ⚪ APP-ONLY | Tin trung gian, chưa có gì để làm | |
| B2 | `provapproved` | Cấp Trung **tạm duyệt**, chờ QL người Hàn chốt | Các bên | ⚪ APP-ONLY | Tin trung gian, lịch mới ghi tạm | |
| B3 | `approved` | **Duyệt chính thức** — lịch đã chốt | Các bên | 🔴 ZALO-NGAY | Kết quả cuối, ảnh hưởng lịch đi làm | |
| B4 | `rejected` | **Từ chối** (kèm lý do) | Các bên | 🔴 ZALO-NGAY | Phải làm lại đơn, càng biết sớm càng tốt | |
| B5 | `revoked` | **Huỷ duyệt** đơn đã duyệt — lịch trả về ca chuẩn | Các bên | 🔴 ZALO-NGAY | Lịch vừa đổi ngược, dễ đi làm sai | |
| B6 | `cancelled` | Đơn bị **huỷ/xoá hẳn** | Các bên | 🟡 ZALO-GỘP | Chỉ báo khi người huỷ **khác** người đứng đơn; tự huỷ thì ⚪ | |

**Đề xuất gộp cho nhóm B:** nếu một người có nhiều đơn cùng đổi trạng thái trong 10 phút
(duyệt gộp hàng loạt — tính năng *Duyệt gộp* đang có), gộp thành **1 tin liệt kê nhiều dòng**.

---

## C. Phản hồi hai chiều giữa nhân viên (`kind:'info'`)

| # | Sự kiện | Nguồn | Người nhận | Đề xuất | Lý do | **QUYẾT ĐỊNH** |
|---|---|---|---|---|---|---|
| C1 | NV **huỷ** thay đổi lịch mà quản lý tạo | `13-portal.js:249` | Người đã sửa lịch (QL) | 🟡 ZALO-GỘP | QL cần biết để xếp người khác, nhưng không gấp trong phút | |
| C2 | Quản lý **thu hồi** thay đổi lịch *(NV đã xác nhận rồi)* | `13-portal.js:224` | NV | 🔴 ZALO-NGAY | NV có thể đã gửi đơn theo thay đổi đó → phải vào huỷ | |
| C3 | B **xác nhận** đổi ca với A | `13-portal.js:261` | A | ⚪ APP-ONLY | Tin tốt, không cần làm gì thêm | |
| C4 | B **từ chối** đổi ca với A | `13-portal.js:273` | A | 🔴 ZALO-NGAY | A phải tìm người khác gấp | |
| C5 | Người cover **nhận** OT cover | `13-portal.js:288` | Người làm đơn | ⚪ APP-ONLY | Tin tốt, không cần hành động | |
| C6 | Người cover **từ chối** OT cover | `13-portal.js:302` | Người làm đơn | 🔴 ZALO-NGAY | Phải chọn người khác, nếu không đơn kẹt | |
| C7 | Bị **gỡ** khỏi vai trò OT cover | `08-requests.js:107` | Người cover **cũ** | 🟡 ZALO-GỘP | Họ đã sắp xếp lịch cá nhân theo đó rồi | |

> **Quy tắc chung rút ra:** tin **xấu / cần hành động** → Zalo. Tin **tốt / xác nhận xuôi** → chỉ app.

---

## D. Sự kiện trên lịch (`kind:'event'` — `20-events.js:135`)

| # | Sự kiện | Người nhận | Đề xuất | Lý do | **QUYẾT ĐỊNH** |
|---|---|---|---|---|---|
| D1 | Tạo/sửa sự kiện có bật *Gửi thông báo* | Theo `EV_SCOPE`: tất cả / nhóm có làm ngày đó / nhóm chọn tay | 🟡 ZALO-GỘP | Admin đã chủ động bấm gửi và **đã thấy trước số người nhận** | |
| D2 | Xoá sự kiện / tắt thông báo | Người đã nhận D1 | ⚪ APP-ONLY | `evRevokeNotifs()` đã gỡ trong app; bắn thêm tin "đã huỷ" chỉ gây rối | |

Cơ chế `evSendNotifs()` **luôn gọi `evRevokeNotifs()` trước** → sửa sự kiện nhiều lần không đẻ tin trùng.
Đây chính là mô hình Nháp→Công bố mà app đã làm đúng, chỉ cần nhân rộng sang lịch.

---

## E. Thông báo ĐỀ XUẤT THÊM (app chưa có)

> **Phát hiện quan trọng:** hiện tại app **không báo gì cho người duyệt** khi có đơn mới.
> Họ chỉ biết khi tự mở tab Duyệt. Đây là giá trị lớn nhất mà Zalo bot mang lại,
> lớn hơn tất cả các dòng phía trên cộng lại.

| # | Đề xuất | Người nhận | Kênh | Nội dung | **QUYẾT ĐỊNH** |
|---|---|---|---|---|---|
| E1 | **Digest đơn chờ duyệt** 11:00 & 16:30 hằng ngày *(không có đơn thì không gửi gì)* | FE / Trung / KMgr — đúng cấp đang chờ (`reqNextLevel`) | 🔵 DIGEST | *"📋 5 đơn chờ bạn duyệt (3 tăng ca, 2 nghỉ phép). Chờ lâu nhất: Nguyễn A – 6 giờ"* | |
| E2 | **Đơn gấp** — OT/đổi ca cho ca **hôm nay hoặc ngày mai** | Cấp đang chờ duyệt | 🔴 ZALO-NGAY | Không chờ digest được, ca sắp vào | |
| E3 | **Đơn treo > 24h** chưa ai duyệt | Cấp đang chờ + cấp trên | 🟡 ZALO-GỘP | Nhắc 1 lần duy nhất, không lặp lại | |
| E4 | **Nhắc chốt công cuối kỳ** — ngày 18 & 19 *(kỳ 21→20)* | Toàn bộ NV chưa gửi đủ đơn | 🟡 ZALO-GỘP | *"Kỳ 21/7–20/8 còn 2 ngày. Bạn có 3 ngày tăng ca chưa gửi đơn."* | |
| E5 | **Thông báo chung** — màn soạn tin, chọn người, bấm gửi | Do admin chọn | 🟡 ZALO-GỘP | Thay việc dán tay vào nhóm Zalo | |
| E6 | **Nhắc người cover chưa trả lời > 12h** | Người được nhờ cover | 🟡 ZALO-GỘP | Nhắc 1 lần | |

---

## Ngân sách tin — quy mô thật 20 người

Giả định vận hành: **60 đơn tăng ca**, **15 đơn nghỉ phép**, **10 đơn đổi ca**,
**30 lần sửa lịch**, **4 sự kiện**/tháng.

| Nhóm | Bê nguyên (mọi tin → Zalo) | Theo đề xuất bảng này |
|---|---|---|
| A — Cần xác nhận | 55 | 55 |
| B — Kết quả duyệt | 230 *(3 cấp × 85 đơn)* | 95 *(chỉ kết quả cuối)* |
| C — Phản hồi hai chiều | 45 | 22 |
| D — Sự kiện | 80 | 80 |
| E — Đề xuất thêm | 0 | 75 |
| **Tổng / tháng** | **410** | **327** |

| | |
|---|---|
| Hạn mức gói free | **3.000 tin/tháng** |
| Mức dùng dự kiến | **~330 tin (11%)** |
| Tin/người/tháng | **~16** ≈ 1 tin / 2 ngày |
| Trần quy mô ở 3.000 tin | **~180 người** |

> **Kết luận thẳng: hạn mức không phải vấn đề.** Ở 20 người, kể cả bắn mọi tin
> cũng chỉ dùng 14% gói free. Lý do duy nhất để lọc là **giữ độ tin cậy của kênh** —
> nếu Zalo bot kêu 25 lần/tháng toàn tin vô thưởng vô phạt, người ta sẽ tắt thông báo,
> và khi đó tin "đơn bị từ chối" cũng không ai đọc.
>
> Ràng buộc thật của gói free là **50 user** — bạn đang ở 20, còn dư 30 chỗ.

---

## Cần bạn quyết thêm 5 điểm

| # | Câu hỏi | Đề xuất | **QUYẾT ĐỊNH** |
|---|---|---|---|
| Q1 | Giờ im lặng (tin thường xếp hàng, sáng mới bắn)? | 21:30–06:30. **Nhưng ca đêm N làm 20:00–08:00** → có nên miễn trừ người đang trực ca đêm? | |
| Q2 | Người duyệt nhận digest mấy lần/ngày? | 2 lần: 11:00 và 16:30 | |
| Q3 | Bạn (General Manager) có muốn nhận **bản tin tổng hợp cuối ngày** không? | Có — 17:00, tóm tắt đơn phát sinh + đơn còn treo | |
| Q4 | Nhân viên **chưa liên kết** Zalo bot thì sao? | App hiện cảnh báo danh sách người chưa liên kết ở màn quản trị; không chặn gì cả | |
| Q5 | Tin Zalo có kèm **link mở thẳng đúng màn hình** không? | Có — `hsvc.../?go=appr&rid=xxx`, bấm là vào thẳng đơn đó | |

---

## Cách dùng file này

1. Điền cột **QUYẾT ĐỊNH** — ghi `🔴` / `🟡` / `🔵` / `⚪`, hoặc gõ thẳng *"giữ nguyên đề xuất"*.
2. Trả lời 5 câu Q1–Q5.
3. Mở phiên chat mới, đưa file này + `PHUONG-AN-ZALO-BOT.md`.
   Phiên đó có đủ thông tin để viết code mà không cần hỏi lại.

Không điền gì cũng chạy được — mặc định lấy đúng cột **Đề xuất**.
