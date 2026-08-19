/* ============================================================
 * KNQ — knq.js   (v4.95) ·  XNK KHO NGOẠI QUAN (bonded warehouse)
 * ------------------------------------------------------------
 * Tab: REPORTS ▸ 🛃 KNQ (XNK)   —   pane #rpt-pg-knq
 * Global: window.KNQ      ·      Firebase node: 'knq_bonded'
 * Nạp: sau mthr.js. LAZY — chỉ đọc Firebase khi mở tab.
 * ------------------------------------------------------------
 * BỐ CỤC = file "FILE THEO DOI XNK KNQ HYOSUNG" (sheet C3 2026 / C4 2026).
 * HAI bảng tách riêng: C3 (Propane) và C4 (Butane). Mỗi bảng gồm:
 *   • 1 dòng GET IN   cho MỖI chuyến tàu  (tờ khai nhập, tổng trọng lượng)
 *   • NHIỀU dòng GET OUT dưới nó, mỗi dòng = 1 MÃ BATCH DUY NHẤT
 * Toàn bộ gõ tay (bảng dựng giữa lúc đang vận hành). ĐƠN VỊ = KG.
 * v4.93a — đã bỏ Giờ khai báo · Giờ HQ phản hồi · Số PXK/PNK · Ngày nộp ·
 * Ngày nhận · PXKT/PNKT (quản lý bên Excel) để bảng lọt màn hình.
 * v4.95 — bỏ tiếp Đơn giá · Trọng lượng (kg) · Thành tiền · Còn lại của
 * chuyến (kg) · Nhà cung cấp / Lần xuất → còn 15 cột. Số cũ KHÔNG bị xoá:
 * vẫn nằm trong Firebase và vẫn ra sheet Excel khi bấm 📤 Export, chỉ không
 * hiện / không sửa được trên bảng nữa.
 *
 * ⚠ BẢNG KHÔNG LỌC THEO THÁNG. Hàng vào kho ngoại quan có thể từ nhiều
 * tháng trước và vẫn đang được trừ lùi; batch chỉ rời bộ dữ liệu khi người
 * dùng TICK ✔ Xong (lần mở tab sau không tải về nữa). Bộ chọn tháng trên
 * thanh công cụ là KỲ TRỪ LÙI — quyết định lấy FEED OL1 của tháng nào.
 *
 * VÒNG ĐỜI MỘT KỲ
 *   1. Khai GET IN / GET OUT bằng tay bất cứ lúc nào có phát sinh.
 *   2. Gõ "Tồn đầu kỳ" cho batch mới (batch cũ: khai lượng đang còn).
 *   3. Gõ FEED OL1 hằng ngày → app trừ lùi FIFO trong kỳ, dự báo ngày hết
 *      bằng plan X đã import.
 *      v4.94 — BẢNG FEED OL1 ĐỔI CÁCH NHẬP:
 *        • TỔNG P+X  gõ tay (chưa gõ → TẠM TÍNH 2.000 tấn/ngày)
 *        • X         gõ tay · 📥 import Excel · 📋 dán (Ctrl+V) nhiều dòng
 *        • P         KHÔNG gõ nữa — tự tính = TỔNG − X
 *        Import ghép ACTUAL → tới ngày đầu tiên thiếu actual thì lấy PLAN
 *        cho phần còn lại (đúng cách đọc file C3 usage của KH).
 *   4. Cuối tháng: tick ✔ Xong các batch đã dùng hết → bấm 📌 CHỐT KỲ.
 *      Thực còn cuối kỳ ⇒ TỒN ĐẦU KỲ của kỳ sau (op[kỳ]); batch đã tick
 *      không chuyển sang. Số của kỳ cũ được giữ nguyên để tra lại.
 *
 * CÁCH TÍNH TRỪ LÙI
 *   D / E : nút "⬇ Cập nhật D/E từ SAP" khớp batch SAP CÙNG MÃ → chép
 *           End Stock Qty vào "Thực còn".
 *   P / X : FIFO vào-trước-dùng-trước, xuất phát từ TỒN ĐẦU KỲ và CHỈ trừ
 *           các ngày OL1 THUỘC KỲ đang xem (ngày của kỳ trước đã nằm trong
 *           tồn đầu kỳ rồi — trừ lại là đếm đôi). Batch chỉ nhận trừ từ
 *           NGÀY XUẤT KHO của chính nó trở đi.
 *   DỰ BÁO: chạy thêm một lượt sang các ngày tương lai bằng plan X (thiếu
 *           plan thì bình quân 7 ngày gần nhất) → biết batch sẽ hết ngày
 *           nào. Còn ≤ 7 ngày thì tô cam. Lượt này KHÔNG đụng "Thực còn".
 *
 * Bảng FEED OL1 KHÔNG hiện ngoài trang — bấm nút "⛽ FEED OL1" để mở modal.
 * ⚠ Cần deploy rules có ".indexOn": ["st"] cho knq_bonded/gi và knq_bonded/go.
 * ------------------------------------------------------------
 * v4.96 — GIAO DIỆN CHUYỂN SANG TIẾNG ANH + đổi cách theo dõi:
 *   • BỎ cột "Ngày tờ khai" và "Ngày nhập/xuất" (cả GET IN lẫn GET OUT).
 *     NGÀY ĐƯỢC PHÉP DÙNG BATCH NẰM NGAY TRONG MÃ BATCH: 260714X001 ⇒
 *     14/07/2026, batch chỉ nhận trừ lùi từ ngày đó trở về sau. Xem
 *     _batchDate(). Field date/regDate vẫn còn trong Firebase + Excel export
 *     cho dữ liệu cũ, chỉ không hiện / không sửa được trên bảng nữa.
 *   • THÊM cột "HQ Approved Qty" — khối lượng Hải quan đồng ý cho get out.
 *     GÕ TAY, CHỈ ĐỂ THAM CHIẾU, KHÔNG tham gia tính toán.
 *   • "Tồn đầu kỳ" đổi tên thành "SAP Qty" — bản chất là khối lượng GR nhập
 *     vào SAP; batch dùng không hết khi 📌 Close Period thì thực còn cuối kỳ
 *     thành SAP Qty (tồn đầu) của kỳ sau. Cách tính KHÔNG đổi.
 *   • THÊM cột "VASSCM ✔" + "VASSCM Date". ✔ DONE = ĐÃ BƠM XONG **VÀ** ĐÃ
 *     KHAI VASSCM ⇒ hàng đã ra khỏi kho ngoại quan, Actual Left ép về 0.
 *   • Trạng thái mới 'ready' = bơm hết + đã khai VASSCM, chờ tick ✔ Done.
 * ------------------------------------------------------------
 * v4.97 — QUẢN LÝ THEO BATCH, DỄ NHÌN:
 *   • MÀU THEO LOẠI LÔ: mỗi dòng get out có thanh màu + ô batch tô theo chữ
 *     cái P/X/D/E (P chàm · X tím · D xanh mòng két · E hổ phách).
 *   • ▶ PUMPING NOW: đánh dấu ĐÚNG MỘT batch mỗi (Mat × loại lô) — batch đầu
 *     hàng FIFO còn hàng và đã tới ngày dùng. Đó là batch thực tế đang bơm ra.
 *     Xem cờ r.head, đặt trong lượt 1 của vòng FIFO.
 *   • THANH LỌC: tìm theo mã batch / số tờ khai / tên tàu · lọc theo tình
 *     trạng · lọc theo loại lô. Đang lọc thì mọi nhóm tự mở, kèm chip đếm.
 *   • DÒNG GET IN: hiện chuỗi chip đếm tình trạng các dòng get out của chuyến,
 *     bấm vào để gập/mở. Chuyến nào đã bơm ra hết thì TỰ GẬP lúc mở tab
 *     (_autoCollapse) để bảng chỉ còn batch đang sống.
 * ------------------------------------------------------------
 * v4.98 — ĐỐI CHIẾU VỚI SAP (đi kèm sp.js v4.98):
 *   • ⬇ Update D/E from SAP nay đối chiếu CẢ P/X (không đè số, chỉ so):
 *     lệch giữa "SAP qty" gõ tay và End Stock của SAP → hiện Δ màu cam.
 *   • Báo luôn số mã batch có trong SAP SLoc 1100 mà CHƯA khai ở bảng KNQ.
 *   • Chưa bấm nút thì gợi ý "SAP: not pulled yet", không còn báo nhầm
 *     "code not found" như trước.
 * ------------------------------------------------------------
 * v4.99 — ⭐ MỌI SỐ CỦA KNQ LÀ SỐ CỦA **NGÀY HÔM QUA** (D-1) ⭐
 *   SAP luôn chậm hơn thực tế 1 ngày: hôm nay 19/08 thì SAP mới chốt xong
 *   18/08, vì 19/08 đang bơm dở, chưa có số cuối cùng. Cho nên:
 *     • _asOf() = hôm qua. Đây là NGÀY DỮ LIỆU của cả tab.
 *     • Trừ lùi THỰC (Used / Actual left) chỉ chạy tới _asOf(), KHÔNG tính
 *       ngày hôm nay. Trước v4.99 chạy tới hôm nay ⇒ ăn gian một ngày.
 *     • FEED OL1 từ HÔM NAY tới cuối tháng chỉ dùng để DỰ BÁO ngày bơm xong.
 *     • D/E lấy End Stock của SAP ĐÚNG NGÀY _asOf() (hoặc ngày gần nhất
 *       trước đó). SAP không có số ngày hôm qua ⇒ CẢNH BÁO.
 *     • P/X: hôm qua chưa gõ TỔNG P+X (đang chạy mức tạm tính 2.000 T)
 *       ⇒ CẢNH BÁO, vì số "đã bơm" lúc đó là số đoán chứ không phải số thật.
 *   Cảnh báo gom vào một dải #knq-alerts ngay dưới thanh lọc.
 *   ⬇ Sync from SAP nay chạy CHO CẢ 4 loại lô: D/E ghi thẳng vào Actual left
 *   (sapT), P/X chỉ ghi sapEnd để ĐỐI CHIẾU (P/X vẫn trừ lùi theo FEED OL1).
 *   Thêm nút ⇐ SAP qty đổ End Stock của SAP vào cột SAP qty cho MỌI loại lô.
 *   Cột Actual left có ký hiệu ✓ SAP / Δ để biết đang khớp hay lệch với SAP.
 * ------------------------------------------------------------
 * v4.102 — ⭐ DỮ LIỆU SỐNG ĐỒNG BỘ MỌI MÁY · KỲ CŨ CHỈ LƯU TRỮ ⭐
 *
 *   ① CON TRỎ KỲ  `knq_bonded/meta/curPeriod` = KỲ ĐANG MỞ, dùng chung cho
 *      mọi máy. Kỳ ≥ curPeriod là DỮ LIỆU SỐNG: tải về + gắn listener
 *      realtime. Kỳ < curPeriod là LƯU TRỮ: vẫn nằm nguyên trên Firebase
 *      nhưng KHÔNG tải về, KHÔNG đồng bộ nữa — mở bằng nút 📜 Archive
 *      (đọc `knq_bonded/periods/<YYYY-MM>` một lần, read-only).
 *
 *   ② ĐỒNG BỘ THẬT: gắn child_added/changed/removed cho gi · go · use.
 *      Máy A gõ FEED OL1 → máy B thấy ngay, không cần F5. Ghi của CHÍNH
 *      máy mình bị chặn dội ngược (_echo) để khỏi vẽ lại thừa. Ô đang gõ
 *      dở (còn trong _dirty) LUÔN thắng số từ xa cho tới khi đẩy xong.
 *
 *   ③ TỰ ĐẨY: mọi thao tác sửa đều hẹn giờ đẩy lên Firebase sau 1,5 s
 *      (_schedulePush). 💾 Save chỉ là "đẩy ngay". Không còn cảnh gõ OL1
 *      xong quên bấm Save ⇒ máy khác không thấy gì.
 *
 *   ④ 📌 CLOSE PERIOD ĐỌC SAP LÀM SỐ CHÍNH THỨC
 *      SAP cho lô P và X bị CHẬM VÀI NGÀY sau ngày chốt kỳ (độ trễ của
 *      công tác đóng kỳ đẩy dữ liệu lên SAP). Vì vậy nút này KHÔNG lấy
 *      mốc D-1 như ⬇ Sync from SAP, mà lấy End Stock tại **NGÀY CUỐI
 *      CÙNG CỦA KỲ** (_lastDay(M)) và ĐÈ vào tồn đầu kỳ mới cho CẢ 4
 *      loại lô P/X/D/E. Lô nào SAP chưa có số ở ngày đó thì mới lui về
 *      số app tự tính; đều được đếm và báo rõ trong hộp xác nhận.
 *      Đóng kỳ xong: ghi snapshot `periods/<M>`, đẩy `meta/curPeriod`
 *      lên Firebase NGAY để mọi máy nhảy kỳ theo.
 *
 *   ⑤ QUÁ HẠN ĐÓNG KỲ (đã sang tháng mới mà chưa bấm 📌)
 *      • Dải #knq-alerts hiện BANNER ĐỎ kèm nút đóng kỳ ngay tại chỗ.
 *      • Số KHÔNG đứng lại: kỳ đang MỞ thì lượt trừ lùi THỰC chạy tới
 *        _asOf() thay vì dừng ở ngày cuối tháng ⇒ vẫn trừ tiếp trên BỘ
 *        BATCH CỦA KỲ CŨ bằng FEED OL1 của tháng mới người dùng nhập.
 *        Kỳ ĐÃ ĐÓNG vẫn kẹp ở cuối tháng để lịch sử tra lại không đổi.
 * ------------------------------------------------------------
 * v4.103 — ⭐ ĐỐI CHIẾU SAP ĐÚNG BẢN CHẤT TỪNG LOẠI LÔ ⭐
 *
 *   ⑥ P/X KHÔNG BAO GIỜ "KHỚP" VỚI SAP — VÀ ĐÓ LÀ ĐÚNG.
 *      SAP chỉ khai lô P/X **MỘT LẦN MỖI THÁNG**, nên End Stock của SAP
 *      đứng yên suốt kỳ trong khi Actual left KNQ trừ lùi hằng ngày theo
 *      FEED OL1. Hai con số ĐƯƠNG NHIÊN lệch nhau. Bản cũ đem so rồi báo
 *      "N batch(es) do not match SAP" ⇒ BÁO NHẦM, đã GỠ.
 *        • P/X : SAP qty = số SAP khai đầu kỳ (chỗ này mới đáng soi, badge
 *                dưới ô SAP qty lo). Actual left = SAP qty − OL1 đã dùng.
 *        • D/E : SAP cập nhật LIÊN TỤC THEO NGÀY ⇒ Actual left KNQ LẤY
 *                THẲNG số SAP của D-1. Chỉ D/E mới có ✓ SAP / Δ.
 *
 *   ⑦ QUÉT SAP HẰNG NGÀY + DẤU THỜI GIAN
 *      `knq_bonded/meta/sapSync = {at, by, asOf, de, px}` — mọi máy đọc
 *      chung, hiện ngay trên thanh công cụ và trong dải cảnh báo để nhìn
 *      là biết số D/E đang mới tới đâu. Mở tab mà lần quét gần nhất chưa
 *      tới D-1 thì TỰ QUÉT LẠI (nếu tab SAP đã có dữ liệu).
 *
 *   ⑧ TỔNG FEED OL1 RA NGOÀI MÀN HÌNH CHÍNH (#knq-ol1sum)
 *      Hai cụm: **THỰC TỚI D-1** (số đã dùng thật) và **CẢ KỲ kể cả plan**,
 *      mỗi cụm đủ TOTAL P+X · P · X. Trong modal ⛽ FEED OL1, dòng TOTAL
 *      chuyển LÊN ĐẦU bảng và thêm dải tổng tới D-1 phía trên.
 * ------------------------------------------------------------
 * v4.104 — ⭐ VÒNG ĐỜI LÔ P/X: CHỈ ĐÓNG KỲ MỚI ĐƯỢC ĐÓNG LÔ ⭐
 *
 *   ⑨ LỖI NẶNG ĐÃ SỬA. Tick ✔ Done trên một lô P/X làm app ép Actual left
 *      = 0, đặt st='done' và LẦN SAU KHÔNG TẢI VỀ NỮA — trong khi SAP vẫn
 *      còn hàng cho lô đó. Bộ trừ lùi mất hẳn lượng hàng ấy ⇒ số của cả kỳ
 *      sai. (Dữ liệu thật: 5 lô P/X bị đóng nhầm, tổng 13 695 432 kg.)
 *      LUẬT MỚI, theo đúng cách SAP khai:
 *        • P/X: ✔ Done / VASSCM **KHÔNG** đóng lô, **KHÔNG** ép về 0.
 *          Ô tick bị KHOÁ. Lô P/X chỉ đóng khi bấm 📌 Close period và End
 *          Stock SAP của NGÀY CUỐI KỲ bằng 0. Còn > 0 ⇒ mang sang kỳ sau
 *          làm SAP qty đầu kỳ mới.
 *        • D/E: giữ nguyên — SAP cập nhật theo ngày nên tick ✔ Done vẫn là
 *          cách đóng lô bình thường.
 *      `_rescuePX()` chạy một lần khi mở tab: kéo lại các lô P/X từng bị
 *      đóng nhầm (st='done' mà SAP còn hàng, kỳ chưa đóng), mở lại và ghi
 *      sửa lên Firebase.
 *
 *   ⑩ D/E — THEO DÕI GIẢM DẦN QUA CÁC LẦN SYNC
 *      Mỗi lần ⬇ Sync ghi `sapH[YYYY-MM-DD] = End Stock` (giữ 20 mốc gần
 *      nhất). So hai mốc gần nhất ⇒ biết lô nào ĐANG BƠM RA (giảm) và tốc
 *      độ giảm kg/ngày ⇒ ▶ PUMPING NOW cho D/E là số THẬT chứ không suy ra.
 *   ⑪ CẢNH BÁO SẮP CẠN: còn dưới LOW_KG = 200 tấn thì tô cam trên bảng và
 *      đếm riêng ở thẻ tổng.
 *   ⑫ GIAO DIỆN GỘP LẠI: bỏ dải chip + 3 cụm tổng rời rạc, thay bằng 4 THẺ
 *      (#knq-cards): TỒN KHO · ▶ ĐANG BƠM RA · OL1 ĐÃ DÙNG · SAP. Thanh
 *      công cụ chia nhóm PERIOD · DECLARE · SAP · DATA.
 * ⚠ Firebase rules: cần ".indexOn": ["st"] cho knq_bonded/gi và /go.
 * ============================================================ */
"use strict";

