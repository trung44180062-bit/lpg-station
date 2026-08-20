/* ============================================================
 * BOND — bond.js   (v4.106) · KHO NGOẠI QUAN GỘP THẲNG VÀO TAB SAP
 * ------------------------------------------------------------
 * Tab: LPG Sales ▸ SAP ▸ nút gạt "🛃 Kho ngoại quan (KNQ)"
 * Global: window.BOND
 * Nạp: SAU sp.js (đọc SP.batch1100) và SAU knq.js (dùng chung node OL1).
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
 *          D/E · cột GI hoặc Trs ÂM ⇒ bằng chứng trực tiếp từ SAP
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
 *    ① Thêm cột của KNQ vào chính node sap_ — alloc.js / cav.js / plan.js /
 *      mthr.js đều đang đọc SP.ROWS, và thông tin hải quan sẽ nằm trong tầm
 *      với của nút 🗑 Range delete. knq_info là node RIÊNG vì lẽ đó.
 *    ② Vẽ lại toàn bộ innerHTML mỗi lần sửa một ô — đó chính là thứ làm tab
 *      KNQ cũ nuốt chữ khi đang gõ. Ở đây dùng Tabulator, sửa tại chỗ, đẩy
 *      đúng ô vừa sửa qua cellEdited, y như tab SAP vẫn làm.
 * ------------------------------------------------------------
 * BỐ CỤC CỘT (chốt của người dùng) — khối giữa GIỮ Y HỆT TAB SAP THÔ để
 * đối chiếu bằng mắt không phải dịch cột:
 *
 *   TRÁI  · nhận dạng, người dùng gõ : STT tàu · Tên tàu · TK nhập · TK xuất
 *   GIỮA  · nguyên văn SAP, chỉ đọc  : Date · SLoc · Mat · Batch · Batch code
 *                                      · Init · GR · GI · Trs · End
 *   PHẢI  · phần làm việc            : HQ approved · Thực còn · % · VASSCM
 *                                      · VASSCM date · Ghi chú
 * ------------------------------------------------------------
 * Firebase:
 *   knq_info/<mat>_<mã batch>   {vno,vessel,dIn,dOut,hqQty,vas,vasDate,note}
 *   knq_period/<YYYY-MM>        ảnh chụp cả bảng khi bấm 💾 Lưu kỳ
 *   knq_bonded/use/<YYYY-MM-DD> FEED OL1 — dùng chung với tab KNQ cũ
 * ============================================================ */
"use strict";

