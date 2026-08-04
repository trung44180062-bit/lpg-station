/* ============================================================
   ZALO BOT — CẦU NỐI PHÍA TRÌNH DUYỆT
   LPGT Cavern — Quản lý Công Ca v5.9
   ------------------------------------------------------------
   ★ FILE NÀY KHÔNG CHỨA VÀ KHÔNG BAO GIỜ ĐƯỢC CHỨA BOT TOKEN ★

   Repo publish công khai trên GitHub Pages. Bất kỳ ai xem source đều đọc
   được file này. Nếu token lọt ra, người ngoài gửi tin giả danh công ty tới
   toàn bộ nhân viên — "đơn đã duyệt", "đổi ca gấp". Rủi ro vận hành thật.

   Vì vậy trình duyệt KHÔNG BAO GIỜ gọi thẳng bot-api.zapps.me.
   Nó chỉ ghi một hàng đợi vào Firebase:

       trình duyệt ──ghi──▶ Firebase  <dbPath>/zaloQueue/<notifId>
                                          │
                              (mỗi phút)  ▼
                            Google Apps Script  ★ nơi duy nhất giữ token
                                          │
                                          ▼
                                    Zalo Bot API

   Xem PHUONG-AN-ZALO-BOT.md mục 2.1 và MA-TRAN-THONG-BAO.md.
   ------------------------------------------------------------
   NHÁNH zaloQueue NẰM NGOÀI ĐỐI TƯỢNG S
   02-storage.js chỉ đồng bộ các nhánh liệt kê trong FB_MAP_BRANCHES /
   FB_VAL_BRANCHES. zaloQueue không nằm trong đó nên:
     · không máy nào tải nó về  → không tốn băng thông gói Spark
     · không lọt vào localStorage → không phình dữ liệu máy nhân viên
     · Apps Script xoá bản ghi sau khi gửi → nhánh luôn gần như rỗng
   ============================================================ */

/* ---- Bật/tắt toàn cục. Tắt là app chạy y như trước, không mất gì. ---- */
function zaloOn(){
  return !(S.settings && S.settings.zaloOff);
}
function zaloSetOn(on){
  S.settings = S.settings || {};
  S.settings.zaloOff = !on;
  if (typeof save === 'function') save();
  if (typeof toast === 'function') toast(on ? 'Đã bật thông báo Zalo' : 'Đã tắt thông báo Zalo');
}

/* ============================================================
   MA TRẬN KÊNH — bảng dịch từ MA-TRAN-THONG-BAO.md
   'now'   = 🔴 bắn ngay
   'batch' = 🟡 xếp hàng, Apps Script gộp trong 10 phút rồi bắn 1 tin
   null    = ⚪ chỉ hiện trong app, KHÔNG tốn tin Zalo
   ============================================================ */
const ZALO_CHANNEL = {
  /* --- Nhóm A: cần người nhận bấm xác nhận --- */
  schedChange : 'now',      // A1 đổi ca mà không biết = đi làm sai giờ
  swapConfirm : 'now',      // A2 B không xác nhận thì đơn kẹt ở hàng duyệt
  coverConfirm: 'now',      // A3/A4 vai trò hay bị quên nhất

  /* --- Nhóm D: sự kiện trên lịch --- */
  event       : 'batch'     // D1 admin đã chủ động bấm gửi
};

/* Nhóm B & C đi chung kind:'info' nên phân biệt bằng trường phụ `zk`
   (zalo kind) do nơi gọi gắn thêm. Không có `zk` thì coi là tin phụ. */
const ZALO_INFO_CHANNEL = {
  /* Nhóm B — kết quả duyệt đơn */
  approved    : 'now',      // B3 kết quả cuối, ảnh hưởng lịch đi làm
  rejected    : 'now',      // B4 phải làm lại đơn
  revoked     : 'now',      // B5 lịch vừa bị đổi ngược
  cancelled   : 'batch',    // B6 đơn bị người khác huỷ
  fe          : null,       // B1 tin trung gian — QUY TẮC R1, chỗ cắt lớn nhất
  provapproved: null,       // B2 tin trung gian

  /* Nhóm C — phản hồi hai chiều giữa nhân viên */
  schedRevoke : 'now',      // C2 NV có thể đã gửi đơn theo thay đổi đó
  swapNo      : 'now',      // C4 A phải tìm người khác gấp
  coverNo     : 'now',      // C6 phải chọn người khác, không thì đơn kẹt
  schedDecline: 'batch',    // C1 QL cần biết để xếp người khác
  coverRemoved: 'batch',    // C7 họ đã sắp xếp lịch cá nhân theo đó rồi
  swapOk      : null,       // C3 tin tốt xuôi chiều
  coverOk     : null        // C5 tin tốt xuôi chiều
};

