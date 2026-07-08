/* ============================================================
 * ODOR — odor.js (v4.62.2)
 * v4.62.2: Dòng (*) đầu kỳ — cho NHẬP TAY Inventory (KG) ghi đè giá trị
 *   tính từ mức mm (m3 hiển thị back-calc theo KG). Để trống → tự tính từ
 *   mm như cũ. Giá trị này là tồn đầu kỳ cho Cal. Consumption tháng kế.
 * ------------------------------------------------------------
 * Tab "🧴 Odorant" (Engineer ▸ eng-pg-odor) — thay placeholder Lab Data.
 * Tái tạo sheet ODR_Consumption_Cavern của file "Cavern Odorant Stock".
 *
 * v4.62.1 (theo phản hồi vận hành):
 *   • C (LPG Mixing Q'ty)  = Σ FILLED LPG  [Tank Log cột 15] theo tháng
 *   • D (FQ 21171)         = Σ ODORANT     [Tank Log cột 26] theo tháng
 *   • Nút ↻ TỪNG DÒNG quét Tank Log → tính C/D → LƯU Firebase.
 *     Sửa LG 21201 (mm) cũng tự quét lại tháng đó + lưu.
 *     Toolbar ↻ Scan All quét mọi tháng một lượt (1 bulk write).
 *   • Kết quả C/D được LƯU vào eng_odorant (không chỉ tính sống) —
 *     máy khác xem được ngay không cần tải Tank Log.
 *   • Bảng sắp xếp THÁNG MỚI NHẤT LÊN TRÊN (Average trên cùng,
 *     dòng (*) đầu kỳ + Total dưới cùng). Export CSV giữ thứ tự
 *     thời gian tăng dần như file Excel gốc.
 *   • Paste chấp nhận copy CẢ SHEET (Ctrl+A): tự bỏ tiêu đề/Average/
 *     Total, tự tìm cột Date trong 4 cột đầu, hiểu các định dạng
 *     ngày 2025-01 · 01/01/2025 · 1/1/25 · Jan-25 · 31-Dec-24…
 *   • Mở tab KHÔNG tự tải toàn bộ Tank Log nữa — chỉ khi bấm quét.
 *
 * Tự tính (giữ nguyên công thức Excel):
 *   H = m³ từ mức G — bồn V-101 nằm ngang, đầu elip 2:1,
 *       D 2700 · L 5400 · a 675 (khớp Excel <1 lít)
 *   I = ROUND(H·E·1000, 2)   ·  J = I(prev) + F − I  ·  K = J − D
 *   L = 2 956 800 000/17 191 ·  M = L·J  ·  N = C/J
 *   O = J·10⁶/(C·1000) ppm   ·  P = I/15·1000 (MT @15ppm)
 *
 * Firebase: node 'eng_odorant' — child 'YYYY-MM' hoặc 'init'
 *   { c,d,e,f,g,rm } — delta write từng child (Spark-frugal).
 * ============================================================ */