const KNQ = (function(){

  const FB_PATH = 'knq_bonded';
  const MATS  = ['C3','C4'];
  const MAT_NAME = { C3:'PROPANE', C4:'BUTANE' };
  const TYPES = ['P','X','D','E'];
  const LETTER_NAME = { P:'Petchem', X:'Export Petchem', D:'Domestic', E:'Export' };
  const NAME_LETTER = { 'petchem':'P', 'export petchem':'X', 'domestic':'D', 'export':'E' };
  const WARN_DAYS = 7;             /* còn ≤ 7 ngày → tô cam                 */
  const AVG_DAYS  = 7;             /* bình quân mấy ngày để suy plan P      */
  const HORIZON   = 240;           /* chiếu tối đa bao nhiêu ngày về tương lai */
  const COLS      = 16;            /* số cột của bảng chính (dùng cho colspan) */
  const DEF_TOT_KG= 2000000;       /* ngày chưa gõ TỔNG P+X → TẠM TÍNH 2.000 tấn */
  const SAP_TOL   = 1;             /* kg — lệch trong ngưỡng này coi là khớp SAP */
  const LOW_KG    = 200000;        /* ⭐ còn dưới 200 tấn → cảnh báo sắp cạn  */
  const SAPH_KEEP = 20;            /* giữ bao nhiêu mốc lịch sử SAP mỗi lô    */

  /* ── RAM ─────────────────────────────────────────────────── */
  const GI  = {};                  /* id → dòng GET IN  (1 chuyến tàu)      */
  const GO  = {};                  /* id → dòng GET OUT (1 mã batch)        */
  /* USE: 'YYYY-MM-DD' → { t, x, xp, xs, note } — ĐƠN VỊ KG
       t  = TỔNG P+X gõ tay (chưa gõ → tạm tính DEF_TOT_KG)
       x  = X (Export Petchem) — gõ tay / import / dán Excel
       xp = plan X gốc từ file (chỉ để đối chiếu + chiếu tương lai)
       xs = nguồn của ô x: 'm' gõ tay · 'a' actual từ file · 'p' plan từ file
       p  = SCHEMA CŨ (P gõ tay) — vẫn đọc để không mất dữ liệu, không ghi mới */
  const USE = {};
  const SAPB= { C3:{}, C4:{} };    /* mat → mã batch → {endKg,date}         */

  let _loaded=false, _allLoaded=false, _initDone=false;
  let _dirty={}, _fb=null, _seq=0;
  let _month='', _useMonth='', _sapAsOf='', _sapWant='';
  /* ⭐ v4.102 — KỲ ĐANG MỞ, chốt bởi 📌 Close period, lưu ở knq_bonded/meta.
     Mọi máy đọc chung con trỏ này. Kỳ ≥ _curPeriod = dữ liệu SỐNG (tải về +
     đồng bộ realtime); kỳ < _curPeriod = LƯU TRỮ (nằm trên Firebase, mở bằng
     📜 Archive, không tải về, không gắn listener). */
  let _curPeriod='';
  let _closed={};                  /* 'YYYY-MM' → {at,by,sapAsOf} kỳ đã đóng */
  let _live=false;                 /* đã gắn listener realtime chưa          */
  let _echo=0, _echoUntil=0;       /* chặn dội ngược ghi của CHÍNH máy này   */
  let _pushT=null, _renT=null;     /* hẹn giờ tự đẩy / vẽ lại                */
  let _pushing=0;                  /* số lệnh update() đang bay             */
  let _arch=null, _archM='';       /* snapshot kỳ đã đóng đang mở ở 📜 Archive */
  /* ⭐ v4.103 — DẤU THỜI GIAN QUÉT SAP, dùng chung mọi máy (meta/sapSync) */
  let _sapSync={ at:'', by:'', asOf:'', de:0, px:0 };
  let _reopened=null;              /* kết quả _rescuePX() để nêu trong cảnh báo */
  let _autoSap=false;              /* đã tự quét SAP trong phiên này chưa    */
  let _archBusy=false;
  let _olUnit='T';                 /* đơn vị gõ ở modal OL1: 'T' hay 'kg'   */
  let _imp=null;                   /* bảng thô vừa đọc từ file Excel        */
  let _wb=null;                    /* workbook đang mở (để đổi sheet)       */
  let _paste=false;                /* đang mở ô dán từ Excel                */
  let _avg={P:0,X:0};              /* bình quân 7 ngày, tính 1 lần mỗi recalc */
  const _open={};                  /* giId → false nếu đang gập             */
  /* ── v4.97 THANH LỌC ──────────────────────────────────────
     _fq  = chuỗi tìm (mã batch / số tờ khai / tên tàu / ghi chú)
     _fSt = '' hoặc 1 trong using|wait|zero|ready|done
     _fLot= '' hoặc P|X|D|E
     Đang lọc thì bỏ qua _open để kết quả không bị giấu trong nhóm đã gập. */
  let _fq='', _fSt='', _fLot='';
  let _autoDone=false;             /* đã tự gập chuyến xong hàng 1 lần chưa  */
  const ST_NAME={ using:'Pumping', wait:'Not started', zero:'VASSCM pending',
                  ready:'Ready to close', done:'Done' };

  /* ============================================================
     HELPERS
  ============================================================ */
  function _esc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s)
    : String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function _say(m,t){ if(typeof toast==='function') toast(m,t); else console.log('[KNQ]',m); }
  function _canWrite(){ try{ return (typeof canWrite==='function') ? canWrite() : true; }catch(_){ return true; } }
  function _n(v){ const x=_num(v); return x==null?0:x; }
  /* số hoặc null — gõ chữ vào ô số thì thành RỖNG, không thành 0 */
  function _num(v){
    if(v===null||v===undefined) return null;
    if(typeof v==='number') return isFinite(v)?v:null;
    let s=String(v).trim().replace(/,/g,'').replace(/\s/g,'').replace(/[−‒–—]/g,'-');
    if(!s) return null;
    if(/-$/.test(s)) s='-'+s.slice(0,-1);
    if(!/^-?\d*\.?\d+$/.test(s)) return null;
    const n=parseFloat(s); return isFinite(n)?n:null;
  }
  function _today(){ const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _ym(d){ return String(d||'').slice(0,7); }
  /* ⭐ NGÀY DỮ LIỆU CỦA TAB KNQ = HÔM QUA.
     SAP chốt sau 1 ngày và hôm nay còn đang bơm ⇒ số cuối cùng gần nhất là
     của hôm qua. Mọi phép trừ lùi THỰC dừng ở đây; từ hôm nay trở đi là
     DỰ BÁO. Đừng thay bằng _today() ở bất kỳ đâu trong phần tính toán. */
  function _asOf(){ return _addDays(_today(),-1); }
  function _addDays(iso,k){
    const t=Date.parse(iso+'T00:00:00Z'); if(isNaN(t)) return '';
    const d=new Date(t+k*86400000);
    return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  function _dayDiff(a,b){ if(!a||!b) return null;
    return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000); }
  function _dmy(iso){ if(!iso) return ''; const p=String(iso).split('-');
    return p.length===3 ? (p[2]+'/'+p[1]+'/'+p[0].slice(2)) : iso; }
  /* KG — số nguyên có dấu phân cách */
  function _K(v){ return (v==null||!isFinite(v)) ? '' :
    Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
  /* KG → tấn, 3 số lẻ (chỉ để chú thích) */
  function _T(v){ return (v==null||!isFinite(v)) ? '' :
    (Number(v)/1000).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}); }
  function _letterOf(code){
    const s=String(code||'').trim().toUpperCase();
    const m=s.match(/^\d{6}([DEPX])/); return m?m[1]:'';
  }
  /* "Export Petchem" / "Petchem" / "Domestic" / "Export" → P X D E */
  function _letterOfName(s){
    const k=String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
    return NAME_LETTER[k]||'';
  }
  function _newId(p){ _seq++; return (p||'R')+Date.now().toString(36)+_seq.toString(36); }
  function _lastDay(ym){
    const y=+String(ym).slice(0,4), m=+String(ym).slice(5,7);
    if(!y||!m) return '';
    return ym+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  }
  /* ── NGÀY CÓ HIỆU LỰC CỦA 1 DÒNG GET-OUT ─────────────────────
     v4.96: LẤY TỪ MÃ BATCH, không còn ô ngày trên bảng.
     260714X001 → 2026-07-14 ⇒ batch chỉ được dùng (nhận trừ lùi) từ
     14/07/2026 trở về sau. r.date / r.regDate chỉ còn là đường lui cho dòng
     cũ chưa gõ mã batch. */
  function _batchDate(code){
    const m=String(code||'').trim().toUpperCase().match(/^(\d{2})(\d{2})(\d{2})[DEPX]/);
    if(!m) return '';
    const mm=+m[2], dd=+m[3];
    if(mm<1||mm>12||dd<1||dd>31) return '';
    return '20'+m[1]+'-'+m[2]+'-'+m[3];
  }
  function _outDate(r){ return _batchDate(r.batch)||r.date||r.regDate||''; }
  /* ⭐ v4.104 — LÔ ĐÃ ĐÓNG THẬT SỰ CHƯA?
     D/E : SAP cập nhật theo ngày ⇒ tick ✔ Done là đóng, như cũ.
     P/X : SAP chỉ khai MỘT LẦN MỖI THÁNG. Chừng nào SAP còn ghi nhận hàng
           thì lô ĐANG được dùng để trừ lùi cho kỳ — tick ✔ Done KHÔNG được
           phép đóng nó. Chỉ 📌 Close period (thấy End Stock cuối kỳ = 0) mới
           đóng, và lúc đó chính nó ghi st='done'. */
  function _isPX(r){ return r.letter==='P'||r.letter==='X'; }
  /* ⚠ ĐỪNG đọc r.st ở đây — recalc() ghi đè r.st mỗi vòng, đọc nó là vòng
     lặp tự tham chiếu. `pxDone` là field BỀN, CHỈ closeMonth() được đặt. */
  function _closedRow(r){ return _isPX(r) ? !!r.pxDone : !!r.hqDone; }
  function _sortKey(r){ return (_outDate(r)||'9999-12-31')+'|'+String(r.decl||'')+'|'+String(r._id||''); }
  function _nextYm(ym){
    let y=+String(ym).slice(0,4), m=+String(ym).slice(5,7);
    if(!y||!m) return '';
    m++; if(m>12){ m=1; y++; }
    return y+'-'+String(m).padStart(2,'0');
  }
  /* ── v4.102 — KỲ ĐANG MỞ ─────────────────────────────────────
     Chưa đọc được meta (lần đầu dùng app / đang tải) thì coi tháng này là
     kỳ mở — giữ đúng hành vi cũ, không bắt người dùng làm gì thêm. */
  function _curP(){ return _curPeriod || _ym(_today()); }
  function _isOpenP(M){ return String(M||'') >= _curP(); }
  /* đã sang tháng mới mà kỳ cũ chưa đóng? */
  function _overdue(){ return _ym(_today()) > _curP(); }
  /* CỬA SỔ ĐỒNG BỘ của bảng FEED OL1: từ đầu kỳ mở lùi 31 ngày (đủ cho bình
     quân 7 ngày vắt qua đầu tháng). Ngày cũ hơn thuộc kỳ đã đóng — vẫn nằm
     trên Firebase nhưng KHÔNG tải về, KHÔNG đồng bộ. */
  function _liveFrom(){ return _addDays(_curP()+'-01',-31); }
  function _who(){
    try{ return (typeof CURRENT_USER!=='undefined' && CURRENT_USER && CURRENT_USER.name) ? CURRENT_USER.name : ''; }
    catch(_){ return ''; }
  }
  function _stamp(){
    const d=new Date(), z=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+' '+z(d.getHours())+':'+z(d.getMinutes());
  }
  function _hm(){ const d=new Date(), z=n=>String(n).padStart(2,'0');
    return z(d.getHours())+':'+z(d.getMinutes())+':'+z(d.getSeconds()); }
  function _el(id){ try{ return document.getElementById(id); }catch(_){ return null; } }
  /* đồng bộ 2 ô <input type=month> trên thanh công cụ với _month/_useMonth */
  function _syncEls(){
    const m=_el('knq-month');     if(m) m.value=_month;
    const u=_el('knq-use-month'); if(u) u.value=_useMonth;
  }

  /* ============================================================
     TỒN ĐẦU KỲ — trái tim của cách quản lý theo tháng
     ------------------------------------------------------------
     Hàng có thể vào kho ngoại quan từ nhiều tháng trước. Batch KHÔNG bị
     lọc theo tháng — nó nằm trong bộ dữ liệu trừ lùi cho tới khi người dùng
     tick ✔ Xong. Cái thay đổi theo tháng là ĐIỂM XUẤT PHÁT:
       • batch ra kho ngay trong kỳ đang xem  → tồn đầu kỳ = số khai (sapKg)
       • batch của kỳ trước                   → tồn đầu kỳ = op[kỳ], do nút
         "📌 Chốt kỳ" ghi lại = thực còn cuối kỳ trước
       • chưa từng chốt kỳ (lần đầu dùng app) → lấy luôn số khai, đúng nghĩa
         "người dùng khai trước lượng tồn đang có"
  ============================================================ */
  function _openingOf(r,M){
    const om=_ym(_outDate(r));
    if(om && om===M) return _num(r.sapKg);          /* ra kho trong kỳ này */
    if(r.op && r.op[M]!=null) return _num(r.op[M]);
    if(om && om>M)  return _num(r.sapKg);           /* kỳ sau — chưa tới lượt */
    /* kỳ trước mà chưa chốt kỳ: lấy op gần nhất ≤ M, không có thì số khai */
    let bk='', bv=null;
    Object.keys(r.op||{}).forEach(k=>{ if(k<=M && k>bk){ bk=k; bv=r.op[k]; } });
    if(bv!=null){ r._opFrom=bk; return _num(bv); }
    r._opFrom='khai';
    return _num(r.sapKg);
  }
  /* ô "SAP Qty" (tồn đầu kỳ) gõ tay.
     • Kỳ này ĐÃ có tồn đầu kỳ do 📌 Chốt kỳ ghi ⇒ sửa đúng op[kỳ] đó.
     • Chưa có ⇒ ghi vào sapKg — số khai gốc. Làm vậy để lần đầu khai một
       batch cũ (vào kho từ tháng trước) số không "biến mất" khi người dùng
       sửa lại ngày ra kho sang tháng khác. */
  function setOp(id,val){
    const r=GO[id]; if(!r) return;
    const v=_num(val), M=_month||_ym(_today());
    if(r.op && r.op[M]!=null){ r.op[M]=(v==null?'':v); _markOp(id,M,r.op[M]); }
    else { r.sapKg=(v==null?'':v); _markField('go/'+id,'sapKg',r.sapKg); }
    render();
  }

  /* ============================================================
     TÍNH
  ============================================================ */
  /* con của 1 chuyến, sắp theo ngày xuất kho */
  function childrenOf(giId){
    return Object.values(GO).filter(r=>r.giId===giId)
      .sort((a,b)=>{ const ka=_sortKey(a), kb=_sortKey(b); return ka<kb?-1:(ka>kb?1:0); });
  }
  /* ============================================================
     LƯỢNG DÙNG MỘT NGÀY  —  TỔNG P+X GÕ TAY, P SUY RA
     ------------------------------------------------------------
     Người dùng gõ TỔNG P+X (feed OL1 cả ngày) và X (Export Petchem,
     gõ tay / import / dán Excel).  P = TỔNG − X, KHÔNG gõ nữa.
     Ngày chưa gõ TỔNG → TẠM TÍNH DEF_TOT_KG (2.000 tấn/ngày).
  ============================================================ */
  /* TỔNG P+X thật của ngày (kg) — null nếu chưa gõ.
     Dữ liệu cũ chỉ có {p,x} rời → quy về tổng để không mất số. */
  function _totOf(u){
    if(!u) return null;
    const t=_num(u.t); if(t!=null) return t;
    const p=_num(u.p);                       /* schema cũ */
    if(p!=null){ const x=_num(u.x); return p+(x==null?0:x); }
    return null;
  }
  function _totEff(u){ const t=_totOf(u); return (t!=null)?t:DEF_TOT_KG; }
  /* X có hiệu lực (kg).
     'act'  = CHỈ ô X (gõ tay hoặc đã import vào ô X) — dùng cho Thực còn.
     'proj' = thiếu thì lấy plan X, thiếu nữa thì bình quân. */
  function _xOf(u,mode,avg){
    const x=_num(u&&u.x); if(x!=null) return x;
    if(mode!=='proj') return 0;
    const p=_num(u&&u.xp); if(p!=null) return p;
    return avg||0;
  }
  /* P suy ra của ngày (kg), không âm */
  function _pOf(u,mode,avgX){ return Math.max(0,_totEff(u)-_xOf(u,mode,avgX)); }
  function _useOf(d,L,mode,avg){
    if(L!=='P'&&L!=='X') return 0;
    const pj=(mode==='proj');
    const u=USE[d];
    /* ngày KHÔNG có dòng trong bảng FEED OL1: lượt thực = 0, lượt chiếu =
       bình quân. KHÔNG áp 2.000 tấn ở đây — mức tạm tính chỉ dành cho ngày
       ĐÃ có dòng mà người dùng chưa gõ TỔNG. */
    if(!u) return pj?(avg||0):0;
    if(L==='X') return _xOf(u,mode,pj?avg:0);
    return _pOf(u,mode,pj?_avg.X:0);
  }
  /* ⭐ v4.103 — CỘNG FEED OL1 TRONG MỘT KHOẢNG NGÀY (kg).
     mode 'act'  = số THỰC: X chỉ lấy ô X đã gõ/import, thiếu coi như 0.
     mode 'proj' = số CẢ KỲ: thiếu X thì lấy plan X trong file.
     Ngày có dòng mà chưa gõ TỔNG ⇒ tính theo mức tạm tính và ĐẾM vào .def,
     để người đọc biết trong tổng này có bao nhiêu ngày là số đoán. */
  function _ol1Sum(from,to,mode){
    const o={ t:0, p:0, x:0, n:0, def:0, first:'', last:'' };
    Object.keys(USE).sort().forEach(d=>{
      if(!d || d<from || d>to) return;
      const u=USE[d]||{};
      const raw=_totOf(u), dfl=(raw==null);
      const tot=dfl?DEF_TOT_KG:raw;
      const xv=(mode==='proj') ? _xOf(u,'proj',0) : (_num(u.x)!=null?_num(u.x):0);
      o.n++; if(dfl) o.def++;
      o.t+=tot; o.x+=xv; o.p+=Math.max(0,tot-xv);
      if(!o.first) o.first=d;
      o.last=d;
    });
    return o;
  }
  /* bình quân AVG_DAYS ngày gần nhất CÓ SỐ (kg/ngày) */
  function _avgRate(L){
    const t=_asOf(), v=[];      /* v4.99 — bình quân KHÔNG lấy ngày hôm nay */
    Object.keys(USE).filter(d=>d<=t).sort().forEach(d=>{
      const u=USE[d]||{};
      if(L==='X'){ const x=_num(u.x); if(x!=null) v.push(x); }
      else if(_totOf(u)!=null) v.push(_pOf(u,'act',0));
    });
    const last=v.slice(-AVG_DAYS);
    return last.length ? last.reduce((a,b)=>a+b,0)/last.length : 0;
  }

  function recalc(){
    const gis=Object.values(GI), gos=Object.values(GO);
    const T=_today(), A=_asOf();      /* A = ngày dữ liệu (hôm qua) */
    const M=_month||_ym(T);                 /* KỲ TRỪ LÙI đang xem */
    const M0=M+'-01', M9=_lastDay(M);

    gis.forEach(g=>{
      g.qtyN   = _num(g.qtyKg);
      g.ym     = _ym(g.date||g.regDate);
      g.amount = (_num(g.price)!=null && g.qtyN!=null) ? _num(g.price)*g.qtyN/1000 : null;
      g.outKg=0; g.warn='';
    });
    gos.forEach(r=>{
      r.letter = r.letter || _letterOf(r.batch);
      r._opFrom='';
      r.baseKg = _openingOf(r,M);               /* TỒN ĐẦU KỲ của kỳ đang xem */
      r.declKg = _num(r.sapKg);                 /* số khai ban đầu (tham chiếu)*/
      r.qtyN   = _num(r.qtyKg);                 /* Trọng lượng tờ khai        */
      r.hqQtyN = _num(r.hqQty);                 /* HQ đồng ý get out — tham chiếu */
      r.amount = (_num(r.price)!=null && r.qtyN!=null) ? _num(r.price)*r.qtyN/1000 : null;
      /* ⚠ ƯU TIÊN số SAP TRA SỐNG theo mã batch (_sapOf), chỉ lui về field đã
         lưu khi chưa sync. Nếu chỉ đọc r.sapEnd thì batch mới khai sau lần
         sync gần nhất sẽ báo "no SAP row" trong khi gợi ý ngay bên cạnh lại
         hiện số SAP — hai chỗ đá nhau, người dùng mất tin. */
      r.sapNow = _sapOf(r);                     /* số SAP cùng mã (đối chiếu) */
      r.sapEndN = (r.sapNow!=null) ? r.sapNow : _num(r.sapEnd);
      r.mat    = r.mat || (GI[r.giId]?GI[r.giId].mat:'C3');
      r.warn=''; r.eta=''; r.etaDays=null; r.zeroDate=''; r.projected=false;
      r.remainKg=null; r.usedKg=null; r.balKg=null; r.head=false;
      r.sapDiff=null; r.sapOk=null;
      /* ⭐ v4.104 — D/E: so hai mốc SAP gần nhau ⇒ lô nào ĐANG BƠM RA và
         tốc độ rút. Đây là số THẬT lấy từ SAP, không phải dự đoán. */
      r.drop=null; r.dropFrom=''; r.dropTo=''; r.dropRate=null;
      if(!_isPX(r) && r.sapH){
        const ks=Object.keys(r.sapH).sort();
        if(ks.length>=2){
          const a=ks[ks.length-2], b=ks[ks.length-1];
          const d=_num(r.sapH[a]), e=_num(r.sapH[b]);
          if(d!=null && e!=null && d-e>0.5){
            r.drop=Math.round(d-e); r.dropFrom=a; r.dropTo=b;
            const nd=_dayDiff(b,a)||1;
            r.dropRate=Math.round(r.drop/Math.max(1,nd));
          }
        }
      }
    });

    /* ── số dư còn lại của TỪNG CHUYẾN (cột "Còn lại của chuyến") ── */
    gis.forEach(g=>{
      let bal=(g.qtyN!=null?g.qtyN:0);
      childrenOf(g._id).forEach(r=>{
        if(r.qtyN!=null) bal-=r.qtyN;
        r.balKg=bal;
      });
      g.outKg=(g.qtyN!=null?g.qtyN:0)-bal;
      g.balKg=bal;
      if(bal<-0.5) g.warn='Get-out exceeds the received quantity by '+_K(-bal)+' kg';
    });

    /* ── D / E : lấy thẳng tồn SAP theo mã batch ── */
    gos.forEach(r=>{
      if(_isPX(r)) return;
      const s=_num(r.sapT);
      r.remainKg = (s!=null) ? s : (r.baseKg!=null?r.baseKg:null);
      if(s==null && r.batch) r.warn='Not updated from SAP yet — click ⬇ Sync from SAP';
      /* ⭐ v4.104 — SAP tụt giữa hai lần quét ⇒ lô này ĐANG được bơm ra.
         Với D/E đây là bằng chứng trực tiếp, không cần suy từ hàng đợi FIFO. */
      if(r.drop>0 && !_closedRow(r) && r.remainKg>0.5) r.head=true;
    });

    /* ── P / X : FIFO trong KỲ đang xem, theo bảng FEED OL1 ──────────
       Bộ dữ liệu trừ lùi = MỌI batch chưa tick ✔ Xong, bất kể vào kho từ
       tháng nào. Xuất phát từ TỒN ĐẦU KỲ, chỉ trừ các ngày OL1 THUỘC KỲ này
       (số của kỳ trước đã nằm trong tồn đầu kỳ rồi — trừ lại là đếm đôi).
       • lượt 1 "thực": chỉ ngày trong kỳ và ≤ hôm nay        → Thực còn
       • lượt 2 "chiếu": chạy tiếp sang các kỳ sau bằng plan  → Dự kiến hết */
    _avg={ P:_avgRate('P'), X:_avgRate('X') };
    MATS.forEach(mat=>{
      ['P','X'].forEach(L=>{
        /* ⭐ v4.104 — lọc bằng _closedRow, KHÔNG bằng hqDone: lô P/X bị tick
           ✔ Done nhưng SAP còn hàng vẫn phải nằm trong bộ trừ lùi. */
        const rows=gos.filter(r=>r.mat===mat && r.letter===L && !_closedRow(r) && r.baseKg!=null)
          .sort((a,b)=>{ const ka=_sortKey(a), kb=_sortKey(b); return ka<kb?-1:(ka>kb?1:0); });
        if(!rows.length) return;
        const avg=_avg[L];
        const eligible=(r,d)=>{ const out=_outDate(r); return !(out && out>d); };

        /* ---- lượt 1: THỰC CÒN ---- */
        const p1=rows.map(r=>({ r, left:r.baseKg }));
        /* ⭐ v4.99 — trừ lùi THỰC dừng ở HÔM QUA, không đụng ngày hôm nay:
           hôm nay đang bơm dở, chưa có số cuối cùng.
           ⭐ v4.102 — KỲ ĐANG MỞ thì KHÔNG kẹp ở ngày cuối tháng nữa. Đã sang
           tháng mới mà chưa bấm 📌 Close period ⇒ vẫn trừ tiếp trên BỘ BATCH
           CỦA KỲ CŨ bằng FEED OL1 của tháng mới người dùng nhập vào (cảnh báo
           chứ không đứng số). Kỳ ĐÃ ĐÓNG giữ nguyên cách kẹp cũ để số lịch sử
           tra lại không đổi. */
        const end1=_isOpenP(M) ? A : (M9<A?M9:A);
        for(let d=M0; d && d<=end1; d=_addDays(d,1)){
          let need=_useOf(d,L,'act');
          if(!(need>0)) continue;
          for(let i=0;i<p1.length && need>1e-6;i++){
            const it=p1[i];
            if(!eligible(it.r,d) || it.left<=0) continue;
            const take=Math.min(it.left,need);
            it.left-=take; need-=take;
            if(it.left<=0.5 && !it.r.zeroDate){ it.r.zeroDate=d; it.r.projected=false; }
          }
          if(need>0.5){
            const last=p1[p1.length-1];
            if(last && !last.r.warn) last.r.warn=_dmy(d)+': usage exceeds stock by '+_K(need)+' kg';
          }
        }
        p1.forEach(it=>{ it.r.remainKg=Math.max(0,it.left); });
        /* v4.97 — ▶ PUMPING NOW: batch ĐANG thực sự bị rút ra hôm nay =
           phần tử đầu hàng FIFO còn hàng và đã tới ngày dùng (ngày trong mã
           batch ≤ hôm nay). Mỗi (Mat × loại lô) chỉ có ĐÚNG MỘT. */
        const hd=p1.find(it=>it.left>0.5 && !_closedRow(it.r) && eligible(it.r,T));
        /* eligible xét tới HÔM NAY (batch đã tới ngày dùng thì hôm nay đang
           được bơm), còn số liệu thì vẫn là số chốt của hôm qua. */
        if(hd) hd.r.head=true;

        /* ---- lượt 2: CHIẾU TỚI TƯƠNG LAI (không ghi vào Thực còn) ---- */
        const p2=rows.map(r=>({ r, left:r.baseKg }));
        const stop=_addDays(T,HORIZON);
        for(let d=M0; d && d<=stop; d=_addDays(d,1)){
          /* tới hôm qua = số thật · TỪ HÔM NAY trở đi = dự báo bằng plan X /
             bình quân. Đúng ý "feed OL1 từ hôm nay tới cuối tháng dùng để dự
             đoán ngày bơm xong". */
          const future=(d>A);
          let need=_useOf(d,L,'proj',future?avg:0);
          if(!(need>0)) continue;
          for(let i=0;i<p2.length && need>1e-6;i++){
            const it=p2[i];
            if(!eligible(it.r,d) || it.left<=0) continue;
            const take=Math.min(it.left,need);
            it.left-=take; need-=take;
            if(it.left<=0.5 && !it.r._z2){ it.r._z2=d; }
          }
          if(future && p2.every(it=>it.left<=0.5)) break;
        }
        p2.forEach(it=>{
          const r=it.r;
          if(r.zeroDate) return;                 /* đã hết thật trong kỳ */
          if(r._z2 && r._z2>A){ r.zeroDate=r._z2; r.projected=true; }
        });
        rows.forEach(r=>{ delete r._z2; });
      });
    });

    /* ── đã dùng · % · trạng thái · dự kiến hết ── */
    gos.forEach(r=>{
      if(r.remainKg==null) r.remainKg=r.baseKg;
      /* v4.96 — ✔ DONE = ĐÃ BƠM XONG **VÀ** ĐÃ KHAI VASSCM ⇒ hàng ra khỏi kho
         ngoại quan, thực còn ép về 0.
         ⭐ v4.104 — CHỈ ÁP CHO D/E. Với P/X, SAP khai một tháng một lần nên
         chừng nào SAP còn hàng thì lô vẫn đang được trừ lùi; ép về 0 ở đây
         là xoá sổ hàng có thật (lỗi đã dính, tổng 13,7 triệu kg). */
      const px=_isPX(r);
      if(r.hqDone && !px) r.remainKg=0;
      r.usedKg=(r.baseKg==null||r.remainKg==null)?null:Math.max(0,r.baseKg-r.remainKg);
      r.pct=(r.baseKg>0&&r.usedKg!=null)?Math.min(1,r.usedKg/r.baseKg):0;
      /* ⭐ CÒN DƯỚI 200 TẤN → SẮP CẠN, tô cảnh báo cho dễ thấy */
      r.low=(r.remainKg!=null && r.remainKg>0.5 && r.remainKg<LOW_KG);
      if(_closedRow(r))               r.st='done';
      else if(!(r.remainKg>0.5))      r.st=(r.vas?'ready':'zero');
      else if(r.head)                 r.st='using';   /* đang bơm ra ngay lúc này */
      else if(!(r.usedKg>0.5))        r.st='wait';
      else                            r.st='using';
      /* P/X bị tick ✔ Done từ bản cũ mà SAP còn hàng — nêu đích danh để user
         biết vì sao ô tick vẫn xanh mà lô vẫn đang chạy. */
      if(px && r.hqDone && !_closedRow(r))
        r.warn=r.warn||'Ticked DONE by an older version, but SAP still holds stock — the batch stays '+
               'in the run-down. Only 📌 Close period can close a P/X batch.';
      if(r.st!=='done' && r.st!=='zero' && r.st!=='ready' && r.zeroDate && r.projected){
        r.eta=r.zeroDate; r.etaDays=_dayDiff(r.zeroDate,T);
      }
      /* ── ĐỐI CHIẾU VỚI SAP — ⭐ v4.103: CHỈ D/E ────────────────
         P/X: SAP chỉ khai MỘT LẦN MỖI THÁNG. End Stock của SAP vì thế đứng
         yên cả kỳ, còn Actual left KNQ trừ lùi hằng ngày theo FEED OL1 ⇒ hai
         số ĐƯƠNG NHIÊN khác nhau, đem so là báo nhầm (bản cũ đã dính). Chỗ
         đáng soi của P/X nằm ở ô SAP QTY — nó phải đúng bằng số SAP khai đầu
         kỳ, và badge dưới ô đó đã lo việc này.
         D/E: SAP cập nhật LIÊN TỤC THEO NGÀY ⇒ Actual left KNQ lấy thẳng số
         SAP của D-1. Lệch ở đây = chưa quét SAP mới, đáng báo. */
      if(px){ r.sapDiff=null; r.sapOk=null; }
      else if(r.sapEndN!=null && r.remainKg!=null && !r.hqDone){
        r.sapDiff=Math.round(r.remainKg-r.sapEndN);
        r.sapOk=Math.abs(r.sapDiff)<=SAP_TOL;
      }
    });

    /* ── trạng thái của chuyến ── */
    gis.forEach(g=>{
      const ch=childrenOf(g._id);
      g.remainKg=ch.reduce((a,r)=>a+(r.remainKg||0),0);
      g.baseKg  =ch.reduce((a,r)=>a+(r.baseKg||0),0);
      g.usedSum =ch.reduce((a,r)=>a+(r.usedKg||0),0);
      g.hqSum   =ch.reduce((a,r)=>a+(r.hqQtyN||0),0);
      /* v4.97 — bảng đếm tình trạng get out, hiện ngay trên dòng GET IN để
         chuyến gập lại vẫn đọc được tình hình. */
      g.cnt={using:0,wait:0,zero:0,ready:0,done:0};
      ch.forEach(r=>{ if(g.cnt[r.st]!==undefined) g.cnt[r.st]++; });
      g.nCh=ch.length;
      g.allOut=!!ch.length && ch.every(r=>r.st==='zero'||r.st==='ready'||r.st==='done');
      g.head=ch.some(r=>r.head);
      if(g.hqDone) g.st='done';
      else if(ch.length && ch.every(r=>r.st==='zero'||r.st==='ready'||r.st==='done')) g.st='zero';
      else if(ch.some(r=>r.st==='using')) g.st='using';
      else g.st='wait';
    });
    return { gis, gos };
  }
  /* số SAP của batch cùng mã (để đối chiếu / chép sang) */
  function _sapOf(r){
    if(!r.batch || !SAPB[r.mat]) return null;
    const b=SAPB[r.mat][String(r.batch).trim().toUpperCase()];
    return b ? b.endKg : null;
  }

  /* ── KHÔNG lọc theo tháng ────────────────────────────────────
     ⚠ TỪNG DÍNH LỖI 2 LẦN: hàng vào kho ngoại quan có thể từ nhiều tháng
     trước và vẫn đang được trừ lùi. Lọc bảng theo tháng làm mất chuyến cũ
     lẫn dòng đang khai. Batch chỉ rời bảng khi người dùng TICK ✔ Xong
     (lần mở tab sau không tải về nữa). Tháng chỉ là KỲ TRỪ LÙI. */
  function visibleGi(mat){
    return Object.values(GI).filter(g=>g.mat===mat).sort(_cmpGi);
  }

  /* ── v4.97 THANH LỌC ────────────────────────────────────────
     Lọc ở mức DÒNG GET OUT (đơn vị quản lý là batch). Chuyến chỉ hiện khi
     còn ít nhất 1 batch lọt lưới — nếu không thì cả chuyến ẩn đi. */
  function filterOn(){ return !!(_fq||_fSt||_fLot); }
  function matchGo(r,g){
    if(_fLot && r.letter!==_fLot) return false;
    if(_fSt  && r.st!==_fSt)      return false;
    if(_fq){
      const q=_fq.toLowerCase();
      const hay=[r.batch,r.decl,r.note,g&&g.vessel,g&&g.decl,LETTER_NAME[r.letter]]
        .join(' ').toLowerCase();
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  }
  /* con của chuyến SAU khi lọc */
  function shownChildren(giId){
    const g=GI[giId], ch=childrenOf(giId);
    return filterOn() ? ch.filter(r=>matchGo(r,g)) : ch;
  }
  function onFilter(){
    const q =document.getElementById('knq-f-q');
    const st=document.getElementById('knq-f-st');
    const lt=document.getElementById('knq-f-lot');
    _fq  =(q &&q.value ||'').trim();
    _fSt =(st&&st.value||'');
    _fLot=(lt&&lt.value||'');
    render();
  }
  function clearFilter(){
    _fq=''; _fSt=''; _fLot='';
    const q =document.getElementById('knq-f-q');  if(q)  q.value='';
    const st=document.getElementById('knq-f-st'); if(st) st.value='';
    const lt=document.getElementById('knq-f-lot');if(lt) lt.value='';
    render();
  }
  /* ⊟ / ⊞ hàng loạt. mode: 'all' gập hết · 'none' mở hết · 'out' chỉ gập
     những chuyến đã bơm ra hết (đúng ý "lô nào xong thì thu lại cho đỡ nhiễu") */
  function collapseAll(mode){
    const S=recalc();
    S.gis.forEach(g=>{
      if(mode==='none')      _open[g._id]=true;
      else if(mode==='all')  _open[g._id]=false;
      else if(mode==='out')  _open[g._id]=!g.allOut;
    });
    render();
    if(mode==='out'){
      const n=S.gis.filter(g=>g.allOut).length;
      _say(n?('⊟ Collapsed '+n+' fully pumped-out voyage(s)'):'No voyage is fully pumped out yet','');
    }
  }
  /* tự gập 1 lần lúc mở tab — chuyến nào batch đã ra hết thì thu lại */
  function _autoCollapse(){
    if(_autoDone) return; _autoDone=true;
    const S=recalc();
    S.gis.forEach(g=>{ if(g.allOut) _open[g._id]=false; });
  }
  function _cmpGi(a,b){
    const ka=(a.date||a.regDate||'9999')+String(a.decl||'');
    const kb=(b.date||b.regDate||'9999')+String(b.decl||'');
    return ka<kb?-1:(ka>kb?1:0);
  }

  /* ============================================================
     FIREBASE
  ============================================================ */
  function _ref(){ if(!_fb) _fb=firebase.database().ref(FB_PATH); return _fb; }
  function _mark(path,val){
    if(val && typeof val==='object'){
      const pre=path+'/';
      Object.keys(_dirty).forEach(k=>{ if(k.indexOf(pre)===0) delete _dirty[k]; });
    }
    _dirty[path]=val; _btn(); _schedulePush();
  }
  /* Firebase update() KHÔNG cho map chứa đồng thời 'a/b' (object) và 'a/b/c' */
  function _markField(base,field,val){
    const par=_dirty[base];
    if(par && typeof par==='object') par[field]=val;
    else _dirty[base+'/'+field]=val;
    _btn(); _schedulePush();
  }
  /* op là map lồng — KHÔNG được nhét key 'op/2026-08' vào object, Firebase
     cấm dấu / trong key của payload; phải tạo object con. */
  function _markOp(id,M,val){
    const base='go/'+id, par=_dirty[base];
    if(par && typeof par==='object'){ par.op=par.op||{}; par.op[M]=val; }
    else _dirty[base+'/op/'+M]=val;
    _btn(); _schedulePush();
  }
  /* ── v4.102 · ĐỒNG BỘ NHIỀU MÁY ───────────────────────────────
     _mine()      — event vừa nhận có phải tiếng vọng của chính máy này không
     _dirtyOver() — số từ xa KHÔNG được đè ô người dùng đang gõ dở (_dirty)
     _scheduleRender() — gom nhiều event thành 1 lần vẽ lại */
  function _mine(){ return _echo>0 && Date.now()<_echoUntil; }
  function _dirtyOver(base,obj){
    const o=Object.assign({},obj||{});
    const par=_dirty[base];
    if(par && typeof par==='object') return Object.assign(o,par);
    const pre=base+'/';
    Object.keys(_dirty).forEach(k=>{
      if(k.indexOf(pre)!==0) return;
      const seg=k.slice(pre.length).split('/');
      let t=o;
      for(let i=0;i<seg.length-1;i++){ t[seg[i]]=Object.assign({},t[seg[i]]); t=t[seg[i]]; }
      t[seg[seg.length-1]]=_dirty[k];
    });
    return o;
  }
  function _scheduleRender(){
    if(_renT) return;
    _renT=setTimeout(()=>{ _renT=null;
      render();
      const m=_el('knq-ol1'); if(m && m.classList && m.classList.contains('on')) _renderUse();
    },160);
  }
  function _syncTag(txt,cls){
    const e=_el('knq-sync'); if(!e) return;
    e.textContent=txt||''; e.className='knq-sync '+(cls||'');
    e.title='KNQ data is shared: every change is pushed to Firebase and lands on the other '+
            'machines within a second or two. Archived periods stay on Firebase but stop syncing.';
  }
  /* mọi thao tác sửa đều hẹn giờ đẩy — không còn cảnh quên bấm 💾 Save */
  function _schedulePush(){
    if(!_canWrite()) return;
    if(_pushT) clearTimeout(_pushT);
    _syncTag('… pending','wait');
    _pushT=setTimeout(()=>{ _pushT=null; _flush(false); },1500);
  }
  /* gắn cờ st (open/done) vào map trước khi đẩy */
  /* ⭐ v4.104 — cờ st quyết định lần sau CÓ TẢI VỀ hay không, nên đây là chỗ
     nguy hiểm nhất. Lô P/X KHÔNG bao giờ được đóng ở đây; chỉ closeMonth()
     mới có quyền, và nó ghi thẳng st='done' vào _dirty. */
  function _stampSt(){
    [[GI,'gi'],[GO,'go']].forEach(([BAG,key])=>{
      Object.values(BAG).forEach(r=>{
        const st=(key==='go' && _isPX(r)) ? (r.pxDone?'done':'open') : (r.hqDone?'done':'open');
        if(r._svSt===st) return;
        const base=key+'/'+r._id, par=_dirty[base];
        if(par && typeof par==='object') par.st=st; else _dirty[base+'/st']=st;
        r._prevSt=r._svSt; r._svSt=st;
      });
    });
  }
  /* ĐẨY LÊN FIREBASE. loud=true khi người dùng bấm 💾 Save (có toast). */
  function _flush(loud){
    if(_pushT){ clearTimeout(_pushT); _pushT=null; }
    if(!_canWrite()){ if(loud) _say('⛔ Your account has no write permission','er'); return Promise.resolve(false); }
    /* ⚠ KHÔNG bỏ qua khi đang có lệnh ghi dở. Lần ghi trước cầm map RIÊNG của
       nó (_dirty đã được thay bằng object mới), nên hai lệnh update() không
       giẫm chân nhau. Bỏ qua ở đây từng làm 📌 Close period im lặng không
       đẩy gì lên Firebase. */
    recalc(); _stampSt();
    const map=_dirty; _dirty={};
    const n=Object.keys(map).length;
    if(!n){ if(loud) _say('Nothing to save',''); _btn(); return Promise.resolve(true); }
    _pushing++; _syncTag('⇪ saving…','wait');
    _echo++; _echoUntil=Date.now()+2500;
    const rel=()=>{ setTimeout(()=>{ if(_echo>0) _echo--; },800); };
    return _ref().update(map)
      .then(()=>{
        if(_pushing>0) _pushing--; rel();
        if(!_pushing) _syncTag('✓ synced '+_hm(),'ok');
        if(loud) _say('✅ Saved '+n+' field(s) — synced to every machine','ok');
        _btn(); render(); return true;
      })
      .catch(e=>{
        if(_pushing>0) _pushing--; rel();
        console.warn('[KNQ] save',e);
        [GI,GO].forEach(BAG=>Object.values(BAG).forEach(r=>{
          if(r._prevSt!==undefined){ r._svSt=r._prevSt; delete r._prevSt; } }));
        Object.keys(map).forEach(k=>{ if(_dirty[k]===undefined) _dirty[k]=map[k]; });
        _btn(); _syncTag('✗ not saved','er');
        _say('❌ Save failed: '+e.message+' — will retry','er');
        if(_pushT) clearTimeout(_pushT);
        _pushT=setTimeout(()=>{ _pushT=null; _flush(false); },5000);
        return false;
      });
  }
  /* ── LISTENER REALTIME ────────────────────────────────────────
     Chỉ gắn trong CỬA SỔ SỐNG: gi/go còn st='open', use từ _liveFrom().
     Kỳ đã đóng nằm ngoài cửa sổ ⇒ không có listener ⇒ không tốn băng thông
     và không bị kéo về máy. */
  function _attachLive(){
    if(_live || typeof firebase==='undefined') return;
    _live=true;
    const R=_ref();
    /* meta — máy nào bấm 📌 Close period thì mọi máy nhảy kỳ theo */
    try{
      R.child('meta').on('value',s=>{
        const v=s.val()||{};
        _closed=v.closed||{};
        if(v.sapSync && !_mine()) _sapSync=Object.assign({at:'',by:'',asOf:'',de:0,px:0},v.sapSync);
        const p=v.curPeriod||'';
        if(!p || p===_curPeriod) return;
        const was=_curPeriod; _curPeriod=p;
        if(_month<p){ _month=p; _useMonth=p; _syncEls(); }
        if(was && was<p) _say('📌 Period '+was+' was closed on another machine — now working on '+p,'ok');
        _scheduleRender();
      },e=>console.warn('[KNQ] meta live',e));
    }catch(e){ console.warn('[KNQ] meta live',e); }

    const rowOn=(node,BAG)=>{
      try{
        const q=R.child(node).orderByChild('st').equalTo('open');
        const put=snap=>{
          if(_mine()) return;
          const id=snap.key, v=snap.val(); if(!v) return;
          const r=Object.assign({_id:id},_dirtyOver(node+'/'+id,v));
          r._svSt=v.st||'open';
          BAG[id]=r; _scheduleRender();
        };
        q.on('child_added',put);
        q.on('child_changed',put);
        q.on('child_removed',snap=>{
          if(_mine()) return;
          delete BAG[snap.key]; _scheduleRender();
        });
      }catch(e){ console.warn('[KNQ] live '+node,e); }
    };
    rowOn('gi',GI); rowOn('go',GO);

    try{
      const uq=R.child('use').orderByKey().startAt(_liveFrom());
      const uput=snap=>{
        if(_mine()) return;
        const d=snap.key;
        if(_dirty['use/'+d]!==undefined) return;   /* đang gõ dở → giữ số của mình */
        USE[d]=snap.val()||{}; _scheduleRender();
      };
      uq.on('child_added',uput);
      uq.on('child_changed',uput);
      uq.on('child_removed',snap=>{
        if(_mine()) return;
        delete USE[snap.key]; _scheduleRender();
      });
    }catch(e){ console.warn('[KNQ] live use',e); }
  }
  function _btn(){
    const b=document.getElementById('knq-save');
    if(b){ const n=Object.keys(_dirty).length; b.textContent=n?('💾 Save ('+n+')'):'💾 Save'; b.classList.toggle('hot',!!n); }
  }
  /* v4.93a — bỏ giờ khai báo / giờ HQ phản hồi / số PXK-PNK / ngày nộp /
     ngày nhận / PXKT-PNKT: quản lý bên Excel, bỏ đi để bảng gọn trong 1 màn hình */
  const GI_FIELDS=['mat','no','owner','vendor','vessel','regDate','decl','date',
                   'price','qtyKg','note','hqDone','hqDate','st'];
  const GO_FIELDS=['giId','mat','no','time','regDate','decl','date','batch','letter',
                   'hqQty','sapKg','op','sapT','sapEnd','sapDate','price','qtyKg',
                   'note','vas','vasDate','hqDone','hqDate','st','pxDone','sapH'];
  function _strip(r,F){ const o={}; F.forEach(k=>{ if(r[k]!==undefined) o[k]=r[k]; }); return o; }

  /* ⭐ v4.102 — ĐỌC META TRƯỚC rồi mới tải dữ liệu, vì con trỏ kỳ quyết định
     CỬA SỔ tải về: kỳ đã đóng nằm nguyên trên Firebase nhưng không kéo về
     máy nữa. */
  function _loadMeta(){
    return _ref().child('meta').once('value')
      .then(s=>{
        const v=s.val()||{};
        _closed=v.closed||{};
        if(v.curPeriod) _curPeriod=v.curPeriod;
        if(v.sapSync) _sapSync=Object.assign({at:'',by:'',asOf:'',de:0,px:0},v.sapSync);
      })
      .catch(e=>console.warn('[KNQ] meta',e));
  }
  /* ⭐ v4.104 — CỨU LÔ P/X BỊ ĐÓNG NHẦM.
     Bản cũ để tick ✔ Done đặt st='done' cho lô P/X ⇒ lần sau KHÔNG tải về,
     trong khi SAP vẫn còn hàng ⇒ bộ trừ lùi mất hẳn lượng đó (dữ liệu thật:
     5 lô, 13 695 432 kg). Quét MỘT LẦN các dòng đang mang st='done', dòng
     P/X nào KHÔNG có cờ pxDone (tức chưa từng được 📌 Close period đóng) và
     thuộc kỳ CHƯA đóng thì kéo về, mở lại, ghi sửa lên Firebase.
     Kéo về cả dòng GET IN cha, nếu không lô sẽ không có chỗ hiện. */
  function _rescuePX(){
    return _ref().child('go').orderByChild('st').equalTo('done').once('value')
      .then(sn=>{
        const v=sn.val()||{}, back=[], needGi={};
        Object.keys(v).forEach(id=>{
          if(GO[id]) return;
          const r=Object.assign({_id:id},v[id]);
          r.letter=r.letter||_letterOf(r.batch);
          if(!_isPX(r)) return;                       /* D/E đóng bằng tay là hợp lệ */
          if(r.pxDone) return;                        /* đã đóng kỳ đàng hoàng */
          if(_closed[_ym(_outDate(r))]) return;       /* kỳ của nó đã chốt sổ */
          r.st='open'; r._svSt='done';                /* ⇒ _stampSt sẽ ghi lại 'open' */
          GO[id]=r; back.push(r);
          if(r.giId && !GI[r.giId]) needGi[r.giId]=1;
        });
        if(!back.length) return 0;
        const ids=Object.keys(needGi);
        return Promise.all(ids.map(gid=>_ref().child('gi/'+gid).once('value')
          .then(g=>{
            const x=g.val(); if(!x) return;
            const gg=Object.assign({_id:gid},x);
            /* chuyến cha cũng bị đóng theo — nhưng nó vẫn còn lô sống, nên mở
               lại luôn, không thì mỗi lần vào tab lại phải đi vớt. */
            gg.hqDone=false; gg.hqDate=''; gg.st='open'; gg._svSt=x.st||'open';
            GI[gid]=gg;
            _markField('gi/'+gid,'hqDone',false);
            _markField('gi/'+gid,'hqDate','');
          })
          .catch(e=>console.warn('[KNQ] rescue gi',e))
        )).then(()=>{
          let kg=0; back.forEach(r=>{ kg+=_n(_num(r.sapEnd)!=null?r.sapEnd:r.sapKg); });
          _reopened={ n:back.length, kg:kg, list:back.map(r=>r.batch||'?') };
          _say('♻ '+back.length+' P/X batch(es) had been closed by hand in an older version while SAP '+
               'still held '+_K(kg)+' kg — they are back in the run-down: '+
               back.slice(0,6).map(r=>r.batch||'?').join(', ')+(back.length>6?'…':'')+
               '. Only 📌 Close period can close a P/X batch now.','warn');
          return back.length;
        });
      })
      .catch(e=>{ console.warn('[KNQ] rescuePX',e); return 0; });
  }
  function _load(){
    return _loadMeta().then(()=>{
      const from=_liveFrom();
      const jobs=[];
      jobs.push(_ref().child('gi').orderByChild('st').equalTo('open').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ GI[k]=Object.assign({_id:k},v[k]); }); })
        .catch(e=>console.warn('[KNQ] gi',e)));
      jobs.push(_ref().child('go').orderByChild('st').equalTo('open').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ GO[k]=Object.assign({_id:k},v[k]); }); })
        .catch(e=>console.warn('[KNQ] go',e)));
      /* CHỈ ngày trong cửa sổ sống — ngày của kỳ đã đóng thuộc về 📜 Archive */
      jobs.push(_ref().child('use').orderByKey().startAt(from).once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ USE[k]=v[k]; }); })
        .catch(e=>console.warn('[KNQ] use',e)));
      return Promise.all(jobs).then(()=>_rescuePX());
    });
  }
  function loadOld(){
    if(_allLoaded){ _say('Everything is already loaded',''); return; }
    _say('📂 Loading archived rows…','');
    Promise.all([
      _ref().child('gi').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ if(!GI[k]) GI[k]=Object.assign({_id:k},v[k]); }); }),
      _ref().child('go').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ if(!GO[k]) GO[k]=Object.assign({_id:k},v[k]); }); }),
      _ref().child('use').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ USE[k]=v[k]; }); })
    ]).then(()=>{ _allLoaded=true; render(); _say('📂 Full history loaded','ok'); })
      .catch(e=>{ console.warn('[KNQ] loadOld',e); _say('❌ Could not load archived data','er'); });
  }
  /* 💾 Save = "đẩy ngay" (dữ liệu vẫn tự đẩy sau 1,5 s nếu người dùng không bấm) */
  function save(){ return _flush(true); }

  /* ============================================================
     ⬇ CẬP NHẬT D/E TỪ SAP  —  khớp theo MÃ BATCH người dùng gõ
  ============================================================ */
  function pullSap(quiet){
    const shout=(m,t)=>{ if(!quiet) _say(m,t); };
    if(typeof SP==='undefined' || !SP.batch1100){ shout('❌ The SAP tab is not ready yet','er'); return false; }
    const res=SP.batch1100();
    if(!res.rows.length){
      shout('❌ The SAP tab has no SLoc 1100 row with a split batch code'+
           (res.legacy?(' ('+res.legacy+' row(s) still in the old merged form — paste SAP again)'):''),'er');
      return false;
    }
    /* ⭐ CHỈ LẤY SỐ TỚI NGÀY _asOf() (hôm qua). Dòng SAP của ngày hôm nay —
       nếu có — là số dở dang, cố tình BỎ QUA. */
    MATS.forEach(m=>{ Object.keys(SAPB[m]).forEach(k=>delete SAPB[m][k]); });
    _sapAsOf=''; _sapWant=_asOf();
    res.rows.forEach(r=>{
      if(r.date>_sapWant) return;                    /* hôm nay / tương lai */
      const B=SAPB[r.mat]; if(!B) return;
      const cur=B[r.batch];
      if(!cur || r.date>=cur.date) B[r.batch]={ date:r.date, endKg:Math.round(r.end) };
      if(r.date>_sapAsOf) _sapAsOf=r.date;
    });
    if(!_sapAsOf){
      shout('❌ The SAP tab has no SLoc 1100 data on or before '+_dmy(_sapWant)+
           ' — paste the ZMMFR022 export for '+_dmy(_sapWant),'er');
      render(); return false;
    }

    let hit=0, miss=0, px=0;
    const declared={ C3:{}, C4:{} };
    Object.values(GO).forEach(r=>{
      if(!r.batch) return;
      const code=String(r.batch).trim().toUpperCase();
      if(declared[r.mat]) declared[r.mat][code]=1;
      const b=SAPB[r.mat]?SAPB[r.mat][code]:null;
      if(!b){ miss++; return; }
      /* MỌI loại lô đều ghi sapEnd + sapDate để đối chiếu ✓ / Δ */
      r.sapEnd=b.endKg; r.sapDate=b.date;
      _markField('go/'+r._id,'sapEnd',b.endKg);
      _markField('go/'+r._id,'sapDate',b.date);
      /* P/X trừ lùi theo FEED OL1 nên KHÔNG đè Actual left — chỉ đối chiếu */
      if(_isPX(r)){ px++; return; }
      r.sapT=b.endKg;
      _markField('go/'+r._id,'sapT',b.endKg);
      /* ⭐ v4.104 — LỊCH SỬ SAP THEO NGÀY cho D/E. SAP cập nhật liên tục nên
         so hai mốc gần nhau là biết CHÍNH XÁC lô nào đang được bơm ra và bơm
         bao nhiêu — không phải suy đoán như P/X. Giữ SAPH_KEEP mốc gần nhất. */
      const H=Object.assign({},r.sapH||{});
      H[b.date]=b.endKg;
      const ks=Object.keys(H).sort();
      while(ks.length>SAPH_KEEP){ delete H[ks.shift()]; }
      r.sapH=H;
      _markField('go/'+r._id,'sapH',H);
      hit++;
    });
    /* mã batch CÓ trong SAP SLoc 1100 mà bảng KNQ chưa khai — dấu hiệu bỏ sót
       một tờ khai get out. Chỉ đếm batch còn tồn (end > 0). */
    let undecl=0; const undeclList=[];
    MATS.forEach(m=>{
      Object.keys(SAPB[m]||{}).forEach(code=>{
        if(declared[m][code]) return;
        if(!(SAPB[m][code].endKg>0)) return;
        undecl++; if(undeclList.length<6) undeclList.push(m+' '+code);
      });
    });
    /* ⭐ v4.103 — DẤU THỜI GIAN QUÉT SAP. Người dùng phải nhìn là biết số
       D/E trên bảng đang mới tới đâu, ai quét, lúc nào. Ghi vào meta nên mọi
       máy thấy cùng một mốc, không ai phải hỏi "số này quét chưa". */
    _sapSync={ at:_stamp(), by:_who(), asOf:_sapAsOf, de:hit, px:px };
    _dirty['meta/sapSync']=_sapSync; _btn(); _schedulePush();
    render();
    _say('⬇ SAP scanned '+_sapSync.at+' · data as of '+_dmy(_sapAsOf)+' · '+hit+
         ' D/E batch(es) written straight into Actual left'+
         (px?(' · '+px+' P/X batch(es) keep running down on FEED OL1 (SAP declares them monthly, '+
              'so they are NOT compared)'):'')+
         (miss?(' · '+miss+' code(s) not found in SAP'):'')+
         (undecl?(' · ⚠ '+undecl+' SAP batch code(s) not declared here: '+undeclList.join(', ')+
                  (undecl>undeclList.length?'…':'')):''),'ok');
    if(_sapAsOf<_sapWant)
      _say('⚠ SAP is behind: the latest SLoc 1100 data is '+_dmy(_sapAsOf)+
           ', but KNQ works on '+_dmy(_sapWant)+' (yesterday). Paste a fresh ZMMFR022.','warn');
    if(res.legacy) shout('⚠ '+res.legacy+' SLoc 1100 row(s) in the SAP tab are still in the old merged form — '+
         'paste a fresh ZMMFR022 export so every batch code is split','warn');
    return true;
  }
  /* QUÉT LẠI TỰ ĐỘNG khi mở tab mà lần quét gần nhất chưa tới D-1.
     Chốt của người dùng: "hàng ngày dữ liệu phải được quét mới với SAP để
     cập nhật D-1" — nên đừng bắt bấm tay mỗi sáng. */
  function _autoSyncSap(){
    if(_autoSap) return; _autoSap=true;
    if(_sapSync.asOf && _sapSync.asOf>=_asOf()) return;   /* đã có số của D-1 */
    if(typeof SP==='undefined' || !SP.batch1100) return;  /* tab SAP chưa sẵn */
    let ok=false;
    try{ ok=pullSap(true); }catch(e){ console.warn('[KNQ] auto sap',e); }
    if(ok) _say('⬇ D/E stock refreshed from SAP automatically — data as of '+_dmy(_sapAsOf)+
                ' · scanned '+_sapSync.at,'ok');
  }
  /* ── ⇐ SAP QTY FROM SAP — đổ End Stock của SAP vào cột SAP qty ─────
     Dùng khi khai batch mới: SAP qty của một batch chính là lượng GR vào SAP.
     Mặc định CHỈ điền ô đang TRỐNG; ô đã có số mà lệch thì hỏi riêng, vì ghi
     đè sẽ đổi luôn điểm xuất phát trừ lùi FIFO của cả kỳ. */
  function fillSapQty(){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    if(!_sapAsOf){ _say('⚠ Click ⬇ Sync from SAP first','warn'); return; }
    recalc();
    const empty=[], diff=[];
    Object.values(GO).forEach(r=>{
      if(r.hqDone || !r.batch) return;
      const v=_sapOf(r); if(v==null) return;
      const cur=_num(r.sapKg);
      const op=(r.op && r.op[_month||_ym(_today())]);
      if(cur==null && op==null) empty.push({r,v});
      else if(Math.abs((r.baseKg||0)-v)>SAP_TOL) diff.push({r,v});
    });
    if(!empty.length && !diff.length){ _say('✓ Every SAP qty already matches SAP as of '+_dmy(_sapAsOf),'ok'); return; }
    let ow=false;
    if(diff.length){
      ow=confirm('⇐ SAP QTY FROM SAP  (SAP as of '+_dmy(_sapAsOf)+')\n\n'+
        empty.length+' empty cell(s) will be filled.\n\n'+
        diff.length+' cell(s) already hold a different figure. Overwrite those too?\n'+
        '⚠ Overwriting changes the FIFO starting point for the whole period — '+
        'say No if the current figures came from 📌 Close period.\n\n'+
        'OK = overwrite all · Cancel = fill the empty ones only');
    }
    let n=0;
    empty.concat(ow?diff:[]).forEach(o=>{ setOp(o.r._id,String(o.v)); n++; });
    render();
    _say('⇐ Filled '+n+' SAP qty cell(s) from SAP as of '+_dmy(_sapAsOf)+
         ((!ow&&diff.length)?(' · '+diff.length+' differing cell(s) left untouched'):'')+
         ' — remember to 💾 Save','ok');
  }
  /* chép số SAP sang cột "SAP qty" của 1 dòng get-out */
  function copySap(id){
    const r=GO[id]; if(!r) return;
    const v=_sapOf(r);
    if(v==null){ _say('⚠ This batch code is not in the SAP data pulled in','warn'); return; }
    setOp(id,String(v));
  }

  /* ============================================================
     NHẬP TAY — GET IN / GET OUT
  ============================================================ */
  function addGi(mat){
    if(MATS.indexOf(mat)<0) mat='C3';
    const id=_newId('G');
    /* KHÔNG điền sẵn ngày — người dùng tự chọn, tránh cảm giác app đoán bừa */
    GI[id]={ _id:id, mat:mat, no:'', owner:'HYOSUNG', vendor:'', vessel:'',
      regDate:'', decl:'', date:'', price:'', qtyKg:'', note:'', st:'open' };
    _mark('gi/'+id,_strip(GI[id],GI_FIELDS));
    _open[id]=true;
    render();
    setTimeout(()=>{ const el=document.querySelector('[data-g="'+id+'|vessel"]'); if(el) el.focus(); },40);
  }
  /* 1 chuyến → nhiều get-out, mỗi dòng 1 mã batch DUY NHẤT */
  function addGo(giId){
    const g=GI[giId]; if(!g){ _say('⚠ There is no Get In row yet','warn'); return; }
    const ch=childrenOf(giId), last=ch[ch.length-1];
    const id=_newId('O');
    GO[id]={ _id:id, giId:giId, mat:g.mat, time:(last?last.time:'1st time'),
      regDate:(last?last.regDate:''), decl:'', date:(last?last.date:''),
      batch:'', letter:'', hqQty:'', sapKg:'', price:(last?last.price:g.price)||'', qtyKg:'',
      note:'', vas:false, vasDate:'', st:'open' };
    _mark('go/'+id,_strip(GO[id],GO_FIELDS));
    _open[giId]=true;
    render();
    setTimeout(()=>{ const el=document.querySelector('[data-f="'+id+'|decl"]'); if(el) el.focus(); },40);
  }
  function cloneGo(id){
    const s=GO[id]; if(!s) return;
    const nid=_newId('O');
    GO[nid]={ _id:nid, giId:s.giId, mat:s.mat, time:s.time, regDate:s.regDate, decl:'',
      date:s.date, batch:'', letter:'', hqQty:'', sapKg:'',
      price:s.price, qtyKg:'', note:'', vas:false, vasDate:'', st:'open' };
    _mark('go/'+nid,_strip(GO[nid],GO_FIELDS));
    render();
    setTimeout(()=>{ const el=document.querySelector('[data-f="'+nid+'|decl"]'); if(el) el.focus(); },40);
  }
  function setGi(id,field,val){
    const g=GI[id]; if(!g) return;
    if(field==='qtyKg'||field==='price'){ const v=_num(val); g[field]=(v==null?'':v); }
    else if(field==='mat'){ g.mat=val; Object.values(GO).forEach(r=>{ if(r.giId===id){ r.mat=val; _markField('go/'+r._id,'mat',val); } }); }
    else g[field]=val;
    _markField('gi/'+id,field,g[field]);
    render();
  }
  function setGo(id,field,val){
    const r=GO[id]; if(!r) return;
    if(field==='qtyKg'||field==='price'||field==='sapKg'||field==='sapT'||field==='hqQty'){
      const v=_num(val); r[field]=(v==null?'':v); }
    else if(field==='batch'){
      const code=String(val||'').trim().toUpperCase();
      if(code){
        const dup=Object.values(GO).find(o=>o._id!==id && o.mat===r.mat && String(o.batch||'').toUpperCase()===code);
        if(dup){ _say('⚠ Batch code '+code+' is already used on another row — one get-out line = one unique batch','warn'); }
      }
      r.batch=code;
      const L=_letterOf(code);
      if(L && L!==r.letter){ r.letter=L; _markField('go/'+id,'letter',L); }
    }
    else r[field]=val;
    _markField('go/'+id,field,r[field]);
    render();
  }
  function delGi(id){
    const g=GI[id]; if(!g) return;
    const ch=childrenOf(id);
    if(!confirm('Delete voyage "'+(g.vessel||g.decl||'untitled')+'"'+
                (ch.length?(' and its '+ch.length+' get-out line(s)'):'')+'?')) return;
    ch.forEach(r=>{ delete GO[r._id]; delete _dirty['go/'+r._id];
      _ref().child('go/'+r._id).remove().catch(e=>console.warn('[KNQ] del go',e)); });
    delete GI[id]; delete _dirty['gi/'+id]; delete _open[id];
    _ref().child('gi/'+id).remove().catch(e=>console.warn('[KNQ] del gi',e));
    render();
  }
  function delGo(id){
    const r=GO[id]; if(!r) return;
    if(!confirm('Delete get-out line "'+(r.batch||r.decl||'untitled')+'"?')) return;
    delete GO[id]; delete _dirty['go/'+id];
    _ref().child('go/'+id).remove().catch(e=>console.warn('[KNQ] del go',e));
    render();
  }
  /* ✔ DONE = ĐÃ BƠM XONG **VÀ** ĐÃ KHAI VASSCM. Cảnh báo cả hai vế. */
  function toggleDone(kind,id,el){
    const BAG=(kind==='gi')?GI:GO, r=BAG[id]; if(!r) return;
    const on=!!(el&&el.checked);
    if(on && kind==='go'){
      if(r.remainKg>0.5 &&
         !confirm('Batch '+(r.batch||r.decl||'')+' still has '+_K(r.remainKg)+
                  ' kg left. Mark it DONE anyway?\n\n'+
                  'DONE means the batch has been fully pumped out AND declared in VASSCM.\n'+
                  'Actual Left will be forced to 0 and the row will no longer be loaded '+
                  'when you open the tab after saving.')){ el.checked=false; return; }
      if(!r.vas &&
         !confirm('Batch '+(r.batch||r.decl||'')+' is NOT ticked as VASSCM declared yet.\n\n'+
                  'Mark it DONE anyway?')){ el.checked=false; return; }
    }
    /* ⭐ v4.104 — LÔ P/X KHÔNG ĐÓNG ĐƯỢC BẰNG TAY. SAP khai P/X một tháng
       một lần; chừng nào SAP còn hàng thì lô còn phải nằm trong bộ trừ lùi.
       Đóng bằng tay ở đây chính là lỗi làm mất 13,7 triệu kg của bản trước. */
    if(kind==='go' && _isPX(r)){
      if(el) el.checked=!!r.hqDone;
      _say('🔒 A '+(LETTER_NAME[r.letter]||r.letter)+' batch cannot be closed by hand. SAP declares P/X '+
           'once a month, so this batch keeps running down until 📌 Close period sees its SAP End Stock '+
           'at zero on the last day of the period.','warn');
      return;
    }
    r.hqDone=on; r.hqDate=on?(r.hqDate||_today()):'';
    _markField(kind+'/'+id,'hqDone',r.hqDone);
    _markField(kind+'/'+id,'hqDate',r.hqDate);
    if(kind==='gi' && on){
      /* ⭐ v4.104 — lan xuống con NHƯNG BỎ QUA P/X (xem trên) */
      childrenOf(id).forEach(c=>{ if(!c.hqDone && !_isPX(c)){ c.hqDone=true; c.hqDate=c.hqDate||_today();
        _markField('go/'+c._id,'hqDone',true); _markField('go/'+c._id,'hqDate',c.hqDate); } });
    }
    render();
  }
  /* ── VASSCM ─────────────────────────────────────────────────
     Tick = đã khai VASSCM cho phần hàng đã bơm ra. Tick lần đầu tự điền
     ngày hôm nay (sửa lại được ở ô bên cạnh). Bỏ tick thì xoá ngày. */
  function toggleVas(id,el){
    const r=GO[id]; if(!r) return;
    const on=!!(el&&el.checked);
    r.vas=on; r.vasDate=on?(r.vasDate||_today()):'';
    _markField('go/'+id,'vas',r.vas);
    _markField('go/'+id,'vasDate',r.vasDate);
    render();
  }
  function toggleGroup(id){ _open[id]=(_open[id]===false); render(); }
  /* đổi KỲ trừ lùi — bảng batch không đổi, chỉ đổi dữ liệu OL1 đem đi trừ */
  function onMonth(){ const e=document.getElementById('knq-month'); if(!e) return;
    const v=e.value||_curP();
    /* ⭐ v4.102 — kỳ đã đóng không còn dữ liệu sống trên máy (use của kỳ đó
       không được tải về nữa), tính lại sẽ ra số sai. Đẩy sang 📜 Archive. */
    if(_closed && _closed[v]){
      _say('📜 Period '+v+' is closed — opening the read-only archive instead','');
      _month=_curP(); _useMonth=_month; _syncEls();
      _archM=v; openArch(); loadArch(); render(); return;
    }
    _month=v; _useMonth=_month; _syncEls();
    render(); }

  /* ============================================================
     📌 CLOSE PERIOD — chốt kỳ, mở kỳ mới, LẤY SỐ SAP LÀM SỐ CHÍNH THỨC
     ------------------------------------------------------------
     ⭐ v4.102. SAP cho lô P và X bị CHẬM VÀI NGÀY so với ngày chốt kỳ (độ
     trễ của công tác đóng kỳ đưa dữ liệu lên SAP). Cho nên nút này KHÔNG
     dùng mốc D-1 như ⬇ Sync from SAP mà đọc End Stock tại **NGÀY CUỐI CÙNG
     CỦA KỲ** rồi ĐÈ vào tồn đầu kỳ mới cho CẢ 4 loại lô P/X/D/E — người
     dùng bấm nút khi SAP đã đẩy đủ số, nên số SAP lúc đó là số chính thức.
     Lô nào SAP chưa có số ở ngày đó mới lui về số app tự tính; hộp xác nhận
     đếm rõ bao nhiêu lô lấy từ SAP, bao nhiêu lô lấy từ app, lệch bao nhiêu.
     Batch đã tick ✔ Done KHÔNG được chuyển sang.
     Đóng xong: snapshot kỳ cũ vào periods/<M>, đẩy meta/curPeriod lên
     Firebase NGAY để mọi máy nhảy kỳ theo và ngừng đồng bộ kỳ cũ.
  ============================================================ */
  /* End Stock của SAP tại một NGÀY BẤT KỲ (lấy dòng gần nhất ≤ ngày đó).
     Khác _sapOf/pullSap ở chỗ mốc do người gọi quyết định. */
  function _sapAt(day){
    const out={ map:{C3:{},C4:{}}, asOf:'', ok:false, err:'' };
    if(typeof SP==='undefined' || !SP.batch1100){ out.err='the SAP tab is not loaded yet'; return out; }
    let res=null;
    try{ res=SP.batch1100(); }catch(e){ out.err='the SAP tab raised an error: '+e.message; return out; }
    if(!res || !res.rows || !res.rows.length){
      out.err='the SAP tab has no SLoc 1100 row with a split batch code'+
              ((res&&res.legacy)?(' ('+res.legacy+' row(s) still in the old merged form)'):'');
      return out;
    }
    res.rows.forEach(r=>{
      if(!r.date || r.date>day) return;
      const B=out.map[r.mat]; if(!B) return;
      const code=String(r.batch||'').trim().toUpperCase(); if(!code) return;
      const cur=B[code];
      if(!cur || r.date>=cur.date) B[code]={ date:r.date, endKg:Math.round(r.end) };
      if(r.date>out.asOf) out.asOf=r.date;
    });
    out.ok=!!out.asOf;
    if(!out.ok) out.err='the SAP tab has no SLoc 1100 data on or before '+_dmy(day);
    return out;
  }

  function closeMonth(){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const M=_month||_curP(), N=_nextYm(M), M9=_lastDay(M);
    if(!N){ _say('❌ No period selected','er'); return; }
    if(_closed && _closed[M]){
      _say('❌ Period '+M+' has already been closed — open it read-only with 📜 Archive','er'); return; }
    const S=recalc();
    /* ⭐ v4.104 — MỌI lô chưa đóng và thuộc kỳ này đều được xét. Với P/X đây
       là LẦN DUY NHẤT được phép đóng: End Stock SAP ngày cuối kỳ = 0 ⇒ đóng,
       còn > 0 ⇒ mang sang kỳ sau. */
    const live=S.gos.filter(r=>!_closedRow(r) && _ym(_outDate(r))<=M);
    const done =S.gos.filter(r=>_closedRow(r)).length;

    /* ── ① ĐỌC SAP TẠI NGÀY CUỐI KỲ ─────────────────────────── */
    const sap=_sapAt(M9);
    if(!sap.ok){
      if(!confirm('⚠ NO SAP FIGURE FOR '+_dmy(M9)+'\n\n'+
        'Reason: '+sap.err+'.\n\n'+
        'SAP publishes the P / X batches a few days after month end, so this is normal if you\n'+
        'are closing on the 1st. Paste the ZMMFR022 export covering '+_dmy(M9)+' in\n'+
        'LPG Sales ▸ SAP and press this button again to let SAP decide the opening balance.\n\n'+
        'Close '+M+' now using the figures this app computed from FEED OL1 instead?')) return;
    }else if(sap.asOf<M9){
      if(!confirm('⚠ SAP HAS NOT CAUGHT UP WITH THE END OF '+M+'\n\n'+
        'Period ends '+_dmy(M9)+' · newest SLoc 1100 data in the SAP tab is '+_dmy(sap.asOf)+'.\n\n'+
        'Batches that already have a SAP figure will take it; the rest carry the app-computed\n'+
        'actual left. You can also cancel, paste a fresher ZMMFR022 and try again.\n\n'+
        'Close '+M+' anyway?')) return;
    }

    /* ── ② SỐ SAP ĐÈ APP CHO MỌI LOẠI LÔ, VÀ QUYẾT ĐỊNH ĐÓNG/MANG SANG ──
       Lô nào End Stock SAP ngày cuối kỳ = 0 ⇒ hết hàng thật ⇒ ĐÓNG (không
       tải về nữa). Còn > 0 ⇒ số đó thành SAP qty đầu kỳ mới. */
    const plan=[]; let nSap=0, nApp=0;
    live.forEach(r=>{
      const code=String(r.batch||'').trim().toUpperCase();
      const b=(code && sap.map[r.mat]) ? sap.map[r.mat][code] : null;
      const app=Math.max(0,r.remainKg||0);
      if(b) nSap++; else nApp++;
      const v=b?Math.max(0,b.endKg):app;
      plan.push({ r:r, v:v, shut:!(v>SAP_TOL), src:(b?'sap':'app'), app:app,
                  sapKg:(b?b.endKg:null), sapDate:(b?b.date:''),
                  diff:(b?(b.endKg-app):null) });
    });
    const shut =plan.filter(p=>p.shut);
    const carry=plan.filter(p=>!p.shut);
    const blind=shut.filter(p=>p.src==='app');   /* đóng mà KHÔNG có số SAP xác nhận */
    const off=plan.filter(p=>p.diff!=null && Math.abs(p.diff)>SAP_TOL)
                  .sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
    if(!confirm('📌 CLOSE PERIOD '+M+'  →  OPEN PERIOD '+N+'\n\n'+
      'SAP End Stock on '+_dmy(M9)+' decides everything below.\n\n'+
      '• '+carry.length+' batch(es) STILL HOLD STOCK → carried over as the SAP qty (opening balance) of '+N+'\n'+
      '     · '+nSap+' figure(s) from the SAP data of '+(sap.ok?_dmy(sap.asOf):'—')+'  (SAP is official)\n'+
      '     · '+nApp+' have no SAP row at that date → the app-computed actual left is used\n'+
      '• '+shut.length+' batch(es) are at ZERO in SAP → CLOSED, dropped from the run-down\n'+
      '• '+done+' batch(es) were already closed\n'+
      (blind.length?('\n⚠ '+blind.length+' of the batches being closed have NO SAP row on '+_dmy(M9)+
        ' — they are closed on the app figure alone:\n'+
        blind.slice(0,6).map(p=>'     '+(p.r.batch||'?')).join('\n')+
        (blind.length>6?('\n     …+'+(blind.length-6)+' more'):'')+'\n'):'')+
      (off.length?('\n⚠ '+off.length+' batch(es) differ from what this app computed:\n'+
        off.slice(0,6).map(p=>'     '+(p.r.batch||'?')+'   app '+_K(p.app)+'  →  SAP '+_K(p.sapKg)+
          '   ('+(p.diff>0?'+':'')+_K(p.diff)+' kg)').join('\n')+
        (off.length>6?('\n     …+'+(off.length-6)+' more'):'')+'\n'):'')+
      '\nPeriod '+M+' is then archived on Firebase and stops syncing to the machines.\n'+
      'Continue?')) return;

    /* ── ③ GHI: op kỳ mới · snapshot kỳ cũ · con trỏ kỳ ─────── */
    const at=_stamp(), by=_who(), rows={};
    plan.forEach(p=>{
      const r=p.r;
      if(p.shut){
        /* ⭐ ĐÂY LÀ CHỖ DUY NHẤT ĐƯỢC ĐÓNG LÔ P/X. Ghi cờ bền pxDone + st. */
        if(_isPX(r)){ r.pxDone=true; _markField('go/'+r._id,'pxDone',true); }
        else if(!r.hqDone){ r.hqDone=true; r.hqDate=r.hqDate||M9;
          _markField('go/'+r._id,'hqDone',true); _markField('go/'+r._id,'hqDate',r.hqDate); }
        _markField('go/'+r._id,'st','done'); r._svSt='done'; r.st='done';
      }else{
        r.op=r.op||{}; r.op[N]=p.v; _markOp(r._id,N,p.v);
      }
      rows[r._id]={ mat:r.mat||'', batch:r.batch||'', letter:r.letter||'',
        vessel:(GI[r.giId]&&GI[r.giId].vessel)||'', decl:r.decl||'',
        open:_n(r.baseKg), used:_n(r.usedKg), left:_n(p.app),
        sapEnd:(p.sapKg==null?'':p.sapKg), sapDate:p.sapDate||'',
        carry:(p.shut?0:p.v), src:(p.shut?'closed':p.src) };
    });
    S.gos.filter(r=>_closedRow(r)).forEach(r=>{
      if(rows[r._id]) return;
      rows[r._id]={ mat:r.mat||'', batch:r.batch||'', letter:r.letter||'',
        vessel:(GI[r.giId]&&GI[r.giId].vessel)||'', decl:r.decl||'',
        open:_n(r.baseKg), used:_n(r.usedKg), left:0,
        sapEnd:'', sapDate:'', carry:0, src:'done' };
    });
    const use={};
    Object.keys(USE).forEach(d=>{ if(_ym(d)===M) use[d]=USE[d]; });
    _dirty['periods/'+M]={ closedAt:at, closedBy:by, periodEnd:M9,
                           sapAsOf:sap.asOf||'', fromSap:nSap, fromApp:nApp,
                           rows:rows, use:use };
    _dirty['meta/curPeriod']=N;
    _dirty['meta/closed/'+M]={ at:at, by:by, sapAsOf:sap.asOf||'', batches:carry.length };

    if(N>_curPeriod) _curPeriod=N;
    _closed[M]={ at:at, by:by, sapAsOf:sap.asOf||'', batches:carry.length };
    _month=N; _useMonth=N; _syncEls();
    render();
    _flush(false);
    _say('📌 Period '+M+' closed → '+N+' is open · '+carry.length+' batch(es) carried over ('+nSap+
         ' from SAP, '+nApp+' from the app) · '+shut.length+' closed at zero · '+M+
         ' archived and no longer synced','ok');
  }

  /* ============================================================
     📜 ARCHIVE — xem lại KỲ ĐÃ ĐÓNG, read-only
     Kỳ đã đóng KHÔNG còn được tải về / đồng bộ. Nút này đọc thẳng
     knq_bonded/periods/<YYYY-MM> MỘT LẦN (once, không gắn listener) rồi
     hiện bảng chỉ để đọc. Không đụng gì tới dữ liệu đang chạy.
  ============================================================ */
  function openArch(){
    const m=_el('knq-arch'); if(!m) return;
    const sel=_el('knq-arch-m');
    if(sel){
      const ks=Object.keys(_closed||{}).sort().reverse();
      sel.innerHTML=ks.length
        ? ks.map(k=>'<option value="'+k+'">'+k+'</option>').join('')
        : '<option value="">— no closed period yet —</option>';
      if(_archM && ks.indexOf(_archM)>-1) sel.value=_archM;
    }
    m.classList.add('on');
    _renderArch();
    if(sel && sel.value) loadArch();
  }
  function closeArch(){ const m=_el('knq-arch'); if(m) m.classList.remove('on'); }
  function loadArch(){
    const sel=_el('knq-arch-m'); const M=(sel&&sel.value)||'';
    if(!M){ _arch=null; _archM=''; _renderArch(); return; }
    if(_archBusy) return;
    _archBusy=true; _archM=M; _arch=null; _renderArch();
    _ref().child('periods/'+M).once('value')
      .then(s=>{ _arch=s.val()||null; _archBusy=false; _renderArch(); })
      .catch(e=>{ console.warn('[KNQ] archive',e); _archBusy=false; _arch=null;
        _renderArch('❌ Could not read the archive of '+M+': '+e.message); });
  }
  function _renderArch(err){
    const box=_el('knq-arch-body'); if(!box) return;
    if(err){ box.innerHTML='<div class="knq-empty">'+_esc(err)+'</div>'; return; }
    if(_archBusy){ box.innerHTML='<div class="knq-empty">Loading '+_esc(_archM)+'…</div>'; return; }
    if(!_archM){ box.innerHTML='<div class="knq-empty">No period has been closed yet. '+
      'Closed periods stay on Firebase and are opened here read-only — they are no longer '+
      'downloaded to the machines.</div>'; return; }
    if(!_arch){ box.innerHTML='<div class="knq-empty">No archive stored for '+_esc(_archM)+
      '. Periods closed before v4.102 were not snapshotted — use 📂 Load archived on the main '+
      'table to review those rows instead.</div>'; return; }
    const rows=Object.keys(_arch.rows||{}).map(k=>_arch.rows[k])
      .sort((a,b)=>{ const ka=(a.mat||'')+(a.batch||''), kb=(b.mat||'')+(b.batch||'');
                     return ka<kb?-1:(ka>kb?1:0); });
    let tOpen=0,tUsed=0,tLeft=0;
    rows.forEach(r=>{ tOpen+=_n(r.open); tUsed+=_n(r.used); tLeft+=_n(r.carry); });
    const days=Object.keys(_arch.use||{}).sort();
    let uT=0,uX=0;
    days.forEach(d=>{ const u=_arch.use[d]||{}; const t=_totOf(u); uT+=(t==null?0:t); uX+=_n(u.x); });
    box.innerHTML=
      '<div class="knq-hint">Period <b>'+_esc(_archM)+'</b> · closed '+_esc(_arch.closedAt||'—')+
        (_arch.closedBy?(' by <b>'+_esc(_arch.closedBy)+'</b>'):'')+
        ' · SAP as of <b>'+_dmy(_arch.sapAsOf||'')+'</b>'+
        ' · '+(_arch.fromSap||0)+' closing balance(s) taken from SAP, '+(_arch.fromApp||0)+' from the app.'+
        ' <b>Read-only</b> — this period no longer syncs to the machines.</div>'+
      '<div class="knq-tw"><table class="knq-tb"><thead><tr>'+
        '<th>Mat</th><th>Batch</th><th>Lot</th><th>Vessel</th>'+
        '<th class="n">Opening</th><th class="n">Used</th><th class="n">App left</th>'+
        '<th class="n">SAP end</th><th class="n">Carried to next</th><th>Source</th></tr></thead><tbody>'+
      (rows.length?rows.map(r=>
        '<tr><td>'+_esc(r.mat)+'</td><td class="knq-bcell knq-lot-'+
          _esc(String(r.letter||'').toLowerCase()||'n')+'">'+_esc(r.batch)+'</td>'+
        '<td>'+_esc(LETTER_NAME[r.letter]||r.letter||'')+'</td><td>'+_esc(r.vessel||'')+'</td>'+
        '<td class="n">'+_K(_n(r.open))+'</td><td class="n">'+_K(_n(r.used))+'</td>'+
        '<td class="n">'+_K(_n(r.left))+'</td>'+
        '<td class="n">'+(r.sapEnd===''||r.sapEnd==null?'—':_K(_n(r.sapEnd)))+'</td>'+
        '<td class="n"><b>'+_K(_n(r.carry))+'</b></td>'+
        '<td>'+(r.src==='sap'?'<span class="knq-b sap">SAP</span>':
                r.src==='done'?'<span class="knq-b done">✔ Done</span>':
                '<span class="knq-b wait">app</span>')+'</td></tr>').join('')
        :'<tr><td colspan="10" class="knq-empty">No batch stored in this snapshot.</td></tr>')+
      '</tbody><tfoot><tr class="knq-tot"><td colspan="4">TOTAL '+_esc(_archM)+'</td>'+
        '<td class="n">'+_K(tOpen)+'</td><td class="n">'+_K(tUsed)+'</td><td class="n"></td>'+
        '<td class="n"></td><td class="n">'+_K(tLeft)+'</td><td></td></tr></tfoot></table></div>'+
      '<div class="knq-hint">FEED OL1 of '+_esc(_archM)+': <b>'+days.length+'</b> day(s) · '+
        'TOTAL P+X <b>'+_K(uT)+'</b> kg · X <b>'+_K(uX)+'</b> kg · P <b>'+_K(Math.max(0,uT-uX))+'</b> kg.</div>';
  }

  /* ============================================================
     ⛽ FEED OL1 — modal, KHÔNG hiện ngoài trang
  ============================================================ */
  function openOl1(){
    const m=document.getElementById('knq-ol1'); if(!m) return;
    if(!_useMonth) _useMonth=_month||_curP();
    /* ⭐ v4.102 — kỳ quá hạn đóng: mở thẳng THÁNG ĐANG CHẠY, vì đó mới là
       tháng người dùng cần gõ OL1 (số vẫn trừ vào bộ batch của kỳ cũ). */
    if(_overdue() && _month===_curP() && _useMonth<_ym(_today())) _useMonth=_ym(_today());
    const sel=document.getElementById('knq-use-month'); if(sel) sel.value=_useMonth;
    const u=document.getElementById('knq-ol1-unit'); if(u) u.value=_olUnit;
    m.classList.add('on');
    _renderUse();
  }
  function closeOl1(){ const m=document.getElementById('knq-ol1'); if(m) m.classList.remove('on');
    _imp=null; _renderImp(); render(); }
  function onOl1Unit(){ const e=document.getElementById('knq-ol1-unit'); if(!e) return;
    _olUnit=e.value||'T'; _renderUse(); }
  /* hệ số quy đổi: giá trị gõ × _f() = KG */
  function _f(){ return _olUnit==='kg' ? 1 : 1000; }
  function _disp(kg){ if(kg==null) return ''; const v=kg/_f();
    return Number(v).toLocaleString('en-US',{maximumFractionDigits:_olUnit==='kg'?0:3}); }

  /* ghi 1 ô số của bảng FEED OL1.
     field 't' = TỔNG P+X · 'x' = X. Field 'p' (schema cũ) vẫn nhận để dữ
     liệu/kiểm thử cũ không vỡ, nhưng UI không còn ô P nữa. */
  function setUse(date,field,val){
    const u=USE[date]||{}; const v=_num(val);
    u[field]=(v==null?'':Math.round(v*_f()*1000)/1000);
    if(field==='x') u.xs=(v==null?'':'m');       /* gõ tay → không cho import đè */
    if(field==='t' && _num(u.t)!=null) delete u.p;   /* tổng là số chính, bỏ P cũ */
    USE[date]=u; _mark('use/'+date,u);
    _renderUse(); render();
  }
  /* ── DÁN NHIỀU DÒNG TỪ EXCEL ────────────────────────────────
     Copy 1 cột (hoặc 2 cột TỔNG + X) trong Excel → bấm vào ô đầu → Ctrl+V.
     Dán xuôi xuống theo NGÀY, thiếu ngày thì tự tạo trong tháng đang xem. */
  function usePaste(ev,date,field){
    const cb=ev&&(ev.clipboardData||window.clipboardData); if(!cb) return;
    let txt=''; try{ txt=cb.getData('text/plain')||''; }catch(_){ return; }
    if(!/[\r\n\t]/.test(txt.trim())) return;        /* 1 ô → dán bình thường */
    ev.preventDefault();
    const grid=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='').map(l=>l.split('\t'));
    const order=(field==='t')?['t','x']:['x'];
    let n=0, out=0;
    grid.forEach((cells,k)=>{
      const d=_addDays(date,k);
      if(!d || _ym(d)!==_ym(date)){ out++; return; }   /* không tràn sang tháng khác */
      const u=USE[d]||{};
      order.forEach((f,c)=>{
        if(c>=cells.length) return;
        const raw=String(cells[c]==null?'':cells[c]).trim();
        const v=_num(raw);
        if(v==null && raw!=='') return;                /* ô chữ → bỏ qua, giữ số cũ */
        u[f]=(v==null?'':Math.round(v*_f()*1000)/1000);
        if(f==='x') u.xs=(v==null?'':'m');
      });
      if(_num(u.t)!=null) delete u.p;
      USE[d]=u; _mark('use/'+d,u); n++;
    });
    _useMonth=_ym(date);
    _renderUse(); render();
    _say('📋 Pasted '+n+' day(s) from '+_dmy(date)+
         (out?(' · dropped '+out+' row(s) spilling into another month'):'')+' — remember to 💾 Save','ok');
  }
  function setUseNote(date,val){ const u=USE[date]||{}; u.note=val; USE[date]=u; _mark('use/'+date,u); }
  function useKey(ev,date,field){
    if(!ev||ev.key!=='Enter') return;
    ev.preventDefault(); ev.target.blur();
    setTimeout(()=>{
      const nx=document.querySelector('[data-u="'+_addDays(date,1)+'|'+field+'"]');
      if(nx){ nx.focus(); if(nx.select) nx.select(); }
    },30);
  }
  function addUseRow(){
    const inp=document.getElementById('knq-use-new');
    const d=(inp&&inp.value)||_today();
    if(USE[d]){ _say(_dmy(d)+' already exists','warn'); return; }
    USE[d]={ t:'', x:'', xp:'', note:'' }; _mark('use/'+d,USE[d]);
    _useMonth=_ym(d); const m=document.getElementById('knq-use-month'); if(m) m.value=_useMonth;
    _renderUse();
  }
  function fillUseMonth(){
    if(!_useMonth) _useMonth=_ym(_today());
    const y=+_useMonth.slice(0,4), mo=+_useMonth.slice(5,7), last=new Date(y,mo,0).getDate();
    let n=0;
    for(let d=1;d<=last;d++){
      const k=_useMonth+'-'+String(d).padStart(2,'0');
      if(!USE[k]){ USE[k]={t:'',x:'',xp:'',note:''}; _mark('use/'+k,USE[k]); n++; }
    }
    _renderUse(); _say('📅 Added '+n+' empty day(s) to '+_useMonth,'ok');
  }
  function delUseRow(date){
    if(!confirm('Delete the row for '+_dmy(date)+'?')) return;
    delete USE[date]; delete _dirty['use/'+date];
    _ref().child('use/'+date).remove().catch(e=>console.warn('[KNQ] del use',e));
    _renderUse();
  }
  function onUseMonth(){ const e=document.getElementById('knq-use-month'); if(!e) return;
    _useMonth=e.value||''; _renderUse(); }

  /* ============================================================
     📥 IMPORT X TỪ EXCEL  /  📋 DÁN TỪ EXCEL
     ------------------------------------------------------------
     Bố cục file KH (sheet "일자별 C3사용량 (예상 및 실적)"):
        cột NGÀY = ngày trong tháng (1..31), KHÔNG phải ngày đầy đủ
        cột PLAN   = 관세유예 C3사용량 (생산 계획으로 추정)
        cột ACTUAL = 관세유예 C3사용량 (생산 실적 기준)
     GHÉP: lấy ACTUAL từ đầu tháng cho tới NGÀY ĐẦU TIÊN THIẾU ACTUAL,
     từ ngày đó trở đi lấy PLAN cho hết tháng (không quay lại actual nữa,
     đúng như cách người dùng đọc file).  Kết quả ghi thẳng vào ô X;
     cột "Plan X" vẫn giữ số plan gốc để đối chiếu.
  ============================================================ */
  function pickFile(){ const f=document.getElementById('knq-file'); if(f){ f.value=''; f.click(); } }
  function fileChosen(input){
    const f=input&&input.files&&input.files[0]; if(!f) return;
    if(typeof XLSX==='undefined'){ _say('❌ The XLSX library is not loaded','er'); return; }
    const rd=new FileReader();
    rd.onload=e=>{
      try{
        _wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
        const names=_wb.SheetNames||[];
        const sh=_pickSheet(names);
        _paste=false;
        _imp=_prepImp(_aoaOf(sh),f.name,sh,names);
        _renderImp();
        _say('📥 Read '+f.name+' — check the columns then click APPLY','ok');
      }catch(err){ console.warn('[KNQ] import',err); _say('❌ Could not read the file: '+err.message,'er'); }
    };
    rd.readAsArrayBuffer(f);
  }
  function _aoaOf(name){
    const sh=_wb&&_wb.Sheets?_wb.Sheets[name]:null;
    return XLSX.utils.sheet_to_json(sh||{},{header:1,raw:true,defval:null});
  }
  /* sheet nào chứa lượng dùng C3 hằng ngày */
  function _pickSheet(names){
    const L=names||[];
    let best=L[0]||'', bs=-1;
    L.forEach(n=>{
      const h=String(n).toLowerCase();
      let sc=0;
      if(/c3/.test(h))                              sc+=4;
      if(/사용량|usage|feed|ol1|dùng/.test(h))       sc+=4;
      if(/일자별|daily|hằng ngày|hang ngay/.test(h)) sc+=3;
      if(/bom|생산|production|재고|stock/.test(h))   sc-=3;
      if(sc>bs){ bs=sc; best=n; }
    });
    return best;
  }
  /* 📋 dán bảng từ Excel → đi chung đường với import file */
  function pasteOpen(){ _paste=true; _imp=null; _renderImp();
    setTimeout(()=>{ const t=document.getElementById('knq-paste-txt'); if(t) t.focus(); },40); }
  function pasteCancel(){ _paste=false; _renderImp(); }
  function pasteRead(){
    const t=document.getElementById('knq-paste-txt');
    const txt=(t&&t.value)||'';
    if(!txt.trim()){ _say('⚠ Nothing pasted yet','warn'); return; }
    const aoa=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='')
                 .map(l=>l.split('\t').map(c=>{ const n=_num(c); return (n!=null&&String(c).trim()!=='')?n:c; }));
    try{
      _paste=false;
      _imp=_prepImp(aoa,'(pasted from Excel)','',[]);
      _renderImp();
      _say('📋 Read '+_imp.body.length+' row(s) — check the columns then click APPLY','ok');
    }catch(err){ _say('❌ Could not read it: '+err.message,'er'); }
  }

  /* chấm điểm 1 tiêu đề cột cho vai trò 'act' (thực tế) hoặc 'plan' */
  function _hScore(h,kind){
    h=String(h||'').toLowerCase();
    let s=0;
    if(/c3/.test(h))                                              s+=5;
    if(/사용량|usage|feed|dùng|dung/.test(h))                     s+=4;
    if(/생산|production|\bpp\b/.test(h))                          s-=3;
    if(/stock|재고|통관|declared|tồn|ton kho/.test(h))            s-=6;
    if(/total|합계|tổng|sum|p\s*\+\s*x/.test(h))                  s-=6;
    if(/(^|[^a-z])x([^a-z]|$)/.test(h))                           s+=3;
    const isAct =/actual|실적|thực|thuc te/.test(h);
    const isPlan=/plan|계획|예상|추정|estimat|kế hoạch|ke hoach/.test(h);
    if(kind==='act'){ if(isAct) s+=6; if(isPlan) s-=6; }
    else            { if(isPlan) s+=6; if(isAct) s-=6; }
    return s;
  }
  /* chuẩn hoá bảng thô: tìm dòng tiêu đề, đoán cột ngày + cột actual/plan */
  function _prepImp(aoa,fname,sheet,sheets){
    const rows=(aoa||[]).filter(r=>r&&r.some(c=>c!=null&&String(c).trim()!==''));
    if(!rows.length) throw new Error('no rows found');
    let hdr=0, best=-1;
    rows.slice(0,12).forEach((r,i)=>{
      const s=r.filter(c=>typeof c==='string'&&String(c).trim()).length;
      if(s>best){ best=s; hdr=i; }
    });
    const head=(rows[hdr]||[]).map((c,i)=>
      (String(c==null?'':c).replace(/\s+/g,' ').trim())||('Col '+(i+1)));
    const body=rows.slice(hdr+1);
    const nc=Math.max(head.length,...body.map(r=>r.length));
    while(head.length<nc) head.push('Col '+(head.length+1));

    /* cột NGÀY ĐẦY ĐỦ = cột parse được nhiều ngày nhất */
    let dCol=-1, dBest=0;
    for(let c=0;c<nc;c++){ let k=0; body.forEach(r=>{ if(_toIso(r[c])) k++; });
      if(k>dBest){ dBest=k; dCol=c; } }
    if(dBest<3) dCol=-1;
    /* không có → cột NGÀY TRONG THÁNG 1..31 (file Hàn tách cột 월 / 일자) */
    let dayCol=-1, dayBest=0;
    for(let c=0;c<nc;c++){
      if(c===dCol) continue;
      const seen={}; let k=0;
      body.forEach(r=>{ const v=_num(r[c]);
        if(v!=null&&v>=1&&v<=31&&Math.abs(v-Math.round(v))<1e-9&&!seen[v]){ seen[v]=1; k++; } });
      if(k>dayBest){ dayBest=k; dayCol=c; }
    }
    if(dayBest<15) dayCol=-1;
    if(dCol<0 && dayCol<0) throw new Error('no date column found');

    /* cột số: chấm điểm riêng cho ACTUAL và PLAN */
    let aCol=-1,aBest=0, pCol=-1,pBest=0;
    for(let c=0;c<nc;c++){
      if(c===dCol||c===dayCol) continue;
      if(!body.some(r=>_num(r[c])!=null)) continue;
      const sa=_hScore(head[c],'act'), sp=_hScore(head[c],'plan');
      if(sa>aBest){ aBest=sa; aCol=c; }
      if(sp>pBest){ pBest=sp; pCol=c; }
    }
    if(aCol===pCol && aCol>=0){                       /* chỉ có 1 cột số hợp lệ */
      if(aBest>=pBest) pCol=-1; else aCol=-1;
    }
    /* tháng áp dụng: lấy từ tiêu đề "8월" nếu có, không thì tháng đang xem */
    let month=_useMonth||_ym(_today());
    const title=String((rows[0]||[]).join(' ')+' '+sheet).match(/(\d{1,2})\s*월/);
    if(title){
      const mm=+title[1];
      if(mm>=1&&mm<=12) month=(month.slice(0,4))+'-'+String(mm).padStart(2,'0');
    }
    return { name:fname, sheet:sheet||'', sheets:sheets||[], head, body,
             dCol, dayCol, aCol, pCol, unit:'T', month, ow:false };
  }
  function _toIso(v){
    if(v==null) return '';
    if(v instanceof Date && !isNaN(v))
      return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
    if(typeof v==='number' && v>20000 && v<80000){          /* serial Excel */
      const t=Date.UTC(1899,11,30)+Math.round(v)*86400000, d=new Date(t);
      return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
    }
    const s=String(v).trim();
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){ let y=m[3]; if(y.length===2) y='20'+y;
      return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
    return '';
  }
  function impSet(field,val){
    if(!_imp) return;
    if(field==='sheet'){
      try{ const keep=_imp.name;
        _imp=_prepImp(_aoaOf(val),keep,val,_imp.sheets);
      }catch(err){ _say('❌ This sheet cannot be read: '+err.message,'er'); }
    }
    else if(field==='unit'||field==='month') _imp[field]=val;
    else if(field==='ow') _imp.ow=!!val;
    else _imp[field]=(+val);
    _renderImp();
  }
  function impCancel(){ _imp=null; _paste=false; _renderImp(); }
  /* danh sách ngày + giá trị sau khi ghép actual → plan (dùng cho cả xem trước) */
  function _impRows(){
    if(!_imp) return [];
    const { body, dCol, dayCol, aCol, pCol, month }=_imp;
    const seen={}, list=[];
    body.forEach(r=>{
      let d=(dCol>=0)?_toIso(r[dCol]):'';
      if(!d && dayCol>=0){
        const v=_num(r[dayCol]);
        if(v!=null&&v>=1&&v<=31&&Math.abs(v-Math.round(v))<1e-9)
          d=month+'-'+String(Math.round(v)).padStart(2,'0');
      }
      if(!d || seen[d]) return;          /* dòng TỔNG mang lại ngày cũ → bỏ */
      seen[d]=1;
      list.push({ d, a:(aCol>=0?_num(r[aCol]):null), p:(pCol>=0?_num(r[pCol]):null) });
    });
    list.sort((u,v)=>u.d<v.d?-1:(u.d>v.d?1:0));
    let stop=(aCol<0);
    list.forEach(o=>{
      if(!stop && o.a==null) stop=true;  /* ngày đầu tiên thiếu actual → chuyển plan */
      o.src=stop?'p':'a';
      o.v=stop?o.p:o.a;
    });
    return list;
  }
  function impApply(){
    if(!_imp) return;
    const { dCol, dayCol, aCol, pCol, unit, ow }=_imp;
    if(dCol<0&&dayCol<0){ _say('⚠ No Date column detected','warn'); return; }
    if(aCol<0&&pCol<0){ _say('⚠ Pick at least one number column (Actual or Plan)','warn'); return; }
    const f=(unit==='kg')?1:1000;
    const R=_impRows();
    let na=0, np=0, skip=0, keep=0;
    R.forEach(o=>{
      const u=USE[o.d]||{ t:'', x:'', xp:'', note:'' };
      if(o.p!=null) u.xp=Math.round(o.p*f*1000)/1000;   /* cột Plan X giữ plan gốc */
      if(o.v==null){ skip++; }
      else if(u.xs==='m' && !ow){ keep++; }             /* đã gõ tay → không đè */
      else {
        u.x=Math.round(o.v*f*1000)/1000; u.xs=o.src;
        if(o.src==='a') na++; else np++;
      }
      USE[o.d]=u; _mark('use/'+o.d,u);
    });
    const firstPlan=(R.filter(o=>o.src==='p')[0]||{}).d;
    if(R.length) _useMonth=_ym(R[0].d);
    _imp=null; _paste=false; _renderImp(); _renderUse(); render();
    _say('📥 X loaded: '+na+' ACTUAL day(s)'+(np?(' · '+np+' PLAN day(s)'):'')+
         (firstPlan?(' (plan from '+_dmy(firstPlan)+')'):'')+
         (keep?(' · kept '+keep+' hand-keyed day(s)'):'')+
         (skip?(' · '+skip+' day(s) with no figure'):'')+' — remember to 💾 Save','ok');
  }

  /* ============================================================
     RENDER
  ============================================================ */
  function _inp(kind,id,f,v,type,cls,ph,w){
    const at=(kind==='gi')?'data-g':'data-f';
    const fn=(kind==='gi')?'KNQ.setGi':'KNQ.setGo';
    return '<input class="knq-in'+(cls?' '+cls:'')+'" '+at+'="'+id+'|'+f+'"'+
      (type?(' type="'+type+'"'):'')+(ph?(' placeholder="'+_esc(ph)+'"'):'')+
      (w?(' style="min-width:'+w+'px"'):'')+
      ' value="'+_esc(v==null?'':v)+'" onchange="'+fn+'(\''+id+'\',\''+f+'\',this.value)">';
  }
  function _op(list,cur,blank){
    let h=blank?('<option value="">'+blank+'</option>'):'';
    list.forEach(o=>{ const val=o.v!==undefined?o.v:o, lbl=o.l!==undefined?o.l:o;
      h+='<option value="'+_esc(val)+'"'+(String(val)===String(cur||'')?' selected':'')+'>'+_esc(lbl)+'</option>'; });
    return h;
  }
  function _stTxt(r){
    if(r.st==='done')  return '<span class="knq-b done" title="Pumped out and declared in VASSCM">✅ Done</span>';
    if(r.st==='ready') return '<span class="knq-b ready" title="'+(_isPX(r)
      ? 'Pumped out and VASSCM declared. A P/X batch is closed by 📌 Close period once its SAP End Stock '+
        'on the last day of the period is zero — not by hand.'
      : 'Pumped out and VASSCM declared — tick ✔ Done to close it')+'">🔵 '+
      (_isPX(r)?'Awaiting period close':'Ready to close')+'</span>';
    if(r.st==='zero')  return '<span class="knq-b zero" title="Fully pumped out — VASSCM declaration still pending">🔴 VASSCM pending</span>';
    if(r.st==='wait')  return '<span class="knq-b wait">⏳ Not started</span>';
    /* ĐÚNG MỘT batch mỗi (Mat × loại lô) mang cờ head — batch thật sự đang ra.
       D/E: bằng chứng trực tiếp = SAP tụt giữa hai lần quét. P/X: đầu hàng FIFO. */
    if(r.head) return '<span class="knq-b live" title="'+(r.drop>0
      ? ('SAP stock fell '+_K(r.drop)+' kg between '+_dmy(r.dropFrom)+' and '+_dmy(r.dropTo)+
         ' — this batch is physically coming out right now')
      : ('This is the batch physically coming out right now — the FIFO head for '+
         (LETTER_NAME[r.letter]||r.letter)))+'">▶ PUMPING NOW</span>';
    return '<span class="knq-b using">🟢 Pumping</span>';
  }
  /* chuỗi chip đếm tình trạng get out của 1 chuyến (hiện cả khi đã gập) */
  function _sumChips(g){
    const O=[['using','p','Pumping'],['wait','w','Not started'],
             ['zero','z','VASSCM pending'],['ready','r','Ready to close'],['done','d','Done']];
    const on=O.filter(o=>g.cnt&&g.cnt[o[0]]);
    if(!on.length) return '<span class="knq-dot none">no get out</span>';
    return on.map(o=>'<span class="knq-dot '+o[1]+'" title="'+o[2]+'">'+g.cnt[o[0]]+'</span>').join('');
  }

  /* render() thay nguyên innerHTML của tbody ⇒ ô đang gõ mất focus.
     Ghi nhớ ô đang đứng rồi trả con trỏ về đúng chỗ sau khi vẽ lại. */
  function _focusKey(){
    try{
      const el=document.activeElement;
      if(!el||!el.getAttribute) return null;
      const a=['data-g','data-f','data-u','data-o'].find(k=>el.getAttribute(k));
      return a?(a+'="'+el.getAttribute(a)+'"'):null;
    }catch(_){ return null; }
  }
  function _refocus(k){
    if(!k) return;
    try{ const el=document.querySelector('['+k+']'); if(el&&el.focus) el.focus(); }catch(_){}
  }
  let _nShown=0;
  function render(){
    if(!document.getElementById('rpt-pg-knq')) return;
    const k=_focusKey();
    const S=recalc();
    _nShown=0;
    MATS.forEach(m=>_renderMat(m));
    _renderCards(S);
    _renderBar(S);
    _renderAlerts(S);
    _btn();
    _refocus(k);
  }

  /* ══════════════════════════════════════════════════════════
     ⭐ v4.104 · BỐN THẺ TÌNH HÌNH  (#knq-cards)
     ----------------------------------------------------------
     Thay cho dải chip + ba cụm tổng của v4.103 — cùng một thông tin bị
     bày ra ba chỗ (kỳ, ngày dữ liệu, mốc SAP đều lặp lại) nên nhìn rối.
     Giờ gom thành BỐN THẺ, mỗi thẻ trả lời ĐÚNG MỘT CÂU HỎI:
       ① Trong kho còn bao nhiêu?      ② Đang bơm lô nào?
       ③ Kỳ này đã dùng bao nhiêu?     ④ Số SAP mới tới đâu?
     Cái gì đã nằm sẵn ở chỗ khác (ô chọn kỳ, tiêu đề bảng) thì KHÔNG lặp.
     ══════════════════════════════════════════════════════════ */
  function _renderCards(S){
    const box=document.getElementById('knq-cards'); if(!box) return;
    const A=_asOf(), M=_month||_curP();
    const c={using:0,wait:0,zero:0,ready:0,done:0,soon:0,low:0};
    let left=0, base=0, mism=0;
    S.gos.forEach(r=>{
      if(c[r.st]!==undefined) c[r.st]++;
      if(r.st!=='done'){ left+=r.remainKg||0; base+=r.baseKg||0; }
      if(r.st==='using'&&r.etaDays!=null&&r.etaDays<=WARN_DAYS) c.soon++;
      if(r.low && r.st!=='done') c.low++;
      if(r.sapOk===false) mism++;
    });
    const pct=base>0?Math.round(left/base*100):0;

    /* ── ② ĐANG BƠM RA ── mỗi (Mat × loại lô) đúng một lô */
    const heads=S.gos.filter(r=>r.head && r.st!=='done')
      .sort((a,b)=>{ const ka=a.mat+a.letter, kb=b.mat+b.letter; return ka<kb?-1:(ka>kb?1:0); });
    const headHtml=heads.length ? heads.map(r=>
        '<span class="knq-pump'+(r.low?' low':'')+'" title="'+
          (r.drop>0 ? ('SAP stock fell '+_K(r.drop)+' kg between '+_dmy(r.dropFrom)+' and '+_dmy(r.dropTo)+
                       ' — measured straight from SAP')
                    : ('Head of the FIFO queue for '+r.mat+' '+(LETTER_NAME[r.letter]||r.letter)+
                       ' — the batch the OL1 feed is drawing from'))+'">'+
          '<b class="knq-lotdot knq-lot-'+String(r.letter||'').toLowerCase()+'">'+(r.letter||'?')+'</b>'+
          '<i>'+_esc(r.mat)+'</i>'+
          '<u>'+_esc(r.batch||'—')+'</u>'+
          '<em>'+_K(r.remainKg)+' kg</em>'+
          (r.drop>0?('<s>▼'+_K(r.dropRate||r.drop)+'/d</s>')
                   :(r.eta?('<s>empty '+_dmy(r.eta)+'</s>'):''))+
        '</span>').join('')
      : '<span class="knq-cempty">Nothing is being drawn right now.</span>';

    /* ── ③ OL1 ĐÃ DÙNG ── */
    const M0=M+'-01';
    const endAct=_isOpenP(M) ? A : (_lastDay(M)<A?_lastDay(M):A);
    const endAll=_isOpenP(M) ? (_lastDay(_ym(_today()))>_lastDay(M)?_lastDay(_ym(_today())):_lastDay(M))
                             : _lastDay(M);
    const a=_ol1Sum(M0,endAct,'act');
    const f=_ol1Sum(M0,endAll,'proj');

    /* ── ④ SAP ── */
    const fresh=(_sapSync.asOf&&_sapSync.asOf>=A);

    box.innerHTML=
      /* ① TỒN KHO */
      '<div class="knq-card stock">'+
        '<div class="knq-ch">🛢 IN BONDED WAREHOUSE<span>'+M+'</span></div>'+
        '<div class="knq-cbig">'+_K(left)+'<u>kg</u></div>'+
        '<div class="knq-csub">of '+_K(base)+' kg opening · <b>'+pct+'%</b> still in stock</div>'+
        '<div class="knq-crow">'+
          (c.using?'<span class="knq-tag using">'+c.using+' pumping</span>':'')+
          (c.wait ?'<span class="knq-tag wait">'+c.wait+' not started</span>':'')+
          (c.low  ?'<span class="knq-tag low" title="Less than '+_K(LOW_KG)+' kg ('+(LOW_KG/1000)+
                   ' MT) left in the batch">'+c.low+' below '+(LOW_KG/1000)+' MT</span>':'')+
          (c.soon ?'<span class="knq-tag soon">'+c.soon+' empty ≤'+WARN_DAYS+'d</span>':'')+
          (c.zero ?'<span class="knq-tag zero">'+c.zero+' VASSCM pending</span>':'')+
          (c.ready?'<span class="knq-tag ready">'+c.ready+' awaiting close</span>':'')+
          (mism  ?'<span class="knq-tag bad" title="D/E batches not on the SAP figure — click ⬇ Sync SAP">'+
                   mism+' D/E ≠ SAP</span>':'')+
        '</div>'+
      '</div>'+
      /* ② ĐANG BƠM RA */
      '<div class="knq-card pump">'+
        '<div class="knq-ch">▶ COMING OUT NOW<span>'+heads.length+' batch(es)</span></div>'+
        '<div class="knq-plist">'+headHtml+'</div>'+
      '</div>'+
      /* ③ OL1 */
      '<div class="knq-card ol1">'+
        '<div class="knq-ch">⛽ OL1 USED<span>to '+_dmy(endAct)+'</span></div>'+
        '<div class="knq-cgrid">'+
          '<span class="knq-cv tot"><i>TOTAL P+X</i><b>'+_T(a.t)+'</b><u>MT</u></span>'+
          '<span class="knq-cv p"><i>P Petchem</i><b>'+_T(a.p)+'</b><u>MT</u></span>'+
          '<span class="knq-cv x"><i>X Export</i><b>'+_T(a.x)+'</b><u>MT</u></span>'+
        '</div>'+
        '<div class="knq-csub">'+a.n+' day(s) counted'+
          (a.def?(' · <b class="knq-warn">'+a.def+' assumed '+(DEF_TOT_KG/1000)+' MT</b>'):'')+
          ' · whole period incl. plan <b>'+_T(f.t)+' MT</b></div>'+
      '</div>'+
      /* ④ SAP */
      '<div class="knq-card sap'+(fresh?'':' stale')+'">'+
        '<div class="knq-ch">🔄 SAP D/E<span>'+(fresh?'up to date':'stale')+'</span></div>'+
        '<div class="knq-cbig sm">'+(_sapSync.asOf?_dmy(_sapSync.asOf):'—')+
          '<u>'+(fresh?'= D-1 ✓':'behind D-1')+'</u></div>'+
        '<div class="knq-csub">'+(_sapSync.at
            ? ('scanned <b>'+_esc(_sapSync.at)+'</b>'+(_sapSync.by?(' by '+_esc(_sapSync.by)):'')+
               ' · '+(_sapSync.de||0)+' D/E written')
            : 'never scanned — click <b>⬇ Sync SAP</b>')+'</div>'+
        '<div class="knq-csub dim" title="SAP declares P and X once a month, so they are never overwritten '+
          'from SAP — they run down on the FEED OL1 figures instead.">P/X run on FEED OL1, not on SAP</div>'+
      '</div>';
    box.style.display='';
  }

  /* ── DẢI CẢNH BÁO CHẤT LƯỢNG DỮ LIỆU ────────────────────────
     Ba thứ có thể làm số của tab sai mà nhìn bảng không thấy:
       1. SAP chưa có số của ngày hôm qua  → D/E đang xài số cũ
       2. Hôm qua chưa gõ TỔNG P+X         → "đã bơm" của P/X là số ĐOÁN
       3. Batch lệch với End Stock của SAP → FEED OL1 sai hoặc khai thiếu
     Gom hết vào đây, đừng bắt người dùng tự suy ra. */
  function _renderAlerts(S){
    const box=document.getElementById('knq-alerts'); if(!box) return;
    const A=_asOf(), out=[];

    /* ⭐ v4.102 — QUÁ HẠN ĐÓNG KỲ. Đã sang tháng mới mà chưa bấm 📌 Close
       period: số KHÔNG đứng lại, vẫn trừ tiếp trên bộ batch của kỳ cũ bằng
       FEED OL1 của tháng mới — nhưng phải nói thẳng ra cho người dùng biết,
       vì tồn đầu kỳ mới chỉ chốt được khi SAP đã đẩy đủ lô P/X. */
    if(_overdue()){
      const P=_curP();
      out.push(['bad','<b>Period '+P+' is still open — we are already in '+_ym(_today())+'.</b> '+
        'Figures keep running down on the <b>'+P+'</b> batch set, drawing the FEED OL1 days you '+
        'enter for '+_ym(_today())+' — nothing is frozen. But the opening balance of the new period '+
        'is only fixed when you close: SAP publishes the P / X batches a few days after month end, '+
        'so click <b>📌 Close period</b> once the ZMMFR022 covering '+_dmy(_lastDay(P))+' is pasted '+
        'in LPG Sales ▸ SAP. '+
        '<button class="knq-btn accent" onclick="KNQ.closeMonth()">📌 Close '+P+' now</button>']);
    }

    if(!_sapAsOf){
      out.push(['info','SAP not pulled yet — click <b>⬇ Sync from SAP</b> to load the End Stock of '+
        _dmy(A)+' (yesterday) for every batch code.']);
    }else if(_sapAsOf<A){
      out.push(['warn','<b>SAP is behind.</b> KNQ works on <b>'+_dmy(A)+'</b> (yesterday, the last day with '+
        'final figures), but the newest SLoc 1100 data in the SAP tab is <b>'+_dmy(_sapAsOf)+'</b>. '+
        'Paste a fresh ZMMFR022 in LPG Sales ▸ SAP, then sync again.']);
    }

    /* hôm qua có gõ TỔNG P+X chưa? chưa gõ = đang chạy mức tạm tính */
    const uA=USE[A];
    const hasPX=S.gos.some(r=>!r.hqDone && (r.letter==='P'||r.letter==='X') && r.baseKg!=null);
    /* ⭐ v4.102 — CỬA SỔ KỲ = từ đầu kỳ tới ngày dữ liệu. Kỳ mở quá hạn thì
       cửa sổ vắt sang tháng mới, đúng chỗ mà số đang thật sự bị trừ. */
    const W0=(_month||_curP())+'-01';
    const W9=_isOpenP(_month||_curP()) ? A : (_lastDay(_month||_curP())<A?_lastDay(_month||_curP()):A);
    const inW=d=>(d>=W0 && d<=W9);
    if(hasPX && inW(A)){
      if(!uA){
        out.push(['warn','<b>'+_dmy(A)+' (yesterday) has no FEED OL1 row at all.</b> The P/X run-down '+
          'therefore drew nothing for that day. Open <b>⛽ FEED OL1</b> and enter the day.']);
      }else if(_totOf(uA)==null){
        out.push(['warn','<b>'+_dmy(A)+' (yesterday) has no TOTAL P+X entered</b> — the P/X run-down is '+
          'using the assumed '+_K(DEF_TOT_KG)+' kg/day, so “Used in period” is an estimate, not the real '+
          'figure. Open <b>⛽ FEED OL1</b> and key in the real total.']);
      }
    }
    /* các ngày khác trong kỳ còn thiếu TỔNG — gộp thành 1 dòng */
    const M=_month||_curP();
    const miss=Object.keys(USE).filter(d=>inW(d) && d!==A && _totOf(USE[d])==null);
    if(miss.length) out.push(['warn',miss.length+' earlier day(s) in '+M+' still run on the assumed '+
      _K(DEF_TOT_KG)+' kg/day TOTAL P+X: '+miss.slice(0,6).map(_dmy).join(', ')+
      (miss.length>6?(' …+'+(miss.length-6)):'')+'.']);

    /* ⭐ v4.104 — LÔ P/X TỪNG BỊ ĐÓNG NHẦM, VỪA ĐƯỢC KÉO VỀ */
    if(_reopened && _reopened.n)
      out.push(['bad','<b>'+_reopened.n+' P / X batch(es) had been closed by hand</b> in an older '+
        'version while SAP still held <b>'+_K(_reopened.kg)+' kg</b> for them. The run-down was missing '+
        'that stock, so every later batch was being over-consumed. They are back in the queue: '+
        _reopened.list.slice(0,8).map(_esc).join(', ')+(_reopened.list.length>8?'…':'')+
        '. A P / X batch can now only be closed by <b>📌 Close period</b>, when its SAP End Stock on the '+
        'last day of the period is zero. Press <b>💾 Save</b> to make the fix stick.']);
    /* ⭐ v4.103 — CHỈ D/E MỚI ĐÁNG BÁO LỆCH. P/X lệch với SAP là chuyện
       đương nhiên (SAP khai P/X mỗi tháng một lần), báo ở đây là báo nhầm. */
    const bad=S.gos.filter(r=>r.sapOk===false);
    if(bad.length) out.push(['warn','<b>'+bad.length+' D/E batch(es) are not on the SAP figure</b> of '+
      _dmy(_sapAsOf)+': '+bad.slice(0,5).map(r=>_esc(r.batch||'?')+' (Δ '+(r.sapDiff>0?'+':'')+_K(r.sapDiff)+')').join(' · ')+
      (bad.length>5?(' …+'+(bad.length-5)):'')+'. D/E stock comes straight from SAP — click '+
      '<b>⬇ Sync from SAP</b> to refresh them.']);
    /* D/E phải được quét MỚI mỗi ngày để đúng mốc D-1 */
    if(!_sapSync.at){
      out.push(['info','<b>SAP has never been scanned from this database.</b> D / E stock is read straight '+
        'from SAP and must be refreshed daily to sit on '+_dmy(A)+' (D-1). Click <b>⬇ Sync from SAP</b>.']);
    }else if(_sapSync.asOf<A){
      out.push(['warn','<b>D / E stock is stale.</b> Last scan '+_esc(_sapSync.at)+
        (_sapSync.by?(' by '+_esc(_sapSync.by)):'')+' carried SAP data of <b>'+_dmy(_sapSync.asOf)+
        '</b>, but KNQ works on <b>'+_dmy(A)+'</b>. Paste a fresh ZMMFR022 in LPG Sales ▸ SAP, then '+
        '<b>⬇ Sync from SAP</b>. (P / X are unaffected — SAP declares them monthly and they run down on FEED OL1.)']);
    }

    box.innerHTML=out.length
      ? out.map(o=>'<div class="knq-al '+o[0]+'">'+
          (o[0]==='bad'?'⛔':o[0]==='warn'?'⚠':'ℹ')+' '+o[1]+'</div>').join('')
      : '<div class="knq-al ok">✓ Data as of <b>'+_dmy(A)+'</b> (yesterday) · period <b>'+_curP()+
        '</b> open — SAP in sync, every batch matches, no missing FEED OL1 total. '+
        'Today onward is forecast only. Every edit here is pushed to Firebase and lands on the '+
        'other machines automatically.</div>';
    box.style.display='';
  }

  /* ⭐ v4.104 — dải chip cũ đã chuyển hết vào #knq-cards. Hàm này giờ chỉ lo
     phần chú thích động của các nút trên thanh công cụ. */
  function _renderBar(S){
    const b=document.getElementById('knq-close');
    if(b){
      b.title='Close period '+(_month||'—')+': reads the SAP End Stock at '+
        _dmy(_lastDay(_month||_curP()))+' — the last day of the period, NOT D-1, because SAP publishes '+
        'the P / X batches a few days late. A batch at ZERO in SAP is closed and dropped from the '+
        'run-down; a batch that still holds stock carries that SAP figure into the next period as its '+
        'SAP qty. This is the ONLY thing that can close a P / X batch. The closed period is archived '+
        'on Firebase and stops syncing to the machines.';
      b.classList.toggle('hot',_overdue());
    }
    const sy=document.getElementById('knq-sap-btn');
    if(sy) sy.title='Read the SAP tab for the End Stock of YESTERDAY. D/E batches take it straight into '+
      'Actual left and their day-by-day history is kept, so the app can tell which D/E batch is being '+
      'pumped right now. P/X are left alone — SAP declares them monthly.'+
      (_sapSync.at?(' Last scan '+_sapSync.at+' → SAP data of '+_dmy(_sapSync.asOf)+'.'):' Never scanned yet.');
  }

  function _renderMat(mat){
    const tb=document.getElementById('knq-body-'+mat.toLowerCase()); if(!tb) return;
    let gis=visibleGi(mat);
    if(filterOn()) gis=gis.filter(g=>shownChildren(g._id).length>0);
    if(filterOn() && !gis.length){
      tb.innerHTML='<tr><td colspan="'+COLS+'" class="knq-empty">No '+mat+
        ' batch matches the current filter. '+
        '<button class="knq-btn" onclick="KNQ.clearFilter()">✕ Clear filter</button></td></tr>';
      return;
    }
    if(!gis.length){
      tb.innerHTML='<tr><td colspan="'+COLS+'" class="knq-empty">No '+mat+
        ' voyage yet — click <b>➕ Get In '+mat+'</b> to declare one. '+
        'Cargo received in earlier months belongs here too; this table is never filtered by month.</td></tr>';
      return;
    }
    let h='', tHq=0,tBase=0,tUsed=0,tLeft=0,nGo=0;
    const F=filterOn();
    gis.forEach(g=>{
      /* đang lọc thì luôn mở nhóm, nếu không kết quả nằm trong nhóm đã gập
         sẽ "mất tích" — lỗi kinh điển của bảng gập + lọc. */
      const open=F || (_open[g._id]!==false);
      const ch=shownChildren(g._id);
      h+=_giRow(g,ch.length,open,F);
      /* tổng cộng ĐẾM THEO DÒNG ĐANG HIỆN, kể cả nhóm đang gập, để con số
         dưới chân bảng không nhảy loạn mỗi lần gập/mở. */
      ch.forEach(r=>{ nGo++; tHq+=r.hqQtyN||0; tBase+=r.baseKg||0;
        tUsed+=r.usedKg||0; tLeft+=r.remainKg||0; });
      if(open) ch.forEach((r,i)=>{ h+=_goRow(r,i+1); });
    });
    _nShown+=nGo;
    /* 16 cột: 1-7 nhãn · 8 HQ · 9 SAP · 10 Used · 11 Left · 12 % · 13-16 trống */
    h+='<tr class="knq-tot"><td colspan="7">TOTAL '+mat+' — '+gis.length+' voyage(s) · '+nGo+
       ' get-out line(s)'+(F?' matching the filter':' in run-down')+' · period '+(_month||'—')+'</td>'+
       '<td class="n">'+(tHq?_K(tHq):'')+'</td>'+
       '<td class="n">'+_K(tBase)+'</td><td class="n">'+_K(tUsed)+'</td>'+
       '<td class="n">'+_K(tLeft)+'</td>'+
       '<td class="n">'+(tBase>0?((tUsed/tBase*100).toFixed(1)+'%'):'')+'</td>'+
       '<td colspan="4"></td></tr>';
    tb.innerHTML=h;
  }

  /* ── DÒNG GET IN — 1 chuyến tàu ───────────────────────────
     16 cột: ✔ · No. · Row/Status · Vessel · Decl. No. · Batch · Lot type ·
     HQ Approved · SAP Qty · Used · Actual Left · % · Est. empty ·
     VASSCM ✔ · VASSCM Date · Note                                        */
  function _giRow(g,nCh,open,F){
    const id=g._id;
    /* cột 3 = nút gập/mở + chuỗi chip tình trạng các dòng get out. Chuyến đã
       bơm ra hết thì gắn nhãn ALL OUT để user biết gập lại được. */
    const sum='<div class="knq-gsum"'+(F?'':' onclick="KNQ.toggleGroup(\''+id+'\')"')+
      ' title="'+(F?'Filter is on — groups stay open':'Click to collapse / expand this voyage\'s get-out lines')+'">'+
      _sumChips(g)+
      '<span class="knq-gn">'+nCh+(F?' shown':' get out')+'</span>'+
      (g.allOut?'<span class="knq-allout" title="Every batch of this voyage has been pumped out of the bonded warehouse">ALL OUT</span>':'')+
      '</div>';
    return '<tr class="knq-gi knq-'+(g.st||'wait')+(g.head?' knq-live':'')+(open?'':' knq-folded')+'">'+
      '<td class="c"><input type="checkbox" class="knq-ck"'+(g.hqDone?' checked':'')+
        ' title="Close the whole voyage (ticks every get-out line)"'+
        ' onchange="KNQ.toggleDone(\'gi\',\''+id+'\',this)"></td>'+
      '<td class="c">'+_inp('gi',id,'no',g.no,'','mono c','VVIII',44)+'</td>'+
      '<td class="knq-gcell"><span class="knq-b gin" onclick="KNQ.toggleGroup(\''+id+'\')" '+
        'title="Collapse / expand the get-out lines">'+(open?'▼':'▶')+' GET IN</span>'+sum+'</td>'+
      '<td>'+_inp('gi',id,'vessel',g.vessel,'','b','vessel / voyage',150)+'</td>'+
      '<td>'+_inp('gi',id,'decl',g.decl,'','mono','import decl. no.',120)+'</td>'+
      '<td class="c"><select class="knq-sel nar" title="Material of this voyage"'+
        ' onchange="KNQ.setGi(\''+id+'\',\'mat\',this.value)">'+_op(MATS,g.mat)+'</select></td>'+
      '<td class="c knq-dim">—</td>'+
      '<td class="n'+(g.hqSum?'':' knq-dim')+'">'+(g.hqSum?_K(g.hqSum):'—')+'</td>'+
      '<td class="n'+(g.baseKg?'':' knq-dim')+'">'+(g.baseKg?_K(g.baseKg):'—')+'</td>'+
      '<td class="n'+(g.usedSum?'':' knq-dim')+'">'+(g.usedSum?_K(g.usedSum):'—')+'</td>'+
      '<td class="n b">'+_K(g.remainKg||0)+'<div class="sm">total left</div></td>'+
      '<td class="n knq-dim">—</td><td class="n knq-dim">—</td>'+
      '<td class="c knq-dim">—</td><td class="c knq-dim">—</td>'+
      '<td>'+_inp('gi',id,'note',g.note,'','','note',110)+
        (g.warn?('<div class="knq-warn">⚠ '+_esc(g.warn)+'</div>'):'')+
        '<div class="knq-acts">'+
        '<button class="knq-mini go" title="Add one GET OUT line (one batch code) to this voyage"'+
          ' onclick="KNQ.addGo(\''+id+'\')">➕ Get Out</button>'+
        '<button class="knq-x" title="Delete the whole voyage" onclick="KNQ.delGi(\''+id+'\')">✕</button></div></td>'+
    '</tr>';
  }

  /* ── KÝ HIỆU KHỚP / LỆCH SAP dưới ô Actual left ─────────────
     ✓ SAP   = đúng bằng End Stock của SAP ngày _asOf()
     Δ ±n    = lệch, kèm số chênh (D/E gần như không bao giờ lệch vì lấy
               thẳng từ SAP; P/X lệch = FEED OL1 sai hoặc SAP qty khai sai)
     Không có mã / chưa sync → chữ mờ, KHÔNG dùng dấu ⚠ cho khỏi loạn. */
  function _sapBadge(r){
    if(r.hqDone) return '';
    if(!r.batch) return '';
    /* ⭐ v4.103 — P/X KHÔNG đối chiếu ở đây. SAP khai P/X mỗi tháng một lần
       nên End Stock của SAP đứng yên cả kỳ; Actual left là số TRỪ LÙI theo
       FEED OL1, lệch với SAP là chuyện đương nhiên, không phải lỗi. */
    if(r.letter==='P'||r.letter==='X')
      return '<div class="knq-sapb ol1" title="SAP declares P / X once a month, so its End Stock stays '+
             'frozen all period. This figure is the SAP qty run down by the FEED OL1 usage — it is NOT '+
             'meant to equal SAP. What must match SAP is the SAP qty cell on the left.">↓ per OL1</div>';
    if(!_sapAsOf) return '<div class="knq-sapb dim" title="Click ⬇ Sync from SAP to take the D/E stock '+
                         'of yesterday straight from SAP">SAP —</div>';
    if(r.sapEndN==null)
      return '<div class="knq-sapb bad" title="This batch code is not in the SAP SLoc 1100 data of '+
             _dmy(_sapAsOf)+'">no SAP row</div>';
    if(r.sapOk)
      return '<div class="knq-sapb ok" title="D/E stock is taken straight from SAP. SAP data as of '+
             _dmy(_sapAsOf)+(_sapSync.at?(', scanned '+_sapSync.at+(_sapSync.by?(' by '+_sapSync.by):'')):'')+
             '">✓ SAP '+_dmy(_sapAsOf)+'</div>';
    return '<div class="knq-sapb bad" title="SAP End Stock of '+_dmy(_sapAsOf)+' is '+_K(r.sapEndN)+
           ' kg — KNQ is off by '+_K(r.sapDiff)+' kg. Click ⬇ Sync from SAP to refresh D/E.">Δ '+
           (r.sapDiff>0?'+':'')+_K(r.sapDiff)+'</div>';
  }

  /* ── DÒNG GET OUT — 1 mã batch duy nhất ─────────────────────
     Ngày được phép dùng batch nằm trong chính mã batch (260714X001 →
     14/07/2026) — hiện ngay dưới ô batch để người dùng đối chiếu. */
  function _goRow(r,i){
    const id=r._id;
    const soon=(r.st==='using'&&r.etaDays!=null&&r.etaDays<=WARN_DAYS);
    const bDate=_batchDate(r.batch);
    const bHint=bDate
      ? '<div class="knq-hintline dim" title="Taken from the batch code — this batch is only drawn down from this date onward">from '+_dmy(bDate)+'</div>'
      : (r.batch?'<div class="knq-hintline warnline" title="The batch code must start with YYMMDD + P/X/D/E">no date in code</div>':'');
    /* ── ĐỐI CHIẾU SAP ──────────────────────────────────────────
       3 trạng thái rạch ròi, đừng gộp: CHƯA bấm nút · bấm rồi mà không thấy
       mã · thấy mã (kèm Δ nếu lệch với SAP qty đang gõ). Trước v4.98 cả ba
       đều hiện "code not found" nên nhìn tưởng SAP thiếu dữ liệu. */
    let sapHint='';
    if(r.sapNow!=null){
      const d=(r.baseKg==null)?null:Math.round(r.sapNow-r.baseKg);
      /* ⚠ Ô NÀY so SAP qty (điểm xuất phát) với End Stock của SAP.
         Ký hiệu ✓/Δ dưới cột Actual left là phép so KHÁC — Actual left với
         SAP. Đừng để cả hai cùng hiện dấu ✓ xanh, nhìn sẽ tưởng trùng nhau:
         ở đây chỉ LÊN TIẾNG KHI LỆCH, khớp thì im lặng. */
      sapHint='<div class="knq-hintline'+(d?' warnline':'')+
        '" title="End Stock of this batch code in the SAP data as of '+_dmy(_sapAsOf)+
        (d?(' — the SAP qty you keyed in differs by '+_K(d)+' kg'):' — same as the SAP qty you keyed in')+'">'+
        'SAP '+_K(r.sapNow)+(d?(' <b>Δ qty '+(d>0?'+':'')+_K(d)+'</b>'):'')+
        ' <button class="knq-mini" title="Copy the SAP figure into the cell" onclick="KNQ.copySap(\''+id+'\')">⇐</button></div>';
    } else if(r.batch){
      sapHint=_sapAsOf
        ? '<div class="knq-hintline warnline" title="This batch code is not in the SAP SLoc 1100 data pulled in">SAP: code not found</div>'
        : '<div class="knq-hintline dim" title="Click ⬇ Update D/E from SAP to compare against SAP">SAP: not pulled yet</div>';
    }
    /* nguồn của SAP Qty: chốt kỳ trước, hay số khai ban đầu */
    const opHint=(r._opFrom==='khai')
      ? '<div class="knq-hintline dim" title="No period closed yet — using the figure you keyed in">= as keyed</div>'
      : (r._opFrom?('<div class="knq-hintline dim" title="Opening balance carried over from the '+r._opFrom+' period close">c/f '+r._opFrom+'</div>')
        :(_ym(_outDate(r))===_month?'<div class="knq-hintline dim">out this period</div>':''));
    const px=(r.letter==='P'||r.letter==='X');
    /* v4.97 — lớp màu theo loại lô: P chàm · X tím · D mòng két · E hổ phách.
       Đặt trên <tr> để tô thanh rail bên trái, và trên ô batch để tô nền. */
    const lot=r.letter?(' knq-lot-'+r.letter.toLowerCase()):' knq-lot-none';
    return '<tr class="knq-go knq-'+r.st+lot+(soon?' knq-soon':'')+(r.head?' knq-live':'')+'">'+
      '<td class="c">'+(px
        ? ('<span class="knq-lock" title="A P / X batch cannot be closed by hand. SAP declares them once '+
           'a month, so the batch keeps running down on FEED OL1 until 📌 Close period finds its SAP End '+
           'Stock at zero on the last day of the period — that is the only thing that closes it.">🔒</span>'+
           (r.hqDone?'<div class="knq-relive" title="An older version ticked this batch DONE and dropped it '+
             'from the run-down even though SAP still held stock. It has been put back.">re-opened</div>':''))
        : ('<input type="checkbox" class="knq-ck"'+(r.hqDone?' checked':'')+
           ' title="DONE = fully pumped out AND declared in VASSCM. Actual Left is forced to 0 and '+
           'the row is no longer loaded after saving."'+
           ' onchange="KNQ.toggleDone(\'go\',\''+id+'\',this)">'))+'</td>'+
      '<td class="c sm">'+i+'</td>'+
      '<td>'+_stTxt(r)+'</td>'+
      '<td class="knq-dim sm">↳ get out</td>'+
      '<td>'+_inp('go',id,'decl',r.decl,'','mono','export decl. no.',120)+'</td>'+
      '<td class="knq-bcell'+lot+'">'+
        '<span class="knq-lotdot" title="'+(LETTER_NAME[r.letter]||'lot type not set')+'">'+
        (r.letter||'?')+'</span>'+
        _inp('go',id,'batch',r.batch,'','mono b','260804X001',92)+bHint+'</td>'+
      '<td class="c"><select class="knq-sel" onchange="KNQ.setGo(\''+id+'\',\'letter\',this.value)">'+
        _op(TYPES.map(t=>({v:t,l:t+' '+LETTER_NAME[t]})),r.letter,'—')+'</select></td>'+
      '<td class="n"><input class="knq-in n" inputmode="decimal" placeholder="kg"'+
        ' style="min-width:88px" value="'+_esc(r.hqQty==null?'':r.hqQty)+'"'+
        ' data-f="'+id+'|hqQty"'+
        ' title="Quantity Customs approved for get out — reference only, not used in any calculation"'+
        ' onchange="KNQ.setGo(\''+id+'\',\'hqQty\',this.value)"></td>'+
      '<td class="n"><input class="knq-in n" data-o="'+id+'" inputmode="decimal" placeholder="kg"'+
        ' style="min-width:88px" value="'+_esc(r.baseKg==null?'':r.baseKg)+'"'+
        ' title="SAP Qty — GR quantity booked into SAP, i.e. the opening balance of period '+(_month||'')+
        '. A batch not used up at period close carries its remainder here for the next period."'+
        ' onchange="KNQ.setOp(\''+id+'\',this.value)">'+opHint+sapHint+'</td>'+
      '<td class="n">'+_K(r.usedKg)+(px?'<div class="sm">per OL1 '+(_month||'')+'</div>':'')+'</td>'+
      '<td class="n b'+(r.low?' knq-lowcell':'')+'">'+_K(r.remainKg)+
        (_closedRow(r)?'<div class="sm">out of KNQ</div>'
                 :(r.zeroDate&&!r.projected?('<div class="sm">empty '+_dmy(r.zeroDate)+'</div>'):''))+
        (r.low?('<div class="knq-lowtag" title="Less than '+_K(LOW_KG)+' kg ('+(LOW_KG/1000)+
                ' MT) left — running out">⚠ low '+(Math.round(r.remainKg/1000))+' MT</div>'):'')+
        (r.drop>0?('<div class="knq-drop" title="SAP stock fell by '+_K(r.drop)+' kg between '+
                _dmy(r.dropFrom)+' and '+_dmy(r.dropTo)+' — this batch is being pumped out right now">▼ '+
                _K(r.drop)+' kg since '+_dmy(r.dropFrom)+'</div>'):'')+
        _sapBadge(r)+'</td>'+
      '<td class="n">'+(r.baseKg>0?((r.pct*100).toFixed(1)+'%'):'')+
        '<div class="knq-pbar"><i style="width:'+((r.pct||0)*100).toFixed(1)+'%"></i></div></td>'+
      '<td class="n'+(soon?' knq-hot':'')+'">'+(r.eta?(_dmy(r.eta)+'<div class="sm">'+r.etaDays+' d</div>'):'')+'</td>'+
      '<td class="c"><input type="checkbox" class="knq-ck"'+(r.vas?' checked':'')+
        ' title="Tick once the VASSCM declaration for this batch has been filed"'+
        ' onchange="KNQ.toggleVas(\''+id+'\',this)"></td>'+
      '<td>'+_inp('go',id,'vasDate',r.vasDate,'date','','',null)+'</td>'+
      '<td>'+_inp('go',id,'note',r.note,'','','note',110)+
        (r.warn?('<div class="knq-warn">⚠ '+_esc(r.warn)+'</div>'):'')+
        '<div class="knq-acts">'+
        '<button class="knq-mini" title="Duplicate this get-out line" onclick="KNQ.cloneGo(\''+id+'\')">⧉</button>'+
        '<button class="knq-x" title="Delete this get-out line" onclick="KNQ.delGo(\''+id+'\')">✕</button></div></td>'+
    '</tr>';
  }

  /* ── BẢNG FEED OL1 trong modal ──────────────────────────────
     TỔNG P+X gõ tay · X gõ tay/import/dán · P = TỔNG − X (chỉ đọc).
     Ngày chưa gõ TỔNG → hiện số tạm tính 2.000 T bằng chữ mờ. */
  function _renderUse(){
    const tb=document.getElementById('knq-use-body'); if(!tb) return;
    const _fk=_focusKey();
    if(!_useMonth){ _useMonth=_ym(_today()); const m=document.getElementById('knq-use-month'); if(m) m.value=_useMonth; }
    const T=_today(), A=_asOf();
    const days=Object.keys(USE).filter(d=>_ym(d)===_useMonth).sort();
    const uh=document.getElementById('knq-use-unit-h');
    if(uh) uh.textContent=(_olUnit==='kg'?'kg':'MT');
    if(!days.length){
      tb.innerHTML='<tr><td colspan="7" class="knq-empty">No day in '+_useMonth+
        ' yet — click <b>📅 Fill month</b>, <b>📥 Import Excel</b> or <b>📋 Paste Excel</b>.</td></tr>';
      _renderImp(); return;
    }
    let sT=0,sP=0,sX=0,nDef=0;
    let aT=0,aP=0,aX=0,aN=0,aDef=0;         /* ⭐ v4.103 — luỹ kế THỰC tới D-1 */
    const body=days.map(d=>{
      const u=USE[d]||{}, x=_num(u.x), xp=_num(u.xp);
      const tRaw=_totOf(u), def=(tRaw==null);
      const tot=def?DEF_TOT_KG:tRaw;
      const xe=(x!=null)?x:xp;
      const p=Math.max(0,tot-(x!=null?x:0));
      if(def) nDef++;
      sT+=tot; sP+=p; if(xe!=null) sX+=xe;
      /* luỹ kế tới D-1 dùng số THỰC: X thiếu thì coi như 0, không mượn plan */
      if(d<=A){ aN++; if(def) aDef++;
        const xa=(x!=null)?x:0;
        aT+=tot; aX+=xa; aP+=Math.max(0,tot-xa); }
      const src=(x!=null)
        ? (u.xs==='p' ? '<span class="knq-b wait" title="PLAN figure loaded from the file">Plan</span>'
                      : '<span class="knq-b using" title="Actual figure">Actual</span>')
        : (xp!=null ? '<span class="knq-b wait" title="Only a plan X exists, no actual yet">Plan</span>'
                    : '<span class="knq-b" title="No X figure yet">—</span>');
      /* ⭐ hôm qua = ngày CHỐT SỐ của KNQ. Chưa gõ TỔNG ngày đó thì cả cột
         "đã bơm" của P/X là số đoán ⇒ tô đỏ cho thấy ngay. */
      const isA=(d===A);
      return '<tr class="'+(d===T?'knq-todayrow':'')+(isA?' knq-asofrow':'')+(isA&&def?' knq-asofbad':'')+'">'+
        '<td class="c">'+_dmy(d)+(isA?'<div class="sm b">← data as of</div>':
          (d===T?'<div class="sm">today · forecast</div>':''))+'</td>'+
        '<td><input class="knq-in n b" data-u="'+d+'|t" inputmode="decimal"'+
          ' value="'+(def?'':_disp(tot))+'" placeholder="'+_disp(DEF_TOT_KG)+'"'+
          ' title="TOTAL OL1 feed for the day — keyed in by hand. Leave blank to assume '+_disp(DEF_TOT_KG)+
          '. You can paste a whole column from Excel (Ctrl+V)."'+
          ' onpaste="KNQ.usePaste(event,\''+d+'\',\'t\')"'+
          ' onkeydown="KNQ.useKey(event,\''+d+'\',\'t\')" onchange="KNQ.setUse(\''+d+'\',\'t\',this.value)"></td>'+
        '<td class="n b knq-calc'+(def?' knq-dim':'')+'" title="P = TOTAL − X, calculated">'+
          _disp(p)+(def?'<div class="sm">TOTAL assumed '+_disp(DEF_TOT_KG)+'</div>':'')+'</td>'+
        '<td><input class="knq-in n" data-u="'+d+'|x" inputmode="decimal" value="'+_disp(x)+'"'+
          ' title="X — Export Petchem. Key in, import a file, or paste several rows (Ctrl+V)."'+
          ' onpaste="KNQ.usePaste(event,\''+d+'\',\'x\')"'+
          ' onkeydown="KNQ.useKey(event,\''+d+'\',\'x\')" onchange="KNQ.setUse(\''+d+'\',\'x\',this.value)"'+
          (xp!=null&&x==null?(' placeholder="'+_disp(xp)+'"'):'')+'></td>'+
        '<td class="n knq-plan">'+(xp!=null?_disp(xp):'')+'</td>'+
        '<td class="c">'+src+'</td>'+
        '<td><input class="knq-in" value="'+_esc(u.note||'')+'" onchange="KNQ.setUseNote(\''+d+'\',this.value)">'+
          '<button class="knq-x" onclick="KNQ.delUseRow(\''+d+'\')">✕</button></td></tr>';
    }).join('');
    /* ⭐ v4.103 — DÒNG TỔNG LÊN ĐẦU BẢNG, và tách làm HAI:
         ① TỔNG TỚI D-1 = lượng ĐÃ DÙNG THẬT (mốc chốt số của cả tab KNQ)
         ② TỔNG CẢ THÁNG = thực + plan, chỉ để nhìn xu hướng
       Đặt trên đầu để không phải cuộn hết 31 dòng mới thấy con số. */
    const U=_useMonth;
    tb.innerHTML=
      '<tr class="knq-tot knq-tot-d1"><td class="c">USED to '+_dmy(A)+
        '<div class="sm">actual · D-1</div></td>'+
      '<td class="n" title="Actual TOTAL P+X drawn from the 1st up to yesterday">'+_disp(aT)+'</td>'+
      '<td class="n" title="P = TOTAL − X, actual">'+_disp(aP)+'</td>'+
      '<td class="n" title="X actually keyed in / imported — days with no X count as 0 here">'+_disp(aX)+'</td>'+
      '<td colspan="3">'+aN+' day(s) counted'+
        (aDef?('<span class="knq-warn"> · ⚠ '+aDef+' with no TOTAL keyed in, assumed '+
          _disp(DEF_TOT_KG)+'</span>'):'')+
        ' — this is the figure the P/X run-down uses.</td></tr>'+
      '<tr class="knq-tot"><td class="c">TOTAL '+U+'<div class="sm">incl. plan</div></td>'+
      '<td class="n">'+_disp(sT)+'</td><td class="n">'+_disp(sP)+'</td>'+
      '<td class="n">'+_disp(sX)+'</td>'+
      '<td colspan="3">'+days.length+' day(s)'+(nDef?('<span class="knq-warn"> · ⚠ '+nDef+
        ' day(s) with no TOTAL P+X keyed in — assuming '+_disp(DEF_TOT_KG)+
        ' per day</span>'):'')+'</td></tr>'+
      body;
    _renderImp();
    _refocus(_fk);
  }

  /* ── khay chọn cột sau khi đọc file / dán bảng ── */
  function _renderImp(){
    const box=document.getElementById('knq-imp'); if(!box) return;
    if(_paste){
      box.style.display='';
      box.innerHTML=
        '<div class="knq-hint"><b>📋 Paste from Excel</b> — select the data range in Excel '+
        '(include the header row if you can), Ctrl+C, then Ctrl+V into the box below and click <b>READ</b>.</div>'+
        '<textarea id="knq-paste-txt" class="knq-paste" rows="6" '+
        'placeholder="Paste here… (one row per day, columns separated by Tab)"></textarea>'+
        '<div class="knq-frow">'+
          '<button class="knq-btn primary" onclick="KNQ.pasteRead()">✔ READ</button>'+
          '<button class="knq-btn" onclick="KNQ.pasteCancel()">Cancel</button>'+
        '</div>';
      return;
    }
    if(!_imp){ box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    const opts=_imp.head.map((h,i)=>({v:i,l:(i+1)+'. '+(h.length>46?(h.slice(0,46)+'…'):h)}));
    const none=[{v:-1,l:'— none —'}];
    const R=_impRows();
    const nA=R.filter(o=>o.src==='a'&&o.v!=null).length;
    const nP=R.filter(o=>o.src==='p'&&o.v!=null).length;
    const fp=(R.filter(o=>o.src==='p'&&o.v!=null)[0]||{}).d;
    const la=(R.filter(o=>o.src==='a'&&o.v!=null).slice(-1)[0]||{}).d;
    box.innerHTML=
      '<div class="knq-hint"><b>📥 '+_esc(_imp.name)+'</b>'+
      (_imp.sheet?(' · sheet <b>'+_esc(_imp.sheet)+'</b>'):'')+' — '+_imp.body.length+' row(s). '+
      'The app takes <b>ACTUAL</b> up to the first day with no figure, and <b>PLAN</b> from there on. '+
      'The result goes into the <b>X</b> cell; the Plan X column keeps the original plan.</div>'+
      '<div class="knq-frow">'+
        (_imp.sheets&&_imp.sheets.length>1
          ? ('<label>Sheet</label><select onchange="KNQ.impSet(\'sheet\',this.value)">'+
             _op(_imp.sheets.map(n=>({v:n,l:n})),_imp.sheet)+'</select>')
          : '')+
        (_imp.dCol>=0
          ? ('<label>Date column</label><select onchange="KNQ.impSet(\'dCol\',this.value)">'+
             _op(none.concat(opts),_imp.dCol)+'</select>')
          : ('<label>Day column (1–31)</label><select onchange="KNQ.impSet(\'dayCol\',this.value)">'+
             _op(none.concat(opts),_imp.dayCol)+'</select>'+
             '<label>Month</label><input type="month" value="'+_esc(_imp.month)+'"'+
             ' onchange="KNQ.impSet(\'month\',this.value)">'))+
        '<label>ACTUAL column</label><select onchange="KNQ.impSet(\'aCol\',this.value)">'+
          _op(none.concat(opts),_imp.aCol)+'</select>'+
        '<label>PLAN column</label><select onchange="KNQ.impSet(\'pCol\',this.value)">'+
          _op(none.concat(opts),_imp.pCol)+'</select>'+
        '<label>Unit</label><select onchange="KNQ.impSet(\'unit\',this.value)">'+
          _op([{v:'T',l:'MT'},{v:'kg',l:'kg'}],_imp.unit)+'</select>'+
        '<label title="By default a hand-keyed day is NOT overwritten by the file">'+
          '<input type="checkbox"'+(_imp.ow?' checked':'')+
          ' onchange="KNQ.impSet(\'ow\',this.checked)"> overwrite hand-keyed figures</label>'+
        '<button class="knq-btn primary" onclick="KNQ.impApply()">✔ APPLY</button>'+
        '<button class="knq-btn" onclick="KNQ.impCancel()">Cancel</button>'+
      '</div>'+
      '<div class="knq-hint '+(R.length?'':'knq-warn')+'">'+
        (R.length
          ? ('Will load <b>'+R.filter(o=>o.v!=null).length+'</b> day(s): <b>'+nA+'</b> actual'+
             (la?(' (up to '+_dmy(la)+')'):'')+' · <b>'+nP+'</b> plan'+(fp?(' (from '+_dmy(fp)+')'):'')+'.')
          : 'No date recognised — pick the date column again.')+'</div>';
  }

  /* ============================================================
     EXPORT — 1 sheet cho C3, 1 cho C4, 1 cho FEED OL1
  ============================================================ */
  function exportXlsx(){
    if(typeof XLSX==='undefined'){ _say('❌ Thư viện XLSX chưa nạp','er'); return; }
    recalc();
    const ST={using:'Pumping',wait:'Not started',zero:'VASSCM pending',
              ready:'Ready to close',done:'Done'};
    /* Ngày tờ khai / ngày nhập-xuất đã bỏ khỏi bảng nhưng VẪN xuất ra Excel
       để không mất dữ liệu cũ (cột "Legacy …"). */
    const H=['No.','Row type','Supplier / Shipment','Vessel','Decl. no.',
             'Batch (SAP lot)','Batch date','Lot type',
             'HQ approved get-out qty (kg)','SAP qty / opening (kg)','Used in period (kg)',
             'Actual left in KNQ (kg)','% pumped','Est. empty date',
             'VASSCM declared','VASSCM date','Status','Done','Done date','Note',
             'Legacy decl. date','Legacy in/out date','Unit price','Decl. weight (kg)',
             'Amount','Voyage balance (kg)'];
    const wb=XLSX.utils.book_new();
    MATS.forEach(mat=>{
      const rows=[];
      visibleGi(mat).forEach(g=>{
        rows.push([g.no||'','GET IN',g.vendor||'',g.vessel||'',g.decl||'',
          '','','',g.hqSum||'',g.baseKg||'',g.usedSum||'',g.remainKg||0,'','',
          '','',ST[g.st]||'',g.hqDone?'x':'',_dmy(g.hqDate),g.note||'',
          _dmy(g.regDate),_dmy(g.date),_num(g.price),g.qtyN,g.amount,g.balKg]);
        childrenOf(g._id).forEach((r,i)=>{
          rows.push([i+1,'GET OUT',r.time||'',g.vessel||'',r.decl||'',
            r.batch||'',_dmy(_batchDate(r.batch)),LETTER_NAME[r.letter]||r.letter||'',
            r.hqQtyN,r.baseKg,r.usedKg,r.remainKg,r.pct||0,_dmy(r.eta),
            r.vas?'x':'',_dmy(r.vasDate),ST[r.st]||'',r.hqDone?'x':'',_dmy(r.hqDate),r.note||'',
            _dmy(r.regDate),_dmy(r.date),_num(r.price),r.qtyN,r.amount,r.balKg]);
        });
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([H].concat(rows)),mat+' '+MAT_NAME[mat]);
    });
    const use=Object.keys(USE).sort().map(d=>{
      const u=USE[d]||{}, x=_num(u.x), xp=_num(u.xp);
      const tRaw=_totOf(u), tot=(tRaw==null)?DEF_TOT_KG:tRaw;
      const p=Math.max(0,tot-(x!=null?x:0));
      return [d,tot/1000,p/1000,(x==null?null:x/1000),(xp==null?null:xp/1000),
              (x==null?(xp==null?'':'Plan'):(u.xs==='p'?'Plan':'Actual')),
              (tRaw==null?'assumed':''),u.note||''];
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(
      [['Date','Total P+X (T)','P = Total − X (T)','X (T)','Plan X (T)','X source','Total','Note']]
      .concat(use)),'Feed OL1');
    XLSX.writeFile(wb,'Bonded_Warehouse_KNQ_'+(_month||_ym(_today()))+'.xlsx');
    _say('📤 Excel exported','ok');
  }

  /* ============================================================
     LIFECYCLE
  ============================================================ */
  function init(){
    if(_initDone) return; _initDone=true;
    _month=_ym(_today()); _useMonth=_month;
    _syncEls();
  }
  function onTabEnter(){
    init();
    if(_loaded){ render(); return; }
    _loaded=true;
    MATS.forEach(mt=>{ const tb=document.getElementById('knq-body-'+mt.toLowerCase());
      if(tb) tb.innerHTML='<tr><td colspan="'+COLS+'" class="knq-empty">Loading…</td></tr>'; });
    _load().then(()=>{
      Object.values(GI).forEach(r=>{ r._svSt=r.st||'open'; });
      Object.values(GO).forEach(r=>{ r._svSt=r.st||'open'; });
      /* ⭐ v4.102 — kỳ MỞ mới là kỳ làm việc. Con trỏ nằm trên Firebase nên
         máy nào mở lên cũng vào đúng kỳ, không phụ thuộc lịch của máy. */
      if(_curPeriod && _month<_curPeriod){ _month=_curPeriod; _useMonth=_curPeriod; }
      _syncEls();
      _autoCollapse();      /* chuyến đã bơm ra hết → gập sẵn cho đỡ nhiễu */
      render();
      _attachLive();        /* ⭐ từ đây mọi máy thấy nhau theo thời gian thực */
      _syncTag('✓ synced '+_hm(),'ok');
      _autoSyncSap();       /* ⭐ D/E phải là số của D-1 — quét lại nếu đã cũ */
    }).catch(e=>{ console.warn('[KNQ] load',e); render(); _say('❌ Could not load KNQ data','er'); });
  }

  return {
    init, onTabEnter, render, recalc, save, loadOld, exportXlsx,
    pullSap, copySap, fillSapQty,
    addGi, addGo, cloneGo, setGi, setGo, delGi, delGo, toggleDone, toggleVas, toggleGroup,
    onMonth, closeMonth, setOp, childrenOf, visibleGi,
    openArch, closeArch, loadArch,
    onFilter, clearFilter, collapseAll, shownChildren, matchGo, filterOn,
    openOl1, closeOl1, onOl1Unit, setUse, setUseNote, useKey, usePaste,
    addUseRow, fillUseMonth, delUseRow, onUseMonth,
    pickFile, fileChosen, impSet, impApply, impCancel,
    pasteOpen, pasteRead, pasteCancel,
    _state:{ GI, GO, USE, SAPB, sapAsOf:()=>_sapAsOf, imp:()=>_imp, impRows:()=>_impRows(),
             totOf:_totOf, useOf:_useOf, batchDate:_batchDate, outDate:_outDate, DEF_TOT_KG,
             asOf:_asOf, sapAsOf2:()=>_sapAsOf,
             open:_open, autoCollapse:()=>{ _autoDone=false; _autoCollapse(); },
             filter:()=>({ q:_fq, st:_fSt, lot:_fLot }),
             setFilter:(q,st,lot)=>{ _fq=q||''; _fSt=st||''; _fLot=lot||''; },
             month:()=>_month, setMonth:m=>{ _month=m; _useMonth=m; },
             /* v4.102 — kỳ mở / kỳ đã đóng / đồng bộ (dùng cho kiểm thử) */
             curPeriod:()=>_curP(), rawPeriod:()=>_curPeriod,
             setPeriod:p=>{ _curPeriod=p||''; },
             overdue:_overdue, isOpenP:_isOpenP, liveFrom:_liveFrom,
             closed:()=>_closed, setClosed:c=>{ _closed=c||{}; },
             sapAt:_sapAt, dirty:()=>_dirty, flush:_flush,
             /* v4.103 — dấu thời gian quét SAP + tổng FEED OL1 */
             sapSync:()=>_sapSync, setSapSync:v=>{ _sapSync=v||{at:'',by:'',asOf:'',de:0,px:0}; },
             /* v4.104 — vòng đời lô P/X · lô sắp cạn · lô vừa được cứu */
             isPX:_isPX, closedRow:_closedRow, reopened:()=>_reopened,
             rescuePX:_rescuePX, LOW_KG:LOW_KG,
             ol1Sum:_ol1Sum, autoSyncSap:()=>{ _autoSap=false; _autoSyncSap(); },
             arch:()=>_arch, dirtyOver:_dirtyOver }
  };
})();
window.KNQ = KNQ;
