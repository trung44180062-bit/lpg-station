/* ============================================================
 * BOND — bond.js   (v4.116) · KHO NGOẠI QUAN GỘP THẲNG VÀO TAB SAP
 * ------------------------------------------------------------
 * Tab: LPG Sales ▸ SAP ▸ nút gạt "🛃 Kho ngoại quan (KNQ)"
 * Global: window.BOND
 * Nạp: SAU sp.js (đọc SP.batch1100). Tab KNQ cũ đã gỡ ở v4.109 — node
 *      knq_bonded/use vẫn là nguồn FEED OL1 và KHÔNG được xoá.
 * LAZY — chỉ đọc Firebase khi bật sang chế độ KNQ lần đầu.
 * ------------------------------------------------------------
 * ⭐ Ý TƯỞNG NỀN — VÌ SAO BẢN NÀY THAY ĐƯỢC CẢ TAB KNQ CŨ
 *
 * Tab KNQ cũ giữ MỘT SỔ RIÊNG song song với SAP (node knq_bonded/gi + go).
 * Toàn bộ bộ máy nặng nhất của nó — cờ ✔ Done, 🔒 khoá lô, 📌 đóng kỳ, tồn
 * đầu kỳ op[], ♻ mở khoá — chỉ tồn tại để giữ hai sổ khỏi lệch nhau.
 * BỎ SỔ RIÊNG THÌ BỎ ĐƯỢC CẢ BỘ MÁY. Bản này không sở hữu con số nào:
 *
 *   • SỐ  ← SP.ROWS (SLoc 1100, tách theo mã batch) — đọc sống, không chép.
 *   • CHỮ ← knq_info/<mat>_<mã batch> — thứ SAP không có: STT tàu, tên tàu,
 *           tờ khai nhập, tờ khai xuất, HQ approved, VASSCM, ghi chú.
 *   • OL1 ← knq_bonded/use — DÙNG CHUNG với tab KNQ cũ, để trong lúc chạy
 *           song song hai bảng luôn ra cùng một con số.
 *
 * ⭐ TRỪ LÙI — ĐƠN GIẢN HƠN BẢN CŨ RẤT NHIỀU (chốt của người dùng, đã kiểm
 *    chứng trên dữ liệu thật 11/08→18/08, xuất Firebase 20/08/2026):
 *
 *    SAP KHÔNG ĐỘNG VÀO LÔ P/X SUỐT CẢ THÁNG — số của mọi lô P và X đứng
 *    yên tuyệt đối qua cả 8 ngày dữ liệu (chỉ D và E nhúc nhích hằng ngày).
 *    Nghĩa là End Stock của lô P/X tại NGÀY D-1 CHÍNH LÀ tồn đầu kỳ.
 *    ⇒ Thực còn = End Stock (D-1) − FEED OL1 của kỳ, chia FIFO.
 *
 *    Không cần mốc neo, không cần tồn đầu kỳ, KHÔNG CẦN ĐÓNG KỲ. Cuối tháng
 *    SAP ghi nhận một lượt, số tự nắn lại. Kỳ tháng 9 dùng ảnh chụp SAP và
 *    OL1 của tháng 9, không đụng gì tới tháng 8.
 *
 *    D/E thì lấy thẳng End Stock — SAP cập nhật chúng hằng ngày.
 *
 * ⭐ HẾT LÔ = SAP NÓI HẾT, KHÔNG PHẢI NGƯỜI DÙNG TICK
 *    End Stock về 0, hoặc mã batch rơi hẳn khỏi ZMMFR022 ⇒ tô màu + mời xoá.
 *    Không còn cờ done nào để mà kẹt.
 *
 * ⭐ TÌNH TRẠNG LÔ — Ô "STT · TÌNH TRẠNG" GHIM TRÁI
 *    Mỗi lô đúng MỘT trạng thái, cộng hai dấu phụ độc lập (✚ mới · ✎ thiếu TT).
 *      ▶ pumping — ĐANG BƠM. Nhận diện KHÁC NHAU theo loại lô:
 *          D/E · HAI dấu hiệu, dính một cái là đủ:
 *                ① cột GI hoặc Trs ÂM ⇒ bằng chứng trực tiếp từ SAP
 *                ② End Stock < HQ approved (người dùng gõ) ⇒ đã có hàng ra
 *                   khỏi lô. Bắt được cả những NGÀY GIỮA của một lô bơm dài,
 *                   lúc SAP không ghi bút toán nên GI/Trs đều bằng 0.
 *                   ⚠ Ô HQ approved TRỐNG hoặc 0 ⇒ BỎ QUA ②, chỉ dùng ①.
 *          P/X · SAP đứng yên cả tháng nên phải suy từ hàng đợi FIFO:
 *                đầu hàng còn hàng và đã tới ngày dùng. Mỗi (Mat × lô) đúng MỘT.
 *      ○ wait    — còn nguyên, chưa tới lượt rút
 *      ◍ emptied — về 0 mà CHƯA tích VASSCM ⇒ CÒN VIỆC PHẢI LÀM, tô nổi
 *      ✓ zero    — về 0 và đã VASSCM (hoặc chưa từng có hàng) ⇒ LÀM MỜ đi
 *      ⛔ gone    — SAP không còn mã batch ⇒ kiểm tra rồi xoá dòng
 *    ✚ LÔ MỚI = chưa có ở ảnh chụp SAP ngày liền trước (_prevDay ≈ D-2),
 *      hoặc cột GR dương ⇒ hàng vừa nhập kho.
 *
 * ⭐ SẮP XẾP (chốt của người dùng): C3 → C4 · D → E → P → X · trong mỗi loại
 *    lô thì CŨ TRÊN MỚI DƯỚI. Đọc từ trên xuống chính là trình tự rút hàng.
 *    Số thứ tự trong ô STT vì thế MANG NGHĨA, không phải số trang trí.
 *
 * ⭐ MÀU DÒNG mang hai tầng cùng lúc: thanh rail trái = LOẠI LÔ (P chàm ·
 *    X tím · D mòng két · E hổ phách), nền dòng = TÌNH TRẠNG.
 *
 * ⭐ DỰ KIẾN HẾT — LƯỢT CHIẾU TỚI TƯƠNG LAI (cột "Dự kiến hết")
 *    Lượt 1 cho ra Thực còn tại D-1. Lượt 2 chạy lại từ đầu kỳ trên MỘT BỘ
 *    SỐ RIÊNG, tuyệt đối không ghi vào r.left:
 *      · ngày ≤ mốc SAP → số THẬT
 *      · ngày sau đó    → CHIẾU: TỔNG lấy plan, TRỐNG **HOẶC 0** thì chạy
 *                         DEF_TOT_KG; X lấy ô X → plan xp → bình quân 7 ngày
 *    ⚠ VÌ SAO NGÀY TƯƠNG LAI COI 0 LÀ "CHƯA ĐIỀN": ngày đã qua gõ 0 là số
 *    thật (nhà máy dừng) và phải tôn trọng; ngày chưa tới mà để 0 thì chỉ
 *    có nghĩa chưa nhập, đem đi chiếu sẽ ra "lô không bao giờ hết".
 *    Đây chính là chỗ đã sót ở bản đầu — bảng OL1 mất mức tạm tính nên
 *    không dự đoán được ngày bơm xong cho P/X.
 *
 * ⭐ TICK VAS PHẢI BẤM HAI LẦN (v4.109)
 *    Ô VAS rộng 48 px. Tick nhầm một cái là lô nhảy từ "Empty — no VASSCM"
 *    (còn việc phải làm, tô cam, đứng trong dải cảnh báo) sang "Done" (làm
 *    mờ, hết nhắc) ⇒ MẤT DẤU một việc chưa làm mà không ai hay. Bỏ tick nhầm
 *    cũng tệ ngang. Click 1 chỉ NẠP (ô đổi thành ❓ nền vàng nhấp nháy +
 *    toast nói rõ sắp bật hay sắp tắt), click 2 vào ĐÚNG ô đó mới ghi.
 *    Nạp tự huỷ sau 4 s, khi bấm sang ô khác, hoặc khi bảng dựng lại.
 *    Ô VASSCM date bên cạnh VẪN sửa một lần: gõ sai ngày thì nhìn thấy ngay
 *    trên bảng, không âm thầm như cái tick.
 *
 * ⚠ ĐANG LÀM VIỆC Ở ĐÂU THÌ MÀN HÌNH PHẢI Ở NGUYÊN ĐÓ (v4.107 — đã dính)
 *    Bản đầu: mỗi lần gõ một ô hay tick VAS đều `replaceData` cả bảng ⇒
 *    Tabulator dựng lại toàn bộ dòng ⇒ NHẢY VỀ ĐẦU. Đang sửa lô thứ 25 mà
 *    cứ gõ xong một ô lại phải cuộn xuống tìm lại — rất dễ gõ nhầm sang
 *    dòng khác. Cách chữa, hai tầng:
 *      ① `_refill()` so CHỮ KÝ bộ dòng. Không đổi ⇒ `updateData()` sửa đúng
 *         ô trong DOM sẵn có, không đụng vị trí cuộn. Chỉ khi bộ dòng THỰC
 *         SỰ đổi (lọc, đổi kỳ, dán SAP mới) mới `replaceData`.
 *      ② Cả hai đường đều lưu/trả `scrollTop` + `scrollLeft` của
 *         `.tabulator-tableholder` — bảng rộng nên phải giữ cả cuộn ngang.
 *    ⚠ `updateData()` KHÔNG chạy lại rowFormatter ⇒ phải gọi `_paintAll()`,
 *    không thì tick VAS xong dòng vẫn giữ màu cũ.
 *    Bảng FEED OL1 dính y hệt (dựng lại cả <tbody>): giữ chỗ cuộn + ô đang
 *    đứng qua `data-u="<ngày>|<cột>"`, nếu không Tab qua 31 ngày là mất ô.
 *
 * ⭐ v4.108 — FEED OL1 NHẬN SỐ X TỪ FILE KẾ HOẠCH
 *    📥 Import Excel / 📋 Paste Excel. App tự chấm điểm tiêu đề cột để tách
 *    cột ACTUAL và cột PLAN (file KH tiếng Hàn), rồi GHÉP: lấy ACTUAL tới
 *    ngày đầu tiên thiếu số, từ đó trở đi lấy PLAN và KHÔNG quay lại actual.
 *    Mỗi ngày mang cờ nguồn `xs`: 'a' actual · 'p' plan · 'm' người dùng gõ.
 *    ⚠ Ngày `xs==='m'` KHÔNG bị import đè (trừ khi tích "overwrite").
 *    ⚠ Cột **Source** trong bảng OL1 hiện đúng ba nhãn đó — người dùng phải
 *    nhìn ra ngay đâu là số THẬT, đâu là số KẾ HOẠCH, vì cả Actual left lẫn
 *    Empty by đều đứng trên nó. Ngày ĐÃ QUA mà còn cờ 'p' ⇒ dải cảnh báo
 *    nhắc import actual, vì trừ lùi đang chạy trên số kế hoạch.
 *    Số plan gốc luôn giữ ở `xp` để đối chiếu, import bao nhiêu lần cũng vậy.
 *
 * ⚠ NÚT XOÁ DÒNG PHẢI GHIM TRÁI. Bảng 22 cột, để ✕ ở tận cùng bên phải là
 *    người dùng không bao giờ nhìn thấy (đã dính một lần).
 *
 * ⚠ GIAO DIỆN LÀ TIẾNG ANH (chốt của người dùng, v4.106). Chú thích trong
 *    mã vẫn tiếng Việt — chỉ CHUỖI HIỂN THỊ mới phải tiếng Anh: tiêu đề cột,
 *    tooltip, chip tình trạng, thẻ, dải cảnh báo, toast, hộp xác nhận, modal
 *    FEED OL1, tiêu đề file Excel. `tests/bond-dom.smoke.js` có mục soi lại
 *    chuyện này, gõ tiếng Việt vào chuỗi hiển thị là test đỏ ngay.
 *    Khối "📊 Raw SAP" nằm NGOÀI phạm vi — nó là bảng cũ, chưa chuyển ngữ.
 *
 * ⚠ KHÔNG ĐƯỢC làm hai việc sau, đã cân nhắc kỹ:
 *    ① Thêm cột của KNQ vào chính node sap_ — cav.js / plan.js /
 *      mthr.js đều đang đọc SP.ROWS, và thông tin hải quan sẽ nằm trong tầm
 *      với của nút 🗑 Range delete. knq_info là node RIÊNG vì lẽ đó.
 *    ② Vẽ lại toàn bộ innerHTML mỗi lần sửa một ô — đó chính là thứ làm tab
 *      KNQ cũ nuốt chữ khi đang gõ. Ở đây dùng Tabulator, sửa tại chỗ, đẩy
 *      đúng ô vừa sửa qua cellEdited, y như tab SAP vẫn làm.
 * ------------------------------------------------------------
 * BỐ CỤC CỘT (chốt của người dùng) — khối giữa GIỮ Y HỆT TAB SAP THÔ để
 * đối chiếu bằng mắt không phải dịch cột:
 *
 *   TRÁI  · nhận dạng, người dùng gõ : STT tàu · Tên tàu · TK nhập · NGÀY GET IN
 *                                      · TK xuất
 *   GIỮA  · nguyên văn SAP, chỉ đọc  : Date · SLoc · Mat · Batch · Batch code
 *                                      · Init · GR · GI · Trs · End
 *   PHẢI  · phần làm việc            : HQ approved · Thực còn · % · VASSCM
 *                                      · VASSCM date · Ghi chú
 * ------------------------------------------------------------
 * Firebase:
 *   knq_info/<mat>_<mã batch>   {vno,vessel,dIn,gIn,dOut,hqQty,vas,vasDate,note}
 *   knq_period/<YYYY-MM>        ảnh chụp cả bảng khi bấm 💾 Lưu kỳ
 *   knq_bonded/use/<YYYY-MM-DD> FEED OL1 — dùng chung với tab KNQ cũ
 * ============================================================ */
"use strict";