const ODOR = (function(){
  'use strict';
  const CACHE_KEY = 'lpg_v4_odor_v1';
  const FB_PATH   = 'eng_odorant';

  /* ---- constants (mirror the Excel workbook) ---- */
  const TKGEO = { R:1350, L:5400, A:675, MAX:2700 };   // V-101 geometry (mm)
  const DEF_GRAV = 0.82248115147;                      // kg/l (Excel E)
  const PPM_BASE = 15;                                 // P5 — ppm design dose
  const PRICE    = Math.round(2956800000/17191*100)/100; // 171997.56 VND/kg
  const ALARM    = { hh:24000, h:22000, l:2000 };      // R/S/T inventory kg

  /* D  = { 'YYYY-MM': {c,d,e,f,g,rm}, init:{d,e,f,g,rm} } */
  let D = {};
  let _fbRef = null;
  let _suppressEcho = 0;
  let _newRow = false;   /* v4.63 — đang hiện dòng chọn tháng mới */

  /* ================= geometry: level mm → m³ ================= */
  function mmToM3(h){
    h = Math.max(0, Math.min(TKGEO.MAX, h));
    const R = TKGEO.R, L = TKGEO.L, a = TKGEO.A;
    const cyl = L * (R*R*Math.acos((R-h)/R) - (R-h)*Math.sqrt(Math.max(0, 2*R*h - h*h)));
    const heads = (a/R) * Math.PI * h*h * (3*R - h) / 3;
    return (cyl + heads) / 1e9;
  }
  /* v4.63 — Excel lấy H (m3) đã LÀM TRÒN 4 SỐ LẺ rồi mới tính KG:
     I = ROUND(H·E·1000, 2). Làm tròn 4dp ở đây để cột Inventory khớp Excel. */
  function _hLevel(g){ return Math.round(mmToM3(g)*1e4)/1e4; }

  /* ================= helpers ================= */
  function _n(v){ const x = parseFloat(String(v==null?'':v).replace(/,/g,'')); return isNaN(x) ? null : x; }
  function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmt(v, d){
    if(v == null || v === '' || isNaN(v)) return '';
    return Number(v).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
  }

  /* ---- tolerant date parsing: 2025-01 · 2025-01-31 · 31/12/2024 ·
         1/1/25 · 31-Dec-24 · Jan-25 · Dec 2024 · 01-2025 ---- */
  const _MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                   'thg1':1,'thg2':2,'thg3':3,'thg4':4,'thg5':5,'thg6':6,
                   'thg7':7,'thg8':8,'thg9':9,'thg10':10,'thg11':11,'thg12':12};
  function _parseDateAny(v){
    const s = String(v||'').trim();
    if(!s) return null;
    let m = s.match(/^(\d{4})[-\/\.](\d{1,2})(?:[-\/\.](\d{1,2}))?/);          // yyyy-mm[-dd]
    if(m && +m[2] >= 1 && +m[2] <= 12) return { y:+m[1], mo:+m[2], d:m[3]?+m[3]:1 };
    m = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/);                 // dd/mm/yy(yy)
    if(m && +m[2] >= 1 && +m[2] <= 12){
      let y = +m[3]; if(y < 100) y += 2000;
      return { y, mo:+m[2], d:+m[1] };
    }
    m = s.match(/^(\d{1,2})[-\s\/\.]([A-Za-z]{3,})[-\s,\/\.]*(\d{2,4})$/);      // 31-Dec-24 · 28/Jun/26 · 28.Jun.26
    if(m){
      const mo = _MONTHS[m[2].slice(0,3).toLowerCase()];
      if(mo){ let y = +m[3]; if(y < 100) y += 2000; return { y, mo, d:+m[1] }; }
    }
    m = s.match(/^([A-Za-z]{3,})[-\s]+(\d{2,4})$/);                            // Jan-25 / Dec 2024
    if(m){
      const mo = _MONTHS[m[1].slice(0,3).toLowerCase()];
      if(mo){ let y = +m[2]; if(y < 100) y += 2000; return { y, mo, d:1 }; }
    }
    m = s.match(/^(\d{1,2})[-\/](\d{4})$/);                                    // 01/2025
    if(m && +m[1] >= 1 && +m[1] <= 12) return { y:+m[2], mo:+m[1], d:1 };
    return null;
  }
  function _ym(v){
    const p = _parseDateAny(v);
    return p ? (p.y+'-'+String(p.mo).padStart(2,'0')) : null;
  }
  function _isDate(v){ return _parseDateAny(v) !== null; }
  function _ymLabel(ym){ const p = ym.split('-'); return '01/'+p[1]+'/'+p[0].slice(2); }
  function _ymNext(ym){
    let y = +ym.slice(0,4), m = +ym.slice(5,7);
    m++; if(m > 12){ m = 1; y++; }
    return y+'-'+String(m).padStart(2,'0');
  }
  function _nowYm(){
    const d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function _todayISO(){ const d=new Date(), p=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  function _lastDayOfYm(ym){ return new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate(); }
  /* v4.63.1 — tháng hiển thị bằng CHỮ (Jan…Dec) để tránh nhầm ngày/tháng */
  const _MON_EN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  /* v4.63 — Date hiển thị: tháng đã qua → ngày CUỐI tháng; tháng hiện tại →
     ngày nhập dữ liệu mới nhất (ud) hoặc hôm nay nếu chưa có. */
  function _rowDateLabel(ym, ud){
    if(ym === _nowYm()){
      const s = (ud && /^\d{4}-\d{2}-\d{2}$/.test(ud)) ? ud : _todayISO();
      const p = s.split('-'); return p[2]+'-'+_MON_EN[+p[1]]+'-'+p[0].slice(2);
    }
    const dd = String(_lastDayOfYm(ym)).padStart(2,'0'), p = ym.split('-');
    return dd+'-'+_MON_EN[+p[1]]+'-'+p[0].slice(2);
  }

  /* ================= cache / firebase ================= */
  function _loadCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(raw){ const o = JSON.parse(raw); if(o && typeof o === 'object') D = o; }
    }catch(_){ D = {}; }
  }
  function _saveCache(){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify(D)); }catch(_){} }

  function _fbSet(key, obj){
    if(!_fbRef) return;
    _suppressEcho++;
    _fbRef.child(key).set(obj)
      .catch(e => console.warn('[ODOR] fb set', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 400));
  }
  function _fbBulk(map){
    if(!_fbRef) return;
    _suppressEcho++;
    _fbRef.update(map)
      .catch(e => console.warn('[ODOR] fb bulk', e))
      .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0, _suppressEcho-1); }, 600));
  }

  /* ================= Tank Log monthly sums =================
     v4.62.1:  C = Σ r[15] FILLED LPG (ton) · D = Σ r[26] ODORANT (kg) */
  function _tlSums(){
    const out = {};
    const rows = (typeof ENG !== 'undefined' && ENG.ROWS) ? ENG.ROWS : [];
    rows.forEach(r=>{
      const ym = _ym(r[3]); if(!ym) return;
      const q = _n(r[15]), o = _n(r[26]);
      if(!out[ym]) out[ym] = { qty:0, odo:0, lots:0 };
      if(q != null) out[ym].qty += q;
      if(o != null) out[ym].odo += o;
      out[ym].lots++;
    });
    return out;
  }

  /* ================= month list =================
     Từ tháng sau init → tháng hiện tại (điền đủ tháng trống) + mọi
     tháng đã lưu. KHÔNG lấy tháng từ Tank Log (tránh 1 dòng gõ sai
     năm làm nở bảng). */
  function _monthList(){
    const stored = Object.keys(D).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort();
    let start = null;
    if(D.init && D.init.d){
      const iym = _ym(D.init.d);
      if(iym) start = _ymNext(iym);
    }
    if(!start) start = stored.length ? stored[0] : _nowYm();
    let end = _nowYm();
    if(stored.length && stored[stored.length-1] > end) end = stored[stored.length-1];
    const out = [];
    let cur = start, guard = 0;
    while(cur <= end && guard < 400){ out.push(cur); cur = _ymNext(cur); guard++; }
    stored.forEach(m=>{ if(out.indexOf(m) < 0) out.push(m); });
    return out.sort();
  }

  /* ================= compute rows (ascending — chain I/J) ================= */
  function _compute(){
    const init = D.init || null;
    let initRow = null, prevI = null, prevE = DEF_GRAV, prevL = PRICE;
    if(init){
      const ge = _n(init.e) != null ? _n(init.e) : DEF_GRAV;
      const gg = _n(init.g);
      const hAuto = gg != null ? _hLevel(gg) : null;
      const iAuto = hAuto != null ? Math.round(hAuto*ge*1000*100)/100 : null;
      const iov = _n(init.i);            /* v4.62.2 — Inventory KG nhập tay (ghi đè mm) */
      let h, i;
      if(iov != null){
        i = Math.round(iov*100)/100;
        h = ge ? Math.round(i/(ge*1000)*1e4)/1e4 : hAuto;   /* back-calc m3 cho khớp KG */
      } else {
        h = hAuto; i = iAuto;
      }
      const glp = _n(init.l);            /* v4.63.2 — đơn giá nhập tay ở dòng đầu kỳ */
      const il = glp != null ? glp : PRICE;
      initRow = { d:init.d||'', e:ge, f:_n(init.f), g:gg, h, i, iAuto,
                  manualI:(iov!=null), l:(i!=null?il:null), lSet:(glp!=null), rm:init.rm||'' };
      prevI = i; prevE = ge; prevL = il;
    }
    const rows = [];
    _monthList().forEach(ym=>{
      const st = D[ym] || {};
      const c = _n(st.c), d = _n(st.d);
      const e = _n(st.e) != null ? _n(st.e) : prevE;
      const f = _n(st.f);
      const g = _n(st.g);
      const lStored = _n(st.l);                    /* v4.63.2 — đơn giá override */
      if(lStored != null) prevL = lStored;         /* áp dụng từ tháng này trở đi */
      let h = null, i = null, j = null, k = null, l = prevL, mcost = null, ratio = null, ppm = null, avail = null;
      if(g != null){
        h = _hLevel(g);
        i = Math.round(h*e*1000*100)/100;
        if(prevI != null){
          j = Math.round((prevI + (f||0) - i)*100)/100;
          k = d != null ? Math.round((j - d)*100)/100 : null;
          mcost = Math.round(l*j);
          if(j) ratio = c != null ? c/j : null;
          if(c) ppm = j*1000/c;             /* = J·10⁶/(C·1000) */
        }
        avail = i/PPM_BASE*1000;             /* MT @15ppm */
        prevI = i;                            /* chain */
      }
      prevE = e;
      rows.push({ ym, c, d, e, f, g, h, i, j, k, l, mcost, ratio, ppm, avail, lSet:(lStored!=null), rm: st.rm||'', ud: st.ud||'' });
    });
    return { initRow, rows };
  }

  /* ================= SCAN Tank Log → save C/D =================
     Cần FULL Tank Log — tự ENG.loadAll nếu đang ở chế độ 10 lot. */
  function _withFullTankLog(fn){
    if(typeof ENG !== 'undefined' && ENG.loadAll && !ENG.allLoaded){
      toast('⏳ Đang tải toàn bộ Tank Log…','');
      ENG.loadAll(fn);
    } else fn();
  }
  function scanMonth(ym){
    _withFullTankLog(()=>{
      const s = _tlSums()[ym];
      if(!D[ym]) D[ym] = {};
      D[ym].c = s ? Math.round(s.qty*1000)/1000 : 0;
      D[ym].d = s ? Math.round(s.odo*100)/100  : 0;
      D[ym].ud = _todayISO();                 /* v4.63 — ngày nhập dữ liệu mới nhất */
      _saveCache();
      _fbSet(ym, D[ym]);
      render();
      toast(s
        ? '↻ '+_ymLabel(ym)+' · '+s.lots+' lot · Mixing '+_fmt(D[ym].c,2)+' MT · FQ '+_fmt(D[ym].d,2)+' kg — đã lưu'
        : '⚠ '+_ymLabel(ym)+': không có lot nào trong Tank Log', s ? 'ok' : 'warn');
    });
  }
  function scanAll(){
    _withFullTankLog(()=>{
      const tl = _tlSums();
      const fb = {};
      let n = 0;
      _monthList().forEach(ym=>{
        const s = tl[ym];
        if(!s) return;                       /* tháng không có lot → giữ nguyên */
        if(!D[ym]) D[ym] = {};
        D[ym].c = Math.round(s.qty*1000)/1000;
        D[ym].d = Math.round(s.odo*100)/100;
        D[ym].ud = _todayISO();               /* v4.63 — ngày nhập mới nhất */
        fb[ym] = D[ym];
        n++;
      });
      _saveCache();
      if(n) _fbBulk(fb);
      render();
      toast('↻ Đã quét Tank Log: cập nhật '+n+' tháng (đã lưu Firebase)','ok');
    });
  }

  /* ================= render ================= */
  const _CSS = '.odor-tbl{border-collapse:collapse;font-size:11.5px;white-space:nowrap;min-width:1500px}' +
    '.odor-tbl th,.odor-tbl td{border:1px solid var(--line,#d7dbe0);padding:3px 6px}' +
    '.odor-tbl thead th{background:var(--panel-2,#eef1f4);font-weight:700;text-align:center;position:sticky;top:0;z-index:2}' +
    '.odor-tbl thead tr.u th{top:auto;font-weight:600;color:var(--ink-3,#888);font-size:10.5px}' +
    '.odor-tbl td.r{text-align:right;font-variant-numeric:tabular-nums}' +
    '.odor-tbl td.c{text-align:center}' +
    '.odor-tbl tr.avg td{background:#fbf6e9;font-weight:600}' +
    '.odor-tbl tr.tot td{background:var(--panel-2,#eef1f4);font-weight:700}' +
    '.odor-tbl tr.ini td{background:#f2f7ff}' +
    '.odor-inp{width:74px;border:1px solid transparent;border-radius:3px;background:transparent;text-align:right;font:inherit;padding:1px 3px}' +
    '.odor-inp:hover{border-color:var(--line,#ccd)}' +
    '.odor-inp:focus{border-color:var(--blue,#2f80ed);background:#fff;outline:none}' +
    '.odor-inp.rm{width:130px;text-align:left}' +
    '.odor-inp.lvl{background:#fff8e6;border-color:#eadfbc;font-weight:700}' +
    '.odor-inp.price{width:92px}' +
    '.odor-inp.price.set{background:#eef7ee;border-color:#cfe6cf}' +   /* giá đã sửa tay */
    '.odor-inp.grav{width:100px}' +                                   /* focus hiện đủ số */
    '.odor-scan{border:1px solid var(--line,#ccd);border-radius:4px;background:#fff;cursor:pointer;' +
      'font-size:12px;line-height:1;padding:3px 6px;color:var(--blue,#2f80ed)}' +
    '.odor-scan:hover{background:var(--blue,#2f80ed);color:#fff}' +
    '.odor-low{color:var(--red,#d33);font-weight:700}' +
    /* tháng hiện tại — nổi bật rõ: nền đậm, chữ đậm, viền xanh trên/dưới + vạch trái */
    '.odor-tbl tr.cur td{background:#cfe4ff;font-weight:700;' +
      'border-top:2px solid var(--blue,#2f80ed);border-bottom:2px solid var(--blue,#2f80ed)}' +
    '.odor-tbl tr.cur td:first-child{box-shadow:inset 5px 0 0 var(--blue,#2f80ed)}' +
    '.odor-tbl tr.cur .odor-inp{font-weight:700}' +
    '.odor-avg-ppm{font-weight:800;color:var(--blue,#2f80ed);background:#eaf3ff;font-size:12.5px}' +
    '.odor-del{border:none;background:transparent;cursor:pointer;color:var(--ink-3,#aaa);' +
      'font-size:12px;line-height:1;padding:0 2px}' +
    '.odor-del:hover{color:var(--red,#d33)}';

  function render(){
    const wrap = document.getElementById('odorTableWrap');
    const stats = document.getElementById('odorStats');
    const badge = document.getElementById('engBadgeOdor');
    if(!wrap) return;
    const { initRow, rows } = _compute();
    if(badge) badge.textContent = rows.length;

    /* averages / totals (mirror Excel row 5 & 26) */
    const avg = a => { const v = a.filter(x=>x!=null); return v.length ? v.reduce((s,x)=>s+x,0)/v.length : null; };
    const sum = a => { const v = a.filter(x=>x!=null); return v.length ? v.reduce((s,x)=>s+x,0) : null; };
    const aC = avg(rows.map(r=>r.c)), aD = avg(rows.map(r=>r.d)), aE = avg(rows.map(r=>r.e));
    const aJ = avg(rows.map(r=>r.j)), aK = avg(rows.map(r=>r.k)), aM = avg(rows.map(r=>r.mcost));
    const aL = avg(rows.map(r=>r.l));
    const tC = sum(rows.map(r=>r.c)), tD = sum(rows.map(r=>r.d));
    const tJ = sum(rows.map(r=>r.j)), tK = sum(rows.map(r=>r.k));
    const tO = (tJ != null && tC) ? tJ*1000/tC : null;

    const inp = (key, field, val, cls, ph, dec)=>{
      const shown = (val==null||val==='') ? '' : (dec!=null ? String(+(+val).toFixed(dec)) : String(val));
      return '<input class="odor-inp '+(cls||'')+'" value="'+_esc(shown)+'" placeholder="'+_esc(ph||'')+'"'+
        ' onchange="ODOR.cellEdit(\''+key+'\',\''+field+'\',this.value)">';
    };
    /* v4.63.3 — Gravity: hiển thị 3 số lẻ (KHÔNG làm tròn giá trị lưu),
       click/focus → hiện đầy đủ; blur (không sửa) → thu về 3 số lẻ. */
    const grav = (key, stored, effVal)=>{
      const full = (effVal==null) ? '' : String(effVal);
      const d3   = (effVal==null) ? '' : (+effVal).toFixed(3);
      const value = stored ? d3 : '';
      const ph    = stored ? '' : d3;                 /* chưa lưu → 3dp làm placeholder */
      const dataFull = stored ? full : '';            /* chỉ populate khi đã lưu */
      return '<input class="odor-inp grav" value="'+_esc(value)+'" placeholder="'+_esc(ph)+'"'+
        ' data-full="'+_esc(dataFull)+'"'+
        ' onfocus="if(this.dataset.full){this.value=this.dataset.full;}this.select()"'+
        ' onblur="ODOR.gravBlur(this)"'+
        ' onchange="ODOR.cellEdit(\''+key+'\',\'e\',this.value)">';
    };

    let html = '<style>'+_CSS+'</style><table class="odor-tbl"><thead>'+
      '<tr>'+
      '<th rowspan="2" title="Quét Tank Log">↻</th>'+
      '<th rowspan="2">No.</th><th rowspan="2">Date</th>'+
      '<th>LPG Mixing Q\'Ty</th><th>FQ 21171</th><th>Gravity</th><th>Charging</th><th>LG 21201</th>'+
      '<th colspan="2">Inventory</th><th>Cal. Consumption</th><th>Consumption &amp; FQ Diff.</th>'+
      '<th>Price/ Unit</th><th>Monthly Cost</th><th>Ratio Mixing &amp; Consump.</th>'+
      '<th>Cal. Odorant Concentration</th><th>Available Mixing Q\'ty</th><th rowspan="2">Remark</th>'+
      '</tr>'+
      '<tr class="u"><th>MT</th><th>KG</th><th>Kg/cm3</th><th>Kg</th><th>mm</th><th>m3</th><th>KG</th>'+
      '<th>KG</th><th>KG</th><th>VND/KG</th><th>VND</th><th>MT/KG</th><th>ppm</th><th>MT</th></tr>'+
      '</thead><tbody>';

    /* Average row */
    html += '<tr class="avg"><td></td><td class="c" colspan="2">Average</td>'+
      '<td class="r">'+_fmt(aC,2)+'</td><td class="r">'+_fmt(aD,2)+'</td><td class="r">'+_fmt(aE,3)+'</td>'+
      '<td class="c">-</td><td class="c">-</td><td class="c">-</td><td class="c">-</td>'+
      '<td class="r">'+_fmt(aJ,2)+'</td><td class="r">'+_fmt(aK,2)+'</td>'+
      '<td class="r">'+_fmt(aL!=null?aL:PRICE,2)+'</td><td class="r">'+_fmt(aM,0)+'</td>'+
      '<td class="c">-</td>'+
      '<td class="r odor-avg-ppm" title="Nồng độ odorant trung bình = ΣConsumption·10⁶ / (ΣMixing·1000)">'+_fmt(tO,2)+'</td>'+
      '<td class="c">-</td><td></td></tr>';

    /* dòng thêm tháng mới (v4.63) — chọn tháng ở cột Date */
    if(_newRow){
      html += '<tr class="ini"><td></td>'+
        '<td class="c" style="font-weight:700;color:var(--blue,#2f80ed)">＋</td>'+
        '<td class="c"><input type="month" id="odorNewMonth" style="font:inherit;padding:1px 3px"'+
          ' onchange="ODOR.commitNewMonth(this.value)"></td>'+
        '<td colspan="15" style="text-align:left;color:var(--ink-3,#888)">'+
          'Chọn tháng để thêm dòng mới · '+
          '<a href="javascript:void(0)" onclick="ODOR.cancelNewMonth()" style="color:var(--red,#d33)">Hủy</a>'+
        '</td></tr>';
    }

    /* month rows — NEWEST FIRST (v4.62.1) */
    const desc = rows.slice().reverse();
    desc.forEach(r=>{
      const noAsc = rows.indexOf(r) + 1;            /* số thứ tự theo thời gian như Excel */
      const lowCls = (r.i != null && r.i < ALARM.l) ? ' odor-low' : '';
      const curCls = (r.ym === _nowYm()) ? ' class="cur"' : '';
      html += '<tr'+curCls+'>'+
        '<td class="c" style="white-space:nowrap">'+
          '<button class="odor-scan" title="Quét Tank Log tháng '+_ymLabel(r.ym)+' → tính C/D và lưu"'+
          ' onclick="ODOR.scanMonth(\''+r.ym+'\')">↻</button>'+
          '<button class="odor-del" title="Xóa dòng tháng '+_ymLabel(r.ym)+'"'+
          ' onclick="ODOR.deleteRow(\''+r.ym+'\')">✕</button></td>'+
        '<td class="c">'+noAsc+'</td><td class="c">'+_rowDateLabel(r.ym, r.ud)+'</td>'+
        '<td class="r">'+inp(r.ym,'c', r.c, '', '↻ để quét', 3)+'</td>'+
        '<td class="r">'+inp(r.ym,'d', r.d, '', '↻ để quét', 2)+'</td>'+
        '<td class="r">'+grav(r.ym, (D[r.ym]&&D[r.ym].e!==''&&D[r.ym].e!=null), r.e)+'</td>'+
        '<td class="r">'+inp(r.ym,'f', r.f, '', '0', 2)+'</td>'+
        '<td class="r">'+inp(r.ym,'g', r.g, 'lvl', 'mm ?', 0)+'</td>'+
        '<td class="r">'+_fmt(r.h,4)+'</td>'+
        '<td class="r'+lowCls+'">'+_fmt(r.i,2)+'</td>'+
        '<td class="r" style="font-weight:700;color:var(--green,#1a7f37)">'+_fmt(r.j,2)+'</td>'+
        '<td class="r" style="color:'+(r.k!=null&&Math.abs(r.k)>((r.d||0)*0.1+1)?'var(--red,#d33)':'inherit')+'">'+_fmt(r.k,2)+'</td>'+
        '<td class="r">'+inp(r.ym,'l', r.l, 'price'+(r.lSet?' set':''), String(PRICE), 2)+'</td>'+
        '<td class="r">'+_fmt(r.mcost,0)+'</td>'+
        '<td class="r">'+_fmt(r.ratio,2)+'</td>'+
        '<td class="r" style="font-weight:600">'+_fmt(r.ppm,2)+'</td>'+
        '<td class="r">'+_fmt(r.avail,0)+'</td>'+
        '<td><input class="odor-inp rm" value="'+_esc(r.rm)+'" onchange="ODOR.cellEdit(\''+r.ym+'\',\'rm\',this.value)"></td>'+
        '</tr>';
    });

    /* Initial (*) row — dưới cùng (tháng cũ nhất) */
    const ir = initRow || { d:'', e:DEF_GRAV, f:null, g:null, h:null, i:null, iAuto:null, manualI:false, l:null, lSet:false, rm:'' };
    html += '<tr class="ini"><td></td><td class="c">(*)</td>'+
      '<td class="c"><input class="odor-inp" style="width:76px;text-align:center" value="'+_esc(ir.d?String(ir.d):'')+'"'+
        ' placeholder="31/12/24" onchange="ODOR.cellEdit(\'init\',\'d\',this.value)"></td>'+
      '<td></td><td class="r">0</td>'+
      '<td class="r">'+grav('init', (D.init&&D.init.e!==''&&D.init.e!=null), ir.e)+'</td>'+
      '<td class="r">'+inp('init','f', ir.f, '', '0', 2)+'</td>'+
      '<td class="r">'+inp('init','g', ir.g, 'lvl', 'mm', 0)+'</td>'+
      '<td class="r">'+_fmt(ir.h,4)+'</td>'+
      '<td class="r">'+inp('init','i', ir.manualI?ir.i:null, ir.manualI?'lvl':'',
          (ir.iAuto!=null?String(+ir.iAuto.toFixed(2)):'auto'), 2)+'</td>'+
      '<td class="c">-</td><td class="c">-</td>'+
      '<td class="r">'+inp('init','l', ir.l, 'price'+(ir.lSet?' set':''), String(PRICE), 2)+'</td>'+
      '<td></td><td></td><td></td><td></td>'+
      '<td><input class="odor-inp rm" value="'+_esc(ir.rm||'')+'" placeholder="Initial Import Q\'ty"'+
        ' onchange="ODOR.cellEdit(\'init\',\'rm\',this.value)"></td></tr>';

    /* Total row */
    html += '<tr class="tot"><td></td><td class="c" colspan="2">Total</td>'+
      '<td class="r">'+_fmt(tC,2)+'</td><td class="r">'+_fmt(tD,2)+'</td><td></td><td></td><td></td><td></td><td></td>'+
      '<td class="r">'+_fmt(tJ,2)+'</td><td class="r">'+_fmt(tK,2)+'</td><td></td><td></td><td></td>'+
      '<td class="r">'+_fmt(tO,2)+'</td><td></td><td></td></tr>';

    html += '</tbody></table>';
    wrap.innerHTML = html;

    if(stats){
      stats.innerHTML = '<b>'+rows.length+'</b> tháng · giá '+_fmt(PRICE,2)+' VND/kg · '+PPM_BASE+' ppm'
        + ' · C = Σ Filled LPG · D = Σ Odorant (Tank Log)';
    }
  }

  /* ================= thêm tháng mới (v4.63) ================= */
  function addMonth(){
    _newRow = true;
    render();
    /* focus vào ô chọn tháng vừa hiện */
    setTimeout(()=>{ document.getElementById('odorNewMonth')?.focus(); }, 60);
  }
  function cancelNewMonth(){ _newRow = false; render(); }
  function commitNewMonth(v){
    const ym = String(v||'').trim();
    if(!/^\d{4}-\d{2}$/.test(ym)){ toast('⚠ Hãy chọn một tháng hợp lệ','er'); return; }
    if(D[ym]){ toast('⚠ Tháng '+_ymLabel(ym)+' đã có trong bảng','warn'); _newRow = false; render(); return; }
    D[ym] = { c:'', d:'', e:'', f:'', g:'', rm:'' };
    _newRow = false;
    _saveCache();
    _fbSet(ym, D[ym]);
    render();
    toast('➕ Đã thêm tháng '+_ymLabel(ym)+' — bấm ↻ để quét Tank Log','ok');
  }

  /* ================= xóa dòng tháng (v4.63) ================= */
  function deleteRow(ym){
    if(!/^\d{4}-\d{2}$/.test(ym) || !D[ym]) return;
    const note = (ym < _nowYm() && _isAutoMonth(ym))
      ? '\n\n(Đây là tháng trong khoảng từ đầu kỳ → hiện tại nên dòng sẽ hiện lại dạng trống sau khi xóa dữ liệu.)'
      : '';
    if(!confirm('Xóa dòng tháng '+_ymLabel(ym)+'?'+note)) return;
    delete D[ym];
    _saveCache();
    if(_fbRef){
      _suppressEcho++;
      _fbRef.child(ym).remove()
        .catch(e=>console.warn('[ODOR] fb remove', e))
        .finally(()=> setTimeout(()=>{ _suppressEcho = Math.max(0,_suppressEcho-1); }, 400));
    }
    render();
    toast('🗑 Đã xóa dòng tháng '+_ymLabel(ym),'ok');
  }
  /* tháng thuộc khoảng tự sinh (đầu kỳ+1 → hiện tại) sẽ tái tạo dạng trống */
  function _isAutoMonth(ym){
    let start = null;
    if(D.init && D.init.d){ const iym = _ym(D.init.d); if(iym) start = _ymNext(iym); }
    if(!start) return false;
    return ym >= start && ym <= _nowYm();
  }

  /* v4.63.3 — blur ô Gravity: nếu KHÔNG sửa gì thì thu hiển thị về 3 số lẻ
     (giá trị lưu vẫn đầy đủ). Nếu đã sửa → cellEdit lo (render vẽ lại). */
  function gravBlur(el){
    const full = el.dataset.full;
    if(!full || el.value === '') return;
    if(parseFloat(el.value) === parseFloat(full)) el.value = (+full).toFixed(3);
  }

  /* ================= edits ================= */
  function cellEdit(key, field, value){
    const v = String(value==null?'':value).trim();
    if(!D[key]) D[key] = {};
    if(field === 'd' && key === 'init'){ D[key].d = v; }         /* init date = text */
    else if(field === 'rm'){ D[key].rm = v; }
    else { D[key][field] = v === '' ? '' : (_n(v) != null ? _n(v) : v); }
    /* v4.63 — sửa dữ liệu 1 tháng → ghi nhận ngày nhập mới nhất */
    if(/^\d{4}-\d{2}$/.test(key) && 'cdefg'.includes(field)){ D[key].ud = _todayISO(); }
    _saveCache();
    _fbSet(key, D[key]);
    /* v4.63.x — Khi NHẬP GIÁ TRỊ LEVEL (LG 21201, cột g) phải kiểm tra Tank Log
       đã tải ĐẦY ĐỦ chưa (mặc định chỉ tải 10 lot mới nhất). Nếu chưa full →
       gọi ENG.loadAll rồi mới tính toán/thống kê; nếu đã full → tính ngay.
       Cả hai nhánh dưới đây đều đi qua _withFullTankLog (trực tiếp hoặc gián
       tiếp qua scanMonth) nên không bao giờ tính trên dữ liệu thiếu:
         • Dòng tháng  : scanMonth() đã tự bọc _withFullTankLog (quét C/D + lưu).
         • Dòng đầu kỳ : chỉ cần đảm bảo full rồi render lại chuỗi I/J. */
    if(field === 'g' && v !== ''){
      if(key !== 'init') scanMonth(key);
      else _withFullTankLog(render);
      return;
    }
    render();
  }

  /* ================= paste (sheet ODR_Consumption_Cavern — chấp nhận copy cả sheet) ================= */
  function openPaste(){
    const ta = document.getElementById('odorPasteArea');
    if(ta) ta.value = '';
    document.getElementById('odorPasteModal')?.classList.add('on');
    setTimeout(()=>{ ta && ta.focus(); }, 100);
  }
  function closePaste(){ document.getElementById('odorPasteModal')?.classList.remove('on'); }
  function doPaste(){
    const ta = document.getElementById('odorPasteArea');
    if(!ta){ closePaste(); return; }
    pasteText(ta.value || '');
    closePaste();
  }
  function pasteText(text){
    const lines = String(text||'').split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim());
    let nMonth = 0, nInit = 0;
    const fb = {};
    const skipped = [];
    lines.forEach(ln=>{
      const cols = ln.split('\t');
      if(cols.length < 5) return;                       /* tiêu đề / dòng lẻ */
      /* tìm cột Date trong 4 cột đầu (copy A..Q → idx1; B..Q → idx0…) */
      let off = -1;
      for(let i = 0; i < Math.min(4, cols.length); i++){
        if(_isDate(cols[i])){ off = i; break; }
      }
      if(off < 0){
        const c0 = (cols[0]||'').trim().toLowerCase();
        if(c0 && c0 !== 'no.' && c0 !== 'no' && c0 !== 'total' && c0 !== 'average'
           && !/terminal|contents|date/i.test(ln.slice(0,40))) skipped.push(cols[0]||cols[1]||'?');
        return;
      }
      const parsed = _parseDateAny(cols[off]);
      const dateStr = cols[off].trim();
      const c  = (cols[off+1]||'').trim();
      const d  = (cols[off+2]||'').trim();
      const e  = (cols[off+3]||'').trim();
      const f  = (cols[off+4]||'').trim();
      const g  = (cols[off+5]||'').trim();
      const rm = (cols[off+15]||'').trim();             /* Q = Remark */
      const pre = cols.slice(0, off).join(' ');
      const isInit = /\(\*\)/.test(pre) || /initial/i.test(rm)
                  || (parsed.d >= 25 && _n(c) == null);  /* dòng đầu kỳ cuối tháng, C trống */
      const obj = {
        c: _n(c) != null ? _n(c) : '',
        d: _n(d) != null ? _n(d) : '',
        e: _n(e) != null ? _n(e) : '',
        f: _n(f) != null ? _n(f) : '',
        g: _n(g) != null ? _n(g) : '',
        rm: rm
      };
      if(isInit){
        fb['init'] = { d: dateStr, e: obj.e, f: obj.f, g: obj.g, rm: rm };
        nInit++;
      } else {
        const ym = _ym(dateStr); if(!ym) return;
        fb[ym] = obj;
        nMonth++;
      }
    });
    if(!nMonth && !nInit){
      toast('⚠ Không đọc được dữ liệu — hãy copy sheet ODR_Consumption_Cavern (có cột Date)','er');
      return;
    }
    if(!confirm('Import '+nMonth+' tháng'+(nInit?' + dòng đầu kỳ (*)':'')+' vào tab Odorant?\n\n'+
      (skipped.length ? '(Bỏ qua '+skipped.length+' dòng không có ngày)\n\n' : '')+
      'Tháng trùng sẽ bị ghi đè. 1 lần ghi Firebase (delta).')) return;
    for(const k in fb) D[k] = fb[k];
    _saveCache();
    _fbBulk(fb);
    toast('✅ Odorant: đã import '+nMonth+' tháng'+(nInit?' + đầu kỳ':'')+' — đã lưu Firebase','ok');
    render();
  }

  /* ================= export CSV (thứ tự thời gian tăng dần như Excel) ================= */
  function exportCsv(){
    const { initRow, rows } = _compute();
    const head = ['No.','Date','LPG Mixing QTy (MT)','FQ 21171 (KG)','Gravity (Kg/cm3)','Charging (Kg)',
      'LG 21201 (mm)','Inventory (m3)','Inventory (KG)','Cal. Consumption (KG)','Consumption & FQ Diff. (KG)',
      'Price/Unit (VND/KG)','Monthly Cost (VND)','Ratio (MT/KG)','Cal. Concentration (ppm)','Available Mixing QTy (MT)','Remark'];
    const out = [head.join(',')];
    const q = v => { let s = String(v==null?'':v); if(/[",\n]/.test(s)) s = '"'+s.replace(/"/g,'""')+'"'; return s; };
    if(initRow){
      out.push(['(*)', initRow.d, '', 0, initRow.e, initRow.f==null?'':initRow.f, initRow.g==null?'':initRow.g,
        initRow.h==null?'':initRow.h.toFixed(4), initRow.i==null?'':initRow.i, '', '', initRow.l==null?'':initRow.l,
        '', '', '', '', initRow.rm].map(q).join(','));
    }
    rows.forEach((r,ix)=>{
      out.push([ix+1, _ymLabel(r.ym), r.c==null?'':r.c, r.d==null?'':r.d, r.e, r.f==null?'':r.f, r.g==null?'':r.g,
        r.h==null?'':r.h.toFixed(4), r.i==null?'':r.i, r.j==null?'':r.j, r.k==null?'':r.k,
        r.l==null?'':r.l, r.mcost==null?'':r.mcost, r.ratio==null?'':r.ratio.toFixed(2),
        r.ppm==null?'':r.ppm.toFixed(2), r.avail==null?'':Math.round(r.avail), r.rm].map(q).join(','));
    });
    const blob = new Blob(['﻿'+out.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dt = new Date(), p2 = n=>String(n).padStart(2,'0');
    a.href = url;
    a.download = 'odorant_consumption_'+dt.getFullYear()+p2(dt.getMonth()+1)+p2(dt.getDate())+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('📥 Exported Odorant Consumption','ok');
  }

  /* ================= refresh (tab switch) =================
     v4.62.1 — KHÔNG tự tải toàn bộ Tank Log nữa (giữ chế độ 10 lot).
     Chỉ khi bấm ↻ (scanMonth/scanAll) mới ENG.loadAll. */
  function refresh(){ render(); }

  /* ================= firebase init ================= */
  function _attach(){
    if(!_fbRef) return;
    _fbRef.once('value').then(snap=>{
      const val = snap.val();
      if(val && typeof val === 'object'){ D = val; _saveCache(); }
      else if(!val){ D = {}; _saveCache(); }
      render();
      _fbRef.on('child_added',   s=>{ if(_suppressEcho>0) return; D[s.key] = s.val(); _saveCache(); render(); });
      _fbRef.on('child_changed', s=>{ if(_suppressEcho>0) return; D[s.key] = s.val(); _saveCache(); render(); });
      _fbRef.on('child_removed', s=>{ if(_suppressEcho>0) return; delete D[s.key]; _saveCache(); render(); });
    }).catch(e=> console.warn('[ODOR] initial load', e));
  }

  function init(){
    _loadCache();
    try{
      if(typeof firebase !== 'undefined'){
        _fbRef = firebase.database().ref(FB_PATH);
        _attach();
      }
    }catch(e){ console.warn('[ODOR] FB init', e); }
    console.log('[ODOR] ✅ Init OK · '+Object.keys(D).length+' entries');
  }

  return { init, render, refresh, cellEdit,
           scanMonth, scanAll,               /* v4.62.1 — quét Tank Log + lưu */
           addMonth, cancelNewMonth, commitNewMonth, deleteRow,  /* v4.63 — thêm/xóa tháng */
           gravBlur,                          /* v4.63.3 — Gravity 3dp + focus đầy đủ */
           openPaste, closePaste, doPaste, pasteText,
           exportCsv, mmToM3 };
})();
