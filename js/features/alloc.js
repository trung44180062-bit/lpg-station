/* ============================================================
 * ALLOC — Tank Allocation Planner (v4.68)
 * ------------------------------------------------------------
 * Global : window.ALLOC
 * Tab    : LPG SALES → 🎯 ALLOCATION  (sub-pane #sub-alloc)
 * Nạp    : sau sp.js / eng.js / plan.js (đọc SP.ROWS, ENG.ROWS, TP.PLAN)
 * Init   : ALLOC.init() trong boot.js (P4)
 * ------------------------------------------------------------
 * MỤC TIÊU
 *   Nhìn thấy TỒN CUỐI của hầm 1100 và bồn 2100 / 2101 (TK-3501 / TK-3502)
 *   theo batch D (Domestic) và E (Export) SAU KHI:
 *     (1) bơm nốt các lot đã pha trộn nhưng CHƯA chuyển kho trên WMS, và
 *     (2) xuất bán theo sale plan.
 *
 * BA NGUỒN DỮ LIỆU
 *   • SP.ROWS  (SAP ZMMFR022) → End Stock theo ngày × sloc × mat × batch.
 *     Đây là mốc gốc. Chọn ngày ở thanh công cụ (mặc định ngày mới nhất).
 *   • ENG.ROWS (Tank Log eng_tkmix) → mix lot: Filled C3 [13] / C4 [14] (MT).
 *     CHỈ lấy lot có cờ Stock Transfer [53] = CHƯA TICK. Lý do nghiệp vụ:
 *     nhân viên chuyển kho trên WMS trước rồi mới tick trên phần mềm, nên
 *     lot ĐÃ tick nghĩa là SAP đã ghi nhận → đã nằm trong End Stock, cộng
 *     nữa là trùng. Lot CHƯA tick = hàng đã nằm thật trong bồn nhưng hệ
 *     thống chưa biết → phải cộng vào bồn và trừ khỏi hầm 1100.
 *   • Sale plan → khai báo tay trong tab này, có nút nạp nhanh từ Today Plan.
 *
 * QUY TẮC TÍNH
 *   Fill : mỗi lot rút C3/C4 từ 1100. Batch nguồn mặc định "Auto" = ưu tiên
 *          batch D trước, hết mới sang E (đổi được từng lot). Thiếu → cảnh báo.
 *   Bán  : mỗi dòng plan khai báo batch D/E, số tấn, bồn (2100 / 2101 / Auto).
 *          Auto + có % → chia theo % khai báo; Auto không % → chia theo tỉ lệ
 *          tồn LPG của batch đó ở hai bồn.
 *          Trong một bồn, số tấn bán được tách C3/C4 theo %wt của CHÍNH BỒN
 *          (tính trên tổng C3+C4 của bồn sau khi fill, gộp cả D và E) — vì
 *          hàng rút ra từ bồn là hỗn hợp, không tách theo batch được.
 *   Batch D ↔ E chuyển đổi trên hệ thống là thủ tục đơn giản, nên báo cáo
 *   chỉ cảnh báo (không chặn) khi một batch âm mà tổng bồn vẫn dương.
 *
 * FIREBASE
 *   alloc_plan = { lines:{rid:{...}}, lotb:{engRid:'D'|'E'}, lotoff:{engRid:1},
 *                  _by, _ts }
 *   Ghi cả object 1 lần mỗi lần đổi (payload rất nhỏ, vài trăm byte) +
 *   localStorage cache để mở tab là có ngay.
 * ============================================================ */