const BOND = (function(){

  /* ── hằng số ─────────────────────────────────────────────── */
  const FB_INFO = 'knq_info';
  const FB_PER  = 'knq_period';
  const FB_USE  = 'knq_bonded/use';
  /* ══ v4.118 — SỔ THEO DÕI + KHO LƯU TRỮ ═══════════════════════════════
     FB_WATCH — sổ theo dõi: mọi mã batch TỪNG thấy trong SAP (SLoc 1100),
       kèm ngày thấy lần cuối và số End của ngày đó. NHỜ NÓ mà một lô biến
       mất khỏi SAP vẫn hiện được trên bảng dù CHƯA AI GÕ gì cho lô đó —
       trước v4.118 lô như vậy im lặng biến mất, không ai biết còn thiếu
       một lượt get out trên VAS. Nhẹ: mỗi lô một dòng, xoá khi lưu trữ.
     FB_ARCH — kho lưu trữ đầy đủ, gom theo THÁNG CỦA NGÀY VASSCM.
       ⚠ CỐ Ý KHÔNG NẠP khi mở app: đây là dữ liệu chết, chỉ đọc khi người
       dùng bấm gọi về đúng tháng cần xem.
     FB_AIDX — CHỈ MỤC: '<YYYY-MM>/<khoá> = mã batch'. Vài chục byte một lô
       nên NẠP ĐƯỢC, đủ để hiện "kho lưu trữ đang giữ bao nhiêu lô, tháng
       nào có bao nhiêu" mà không phải kéo dữ liệu về. */
  const FB_WATCH = 'knq_watch';
  const FB_ARCH  = 'knq_arch';
  const FB_AIDX  = 'knq_arch_idx';
  const ARCH_WAIT_DAYS = 7;      /* rời SAP + đã VASSCM ⇒ chờ ngần này ngày rồi mới lưu trữ */
  const MATS    = ['C3','C4'];
  const LETTER_NAME = { P:'Petchem', X:'Export Petchem', D:'Domestic', E:'Export' };
  const DEF_TOT_KG  = 2000000;   /* ngày chưa gõ TỔNG P+X → tạm tính 2.000 T */
  const HORIZON     = 240;       /* chiếu tối đa bao nhiêu ngày về tương lai   */
  const AVG_DAYS    = 7;         /* bình quân mấy ngày để suy plan còn thiếu   */
  const WARN_DAYS   = 7;         /* dự kiến hết trong ≤ 7 ngày → tô cảnh báo   */
  const LOW_KG      = 200000;    /* còn dưới 200 T → cảnh báo sắp cạn        */
  const INFO_FIELDS = ['vno','vessel','dIn','gIn','dOut','hqQty','vas','vasDate','note'];
  /* ⭐ VÒNG ĐỜI MỘT LÔ — mỗi lô đúng MỘT trạng thái, đọc từ trên xuống là
     thấy luôn trình tự rút hàng (đã sắp C3→C4, D→E→P→X, cũ trên mới dưới). */
  const ST_NAME = { pumping:'Pumping', wait:'Not started', emptied:'Empty — no VASSCM',
                    zero:'Done', gone:'Not in SAP', archiving:'Done — archiving' };
  const ST_ICON = { pumping:'▶', wait:'○', emptied:'◍', zero:'✓', gone:'⛔', archiving:'🗄' };

  /* ── trạng thái ──────────────────────────────────────────── */
  const INFO = {};               /* '<mat>_<bcode>' → bản ghi người dùng gõ  */
  const USE  = {};               /* 'YYYY-MM-DD'    → {t,x,xp,xs,note}       */
  let  PERIODS = {};             /* 'YYYY-MM'       → {savedAt,savedBy,…}    */
  const WATCH = {};              /* '<mat>_<bcode>' → {mat,bcode,first,last,end,at,by} */
  let  AIDX  = {};               /* 'YYYY-MM'       → { '<khoá>': '<mã batch>' }       */
  let _arcM='';                  /* tháng lưu trữ đang mở xem                */
  let _arcRows=null;             /* dữ liệu tháng đó, chỉ đọc                */
  let _arcBusy=false;            /* đang ghi kho lưu trữ — chống chạy chồng  */
  let _arcSaid='';               /* chữ ký lần toast lưu trữ gần nhất        */

  let _table=null, _fb=null, _live=false, _loaded=false, _initDone=false;
  let _echo=0, _echoUntil=0;
  let _month='';                 /* KỲ đang xem — mặc định tháng của D-1     */
  let _mode='raw';               /* 'raw' | 'knq'                            */
  let _slim=false;               /* ẩn bớt cột Init/GR/GI/Trs cho bảng gọn   */
  /* ⭐ v4.116 — MẶC ĐỊNH THU GỌN. Dải thẻ chiếm gần 1/3 chiều cao màn hình
     mà phần lớn thời gian người dùng chỉ cần cái BẢNG. Muốn xem thì bấm ▤. */
  let _cardsOpen=false;
  /* ⭐ v4.116 — MỌI CẢNH BÁO GOM VÀO CHUÔNG 🔔, mặc định ĐÓNG.
     Trước đây bốn năm dải cảnh báo xếp chồng đẩy bảng tụt xuống dưới màn
     hình. Giờ chúng nằm trong một tấm thả xuống, chuông đeo số + màu theo
     mức nặng nhất, bấm mới mở. */
  let _alOpen=false, _alerts=[], _alSaid='', _alBound=false;
  let _arch=null, _archM='';     /* kỳ đã lưu đang mở (chỉ đọc)              */
  let _rows=[];                  /* kết quả recalc gần nhất (ĐÃ lọc)         */
  let _all=[];                   /* trước khi lọc — dùng cho thẻ thống kê    */
  let _olUnit='T';
  let _imp=null;                 /* bảng thô vừa đọc từ file Excel / ô dán  */
  let _wb=null;                  /* workbook đang mở (để đổi sheet)         */
  let _paste=false;              /* đang mở ô dán từ Excel                  */
  let _sapDay='', _sapBehind=false;
  /* ⭐ ẢNH CHỤP NGÀY LIỀN TRƯỚC (D-2) — dùng để nhận ra LÔ MỚI: mã batch
     chưa có ở ngày trước mà nay đã có (và cột GR dương) = hàng vừa nhập kho. */
  let _prevDay='', _prevSet=null;
  /* ── THANH LỌC (giống tab KNQ cũ) ────────────────────────────────
     Lọc ở mức DÒNG, AND với nhau. Đang lọc thì thẻ thống kê vẫn tính trên
     TOÀN BỘ lô — nếu không, lọc một cái là tổng tồn kho nhảy lung tung. */
  let _fq='', _fMat='', _fLot='', _fSt='';

  /* ── tiện ích ────────────────────────────────────────────── */
  function _esc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s)
    : String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function _say(m,t){ if(typeof toast==='function') toast(m,t); else console.log('[BOND]',m); }
  function _canWrite(){ try{ return (typeof canWrite==='function') ? canWrite('sap') : true; }catch(_){ return true; } }
  function _el(id){ try{ return document.getElementById(id); }catch(_){ return null; } }
  function _num(v){
    if(v===null||v===undefined||v==='') return null;
    if(typeof v==='number') return isFinite(v)?v:null;
    let s=String(v).trim().replace(/,/g,'').replace(/\s/g,'').replace(/[−‒–—]/g,'-');
    if(/-$/.test(s)) s='-'+s.slice(0,-1);
    const n=parseFloat(s); return isFinite(n)?n:null;
  }
  function _n(v){ const x=_num(v); return x==null?0:x; }
  /* ⚠ _pinToday CHỈ dùng cho test. Bộ test chạy trên ẢNH CHỤP Firebase đứng
     yên (SAP tới 18/08, OL1 hết tháng 8) nhưng lượt CHIẾU TỚI TƯƠNG LAI lại
     đo từ đồng hồ thật ⇒ mỗi ngày trôi qua là kết quả một khác, và tới ngày
     lô dự kiến hết thì hai mục "còn N ngày" / "lùi xa ra" đỏ lên dù mã không
     đổi gì (đã dính hôm 26/08). Ghim ngày là cách duy nhất để bộ test nói về
     đúng một tình huống. TUYỆT ĐỐI không gọi từ mã chạy thật. */
  let _pinToday='';
  function _today(){ if(_pinToday) return _pinToday;
    const d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  /* ⭐ MỌI SỐ CỦA KHO NGOẠI QUAN LÀ SỐ CỦA HÔM QUA. SAP chậm hơn thực tế một
     ngày, và hôm nay còn đang bơm dở nên chưa có số cuối cùng. */
  function _asOf(){ return _addDays(_today(),-1); }
  function _addDays(iso,k){
    const t=Date.parse(iso+'T00:00:00Z'); if(isNaN(t)) return '';
    const d=new Date(t+k*86400000);
    return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  function _ym(d){ return String(d||'').slice(0,7); }
  function _lastDay(ym){
    const y=+String(ym).slice(0,4), m=+String(ym).slice(5,7);
    if(!y||!m) return '';
    const d=new Date(Date.UTC(y,m,0));
    return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  function _dayDiff(a,b){ if(!a||!b) return null;
    const x=Date.parse(a+'T00:00:00Z'), y=Date.parse(b+'T00:00:00Z');
    if(isNaN(x)||isNaN(y)) return null;
    return Math.round((x-y)/86400000);
  }
  function _dmy(iso){ if(!iso) return ''; const p=String(iso).split('-');
    return p.length===3 ? (p[2]+'/'+p[1]+'/'+p[0].slice(2)) : String(iso); }
  function _K(v){ return (v==null||!isFinite(v)) ? '' : Math.round(v).toLocaleString('en-US'); }
  function _T(v){ return (v==null||!isFinite(v)) ? '' :
    (v/1000).toLocaleString('en-US',{maximumFractionDigits:1}); }
  function _op(list,cur,blank){
    let h=blank?('<option value="">'+blank+'</option>'):'';
    (list||[]).forEach(o=>{ const val=(o.v!==undefined)?o.v:o, lbl=(o.l!==undefined)?o.l:o;
      h+='<option value="'+_esc(val)+'"'+(String(val)===String(cur==null?'':cur)?' selected':'')+
         '>'+_esc(lbl)+'</option>'; });
    return h;
  }
  function _who(){ try{ return (typeof CURRENT_USER!=='undefined' && CURRENT_USER && CURRENT_USER.name)
    ? CURRENT_USER.name : ''; }catch(_){ return ''; } }
  function _stamp(){ const d=new Date(), z=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+' '+z(d.getHours())+':'+z(d.getMinutes()); }
  /* ngày ĐƯỢC PHÉP DÙNG lô, đọc từ chính mã batch: 260714X001 ⇒ 14/07/2026 */
  function _batchDate(code){
    const m=String(code||'').trim().toUpperCase().match(/^(\d{2})(\d{2})(\d{2})[DEPX]/);
    if(!m) return '';
    const mm=+m[2], dd=+m[3];
    if(mm<1||mm>12||dd<1||dd>31) return '';
    return '20'+m[1]+'-'+m[2]+'-'+m[3];
  }
  function _letterOf(code){
    const s=String(code||'').trim().toUpperCase();
    const m=s.match(/^\d{6}([DEPX])/); return m?m[1]:'';
  }
  function _isPX(L){ return L==='P'||L==='X'; }
  function _key(mat,bcode){ return String(mat||'')+'_'+String(bcode||'').toUpperCase(); }

  /* ============================================================
     FIREBASE — ghi theo TỪNG Ô, không đẩy cả bảng
     ------------------------------------------------------------
     Bắt chước đúng cách tab SAP đang làm (applyAndPush): mỗi ô sửa là một
     path riêng trong payload update(). Không có hàng đợi _dirty, không có
     nút 💾 Save cho dữ liệu bảng — gõ xong rời ô là lên.
  ============================================================ */
  function _ref(){ if(!_fb) _fb=firebase.database(); return _fb; }
  function _mine(){ return _echo>0 && Date.now()<_echoUntil; }
  function _push(payload,reason){
    if(!Object.keys(payload||{}).length) return Promise.resolve(false);
    if(typeof firebase==='undefined'){ _say('⚠ Offline — nothing was pushed','warn'); return Promise.resolve(false); }
    _echo++; _echoUntil=Date.now()+1200;
    return _ref().ref().update(payload)
      .then(()=>{ if(reason) _syncTag('✓ '+reason,'ok'); return true; })
      .catch(e=>{ console.warn('[BOND] push',e); _say('❌ Firebase write failed','er'); return false; })
      .finally(()=>setTimeout(()=>{ _echo--; },900));
  }
  function _syncTag(txt,cls){
    const e=_el('bondSync'); if(!e) return;
    e.textContent=txt||''; e.className='bond-sync '+(cls||'');
  }

  function _load(){
    if(_loaded) return Promise.resolve();
    _loaded=true;
    const R=_ref();
    return Promise.all([
      R.ref(FB_INFO).once('value').then(s=>{ const v=s.val()||{};
        Object.keys(v).forEach(k=>{ INFO[k]=v[k]||{}; }); }).catch(e=>console.warn('[BOND] info',e)),
      R.ref(FB_USE).once('value').then(s=>{ const v=s.val()||{};
        Object.keys(v).forEach(k=>{ USE[k]=v[k]||{}; }); }).catch(e=>console.warn('[BOND] use',e)),
      R.ref(FB_PER).once('value').then(s=>{ PERIODS=s.val()||{};
        /* chỉ giữ phần đầu bản ghi cho nhẹ — rows đọc riêng khi mở kỳ */
        Object.keys(PERIODS).forEach(k=>{ const p=PERIODS[k]||{};
          PERIODS[k]={ savedAt:p.savedAt||'', savedBy:p.savedBy||'', sapDate:p.sapDate||'',
                       n:(p.rows?Object.keys(p.rows).length:0) }; });
      }).catch(e=>console.warn('[BOND] periods',e)),
      /* v4.118 — sổ theo dõi (nhẹ, luôn nạp) */
      R.ref(FB_WATCH).once('value').then(s=>{ const v=s.val()||{};
        Object.keys(v).forEach(k=>{ WATCH[k]=v[k]||{}; }); }).catch(e=>console.warn('[BOND] watch',e)),
      /* v4.118 — CHỈ MỤC kho lưu trữ (chỉ mã batch, KHÔNG phải dữ liệu) */
      R.ref(FB_AIDX).once('value').then(s=>{ AIDX=s.val()||{}; })
        .catch(e=>console.warn('[BOND] arch idx',e))
    ]).then(()=>_attachLive());
  }
  function _attachLive(){
    if(_live || typeof firebase==='undefined') return;
    _live=true;
    const R=_ref();
    try{
      const q=R.ref(FB_INFO);
      const put=s=>{ if(_mine()) return; const k=s.key, v=s.val(); if(!v) return;
        INFO[k]=v; _schedule(); };
      q.on('child_added',put); q.on('child_changed',put);
      q.on('child_removed',s=>{ if(_mine()) return; delete INFO[s.key]; _schedule(); });
    }catch(e){ console.warn('[BOND] live info',e); }
    try{
      const q=R.ref(FB_USE);
      const put=s=>{ if(_mine()) return; USE[s.key]=s.val()||{}; _schedule(); };
      q.on('child_added',put); q.on('child_changed',put);
      q.on('child_removed',s=>{ if(_mine()) return; delete USE[s.key]; _schedule(); });
    }catch(e){ console.warn('[BOND] live use',e); }
    try{
      const q=R.ref(FB_WATCH);
      const put=s=>{ if(_mine()) return; WATCH[s.key]=s.val()||{}; _schedule(); };
      q.on('child_added',put); q.on('child_changed',put);
      q.on('child_removed',s=>{ if(_mine()) return; delete WATCH[s.key]; _schedule(); });
    }catch(e){ console.warn('[BOND] live watch',e); }
    try{
      /* chỉ mục kho lưu trữ: máy khác lưu trữ hay xoá tháng thì con số trên
         nút 🗄 đổi theo ngay, không phải F5 */
      R.ref(FB_AIDX).on('value',s=>{ if(_mine()) return; AIDX=s.val()||{}; _schedule(); });
    }catch(e){ console.warn('[BOND] live arch idx',e); }
  }
  let _renT=null;
  function _schedule(){
    if(_renT) return;
    _renT=setTimeout(()=>{ _renT=null; if(_mode==='knq') render(); },200);
  }

  /* ============================================================
     ẢNH CHỤP SAP CỦA KỲ ĐANG XEM
     ------------------------------------------------------------
     Lấy dòng SLoc 1100 tại NGÀY MỚI NHẤT ≤ min(D-1, ngày cuối kỳ).
     • Kỳ đang mở  → mốc là D-1.
     • Kỳ đã qua   → mốc là ngày cuối tháng đó (số chốt của kỳ ấy).
     Chưa có số của mốc mong muốn ⇒ lùi về ngày mới nhất đang có và bật cờ
     _sapBehind để dải cảnh báo nói rõ "đang tạm tính bằng ngày …".
  ============================================================ */
  function _wantDay(){
    const M=_month||_ym(_asOf());
    const M9=_lastDay(M), A=_asOf();
    return (M9<A)?M9:A;
  }
  function _pickSapDay(){
    _sapDay=''; _sapBehind=false; _prevDay=''; _prevSet=null;
    if(typeof SP==='undefined' || !SP.dates1100) return '';
    let ds=[];
    try{ ds=SP.dates1100()||[]; }catch(_){ return ''; }
    if(!ds.length) return '';
    const want=_wantDay();
    const ok=ds.filter(d=>d<=want);
    if(ok.length){ _sapDay=ok[ok.length-1]; _sapBehind=(_sapDay<want); }
    else { _sapDay=ds[0]; _sapBehind=true; }   /* chỉ có số SAU mốc — vẫn hiện */
    /* ngày SAP liền trước _sapDay (thường là D-2) — mốc để nhận ra lô mới */
    const before=ds.filter(d=>d<_sapDay);
    _prevDay=before.length?before[before.length-1]:'';
    if(_prevDay){
      _prevSet={};
      try{
        (SP.batch1100(_prevDay,_prevDay).rows||[]).forEach(r=>{
          _prevSet[_key(r.mat,String(r.batch||'').toUpperCase())]=1;
        });
      }catch(_){ _prevSet=null; }
    }
    return _sapDay;
  }
  function _sapRows(){
    if(!_sapDay) return [];
    let res=null;
    try{ res=SP.batch1100(_sapDay,_sapDay); }catch(_){ return []; }
    return (res&&res.rows)?res.rows:[];
  }

  /* ============================================================
     FEED OL1 — LƯỢNG DÙNG MỘT NGÀY
     Người dùng gõ TỔNG P+X và X. P = TỔNG − X. Ngày chưa gõ TỔNG thì chạy
     mức tạm tính DEF_TOT_KG và ĐƯỢC ĐẾM RIÊNG để cảnh báo.
  ============================================================ */
  function _totOf(u){
    if(!u) return null;
    const t=_num(u.t); if(t!=null) return t;
    const p=_num(u.p);                       /* schema cũ {p,x} rời */
    if(p!=null){ const x=_num(u.x); return p+(x==null?0:x); }
    return null;
  }
  function _xOf(u){ const x=_num(u&&u.x); return x==null?0:x; }
  function _useOf(d,L){
    const u=USE[d]; if(!u) return 0;             /* không có dòng = không trừ */
    const t=_totOf(u), tot=(t==null)?DEF_TOT_KG:t, x=_xOf(u);
    return (L==='X') ? x : Math.max(0,tot-x);
  }
  /* ⭐ NGÀY TƯƠNG LAI CÓ ĐƯỢC COI LÀ "CHƯA GÕ TỔNG" KHÔNG?
     Ngày ĐÃ QUA gõ 0 là số thật — nhà máy dừng. Ngày CHƯA TỚI mà đang là 0
     hay để trống thì chỉ có nghĩa "chưa điền", đem đi chiếu sẽ ra kết quả
     "không bao giờ hết hàng". Vì vậy ngày tương lai: trống HOẶC 0 ⇒ chạy
     mức tạm tính DEF_TOT_KG. */
  function _totProj(u){
    const t=_totOf(u);
    return (t==null || t===0) ? DEF_TOT_KG : t;
  }
  /* X có hiệu lực khi CHIẾU: ô X đã gõ → plan X trong file (xp) → bình quân */
  function _xProj(u,avg){
    const x=_num(u&&u.x); if(x!=null && x!==0) return x;
    const xp=_num(u&&u.xp); if(xp!=null) return xp;
    if(x===0) return 0;
    return avg||0;
  }
  /* lượng dùng của MỘT NGÀY TƯƠNG LAI — chỉ dùng cho lượt chiếu, KHÔNG bao
     giờ đụng vào cột Thực còn. */
  function _useProj(d,L,avgX,avgP){
    const u=USE[d];
    if(!u) return (L==='X') ? (avgX||0) : (avgP||0);   /* ngày không có dòng */
    const tot=_totProj(u), x=_xProj(u,avgX);
    return (L==='X') ? x : Math.max(0,tot-x);
  }
  /* bình quân AVG_DAYS ngày gần nhất CÓ SỐ (kg/ngày) — chỗ dựa cuối cùng */
  function _avgRate(L){
    const A=_asOf(), v=[];
    Object.keys(USE).filter(d=>d<=A).sort().forEach(d=>{
      const u=USE[d]||{};
      if(L==='X'){ const x=_num(u.x); if(x!=null) v.push(x); }
      else { const t=_totOf(u); if(t!=null) v.push(Math.max(0,t-_xOf(u))); }
    });
    const last=v.slice(-AVG_DAYS);
    return last.length ? last.reduce((a,b)=>a+b,0)/last.length : 0;
  }
  function _ol1Sum(){
    const M=_month||_ym(_asOf());
    const from=M+'-01', to=(_sapDay||_wantDay());
    const o={ t:0,x:0,p:0,n:0,def:0,miss:[],plan:[] };
    for(let d=from; d && d<=to; d=_addDays(d,1)){
      const u=USE[d];
      if(!u){ o.miss.push(d); continue; }
      const raw=_totOf(u), dfl=(raw==null), tot=dfl?DEF_TOT_KG:raw, x=_xOf(u);
      o.n++; if(dfl) o.def++;
      /* ⭐ ngày ĐÃ QUA mà ô X vẫn mang cờ PLAN ⇒ chưa import số thực hiện.
         Trừ lùi vẫn chạy trên số đó, nên phải nói ra chứ không để im. */
      if(String(u.xs||'')==='p' && _num(u.x)!=null) o.plan.push(d);
      o.t+=tot; o.x+=x; o.p+=Math.max(0,tot-x);
    }
    return o;
  }

  /* ============================================================
     ⭐ THỨ TỰ RÚT HÀNG THẬT — "GET IN DATE" ĐI TRƯỚC MÃ BATCH
     ------------------------------------------------------------
     Mã batch (260818X001, 260818X002…) do nhân viên tự đặt, và ĐÃ TỪNG
     ĐẶT NGƯỢC: tàu GLOBE POLARIS vào SAU lại mang số 001, tàu MAPLE GAS
     vào TRƯỚC mang 002. Nếu cứ trừ lùi FIFO theo mã thì phần mềm bơm lô
     vào sau ra trước — sai nguyên tắc vào trước ra trước của kho ngoại quan.
     Vì thế mỗi lô có thêm ô NGÀY GET IN (ngày tàu bơm hàng vào kho, người
     dùng gõ, lưu ở knq_info/<key>/gIn).

     Luật (đúng như người dùng chốt) — CHỈ xét trong cùng một NHÓM
     "cùng Mat · cùng chữ lô · CÙNG NGÀY trong mã batch":
       · cả nhóm đều đã khai Get in date ⇒ xếp theo NGÀY GET IN,
         ngày bằng nhau thì mới theo mã batch. Nếu thứ tự này KHÁC thứ tự
         mã batch ⇒ đánh dấu seq='swap' cho CẢ NHÓM để báo cho nhân viên.
       · còn lô nào chưa khai ⇒ KHÔNG đảo gì hết, giữ nguyên thứ tự mã
         batch (đoán mò trên dữ liệu thiếu còn tệ hơn), và đánh seq='ask'
         để dải cảnh báo nhắc điền nốt.
     Nhóm chỉ có MỘT lô thì không có gì phải so.
     ⚠ Trường ord này là NGUỒN DUY NHẤT của thứ tự: cả hàng đợi FIFO ở
     bước ④ lẫn thứ tự hiển thị ở bước ⑥ đều đọc qua _ordCmp, đừng để hai
     nơi xếp khác nhau — số thứ tự trên bảng chính là thứ tự bơm.
  ============================================================ */
  function _isDate(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')); }
  function _applyOrder(rows){
    const G={};
    rows.forEach(r=>{
      r.ord=0; r.seq=''; r.seqGrp=(r.mat||'')+'|'+(r.letter||'')+'|'+(r.bdate||'');
      (G[r.seqGrp]=G[r.seqGrp]||[]).push(r);
    });
    Object.keys(G).forEach(k=>{
      const g=G[k];
      if(g.length<2){ return; }
      const byCode=g.slice().sort((a,b)=>a.bcode<b.bcode?-1:(a.bcode>b.bcode?1:0));
      if(!g.every(r=>_isDate(r.gIn))){
        /* thiếu ngày ⇒ giữ nguyên thứ tự mã, chỉ nhắc khai */
        byCode.forEach((r,i)=>{ r.ord=i; r.seq='ask'; });
        return;
      }
      const byIn=g.slice().sort((a,b)=>{
        if(a.gIn!==b.gIn) return a.gIn<b.gIn?-1:1;
        return a.bcode<b.bcode?-1:(a.bcode>b.bcode?1:0);
      });
      byIn.forEach((r,i)=>{ r.ord=i; });
      const swapped=byIn.some((r,i)=>r!==byCode[i]);
      if(swapped) g.forEach(r=>{ r.seq='swap'; });
    });
    return rows;
  }
  /* so sánh DÙNG CHUNG cho hàng đợi FIFO và thứ tự hiển thị */
  function _ordCmp(a,b){
    const da=a.bdate||'9999-12-31', db=b.bdate||'9999-12-31';
    if(da!==db) return da<db?-1:1;
    const oa=(a.ord==null?0:a.ord), ob=(b.ord==null?0:b.ord);
    if(oa!==ob) return oa-ob;
    return a.bcode<b.bcode?-1:(a.bcode>b.bcode?1:0);
  }

  /* ============================================================
     ⭐ TÍNH — trái tim của module
  ============================================================ */
  function recalc(){
    /* kỳ đã lưu đang mở thì trả thẳng ảnh chụp, KHÔNG tính lại — nhưng vẫn
       cho lọc, vì bảng cũ cũng dài như bảng sống. */
    if(_arch){ _all=_arch.rows.slice(); _rows=_all.filter(_match); return _rows; }

    _pickSapDay();
    const M=_month||_ym(_asOf());
    const sap=_sapRows();
    /* v4.118 — ghi sổ theo dõi TRƯỚC khi dựng dòng: lô đang thấy hôm nay
       phải được nhớ lại, để hôm nào nó rơi khỏi SAP thì bảng còn dựng lại
       được dòng cho nó dù chưa ai gõ một chữ nào. */
    _syncWatch(sap);
    const seen={};
    const rows=[];

    /* ── ① dòng có trong SAP ─────────────────────────────── */
    sap.forEach(r=>{
      const bcode=String(r.batch||'').toUpperCase();
      if(!bcode) return;
      const k=_key(r.mat,bcode);
      seen[k]=1;
      const inf=INFO[k]||{};
      rows.push({
        key:k, mat:r.mat, bcode:bcode, letter:_letterOf(bcode),
        bdate:_batchDate(bcode),
        /* khối SAP — nguyên văn, chỉ đọc */
        date:_sapDay, sloc:'1100',
        init:r.init, gr:r.gr, gi:r.gi, trs:r.trs, end:r.end,
        /* khối người dùng */
        vno:inf.vno||'', vessel:inf.vessel||'', dIn:inf.dIn||'', gIn:inf.gIn||'',
        dOut:inf.dOut||'',
        hqQty:(inf.hqQty==null?'':inf.hqQty), vas:!!inf.vas, vasDate:inf.vasDate||'',
        note:inf.note||'',
        /* tính ra */
        ord:0, seq:'', seqGrp:'',
        left:null, used:null, pct:0, flag:'', st:'', pumping:false, pumpWhy:'', isNew:false,
        noInfo:false, low:false, eta:'', etaDays:null, projected:false,
        inSap:true, hasInfo:_hasInfo(inf),
        /* v4.118 */
        lastSeen:_sapDay, pin:false, archDue:'', archDays:null
      });
    });

    /* ── ② LÔ KHÔNG CÒN TRONG SAP — VẪN PHẢI HIỆN ───────────
       Hai nguồn, gộp lại:
         · `INFO`  — lô đã khai thông tin (như trước v4.118)
         · `WATCH` — ⭐ MỚI: lô TỪNG thấy trong SAP, kể cả khi CHƯA AI GÕ
           một chữ nào. Đây chính là ca vận hành nêu: mã có ở SAP mấy ngày
           đầu, ngày sau không còn, chưa get out trên VAS ⇒ trước đây lặng
           lẽ biến mất, giờ vẫn đứng đó.
       Số hiển thị lấy từ sổ (End của ngày thấy lần cuối) — nói rõ là số
       CŨ, không phải số của hôm nay. */
    const ghost={};
    Object.keys(INFO).forEach(k=>{ if(!seen[k] && _hasInfo(INFO[k])) ghost[k]=1; });
    Object.keys(WATCH).forEach(k=>{ if(!seen[k] && WATCH[k] && WATCH[k].bcode) ghost[k]=1; });
    Object.keys(ghost).forEach(k=>{
      const inf=INFO[k]||{}, w=WATCH[k]||{};
      const i=k.indexOf('_'); if(i<0) return;
      const mat=w.mat||k.slice(0,i), bcode=w.bcode||k.slice(i+1);
      rows.push({
        key:k, mat:mat, bcode:bcode, letter:_letterOf(bcode), bdate:_batchDate(bcode),
        date:'', sloc:'1100', init:null, gr:null, gi:null, trs:null,
        end:(w.end==null?null:_n(w.end)),
        vno:inf.vno||'', vessel:inf.vessel||'', dIn:inf.dIn||'', gIn:inf.gIn||'',
        dOut:inf.dOut||'',
        hqQty:(inf.hqQty==null?'':inf.hqQty), vas:!!inf.vas, vasDate:inf.vasDate||'',
        note:inf.note||'',
        ord:0, seq:'', seqGrp:'',
        left:null, used:null, pct:0, flag:'gone', st:'gone', pumping:false, pumpWhy:'',
        isNew:false, noInfo:false, low:false, eta:'', etaDays:null, projected:false,
        inSap:false, hasInfo:_hasInfo(inf),
        lastSeen:w.last||'', watched:!!w.bcode, pin:false, archDue:'', archDays:null
      });
    });

    /* ── ②b THỨ TỰ RÚT HÀNG THẬT — phải chạy TRƯỚC mọi phép trừ lùi ─ */
    _applyOrder(rows);

    /* ── ③ D/E lấy thẳng End Stock ───────────────────────── */
    rows.forEach(r=>{
      if(_isPX(r.letter) || !r.inSap) return;
      r.left=r.end; r.used=null;
    });

    /* ── ④ P/X trừ lùi FIFO theo FEED OL1 của kỳ ─────────
       Điểm xuất phát = End Stock của SAP tại _sapDay. Hợp lệ vì SAP KHÔNG
       động vào lô P/X suốt cả tháng — con số đó chính là tồn đầu kỳ.
       Mỗi lô chỉ được rút TỪ NGÀY TRONG MÃ BATCH trở đi. */
    const from=M+'-01', to=(_sapDay||_wantDay());
    /* bình quân tính MỘT LẦN cho cả vòng lặp — chỗ dựa cuối cùng khi ngày
       tương lai không có cả TỔNG lẫn plan X */
    const AVG={ P:_avgRate('P'), X:_avgRate('X') };
    MATS.forEach(mat=>{
      ['P','X'].forEach(L=>{
        const q=rows.filter(r=>r.inSap && r.mat===mat && r.letter===L).sort(_ordCmp);
        if(!q.length) return;
        q.forEach(r=>{ r.left=_n(r.end); r._open=_n(r.end); });
        let short=0, shortDay='';
        for(let d=from; d && d<=to; d=_addDays(d,1)){
          let need=_useOf(d,L);
          if(!(need>0)) continue;
          for(let i=0;i<q.length && need>1e-6;i++){
            const r=q[i];
            if(r.bdate && r.bdate>d) continue;      /* lô chưa tới ngày dùng */
            if(r.left<=0) continue;
            const take=Math.min(r.left,need);
            r.left-=take; need-=take;
            if(r.left<=0.5 && !r.zeroDate) r.zeroDate=d;
          }
          if(need>0.5){ short+=need; if(!shortDay) shortDay=d; }
        }
        if(short>0.5 && q.length){
          q[q.length-1].warn='FEED OL1 draws '+_K(short)+' kg more than the stock holds (from '+_dmy(shortDay)+')';
        }
        q.forEach(r=>{ r.left=Math.max(0,r.left); r.used=Math.max(0,r._open-r.left); });
        /* ⭐ LÔ ĐANG BƠM của P/X = phần tử ĐẦU hàng đợi FIFO còn hàng và đã
           tới ngày được dùng. Mỗi (Mat × loại lô) chỉ có ĐÚNG MỘT. Xét tới
           HÔM NAY chứ không phải D-1: lô đã tới ngày thì hôm nay đang chảy. */
        const T=_today();
        const head=q.find(r=>r.left>0.5 && (!r.bdate || r.bdate<=T));
        if(head){ head.pumping=true; head.pumpWhy='fifo'; }

        /* ═══ LƯỢT 2 · CHIẾU TỚI TƯƠNG LAI ⇒ DỰ KIẾN NGÀY HẾT ═══════
           Chạy lại từ đầu kỳ trên MỘT BỘ SỐ RIÊNG — tuyệt đối KHÔNG ghi
           vào r.left, vì Thực còn phải là số thật của D-1.
             · ngày ≤ mốc SAP  → số THẬT (y hệt lượt 1)
             · ngày sau đó     → CHIẾU: TỔNG lấy plan, trống/0 thì 2.000 T;
                                 X lấy plan trong file, thiếu nữa thì bình quân
           Đây chính là thứ cho ra cột "Dự kiến hết" của lô P/X. */
        const p2=q.map(r=>({ r:r, left:_n(r.end), z:'' }));
        const stop=_addDays(T,HORIZON);
        for(let d=from; d && d<=stop; d=_addDays(d,1)){
          const fut=(d>to);
          let need=fut ? _useProj(d,L,AVG.X,AVG.P) : _useOf(d,L);
          if(!(need>0)) continue;
          for(let i=0;i<p2.length && need>1e-6;i++){
            const it=p2[i];
            if(it.r.bdate && it.r.bdate>d) continue;
            if(it.left<=0) continue;
            const take=Math.min(it.left,need);
            it.left-=take; need-=take;
            if(it.left<=0.5 && !it.z) it.z=d;
          }
          if(fut && p2.every(it=>it.left<=0.5)) break;
        }
        p2.forEach(it=>{
          const r=it.r;
          if(r.zeroDate){ r.eta=r.zeroDate; r.projected=false; }   /* đã hết thật */
          else if(it.z){ r.eta=it.z; r.projected=(it.z>to); }
          if(r.eta) r.etaDays=_dayDiff(r.eta,T);
        });
      });
    });

    /* ── ⑤ TRẠNG THÁI TỪNG LÔ ────────────────────────────────
       Ba sự thật ĐỘC LẬP, đừng gộp làm một:
         · st      — lô đang ở đâu trong vòng đời (một giá trị duy nhất)
         · isNew   — vừa nhập kho trong lần cập nhật này
         · noInfo  — chưa khai tàu / tờ khai
       ĐANG BƠM nhận diện khác nhau theo loại lô:
         · D/E — SAP cập nhật hằng ngày ⇒ cột GI hoặc Trs ÂM là đang rút ra.
                 Đây là bằng chứng trực tiếp, không phải suy đoán.
         · P/X — SAP đứng yên cả tháng ⇒ phải suy từ hàng đợi FIFO (đã đánh
                 dấu ở bước ④): đầu hàng còn hàng và đã tới ngày dùng.
       HẾT HÀNG tách làm hai, vì hai việc phải làm khác nhau:
         · emptied — về 0 mà CHƯA tích VASSCM ⇒ còn việc phải làm, tô nổi
         · zero    — về 0 và đã VASSCM (hoặc chưa từng có hàng) ⇒ làm mờ đi
    */
    rows.forEach(r=>{
      const base=(r._open!=null)?r._open:_n(r.end);
      r.pct=(base>0 && r.used!=null)?Math.min(1,r.used/base):0;
      r.noInfo=!r.hasInfo;
      r.low=false;

      /* LÔ MỚI — chưa có ở ảnh chụp SAP ngày liền trước, hoặc GR dương */
      r.isNew = r.inSap && (_n(r.gr)>0 ||
        (!!_prevSet && !_prevSet[r.key]));

      /* ĐANG BƠM — D/E đọc thẳng từ chuyển động SAP của chính ngày đó */
      if(r.inSap && !_isPX(r.letter) && (_n(r.gi)<0 || _n(r.trs)<0)){
        r.pumping=true; r.pumpWhy='sap';
      }

      /* ⭐ D/E · DẤU HIỆU THỨ HAI — END STOCK ĐÃ TỤT DƯỚI LƯỢNG HẢI QUAN DUYỆT
         Cột GI/Trs âm chỉ bắt được đúng NGÀY SAP ghi bút toán rút hàng. Lô
         bơm nhiều ngày thì những ngày giữa GI/Trs bằng 0, nhìn vào tưởng lô
         còn nguyên chưa ai đụng. Nhưng HQ approved là lượng hải quan duyệt
         cho cả lô — đứng yên suốt vòng đời lô — nên hễ End Stock < HQ
         approved là ĐÃ CÓ HÀNG RA KHỎI LÔ, tức lô đang chảy dở.
         ⚠ Ô HQ approved TRỐNG (hoặc 0) thì BỎ QUA luật này, giữ nguyên cách
         nhận diện cũ: người dùng chưa khai thì không có gì để mà so, đoán
         bừa sẽ báo đang bơm cho cả những lô còn nguyên.
         ⚠ So theo KG đúng như số đang lưu, KHÔNG tự quy đổi tấn — cột HQ
         approved của tab KNQ cũ từng bị gõ theo tấn (4750 trong khi SAP ghi
         4.750.000), tự nhân chia ở đây là che mất chỗ nhập sai đó.
         Chừa dung sai 0,5 kg cho sai số làm tròn: End = HQ thì lô còn nguyên.
         ⚠ End = 0 thì KHÔNG đem đi so: bơm xong rồi, 0 < HQ approved là chuyện
         đương nhiên. Việc còn lại của lô là VASSCM, không phải "đang bơm". */
      if(r.inSap && !_isPX(r.letter) && !r.pumping && _n(r.end)>0.5){
        const hq=_num(r.hqQty);
        if(hq!=null && hq>0.5 && _n(r.end) < hq-0.5){ r.pumping=true; r.pumpWhy='hq'; }
      }

      /* đã TỪNG có hàng chưa? lô luôn bằng 0 thì không phải "vừa hết" */
      const everHad = _n(r.init)>0 || _n(r.gr)>0 || _n(r.used)>0 || base>0;

      /* ⭐ v4.118 — LÔ RỜI SAP TÁCH LÀM HAI, VÌ HAI VIỆC KHÁC HẲN NHAU:
           · chưa tích VASSCM ⇒ 'gone'      — CÒN VIỆC PHẢI LÀM, ghim lên
             đầu bảng, tô đỏ, không có cách nào tự biến mất
           · đã tích VASSCM  ⇒ 'archiving'  — xong việc, đứng lại vài ngày
             cho chắc rồi phần mềm tự dời sang kho lưu trữ */
      if(!r.inSap)                       r.st=r.vas ? 'archiving' : 'gone';
      else if(!(_n(r.left)>0.5))         r.st=(everHad && !r.vas) ? 'emptied' : 'zero';
      else if(r.pumping)                 r.st='pumping';
      else if(!(_n(r.used)>0.5))         r.st='wait';
      else                               r.st='pumping';
      /* ⭐ GHIM LÊN ĐẦU BẢNG — đúng hai trường hợp, và đều là "lô đã hết
         hàng mà CHƯA get out trên VAS":
           gone    — SAP không còn mã này nữa
           emptied — SAP vẫn còn nhưng số về 0
         Ghim để nhân viên không phải cuộn đi tìm, và để lô không lẫn vào
         hàng chục dòng đang chạy bình thường. Tích VASSCM là dòng rời khối
         ghim ngay lập tức. */
      r.pin=(r.st==='gone' || r.st==='emptied');
      r.archDue=_archDueOf(r);
      r.archDays=r.archDue?_dayDiff(r.archDue,_today()):null;
      if(r.st==='pumping' && _n(r.left)<LOW_KG) r.low=true;
      /* sắp hết theo DỰ KIẾN — cảnh báo sớm hơn nhiều so với chỉ nhìn tồn */
      r.soon=(r.st==='pumping'||r.st==='wait') && r.projected &&
             r.etaDays!=null && r.etaDays<=WARN_DAYS;

      /* giữ r.flag cho tương thích ngược (dải cảnh báo, thẻ, ảnh chụp kỳ) */
      r.flag = (r.st==='gone')  ? 'gone'
             : (r.st==='emptied')? 'emptied'
             : (r.st==='archiving')? 'zero'
             : (r.st==='zero')  ? 'zero'
             : r.noInfo         ? 'new'
             : r.low            ? 'low' : '';
      delete r._open;
    });

    /* ── ⑥ SẮP XẾP (chốt của người dùng) ─────────────────────
       C3 trước C4 · trong Mat thì D → E → P → X · trong loại lô thì
       CŨ TRÊN, MỚI DƯỚI — đúng thứ tự vào trước dùng trước, nhìn từ trên
       xuống là đọc được luôn trình tự rút hàng. */
    const LOT_ORD={ D:0, E:1, P:2, X:3 };
    const MAT_ORD={ C3:0, C4:1 };
    rows.sort((a,b)=>{
      /* ⭐ v4.118 — KHỐI GHIM ĐI TRƯỚC TẤT CẢ. Trong khối ghim vẫn xếp
         đúng quy tắc cũ, nên đọc vẫn quen mắt. Số thứ tự No. của dòng ghim
         được thay bằng 🚩 (xem _sttFmt) để không ai tưởng đó là thứ tự bơm. */
      const pn=(a.pin?0:1)-(b.pin?0:1); if(pn) return pn;
      const m=(MAT_ORD[a.mat]==null?9:MAT_ORD[a.mat])-(MAT_ORD[b.mat]==null?9:MAT_ORD[b.mat]);
      if(m) return m;
      const l=(LOT_ORD[a.letter]==null?9:LOT_ORD[a.letter])-(LOT_ORD[b.letter]==null?9:LOT_ORD[b.letter]);
      if(l) return l;
      return _ordCmp(a,b);
    });
    _all=rows;
    _rows=rows.filter(_match);
    return _rows;
  }

  /* ── THANH LỌC ──────────────────────────────────────────────── */
  function _match(r){
    if(_fMat && r.mat!==_fMat) return false;
    if(_fLot && r.letter!==_fLot) return false;
    if(_fSt){
      if(_fSt==='new'){ if(!r.isNew) return false; }
      else if(_fSt==='noinfo'){ if(!r.noInfo) return false; }
      else if(r.st!==_fSt) return false;
    }
    if(_fq){
      const hay=[r.bcode,r.vessel,r.vno,r.dIn,r.gIn,r.dOut,r.note,r.mat,r.letter]
        .join(' ').toLowerCase();
      if(hay.indexOf(_fq)<0) return false;
    }
    return true;
  }
  function onFilter(){
    _fq  =String((_el('bondFq')||{}).value||'').trim().toLowerCase();
    _fMat=String((_el('bondFMat')||{}).value||'');
    _fLot=String((_el('bondFLot')||{}).value||'');
    _fSt =String((_el('bondFSt')||{}).value||'');
    render();
  }
  function clearFilter(){
    _fq=_fMat=_fLot=_fSt='';
    ['bondFq','bondFMat','bondFLot','bondFSt'].forEach(id=>{ const e=_el(id); if(e) e.value=''; });
    render();
  }
  function filterOn(){ return !!(_fq||_fMat||_fLot||_fSt); }
  function _hasInfo(inf){
    if(!inf) return false;
    return INFO_FIELDS.some(f=>{
      const v=inf[f];
      return !(v===''||v==null||v===false);
    });
  }

  /* ============================================================
     GHI THÔNG TIN NGƯỜI DÙNG — một ô một lần
  ============================================================ */
  function setInfo(key,field,val){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    if(INFO_FIELDS.indexOf(field)<0) return;
    if(_arch){ _say('📜 Viewing a saved period — read-only','warn'); return; }
    let v=val;
    if(field==='hqQty'){ const n=_num(val); v=(n==null?'':Math.round(n)); }
    else if(field==='vas'){ v=!!val; }
    else v=String(val==null?'':val).trim();
    INFO[key]=INFO[key]||{};
    INFO[key][field]=v;
    /* tick VASSCM lần đầu tự điền ngày hôm nay */
    const pay={};
    pay[FB_INFO+'/'+key+'/'+field]=v;
    if(field==='vas'){
      const dt=v?(INFO[key].vasDate||_today()):'';
      INFO[key].vasDate=dt; pay[FB_INFO+'/'+key+'/vasDate']=dt;
    }
    pay[FB_INFO+'/'+key+'/lastBy']=_who();
    pay[FB_INFO+'/'+key+'/lastAt']=Date.now();
    _push(pay,'saved '+_stamp().slice(11));
    render();
  }
  /* xoá hẳn một lô khỏi bảng: bỏ bản ghi thông tin.
     ⚠ KHÔNG đụng gì tới SAP — nếu mã batch vẫn còn trong ZMMFR022 thì dòng
     sẽ hiện lại ngay ở dạng "chưa khai thông tin". Đúng như vậy: SAP mới là
     nơi quyết định lô còn hay hết. */
  function delRow(key){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const r=_rows.find(x=>x.key===key); if(!r) return;
    const still=r.inSap && _n(r.end)>0.5;
    /* ⭐ v4.118 — LÔ ĐANG NẰM TRONG SỔ THEO DÕI THÌ XOÁ KHÔNG LÀM NÓ BIẾN
       MẤT, và phải nói thẳng ra như vậy. Sổ theo dõi tồn tại chính là để
       một lô đã rời SAP mà chưa get out trên VAS không thể lặng lẽ trôi đi. */
    const watched=!!(WATCH[key] && WATCH[key].bcode);
    if(!confirm('DELETE ROW '+r.bcode+' ('+r.mat+')\n\n'+
      (still
        ? '⚠ This batch code STILL HOLDS '+_K(r.end)+' kg in the SAP data of '+_dmy(r.date)+'.\n'+
          'Deleting here only removes what you typed (vessel, declarations, VASSCM…).\n'+
          'The row comes straight back, flagged "no details yet".\n\n'
        : watched
        ? '⚠ This batch was seen in SAP up to '+_dmy(r.lastSeen||'')+', so it is on the watch list.\n'+
          'Deleting removes only what you typed — the row comes straight back, still pinned at the top,\n'+
          'because VASSCM has not been ticked for it.\n\n'
        : 'This batch code holds no stock in SAP — deleting drops the row for good.\n\n')+
      'Continue?')) return;
    delete INFO[key];
    const pay={}; pay[FB_INFO+'/'+key]=null;
    /* Đường thoát DUY NHẤT cho một mã batch gõ sai / SAP đã sửa lại: hỏi
       riêng một lần nữa, nói rõ hậu quả, rồi mới bỏ khỏi sổ theo dõi. */
    if(watched && !r.inSap &&
       confirm('STOP WATCHING '+r.bcode+' ('+r.mat+') AS WELL?\n\n'+
         'OK    = the batch code is dropped from the watch list too. The row disappears for good and\n'+
         '        no VASSCM reminder will ever be raised for it again. Use this only when the code was\n'+
         '        mistyped in SAP, or the batch was corrected to another code.\n'+
         'Cancel = keep watching it. The row comes back, pinned at the top, until VASSCM is ticked.')){
      delete WATCH[key];
      pay[FB_WATCH+'/'+key]=null;
    }
    _push(pay,'deleted '+r.bcode);
    render();
  }

  /* ============================================================
     💾 LƯU KỲ  —  ẢNH CHỤP CẢ BẢNG
     ------------------------------------------------------------
     KHÔNG phải "đóng kỳ" như bản cũ: không khoá gì, không đổi gì, không
     chặn gì. Chỉ chụp lại đúng những gì đang hiện — số SAP, số trừ lùi,
     thông tin người dùng, tổng FEED OL1 — để sau này gọi về xem lại mà
     không phụ thuộc SAP còn giữ dữ liệu ngày đó hay không.
     Bấm lại là ĐÈ LÊN ảnh cũ của cùng kỳ.
  ============================================================ */
  function savePeriod(){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    if(_arch){ _say('📜 Viewing a saved period — press ✕ to go back to live figures first','warn'); return; }
    const M=_month||_ym(_asOf());
    recalc();
    const rows=_all;                      /* ⚠ chụp TOÀN BỘ, không phải phần đang lọc */
    if(!rows.length){ _say('⚠ The table is empty — nothing to save','warn'); return; }
    const had=PERIODS[M];
    const o=_ol1Sum();
    if(!confirm('💾 SAVE PERIOD '+M+'\n\n'+
      rows.length+' batch(es) · SAP figures of '+_dmy(_sapDay)+'\n'+
      'FEED OL1 used: TOTAL '+_T(o.t)+' T · X '+_T(o.x)+' T · P '+_T(o.p)+' T\n'+
      (o.def?('⚠ '+o.def+' day(s) running on the assumed '+_T(DEF_TOT_KG)+' T\n'):'')+
      (o.miss.length?('⚠ '+o.miss.length+' day(s) have no FEED OL1 row\n'):'')+
      '\n'+(had?('⚠ This period already has a snapshot saved '+had.savedAt+' — it will be OVERWRITTEN.\n\n'):'')+
      'Save it so you can call it back later?')) return;
    const snap={};
    rows.forEach(r=>{
      snap[r.key]={ mat:r.mat, bcode:r.bcode, letter:r.letter||'', date:r.date||'',
        init:_n(r.init), gr:_n(r.gr), gi:_n(r.gi), trs:_n(r.trs), end:_n(r.end),
        vno:r.vno||'', vessel:r.vessel||'', dIn:r.dIn||'', gIn:r.gIn||'', dOut:r.dOut||'',
        hqQty:_n(r.hqQty), vas:!!r.vas, vasDate:r.vasDate||'', note:r.note||'',
        ord:(r.ord==null?0:r.ord), seq:r.seq||'', seqGrp:r.seqGrp||'',
        left:_n(r.left), used:_n(r.used), flag:r.flag||'', st:r.st||'',
        eta:r.eta||'', etaDays:(r.etaDays==null?'':r.etaDays), projected:!!r.projected,
        isNew:!!r.isNew, noInfo:!!r.noInfo, low:!!r.low, pumping:!!r.pumping,
        pumpWhy:r.pumpWhy||'' };
    });
    const rec={ savedAt:_stamp(), savedBy:_who(), sapDate:_sapDay||'',
                ol1:{ t:Math.round(o.t), x:Math.round(o.x), p:Math.round(o.p),
                      n:o.n, def:o.def, miss:o.miss.length },
                rows:snap };
    const pay={}; pay[FB_PER+'/'+M]=rec;
    _push(pay,'saved period '+M).then(ok=>{
      if(!ok) return;
      PERIODS[M]={ savedAt:rec.savedAt, savedBy:rec.savedBy, sapDate:rec.sapDate, n:rows.length };
      _fillPeriodSel();
      _say('💾 Period '+M+' saved — '+rows.length+' batch(es), SAP figures of '+_dmy(_sapDay),'ok');
      render();
    });
  }
  function openPeriod(M){
    M=M||(_el('bondPerSel')||{}).value;
    if(!M){ _say('Pick the period you want to open','warn'); return; }
    if(!PERIODS[M]){ _say('⚠ Period '+M+' has no snapshot yet','warn'); return; }
    _say('📜 Opening period '+M+'…','');
    _ref().ref(FB_PER+'/'+M).once('value').then(s=>{
      const v=s.val();
      if(!v){ _say('❌ Could not read period '+M,'er'); return; }
      const rows=Object.keys(v.rows||{}).map(k=>{
        const r=v.rows[k];
        return Object.assign({ key:k, sloc:'1100', inSap:true, hasInfo:true,
          bdate:_batchDate(r.bcode), pct:(_n(r.end)>0?Math.min(1,_n(r.used)/_n(r.end)):0) }, r);
      }).sort((a,b)=>{
        const ka=a.mat+(a.bdate||'9999')+a.bcode, kb=b.mat+(b.bdate||'9999')+b.bcode;
        return ka<kb?-1:(ka>kb?1:0);
      });
      _arch={ M:M, rows:rows, meta:v };
      _archM=M;
      render();
      _say('📜 Period '+M+' — snapshot taken '+(v.savedAt||'?')+(v.savedBy?(' by '+v.savedBy):'')+
           ' · SAP figures of '+_dmy(v.sapDate||''),'ok');
    }).catch(e=>{ console.warn('[BOND] openPeriod',e); _say('❌ Could not read that period','er'); });
  }
  function closePeriod(){ _arch=null; _archM=''; render(); }
  function delPeriod(){
    const M=(_el('bondPerSel')||{}).value;
    if(!M||!PERIODS[M]){ _say('Pick the saved period you want to delete','warn'); return; }
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const p=PERIODS[M];
    if(!confirm('🗑 DELETE THE SNAPSHOT OF '+M+'\n\n'+
      'Saved '+(p.savedAt||'?')+(p.savedBy?(' by '+p.savedBy):'')+' · '+(p.n||0)+' batch(es).\n\n'+
      'Deleting keeps Firebase small. SAP data and the batch details are NOT touched —\n'+
      'only this period\'s snapshot is lost.\n\nDelete?')) return;
    const pay={}; pay[FB_PER+'/'+M]=null;
    _push(pay,'deleted period '+M).then(ok=>{
      if(!ok) return;
      delete PERIODS[M];
      if(_archM===M) closePeriod();
      _fillPeriodSel();
      _say('🗑 Snapshot of '+M+' deleted','ok');
    });
  }


  /* ============================================================
     v4.118 — SỔ THEO DÕI LÔ + KHO LƯU TRỮ
     ------------------------------------------------------------
     BÀI TOÁN (vận hành nêu): một mã batch có trong SAP mấy ngày đầu rồi
     những ngày sau KHÔNG còn — hoặc về 0 — mà nhân viên CHƯA get out trên
     VAS. Bảng cũ đọc SAP của ĐÚNG MỘT NGÀY nên lô đó lặng lẽ biến mất khỏi
     màn hình, không ai biết là còn sót một lượt VASSCM.

     CÁCH CHỮA — hai vế:
     ① SỔ THEO DÕI (`knq_watch`): mỗi mã batch từng thấy trong SAP được ghi
        lại kèm ngày thấy lần cuối + số End của ngày đó. Lô rơi khỏi SAP mà
        CHƯA tích VASSCM thì vẫn dựng dòng lên từ sổ này, GHIM LÊN ĐẦU
        bảng, tô màu cảnh báo, và KHÔNG có cách nào cho nó tự biến mất.
        Chỉ có một đường ra: tích VASSCM.
     ② KHO LƯU TRỮ (`knq_arch`): lô đã tích VASSCM VÀ đã rời SAP thì còn
        đứng lại ARCH_WAIT_DAYS ngày (dạng mờ, có đếm ngược) rồi được dời
        hẳn sang kho lưu trữ và biến khỏi bảng. Chờ vài ngày là cố ý: dán
        SAP thiếu một ngày, hay tích VASSCM nhầm, thì còn kịp nhận ra.

     ⚠ KHÔNG BAO GIỜ tự lưu trữ một lô CHƯA tích VASSCM — dù nó rời SAP đã
     lâu. Đó chính là thứ phải nhắc, không phải thứ để dọn đi.
  ============================================================ */

  /* Chỉ được ghi sổ / lưu trữ khi ĐANG ĐỨNG TRÊN MỐC SAP MỚI NHẤT.
     Xem kỳ cũ, hay SAP còn thiếu ngày, thì "không có trong SAP" là do dữ
     liệu chưa tới chứ không phải lô đã đi — ghi vào là hỏng sổ. */
  function _watchOk(){
    if(_arch || !_loaded || !_canWrite()) return false;
    if(typeof firebase==='undefined') return false;
    if(!_sapDay) return false;
    let ds=[]; try{ ds=(SP && SP.dates1100) ? (SP.dates1100()||[]) : []; }catch(_){ return false; }
    return !!ds.length && ds[ds.length-1]===_sapDay;
  }
  /* Ghi sổ những lô đang thấy trong SAP. Chỉ ghi khi CÓ THAY ĐỔI (ngày mới
     hoặc End đổi) — recalc chạy mỗi lần gõ một ô, ghi vô điều kiện là đẩy
     Firebase liên tục. */
  function _syncWatch(sap){
    if(!_watchOk()) return;
    const pay={};
    (sap||[]).forEach(r=>{
      const bcode=String(r.batch||'').toUpperCase(); if(!bcode) return;
      const k=_key(r.mat,bcode);
      const end=Math.round(_n(r.end));
      const w=WATCH[k];
      if(w && w.last===_sapDay && Math.round(_n(w.end))===end) return;
      const rec={ mat:String(r.mat||''), bcode:bcode,
                  first:(w&&w.first)?w.first:_sapDay, last:_sapDay,
                  end:end, at:Date.now(), by:_who() };
      WATCH[k]=rec; pay[FB_WATCH+'/'+k]=rec;
    });
    const n=Object.keys(pay).length;
    if(n) _push(pay,'watch '+n+' batch'+(n>1?'es':''));
  }

  /* Tháng gom của kho lưu trữ = THÁNG CỦA NGÀY VASSCM (chốt của người dùng:
     "gọi về tháng 8" = những lô đã get out trên VAS trong tháng 8). Thiếu
     ngày VASSCM thì lùi về tháng trong mã batch, cuối cùng mới lấy tháng
     hiện tại — luôn có chỗ đứng, không bao giờ rơi vào tháng rỗng. */
  function _archYm(r){
    return _ym(r.vasDate) || _ym(r.bdate) || _ym(_today());
  }
  /* Ngày lô ĐỦ ĐIỀU KIỆN dời sang kho lưu trữ, và còn mấy ngày nữa.
     Mốc đếm là NGÀY CUỐI CÙNG còn thấy trong SAP; chưa từng vào sổ thì lấy
     ngày VASSCM. Không có mốc nào ⇒ KHÔNG lưu trữ (không đoán). */
  function _archDueOf(r){
    if(r.inSap || !r.vas) return '';
    const base=r.lastSeen || r.vasDate || '';
    if(!base) return '';
    return _addDays(base, ARCH_WAIT_DAYS);
  }
  function _archPending(){ return _all.filter(r=>r.st==='archiving'); }
  function _archDue(){ const T=_today(); return _archPending().filter(r=>r.archDue && r.archDue<=T); }
  function _arcCount(ym){ const m=AIDX[ym]; return m?Object.keys(m).length:0; }
  function _arcMonths(){ return Object.keys(AIDX||{}).filter(k=>_arcCount(k)>0).sort().reverse(); }
  function _arcTotal(){ let n=0; _arcMonths().forEach(m=>{ n+=_arcCount(m); }); return n; }

  /* Ghi MỘT lượt update() cho cả cụm: đặt bản lưu trữ + chỉ mục, đồng thời
     xoá bản ghi thông tin và dòng sổ theo dõi. Firebase update() là NGUYÊN
     KHỐI — không có cảnh "xoá xong mới biết ghi hỏng". */
  function _archiveRows(list, how){
    if(!list || !list.length) return Promise.resolve(false);
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return Promise.resolve(false); }
    const pay={}, got={};
    list.forEach(r=>{
      const ym=_archYm(r);
      pay[FB_ARCH+'/'+ym+'/'+r.key]={
        mat:r.mat||'', bcode:r.bcode||'', letter:r.letter||'', bdate:r.bdate||'',
        vno:r.vno||'', vessel:r.vessel||'', dIn:r.dIn||'', gIn:r.gIn||'', dOut:r.dOut||'',
        hqQty:_n(r.hqQty), vas:true, vasDate:r.vasDate||'', note:r.note||'',
        lastSap:r.lastSeen||'', lastEnd:_n(r.end),
        archAt:_stamp(), archBy:_who(), archHow:how||'auto'
      };
      pay[FB_AIDX+'/'+ym+'/'+r.key]=r.bcode||'1';
      pay[FB_INFO+'/'+r.key]=null;
      pay[FB_WATCH+'/'+r.key]=null;
      (got[ym]=got[ym]||[]).push(r.key);
    });
    return _push(pay,'archived '+list.length).then(ok=>{
      if(!ok) return false;
      list.forEach(r=>{ delete INFO[r.key]; delete WATCH[r.key]; });
      Object.keys(got).forEach(ym=>{
        AIDX[ym]=AIDX[ym]||{};
        got[ym].forEach(k=>{ AIDX[ym][k]=1; });
      });
      const months=Object.keys(got).sort().join(', ');
      _say('🗄 '+list.length+' finished batch(es) moved to the archive ('+months+
           ') — press 🗄 Archive to read them back','ok');
      render();
      return true;
    });
  }
  /* Chạy sau mỗi lượt vẽ. Im lặng khi chưa tới hạn — KHÔNG hỏi, KHÔNG toast,
     vì lô đã tích VASSCM là việc đã xong, dời đi chỉ là dọn màn hình. */
  function _autoArchive(){
    if(_arcBusy || _sapBehind || !_watchOk()) return;
    const due=_archDue();
    if(!due.length) return;
    _arcBusy=true;
    _archiveRows(due,'auto').then(()=>{ _arcBusy=false; })
      .catch(e=>{ console.warn('[BOND] auto archive',e); _arcBusy=false; });
  }
  /* Nút trong bảng kho lưu trữ: dời NGAY những lô đã xong mà chưa hết hạn
     chờ. Có hỏi lại, và nói rõ đang bỏ qua thời gian chờ. */
  function archiveNow(){
    const p=_archPending();
    if(!p.length){ _say('Nothing is waiting to be archived',''); return; }
    if(!confirm('🗄 ARCHIVE '+p.length+' FINISHED BATCH(ES) NOW\n\n'+
      p.slice(0,10).map(r=>'· '+r.bcode+' ('+r.mat+') — VASSCM '+(_dmy(r.vasDate)||'?')).join('\n')+
      (p.length>10?('\n… and '+(p.length-10)+' more'):'')+'\n\n'+
      'They have VASSCM ticked and are no longer in SAP, so they leave the table and go to the\n'+
      'archive on Firebase. This skips the '+ARCH_WAIT_DAYS+'-day waiting period.\n'+
      'Nothing is lost — open the archive by month to read them back.\n\nMove them now?')) return;
    _archiveRows(p,'manual');
  }

  /* ── GỌI VỀ MỘT THÁNG ─────────────────────────────────────────
     Đọc ĐÚNG một tháng, đúng lúc người dùng bấm. Kho lưu trữ không bao giờ
     được nạp sẵn — đó là cả điểm của nó. */
  function openArch(){
    const m=_el('bondArc'); if(m) m.classList.add('on');
    _renderArch();
  }
  function closeArch(){
    const m=_el('bondArc'); if(m) m.classList.remove('on');
    _arcM=''; _arcRows=null;
  }
  function loadArchMonth(ym){
    ym=ym||(_el('bondArcSel')||{}).value;
    if(!ym){ _say('Pick the month you want to read back','warn'); return; }
    if(!_arcCount(ym)){ _say('⚠ The archive has nothing for '+ym,'warn'); return; }
    if(typeof firebase==='undefined'){ _say('⚠ Offline — the archive lives on Firebase','warn'); return; }
    _arcM=ym; _arcRows=null; _renderArch();
    _ref().ref(FB_ARCH+'/'+ym).once('value').then(s=>{
      const v=s.val()||{};
      _arcRows=Object.keys(v).map(k=>Object.assign({ key:k }, v[k]||{}))
        .sort((a,b)=>{
          const ka=String(a.mat||'')+String(a.vasDate||'')+String(a.bcode||'');
          const kb=String(b.mat||'')+String(b.vasDate||'')+String(b.bcode||'');
          return ka<kb?-1:(ka>kb?1:0);
        });
      _renderArch();
      _say('🗄 Archive '+ym+' — '+_arcRows.length+' batch(es) read back','ok');
    }).catch(e=>{ console.warn('[BOND] arch read',e); _arcRows=[]; _renderArch();
                  _say('❌ Could not read the archive of '+ym,'er'); });
  }
  function delArchMonth(ym){
    ym=ym||_arcM||(_el('bondArcSel')||{}).value;
    if(!ym || !_arcCount(ym)){ _say('Pick the month you want to delete','warn'); return; }
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const n=_arcCount(ym);
    if(!confirm('🗑 DELETE THE ARCHIVE OF '+ym+'\n\n'+n+' finished batch(es) will be erased from Firebase\n'+
      'FOR GOOD — vessel, declaration numbers, VASSCM dates, notes, everything.\n\n'+
      'SAP data is not touched. Export to Excel first if you may still need it.\n\nDelete?')) return;
    const pay={}; pay[FB_ARCH+'/'+ym]=null; pay[FB_AIDX+'/'+ym]=null;
    _push(pay,'deleted archive '+ym).then(ok=>{
      if(!ok) return;
      delete AIDX[ym];
      if(_arcM===ym){ _arcM=''; _arcRows=null; }
      _say('🗑 Archive of '+ym+' deleted — '+n+' batch(es)','ok');
      _renderArch(); render();
    });
  }
  function delArchYear(y){
    y=String(y||'').slice(0,4);
    const ms=_arcMonths().filter(m=>m.slice(0,4)===y);
    if(!y || !ms.length){ _say('Pick the year you want to delete','warn'); return; }
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    let n=0; ms.forEach(m=>{ n+=_arcCount(m); });
    if(!confirm('🗑 DELETE THE WHOLE YEAR '+y+' FROM THE ARCHIVE\n\n'+
      ms.length+' month(s) · '+n+' finished batch(es):\n'+ms.join(', ')+'\n\n'+
      'Everything above is erased from Firebase FOR GOOD. SAP data is not touched.\n'+
      'Export to Excel first if you may still need it.\n\nDelete the whole year?')) return;
    const pay={};
    ms.forEach(m=>{ pay[FB_ARCH+'/'+m]=null; pay[FB_AIDX+'/'+m]=null; });
    _push(pay,'deleted archive '+y).then(ok=>{
      if(!ok) return;
      ms.forEach(m=>{ delete AIDX[m]; if(_arcM===m){ _arcM=''; _arcRows=null; } });
      _say('🗑 Archive of '+y+' deleted — '+ms.length+' month(s), '+n+' batch(es)','ok');
      _renderArch(); render();
    });
  }
  function _arcBtn(){
    const b=_el('bondArcN'); if(!b) return;
    const n=_arcTotal();
    b.textContent=n?String(n):'0';
    b.className='bond-arcn'+(n?' on':'');
    const w=_el('bondArcBtn');
    if(w) w.title='Bonded archive — '+n+' finished batch(es) stored on Firebase across '+
      _arcMonths().length+' month(s). Nothing is loaded until you ask for a month.';
  }
  function _renderArch(){
    _arcBtn();
    const box=_el('bondArcBody'); if(!box) return;
    const months=_arcMonths(), total=_arcTotal();
    const years={};
    months.forEach(m=>{ const y=m.slice(0,4); years[y]=(years[y]||0)+_arcCount(m); });
    const pend=_archPending(), dueN=_archDue().length;
    let h='<div class="bond-arc-top">'
      + '<div class="bond-arc-k"><span>STORED ON FIREBASE</span><b>'+total+'</b><i>batch(es)</i></div>'
      + '<div class="bond-arc-k"><span>MONTHS</span><b>'+months.length+'</b><i>with data</i></div>'
      + '<div class="bond-arc-k"><span>WAITING IN THE TABLE</span><b>'+pend.length+'</b>'
      +   '<i>done, in the '+ARCH_WAIT_DAYS+'-day wait</i></div>'
      + '</div>'
      + '<div class="bond-arc-note">A batch lands here only when <b>VASSCM is ticked</b> AND SAP no longer '
      + 'lists it — and only after it has stood in the table for '+ARCH_WAIT_DAYS+' days. '
      + '<b>A batch with no VASSCM is never archived</b>; it stays pinned at the top of the table until '
      + 'someone files it. Archived data is <b>never loaded when the app starts</b> — press '
      + '<b>📜 Read back</b> on a month to fetch it.</div>';
    if(pend.length){
      h+='<div class="bond-arc-pend"><b>🗄 '+pend.length+' finished batch(es) still in the table:</b> '
        + pend.slice(0,8).map(r=>_esc(r.bcode)+' <i>('+(r.archDays!=null && r.archDays>0
             ? ('leaves in '+r.archDays+' d') : 'leaving now')+')</i>').join(' · ')
        + (pend.length>8?' …':'')
        + (dueN?(' <b>'+dueN+' due now.</b>'):'')
        + ' <button class="bond-btn" onclick="BOND.archiveNow()">⤓ Archive them now</button></div>';
    }
    if(!months.length){
      h+='<div class="bond-arc-empty">The archive is empty — nothing has been stored yet.</div>';
    }else{
      h+='<div class="bond-arc-years">';
      Object.keys(years).sort().reverse().forEach(y=>{
        h+='<div class="bond-arc-y"><div class="bond-arc-yh"><b>'+y+'</b>'
          + '<span>'+years[y]+' batch(es)</span>'
          + '<button class="bond-btn danger" onclick="BOND.delArchYear(\''+y+'\')" '
          + 'title="Delete every archived month of '+y+' from Firebase">🗑 Delete year '+y+'</button></div>'
          + '<div class="bond-arc-ms">';
        months.filter(m=>m.slice(0,4)===y).forEach(m=>{
          h+='<div class="bond-arc-m'+(m===_arcM?' on':'')+'">'
            + '<b>'+m+'</b><span>'+_arcCount(m)+' batch(es)</span>'
            + '<button class="bond-btn" onclick="BOND.loadArchMonth(\''+m+'\')" '
            + 'title="Read this month back from Firebase">📜 Read back</button>'
            + '<button class="bond-btn danger" onclick="BOND.delArchMonth(\''+m+'\')" '
            + 'title="Delete this month from the archive, for good">🗑</button>'
            + '</div>';
        });
        h+='</div></div>';
      });
      h+='</div>';
    }
    if(_arcM){
      h+='<div class="bond-arc-view"><div class="bond-arc-vh"><b>🗄 '+_arcM+'</b>'
        + '<span>'+(_arcRows?(_arcRows.length+' batch(es) read back'):'reading…')+'</span>'
        + '<button class="bond-btn" onclick="BOND.closeArchMonth()">✕ Close</button></div>';
      if(!_arcRows){ h+='<div class="bond-arc-empty">Reading '+_arcM+' from Firebase…</div>'; }
      else if(!_arcRows.length){ h+='<div class="bond-arc-empty">That month came back empty.</div>'; }
      else{
        h+='<div class="bond-arc-tw"><table class="bond-arc-tbl"><thead><tr>'
          + '<th>Mat</th><th>Batch code</th><th>Vessel</th><th>Voyage</th><th>Import decl.</th>'
          + '<th>Get-out decl.</th><th class="n">HQ approved</th><th class="n">Last End</th>'
          + '<th>Last in SAP</th><th>VASSCM</th><th>Archived</th><th>Note</th>'
          + '</tr></thead><tbody>'
          + _arcRows.map(r=>'<tr>'
            + '<td>'+_esc(r.mat||'')+'</td><td class="b">'+_esc(r.bcode||'')+'</td>'
            + '<td>'+_esc(r.vessel||'')+'</td><td>'+_esc(r.vno||'')+'</td>'
            + '<td>'+_esc(r.dIn||'')+'</td><td>'+_esc(r.dOut||'')+'</td>'
            + '<td class="n">'+_K(_n(r.hqQty))+'</td><td class="n">'+_K(_n(r.lastEnd))+'</td>'
            + '<td>'+_dmy(r.lastSap||'')+'</td><td>'+_dmy(r.vasDate||'')+'</td>'
            + '<td>'+_esc(r.archAt||'')+(r.archBy?(' · '+_esc(r.archBy)):'')+'</td>'
            + '<td>'+_esc(r.note||'')+'</td></tr>').join('')
          + '</tbody></table></div>';
      }
      h+='</div>';
    }
    box.innerHTML=h;
    const sel=_el('bondArcSel');
    if(sel){
      const cur=sel.value;
      sel.innerHTML='<option value="">Archived months…</option>'+
        months.map(m=>'<option value="'+m+'">'+m+' · '+_arcCount(m)+' batches</option>').join('');
      if(cur && AIDX[cur]) sel.value=cur;
    }
  }
  function closeArchMonth(){ _arcM=''; _arcRows=null; _renderArch(); }

  /* ============================================================
     BẢNG — Tabulator, sửa TẠI CHỖ
     ------------------------------------------------------------
     ⚠ Đây là chỗ chữa dứt điểm lỗi "gõ chữ bị nuốt" của tab KNQ cũ: ở đó
     mỗi lần sửa một ô là dựng lại innerHTML cả bảng, ô đang gõ bị huỷ và
     tạo lại. Tabulator sửa đúng ô, đẩy đúng ô, không đụng phần còn lại.
  ============================================================ */
  function _kgFmt(cell){
    const v=cell.getValue();
    if(v===''||v==null) return '<span class="bond-dim">—</span>';
    const n=_num(v); if(n==null) return _esc(String(v));
    if(n===0) return '<span class="bond-zero">0</span>';
    return '<span class="'+(n<0?'bond-neg':'bond-pos')+'">'+n.toLocaleString('en-US')+'</span>';
  }
  function _leftFmt(cell){
    const r=cell.getRow().getData(), v=_num(cell.getValue());
    if(v==null) return '<span class="bond-dim">—</span>';
    let h='<b class="bond-left">'+v.toLocaleString('en-US')+'</b>';
    if(_isPX(r.letter)) h+='<span class="bond-sub">per OL1</span>';
    else                h+='<span class="bond-sub">SAP</span>';
    if(r.flag==='low')  h+='<span class="bond-tag low">⚠ '+Math.round(v/1000)+' T</span>';
    if(r.warn)          h+='<span class="bond-tag bad">'+_esc(r.warn)+'</span>';
    return h;
  }
  /* ── DỰ KIẾN HẾT ────────────────────────────────────────────
     Ngày đã hết THẬT thì ghi thẳng ngày đó (chữ thường). Ngày CHIẾU thì
     ghi kèm "≈" và đếm ngược, tô cam khi còn ≤ 7 ngày — đây là con số để
     người điều độ biết bao giờ phải có lô tiếp theo. */
  function _etaFmt(cell){
    const r=cell.getRow().getData();
    if(!r.eta) return _isPX(r.letter)
      ? '<span class="bond-dim">—</span>'
      : '<span class="bond-dim" title="D/E batches take their figure straight from SAP every day — no FEED OL1 projection">—</span>';
    if(!r.projected)
      return '<span class="bond-eta done" title="The day this batch actually ran dry on the FEED OL1 figures entered">'+
             _dmy(r.eta)+'</span><span class="bond-sub">empty</span>';
    const d=r.etaDays;
    return '<span class="bond-eta'+(r.soon?' hot':'')+'" title="Forecast — projected forward on the plan X in the '+
      'file; a day with no TOTAL P+X keyed in runs on the assumed '+_K(DEF_TOT_KG)+' kg/day">≈ '+_dmy(r.eta)+'</span>'+
      '<span class="bond-sub">'+(d==null?'':(d<=0?'today':(d+' d left')))+'</span>';
  }
  function _pctFmt(cell){
    const p=+cell.getValue()||0;
    return '<div class="bond-pw"><i style="width:'+(p*100).toFixed(1)+'%"></i></div>'+
           '<span class="bond-pt">'+(p*100).toFixed(1)+'%</span>';
  }
  function _dateFmt(cell){
    const v=String(cell.getValue()||'');
    return v?('<span class="bond-date">'+_esc(_dmy(v))+'</span>'):'<span class="bond-dim">—</span>';
  }
  /* ── NGÀY GET IN ─────────────────────────────────────────────
     Ô này quyết định thứ tự bơm khi hai lô trùng ngày trong mã batch, nên
     nó phải TỰ NÓI ra tình trạng của mình: đảo thứ tự thì hiện ⇅, còn
     thiếu ngày trong khi lô bên cạnh trùng ngày thì hiện dấu hỏi. */
  function _gInFmt(cell){
    const r=cell.getRow().getData(), v=String(cell.getValue()||'');
    if(!v) return (r.seq==='ask')
      ? '<span class="bond-gin ask" title="Another batch shares this batch date — key the get-in date on every one of them so the draw order follows the real arrival, not the batch code">? missing</span>'
      : '<span class="bond-dim">—</span>';
    let h='<span class="bond-date">'+_esc(_dmy(v))+'</span>';
    if(r.seq==='swap')
      h+='<span class="bond-tag seq" title="Drawn in get-in order, not in batch-code order — batch #'+
         (r.ord+1)+' of this batch date">#'+(r.ord+1)+' in</span>';
    return h;
  }
  function _batFmt(cell){
    const v=String(cell.getValue()||'').toUpperCase();
    if(!v) return '<span class="bond-dim">—</span>';
    return '<span class="bond-bat b-'+v.toLowerCase()+'" title="'+_esc(LETTER_NAME[v]||'')+'">'+v+'</span>';
  }
  function _codeFmt(cell){
    const r=cell.getRow().getData(), v=String(cell.getValue()||'');
    const bd=r.bdate?('<span class="bond-sub">from '+_dmy(r.bdate)+'</span>'):'';
    return '<span class="bond-code">'+_esc(v)+'</span>'+bd;
  }
  function _matFmt(cell){
    const v=String(cell.getValue()||'');
    return v?('<span class="bond-mat m-'+v.toLowerCase()+'">'+_esc(v)+'</span>'):'';
  }
  /* ── Ô STT — SỐ THỨ TỰ + TÌNH TRẠNG ─────────────────────────
     Vì sao gộp vào một ô: bảng đã 22 cột, tách tình trạng ra cột riêng là
     thêm một lần cuộn ngang. Số thứ tự ở đây CHÍNH LÀ thứ tự rút hàng. */
  function _sttFmt(cell){
    const r=cell.getRow().getData();
    const st=r.st||'';
    const tip={ pumping:'Being drawn out right now'+
                        (r.pumpWhy==='fifo'?' — head of the FIFO queue for this lot type'
                        :r.pumpWhy==='hq'  ?' — End Stock '+_K(r.end)+' kg is below the HQ approved '+_K(r.hqQty)+' kg, so part of the lot has already gone out'
                        :r.pumpWhy==='sap' ?' — SAP booked a negative GI or Trs on '+_dmy(r.date)
                                           :''),
                wait:'Untouched, not its turn yet',
                emptied:'Empty but VASSCM NOT ticked yet — still something to do',
                zero:'Empty and VASSCM filed — finished',
                gone:'SAP no longer lists this batch and VASSCM is NOT ticked'+
                     (r.lastSeen?(' — last seen in the SAP data of '+_dmy(r.lastSeen)+
                       (r.end!=null?(' holding '+_K(r.end)+' kg'):'')):'')+
                     '. The row is pinned to the top and will not go away until the get-out is filed on VAS.',
                archiving:'VASSCM filed and SAP no longer lists it — the row leaves the table on '+
                     _dmy(r.archDue||'')+' and goes to the 🗄 archive on Firebase' }[st]||'';
    /* ⭐ v4.118 — DÒNG GHIM KHÔNG MANG SỐ THỨ TỰ. Số No. ở bảng này là THỨ
       TỰ RÚT HÀNG; lô ghim đã hết hàng, đứng đầu bảng chỉ vì còn việc phải
       làm. In số cho nó là nói dối về thứ tự bơm. */
    let h='<div class="bond-stt">'+
      '<span class="bond-no'+(r.pin?' pin':'')+'">'+
        (r.pin?'🚩':(cell.getRow().getPosition()||''))+'</span>'+
      '<span class="bond-chip c-'+st+'" title="'+_esc(tip)+'">'+
        (ST_ICON[st]||'')+' '+_esc(ST_NAME[st]||'')+'</span>';
    const mk=[];
    if(r.isNew)  mk.push('<span class="bond-mk new" title="Just received — not in the SAP snapshot of '+
                         _dmy(_prevDay)+(_n(r.gr)>0?(', GR column +'+_K(r.gr)+' kg'):'')+'">✚ new</span>');
    if(r.noInfo) mk.push('<span class="bond-mk info" title="No vessel / declaration yet — fill the columns on the left">✎ no details</span>');
    if(r.low)    mk.push('<span class="bond-mk low" title="Under '+_K(LOW_KG)+' kg left">⚠ low</span>');
    /* ⭐ MÃ BATCH ĐẶT NGƯỢC — dấu này phải đập vào mắt: dòng đang đứng ở vị
       trí do NGÀY GET IN quyết định, không phải do số cuối mã batch. */
    if(r.seq==='swap')
      mk.push('<span class="bond-mk seq" title="Batch codes of '+_dmy(r.bdate)+
              ' were issued out of order. This row is placed by its get-in date ('+
              _dmy(r.gIn)+'), so the batch that really arrived first is drawn out first.">⇅ code out of order</span>');
    /* v4.118 — lô dựng từ SỔ THEO DÕI: nói rõ số đang hiện là số CŨ */
    if(!r.inSap && r.lastSeen)
      mk.push('<span class="bond-mk gone" title="Figures shown are the last ones SAP had for this batch, '+
              'on '+_dmy(r.lastSeen)+'. Nothing newer exists.">↩ last seen '+_dmy(r.lastSeen)+'</span>');
    if(r.st==='archiving')
      mk.push('<span class="bond-mk arc" title="Finished — this row leaves the table on '+_dmy(r.archDue||'')+
              ' and is kept in the 🗄 archive, which you can read back by month at any time.">🗄 '+
              (r.archDays!=null && r.archDays>0 ? ('archiving in '+r.archDays+' d') : 'archiving now')+'</span>');
    if(r.seq==='ask')
      mk.push('<span class="bond-mk seqq" title="Another batch shares the batch date '+_dmy(r.bdate)+
              ' but the get-in dates are not all keyed in — the draw order falls back to the batch code, '+
              'which may not be the real arrival order.">⇅ get-in date?</span>');
    if(mk.length) h+='<span class="bond-mks">'+mk.join('')+'</span>';
    return h+'</div>';
  }
  /* ⭐ TICK VAS PHẢI BẤM HAI LẦN ────────────────────────────────
     Ô VAS chỉ rộng 48 px và nằm kẹp giữa cột % và cột ngày, nhưng một cái
     tick nhầm làm lô nhảy thẳng từ "Empty — no VASSCM" (còn việc phải làm,
     tô cam, đứng trong dải cảnh báo) sang "Done" (làm mờ, hết nhắc) ⇒ MẤT
     DẤU một việc chưa làm mà không ai hay. Bỏ tick nhầm cũng tệ ngang: lô
     đã xong tự dựng dậy đòi VASSCM lại.
     Vì thế: click 1 chỉ NẠP (ô đổi thành ❓ nền vàng + toast nói rõ sắp BẬT
     hay sắp TẮT), click 2 vào ĐÚNG ô đó mới ghi xuống Firebase.
     Nạp tự huỷ sau ARM_MS, hoặc khi bấm sang ô khác, hoặc khi bảng dựng lại
     — người dùng bỏ đi rồi quay lại không được thừa hưởng một cú nạp cũ.
     ⚠ Chỉ chặn Ô VAS. Ô VASSCM date bên cạnh vẫn sửa một lần như cũ: gõ sai
     ngày thì nhìn thấy ngay trên bảng, không âm thầm như cái tick. */
  const VAS_ARM_MS = 4000;
  let _vasArm=null, _vasArmT=null;          /* _vasArm = {key, el, on} */

  function _vasHtml(on,armed){
    if(armed) return '<span class="bond-vas arm" title="Click again to '+
                     (on?'clear':'confirm')+' VASSCM — or move away to cancel">?</span>';
    return on?'<span class="bond-vas on">✔</span>':'<span class="bond-vas">—</span>';
  }
  function _vasFmt(cell){
    const d=cell.getRow().getData();
    return _vasHtml(!!cell.getValue(), !!(_vasArm && _vasArm.key===d.key));
  }
  /* Gỡ nạp và TRẢ Ô VỀ NGUYÊN TRẠNG. Vẽ thẳng vào DOM chứ không đụng dữ
     liệu — nạp không phải là một thay đổi, không có gì để đẩy lên Firebase. */
  function _vasDisarm(){
    if(_vasArmT){ clearTimeout(_vasArmT); _vasArmT=null; }
    const a=_vasArm; _vasArm=null;
    if(a && a.el){ try{ a.el.innerHTML=_vasHtml(a.on,false); }catch(_){} }
  }
  function _vasClick(cell){
    const d=cell.getRow().getData(), el=cell.getElement();
    if(_vasArm && _vasArm.key===d.key){        /* ── click 2 ⇒ ghi thật */
      _vasDisarm();
      setInfo(d.key,'vas',!d.vas);
      return;
    }
    _vasDisarm();                              /* bấm sang ô khác ⇒ ô cũ về cũ */
    _vasArm={ key:d.key, el:el, on:!!d.vas };
    try{ el.innerHTML=_vasHtml(!!d.vas,true); }catch(_){}
    _vasArmT=setTimeout(_vasDisarm,VAS_ARM_MS);
    _say((d.vas?'Clear':'Confirm')+' VASSCM for '+d.bcode+
         ' — click the cell again','warn');
  }

  function _columns(){
    const ro=!!_arch;            /* kỳ đã lưu = chỉ đọc */
    const ed=ro?undefined:'input';
    const C=[
      /* ⭐ GHIM TRÁI — bảng rộng, cuộn ngang mấy cũng không mất chỗ này.
         Ô STT gánh luôn TÌNH TRẠNG lô (chốt của người dùng): số thứ tự,
         chip trạng thái, và hai dấu phụ "mới nhập" / "thiếu thông tin". */
      { title:'No. · status', field:'st', width:132, headerSort:true, frozen:true,
        formatter:_sttFmt, cssClass:'bond-c-stt',
        headerTooltip:'Draw-down order (first in, first out) together with the state of the batch' },

      /* ── TRÁI · nhận dạng, người dùng gõ ─────────────────── */
      { title:'Voyage no.', field:'vno', width:78, editor:ed, headerSort:true,
        cssClass:'bond-c-user', headerTooltip:'Voyage number — you type this, SAP does not carry it' },
      { title:'Vessel', field:'vessel', width:150, editor:ed, headerSort:true,
        cssClass:'bond-c-user', headerTooltip:'Vessel that brought this batch — you type this, SAP does not carry it' },
      { title:'Import decl.', field:'dIn', width:124, editor:ed, headerSort:true,
        cssClass:'bond-c-user mono', headerTooltip:'Import declaration number of the voyage' },
      { title:'Get in date', field:'gIn', width:112, editor:ro?undefined:'date', headerSort:true,
        cssClass:'bond-c-user', formatter:_gInFmt,
        headerTooltip:'Day the vessel pumped this batch INTO the bonded warehouse. '+
                      'When two batches share the same batch date, this date — not the batch code — '+
                      'decides which one is drawn out first.' },
      { title:'Get-out decl.', field:'dOut', width:124, editor:ed, headerSort:true,
        cssClass:'bond-c-user mono', headerTooltip:'Declaration number releasing this batch from the bonded warehouse' },

      /* ── GIỮA · nguyên văn SAP, chỉ đọc ──────────────────── */
      { title:'Date', field:'date', width:88, headerSort:true, formatter:_dateFmt,
        cssClass:'bond-c-sap', headerTooltip:'Date of the SAP figures in use (D-1)' },
      { title:'SLoc', field:'sloc', width:64, hozAlign:'center', headerSort:false,
        cssClass:'bond-c-sap', formatter:()=>'<span class="bond-sloc">1100</span>' },
      { title:'Mat', field:'mat', width:52, hozAlign:'center', headerSort:true,
        formatter:_matFmt, cssClass:'bond-c-sap' },
      { title:'Batch', field:'letter', width:54, hozAlign:'center', headerSort:true,
        formatter:_batFmt, cssClass:'bond-c-sap' },
      { title:'Batch code', field:'bcode', width:108, hozAlign:'center', headerSort:true,
        formatter:_codeFmt, cssClass:'bond-c-sap' }
    ];
    if(!_slim){
      C.push(
        { title:'Init (kg)', field:'init', width:104, hozAlign:'right', headerSort:true,
          formatter:_kgFmt, cssClass:'bond-c-sap' },
        { title:'GR', field:'gr', width:82, hozAlign:'right', headerSort:true,
          formatter:_kgFmt, cssClass:'bond-c-sap' },
        { title:'GI', field:'gi', width:88, hozAlign:'right', headerSort:true,
          formatter:_kgFmt, cssClass:'bond-c-sap' },
        { title:'Trs', field:'trs', width:88, hozAlign:'right', headerSort:true,
          formatter:_kgFmt, cssClass:'bond-c-sap' }
      );
    }
    C.push({ title:'End (kg)', field:'end', width:110, hozAlign:'right', headerSort:true,
      formatter:_kgFmt, cssClass:'bond-c-sap bond-c-end',
      headerTooltip:'SAP End Stock — the raw figure, never adjusted' });

    /* ── PHẢI · phần làm việc ──────────────────────────────── */
    C.push(
      { title:'HQ approved', field:'hqQty', width:108, hozAlign:'right', editor:ed,
        headerSort:true, formatter:_kgFmt, cssClass:'bond-c-user',
        headerTooltip:'Quantity Customs approved for get out — reference only, not used in any calculation' },
      { title:'Actual left (kg)', field:'left', width:126, hozAlign:'right', headerSort:true,
        formatter:_leftFmt, cssClass:'bond-c-calc',
        headerTooltip:'P/X = End Stock run down on the period FEED OL1 · D/E = End Stock taken straight from SAP' },
      { title:'%', field:'pct', width:88, hozAlign:'right', headerSort:true,
        formatter:_pctFmt, cssClass:'bond-c-calc' },
      { title:'Empty by', field:'eta', width:112, headerSort:true,
        formatter:_etaFmt, cssClass:'bond-c-calc',
        headerTooltip:'The day this batch runs dry. Real up to the SAP date, then projected forward on '+
                      'FEED OL1 — plan X from the file, and 2,000 T/day assumed for any day with no TOTAL keyed in.' },
      { title:'VAS', field:'vas', width:48, hozAlign:'center', headerSort:true,
        formatter:_vasFmt, cssClass:'bond-c-user',
        headerTooltip:'VASSCM declaration filed — click twice to toggle',
        cellClick:(e,cell)=>{ if(ro) return; _vasClick(cell); } },
      { title:'VASSCM date', field:'vasDate', width:112, editor:ro?undefined:'date',
        headerSort:true, cssClass:'bond-c-user', formatter:_dateFmt },
      { title:'Note', field:'note', width:190, editor:ed, headerSort:false,
        cssClass:'bond-c-user' }
    );
    /* nút xoá GHIM TRÁI luôn — để ở tận cùng bên phải thì bảng rộng thế này
       người dùng không bao giờ nhìn thấy (đã dính). */
    if(!ro) C.splice(1,0,{ title:'🗑', width:40, hozAlign:'center', headerSort:false,
      frozen:true, formatter:()=>'<span class="bond-del" title="Remove this row from the bonded-warehouse table">✕</span>',
      cssClass:'bond-c-del',
      cellClick:(e,cell)=>delRow(cell.getRow().getData().key) });
    return C;
  }

  /* ⭐ MÀU DÒNG mang HAI tầng thông tin cùng lúc:
       · thanh rail bên trái = LOẠI LÔ (P chàm · X tím · D mòng két · E hổ phách)
       · nền dòng            = TÌNH TRẠNG (đang bơm nổi lên, đã xong mờ đi)
     Tách hẳn ra hàm riêng để còn gọi lại sau updateData() — cập nhật tại chỗ
     KHÔNG chạy lại rowFormatter, không gọi thì tick VAS xong dòng vẫn giữ
     màu cũ. */
  function _paintRow(row){
    try{
      const d=row.getData(), el=row.getElement();
      [...el.classList].forEach(c=>{ if(/^bond-(r|lot)-/.test(c)) el.classList.remove(c); });
      if(d.st) el.classList.add('bond-r-'+d.st);
      el.classList.add('bond-lot-'+String(d.letter||'none').toLowerCase());
      if(d.pin)    el.classList.add('bond-r-pin');
      if(d.soon)   el.classList.add('bond-r-soon');
      if(d.isNew)  el.classList.add('bond-r-isnew');
      if(d.noInfo) el.classList.add('bond-r-noinfo');
    }catch(_){}
  }
  function _paintAll(){ try{ _table.getRows().forEach(_paintRow); }catch(_){} }

  /* ── GIỮ NGUYÊN CHỖ ĐANG LÀM VIỆC ───────────────────────────
     ⚠ LỖI ĐÃ DÍNH: mỗi lần gõ một ô hay tick VAS là bảng bị replaceData,
     Tabulator dựng lại toàn bộ dòng ⇒ NHẢY VỀ ĐẦU BẢNG. Đang sửa lô thứ 25
     mà mỗi lần gõ lại phải cuộn xuống tìm lại — vừa khó chịu vừa dễ gõ nhầm
     sang dòng khác.
     Phần tử cuộn thật của Tabulator v6 là .tabulator-tableholder; giữ cả
     scrollTop lẫn scrollLeft vì bảng này rộng, người dùng hay đang cuộn ngang. */
  function _holder(){
    try{ const g=_el('bondGrid'); return g?g.querySelector('.tabulator-tableholder'):null; }
    catch(_){ return null; }
  }
  function _posSave(){ const h=_holder(); return h?{ t:h.scrollTop, l:h.scrollLeft }:null; }
  function _posLoad(p){
    if(!p) return; const h=_holder(); if(!h) return;
    if(p.t) h.scrollTop=p.t;
    if(p.l) h.scrollLeft=p.l;
  }

  let _keys='';                  /* chữ ký bộ dòng của lần vẽ gần nhất */
  function _sig(rows){ return rows.map(r=>r.key).join('|'); }

  function _build(){
    const host=_el('bondGrid'); if(!host) return;
    if(typeof Tabulator==='undefined'){ host.innerHTML='<div class="bond-empty">Tabulator is not loaded</div>'; return; }
    const pos=_posSave();
    if(_table){ try{ _table.destroy(); }catch(_){} _table=null; }
    _table=new Tabulator('#bondGrid',{
      data:_rows, layout:'fitDataStretch', height:'100%', index:'key',
      columns:_columns(),
      placeholder:'No batch yet — paste a ZMMFR022 export under “📊 Raw SAP”, then come back here',
      rowFormatter:_paintRow
    });
    _table.on('cellEdited',cell=>{
      const d=cell.getRow().getData();
      setInfo(d.key,cell.getField(),cell.getValue());
    });
    _table.on('tableBuilt',()=>{ _posLoad(pos); });
    _keys=_sig(_rows);
  }

  /* ⭐ CẬP NHẬT TẠI CHỖ khi bộ dòng KHÔNG đổi.
     Gõ một ô, tick VAS, hay số SAP nhích một chút — bộ dòng vẫn y nguyên,
     nên chỉ cần updateData(): Tabulator sửa đúng ô trong DOM sẵn có, không
     dựng lại bảng, không đụng vị trí cuộn.
     Chỉ khi bộ dòng THỰC SỰ đổi (lọc, đổi kỳ, dán SAP mới, lô mới xuất hiện)
     mới replaceData — và ngay cả lúc đó vẫn trả người dùng về đúng chỗ cũ. */
  function _refill(){
    if(!_table){ _build(); return; }
    /* Bảng sắp vẽ lại ⇒ phần tử DOM đang giữ trong _vasArm hết giá trị.
       Gỡ nạp trước, đừng để một cú click cũ còn hiệu lực sau khi số đã đổi. */
    _vasDisarm();
    const sig=_sig(_rows), pos=_posSave();
    if(sig===_keys){
      try{
        const r=_table.updateData(_rows);
        if(r && r.then) r.then(()=>{ _paintAll(); _posLoad(pos); })
                         .catch(()=>{ _hardFill(pos,sig); });
        else { _paintAll(); _posLoad(pos); }
        return;
      }catch(_){ /* rơi xuống đường vẽ lại */ }
    }
    _hardFill(pos,sig);
  }
  function _hardFill(pos,sig){
    _keys=sig||_sig(_rows);
    try{
      const r=_table.replaceData(_rows);
      if(r && r.then) r.then(()=>_posLoad(pos)); else _posLoad(pos);
    }catch(_){ _build(); }
  }

  /* ============================================================
     THẺ THỐNG KÊ + DẢI CẢNH BÁO
  ============================================================ */
  /* ⭐ v4.107 — BỐN THẺ, MỖI THẺ TRẢ LỜI ĐÚNG MỘT CÂU HỎI
     ------------------------------------------------------------
     Đã BỎ hai thẻ "IN BONDED WAREHOUSE" và "P+X RUN DOWN ON OL1": tổng tồn
     kho đã nằm sẵn ở cột Actual left của bảng, bày thêm một lần nữa chỉ tổ
     chiếm chỗ. Bốn thẻ còn lại đều là thứ KHÔNG đọc được từ bảng:
       ⏳ lô nào sắp hết trước · ⛽ kỳ này đã dùng bao nhiêu
       🔗 số SAP mới tới đâu   · 🚩 còn việc gì phải làm
     Ít thẻ hơn ⇒ mỗi thẻ rộng ra ⇒ chữ to lên được. Dòng phụ tách làm hai
     tầng: tầng NỔI cho thứ cần đọc lướt (mã batch, ngày hết), tầng mờ cho
     phần diễn giải.  */
  function _renderCards(){
    const box=_el('bondCards'); if(!box) return;
    if(!_cardsOpen){ box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    const M=_month||_ym(_asOf());
    const o=_ol1Sum();
    const nNew =_all.filter(r=>r.noInfo && r.inSap).length;
    const nGone=_all.filter(r=>r.st==='gone').length;
    const nZero=_all.filter(r=>r.st==='emptied').length;
    const nLow =_all.filter(r=>r.low).length;
    /* lead = dòng NỔI (to, đậm) · foot = dòng diễn giải (nhỏ, mờ) */
    const card=(cls,head,big,unit,lead,foot)=>
      '<div class="bond-card '+cls+'"><div class="bond-ch">'+head+'</div>'+
      '<div class="bond-cb">'+big+(unit?('<u>'+unit+'</u>'):'')+'</div>'+
      (lead?('<div class="bond-cl">'+lead+'</div>'):'')+
      (foot?('<div class="bond-cs">'+foot+'</div>'):'')+'</div>';
    box.innerHTML=
      (function(){
        /* ⭐ DỰ BÁO — lô nào sắp hết trước, còn mấy ngày. Đây là câu hỏi
           điều độ hỏi mỗi sáng: bao giờ phải có lô tiếp theo.
           Mã batch và ngày hết là HAI THỨ PHẢI ĐỌC ĐƯỢC TỪ XA, nên cho lên
           dòng nổi riêng chứ không nhét chung một chuỗi dài. */
        const q=_all.filter(r=>r.projected && r.etaDays!=null && _isPX(r.letter))
                    .sort((a,b)=>a.etaDays-b.etaDays);
        if(!q.length) return '';
        const soon=q.filter(r=>r.etaDays<=WARN_DAYS);
        const f=q[0];
        return card('eta'+(soon.length?' hot':''),'⏳ RUNNING OUT FIRST',
          (f.etaDays<=0?'today':f.etaDays),(f.etaDays<=0?'':'days'),
          '<span class="bond-tag-lot l-'+String(f.letter).toLowerCase()+'">'+
            _esc(f.mat)+' '+_esc(f.letter)+'</span>'+
          '<b class="bond-bignum">'+_esc(f.bcode)+'</b>'+
          '<b class="bond-bigdate">≈ '+_dmy(f.eta)+'</b>',
          _K(f.left)+' kg left'+
          (soon.length>1?(' · '+soon.length+' batches empty within '+WARN_DAYS+' days'):''));
      })()+
      card('ol1','⛽ FEED OL1 USED<span>'+_dmy(M+'-01')+' → '+_dmy(_sapDay||_wantDay())+'</span>',
        _T(o.t),'T',
        '<b>P '+_T(o.p)+'</b><span class="bond-cx">T</span>'+
        '<b>X '+_T(o.x)+'</b><span class="bond-cx">T</span>',
        o.n+' days'+(o.def?(' · ⚠ '+o.def+' on the assumed rate'):''))+
      card('sap','🔗 SAP FIGURES IN USE',
        _dmy(_sapDay)||'—','',
        '<b class="bond-bignum">'+_all.length+' batches</b>',
        _sapBehind?('⚠ nothing for '+_dmy(_wantDay())+' yet — using an older day')
                  :'on the D-1 mark')+
      (nNew+nGone+nZero+nLow
        ? card('flags','🚩 NEEDS ATTENTION', String(nNew+nGone+nZero+nLow),'',
            [nGone?('<b class="bond-need bad">⛔ '+nGone+' gone from SAP, VASSCM due</b>'):'',
             nZero?('<b class="bond-need warn">◍ '+nZero+' empty, no VASSCM</b>'):'',
             nNew ?('<b class="bond-need warn">✎ '+nNew+' missing details</b>'):'',
             nLow ?('<b class="bond-need warn">⚠ '+nLow+' running low</b>'):''
            ].filter(Boolean).join(''),
            (nGone+nZero)?((nGone+nZero)+' pinned to the top of the table until VASSCM is ticked'):'')
        : '')+
      /* v4.118 — kho lưu trữ: con số này đọc từ CHỈ MỤC, không kéo dữ liệu về */
      (function(){
        const tot=_arcTotal(), pend=_archPending().length;
        if(!tot && !pend) return '';
        return card('arc','🗄 ARCHIVE', String(tot),'stored',
          '<b class="bond-need">'+_arcMonths().length+' month(s) on Firebase</b>'+
          (pend?('<b class="bond-need">'+pend+' leaving the table</b>'):''),
          'Finished batches only — nothing is loaded until you ask for a month');
      })();
  }
  /* ============================================================
     🔔 CẢNH BÁO — GOM HẾT VÀO MỘT CÁI CHUÔNG
     ------------------------------------------------------------
     _buildAlerts() chỉ DỰNG danh sách, không đụng DOM. _renderAlerts()
     vẽ chuông (số + màu theo mức nặng nhất) và tấm thả xuống.
     ⚠ Đừng gộp hai việc lại: chuông phải cập nhật ngay cả khi tấm đang
     đóng, nếu không người dùng không biết có gì mới.
  ============================================================ */
  function _buildAlerts(){
    const out=[];
    const A=_asOf(), want=_wantDay();
    if(_arch){
      const m=_arch.meta||{};
      out.push(['info','<b>📜 Viewing the saved snapshot of '+_arch.M+'</b> — taken '+_esc(m.savedAt||'?')+
        (m.savedBy?(' by '+_esc(m.savedBy)):'')+', SAP figures of '+_dmy(m.sapDate||'')+
        '. The table is read-only. '+
        '<button class="bond-btn" onclick="BOND.closePeriod()">✕ Back to live figures</button>']);
      return out;
    }
    if(!_sapDay){
      out.push(['bad','<b>The SAP tab has no SLoc 1100 row at all.</b> Switch to <b>📊 Raw SAP</b>, '+
        'click <b>📋 Paste from Excel</b> and paste the ZMMFR022 export covering '+_dmy(want)+'.']);
    }else if(_sapBehind){
      out.push(['warn','<b>SAP has nothing for '+_dmy(want)+' yet.</b> Falling back on the figures of '+
        '<b>'+_dmy(_sapDay)+'</b> — usable, but not the final number. '+
        'Paste a fresh ZMMFR022 under <b>📊 Raw SAP</b> and come back.']);
    }
    const o=_ol1Sum();
    const M=_month||_ym(A);
    if(o.miss.length)
      out.push(['warn','<b>'+o.miss.length+' day(s) in this period have no FEED OL1 row</b> ('+
        o.miss.slice(0,6).map(_dmy).join(', ')+(o.miss.length>6?(' …+'+(o.miss.length-6)):'')+
        ') — nothing was drawn down on those days, so Actual left for P/X reads higher than it really is. '+
        '<button class="bond-btn" onclick="BOND.openOl1()">⛽ Open FEED OL1</button>']);
    if(o.def)
      out.push(['warn','<b>'+o.def+' day(s) have no TOTAL P+X keyed in</b> — they run on the assumed '+
        _K(DEF_TOT_KG)+' kg/day, so “used” for P/X is an estimate, not the real figure. '+
        '<button class="bond-btn" onclick="BOND.openOl1()">⛽ Open FEED OL1</button>']);
    if(o.plan.length)
      out.push(['warn','<b>'+o.plan.length+' day(s) already past are still running on PLAN figures</b> ('+
        o.plan.slice(0,6).map(_dmy).join(', ')+(o.plan.length>6?(' …+'+(o.plan.length-6)):'')+
        ') — the run-down is using the planned X, not what really went out. Import the actual '+
        'column with <b>📥 Import Excel</b> in FEED OL1. '+
        '<button class="bond-btn" onclick="BOND.openOl1()">⛽ Open FEED OL1</button>']);
    const soon=_all.filter(r=>r.soon).sort((a,b)=>a.etaDays-b.etaDays);
    if(soon.length)
      out.push(['warn','<b>⏳ '+soon.length+' batch(es) forecast to run dry within '+WARN_DAYS+' days:</b> '+
        soon.slice(0,6).map(r=>_esc(r.bcode)+' ≈ '+_dmy(r.eta)+
          ' ('+(r.etaDays<=0?'today':(r.etaDays+' d left'))+')').join(' · ')+
        (soon.length>6?'…':'')+'. Projected on the plan X in the file; any day with no TOTAL P+X '+
        'runs on the assumed '+_K(DEF_TOT_KG)+' kg/day.']);
    /* ⭐ MÃ BATCH ĐẶT NGƯỢC — phải nói thẳng ra, vì nhìn bảng thì thấy 002
       đứng trên 001 và người xem sẽ tưởng phần mềm xếp sai. */
    const swap=_all.filter(r=>r.seq==='swap');
    if(swap.length){
      const g={};
      swap.forEach(r=>{ (g[r.seqGrp]=g[r.seqGrp]||[]).push(r); });
      const lines=Object.keys(g).sort().map(k=>{
        const q=g[k].slice().sort((a,b)=>a.ord-b.ord);
        return '<span class="bond-seql"><b>'+_esc(q[0].mat)+' '+_esc(q[0].letter)+
          ' · batch date '+_dmy(q[0].bdate)+':</b> '+
          q.map((r,i)=>(i+1)+') <b>'+_esc(r.bcode)+'</b>'+
            (r.vessel?(' — '+_esc(r.vessel)):'')+' <i>in '+_dmy(r.gIn)+'</i>').join(' &rarr; ')+
          '</span>';
      });
      out.push(['warn','<b>⇅ Batch codes were issued out of arrival order — '+
        Object.keys(g).length+' batch date(s) affected.</b> '+
        'The batch that got in FIRST is drawn out first, so a code ending 002 can legitimately '+
        'be pumped before 001. Order in use:<br>'+lines.join('<br>')]);
    }
    const ask=_all.filter(r=>r.seq==='ask' && !r.gIn && r.inSap);
    if(ask.length)
      out.push(['warn','<b>⇅ '+ask.length+' batch(es) share a batch date but have no Get in date:</b> '+
        ask.slice(0,6).map(r=>_esc(r.bcode)).join(', ')+(ask.length>6?'…':'')+
        '. Until every batch of that date is keyed in, the draw order falls back to the batch code — '+
        'which is exactly what goes wrong when the codes are issued in the wrong order.']);
    /* ⭐ v4.118 — HAI MỤC DƯỚI ĐÂY LÀ LÝ DO CÓ SỔ THEO DÕI.
       Lô hết hàng mà chưa get out trên VAS là việc SÓT, và trước đây nó
       biến mất khỏi màn hình cùng với SAP. Nay nó bị ghim lên đầu bảng và
       được kể tên ở đây, cho tới khi VASSCM được tích. */
    const gone=_all.filter(r=>r.st==='gone');
    if(gone.length)
      out.push(['bad','<b>⛔ '+gone.length+' batch(es) are NO LONGER in the SAP data of '+_dmy(_sapDay)+
        ' and VASSCM is NOT ticked:</b> '+gone.slice(0,6).map(r=>_esc(r.bcode)+
          (r.lastSeen?(' <i>(last seen '+_dmy(r.lastSeen)+')</i>'):'')).join(', ')+
        (gone.length>6?'…':'')+'. They are <b>pinned to the top of the table</b> and will stay there — '+
        'the software keeps them even though SAP dropped them, so the get-out on VAS cannot be missed. '+
        'File the VASSCM declaration and tick the VAS column; only then does the row leave.']);
    const zero=_all.filter(r=>r.st==='emptied');
    if(zero.length)
      out.push(['warn','<b>◍ '+zero.length+' batch(es) are empty but VASSCM is NOT ticked:</b> '+
        zero.slice(0,6).map(r=>_esc(r.bcode)).join(', ')+(zero.length>6?'…':'')+
        '. Once pumped out the VASSCM declaration is due. They are <b>pinned to the top of the table</b> '+
        'until the VAS column is ticked, then the row dims down and stops nagging.']);
    const arc=_all.filter(r=>r.st==='archiving');
    if(arc.length)
      out.push(['info','<b>🗄 '+arc.length+' finished batch(es) are on their way to the archive:</b> '+
        arc.slice(0,6).map(r=>_esc(r.bcode)+' <i>('+(r.archDays!=null && r.archDays>0
          ? ('in '+r.archDays+' d') : 'now')+')</i>').join(', ')+(arc.length>6?'…':'')+
        '. VASSCM is filed and SAP no longer lists them, so after '+ARCH_WAIT_DAYS+' days they leave the '+
        'table and are kept on Firebase. Nothing is lost — read them back by month. '+
        '<button class="bond-btn" onclick="BOND.openArch()">🗄 Open the archive</button>']);
    const nw=_all.filter(r=>r.noInfo && r.inSap);
    if(nw.length)
      out.push(['warn','<b>✎ '+nw.length+' batch(es) in SAP have no details yet:</b> '+
        nw.slice(0,8).map(r=>_esc(r.bcode)).join(', ')+(nw.length>8?'…':'')+
        '. Fill in voyage number, vessel and declaration numbers in the columns on the left.']);
    if(!out.length)
      out.push(['ok','✓ Figures of <b>'+_dmy(_sapDay)+'</b> · period <b>'+M+'</b> · '+
        _all.length+' batch(es) · nothing out of order.']);
    return out;
  }

  /* mức nặng nhất quyết định MÀU chuông — bad ⇒ đỏ, warn ⇒ hổ phách,
     còn lại ⇒ xanh im lặng. Mục 'ok' KHÔNG được tính là một việc phải đọc. */
  function _alTodo(){ return _alerts.filter(a=>a[0]!=='ok'); }
  function _renderAlerts(){
    _alerts=_buildAlerts();
    /* ⭐ TỰ MỞ khi có việc NẶNG hoặc đang xem kỳ đã lưu (nút ✕ quay lại số
       sống nằm trong tấm này — đóng kín thì không có đường ra). Chỉ mở khi
       BỘ cảnh báo ĐỔI, để người dùng đóng đi rồi không bị mở lại liên tục. */
    const sig=_alerts.map(a=>a[0]).join(',')+'|'+_alerts.length+'|'+(_arch?_arch.M:'');
    if((_arch || _alerts.some(a=>a[0]==='bad')) && sig!==_alSaid) _alOpen=true;
    _alSaid=sig;
    _renderBell();
    _paintAlerts();
    _bindAlDoc();
  }
  function _renderBell(){
    const btn=_el('bondBell'); if(!btn) return;
    const todo=_alTodo();
    const lv=todo.some(a=>a[0]==='bad') ? 'bad' : (todo.length ? 'warn' : 'ok');
    try{
      btn.className='bond-ico bond-bell '+lv+(_alOpen?' open':'');
      btn.title=todo.length
        ? (todo.length+' notification(s) to read — click to open')
        : 'No notification — everything checks out';
    }catch(_){}
    const n=_el('bondBellN'); if(!n) return;
    n.textContent=todo.length?String(todo.length):'';
    n.style.display=todo.length?'':'none';
  }
  function _paintAlerts(){
    const box=_el('bondAlerts'); if(!box) return;
    if(!_alOpen || !_alerts.length){ box.innerHTML=''; box.style.display='none'; return; }
    const todo=_alTodo();
    box.innerHTML=
      '<div class="bond-alhd"><b>🔔 Notifications</b>'+
      '<span>'+(todo.length?(todo.length+' to read'):'all clear')+'</span>'+
      '<button class="bond-btn" onclick="BOND.toggleAlerts(0)" title="Close this panel">✕ Close</button></div>'+
      '<div class="bond-albd">'+
      _alerts.map(([c,h])=>'<div class="bond-al '+c+'">'+h+'</div>').join('')+
      '</div>';
    box.style.display='';
    _posAlerts();
  }
  /* Tấm thả xuống dùng position:fixed rồi tự đặt toạ độ theo cái chuông —
     làm vậy để KHÔNG bao giờ bị cắt bởi overflow của thanh công cụ hay của
     khung bảng, và không đẩy bảng tụt xuống như dải cảnh báo cũ. */
  function _posAlerts(){
    const box=_el('bondAlerts'), btn=_el('bondBell');
    if(!box||!btn||!btn.getBoundingClientRect) return;
    try{
      const r=btn.getBoundingClientRect();
      box.style.top=Math.round(r.bottom+6)+'px';
      box.style.right=Math.max(8,Math.round(window.innerWidth-r.right-2))+'px';
    }catch(_){}
  }
  function toggleAlerts(v){
    _alOpen=(v==null)?!_alOpen:!!v;
    _renderBell(); _paintAlerts();
  }
  /* bấm ra ngoài / Esc thì đóng — gắn ĐÚNG MỘT LẦN, và chỉ khi môi trường
     thật có addEventListener (bộ test dựng DOM giả, không có). */
  function _bindAlDoc(){
    if(_alBound) return;
    if(typeof document==='undefined' || !document.addEventListener) return;
    _alBound=true;
    document.addEventListener('mousedown',e=>{
      if(!_alOpen) return;
      const box=_el('bondAlerts'), btn=_el('bondBell');
      if(box && box.contains && box.contains(e.target)) return;
      if(btn && btn.contains && btn.contains(e.target)) return;
      toggleAlerts(0);
    });
    document.addEventListener('keydown',e=>{ if(_alOpen && e.key==='Escape') toggleAlerts(0); });
    if(window.addEventListener) window.addEventListener('resize',_posAlerts);
  }

  /* ============================================================
     ⛽ FEED OL1 — bảng lượng dùng hằng ngày
     Ghi vào ĐÚNG node của tab KNQ cũ (knq_bonded/use) để hai bảng không
     bao giờ lệch nhau trong lúc chạy song song.
  ============================================================ */
  function openOl1(){
    const m=_el('bondOl1'); if(m) m.classList.add('on');
    const s=_el('bondOl1Month'); if(s) s.value=_month||_ym(_asOf());
    _renderUse(); _renderImp();
  }
  function closeOl1(){
    const m=_el('bondOl1'); if(m) m.classList.remove('on');
    _imp=null; _paste=false; _renderImp();
  }
  function onOl1Month(){ _renderUse(); }
  function onOl1Unit(){ const s=_el('bondOl1Unit'); _olUnit=(s&&s.value)||'T'; _renderUse(); }
  function _olM(){ const s=_el('bondOl1Month'); return (s&&s.value)||_month||_ym(_asOf()); }
  function _toKg(v){ const n=_num(v); if(n==null) return null; return _olUnit==='kg'?n:n*1000; }
  function _fromKg(v){ const n=_num(v); if(n==null) return ''; return _olUnit==='kg'?Math.round(n):(n/1000); }

  function setUse(d,f,val){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const u=Object.assign({},USE[d]||{});
    if(f==='note') u.note=String(val||'');
    else{
      const kg=_toKg(val);
      u[f]=(kg==null?'':Math.round(kg));
      /* ⭐ 'm' = GÕ TAY. Đánh dấu riêng để lần import sau KHÔNG đè lên số
         người dùng đã tự nhập (trừ khi tích ô "overwrite"). */
      if(f==='x') u.xs=(kg==null?'':'m');
    }
    USE[d]=u;
    const pay={}; pay[FB_USE+'/'+d]=u;
    _push(pay,'OL1 '+_dmy(d));
    _renderUse(); render();
  }
  function addUseRow(){
    const M=_olM(); const d=prompt('Add a day (YYYY-MM-DD)', M+'-01');
    if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if(USE[d]){ _say('That day already has a row',''); return; }
    USE[d]={ t:'', x:'', note:'' };
    const pay={}; pay[FB_USE+'/'+d]=USE[d];
    _push(pay,'OL1 '+_dmy(d)); _renderUse();
  }
  function fillMonth(){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const M=_olM(), last=+_lastDay(M).slice(8);
    const pay={}; let n=0;
    for(let i=1;i<=last;i++){
      const d=M+'-'+String(i).padStart(2,'0');
      if(USE[d]) continue;
      USE[d]={ t:'', x:'', note:'' }; pay[FB_USE+'/'+d]=USE[d]; n++;
    }
    if(!n){ _say(M+' already has every day',''); return; }
    _push(pay,'OL1 +'+n+' days'); _renderUse();
    _say('📅 Added '+n+' empty day(s) to '+M,'ok');
  }
  function delUseRow(d){
    if(!confirm('Delete the FEED OL1 row for '+_dmy(d)+'?')) return;
    delete USE[d];
    const pay={}; pay[FB_USE+'/'+d]=null;
    _push(pay,'deleted OL1 '+_dmy(d)); _renderUse(); render();
  }
  /* ⚠ CÙNG MỘT LỖI VỚI BẢNG CHÍNH: bảng OL1 dựng lại cả <tbody> mỗi lần gõ
     xong một ô, nên vừa NHẢY VỀ ĐẦU vừa mất luôn ô đang Tab tới — 31 dòng
     mà cứ gõ một ngày lại bị ném về ngày 1. Giữ lại chỗ cuộn và ô đang đứng
     (kèm vị trí con trỏ) rồi trả về sau khi vẽ. */
  function _useFocus(){
    try{
      const el=document.activeElement;
      if(!el||!el.getAttribute) return null;
      const k=el.getAttribute('data-u'); if(!k) return null;
      return { k:k, s:el.selectionStart, e:el.selectionEnd };
    }catch(_){ return null; }
  }
  function _useRestore(f,top){
    try{
      const w=document.querySelector('.bond-ol1-wrap');
      if(w && top) w.scrollTop=top;
    }catch(_){}
    if(!f) return;
    try{
      const el=document.querySelector('[data-u="'+f.k+'"]');
      if(!el) return;
      el.focus();
      if(f.s!=null && el.setSelectionRange) el.setSelectionRange(f.s,f.e);
    }catch(_){}
  }
  /* ============================================================
     📥 IMPORT X TỪ EXCEL  ·  📋 DÁN TỪ EXCEL   (v4.108)
     ------------------------------------------------------------
     Bố cục file KH (sheet "일자별 C3사용량 (예상 및 실적)"):
        cột NGÀY   = ngày trong tháng 1..31, KHÔNG phải ngày đầy đủ
        cột PLAN   = 관세유예 C3사용량 (kế hoạch)
        cột ACTUAL = 관세유예 C3사용량 (thực hiện)
     ⭐ CÁCH GHÉP: lấy ACTUAL từ đầu tháng cho tới NGÀY ĐẦU TIÊN THIẾU ACTUAL,
     từ ngày đó trở đi lấy PLAN cho hết tháng và KHÔNG quay lại actual nữa —
     đúng cách người dùng đọc file. Kết quả ghi vào ô X, kèm cờ nguồn `xs`
     ('a' actual · 'p' plan · 'm' gõ tay) để bảng phân biệt được; số plan gốc
     luôn giữ nguyên ở `xp` để đối chiếu.
     ⚠ Ngày người dùng ĐÃ GÕ TAY (`xs==='m'`) mặc định KHÔNG bị đè.
  ============================================================ */
  function pickFile(){ const f=_el('bondOl1File'); if(f){ f.value=''; f.click(); } }
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
        _say('📥 Read '+f.name+' — check the columns, then click APPLY','ok');
      }catch(err){ console.warn('[BOND] import',err); _say('❌ Could not read the file: '+err.message,'er'); }
    };
    rd.readAsArrayBuffer(f);
  }
  function _aoaOf(name){
    const sh=(_wb&&_wb.Sheets)?_wb.Sheets[name]:null;
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
  function pasteOpen(){ _paste=true; _imp=null; _renderImp();
    setTimeout(()=>{ const t=_el('bondPasteTxt'); if(t) t.focus(); },40); }
  function pasteCancel(){ _paste=false; _renderImp(); }
  function pasteRead(){
    const t=_el('bondPasteTxt');
    const txt=(t&&t.value)||'';
    if(!txt.trim()){ _say('⚠ Nothing pasted yet','warn'); return; }
    const aoa=txt.replace(/\r/g,'').split('\n').filter(l=>l.trim()!=='')
                 .map(l=>l.split('\t').map(c=>{ const n=_num(c);
                   return (n!=null&&String(c).trim()!=='')?n:c; }));
    try{
      _paste=false;
      _imp=_prepImp(aoa,'(pasted from Excel)','',[]);
      _renderImp();
      _say('📋 Read '+_imp.body.length+' row(s) — check the columns, then click APPLY','ok');
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
      const k=r.filter(c=>typeof c==='string'&&String(c).trim()).length;
      if(k>best){ best=k; hdr=i; }
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
    if(aCol===pCol && aCol>=0){ if(aBest>=pBest) pCol=-1; else aCol=-1; }
    /* tháng áp dụng: lấy từ tiêu đề "8월" nếu có, không thì tháng đang xem */
    let month=_olM();
    const title=String((rows[0]||[]).join(' ')+' '+sheet).match(/(\d{1,2})\s*월/);
    if(title){ const mm=+title[1];
      if(mm>=1&&mm<=12) month=month.slice(0,4)+'-'+String(mm).padStart(2,'0'); }
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
    const st=String(v).trim();
    let m=st.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=st.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){ let y=m[3]; if(y.length===2) y='20'+y;
      return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
    return '';
  }
  function impSet(field,val){
    if(!_imp) return;
    if(field==='sheet'){
      try{ const keep=_imp.name; _imp=_prepImp(_aoaOf(val),keep,val,_imp.sheets); }
      catch(err){ _say('❌ This sheet cannot be read: '+err.message,'er'); }
    }
    else if(field==='unit'||field==='month') _imp[field]=val;
    else if(field==='ow') _imp.ow=!!val;
    else _imp[field]=(+val);
    _renderImp();
  }
  function impCancel(){ _imp=null; _paste=false; _renderImp(); }
  /* danh sách ngày + giá trị sau khi ghép actual → plan (dùng cả cho xem trước) */
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
      list.push({ d:d, a:(aCol>=0?_num(r[aCol]):null), p:(pCol>=0?_num(r[pCol]):null) });
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
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const { dCol, dayCol, aCol, pCol, unit, ow }=_imp;
    if(dCol<0&&dayCol<0){ _say('⚠ No Date column detected','warn'); return; }
    if(aCol<0&&pCol<0){ _say('⚠ Pick at least one number column (Actual or Plan)','warn'); return; }
    const f=(unit==='kg')?1:1000;
    const R=_impRows();
    const pay={};
    let na=0, np=0, skip=0, keep=0;
    R.forEach(o=>{
      const u=Object.assign({ t:'', x:'', xp:'', note:'' },USE[o.d]||{});
      if(o.p!=null) u.xp=Math.round(o.p*f);          /* giữ plan gốc để đối chiếu */
      if(o.v==null) skip++;
      else if(u.xs==='m' && !ow) keep++;             /* đã gõ tay → không đè */
      else{
        u.x=Math.round(o.v*f); u.xs=o.src;
        if(o.src==='a') na++; else np++;
      }
      USE[o.d]=u; pay[FB_USE+'/'+o.d]=u;
    });
    const firstPlan=(R.filter(o=>o.src==='p'&&o.v!=null)[0]||{}).d;
    _push(pay,'OL1 import '+R.length+' days');
    if(R.length){ const m=_el('bondOl1Month'); if(m) m.value=_ym(R[0].d); }
    _imp=null; _paste=false; _renderImp(); _renderUse(); render();
    _say('📥 X loaded: '+na+' ACTUAL day(s)'+(np?(' · '+np+' PLAN day(s)'):'')+
         (firstPlan?(' (plan from '+_dmy(firstPlan)+')'):'')+
         (keep?(' · kept '+keep+' hand-keyed day(s)'):'')+
         (skip?(' · '+skip+' day(s) with no figure'):''),'ok');
  }
  function _renderImp(){
    const box=_el('bondOl1Imp'); if(!box) return;
    if(_paste){
      box.style.display='';
      box.innerHTML=
        '<div class="bond-hint"><b>📋 Paste from Excel</b> — select the range in Excel '+
        '(include the header row if you can), Ctrl+C, then Ctrl+V into the box below and click <b>READ</b>.</div>'+
        '<textarea id="bondPasteTxt" class="bond-paste" rows="6" '+
        'placeholder="Paste here… one row per day, columns separated by Tab"></textarea>'+
        '<div class="bond-frow">'+
          '<button class="bond-btn accent" onclick="BOND.pasteRead()">✔ READ</button>'+
          '<button class="bond-btn" onclick="BOND.pasteCancel()">Cancel</button>'+
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
      '<div class="bond-hint"><b>📥 '+_esc(_imp.name)+'</b>'+
      (_imp.sheet?(' · sheet <b>'+_esc(_imp.sheet)+'</b>'):'')+' — '+_imp.body.length+' row(s). '+
      'The app takes <b>ACTUAL</b> up to the first day with no figure, and <b>PLAN</b> from there on. '+
      'The result goes into the <b>X</b> cell and is tagged so the table shows which is which.</div>'+
      '<div class="bond-frow">'+
        (_imp.sheets&&_imp.sheets.length>1
          ? ('<label>Sheet</label><select onchange="BOND.impSet(\'sheet\',this.value)">'+
             _op(_imp.sheets.map(n=>({v:n,l:n})),_imp.sheet)+'</select>')
          : '')+
        (_imp.dCol>=0
          ? ('<label>Date column</label><select onchange="BOND.impSet(\'dCol\',this.value)">'+
             _op(none.concat(opts),_imp.dCol)+'</select>')
          : ('<label>Day column (1–31)</label><select onchange="BOND.impSet(\'dayCol\',this.value)">'+
             _op(none.concat(opts),_imp.dayCol)+'</select>'+
             '<label>Month</label><input type="month" value="'+_esc(_imp.month)+'"'+
             ' onchange="BOND.impSet(\'month\',this.value)">'))+
        '<label>ACTUAL column</label><select onchange="BOND.impSet(\'aCol\',this.value)">'+
          _op(none.concat(opts),_imp.aCol)+'</select>'+
        '<label>PLAN column</label><select onchange="BOND.impSet(\'pCol\',this.value)">'+
          _op(none.concat(opts),_imp.pCol)+'</select>'+
        '<label>Unit</label><select onchange="BOND.impSet(\'unit\',this.value)">'+
          _op([{v:'T',l:'MT'},{v:'kg',l:'kg'}],_imp.unit)+'</select>'+
        '<label class="bond-ow" title="By default a hand-keyed day is NOT overwritten by the file">'+
          '<input type="checkbox"'+(_imp.ow?' checked':'')+
          ' onchange="BOND.impSet(\'ow\',this.checked)"> overwrite hand-keyed days</label>'+
        '<button class="bond-btn accent" onclick="BOND.impApply()">✔ APPLY</button>'+
        '<button class="bond-btn" onclick="BOND.impCancel()">Cancel</button>'+
      '</div>'+
      '<div class="bond-hint'+(R.length?'':' bad')+'">'+
        (R.length
          ? ('Will load <b>'+R.filter(o=>o.v!=null).length+'</b> day(s): <b>'+nA+'</b> actual'+
             (la?(' up to '+_dmy(la)):'')+' · <b>'+nP+'</b> plan'+(fp?(' from '+_dmy(fp)):'')+'.')
          : 'No date recognised — pick the date column again.')+'</div>';
  }

  function _renderUse(){
    const tb=_el('bondOl1Body'); if(!tb) return;
    const _f=_useFocus();
    let _top=0;
    try{ const w=document.querySelector('.bond-ol1-wrap'); if(w) _top=w.scrollTop; }catch(_){}
    const M=_olM(), A=_asOf();
    const uh=_el('bondOl1UnitH'); if(uh) uh.textContent=(_olUnit==='kg'?'kg':'MT');
    const days=Object.keys(USE).filter(d=>_ym(d)===M).sort();
    if(!days.length){
      tb.innerHTML='<tr><td colspan="7" class="bond-empty">'+M+' has no day yet — '+
        'click <b>📅 Fill month</b>.</td></tr>';
      const f=_el('bondOl1Tot'); if(f) f.innerHTML='';
      _useRestore(_f,_top); return;
    }
    /* ⭐ NGÀY TƯƠNG LAI CHẠY MỨC TẠM TÍNH — đây là thứ cho ra cột "Dự kiến
       hết" của lô P/X. Ô TỔNG để trống (hoặc đang là 0) thì hiện chữ mờ
       "tạm 2.000" ngay trong ô, và cột P tính theo mức đó, chữ nghiêng mờ để
       phân biệt với số thật. Gõ số vào là số thật đè lên ngay. */
    const AVGX=_avgRate('X');
    let sT=0,sX=0,sP=0,nDef=0,nFut=0;
    tb.innerHTML=days.map(d=>{
      const u=USE[d]||{}, raw=_totOf(u);
      const fut=(d>A);
      const dfl=(raw==null) || (fut && raw===0);   /* tương lai: 0 = chưa điền */
      const tot=dfl?DEF_TOT_KG:raw;
      const xTyped=_num(u.x);
      const x=fut?_xProj(u,AVGX):_xOf(u);
      const p=Math.max(0,tot-x);
      sT+=tot; sX+=x; sP+=p;
      if(dfl){ if(fut) nFut++; else nDef++; }
      const isA=(d===A);
      const cls=(isA?'bond-asof':'')+(fut?' bond-futrow':'')+((dfl&&!fut)?' bond-defrow':'');
      return '<tr class="'+cls+'">'+
        '<td class="bond-od">'+_dmy(d)+
          (isA?'<span class="bond-sub">data as of</span>'
              :(fut?'<span class="bond-sub">forecast</span>':''))+'</td>'+
        '<td><input class="bond-in n'+(dfl?' bond-asm':'')+'" data-u="'+d+'|t" inputmode="decimal" placeholder="'+
          (dfl?('assumed '+_fromKgTxt(DEF_TOT_KG)):'')+'"'+
          (dfl?(' title="No TOTAL P+X keyed in — running on the assumed '+_fromKgTxt(DEF_TOT_KG)+
                ' so the run-out date can still be projected. Type the real figure and it takes over."'):'')+
          ' value="'+_esc((raw==null||dfl)?'':_fromKg(raw))+'"'+
          ' onchange="BOND.setUse(\''+d+'\',\'t\',this.value)"></td>'+
        '<td><input class="bond-in n" data-u="'+d+'|x" inputmode="decimal" value="'+_esc(xTyped==null?'':_fromKg(xTyped))+'"'+
          (fut&&xTyped==null?' placeholder="plan '+_fromKgTxt(x)+'"':'')+
          ' onchange="BOND.setUse(\''+d+'\',\'x\',this.value)"></td>'+
        '<td class="n '+(dfl?'bond-asm':'bond-dim')+'">'+_fromKgTxt(p)+'</td>'+
        '<td class="c">'+_srcTag(u,fut)+'</td>'+
        '<td><input class="bond-in" data-u="'+d+'|note" value="'+_esc(u.note||'')+'"'+
          ' onchange="BOND.setUse(\''+d+'\',\'note\',this.value)"></td>'+
        '<td class="c"><span class="bond-del" onclick="BOND.delUseRow(\''+d+'\')">✕</span></td></tr>';
    }).join('');
    const f=_el('bondOl1Tot');
    if(f) f.innerHTML='<b>Σ '+days.length+' days</b> · TOTAL '+_fromKgTxt(sT)+' · X '+_fromKgTxt(sX)+
      ' · P '+_fromKgTxt(sP)+
      (nDef?(' · <span class="bond-warnt">⚠ '+nDef+' PAST day(s) with no TOTAL</span>'):'')+
      (nFut?(' · <span class="bond-asmt">'+nFut+' day(s) ahead on the assumed '+
             _fromKgTxt(DEF_TOT_KG)+'</span>'):'');
    _useRestore(_f,_top);
  }
  /* ⭐ NGUỒN CỦA SỐ X — ba loại, phải nhìn ra ngay là số thật hay số kế hoạch:
       Actual  · lấy từ cột thực hiện của file           (xanh)
       Plan    · lấy từ cột kế hoạch của file            (cam)
       Keyed   · người dùng tự gõ — import KHÔNG đè lên  (xanh dương)
     Ô X trống ở ngày tương lai mà có plan trong file thì hiện Plan mờ. */
  function _srcTag(u,fut){
    const x=_num(u&&u.x), xp=_num(u&&u.xp), xs=String((u&&u.xs)||'');
    if(x==null){
      return xp!=null
        ? '<span class="bond-src p dim" title="Only a plan figure exists for this day">Plan</span>'
        : '<span class="bond-dim">—</span>';
    }
    if(xs==='m') return '<span class="bond-src m" title="Typed in by hand — an Excel import will not overwrite it">Keyed</span>';
    if(xs==='p') return '<span class="bond-src p" title="PLAN figure loaded from the Excel file">Plan</span>';
    return '<span class="bond-src a" title="ACTUAL figure loaded from the Excel file">Actual</span>';
  }
  function _fromKgTxt(kg){
    return _olUnit==='kg' ? Math.round(kg).toLocaleString('en-US')
                          : (kg/1000).toLocaleString('en-US',{maximumFractionDigits:3});
  }

  /* ============================================================
     KHUNG NHÌN
  ============================================================ */
  function setMode(m){
    _mode=(m==='knq')?'knq':'raw';
    const raw=_el('spViewRaw'), knq=_el('spViewKnq');
    if(raw) raw.style.display=(_mode==='raw')?'':'none';
    if(knq) knq.style.display=(_mode==='knq')?'':'none';
    ['bondModeRaw','bondModeKnq'].forEach(id=>{ const b=_el(id); if(b) b.classList.remove('on'); });
    const on=_el(_mode==='raw'?'bondModeRaw':'bondModeKnq'); if(on) on.classList.add('on');
    if(_mode==='knq'){
      onEnter();
    }else{
      try{ if(SP && SP.table) SP.rebuildTableData(); }catch(_){}
    }
  }
  /* ⭐ HAI NÚT XEM = ICON, KHÔNG ĐỔI KÝ HIỆU ─────────────────────
     Ký hiệu đứng yên để người dùng nhớ VỊ TRÍ nút; trạng thái nói bằng
     lớp .on (nút sáng lên = thứ đó đang HIỆN) và bằng tooltip. Đổi cả
     chữ lẫn nghĩa như bản cũ làm nút nhảy chỗ mỗi lần bấm. */
  function _paintView(){
    const c=_el('bondCardsBtn');
    if(c){ try{ c.className='bond-ico'+(_cardsOpen?' on':''); }catch(_){}
      c.title=_cardsOpen ? 'Summary cards are showing — click to collapse them and give the table more height'
                         : 'Summary cards are collapsed — click to show them'; }
    const s2=_el('bondSlimBtn');
    if(s2){ try{ s2.className='bond-ico'+(_slim?'':' on'); }catch(_){}
      s2.title=_slim ? 'Init / GR / GI / Trs are hidden — click to bring every SAP column back'
                     : 'All SAP columns are showing — click to keep only End Stock and stop the sideways scrolling'; }
  }
  function toggleCards(){ _cardsOpen=!_cardsOpen; _paintView(); _renderCards(); }
  function toggleSlim(){ _slim=!_slim; _paintView(); _build(); }
  function onMonth(){ const e=_el('bondMonth'); if(!e) return;
    _month=e.value||_ym(_asOf());
    if(_arch) closePeriod(); else render(); }
  function _fillPeriodSel(){
    const s=_el('bondPerSel'); if(!s) return;
    const cur=s.value;
    const ks=Object.keys(PERIODS).sort().reverse();
    s.innerHTML='<option value="">Saved periods…</option>'+
      ks.map(k=>'<option value="'+k+'">'+k+' · '+(PERIODS[k].n||0)+' batches · '+
        _esc(PERIODS[k].savedAt||'')+'</option>').join('');
    if(cur && PERIODS[cur]) s.value=cur;
  }

  function render(){
    if(!_el('bondGrid')) return;
    recalc();
    _refill();
    _paintView();
    _renderCards();
    _renderAlerts();
    _fillPeriodSel();
    _arcBtn();
    /* v4.118 — dọn những lô đã xong hẳn. Chạy SAU khi đã vẽ, và tự im lặng
       khi chưa tới hạn hoặc khi số SAP chưa đáng tin. */
    _autoArchive();
    const m=_el('bondMonth'); if(m && !m.value) m.value=_month||_ym(_asOf());
    const n=_el('bondCount');
    if(n) n.textContent=(filterOn()?(_rows.length+'/'+_all.length):(_all.length))+' batches'+
      (_arch?(' · period '+_arch.M):'');
    const c=_el('bondFClr'); if(c) c.style.display=filterOn()?'':'none';
    _seqToast();
  }

  /* ⭐ TOAST BÁO MÃ BATCH ĐẶT NGƯỢC ────────────────────────────
     Dải cảnh báo đã nói rồi, nhưng dải đó có thể đang thu gọn hoặc trôi
     khỏi màn hình. Một cái toast khi VỪA phát hiện ra là thứ chắc chắn
     nhân viên nhìn thấy. Chỉ kêu khi TẬP HỢP NHÓM ĐẢO ĐỔI — mở tab lại,
     gõ một ô, F5 thì không kêu lại, kẻo thành tiếng ồn rồi bị lờ đi. */
  let _seqSaid='';
  function _seqToast(){
    const g={};
    _all.forEach(r=>{ if(r.seq==='swap') g[r.seqGrp]=1; });
    const sig=Object.keys(g).sort().join(';');
    if(sig===_seqSaid) return;
    _seqSaid=sig;
    if(!sig) return;
    const first=_all.filter(r=>r.seq==='swap').sort((a,b)=>a.ord-b.ord)[0];
    _say('⇅ Batch codes issued out of order — '+(first?first.bcode:'')+
         ' got in first, so it is drawn out before the lower code. Check the Get in date column.','warn');
  }

  function onEnter(){
    if(!_month) _month=_ym(_asOf());
    if(!_initDone){
      _initDone=true;
      const m=_el('bondMonth'); if(m) m.value=_month;
      _load().then(()=>render()).catch(e=>{ console.warn('[BOND] load',e); render(); });
      return;
    }
    render();
  }
  function init(){ /* lazy — không đọc gì cho tới khi bật sang chế độ KNQ */ }

  /* ============================================================
     📤 XUẤT EXCEL — bản chốt của kỳ, đem lưu ngoài app
  ============================================================ */
  function exportXlsx(){
    if(typeof XLSX==='undefined'){ _say('❌ The XLSX library is not loaded','er'); return; }
    recalc();
    const M=_month||_ym(_asOf());
    const H=['Voyage no.','Vessel','Import decl.','Get in date','Get-out decl.',
             'Date','SLoc','Mat','Batch','Batch code','Init (kg)','GR','GI','Trs','End (kg)',
             'HQ approved (kg)','Actual left (kg)','%','Empty by','Days left',
             'VASSCM','VASSCM date','Note','Status','New batch','Missing details',
             'Order check','Draw order in batch date'];

    const A=[H].concat(_all.map(r=>[
      r.vno||'', r.vessel||'', r.dIn||'', _dmy(r.gIn), r.dOut||'',
      _dmy(r.date), '1100', r.mat||'', r.letter||'', r.bcode||'',
      _n(r.init), _n(r.gr), _n(r.gi), _n(r.trs), _n(r.end),
      _n(r.hqQty), _n(r.left), +(r.pct*100).toFixed(1),
      (r.eta?((r.projected?'≈ ':'')+_dmy(r.eta)):''), (r.projected&&r.etaDays!=null?r.etaDays:''),
      r.vas?'x':'', _dmy(r.vasDate), r.note||'',
      ST_NAME[r.st]||'', (r.isNew?'new':''), (r.noInfo?'missing':''),
      (r.seq==='swap'?'code out of order':(r.seq==='ask'?'get-in date missing':'')), (r.ord+1)
    ]));
    const o=_ol1Sum();
    A.push([]);
    A.push(['FEED OL1 '+M,'','','','from',_dmy(M+'-01'),'to',_dmy(_sapDay||_wantDay()),
            'TOTAL (kg)',Math.round(o.t),'P',Math.round(o.p),'X',Math.round(o.x),
            'days',o.n,'assumed',o.def]);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(A),'KNQ '+M);
    XLSX.writeFile(wb,'KNQ_'+M+'_SAP'+(_sapDay||'').replace(/-/g,'')+'.xlsx');
    _say('📤 Period '+M+' exported — keep this file as the signed-off record','ok');
  }

  return {
    init, onEnter, render, recalc, setMode,
    setInfo, delRow,
    savePeriod, openPeriod, closePeriod, delPeriod,
    /* v4.118 — kho lưu trữ + sổ theo dõi */
    openArch, closeArch, loadArchMonth, closeArchMonth, delArchMonth, delArchYear, archiveNow,
    openOl1, closeOl1, onOl1Month, onOl1Unit, setUse, addUseRow, fillMonth, delUseRow,
    toggleCards, toggleSlim, toggleAlerts, onMonth, exportXlsx,
    pickFile, fileChosen, pasteOpen, pasteRead, pasteCancel,
    impSet, impApply, impCancel,
    onFilter, clearFilter, filterOn,
    /* hook kiểm thử — không dùng trong app */
    _state:{ INFO, USE, WATCH, rows:()=>_rows, all:()=>_all, periods:()=>PERIODS,
             aidx:()=>AIDX, setAidx:v=>{ AIDX=v||{}; },
             arcTotal:_arcTotal, arcMonths:_arcMonths, arcCount:_arcCount,
             archYm:_archYm, archDueOf:_archDueOf, archPending:_archPending, archDue:_archDue,
             archiveRows:_archiveRows, autoArchive:_autoArchive, watchOk:_watchOk,
             syncWatch:_syncWatch, renderArch:_renderArch, arcM:()=>_arcM,
             ARCH_WAIT_DAYS,
             prevDay:()=>_prevDay, ST_NAME,
             setFilter:(q,m,l,st)=>{ _fq=(q||'').toLowerCase(); _fMat=m||''; _fLot=l||''; _fSt=st||''; },
             filter:()=>({q:_fq,mat:_fMat,lot:_fLot,st:_fSt}),
             asOf:_asOf, wantDay:_wantDay, sapDay:()=>_sapDay, behind:()=>_sapBehind,
             today:_today, pinToday:d=>{ _pinToday=d||''; },
             month:()=>_month, setMonth:m=>{ _month=m; },
             setArch:a=>{ _arch=a; }, arch:()=>_arch,
             batchDate:_batchDate, letterOf:_letterOf, key:_key,
             totOf:_totOf, useOf:_useOf, ol1Sum:_ol1Sum, hasInfo:_hasInfo,
             imp:()=>_imp, setImp:v=>{ _imp=v; _paste=false; },
             prepImp:_prepImp, impRows:_impRows, toIso:_toIso,
             pickSheet:_pickSheet, srcTag:_srcTag,
             DEF_TOT_KG, LOW_KG, loaded:()=>_loaded, markLoaded:()=>{ _loaded=true; },
             alerts:()=>_alerts, alOpen:()=>_alOpen,
             cardsOpen:()=>_cardsOpen, slim:()=>_slim }
  };
})();
window.BOND = BOND;
