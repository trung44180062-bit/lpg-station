/* ============================================================
 * LOADNOTIFY  —  loadnotify.js        (v4.84)
 * ------------------------------------------------------------
 * Global xuất ra : window.LOADNOTIFY
 * Phụ thuộc      : firebase (compat), _pfDeriveType (wgcheck.js),
 *                  CURRENT_USER (auth.js), toast (globals.js)
 * Khởi tạo (boot): KHÔNG cần init — thuần hàm, gọi từ scale.js
 * ------------------------------------------------------------
 *
 *  ★ FILE NÀY KHÔNG CHỨA VÀ KHÔNG BAO GIỜ ĐƯỢC CHỨA TOKEN CỦA BOT ★
 *
 *  Repo publish công khai trên GitHub Pages. Ai xem source cũng đọc được
 *  file này. Token lọt ra = người ngoài gửi tin giả danh nhà máy vào nhóm
 *  Zalo vận hành ("đổi tank gấp", "huỷ đơn"). Rủi ro thật, không lý thuyết.
 *
 *  Vì vậy trình duyệt KHÔNG BAO GIỜ gọi thẳng endpoint của Zalo Bot API
 *  (mà cũng không gọi được: domain đó không trả CORS header nào cả).
 *  Nó chỉ ghi một hàng đợi lên Firebase:
 *
 *      trình duyệt ──ghi──▶ Firebase  load_notify_q/<key>
 *                                        │
 *                            (mỗi 5 giây) ▼
 *                    Google Apps Script  ★ nơi DUY NHẤT giữ token
 *                                        │
 *                                        ▼
 *                              Zalo Bot API ──▶ nhóm "LPG LOADING"
 *
 * ------------------------------------------------------------
 * ⚠ VÌ SAO TÊN FILE / TÊN NHÁNH KHÔNG CÓ CHỮ "zalo"
 *   Bên phần mềm Chấm Công, file `js/21-zalo.js` bị proxy mạng công ty
 *   giết bằng HTTP 499 trong khi mọi file khác nạp bình thường. Đổi tên
 *   thành `21-notify.js` là hết. Giữ đúng quy ước đó ở đây: đường dẫn và
 *   tên nhánh Firebase tuyệt đối không chứa chuỗi "zalo".
 *
 * ------------------------------------------------------------
 * PHẠM VI (v4.84 — chốt với vận hành):
 *   Bắn 1 tin DUY NHẤT, NGAY khi một xe được assign vào station, và
 *   CHỈ khi product type KHÁC 50:50 (30:70, 20:80, Pure C3, Pure C4…).
 *     · Hàng 50:50            → im lặng (hàng phổ thông, không cần báo)
 *     · Sale Plan bỏ trống Type → im lặng (app mặc định 50:50 khi in phiếu)
 *   Không bắn tin lúc cân xong, không bắn tin trạng thái trung gian.
 *   Muốn mở rộng thì thêm kind mới, ĐỪNG nới lỏng bộ lọc này.
 *
 * NGUYÊN TẮC BẤT DI BẤT DỊCH: Zalo hỏng thì app phải chạy y như cũ.
 *   Mọi thứ trong file này bọc try/catch và trả về im lặng khi lỗi.
 *   Không được để lớp thông báo thành điểm chết của trạm cân.
 * ============================================================ */