/* Khoá gộp: cùng người nhận + cùng khoá này trong 10 phút → gộp 1 tin. */
const ZALO_GROUP_KEY = {
  approved:'reqResult', rejected:'reqResult', revoked:'reqResult', cancelled:'reqResult',
  schedChange:'sched', schedRevoke:'sched', schedDecline:'sched',
  swapConfirm:'swap', swapNo:'swap',
  coverConfirm:'cover', coverNo:'cover', coverRemoved:'cover',
  event:'event'
};

/* Tiêu đề tin — dòng đầu phải là kết luận, liếc 1 giây là hiểu. */
const ZALO_TITLE = {
  schedChange : '📅 LỊCH LÀM VIỆC THAY ĐỔI',
  swapConfirm : '🔄 CÓ NGƯỜI XIN ĐỔI CA VỚI BẠN',
  coverConfirm: '🙋 BẠN ĐƯỢC NHỜ LÀM OT COVER',
  event       : '📢 THÔNG BÁO CHUNG',
  approved    : '✅ ĐƠN ĐÃ ĐƯỢC DUYỆT',
  rejected    : '❌ ĐƠN BỊ TỪ CHỐI',
  revoked     : '↩️ ĐƠN ĐÃ BỊ HUỶ DUYỆT',
  cancelled   : '🗑️ ĐƠN ĐÃ BỊ HUỶ',
  schedRevoke : '↩️ THAY ĐỔI LỊCH ĐÃ BỊ THU HỒI',
  schedDecline: '⚠️ NHÂN VIÊN HUỶ THAY ĐỔI LỊCH BẠN TẠO',
  swapNo      : '❌ ĐỔI CA BỊ TỪ CHỐI',
  coverNo     : '❌ OT COVER BỊ TỪ CHỐI',
  coverRemoved: 'ℹ️ BẠN ĐÃ ĐƯỢC GỠ KHỎI VAI TRÒ OT COVER'
};

/* Việc người nhận phải làm — dòng cuối, luôn phải có. */
const ZALO_ACTION = {
  schedChange : 'Vào app xác nhận hoặc huỷ thay đổi này.',
  swapConfirm : 'Vào app xác nhận hoặc từ chối.',
  coverConfirm: 'Vào app nhận hoặc từ chối OT cover.',
  rejected    : 'Xem lý do trong app và làm lại đơn nếu cần.',
  revoked     : 'Kiểm tra lại lịch đi làm trong app.',
  schedRevoke : 'Nếu bạn đã gửi đơn theo thay đổi này, vào app huỷ đơn.',
  swapNo      : 'Vào app chọn người khác.',
  coverNo     : 'Vào app chọn người cover khác.'
};

/* ============================================================
   ĐẨY MỘT THÔNG BÁO VÀO HÀNG ĐỢI
   Gọi từ newNotif() ở 13-portal.js. Bọc kín trong try/catch:
   Zalo hỏng thì app phải chạy y như cũ — nguyên tắc thiết kế bắt buộc,
   không được để Zalo thành điểm chết (PHUONG-AN-ZALO-BOT.md mục 3.2).
   ============================================================ */