const ALLOC = (function(){
  'use strict';

  const FB_PATH = 'alloc_plan';
  const LS_KEY  = 'lpg_v4_alloc_v1';

  const SLOCS  = ['1100', '2100', '2101'];
  const TANKS  = ['2100', '2101'];
  const BATCHES = ['D', 'E'];
  const MATS   = ['C3', 'C4'];
  const SLOC_NAME = { '1100':'Cavern 1100', '2100':'TK-3501', '2101':'TK-3502' };
  const BATCH_NAME = { D:'Domestic', E:'Export' };

  /* ---------- state ---------- */
  let LINES  = {};   /* rid -> {batch, qty, tank, share, note} */
  let LOTB   = {};   /* engRid -> 'D' | 'E'   (Auto = không có key) */
  let LOTOFF = {};   /* engRid -> 1  (loại khỏi tính toán) */
  let sapDate = '';                   /* iso yyyy-mm-dd */
  let _fbRef = null;
  let _attached = false;
  let _suppressEcho = 0;
  let _built = false;
  let _lastCalc = null;

  /* ---------- helpers ---------- */
  function _gid(id){ return document.getElementById(id); }
  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _rid(){
    return 'al' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function _n(v){
    if(v === '' || v == null) return 0;
    const x = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(x) ? 0 : x;
  }
  /* kg → chuỗi có phân cách nghìn */
  function _kg(v, d){
    const n = Number(v) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: d||0, maximumFractionDigits: d||0 });
  }
  function _mt(v){ return ((Number(v)||0)/1000).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}); }
  /* ô số có màu: âm = đỏ, 0 = xám nhạt */
  function _cell(v, cls){
    const n = Math.round(Number(v)||0);
    if(n === 0) return '<span class="al-zero">0</span>';
    return '<span class="'+(cls||'')+(n<0?' al-neg':'')+'">'+_kg(n)+'</span>';
  }
  function _isoToday(){
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function _isoToDisp(iso){
    if(!iso) return '';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2]+'/'+p[1]+'/'+p[0].slice(2) : iso;
  }
  /* Tank Log lưu ngày dạng dd/mm/yy (đôi khi dd/mm/yyyy) → iso để so sánh */
  function _engDateIso(v){
    const s = String(v||'').trim();
    if(!s) return '';
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return s;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(!m) return '';
    let y = parseInt(m[3]); if(y < 100) y += 2000;
    const p = n => String(n).padStart(2,'0');
    return y + '-' + p(parseInt(m[2])) + '-' + p(parseInt(m[1]));
  }
  /* TK-3501 / 3501 / "TK3501" → sloc 2100 */
  function _tankToSloc(v){
    const s = String(v||'').toUpperCase();
    if(s.includes('3501') || s.includes('2100')) return '2100';
    if(s.includes('3502') || s.includes('2101')) return '2101';
    return '';
  }
  function _who(){
    try{
      const u = window.CURRENT_USER;
      return u ? String(u.name || u.email || u.uid || '').split('@')[0].slice(0,24) : '';
    }catch(_){ return ''; }
  }
  function _canWrite(){
    return (typeof canWrite !== 'function') || canWrite('alloc_plan');
  }
  function _toast(msg, kind){
    try{ if(typeof toast === 'function') toast(msg, kind||'ok'); }catch(_){}
  }
  function _zeroBook(){
    const o = {};
    SLOCS.forEach(sl => {
      o[sl] = {};
      BATCHES.forEach(b => { o[sl][b] = { C3:0, C4:0 }; });
    });
    return o;
  }

  /* ============================================================
     1. TỒN GỐC TỪ SAP
     ============================================================ */
  /* Danh sách ngày có dữ liệu SAP, mới nhất trước */
  function _sapDates(){
    const set = {};
    try{
      Object.values(SP.ROWS || {}).forEach(r => {
        if(!r || !r.date) return;
        if(SLOCS.indexOf(String(r.sloc)) < 0) return;
        set[r.date] = 1;
      });
    }catch(_){}
    return Object.keys(set).sort().reverse();
  }
  /* End Stock kg theo sloc × batch × mat của đúng 1 ngày */
  function _sapEndStock(iso){
    const book = _zeroBook();
    if(!iso) return book;
    try{
      Object.values(SP.ROWS || {}).forEach(r => {
        if(!r || r.date !== iso) return;
        const sl = String(r.sloc||'');
        if(!book[sl]) return;
        const b = String(r.batch||'').toUpperCase();
        if(BATCHES.indexOf(b) < 0) return;         /* bỏ P / X — chỉ D & E */
        const m = String(r.mat||'').toUpperCase();
        if(MATS.indexOf(m) < 0) return;
        book[sl][b][m] += _n(r.end);
      });
    }catch(_){}
    return book;
  }

  /* ============================================================
     2. LOT CHƯA CHUYỂN KHO (Tank Log)
     ============================================================ */
  /* Trả về [{rid, lot, tank, sloc, dateIso, dateRaw, c3, c4, batch, off}] */
  function _pendingLots(iso){
    const out = [];
    let rows = [];
    try{ rows = ENG.ROWS || []; }catch(_){ rows = []; }
    const stCol = (typeof ENG !== 'undefined' && ENG.ST_COL != null) ? ENG.ST_COL : 53;
    rows.forEach(r => {
      if(String(r[stCol]||'') === '1') return;            /* đã chuyển kho → SAP có rồi */
      const sloc = _tankToSloc(r[2]);
      if(!sloc) return;
      const c3 = Math.abs(_n(r[13])) * 1000;              /* MT → kg */
      const c4 = Math.abs(_n(r[14])) * 1000;
      if(c3 <= 0 && c4 <= 0) return;
      const dIso = _engDateIso(r[3]);
      /* Lot cũ hơn mốc SAP đã nằm trong End Stock rồi (dù chưa ai tick) →
         bỏ qua để không cộng trùng. Không có ngày thì vẫn giữ, coi là mới. */
      if(iso && dIso && dIso < iso) return;
      out.push({
        rid:     r._rid || '',
        lot:     String(r[1]||''),
        tank:    String(r[2]||''),
        sloc:    sloc,
        dateIso: dIso,
        dateRaw: String(r[3]||''),
        c3: c3, c4: c4,
        batch:   LOTB[r._rid] || 'auto',
        off:     !!LOTOFF[r._rid]
      });
    });
    out.sort((a,b) => (a.dateIso === b.dateIso)
      ? String(a.lot).localeCompare(String(b.lot), undefined, {numeric:true})
      : String(a.dateIso).localeCompare(String(b.dateIso)));
    return out;
  }

  /* ============================================================
     3. PHÉP TÍNH CHÍNH
     ============================================================ */
  function compute(){
    const iso  = sapDate;
    const base = _sapEndStock(iso);
    const lots = _pendingLots(iso);

    /* 3.1 — bơm lot chưa chuyển kho: rút khỏi 1100, cộng vào bồn */
    const src  = { D: Object.assign({}, base['1100'].D), E: Object.assign({}, base['1100'].E) };
    const fill = _zeroBook();                    /* lượng fill theo sloc/batch/mat */
    const shortFill = { C3:0, C4:0 };            /* 1100 không đủ để bơm */

    lots.forEach(L => {
      L._drawn = { D:{C3:0,C4:0}, E:{C3:0,C4:0} };
      L._short = { C3:0, C4:0 };
      if(L.off) return;
      const order = (L.batch === 'D') ? ['D'] : (L.batch === 'E') ? ['E'] : ['D','E'];
      MATS.forEach(m => {
        let need = (m === 'C3') ? L.c3 : L.c4;
        for(const b of order){
          if(need <= 0.0001) break;
          const avail = Math.max(0, src[b][m]);
          const take  = Math.min(avail, need);
          if(take > 0){
            src[b][m]        -= take;
            fill[L.sloc][b][m] += take;
            L._drawn[b][m]   += take;
            need             -= take;
          }
        }
        if(need > 0.0001){
          /* 1100 không đủ theo sổ SAP — vẫn cộng vào bồn (hàng đã bơm thật)
             và cho 1100 âm ở batch cuối cùng của thứ tự để tổng vẫn cân. */
          const bLast = order[order.length - 1];
          src[bLast][m]        -= need;
          fill[L.sloc][bLast][m] += need;
          L._drawn[bLast][m]   += need;
          L._short[m]          += need;
          shortFill[m]         += need;
        }
      });
    });

    /* 3.2 — tồn sau khi fill */
    const afterFill = _zeroBook();
    SLOCS.forEach(sl => BATCHES.forEach(b => MATS.forEach(m => {
      afterFill[sl][b][m] = (sl === '1100') ? src[b][m] : (base[sl][b][m] + fill[sl][b][m]);
    })));

    /* 3.3 — %wt C3/C4 của từng bồn, chốt MỘT LẦN trước khi bán để mọi dòng
       plan dùng chung một tỉ lệ (dễ đối chiếu, không phụ thuộc thứ tự dòng) */
    const ratio = {};
    TANKS.forEach(t => {
      const c3 = afterFill[t].D.C3 + afterFill[t].E.C3;
      const c4 = afterFill[t].D.C4 + afterFill[t].E.C4;
      const tot = c3 + c4;
      ratio[t] = { c3: tot > 0 ? c3/tot : 0.5, c4: tot > 0 ? c4/tot : 0.5, tot: tot };
    });

    /* 3.4 — phân bổ sale plan */
    const sell = _zeroBook();
    const planRows = [];
    Object.keys(LINES).forEach(rid => {
      const L = LINES[rid];
      if(!L) return;
      const b = (String(L.batch||'E').toUpperCase() === 'D') ? 'D' : 'E';
      const kg = _n(L.qty) * 1000;
      const row = { rid: rid, batch: b, kg: kg, tank: L.tank || 'auto',
                    share: L.share, note: L.note || '', split: {} };
      if(kg > 0){
        let w = {};
        if(row.tank === '2100')      w = { '2100':1, '2101':0 };
        else if(row.tank === '2101') w = { '2100':0, '2101':1 };
        else if(String(L.share||'').trim() !== ''){
          const s = Math.max(0, Math.min(100, _n(L.share))) / 100;
          w = { '2100':s, '2101':1-s };
        } else {
          /* Auto không khai %: chia theo tồn LPG của chính batch đó ở 2 bồn */
          const a = Math.max(0, afterFill['2100'][b].C3 + afterFill['2100'][b].C4);
          const c = Math.max(0, afterFill['2101'][b].C3 + afterFill['2101'][b].C4);
          w = (a + c > 0) ? { '2100': a/(a+c), '2101': c/(a+c) } : { '2100':0.5, '2101':0.5 };
        }
        TANKS.forEach(t => {
          const kgT = kg * (w[t] || 0);
          if(kgT <= 0){ row.split[t] = { kg:0, C3:0, C4:0 }; return; }
          const c3 = kgT * ratio[t].c3, c4 = kgT * ratio[t].c4;
          sell[t][b].C3 += c3;
          sell[t][b].C4 += c4;
          row.split[t] = { kg:kgT, C3:c3, C4:c4 };
        });
      } else {
        TANKS.forEach(t => { row.split[t] = { kg:0, C3:0, C4:0 }; });
      }
      planRows.push(row);
    });
    planRows.sort((a,b) => (a.batch === b.batch) ? (b.kg - a.kg) : (a.batch < b.batch ? -1 : 1));

    /* 3.5 — tồn cuối */
    const end = _zeroBook();
    SLOCS.forEach(sl => BATCHES.forEach(b => MATS.forEach(m => {
      end[sl][b][m] = afterFill[sl][b][m] - sell[sl][b][m];
    })));

    /* 3.6 — cảnh báo */
    const warns = [], errs = [];
    if(!iso) errs.push('Chưa có dữ liệu SAP — hãy dán ZMMFR022 ở tab SAP.');
    if(shortFill.C3 > 1 || shortFill.C4 > 1){
      warns.push('Hầm 1100 theo sổ SAP không đủ để bơm hết các lot chưa chuyển kho ('
        + (shortFill.C3>1 ? 'C3 thiếu '+_kg(shortFill.C3)+' kg' : '')
        + (shortFill.C3>1 && shortFill.C4>1 ? ' · ' : '')
        + (shortFill.C4>1 ? 'C4 thiếu '+_kg(shortFill.C4)+' kg' : '')
        + ') — kiểm tra lại mốc ngày SAP hoặc cờ Stock Transfer.');
    }
    TANKS.forEach(t => {
      const tankTot = end[t].D.C3 + end[t].D.C4 + end[t].E.C3 + end[t].E.C4;
      if(tankTot < -1){
        /* Bồn thiếu hàng thật — chuyển đổi batch không cứu được */
        errs.push(SLOC_NAME[t]+' không đủ hàng: thiếu '+_kg(-tankTot)+' kg so với kế hoạch bán.');
        return;
      }
      /* Tổng bồn còn dương, chỉ lệch giữa D và E → thủ tục chuyển đổi batch */
      BATCHES.forEach(b => {
        const lpg = end[t][b].C3 + end[t][b].C4;
        if(lpg < -1){
          warns.push(SLOC_NAME[t]+' batch '+b+' âm '+_kg(-lpg)+' kg nhưng tổng bồn vẫn dương — '
            + 'chuyển đổi batch '+(b==='D'?'E→D':'D→E')+' trên hệ thống là đủ.');
        }
      });
    });
    BATCHES.forEach(b => {
      const cav = end['1100'][b].C3 + end['1100'][b].C4;
      if(cav < -1) warns.push('Hầm 1100 batch '+b+' âm '+_kg(-cav)+' kg sau khi bơm — cần chuyển đổi batch ở hầm.');
    });

    _lastCalc = { iso, base, lots, fill, afterFill, ratio, sell, end, planRows, warns, errs, shortFill };
    return _lastCalc;
  }

  /* ============================================================
     4. LƯU / ĐỒNG BỘ
     ============================================================ */
  function _saveCache(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify({ lines:LINES, lotb:LOTB, lotoff:LOTOFF, sapDate:sapDate })); }catch(_){}
  }
  function _loadCache(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      const o = JSON.parse(raw) || {};
      LINES  = o.lines  && typeof o.lines  === 'object' ? o.lines  : {};
      LOTB   = o.lotb   && typeof o.lotb   === 'object' ? o.lotb   : {};
      LOTOFF = o.lotoff && typeof o.lotoff === 'object' ? o.lotoff : {};
      if(o.sapDate) sapDate = o.sapDate;
    }catch(_){}
  }
  /* v4.68.1 — _push KHÔNG bao giờ được phép ném ra ngoài. Firebase .set()
     validate đồng bộ và ném ngay nếu payload có giá trị lạ; trước đây lỗi đó
     làm hàm gọi (vd loadFromToday) dừng TRƯỚC render() → màn hình y như cũ
     dù dữ liệu đã vào RAM, người dùng bấm lại nhiều lần và nhân đôi dữ liệu.
     Nay: sanitize bằng JSON round-trip + bọc try/catch. */
  function _push(){
    _saveCache();
    if(!_fbRef || !_canWrite()) return;
    let payload;
    try{
      payload = JSON.parse(JSON.stringify({ lines:LINES, lotb:LOTB, lotoff:LOTOFF }));
    }catch(e){ console.warn('[ALLOC] payload không serialize được', e); return; }
    payload._by = _who();
    payload._ts = Date.now();
    _suppressEcho++;
    try{
      _fbRef.set(payload)
        .catch(e => { if(typeof fbErr === 'function') fbErr(e,'Save allocation plan'); else console.warn('[ALLOC] push', e); })
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho - 1); }, 400));
    }catch(e){
      _suppressEcho = Math.max(0, _suppressEcho - 1);
      console.warn('[ALLOC] push ném đồng bộ', e);
      _toast('⚠ Không lưu được lên Firebase — dữ liệu vẫn giữ trong máy','warn');
    }
  }
  function _onValue(snap){
    if(_suppressEcho > 0) return;
    const v = snap.val() || {};
    LINES  = (v.lines  && typeof v.lines  === 'object') ? v.lines  : {};
    LOTB   = (v.lotb   && typeof v.lotb   === 'object') ? v.lotb   : {};
    LOTOFF = (v.lotoff && typeof v.lotoff === 'object') ? v.lotoff : {};
    _saveCache();
    render();
  }

  /* ============================================================
     5. THAO TÁC NGƯỜI DÙNG
     ============================================================ */
  function setDate(v){
    sapDate = String(v||'').trim();
    _saveCache();
    render();
  }
  function addLine(seed){
    if(!_canWrite()){ _toast('Không có quyền sửa sale plan','er'); return; }
    const rid = _rid();
    LINES[rid] = Object.assign({ batch:'E', qty:'', tank:'auto', share:'', note:'' }, seed||{});
    _push(); render();
    setTimeout(()=>{ const el = _gid('al-qty-'+rid); if(el){ el.focus(); el.select(); } }, 30);
  }
  function delLine(rid){
    if(!_canWrite()){ _toast('Không có quyền sửa sale plan','er'); return; }
    delete LINES[rid];
    _push(); render();
  }
  function editLine(rid, field, value){
    const L = LINES[rid]; if(!L) return;
    if(!_canWrite()){ _toast('Không có quyền sửa sale plan','er'); render(); return; }
    L[field] = value;
    if(field === 'tank' && value !== 'auto') L.share = '';
    _push(); render();
  }
  function setLotBatch(engRid, v){
    if(!_canWrite()){ _toast('Không có quyền sửa','er'); return; }
    if(v === 'auto') delete LOTB[engRid]; else LOTB[engRid] = v;
    _push(); render();
  }
  function toggleLot(engRid){
    if(!_canWrite()){ _toast('Không có quyền sửa','er'); return; }
    if(LOTOFF[engRid]) delete LOTOFF[engRid]; else LOTOFF[engRid] = 1;
    _push(); render();
  }
  function clearPlan(){
    if(!_canWrite()){ _toast('Không có quyền sửa sale plan','er'); return; }
    if(!Object.keys(LINES).length) return;
    if(!window.confirm('Xoá toàn bộ ' + Object.keys(LINES).length + ' dòng sale plan?')) return;
    LINES = {};
    _push(); render();
    _toast('Đã xoá sale plan','warn');
  }
  /* Khách xuất khẩu → batch E. Dò chữ EXPORT trong tên rút gọn trên plan VÀ
     trong tên WMS đầy đủ (vd "DARA T.C. ANGKOR GROUP LTD(EXPORT)"), vì tên
     hiển thị ở Today Plan thường là short name không mang chữ EXPORT. */
  function _isExport(custRaw){
    const s = String(custRaw||'');
    let full = s;
    try{ if(typeof CT !== 'undefined' && CT.wmsName) full = s + ' ' + CT.wmsName(s); }catch(_){}
    return /export|xu[aâ]t\s*kh[aâ]u/i.test(full);
  }
  /* Trạng thái hiệu lực của một dòng plan (done / loading / cancel / '') */
  function _planStatus(r){
    try{
      if(typeof TP !== 'undefined' && TP.getEffectiveStatus) return String(TP.getEffectiveStatus(r)||'');
    }catch(_){}
    return String((r && r._status) || '');
  }
  /* Nạp nhanh từ Today Plan.
     v4.68.1 — sửa 3 lỗi của bản đầu:
       • CỘNG DỒN: bấm n lần ra n bộ dòng. Nay dòng do Today Plan sinh ra mang
         cờ src:'tp' và bị THAY THẾ mỗi lần nạp; dòng khai tay giữ nguyên.
       • SAI PHẠM VI: TP.PLAN chứa mọi ngày → nay chỉ lấy đúng TP.planDate.
       • SAI MỨC GOM: gộp theo chuỗi `type` (nhãn hợp đồng) ra hàng chục dòng
         → nay gom đúng 2 dòng: 1 batch D, 1 batch E.
     Lấy TOÀN BỘ kế hoạch, chỉ bỏ đơn Cancelled — khớp con số "Plan" ở Today
     Plan, hợp với mốc tồn SAP là ngày hôm trước (chưa trừ gì của hôm nay). */
  function loadFromToday(){
    if(!_canWrite()){ _toast('Không có quyền sửa sale plan','er'); return; }
    let plan = {}, pDate = '';
    try{ plan = TP.PLAN || {}; pDate = TP.planDate || ''; }catch(_){ plan = {}; }
    const rows = Object.values(plan).filter(r => !pDate || String(r._forDate || pDate) === pDate);
    if(!rows.length){ _toast('Today Plan đang trống (ngày '+_isoToDisp(pDate)+')','warn'); return; }

    const agg = { D:{ mt:0, n:0, cust:{} }, E:{ mt:0, n:0, cust:{} } };
    let skipped = 0;
    rows.forEach(r => {
      if(_planStatus(r) === 'cancel'){ skipped++; return; }
      const q = _n(r.qty);
      if(q <= 0) return;
      const b = _isExport(r.customer) ? 'E' : 'D';
      agg[b].mt += q; agg[b].n++;
      const c = String(r.customer||'—').trim() || '—';
      agg[b].cust[c] = (agg[b].cust[c] || 0) + q;
    });
    if(agg.D.mt <= 0 && agg.E.mt <= 0){ _toast('Today Plan không có dòng nào có Qty','warn'); return; }

    Object.keys(LINES).forEach(rid => { if(LINES[rid] && LINES[rid].src === 'tp') delete LINES[rid]; });
    BATCHES.forEach(b => {
      if(agg[b].mt <= 0) return;
      const names = Object.keys(agg[b].cust).sort((x,y)=>agg[b].cust[y]-agg[b].cust[x]);
      LINES[_rid()] = {
        batch: b,
        qty:   String(Math.round(agg[b].mt * 1000) / 1000),
        tank:  'auto', share: '', src: 'tp',
        note:  'Today Plan ' + _isoToDisp(pDate) + ' · ' + agg[b].n + ' đơn · ' +
               names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '')
      };
    });
    _push(); render();
    _toast('Nạp Today Plan ' + _isoToDisp(pDate) + ': D ' + _mt(agg.D.mt*1000) + ' MT · E ' +
           _mt(agg.E.mt*1000) + ' MT' + (skipped ? ' · bỏ ' + skipped + ' đơn Cancelled' : ''), 'ok');
  }
  /* Kéo toàn bộ Tank Log (mặc định chỉ 10 lot mới nhất nằm trong RAM) */
  function loadAllLots(){
    try{
      if(ENG.allLoaded){ _toast('Tank Log đã tải đủ','ok'); return; }
      ENG.loadAll(()=>{ render(); _toast('Đã tải toàn bộ Tank Log','ok'); });
    }catch(e){ console.warn('[ALLOC] loadAllLots', e); }
  }

  /* ============================================================
     6. GIAO DIỆN
     ============================================================ */
  function _buildShell(){
    const host = _gid('sub-alloc');
    if(!host || _built) return;
    host.innerHTML =
      '<div class="al-wrap">' +
        '<div class="al-bar">' +
          '<div class="al-bar-l">' +
            '<span class="al-bar-lbl">Mốc tồn SAP</span>' +
            '<select id="alDateSel" class="al-sel" onchange="ALLOC.setDate(this.value)"></select>' +
            '<span class="al-bar-hint" id="alDateHint"></span>' +
          '</div>' +
          '<div class="al-bar-r">' +
            '<button class="al-btn" onclick="ALLOC.refresh()" title="Tính lại từ SAP + Tank Log">⟳ Tính lại</button>' +
            '<button class="al-btn" onclick="ALLOC.loadAllLots()" title="Tải toàn bộ Tank Log">📥 Tải hết lot</button>' +
            '<button class="al-btn al-btn-p" onclick="ALLOC.loadFromToday()" title="Gộp Qty từ Today Plan">📅 Nạp Today Plan</button>' +
            '<button class="al-btn al-btn-p" onclick="ALLOC.addLine()">➕ Thêm dòng bán</button>' +
            '<button class="al-btn al-btn-d" onclick="ALLOC.clearPlan()">🗑 Xoá plan</button>' +
          '</div>' +
        '</div>' +
        '<div id="alVerdict"></div>' +
        '<div class="al-cards" id="alCards"></div>' +
        '<div class="al-grid2">' +
          '<section class="al-panel">' +
            '<div class="al-ph"><h3>🛢️ Lot đã pha trộn · CHƯA chuyển kho WMS</h3>' +
              '<span class="al-ph-sub" id="alLotsSub"></span></div>' +
            '<div class="al-scroll"><table class="al-tbl" id="alLotsTbl"></table></div>' +
            '<div class="al-note">Lot đã tick ST ở Tank Log không hiện ở đây vì SAP đã ghi nhận. ' +
              'Cột <b>Batch nguồn</b> quyết định rút D hay E từ hầm 1100 — Auto = ưu tiên D trước.</div>' +
          '</section>' +
          '<section class="al-panel">' +
            '<div class="al-ph"><h3>📋 Sale plan</h3><span class="al-ph-sub" id="alPlanSub"></span></div>' +
            '<div class="al-scroll"><table class="al-tbl" id="alPlanTbl"></table></div>' +
            '<div class="al-note">Bồn = <b>Auto</b> và bỏ trống <b>%2100</b> ⇒ chia theo tỉ lệ tồn LPG của batch đó ở hai bồn. ' +
              'C3/C4 luôn tách theo %wt của chính bồn xuất.</div>' +
          '</section>' +
        '</div>' +
        '<section class="al-panel">' +
          '<div class="al-ph"><h3>📊 Tồn kho dự báo theo batch</h3><span class="al-ph-sub" id="alResSub"></span></div>' +
          '<div class="al-scroll"><table class="al-tbl al-tbl-res" id="alResTbl"></table></div>' +
        '</section>' +
      '</div>';
    _built = true;
  }

  function _renderDateSel(dates){
    const sel = _gid('alDateSel'); if(!sel) return;
    const opts = dates.map(d => '<option value="'+d+'"'+(d===sapDate?' selected':'')+'>'+_isoToDisp(d)+'</option>');
    sel.innerHTML = opts.length ? opts.join('') : '<option value="">— chưa có SAP —</option>';
    const hint = _gid('alDateHint');
    if(hint){
      hint.textContent = dates.length
        ? (dates[0] === sapDate ? '· ngày mới nhất' : '· có ' + dates.length + ' ngày, mới nhất ' + _isoToDisp(dates[0]))
        : '· dán ZMMFR022 ở tab SAP trước';
    }
  }

  function _renderVerdict(c){
    const el = _gid('alVerdict'); if(!el) return;
    if(c.errs.length){
      el.innerHTML = '<div class="al-verdict bad"><span class="dot"></span><div><b>Không đủ hàng.</b> '
        + c.errs.map(_esc).join(' · ') + '</div></div>';
    } else if(c.warns.length){
      el.innerHTML = '<div class="al-verdict warn"><span class="dot"></span><div><b>Cần xử lý thủ tục.</b> '
        + c.warns.map(_esc).join(' · ') + '</div></div>';
    } else {
      const totPlan = c.planRows.reduce((s,r)=>s+r.kg, 0);
      el.innerHTML = '<div class="al-verdict ok"><span class="dot"></span><div><b>Đủ hàng.</b> '
        + 'Kế hoạch bán ' + _kg(totPlan) + ' kg được đáp ứng từ tồn hai bồn sau khi bơm '
        + c.lots.filter(l=>!l.off).length + ' lot chưa chuyển kho.</div></div>';
    }
  }

  function _bar(parts, total){
    if(total <= 0) return '<div class="al-bar-g"></div>';
    return '<div class="al-bar-g">' + parts.map(p =>
      '<i class="'+p.cls+'" style="width:'+Math.max(0, Math.min(100, p.v/total*100))+'%" title="'+_esc(p.t)+'"></i>'
    ).join('') + '</div>';
  }

  function _renderCards(c){
    const host = _gid('alCards'); if(!host) return;
    host.innerHTML = SLOCS.map(sl => {
      const e = c.end[sl], a = c.afterFill[sl];
      const dLpg = e.D.C3 + e.D.C4, eLpg = e.E.C3 + e.E.C4;
      const tot  = dLpg + eLpg;
      const aTot = a.D.C3 + a.D.C4 + a.E.C3 + a.E.C4;
      const c3 = e.D.C3 + e.E.C3, c4 = e.D.C4 + e.E.C4;
      const pct3 = (c3+c4) > 0 ? c3/(c3+c4)*100 : 0;
      const isCav = sl === '1100';
      return '<div class="al-card'+(tot < -1 ? ' al-card-bad' : '')+'">' +
        '<div class="al-card-h"><b>'+_esc(SLOC_NAME[sl])+'</b><span class="al-card-role">'+(isCav?'Nguồn':'Bồn bán')+'</span></div>' +
        '<div class="al-card-big'+(tot<-1?' al-neg':'')+'">'+_kg(tot)+'<span class="al-un">kg tồn cuối</span></div>' +
        _bar([{cls:'al-sg-d', v:Math.max(0,dLpg), t:'Batch D '+_kg(dLpg)+' kg'},
              {cls:'al-sg-e', v:Math.max(0,eLpg), t:'Batch E '+_kg(eLpg)+' kg'}],
             Math.max(1, Math.max(0,dLpg)+Math.max(0,eLpg))) +
        '<div class="al-kv"><span><i class="al-chip al-chip-d"></i>Batch D</span><b class="'+(dLpg<-1?'al-neg':'')+'">'+_kg(dLpg)+'</b></div>' +
        '<div class="al-kv"><span><i class="al-chip al-chip-e"></i>Batch E</span><b class="'+(eLpg<-1?'al-neg':'')+'">'+_kg(eLpg)+'</b></div>' +
        '<div class="al-kv al-kv-sep"><span>Sau fill (trước bán)</span><b>'+_kg(aTot)+'</b></div>' +
        (isCav ? '' : '<div class="al-kv"><span>%wt C3 / C4</span><b>'+pct3.toFixed(1)+' / '+(100-pct3).toFixed(1)+'</b></div>') +
        '</div>';
    }).join('');
  }

  function _renderLots(c){
    const t = _gid('alLotsTbl'); if(!t) return;
    const sub = _gid('alLotsSub');
    const on = c.lots.filter(l => !l.off);
    const totC3 = on.reduce((s,l)=>s+l.c3,0), totC4 = on.reduce((s,l)=>s+l.c4,0);
    if(sub){
      let s = c.lots.length + ' lot · đang tính ' + on.length;
      try{ if(!ENG.allLoaded) s += ' · Tank Log mới tải 1 phần'; }catch(_){}
      sub.textContent = s;
    }
    if(!c.lots.length){
      t.innerHTML = '<tbody><tr><td class="al-empty">Không có lot nào chưa chuyển kho từ ngày '
        + _esc(_isoToDisp(c.iso)) + ' — tồn SAP đã phản ánh đầy đủ.</td></tr></tbody>';
      return;
    }
    let h = '<thead><tr><th class="al-c" style="width:34px">Tính</th><th>Lot</th><th>Bồn</th><th>Ngày</th>' +
            '<th class="al-r">Fill C3</th><th class="al-r">Fill C4</th><th class="al-r">LPG</th>' +
            '<th style="width:96px">Batch nguồn</th><th class="al-r">Rút D</th><th class="al-r">Rút E</th></tr></thead><tbody>';
    c.lots.forEach(L => {
      const dD = L._drawn.D.C3 + L._drawn.D.C4, dE = L._drawn.E.C3 + L._drawn.E.C4;
      const shortAny = (L._short.C3 + L._short.C4) > 1;
      h += '<tr class="'+(L.off ? 'al-row-off' : '')+'">' +
        '<td class="al-c"><span class="al-tick'+(L.off?'':' on')+'" onclick="ALLOC.toggleLot(\''+_esc(L.rid)+'\')" title="'+(L.off?'Bỏ qua lot này':'Đang cộng vào bồn')+'">'+(L.off?'○':'✔')+'</span></td>' +
        '<td class="al-b">'+_esc(L.lot)+'</td>' +
        '<td><span class="al-tk al-tk-'+L.sloc+'">'+_esc(L.tank)+'</span></td>' +
        '<td>'+_esc(L.dateRaw || '—')+'</td>' +
        '<td class="al-r al-c3">'+_kg(L.c3)+'</td>' +
        '<td class="al-r al-c4">'+_kg(L.c4)+'</td>' +
        '<td class="al-r al-b">'+_kg(L.c3+L.c4)+'</td>' +
        '<td><select class="al-sel al-sel-s" onchange="ALLOC.setLotBatch(\''+_esc(L.rid)+'\',this.value)">' +
          '<option value="auto"'+(L.batch==='auto'?' selected':'')+'>Auto (D→E)</option>' +
          '<option value="D"'+(L.batch==='D'?' selected':'')+'>D</option>' +
          '<option value="E"'+(L.batch==='E'?' selected':'')+'>E</option></select></td>' +
        '<td class="al-r">'+(dD>0?_kg(dD):'<span class="al-zero">—</span>')+'</td>' +
        '<td class="al-r">'+(dE>0?_kg(dE):'<span class="al-zero">—</span>')+
          (shortAny?' <span class="al-flag" title="Hầm 1100 theo sổ không đủ">⚠</span>':'')+'</td>' +
        '</tr>';
    });
    h += '<tr class="al-sum"><td colspan="4">Tổng đang tính</td>' +
         '<td class="al-r al-c3">'+_kg(totC3)+'</td><td class="al-r al-c4">'+_kg(totC4)+'</td>' +
         '<td class="al-r al-b">'+_kg(totC3+totC4)+'</td><td colspan="3"></td></tr></tbody>';
    t.innerHTML = h;
  }

  function _renderPlan(c){
    const t = _gid('alPlanTbl'); if(!t) return;
    const sub = _gid('alPlanSub');
    const tot = c.planRows.reduce((s,r)=>s+r.kg, 0);
    const totD = c.planRows.filter(r=>r.batch==='D').reduce((s,r)=>s+r.kg,0);
    if(sub) sub.textContent = c.planRows.length + ' dòng · ' + _mt(tot) + ' MT (D ' + _mt(totD) + ' · E ' + _mt(tot-totD) + ')';
    if(!c.planRows.length){
      t.innerHTML = '<tbody><tr><td class="al-empty">Chưa khai báo kế hoạch bán. Bấm <b>➕ Thêm dòng bán</b> hoặc <b>📅 Nạp Today Plan</b>.</td></tr></tbody>';
      return;
    }
    let h = '<thead><tr><th style="width:26px"></th><th style="width:62px">Batch</th><th class="al-r" style="width:82px">Tấn</th>' +
            '<th style="width:78px">Bồn</th><th class="al-r" style="width:64px">%2100</th>' +
            '<th class="al-r">2100 kg</th><th class="al-r">2101 kg</th><th>Ghi chú</th></tr></thead><tbody>';
    c.planRows.forEach(r => {
      const L = LINES[r.rid] || {};
      h += '<tr>' +
        '<td class="al-c"><span class="al-del" onclick="ALLOC.delLine(\''+_esc(r.rid)+'\')" title="Xoá dòng">✕</span></td>' +
        '<td><select class="al-sel al-sel-s al-bt-'+r.batch+'" onchange="ALLOC.editLine(\''+_esc(r.rid)+'\',\'batch\',this.value)">' +
          '<option value="D"'+(r.batch==='D'?' selected':'')+'>D · Dom</option>' +
          '<option value="E"'+(r.batch==='E'?' selected':'')+'>E · Exp</option></select></td>' +
        '<td class="al-r"><input id="al-qty-'+_esc(r.rid)+'" class="al-in al-in-r" value="'+_esc(L.qty)+'" ' +
          'onchange="ALLOC.editLine(\''+_esc(r.rid)+'\',\'qty\',this.value)" placeholder="MT"></td>' +
        '<td><select class="al-sel al-sel-s" onchange="ALLOC.editLine(\''+_esc(r.rid)+'\',\'tank\',this.value)">' +
          '<option value="auto"'+(r.tank==='auto'?' selected':'')+'>Auto</option>' +
          '<option value="2100"'+(r.tank==='2100'?' selected':'')+'>TK-3501</option>' +
          '<option value="2101"'+(r.tank==='2101'?' selected':'')+'>TK-3502</option></select></td>' +
        '<td class="al-r"><input class="al-in al-in-r al-in-s" value="'+_esc(L.share)+'" ' +
          (r.tank==='auto' ? '' : 'disabled ') +
          'onchange="ALLOC.editLine(\''+_esc(r.rid)+'\',\'share\',this.value)" placeholder="auto"></td>' +
        '<td class="al-r">'+_kg(r.split['2100'].kg)+'<span class="al-sm"> ('+_kg(r.split['2100'].C3)+'/'+_kg(r.split['2100'].C4)+')</span></td>' +
        '<td class="al-r">'+_kg(r.split['2101'].kg)+'<span class="al-sm"> ('+_kg(r.split['2101'].C3)+'/'+_kg(r.split['2101'].C4)+')</span></td>' +
        '<td>'+(L.src==='tp' ? '<span class="al-src" title="Dòng do 📅 Nạp Today Plan sinh ra — sẽ bị thay thế ở lần nạp sau">TP</span>' : '') +
          '<input class="al-in" value="'+_esc(L.note)+'" onchange="ALLOC.editLine(\''+_esc(r.rid)+'\',\'note\',this.value)" placeholder="—"></td>' +
        '</tr>';
    });
    h += '<tr class="al-sum"><td colspan="5">Tổng kế hoạch</td>' +
         '<td class="al-r">'+_kg(c.planRows.reduce((s,r)=>s+r.split['2100'].kg,0))+'</td>' +
         '<td class="al-r">'+_kg(c.planRows.reduce((s,r)=>s+r.split['2101'].kg,0))+'</td>' +
         '<td class="al-r al-b">'+_kg(tot)+' kg</td></tr></tbody>';
    t.innerHTML = h;
  }

  function _renderResult(c){
    const t = _gid('alResTbl'); if(!t) return;
    const sub = _gid('alResSub');
    if(sub) sub.textContent = 'Mốc SAP ' + _isoToDisp(c.iso) + ' → sau fill → sau bán · đơn vị kg';
    let h = '<thead><tr>' +
      '<th rowspan="2" style="width:104px">Vị trí</th><th rowspan="2" style="width:96px">Batch</th>' +
      '<th colspan="3" class="al-grp">Tồn SAP</th>' +
      '<th colspan="3" class="al-grp al-grp-f">Fill từ 1100</th>' +
      '<th colspan="3" class="al-grp al-grp-s">Xuất bán</th>' +
      '<th colspan="3" class="al-grp al-grp-e">Tồn cuối</th></tr>' +
      '<tr>' + [0,1,2,3].map(()=>'<th class="al-r al-sub">C3</th><th class="al-r al-sub">C4</th><th class="al-r al-sub">LPG</th>').join('') +
      '</tr></thead><tbody>';

    SLOCS.forEach(sl => {
      BATCHES.forEach((b, bi) => {
        const B = c.base[sl][b], F = (sl==='1100')
          ? { C3: c.afterFill[sl][b].C3 - c.base[sl][b].C3, C4: c.afterFill[sl][b].C4 - c.base[sl][b].C4 }
          : c.fill[sl][b];
        const S = c.sell[sl][b], E = c.end[sl][b];
        h += '<tr class="'+(bi===0?'al-rule':'')+'">' +
          (bi===0 ? '<td rowspan="2" class="al-loc"><b>'+_esc(SLOC_NAME[sl])+'</b><span>'+sl+'</span></td>' : '') +
          '<td><span class="al-chip al-chip-'+b.toLowerCase()+'"></span>'+b+' · '+BATCH_NAME[b]+'</td>' +
          '<td class="al-r">'+_cell(B.C3)+'</td><td class="al-r">'+_cell(B.C4)+'</td><td class="al-r al-b">'+_cell(B.C3+B.C4)+'</td>' +
          '<td class="al-r al-tf">'+_cell(F.C3)+'</td><td class="al-r al-tf">'+_cell(F.C4)+'</td><td class="al-r al-tf al-b">'+_cell(F.C3+F.C4)+'</td>' +
          '<td class="al-r al-ts">'+_cell(-S.C3)+'</td><td class="al-r al-ts">'+_cell(-S.C4)+'</td><td class="al-r al-ts al-b">'+_cell(-(S.C3+S.C4))+'</td>' +
          '<td class="al-r al-te">'+_cell(E.C3)+'</td><td class="al-r al-te">'+_cell(E.C4)+'</td><td class="al-r al-te al-b">'+_cell(E.C3+E.C4)+'</td>' +
          '</tr>';
      });
      /* dòng tổng của vị trí */
      const sum = k => MATS.reduce((o,m)=>{ o[m] = c[k][sl].D[m] + c[k][sl].E[m]; return o; }, {});
      const bT = sum('base'), eT = sum('end');
      const fT = { C3: c.afterFill[sl].D.C3 + c.afterFill[sl].E.C3 - bT.C3,
                   C4: c.afterFill[sl].D.C4 + c.afterFill[sl].E.C4 - bT.C4 };
      const sT = { C3: c.sell[sl].D.C3 + c.sell[sl].E.C3, C4: c.sell[sl].D.C4 + c.sell[sl].E.C4 };
      h += '<tr class="al-sum al-sum-loc"><td colspan="2">Cộng '+_esc(SLOC_NAME[sl])+'</td>' +
        '<td class="al-r">'+_cell(bT.C3)+'</td><td class="al-r">'+_cell(bT.C4)+'</td><td class="al-r al-b">'+_cell(bT.C3+bT.C4)+'</td>' +
        '<td class="al-r">'+_cell(fT.C3)+'</td><td class="al-r">'+_cell(fT.C4)+'</td><td class="al-r al-b">'+_cell(fT.C3+fT.C4)+'</td>' +
        '<td class="al-r">'+_cell(-sT.C3)+'</td><td class="al-r">'+_cell(-sT.C4)+'</td><td class="al-r al-b">'+_cell(-(sT.C3+sT.C4))+'</td>' +
        '<td class="al-r">'+_cell(eT.C3)+'</td><td class="al-r">'+_cell(eT.C4)+'</td><td class="al-r al-b">'+_cell(eT.C3+eT.C4)+'</td></tr>';
    });
    h += '</tbody>';
    t.innerHTML = h;
  }

  function render(){
    _buildShell();
    const host = _gid('sub-alloc'); if(!host) return;
    const dates = _sapDates();
    if(!sapDate || dates.indexOf(sapDate) < 0) sapDate = dates[0] || '';
    _renderDateSel(dates);
    const c = compute();
    _renderVerdict(c);
    _renderCards(c);
    _renderLots(c);
    _renderPlan(c);
    _renderResult(c);
    const badge = _gid('alBadgeCount');
    if(badge) badge.textContent = c.planRows.length;
  }

  /* Gọi từ nút ⟳, từ ENG khi cờ ST đổi, và mỗi lần mở tab */
  function refresh(){
    try{ render(); }catch(e){ console.warn('[ALLOC] render', e); }
  }

  /* ============================================================
     7. INIT
     ============================================================ */
  function init(){
    _loadCache();
    if(!sapDate) sapDate = '';
    try{
      if(typeof firebase !== 'undefined' && firebase.database && !_attached){
        _fbRef = firebase.database().ref(FB_PATH);
        _fbRef.on('value', _onValue, e => {
          if(typeof fbErr === 'function') fbErr(e, 'Load allocation plan');
          else console.warn('[ALLOC] listener', e);
        });
        _attached = true;
      }
    }catch(e){ console.warn('[ALLOC] FB init', e); }
    const badge = _gid('alBadgeCount');
    if(badge) badge.textContent = Object.keys(LINES).length;
    console.log('[ALLOC] ✅ Init OK · '+Object.keys(LINES).length+' sale-plan lines');
  }

  return {
    init, render, refresh, compute,
    setDate, addLine, delLine, editLine,
    setLotBatch, toggleLot, clearPlan,
    loadFromToday, loadAllLots,
    get LINES(){ return LINES; },
    get lastCalc(){ return _lastCalc; }
  };
})();
window.ALLOC = ALLOC;