const LOADNOTIFY = (function () {
  'use strict';

  /* Nhánh Firebase. KHÔNG nằm trong danh sách nhánh mà sync.js lắng nghe
     ⇒ không máy nào tải về, không phình localStorage, không tốn quota đọc.
     Apps Script đánh dấu state='sent' rồi tự dọn sau PURGE_DAYS ngày. */
  const Q_PATH    = 'load_notify_q';
  const STAT_PATH = 'load_notify_stat';

  /* ══════════════════════════════════════════════════════════
     PING — vì sao có dòng URL này ở đây
     ──────────────────────────────────────────────────────────
     Ghi Firebase xong là xong phần "không mất tin". Nhưng Apps Script
     không tự biết có hàng mới; nó chỉ biết khi được đánh thức.

     Cách hiển nhiên — để Apps Script quét mỗi 5 giây — KHÔNG dùng được:
     Apps Script có trần thời gian chạy trigger 90 phút/ngày (Gmail
     thường) hoặc 6 giờ/ngày (Workspace). Vòng lặp ngủ 5 giây tiêu 24
     giờ/ngày ⇒ cháy quota sau ~1 tiếng rưỡi rồi bot chết câm.

     Nên đảo chiều: ghi xong thì ĐẨY một cú ping rỗng sang Apps Script.
     Nó tỉnh dậy, quét, gửi. Độ trễ ~1–3 giây, tốt hơn cả mốc 5 giây, mà
     gần như không tốn quota. Trigger 1 phút bên Apps Script chỉ còn là
     lưới an toàn cho lúc ping không tới được.

     · mode:'no-cors' — script.google.com không trả CORS header, nhưng ta
       KHÔNG cần đọc phản hồi. no-cors + text/plain là "simple request",
       không có preflight, request vẫn được gửi đi thật.
     · Ping hỏng thì im lặng bỏ qua. Firebase đã giữ tin, trigger sẽ dọn.
     · URL này nằm trong repo công khai và KHÔNG phải bí mật: kẻ lạ biết
       nó chỉ kích được một lượt quét, KHÔNG chèn được nội dung tin —
       nội dung lấy từ Firebase, mà ghi vào Firebase phải đăng nhập và
       nằm trong users_whitelist. Apps Script cũng tự chặn ping dồn.
     · Đổi URL khi tạo deployment MỚI (New deployment). "New version"
       của deployment cũ thì URL giữ nguyên, không phải sửa dòng này.
     ══════════════════════════════════════════════════════════ */
  const PING_URL = 'https://script.google.com/macros/s/AKfycby84UJwi4Fl7LAn5_sH-fcF5ni08iAnJM3WBnD2zsc_yVNdG6ksspxFGXxbH0JCwctlBg/exec';

  /* Bật/tắt toàn cục, lưu ở localStorage của từng máy trạm cân.
     Tắt = app chạy y như trước khi có tính năng này, không mất gì. */
  const OFF_KEY = 'lnOff';

  function isOn() {
    try { return localStorage.getItem(OFF_KEY) !== '1'; } catch (_) { return true; }
  }
  function setOn(on) {
    try { localStorage.setItem(OFF_KEY, on ? '0' : '1'); } catch (_) {}
    try { if (typeof toast === 'function')
      toast(on ? '🔔 Đã BẬT thông báo Zalo hàng đặc biệt' : '🔕 Đã TẮT thông báo Zalo hàng đặc biệt',
            on ? 'ok' : 'er'); } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════
     PHÂN LOẠI HÀNG — bản sao độc lập của _scProdRatio (scale.js)
     ──────────────────────────────────────────────────────────
     Cố tình chép lại thay vì gọi sang scale.js: hàm gốc nằm trong
     closure của SCALE nên không truy cập được từ ngoài, và module này
     phải tự đứng được để test bằng node (tests/loadnotify.test.js).
     Cả hai cùng chuẩn hoá qua _pfDeriveType nên không thể lệch nhau.
     ══════════════════════════════════════════════════════════ */
  function prodRatio(t) {
    const norm = (typeof _pfDeriveType === 'function') ? _pfDeriveType(t || '') : String(t || '');
    const m = String(norm).match(/C3:(\d{1,3})\/C4:(\d{1,3})/i);
    if (m) return parseInt(m[1], 10) + ':' + parseInt(m[2], 10);
    if (/pure\s*propane/i.test(norm)) return 'Pure C3';
    if (/pure\s*butane/i.test(norm))  return 'Pure C4';
    return '';                     /* Sale Plan bỏ trống → coi như 50:50 */
  }
  function isSpecial(t) {
    const r = prodRatio(t);
    return r !== '' && r !== '50:50';
  }

  /* ── tiện ích ─────────────────────────────────────────────── */
  const p2 = n => String(n).padStart(2, '0');
  function isoToday(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function stampVN(d) {
    d = d || new Date();
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear()
         + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  /* Đánh thức Apps Script. Fire-and-forget: không đọc phản hồi, không chờ,
     không để lỗi lọt ra ngoài. Xem khối chú thích PING ở đầu file. */
  function ping() {
    try {
      if (!PING_URL || typeof fetch !== 'function') return;
      fetch(PING_URL + '?ping=1', {
        method : 'POST',
        mode   : 'no-cors',
        cache  : 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body   : '{"__ping":1}'
      }).catch(function () {});
    } catch (_) {}
  }

  /* Firebase key hợp lệ: bỏ . $ # [ ] / và mọi ký tự lạ. */
  function safeKey(s) {
    return String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 60);
  }
  const txt = v => {
    const s = String(v == null ? '' : v).trim();
    return s || '—';
  };

  /* ══════════════════════════════════════════════════════════
     KHOÁ CHỐNG TRÙNG (quy tắc R6)
     ──────────────────────────────────────────────────────────
     ngày + station + turn + DO. Cùng một lượt cân chỉ vào hàng đợi
     đúng 1 lần dù staff bấm assign lại, dù sync đẩy lại sự kiện.
     Ghi bằng transaction "chỉ set khi node còn trống" nên kể cả 2 máy
     trạm cân bấm cùng lúc cũng chỉ ra 1 tin.
     ══════════════════════════════════════════════════════════ */
  function buildKey(stId, st) {
    const doStr = String((st && (st.doNum || st._oid)) || '').trim();
    return isoToday().replace(/-/g, '') + '_st' + safeKey(stId)
         + '_t' + safeKey(String((st && st.turn) || 0)) + '_' + safeKey(doStr);
  }

  /* ══════════════════════════════════════════════════════════
     DỰNG THÂN TIN — TIẾNG ANH (chốt với vận hành)
     ──────────────────────────────────────────────────────────
     Trình duyệt dựng chữ vì nó có sẵn dữ liệu. Apps Script chỉ ghép
     lại và gửi — giữ phía máy chủ càng "ngu" càng tốt, sửa câu chữ về
     sau chỉ phải sửa ở đây, KHÔNG phải deploy lại Apps Script.
     Dòng đầu là kết luận (đọc preview 1 giây là hiểu), dòng cuối là
     việc phải làm.
     ══════════════════════════════════════════════════════════ */
  function buildLines(stId, st, row) {
    st  = st  || {};
    row = row || {};
    const ratio    = prodRatio(st.type || row.type);
    const contract = String(st.type || row.type || '').trim();
    const qty      = String(st.qty || row.qty || '').trim();
    const eng = (document.getElementById('scEngineer') || {}).value || '';
    const chk = (document.getElementById('scCheckBooth') || {}).value || '';
    const by  = (window.CURRENT_USER && (window.CURRENT_USER.name || window.CURRENT_USER.email)) || '';

    const L = [];
    L.push('Station ' + stId + '  ·  Turn ' + txt(st.turn) + '  ·  ' + stampVN());
    L.push('');
    L.push('PRODUCT TYPE : ' + ratio + '   <-- NOT 50:50');
    L.push('Contract     : ' + txt(contract));
    L.push('Customer     : ' + txt(st.customer || row.customer));
    L.push('DO No.       : ' + txt(st.doNum || st._oid || row.doNum));
    L.push('Loading qty  : ' + (qty ? qty + ' ton' : '—'));
    L.push('Tank         : ' + txt(st.tank));
    L.push('Batch / Lot  : ' + txt(st.batch));
    L.push('');
    L.push('Truck        : ' + txt(st.plate || row.plate));
    L.push('Rmooc        : ' + txt(st.rmooc || row.rmooc || row.romooc));
    L.push('Driver       : ' + txt(st.driver || row.driver));
    L.push('');
    const tol = String(st.tolerance || row.tolerance || row.maxTol || '').trim();
    if (tol) L.push('Max tolerance: ' + tol);
    L.push('Engineer     : ' + txt(eng));
    L.push('Check booth  : ' + txt(chk));
    if (String(st.note || '').trim()) L.push('Note         : ' + String(st.note).trim());
    L.push('Assigned by  : ' + txt(by));
    return L;
  }

  /* ══════════════════════════════════════════════════════════
     ĐẨY MỘT TIN VÀO HÀNG ĐỢI
     Gọi từ scAssignToStation() ở scale.js, NGAY SAU setSt().
     Đây là điểm hook DUY NHẤT — đừng thêm đường thứ hai, mọi lối
     assign (search click, queue 📍, multi-DO picker, waitPop) đều đã
     chạy qua scAssignToStation nên một hook là đủ phủ hết.
     ══════════════════════════════════════════════════════════ */
  function onAssign(stId, st, row) {
    try {
      if (!isOn())                        return false;
      if (!st)                            return false;
      if (!isSpecial(st.type || (row && row.type))) return false;   /* 50:50 & trống → im lặng */
      if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return false;

      const key   = buildKey(stId, st);
      const ratio = prodRatio(st.type || (row && row.type));
      const item = {
        kind      : 'special_type_assign',
        title     : '⚠️ SPECIAL PRODUCT — NOT 50:50',
        lines     : buildLines(stId, st, row),
        action    : 'Check tank / lot / COQ before weighing.',
        pri       : 'now',
        state     : 'pending',
        tries     : 0,
        station   : String(stId),
        turn      : String(st.turn || ''),
        doNum     : String(st.doNum || st._oid || ''),
        plate     : String(st.plate || ''),
        ratio     : ratio,
        by        : (window.CURRENT_USER && (window.CURRENT_USER.email || window.CURRENT_USER.name)) || '',
        createdAt : Date.now(),
        createdIso: isoToday()
      };

      /* transaction: chỉ ghi khi node còn TRỐNG. Trả về undefined = huỷ
         giao dịch ⇒ assign lại lần 2 không tạo tin thứ hai (R6). */
      firebase.database().ref(Q_PATH + '/' + key)
        .transaction(cur => (cur === null ? item : undefined))
        .then(res => {
          if (res && res.committed) {
            ping();                       /* ghi xong mới đánh thức courier */
            try { if (typeof toast === 'function')
              toast('📤 Đã gửi thông báo Zalo: hàng ' + ratio + ' → Station ' + stId, 'ok'); } catch (_) {}
          }
          /* Không committed = bản ghi đã tồn tại (assign lại lần 2). Không
             ping: hoặc courier đã gửi rồi, hoặc nó vẫn đang nằm chờ và ping
             của lần đầu đã lo. */
        })
        .catch(e => console.warn('[LOADNOTIFY] không ghi được hàng đợi', e));
      return true;
    } catch (e) {
      console.warn('[LOADNOTIFY] bỏ qua lỗi, app vẫn chạy bình thường', e);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     TIỆN ÍCH KIỂM TRA — gọi tay trong Console (F12)
     ══════════════════════════════════════════════════════════ */

  /* LOADNOTIFY.sendTest()  → bắn 1 tin thử vào nhóm, không cần xe thật.
     Dùng để nghiệm thu đường truyền Firebase → Apps Script → Zalo. */
  function sendTest() {
    try {
      if (typeof firebase === 'undefined') { console.warn('chưa có firebase'); return; }
      const key = 'TEST_' + Date.now();
      firebase.database().ref(Q_PATH + '/' + key).set({
        kind: 'test', title: '🧪 TEST — LPG LOADING BOT',
        lines: ['This is a connection test from V4.', 'Time: ' + stampVN()],
        action: 'No action required.',
        pri: 'now', state: 'pending', tries: 0,
        createdAt: Date.now(), createdIso: isoToday()
      }).then(() => { ping(); console.log('[LOADNOTIFY] đã đẩy tin thử + ping:', key); })
        .catch(e => console.warn('[LOADNOTIFY] đẩy tin thử lỗi', e));
    } catch (e) { console.warn(e); }
  }

  /* LOADNOTIFY.peek() → in hàng đợi hiện tại ra Console. */
  function peek() {
    try {
      firebase.database().ref(Q_PATH).once('value')
        .then(s => console.table(Object.entries(s.val() || {}).map(([k, v]) => ({
          key: k, state: v.state, station: v.station, ratio: v.ratio, plate: v.plate, tries: v.tries
        }))));
    } catch (e) { console.warn(e); }
  }

  /* LOADNOTIFY.quota(cb) → số tin đã gửi trong tháng (Apps Script ghi ngược).
     Gói free Zalo Bot: 3.000 tin/tháng. Hàng ≠50:50 rất ít nên không lo,
     nhưng vẫn theo dõi để phát hiện vòng lặp gửi hỏng. */
  function quota(cb) {
    try {
      const ym = new Date().toISOString().slice(0, 7);
      firebase.database().ref(STAT_PATH + '/' + ym).once('value')
        .then(s => (cb || console.log)(s.val() || { sent: 0, failed: 0 }))
        .catch(() => (cb || console.log)(null));
    } catch (_) { (cb || console.log)(null); }
  }

  return {
    onAssign, isOn, setOn,
    prodRatio, isSpecial, buildKey, buildLines,
    sendTest, peek, quota, ping,
    Q_PATH, STAT_PATH, PING_URL
  };
})();
window.LOADNOTIFY = LOADNOTIFY;

/* node/test export — trình duyệt bỏ qua nhánh này */
if (typeof module !== 'undefined' && module.exports) module.exports = LOADNOTIFY;