function zaloEnqueue(n){
  try{
    if(!zaloOn())                     return;
    if(!n || !n.to || !n.id)          return;
    if(typeof firebase==='undefined') return;
    if(typeof fbRef==='undefined' || !fbRef) return;

    /* --- chọn kênh --- */
    const zk  = (n.kind==='info') ? (n.zk||'') : n.kind;
    const pri = (n.kind==='info') ? ZALO_INFO_CHANNEL[zk] : ZALO_CHANNEL[n.kind];
    if(!pri) return;                  // ⚪ APP-ONLY hoặc kind lạ → im lặng

    /* --- người nhận --- */
    const emp = (typeof empById==='function') ? empById(n.to) : null;
    if(!emp) return;                  // không tra được người thì thôi, đừng bắn mù

    /* --- nội dung --- */
    const lines = zaloLines(n, zk);
    if(!lines.length) return;

    const item = {
      to      : n.to,
      toName  : emp.name || n.to,
      title   : ZALO_TITLE[zk] || '🔔 THÔNG BÁO',
      lines   : lines,
      action  : ZALO_ACTION[zk] || '',
      group   : ZALO_GROUP_KEY[zk] || 'misc',
      pri     : pri,                  // now | batch
      notifId : n.id,
      state   : 'pending',
      createdAt: Date.now()
    };

    /* Khoá con = notifId → cùng một thông báo chỉ vào hàng đợi đúng 1 lần.
       Đây là quy tắc R6 chống trùng: 02-storage.js đồng bộ theo delta nên
       rất dễ kích hoạt lặp nếu dùng push() sinh khoá ngẫu nhiên. */
    fbRef.child('zaloQueue').child(n.id).set(item)
         .catch(e=>console.warn('[zalo] không ghi được hàng đợi', e));
  }catch(e){
    console.warn('[zalo] bỏ qua lỗi, app vẫn chạy bình thường', e);
  }
}

/* ============================================================
   DỰNG PHẦN THÂN TIN
   Trình duyệt dựng chữ vì nó có sẵn dữ liệu (tên người, mã ca, ngày).
   Apps Script chỉ ghép lại và gửi — giữ cho phía máy chủ càng ngu càng tốt,
   sửa chữ nghĩa về sau chỉ phải sửa ở đây, không phải deploy lại.
   ============================================================ */
function zaloLines(n, zk){
  const L = [];
  const nameOf = id => {
    const e = (typeof empById==='function') ? empById(id) : null;
    return (e && e.name) ? e.name : (id || '');
  };
  const day = iso => (typeof fmtVNfull==='function') ? fmtVNfull(iso)
                   : (typeof fmtVN==='function' ? fmtVN(iso) : iso);

  switch(zk){
    case 'schedChange':
      L.push('• ' + day(n.iso) + ' :  ' + (n.oldCode||'Nghỉ') + '  →  ' + (n.newCode||'Nghỉ'));
      if(n.from) L.push('Người sửa: ' + nameOf(n.from));
      break;

    case 'swapConfirm':
      L.push('Người xin đổi: ' + nameOf(n.from));
      if(n.iso) L.push('Ngày: ' + day(n.iso));
      break;

    case 'coverConfirm':
      L.push('Người nhờ: ' + nameOf(n.from));
      if(n.iso) L.push('Ngày: ' + day(n.iso));
      break;

    case 'event':
      if(n.text) L.push(n.text);
      if(n.iso)  L.push('Ngày: ' + day(n.iso));
      break;

    default:
      /* Nhóm B và C đã có sẵn câu chữ đầy đủ trong n.text
         (notifyReqParties ở 08-requests.js:867 dựng rồi). Dùng lại,
         chỉ bỏ phần emoji tiêu đề vì title đã nói rồi. */
      if(n.text) L.push(String(n.text).replace(/^[^\p{L}\p{N}]+/u,'').trim());
  }
  return L.filter(Boolean);
}

/* ============================================================
   ĐỒNG HỒ HẠN MỨC — đọc số liệu Apps Script ghi ngược lại
   Gói free Zalo Bot: 3.000 tin/tháng · 50 user. Ở 20 người dự kiến dùng ~11%.
   Hàm này để màn quản trị gọi; chưa gắn giao diện thì gọi tay trong console.
   ============================================================ */
function zaloQuota(cb){
  if(typeof fbRef==='undefined' || !fbRef){ cb && cb(null); return; }
  const ym = new Date().toISOString().slice(0,7);   // "2026-08"
  fbRef.child('zaloStat').child(ym).once('value')
    .then(s=>cb && cb(s.val() || {sent:0, failed:0}))
    .catch(()=>cb && cb(null));
}