const BOND = (function(){

  /* ── hằng số ─────────────────────────────────────────────── */
  const FB_INFO = 'knq_info';
  const FB_PER  = 'knq_period';
  const FB_USE  = 'knq_bonded/use';
  const MATS    = ['C3','C4'];
  const LETTER_NAME = { P:'Petchem', X:'Export Petchem', D:'Domestic', E:'Export' };
  const DEF_TOT_KG  = 2000000;   /* ngày chưa gõ TỔNG P+X → tạm tính 2.000 T */
  const HORIZON     = 240;       /* chiếu tối đa bao nhiêu ngày về tương lai   */
  const AVG_DAYS    = 7;         /* bình quân mấy ngày để suy plan còn thiếu   */
  const WARN_DAYS   = 7;         /* dự kiến hết trong ≤ 7 ngày → tô cảnh báo   */
  const LOW_KG      = 200000;    /* còn dưới 200 T → cảnh báo sắp cạn        */
  const INFO_FIELDS = ['vno','vessel','dIn','dOut','hqQty','vas','vasDate','note'];
  /* ⭐ VÒNG ĐỜI MỘT LÔ — mỗi lô đúng MỘT trạng thái, đọc từ trên xuống là
     thấy luôn trình tự rút hàng (đã sắp C3→C4, D→E→P→X, cũ trên mới dưới). */
  const ST_NAME = { pumping:'Pumping', wait:'Not started', emptied:'Empty — no VASSCM',
                    zero:'Done', gone:'Not in SAP' };
  const ST_ICON = { pumping:'▶', wait:'○', emptied:'◍', zero:'✓', gone:'⛔' };

  /* ── trạng thái ──────────────────────────────────────────── */
  const INFO = {};               /* '<mat>_<bcode>' → bản ghi người dùng gõ  */
  const USE  = {};               /* 'YYYY-MM-DD'    → {t,x,xp,xs,note}       */
  let  PERIODS = {};             /* 'YYYY-MM'       → {savedAt,savedBy,…}    */

  let _table=null, _fb=null, _live=false, _loaded=false, _initDone=false;
  let _echo=0, _echoUntil=0;
  let _month='';                 /* KỲ đang xem — mặc định tháng của D-1     */
  let _mode='raw';               /* 'raw' | 'knq'                            */
  let _slim=false;               /* ẩn bớt cột Init/GR/GI/Trs cho bảng gọn   */
  let _cardsOpen=true;
  let _arch=null, _archM='';     /* kỳ đã lưu đang mở (chỉ đọc)              */
  let _rows=[];                  /* kết quả recalc gần nhất (ĐÃ lọc)         */
  let _all=[];                   /* trước khi lọc — dùng cho thẻ thống kê    */
  let _olUnit='T';
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
  function _today(){ const d=new Date();
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
      }).catch(e=>console.warn('[BOND] periods',e))
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
    const o={ t:0,x:0,p:0,n:0,def:0,miss:[] };
    for(let d=from; d && d<=to; d=_addDays(d,1)){
      const u=USE[d];
      if(!u){ o.miss.push(d); continue; }
      const raw=_totOf(u), dfl=(raw==null), tot=dfl?DEF_TOT_KG:raw, x=_xOf(u);
      o.n++; if(dfl) o.def++;
      o.t+=tot; o.x+=x; o.p+=Math.max(0,tot-x);
    }
    return o;
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
        vno:inf.vno||'', vessel:inf.vessel||'', dIn:inf.dIn||'', dOut:inf.dOut||'',
        hqQty:(inf.hqQty==null?'':inf.hqQty), vas:!!inf.vas, vasDate:inf.vasDate||'',
        note:inf.note||'',
        /* tính ra */
        left:null, used:null, pct:0, flag:'', st:'', pumping:false, isNew:false,
        noInfo:false, low:false, eta:'', etaDays:null, projected:false,
        inSap:true, hasInfo:_hasInfo(inf)
      });
    });

    /* ── ② lô đã khai mà SAP KHÔNG CÒN ───────────────────── */
    Object.keys(INFO).forEach(k=>{
      if(seen[k]) return;
      const inf=INFO[k]||{};
      if(!_hasInfo(inf)) return;                 /* bản ghi rỗng, bỏ qua */
      const i=k.indexOf('_'); if(i<0) return;
      const mat=k.slice(0,i), bcode=k.slice(i+1);
      rows.push({
        key:k, mat:mat, bcode:bcode, letter:_letterOf(bcode), bdate:_batchDate(bcode),
        date:'', sloc:'1100', init:null, gr:null, gi:null, trs:null, end:null,
        vno:inf.vno||'', vessel:inf.vessel||'', dIn:inf.dIn||'', dOut:inf.dOut||'',
        hqQty:(inf.hqQty==null?'':inf.hqQty), vas:!!inf.vas, vasDate:inf.vasDate||'',
        note:inf.note||'',
        left:null, used:null, pct:0, flag:'gone', st:'gone', pumping:false,
        isNew:false, noInfo:false, low:false, eta:'', etaDays:null, projected:false,
        inSap:false, hasInfo:true
      });
    });

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
        const q=rows.filter(r=>r.inSap && r.mat===mat && r.letter===L)
          .sort((a,b)=>{
            const ka=(a.bdate||'9999-12-31')+a.bcode, kb=(b.bdate||'9999-12-31')+b.bcode;
            return ka<kb?-1:(ka>kb?1:0);
          });
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
        if(head) head.pumping=true;

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
      if(r.inSap && !_isPX(r.letter) && (_n(r.gi)<0 || _n(r.trs)<0)) r.pumping=true;

      /* đã TỪNG có hàng chưa? lô luôn bằng 0 thì không phải "vừa hết" */
      const everHad = _n(r.init)>0 || _n(r.gr)>0 || _n(r.used)>0 || base>0;

      if(!r.inSap)                       r.st='gone';
      else if(!(_n(r.left)>0.5))         r.st=(everHad && !r.vas) ? 'emptied' : 'zero';
      else if(r.pumping)                 r.st='pumping';
      else if(!(_n(r.used)>0.5))         r.st='wait';
      else                               r.st='pumping';
      if(r.st==='pumping' && _n(r.left)<LOW_KG) r.low=true;
      /* sắp hết theo DỰ KIẾN — cảnh báo sớm hơn nhiều so với chỉ nhìn tồn */
      r.soon=(r.st==='pumping'||r.st==='wait') && r.projected &&
             r.etaDays!=null && r.etaDays<=WARN_DAYS;

      /* giữ r.flag cho tương thích ngược (dải cảnh báo, thẻ, ảnh chụp kỳ) */
      r.flag = (r.st==='gone')  ? 'gone'
             : (r.st==='emptied')? 'emptied'
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
      const m=(MAT_ORD[a.mat]==null?9:MAT_ORD[a.mat])-(MAT_ORD[b.mat]==null?9:MAT_ORD[b.mat]);
      if(m) return m;
      const l=(LOT_ORD[a.letter]==null?9:LOT_ORD[a.letter])-(LOT_ORD[b.letter]==null?9:LOT_ORD[b.letter]);
      if(l) return l;
      const da=a.bdate||'9999-12-31', db=b.bdate||'9999-12-31';
      if(da!==db) return da<db?-1:1;
      return a.bcode<b.bcode?-1:(a.bcode>b.bcode?1:0);
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
      const hay=[r.bcode,r.vessel,r.vno,r.dIn,r.dOut,r.note,r.mat,r.letter]
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
    if(!confirm('DELETE ROW '+r.bcode+' ('+r.mat+')\n\n'+
      (still
        ? '⚠ This batch code STILL HOLDS '+_K(r.end)+' kg in the SAP data of '+_dmy(r.date)+'.\n'+
          'Deleting here only removes what you typed (vessel, declarations, VASSCM…).\n'+
          'The row comes straight back, flagged "no details yet".\n\n'
        : 'This batch code holds no stock in SAP — deleting drops the row for good.\n\n')+
      'Continue?')) return;
    delete INFO[key];
    const pay={}; pay[FB_INFO+'/'+key]=null;
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
        vno:r.vno||'', vessel:r.vessel||'', dIn:r.dIn||'', dOut:r.dOut||'',
        hqQty:_n(r.hqQty), vas:!!r.vas, vasDate:r.vasDate||'', note:r.note||'',
        left:_n(r.left), used:_n(r.used), flag:r.flag||'', st:r.st||'',
        eta:r.eta||'', etaDays:(r.etaDays==null?'':r.etaDays), projected:!!r.projected,
        isNew:!!r.isNew, noInfo:!!r.noInfo, low:!!r.low, pumping:!!r.pumping };
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
                        (_isPX(r.letter)?' — head of the FIFO queue for this lot type'
                                        :' — SAP booked a negative GI or Trs on '+_dmy(r.date)),
                wait:'Untouched, not its turn yet',
                emptied:'Empty but VASSCM NOT ticked yet — still something to do',
                zero:'Empty and VASSCM filed — finished',
                gone:'This batch code is no longer in SAP — check it, then delete the row' }[st]||'';
    let h='<div class="bond-stt">'+
      '<span class="bond-no">'+(cell.getRow().getPosition()||'')+'</span>'+
      '<span class="bond-chip c-'+st+'" title="'+_esc(tip)+'">'+
        (ST_ICON[st]||'')+' '+_esc(ST_NAME[st]||'')+'</span>';
    const mk=[];
    if(r.isNew)  mk.push('<span class="bond-mk new" title="Just received — not in the SAP snapshot of '+
                         _dmy(_prevDay)+(_n(r.gr)>0?(', GR column +'+_K(r.gr)+' kg'):'')+'">✚ new</span>');
    if(r.noInfo) mk.push('<span class="bond-mk info" title="No vessel / declaration yet — fill the columns on the left">✎ no details</span>');
    if(r.low)    mk.push('<span class="bond-mk low" title="Under '+_K(LOW_KG)+' kg left">⚠ low</span>');
    if(mk.length) h+='<span class="bond-mks">'+mk.join('')+'</span>';
    return h+'</div>';
  }
  function _vasFmt(cell){
    return cell.getValue()?'<span class="bond-vas on">✔</span>':'<span class="bond-vas">—</span>';
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
        headerTooltip:'VASSCM declaration filed — click to toggle',
        cellClick:(e,cell)=>{ if(ro) return; const d=cell.getRow().getData();
          setInfo(d.key,'vas',!d.vas); } },
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

  function _build(){
    const host=_el('bondGrid'); if(!host) return;
    if(typeof Tabulator==='undefined'){ host.innerHTML='<div class="bond-empty">Tabulator is not loaded</div>'; return; }
    if(_table){ try{ _table.destroy(); }catch(_){} _table=null; }
    _table=new Tabulator('#bondGrid',{
      data:_rows, layout:'fitDataStretch', height:'100%', index:'key',
      columns:_columns(),
      placeholder:'No batch yet — paste a ZMMFR022 export under “📊 Raw SAP”, then come back here',
      /* ⭐ MÀU DÒNG mang HAI tầng thông tin cùng lúc:
           · thanh rail bên trái = LOẠI LÔ (P chàm · X tím · D mòng két · E hổ phách)
           · nền dòng            = TÌNH TRẠNG (đang bơm nổi lên, đã xong mờ đi) */
      rowFormatter:row=>{
        const d=row.getData(), el=row.getElement();
        [...el.classList].forEach(c=>{ if(/^bond-(r|lot)-/.test(c)) el.classList.remove(c); });
        if(d.st) el.classList.add('bond-r-'+d.st);
        el.classList.add('bond-lot-'+String(d.letter||'none').toLowerCase());
        if(d.soon)   el.classList.add('bond-r-soon');
        if(d.isNew)  el.classList.add('bond-r-isnew');
        if(d.noInfo) el.classList.add('bond-r-noinfo');
      }
    });
    _table.on('cellEdited',cell=>{
      const d=cell.getRow().getData();
      setInfo(d.key,cell.getField(),cell.getValue());
    });
  }
  function _refill(){
    if(!_table){ _build(); return; }
    try{ _table.replaceData(_rows); }catch(_){ _build(); }
  }

  /* ============================================================
     THẺ THỐNG KÊ + DẢI CẢNH BÁO
  ============================================================ */
  function _renderCards(){
    const box=_el('bondCards'); if(!box) return;
    if(!_cardsOpen){ box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    const M=_month||_ym(_asOf());
    const o=_ol1Sum();
    const live=_all.filter(r=>r.inSap && _n(r.left)>0.5);
    const byMat={};
    MATS.forEach(m=>{ byMat[m]=live.filter(r=>r.mat===m).reduce((a,r)=>a+_n(r.left),0); });
    const px=live.filter(r=>_isPX(r.letter)).reduce((a,r)=>a+_n(r.left),0);
    const de=live.filter(r=>!_isPX(r.letter)).reduce((a,r)=>a+_n(r.left),0);
    const nNew =_all.filter(r=>r.noInfo && r.inSap).length;
    const nGone=_all.filter(r=>r.st==='gone').length;
    const nZero=_all.filter(r=>r.st==='emptied').length;
    const nLow =_all.filter(r=>r.low).length;
    const card=(cls,head,big,unit,sub)=>
      '<div class="bond-card '+cls+'"><div class="bond-ch">'+head+'</div>'+
      '<div class="bond-cb">'+big+'<u>'+unit+'</u></div><div class="bond-cs">'+sub+'</div></div>';
    box.innerHTML=
      card('stock','🛢 IN BONDED WAREHOUSE<span>'+M+'</span>',
        _T(byMat.C3+byMat.C4),'T',
        'C3 '+_T(byMat.C3)+' T · C4 '+_T(byMat.C4)+' T · '+live.length+' batch(es) still holding')+
      card('split','⚖ P+X RUN DOWN ON OL1 · D+E FROM SAP',
        _T(px),'T',
        'P+X '+_T(px)+' T · D+E '+_T(de)+' T')+
      (function(){
        /* ⭐ DỰ BÁO — lô nào sắp hết trước, còn mấy ngày. Đây là câu hỏi
           điều độ hỏi mỗi sáng: bao giờ phải có lô tiếp theo. */
        const q=_all.filter(r=>r.projected && r.etaDays!=null && _isPX(r.letter))
                    .sort((a,b)=>a.etaDays-b.etaDays);
        const soon=q.filter(r=>r.etaDays<=WARN_DAYS);
        if(!q.length) return '';
        const f=q[0];
        return card('eta'+(soon.length?' hot':''),'⏳ RUNNING OUT FIRST',
          (f.etaDays<=0?'today':f.etaDays),(f.etaDays<=0?'':'days'),
          f.mat+' '+f.letter+' '+_esc(f.bcode)+' · ≈ '+_dmy(f.eta)+
          (soon.length>1?(' · '+soon.length+' batch(es) empty within '+WARN_DAYS+' days'):''));
      })()+
      card('ol1','⛽ FEED OL1 USED<span>'+_dmy(M+'-01')+' → '+_dmy(_sapDay||_wantDay())+'</span>',
        _T(o.t),'T',
        'P '+_T(o.p)+' T · X '+_T(o.x)+' T · '+o.n+' days'+
        (o.def?(' · ⚠ '+o.def+' assumed'):''))+
      card('sap','🔗 SAP FIGURES IN USE',
        _dmy(_sapDay)||'—','',
        (_sapBehind?'⚠ nothing for '+_dmy(_wantDay())+' yet — using an older day':'on the D-1 mark')+
        ' · '+_all.length+' batch(es)')+
      (nNew+nGone+nZero+nLow
        ? card('flags','🚩 NEEDS ATTENTION', String(nNew+nGone+nZero+nLow),'',
            [nGone?('⛔ '+nGone+' gone from SAP'):'',
             nZero?('◍ '+nZero+' empty, no VASSCM'):'',
             nNew ?('✎ '+nNew+' missing details'):'',
             nLow ?('⚠ '+nLow+' running low'):''].filter(Boolean).join(' · '))
        : '');
  }
  function _renderAlerts(){
    const box=_el('bondAlerts'); if(!box) return;
    const out=[];
    const A=_asOf(), want=_wantDay();
    if(_arch){
      const m=_arch.meta||{};
      out.push(['info','<b>📜 Viewing the saved snapshot of '+_arch.M+'</b> — taken '+_esc(m.savedAt||'?')+
        (m.savedBy?(' by '+_esc(m.savedBy)):'')+', SAP figures of '+_dmy(m.sapDate||'')+
        '. The table is read-only. '+
        '<button class="bond-btn" onclick="BOND.closePeriod()">✕ Back to live figures</button>']);
      box.innerHTML=out.map(([c,h])=>'<div class="bond-al '+c+'">'+h+'</div>').join('');
      box.style.display=''; return;
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
    const soon=_all.filter(r=>r.soon).sort((a,b)=>a.etaDays-b.etaDays);
    if(soon.length)
      out.push(['warn','<b>⏳ '+soon.length+' batch(es) forecast to run dry within '+WARN_DAYS+' days:</b> '+
        soon.slice(0,6).map(r=>_esc(r.bcode)+' ≈ '+_dmy(r.eta)+
          ' ('+(r.etaDays<=0?'today':(r.etaDays+' d left'))+')').join(' · ')+
        (soon.length>6?'…':'')+'. Projected on the plan X in the file; any day with no TOTAL P+X '+
        'runs on the assumed '+_K(DEF_TOT_KG)+' kg/day.']);
    const gone=_all.filter(r=>r.st==='gone');
    if(gone.length)
      out.push(['bad','<b>⛔ '+gone.length+' declared batch(es) are NOT in the SAP data of '+_dmy(_sapDay)+
        ':</b> '+gone.slice(0,6).map(r=>_esc(r.bcode)).join(', ')+
        (gone.length>6?'…':'')+'. Either the code is mistyped, or the batch has left the warehouse — '+
        'check, then press ✕ to delete the row.']);
    const zero=_all.filter(r=>r.st==='emptied');
    if(zero.length)
      out.push(['warn','<b>◍ '+zero.length+' batch(es) are empty but VASSCM is NOT ticked:</b> '+
        zero.slice(0,6).map(r=>_esc(r.bcode)).join(', ')+(zero.length>6?'…':'')+
        '. Once pumped out the VASSCM declaration is due — tick the VAS column and the row dims down '+
        'and stops nagging.']);
    const nw=_all.filter(r=>r.noInfo && r.inSap);
    if(nw.length)
      out.push(['warn','<b>✎ '+nw.length+' batch(es) in SAP have no details yet:</b> '+
        nw.slice(0,8).map(r=>_esc(r.bcode)).join(', ')+(nw.length>8?'…':'')+
        '. Fill in voyage number, vessel and declaration numbers in the columns on the left.']);
    if(!out.length)
      out.push(['ok','✓ Figures of <b>'+_dmy(_sapDay)+'</b> · period <b>'+M+'</b> · '+
        _all.length+' batch(es) · nothing out of order.']);
    box.innerHTML=out.map(([c,h])=>'<div class="bond-al '+c+'">'+h+'</div>').join('');
    box.style.display='';
  }

  /* ============================================================
     ⛽ FEED OL1 — bảng lượng dùng hằng ngày
     Ghi vào ĐÚNG node của tab KNQ cũ (knq_bonded/use) để hai bảng không
     bao giờ lệch nhau trong lúc chạy song song.
  ============================================================ */
  function openOl1(){
    const m=_el('bondOl1'); if(m) m.classList.add('on');
    const s=_el('bondOl1Month'); if(s) s.value=_month||_ym(_asOf());
    _renderUse();
  }
  function closeOl1(){ const m=_el('bondOl1'); if(m) m.classList.remove('on'); }
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
      if(f==='x') u.xs='a';                  /* gõ tay = số thực, không phải plan */
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
  function _renderUse(){
    const tb=_el('bondOl1Body'); if(!tb) return;
    const M=_olM(), A=_asOf();
    const uh=_el('bondOl1UnitH'); if(uh) uh.textContent=(_olUnit==='kg'?'kg':'MT');
    const days=Object.keys(USE).filter(d=>_ym(d)===M).sort();
    if(!days.length){
      tb.innerHTML='<tr><td colspan="6" class="bond-empty">'+M+' has no day yet — '+
        'click <b>📅 Fill month</b>.</td></tr>';
      const f=_el('bondOl1Tot'); if(f) f.innerHTML=''; return;
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
        '<td><input class="bond-in n'+(dfl?' bond-asm':'')+'" inputmode="decimal" placeholder="'+
          (dfl?('assumed '+_fromKgTxt(DEF_TOT_KG)):'')+'"'+
          (dfl?(' title="No TOTAL P+X keyed in — running on the assumed '+_fromKgTxt(DEF_TOT_KG)+
                ' so the run-out date can still be projected. Type the real figure and it takes over."'):'')+
          ' value="'+_esc((raw==null||dfl)?'':_fromKg(raw))+'"'+
          ' onchange="BOND.setUse(\''+d+'\',\'t\',this.value)"></td>'+
        '<td><input class="bond-in n" inputmode="decimal" value="'+_esc(xTyped==null?'':_fromKg(xTyped))+'"'+
          (fut&&xTyped==null?' placeholder="plan '+_fromKgTxt(x)+'"':'')+
          ' onchange="BOND.setUse(\''+d+'\',\'x\',this.value)"></td>'+
        '<td class="n '+(dfl?'bond-asm':'bond-dim')+'">'+_fromKgTxt(p)+'</td>'+
        '<td><input class="bond-in" value="'+_esc(u.note||'')+'"'+
          ' onchange="BOND.setUse(\''+d+'\',\'note\',this.value)"></td>'+
        '<td class="c"><span class="bond-del" onclick="BOND.delUseRow(\''+d+'\')">✕</span></td></tr>';
    }).join('');
    const f=_el('bondOl1Tot');
    if(f) f.innerHTML='<b>Σ '+days.length+' days</b> · TOTAL '+_fromKgTxt(sT)+' · X '+_fromKgTxt(sX)+
      ' · P '+_fromKgTxt(sP)+
      (nDef?(' · <span class="bond-warnt">⚠ '+nDef+' PAST day(s) with no TOTAL</span>'):'')+
      (nFut?(' · <span class="bond-asmt">'+nFut+' day(s) ahead on the assumed '+
             _fromKgTxt(DEF_TOT_KG)+'</span>'):'');
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
  function toggleCards(){ _cardsOpen=!_cardsOpen;
    const b=_el('bondCardsBtn'); if(b) b.textContent=_cardsOpen?'⊟ Collapse':'⊞ Expand';
    _renderCards(); }
  function toggleSlim(){ _slim=!_slim;
    const b=_el('bondSlimBtn');
    if(b) b.textContent=_slim?'⊞ All SAP columns':'⊟ Fewer SAP columns';
    _build(); }
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
    _renderCards();
    _renderAlerts();
    _fillPeriodSel();
    const m=_el('bondMonth'); if(m && !m.value) m.value=_month||_ym(_asOf());
    const n=_el('bondCount');
    if(n) n.textContent=(filterOn()?(_rows.length+'/'+_all.length):(_all.length))+' batches'+
      (_arch?(' · period '+_arch.M):'');
    const c=_el('bondFClr'); if(c) c.style.display=filterOn()?'':'none';
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
    const H=['Voyage no.','Vessel','Import decl.','Get-out decl.',
             'Date','SLoc','Mat','Batch','Batch code','Init (kg)','GR','GI','Trs','End (kg)',
             'HQ approved (kg)','Actual left (kg)','%','Empty by','Days left',
             'VASSCM','VASSCM date','Note','Status','New batch','Missing details'];

    const A=[H].concat(_all.map(r=>[
      r.vno||'', r.vessel||'', r.dIn||'', r.dOut||'',
      _dmy(r.date), '1100', r.mat||'', r.letter||'', r.bcode||'',
      _n(r.init), _n(r.gr), _n(r.gi), _n(r.trs), _n(r.end),
      _n(r.hqQty), _n(r.left), +(r.pct*100).toFixed(1),
      (r.eta?((r.projected?'≈ ':'')+_dmy(r.eta)):''), (r.projected&&r.etaDays!=null?r.etaDays:''),
      r.vas?'x':'', _dmy(r.vasDate), r.note||'',
      ST_NAME[r.st]||'', (r.isNew?'new':''), (r.noInfo?'missing':'')
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

  /* ============================================================
     🔁 CHUYỂN DỮ LIỆU TỪ TAB KNQ CŨ  (chạy MỘT LẦN)
     ------------------------------------------------------------
     Tên tàu, STT chuyến và số tờ khai là thứ người dùng gõ tay, SAP không
     có. Đọc knq_bonded/gi + go, ghép theo mã batch, ghi sang knq_info.
     KHÔNG đè lên ô đã có số ở knq_info — chạy lại nhiều lần vẫn an toàn.
  ============================================================ */
  function migrate(){
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    _say('🔁 Reading the old KNQ tab…','');
    const R=_ref();
    Promise.all([
      R.ref('knq_bonded/gi').once('value').then(s=>s.val()||{}),
      R.ref('knq_bonded/go').once('value').then(s=>s.val()||{})
    ]).then(([gi,go])=>{
      const pay={}; const list=[]; let skip=0;
      Object.keys(go).forEach(id=>{
        const r=go[id]||{};
        const bcode=String(r.batch||'').trim().toUpperCase();
        const mat=String(r.mat||'').trim();
        if(!bcode||!mat) return;
        const k=_key(mat,bcode);
        const g=gi[r.giId]||{};
        const cur=INFO[k]||{};
        const put=(f,v)=>{
          if(v===''||v==null) return;
          const c=cur[f];
          if(!(c===''||c==null||c===false)) return;      /* đã có thì giữ */
          pay[FB_INFO+'/'+k+'/'+f]=v;
          INFO[k]=INFO[k]||{}; INFO[k][f]=v;
        };
        const before=Object.keys(pay).length;
        put('vno',    String(g.no||'').trim());
        put('vessel', String(g.vessel||'').trim());
        put('dIn',    String(g.decl||'').trim());
        put('dOut',   String(r.decl||'').trim());
        const hq=_num(r.hqQty); if(hq!=null) put('hqQty',Math.round(hq));
        if(r.vas) put('vas',true);
        put('vasDate',String(r.vasDate||'').trim());
        put('note',   String(r.note||'').trim());
        if(Object.keys(pay).length>before) list.push(mat+' '+bcode);
        else skip++;
      });
      if(!list.length){ _say('✓ Nothing to carry over — every batch already has its details','ok'); return; }
      if(!confirm('🔁 CARRY DETAILS OVER FROM THE OLD KNQ TAB\n\n'+
        list.length+' batch(es) will be filled in:\n'+
        list.slice(0,12).map(s=>'   '+s).join('\n')+(list.length>12?('\n   …+'+(list.length-12)):'')+
        '\n\n'+(skip?(skip+' batch(es) already have details — left untouched.\n\n'):'')+
        'Nothing in the old KNQ tab is deleted. Continue?')) return;
      _push(pay,'carried over '+list.length+' batches').then(ok=>{
        if(ok){ _say('🔁 Details of '+list.length+' batch(es) carried over','ok'); render(); }
      });
    }).catch(e=>{ console.warn('[BOND] migrate',e); _say('❌ Could not read the old KNQ data','er'); });
  }

  return {
    init, onEnter, render, recalc, setMode,
    setInfo, delRow,
    savePeriod, openPeriod, closePeriod, delPeriod,
    openOl1, closeOl1, onOl1Month, onOl1Unit, setUse, addUseRow, fillMonth, delUseRow,
    toggleCards, toggleSlim, onMonth, exportXlsx, migrate,
    onFilter, clearFilter, filterOn,
    /* hook kiểm thử — không dùng trong app */
    _state:{ INFO, USE, rows:()=>_rows, all:()=>_all, periods:()=>PERIODS,
             prevDay:()=>_prevDay, ST_NAME,
             setFilter:(q,m,l,st)=>{ _fq=(q||'').toLowerCase(); _fMat=m||''; _fLot=l||''; _fSt=st||''; },
             filter:()=>({q:_fq,mat:_fMat,lot:_fLot,st:_fSt}),
             asOf:_asOf, wantDay:_wantDay, sapDay:()=>_sapDay, behind:()=>_sapBehind,
             month:()=>_month, setMonth:m=>{ _month=m; },
             setArch:a=>{ _arch=a; }, arch:()=>_arch,
             batchDate:_batchDate, letterOf:_letterOf, key:_key,
             totOf:_totOf, useOf:_useOf, ol1Sum:_ol1Sum, hasInfo:_hasInfo,
             DEF_TOT_KG, LOW_KG, loaded:()=>_loaded, markLoaded:()=>{ _loaded=true; } }
  };
})();
window.BOND = BOND;
