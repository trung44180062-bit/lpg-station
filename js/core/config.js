/* ============================================================
 * (configs)  —  config.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 8879–8983   (~105 dòng)
 * Global xuất ra : window.(configs)
 * Phase tách     : P2
 * Phụ thuộc      : —
 * Khởi tạo (boot): (hằng số, không init)
 * ------------------------------------------------------------
 * MÔ TẢ: Hằng số & cấu hình: firebaseConfig (dòng 8957, apiKey PUBLIC – được phép commit), CERT_DEFS (8879), DATA (8917), SAMPLE_ARR (8925), MN month-map (9510, đang nằm trong vùng fleet → chuyển về đây khi tách).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   firebaseConfig, CERT_DEFS, DATA, SAMPLE_ARR, MN
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module (configs) từ dòng 8879 đến 8983.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.(configs)).
 *   3) node --check config.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P2]: dán thân module (configs) (V4-54 dòng 8879–8983) vào đây. */

const CERT_DEFS={
  tanklorry:{ label:'TANK LORRY', icon:'🚚', kind:'vehicle', hasCap:true, safefill:'Rigid Truck',
    certs:[
      {k:'tankInspect',name:'Kiểm định bồn'},{k:'periodical',name:'Đăng kiểm'},
      {k:'chemTransport',name:'V/c nguy hiểm'},{k:'insurance',name:'Bảo hiểm'},
      {k:'safetyValve',name:'Van an toàn'},{k:'pressureGauge',name:'Đồng hồ áp'},
      {k:'tempGauge',name:'Đồng hồ nhiệt'}
    ]},
  tractor:{ label:'TRACTOR', icon:'🚛', kind:'vehicle', hasCap:false, safefill:null,
    certs:[{k:'periodical',name:'Đăng kiểm'},{k:'chemTransport',name:'V/c nguy hiểm'},
      {k:'insurance',name:'Bảo hiểm'}]},
  rmooc:{ label:'RMOOC', icon:'🔗', kind:'vehicle', hasCap:true, safefill:'Rmooc',
    certs:[{k:'tankInspect',name:'Kiểm định bồn'},{k:'periodical',name:'Đăng kiểm'},
      {k:'chemTransport',name:'V/c nguy hiểm'},{k:'safetyValve',name:'Van an toàn'},
      {k:'pressureGauge',name:'Đồng hồ áp'},{k:'tempGauge',name:'Đồng hồ nhiệt'}]},
  driver:{ label:'DRIVER', icon:'👤', kind:'driver', hasCap:false, safefill:null,
    certs:[{k:'license',name:'Bằng lái'},{k:'fireSafety',name:'An toàn PCCC'},
      {k:'hazmat',name:'Huấn luyện an toàn v/c hóa chất'}]},
  twavg:{ label:'TW AVG', icon:'⚖️', kind:'twavg', hasCap:false, safefill:null, certs:[] }
};
const FLEET_TABS=['tanklorry','tractor','rmooc','driver','twavg'];
let curTab='tanklorry', curFilt='all', curView='compact';

/* date-shaped field test: every cert field is a date.
   Plain text fields (plate, name, phone, remark, stt, cap, avgWt, truck, rmooc) are NOT. */
function isDateField(tab, field){
  const d = CERT_DEFS[tab]; if(!d) return false;
  return d.certs.some(c => c.k === field);
}

/* ============================================================
   BLOCK FLAG  (v4.80)  —  "⛔ BLOCK" column on every Fleet tab
   ------------------------------------------------------------
   Hỗ trợ trường hợp đặc biệt: nhà máy CẤM một xe / rmooc / tài xế
   nhận hàng (vi phạm an toàn, nợ hồ sơ, bị đình chỉ…). Staff tích
   chọn ô ⛔ BLOCK trên bảng Fleet và điền lý do; từ đó mọi nơi
   trong app (Plan grid, kết quả tìm kiếm trạm cân, thẻ trạm,
   panel Fleet Check, popup paste) đều hiện cảnh báo ⛔ kèm lý do,
   và assign vào trạm phải xác nhận 2 lần.

   Lưu trên Firebase như 2 field thường của row:
     blocked   : true | false   (tick)
     blockNote : string         (nội dung lý do cấm)
   KHÔNG phải date field → applyAndPush không normalize.
   ============================================================ */
