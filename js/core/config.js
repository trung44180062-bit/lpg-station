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
      {k:'tankInspect',name:'Tank Inspect'},{k:'periodical',name:'Periodical Inspect'},
      {k:'chemTransport',name:'Chem. Transport'},{k:'insurance',name:'Insurance'},
      {k:'safetyValve',name:'Safety Valve'},{k:'pressureGauge',name:'Pressure Gauge'},
      {k:'tempGauge',name:'Temp. Gauge'}
    ]},
  tractor:{ label:'TRACTOR', icon:'🚛', kind:'vehicle', hasCap:false, safefill:null,
    certs:[{k:'periodical',name:'Periodical Inspect'},{k:'chemTransport',name:'Chem. Transport'},
      {k:'insurance',name:'Insurance'}]},
  rmooc:{ label:'RMOOC', icon:'🔗', kind:'vehicle', hasCap:true, safefill:'Rmooc',
    certs:[{k:'tankInspect',name:'Tank Inspect'},{k:'periodical',name:'Periodical Inspect'},
      {k:'chemTransport',name:'Chem. Transport'},{k:'safetyValve',name:'Safety Valve'},
      {k:'pressureGauge',name:'Pressure Gauge'},{k:'tempGauge',name:'Temp. Gauge'}]},
  driver:{ label:'DRIVER', icon:'👤', kind:'driver', hasCap:false, safefill:null,
    certs:[{k:'license',name:'Driver License'},{k:'fireSafety',name:'Fire Safety Cert'},
      {k:'hazmat',name:'Hazmat Transport'}]},
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
   DATA  (RAM mirror)
   Shape: DATA[tab] = { <rid>: {row...}, ... }  (keyed object, NOT array)
   Why keyed: lets Firebase multi-path update touch a single row/field
              without rewriting the whole tab.
   `rid` (row id) is a stable short id generated locally on create;
   `stt` (#) stays the hand-editable hard key as before.
   ============================================================ */
const DATA={ tanklorry:{}, tractor:{}, rmooc:{}, driver:{}, twavg:{} };

/* short stable id  (12-char base36 — collision-safe for this scale) */
function newRid(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2,6);
}

/* sample seed (only used if Firebase + localStorage both empty) */
const SAMPLE_ARR={
  tanklorry:[
    {stt:1,plate:'72C-10742',cap:31.70,tankInspect:'21/05/26',periodical:'06/05/26',chemTransport:'10/06/26',insurance:'30/06/26',safetyValve:'21/05/26',pressureGauge:'31/05/26',tempGauge:'31/05/26',remark:''},
    {stt:2,plate:'72C-07468',cap:24.46,tankInspect:'29/01/26',periodical:'09/01/26',chemTransport:'23/07/26',insurance:'31/03/26',safetyValve:'05/11/25',pressureGauge:'31/01/26',tempGauge:'01/11/25',remark:''},
    {stt:3,plate:'72H-06161',cap:35.25,tankInspect:'05/04/27',periodical:'19/09/26',chemTransport:'03/04/27',insurance:'07/10/26',safetyValve:'09/04/27',pressureGauge:'30/04/27',tempGauge:'09/04/27',remark:''},
    {stt:4,plate:'61H-06814',cap:29.34,tankInspect:'21/01/28',periodical:'27/05/26',chemTransport:'10/12/26',insurance:'11/12/26',safetyValve:'21/01/27',pressureGauge:'31/01/27',tempGauge:'31/01/27',remark:''},
    {stt:5,plate:'51D-42130',cap:24.00,tankInspect:'17/12/27',periodical:'03/11/26',chemTransport:'25/06/27',insurance:'22/09/26',safetyValve:'17/12/26',pressureGauge:'31/12/26',tempGauge:'31/12/26',remark:'P'}
  ],
  tractor:[
    {stt:1,plate:'70C-04755',periodical:'23/09/26',chemTransport:'11/09/26',insurance:'07/07/26',remark:'P'},
    {stt:2,plate:'43C-17735',periodical:'09/11/24',chemTransport:'09/11/24',insurance:'31/01/25',remark:'P'},
    {stt:3,plate:'50LD-19813',periodical:'28/07/26',chemTransport:'19/09/26',insurance:'21/10/26',remark:'P'}
  ],
  rmooc:[
    {stt:1,plate:'70R-00645',cap:43.00,tankInspect:'18/03/27',periodical:'12/11/26',chemTransport:'19/11/27',safetyValve:'20/10/26',pressureGauge:'31/10/26',tempGauge:'20/10/26',remark:'P'},
    {stt:2,plate:'43R-01664',cap:56.10,tankInspect:'05/04/26',periodical:'09/05/25',chemTransport:'09/11/24',safetyValve:'05/04/25',pressureGauge:'30/04/25',tempGauge:'30/04/25',remark:'P'}
  ],
  driver:[
    {stt:1,name:'Lê Thành Công',phone:'0933 174 285',license:'25/10/26',fireSafety:'22/10/26',hazmat:'17/03/25',remark:''},
    {stt:2,name:'Lưu Văn Đạt',phone:'0983 484 059',license:'25/09/28',fireSafety:'22/10/26',hazmat:'10/03/27',remark:''},
    {stt:3,name:'Nguyễn Hùng Anh',phone:'0933 254 755',license:'11/09/29',fireSafety:'01/09/27',hazmat:'04/03/27',remark:''}
  ],
  twavg:[
    {stt:1,truck:'15C-12556',rmooc:'',avgWt:19050,remark:''},
    {stt:2,truck:'15C-27584',rmooc:'29R-50975',avgWt:24210,remark:''},
    {stt:3,truck:'15C-27704',rmooc:'29R-50303',avgWt:23740,remark:''}
  ]
};

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
   ============================================================ */