const BLOCK_F = 'blocked';      /* boolean tick  */
const BLOCK_N = 'blockNote';    /* reason text   */
function isRowBlocked(row){ return !!(row && row[BLOCK_F]); }
function rowBlockNote(row){ return String((row && row[BLOCK_N]) || '').trim(); }

/* ============================================================
   DATA  (RAM mirror)
   Shape: DATA[tab] = { <rid>: {row...}, ... }  (keyed object, NOT array)
   Why keyed: lets Firebase multi-path update touch a single row/field
              without rewriting the whole tab.
   `rid` (row id) is a stable short id generated locally on create;
   `stt` (#) stays the hand-editable hard key as before.
   ============================================================ */
/* ============================================================
   APP_BUILD — SỐ HIỆU BẢN ĐANG CHẠY THẬT SỰ
   ------------------------------------------------------------
   v4.127 — phải NHÌN THẤY được bản nào đang chạy. Đã có lần cả ngày làm
   việc trôi qua với dải STOCK FORECAST chia sai Domestic/Export chỉ vì máy
   đó còn giữ index.html cũ trong cache: mã trên đĩa đã đúng từ v4.125,
   nhưng trình duyệt vẫn xin đúng những URL ?v=… của bản cũ. Sai kiểu đó
   KHÔNG có thông báo lỗi — số vẫn hiện ra, chỉ là sai.
   Số này hiện thành chip cạnh chữ "LPG SALES" và đối chiếu với thẻ
   <meta name="app-build"> của index.html; lệch nhau là kêu ngay.
   ⚠ Sửa mã thì bump SỐ NÀY + thẻ meta trong index.html + ?v=… của file vừa sửa.
   ============================================================ */
const APP_BUILD = '4.132';

const DATA={ tanklorry:{}, tractor:{}, rmooc:{}, driver:{}, twavg:{} };

/* short stable id  (12-char base36 — collision-safe for this scale) */
function newRid(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}

/* sample seed — EMPTIED (v4.x). Auto-seeding was removed so the app never
   pushes demo data to Firebase. Firebase is the single source of truth.
   Kept as an empty structure only so any legacy reference stays valid. */
const SAMPLE_ARR={ tanklorry:[], tractor:[], rmooc:[], driver:[], twavg:[] };

/* ============================================================
   FIREBASE config
   ============================================================ */
const firebaseConfig={
  apiKey:"AIzaSyAYv9rMg2i_LTwU_dBbVBZnFFZF0cNvM4A",
  authDomain:"hsvc-lpg-station.firebaseapp.com",
  databaseURL:"https://hsvc-lpg-station-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:"hsvc-lpg-station",
  storageBucket:"hsvc-lpg-station.firebasestorage.app",
  messagingSenderId:"860132003159",
  appId:"1:860132003159:web:fae1aa146a76690da4c212"
};

/* ============================================================
   ===============   SYNC CORE  (the important bit)  ==========
   ============================================================
   One module, reused by every page (Fleet now, Plan/Scale later).
   Rules of engagement:
     1. RAM is the live UI source. Mutations go RAM-first.
     2. localStorage is the offline cache. Written after every change.
     3. Firebase is the cross-machine truth. Written as a delta:
        only the changed fields, never the whole tab/array.
        Each write also bumps fleet_version (or area version).
     4. Inbound Firebase events are applied field-by-field through
        the same applyDelta() the local edits use — no destroy/rebuild,
        no stale "value" event replacing the whole node.
     5. Audit log DISABLED in v4.5.0 to save Firebase Spark quota.
        logAudit() is a no-op — calls are left in place so re-enabling
        later requires zero code changes in applyAndPush().
   ==================
   ============================================================ */
