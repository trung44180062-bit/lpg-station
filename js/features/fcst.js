/* ============================================================
 * FCST — fcst.js  ·  v4.125
 * ------------------------------------------------------------
 * DỰ BÁO TỒN KHO SAU KHI BÁN THEO KẾ HOẠCH — TÁCH RIÊNG LÔ D VÀ E
 * Global: window.FCST · dải số nằm trên thanh tiêu đề SCALE CONSOLE.
 *
 * CÂU HỎI NÓ TRẢ LỜI (vận hành nêu):
 *   "Lô D (nội địa) và lô E (xuất khẩu) mỗi thứ còn bao nhiêu hàng ĐÃ
 *    THÔNG QUAN, bán hết kế hoạch thì còn bao nhiêu, và kế hoạch có đang
 *    bán LỐ hơn số hàng đang có không?"
 * Kho chứa CẢ hàng đã thông quan lẫn chưa thông quan. Số SAP chỉ là hàng
 * ĐÃ thông quan. Không kiểm soát thì có rủi ro bơm nhầm hàng chưa thông
 * quan lên xe bán — đó là lý do dải số này tồn tại.
 *
 * ══ v4.120 — CHỈ TÍNH LÔ D VÀ E, TÁCH RIÊNG HAI CỘT ════════════════════
 *   · Tồn chỉ lấy **batch D và E**. Lô **P / X (Petchem / Export Petchem)
 *     KHÔNG được cộng vào** — chúng chạy xuống FEED OL1 chứ không bán qua
 *     trạm cân, gộp vào là con số "còn bán được" phồng lên vô lý.
 *   · Đơn **xuất khẩu trừ vào lô E**, đơn **nội địa trừ vào lô D**.
 *     ⭐ v4.125 — hướng bán lấy từ **TRADE (js/core/helpers.js)**, đúng bộ
 *     luật đã chạy từ lúc DÁN Sale Plan: cột `trade` đã chốt → TÊN KHÁCH →
 *     Type → Note. Bản cũ tự dò và khớp CHUỖI CON "EX" nên khách nội địa
 *     PETIMEX / PETROLIMEX / ...IMEX bị đếm sang EXPORT.
 *   · Đơn không nhận ra hướng ⇒ **tính về NỘI ĐỊA (D)** nhưng ĐẾM RIÊNG và
 *     kể tên, để không ai tưởng đó là số chắc.
 *   · Hai khoản dùng lô D mà KHÔNG có trong Sale Plan — **hàng xuống tàu**
 *     và **hàng chạy heater** — có ô nhập tạm tính riêng cho từng ngày.
 *
 * ══ LUẬT NGÀY: TRỪ MỌI KẾ HOẠCH CÓ NGÀY SAU NGÀY SAP ═══════════════════
 * SAP được nhập vào cuối ngày, nên số SAP mới nhất là ảnh chụp TRƯỚC khi
 * bán những ngày sau đó.
 *   · SAP mới nhất 30/08, hôm nay 31/08 ⇒ trừ Today Plan 31/08 VÀ
 *     Tomorrow Plan 01/09 (ban đêm kỹ sư mix hàng cho kế hoạch mai).
 *   · Vừa nhập SAP 31/08 ⇒ số đó ĐÃ gồm hàng bán ngày 31 rồi ⇒ BỎ QUA
 *     Today Plan 31/08, chỉ trừ Tomorrow Plan 01/09.
 * Một luật duy nhất, không có nhánh đặc biệt: **trừ mọi ngày kế hoạch >
 * ngày SAP**.
 *
 * ══ TÁCH C3 / C4: TỈ LỆ BÁN (%vol) → LOT → %wt ═════════════════════════
 * Kế hoạch ghi tỉ lệ theo **%vol** (50:50, 25:75…). Muốn ra KG phải có
 * **%wt** — hai con số khác nhau. Đường đi:
 *   ① người dùng đã tự chọn lot cho tỉ lệ đó          → dùng lot đó
 *   ② lot ĐANG NẰM TRONG BỒN (thẻ tank) có %vol khớp  → ưu tiên lot mới hơn
 *   ③ dò LỊCH SỬ Tank Log, lot mới nhất có %vol khớp  → mẻ cùng loại đã trộn
 *   ④ không có gì khớp ⇒ TẠM TÍNH %wt = đúng tỉ lệ bán, gắn cờ "estimated"
 *
 * TẤT CẢ TÍNH TRÊN MÁY. Ghi Firebase đúng hai thứ: lot người dùng chốt cho
 * một tỉ lệ (fcst_lotmap) và số tàu/heater tạm tính theo ngày (fcst_extra).
 * Đơn vị trong ruột: KG. Hiển thị: TẤN.
 * ============================================================ */
const FCST = (function(){
  'use strict';

  const FB_MAP   = 'fcst_lotmap';       /* '<tỉ lệ>'     → {lot,by,ts}          */
  const FB_EXTRA = 'fcst_extra';        /* 'YYYY-MM-DD'  → {shipC3,…,by,ts}     */
  const SLOCS    = ['1100','2100','2101'];
  const SLOC_NM  = { '1100':'Cavern', '2100':'TK-3501', '2101':'TK-3502' };
  const LETTERS  = ['D','E'];           /* ⭐ CHỈ HAI LÔ NÀY — P/X không tính  */
  const LET_NM   = { D:'Domestic', E:'Export' };
  const VOL_TOL  = 10;                  /* điểm %vol — lệch hơn thì coi như không khớp */
  const HIST_MAX = 60;                  /* dò tối đa bao nhiêu lot gần nhất trong lịch sử */
  const XF       = ['shipC3','shipC4','htrC3','htrC4'];
  const XF_LBL   = { shipC3:'Vessel C3', shipC4:'Vessel C4',
                     htrC3:'Heater C3',  htrC4:'Heater C4' };

  const MAP   = Object.create(null);     /* tỉ lệ → lot người dùng chốt        */
  const EXTRA = Object.create(null);     /* ngày  → {shipC3,shipC4,htrC3,htrC4} */
  let _fb=null, _bound=false, _open=false, _panelBound=false;
  let _last=null;                        /* kết quả tính gần nhất              */
  let _renT=null;

  /* ---------- helpers ---------- */
  function _el(id){ try{ return document.getElementById(id); }catch(_){ return null; } }
  function _esc(s){
    return (typeof escapeHtml==='function') ? escapeHtml(s==null?'':s)
      : String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _say(m,t){ try{ if(typeof toast==='function') toast(m,t); }catch(_){} }
  function _who(){ try{ return (typeof CURRENT_USER!=='undefined' && CURRENT_USER && CURRENT_USER.name)
    ? CURRENT_USER.name : ''; }catch(_){ return ''; } }
  function _canWrite(){
    try{
      /* v4.126 — tài khoản SALE mượn khoá quyền 'plan_today' nên lọt qua đây,
         nhưng fcst ghi vào node fcst_map/fcst_extra (ngoài hai bảng plan) và
         sẽ bị cổng đường dẫn ở auth.js chặn. Chặn sớm cho gọn thông báo. */
      if(typeof AUTH!=='undefined' && AUTH && AUTH.isSale && AUTH.isSale()) return false;
      return (typeof canWrite==='function') ? canWrite('plan_today') : true;
    }catch(_){ return true; }
  }
  function _num(v){
    if(v===''||v==null) return null;
    const x=parseFloat(String(v).replace(/[,\s]/g,''));
    return isFinite(x)?x:null;
  }
  function _n(v){ const x=_num(v); return x==null?0:x; }
  function _T(kg,dp){
    if(kg==null || !isFinite(kg)) return '—';
    return (kg/1000).toLocaleString('en-US',{ minimumFractionDigits:(dp==null?1:dp),
                                              maximumFractionDigits:(dp==null?1:dp) });
  }
  function _iso(d){ const p=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
  let _pinToday='';
  function _today(){ return _pinToday || _iso(new Date()); }
  function _dmy(iso){ const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3]+'/'+m[2]+'/'+m[1].slice(2)) : String(iso||''); }
  function _lotKey(s){
    const m=String(s||'').match(/(?:LPG-)?(\d{4})-?(\d+)/i);
    if(m) return parseInt(m[1],10)*1e6+parseInt(m[2],10);
    const n=parseInt(s,10); return isNaN(n)?0:n;
  }
  function _w3(v){
    try{ if(typeof ENG!=='undefined' && ENG.parseW3) return ENG.parseW3(v); }catch(_){}
    const x=_num(v); return (x==null||x<=0)?null:(x>1.5?x/100:x);
  }
  function _pair(){ return { c3:0, c4:0 }; }
  function _add(a,b){ a.c3+=b.c3; a.c4+=b.c4; return a; }

  /* ══ TỈ LỆ BÁN (%vol) ═══════════════════════════════════════════════
     Chép đúng luật của plan.js/scale.js (hai nơi đó cũng chép của nhau —
     xem ghi chú v4.83). Ô Type để trống ⇒ 50:50, y như lúc in PTT/DN. */
  function _ratio(t){
    const norm=(typeof _pfDeriveType==='function') ? _pfDeriveType(t||'') : String(t||'');
    const m=norm.match(/C3:(\d{1,3})\/C4:(\d{1,3})/i);
    if(m) return parseInt(m[1],10)+':'+parseInt(m[2],10);
    if(/pure\s*propane/i.test(norm)) return 'Pure C3';
    if(/pure\s*butane/i.test(norm))  return 'Pure C4';
    return '50:50';
  }
  function _target(ratio){
    const m=String(ratio||'').match(/^(\d{1,3}):(\d{1,3})$/);
    return m?parseInt(m[1],10):null;
  }

  /* ══ HƯỚNG BÁN: XUẤT KHẨU (E) hay NỘI ĐỊA (D) ══════════════════════
     ⭐ v4.125 — KHÔNG CÒN TỰ DÒ NỮA. Hướng bán do `TRADE` trong
     js/core/helpers.js quyết định — ĐÚNG BỘ LUẬT đã chạy từ lúc DÁN Sale
     Plan (scale.js lấy TÊN KHÁCH để ghi cột `trade` của TL Data).

     Vì sao phải sửa: bản cũ tự dò bằng một bộ từ khoá chép tay và đọc cột
     Type TRƯỚC tên khách. Chuỗi "EX" khớp CHUỖI CON, nên mọi khách NỘI ĐỊA
     tên có EX — PETIMEX, PETROLIMEX, các công ty ...IMEX — bị đếm sang
     EXPORT. Khối lượng domestic vì thế sai, và sai theo hướng nguy hiểm:
     lô D trông như còn nhiều hàng hơn thực tế.

     Thứ tự đọc nay là: cột `trade` đã chốt → TÊN KHÁCH → Type → Note →
     không ai nói gì thì NỘI ĐỊA (D).
     ⚠ Sửa luật thì sửa TRADE trong helpers.js — KHÔNG chép lại ở đây nữa. */
  function _dir(s){
    return (typeof TRADE!=='undefined' && TRADE.dirOfText) ? TRADE.dirOfText(s) : '';
  }
  /* Trả { dir, src, sure }. `sure=false` = không ô nào nói ra hướng bán.
     ⚠ v4.123 — KHÔNG cảnh báo cho trường hợp này: đơn không ghi export thì
     ĐÚNG LÀ hàng nội địa, tức lô D — đó là LUẬT, không phải phỏng đoán. Cờ
     `sure` được GIỮ trong kết quả (unsureMT/unsure) để gỡ rối và cho bộ
     test, nhưng không hiện ra giao diện ở đâu cả. */
  function _rowDir(r){
    if(typeof TRADE!=='undefined' && TRADE.dirOfRow) return TRADE.dirOfRow(r);
    return { dir:'D', src:'default', sure:false };
  }

  /* ══ SỐ SAP — CHỈ LÔ D VÀ E ════════════════════════════════════════
     Đọc thẳng SP.ROWS như cav.js `_srcSAP`: cột `batch` là CHỮ LÔ
     (D/E/P/X), `bcode` mới là mã batch đầy đủ. Lô P/X được cộng RIÊNG
     vào `excl` để bảng chi tiết nói rõ đã bỏ ra bao nhiêu — số tổng nhỏ
     hơn tab SAP là có lý do, không phải mất hàng. */
  function _sapDay(){
    let best='';
    try{
      const rows=(typeof SP!=='undefined' && SP.ROWS) ? SP.ROWS : {};
      Object.values(rows).forEach(r=>{
        if(!r) return;
        if(SLOCS.indexOf(String(r.sloc||''))<0) return;
        const m=String(r.mat||'').toUpperCase();
        if(m!=='C3' && m!=='C4') return;
        const d=String(r.date||''); if(d>best) best=d;
      });
    }catch(_){ return ''; }
    return best;
  }
  function _stock(day){
    const out={ day:day||'', has:false, D:_pair(), E:_pair(), excl:_pair(),
                per:{}, exclLet:{} };
    SLOCS.forEach(sl=>{ out.per[sl]={ has:false, D:_pair(), E:_pair(), excl:_pair() }; });
    if(!day) return out;
    let rows={};
    try{ rows=(typeof SP!=='undefined' && SP.ROWS) ? SP.ROWS : {}; }catch(_){ return out; }
    Object.values(rows).forEach(r=>{
      if(!r || String(r.date||'')!==day) return;
      const sl=String(r.sloc||''); if(SLOCS.indexOf(sl)<0) return;
      const mat=String(r.mat||'').toUpperCase();
      if(mat!=='C3' && mat!=='C4') return;
      const k=(mat==='C3')?'c3':'c4';
      const let_=String(r.batch||'').trim().toUpperCase().charAt(0);
      const kg=_n(r.end);
      out.has=true; out.per[sl].has=true;
      if(let_==='D' || let_==='E'){ out[let_][k]+=kg; out.per[sl][let_][k]+=kg; }
      else{
        out.excl[k]+=kg; out.per[sl].excl[k]+=kg;
        const L=let_||'?'; out.exclLet[L]=out.exclLet[L]||_pair(); out.exclLet[L][k]+=kg;
      }
    });
    return out;
  }

  /* ══ DANH SÁCH LOT ĐỌC ĐƯỢC %vol + %wt ══════════════════════════════
     Một lot chỉ dùng được khi có ĐỦ CẢ HAI: %vol để ghép với tỉ lệ bán,
     %wt để đổi tấn ra kg C3/C4. Thiếu một trong hai là bỏ qua. */
  function _lots(){
    let rows=[];
    try{ rows=(typeof ENG!=='undefined' && ENG.ROWS) ? ENG.ROWS : []; }catch(_){ return []; }
    const out=[];
    rows.forEach(r=>{
      if(!r) return;
      const lot=String(r[1]||'').trim(); if(!lot) return;
      const vol=_w3(r[44]), w3=_w3(r[45]);
      if(vol==null || w3==null) return;
      out.push({ lot:lot, tank:String(r[2]||'').trim(), vol:vol*100, w3:w3,
                 date:String(r[3]||''), k:_lotKey(lot) });
    });
    out.sort((a,b)=>b.k-a.k);
    return out.slice(0, HIST_MAX);
  }
  function _tankLots(list){
    const out=[];
    let cfg=null;
    try{ cfg=(typeof SCALE!=='undefined' && SCALE.getTkCfg) ? SCALE.getTkCfg() : null; }catch(_){}
    [['2100',cfg&&cfg.tk1],['2101',cfg&&cfg.tk2]].forEach(([sl,tk])=>{
      const lot=tk?String(tk.lot||'').trim():'';
      if(!lot) return;
      const hit=list.find(x=>_lotKey(x.lot)===_lotKey(lot) || x.lot===lot);
      if(hit) out.push(Object.assign({}, hit, { sloc:sl, current:true }));
    });
    return out;
  }
  /* ⭐ CHỌN NGUỒN %wt CHO MỘT TỈ LỆ — bốn nấc, nấc trên thắng nấc dưới */
  function _pick(ratio, list, tanks){
    if(ratio==='Pure C3') return { src:'pure', w3:1, lot:'', tank:'', vol:100, gap:0 };
    if(ratio==='Pure C4') return { src:'pure', w3:0, lot:'', tank:'', vol:0,   gap:0 };
    const tgt=_target(ratio);
    if(tgt==null) return { src:'none', w3:null, lot:'', tank:'', vol:null, gap:null };
    const man=MAP[ratio];
    if(man && man.lot){
      const hit=list.find(x=>x.lot===man.lot);
      if(hit) return { src:'user', w3:hit.w3, lot:hit.lot, tank:hit.tank, vol:hit.vol,
                       gap:Math.abs(hit.vol-tgt), by:man.by||'', ts:man.ts||0 };
      /* lot đã bị xoá khỏi Tank Log ⇒ BỎ lựa chọn cũ, quay về tự chọn. */
    }
    /* ⭐ TRONG SỐ CÁC LOT KHỚP TỈ LỆ, LẤY LOT MỚI NHẤT — chốt của người
       dùng. Đây là so với THỰC TẾ đang có, không phải tra cứu quá khứ.
       Chỉ khi hai lot cùng tuổi mới xét tới lot có %vol sát hơn. */
    const near=(arr)=>{
      let best=null;
      arr.forEach(x=>{
        const g=Math.abs(x.vol-tgt);
        if(g>VOL_TOL) return;
        if(!best || x.k>best.x.k || (x.k===best.x.k && g<best.g-0.001)) best={ x:x, g:g };
      });
      return best;
    };
    const t=near(tanks);
    if(t) return { src:'tank', w3:t.x.w3, lot:t.x.lot, tank:t.x.tank, vol:t.x.vol, gap:t.g };
    const h=near(list);
    if(h) return { src:'hist', w3:h.x.w3, lot:h.x.lot, tank:h.x.tank, vol:h.x.vol, gap:h.g,
                   date:h.x.date };
    return { src:'est', w3:tgt/100, lot:'', tank:'', vol:null, gap:null };
  }

  /* ══ KẾ HOẠCH ═══════════════════════════════════════════════════════
     Gom dòng của MỘT ngày, thu gọn nhóm 🔗 ALT (một trong N xe — cộng
     thẳng là một đơn 25 T thành 75 T), rồi gom theo HƯỚNG BÁN × TỈ LỆ.
       planMT — cả kế hoạch, bỏ đơn cancel
       loadMT — đơn 'done' + 'loading', ĐÚNG định nghĩa của thẻ PLAN và của
                dải tổng Ledger (TP.lnkTotals), để ba chỗ không lệch nhau. */
  function _dayRows(mod, iso){
    if(!mod || !mod.PLAN) return [];
    let rows=Object.values(mod.PLAN).filter(r=>{
      const fd=String(r&&r._forDate||'').trim();
      return fd===iso && (parseFloat(r.qty||0)||0)>0;
    });
    try{ if(typeof mod.lnkCollapse==='function') rows=mod.lnkCollapse(rows); }catch(_){}
    return rows;
  }
  function _groups(rows, mod){
    const g=Object.create(null);
    const out={ g:g, planMT:0, loadMT:0, nPlan:0, nDone:0, unsureMT:0, unsure:[] };
    const eff=(mod && typeof mod.getEffectiveStatus==='function') ? mod.getEffectiveStatus : null;
    rows.forEach(r=>{
      const st=String((eff?eff(r):(r._status||''))||'').toLowerCase();
      if(st==='cancel') return;
      const q=parseFloat(r.qty||0)||0; if(!(q>0)) return;
      const d=_rowDir(r), rt=_ratio(r.type);
      const key=d.dir+'|'+rt;
      const it=g[key]||(g[key]={ dir:d.dir, ratio:rt, planMT:0, loadMT:0, n:0, done:0, unsureMT:0 });
      it.planMT+=q; it.n++; out.planMT+=q; out.nPlan++;
      if(st==='done'||st==='loading'){ it.loadMT+=q; it.done++; out.loadMT+=q; out.nDone++; }
      if(!d.sure){
        it.unsureMT+=q; out.unsureMT+=q;
        if(out.unsure.length<12)
          out.unsure.push({ cust:String(r.customer||r._oid||'?'), qty:q, type:String(r.type||'') });
      }
    });
    return out;
  }
  /* Mọi NGÀY kế hoạch nằm SAU mốc SAP — chính là phần chưa nằm trong số SAP.
     Ngày có ở cả Today Plan lẫn Tomorrow Plan thì lấy Today Plan. */
  function _days(sapDay){
    const out=[], seen=Object.create(null);
    [['today',(typeof TP!=='undefined'?TP:null)],
     ['tomorrow',(typeof TMR!=='undefined'?TMR:null)]].forEach(([kind,mod])=>{
      if(!mod || !mod.PLAN) return;
      Object.values(mod.PLAN).forEach(r=>{
        const fd=String(r&&r._forDate||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(fd)) return;
        if(sapDay && fd<=sapDay) return;          /* đã nằm trong số SAP rồi */
        if(seen[fd]) return;
        seen[fd]=1;
        out.push({ iso:fd, kind:kind, mod:mod });
      });
    });
    /* Ngày đã gõ tàu / heater tạm tính nhưng chưa có đơn nào thì VẪN phải
       hiện — không thì số vừa gõ biến mất mà không ai hiểu vì sao. */
    Object.keys(EXTRA).forEach(iso=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      if(sapDay && iso<=sapDay) return;
      if(seen[iso]) return;
      if(!_xSum(iso).c3 && !_xSum(iso).c4) return;
      seen[iso]=1;
      out.push({ iso:iso, kind:'extra', mod:null });
    });
    out.sort((a,b)=>a.iso<b.iso?-1:(a.iso>b.iso?1:0));
    return out;
  }
  /* Tàu + heater của một ngày, quy về kg C3/C4 — luôn tính vào LÔ D */
  function _xOf(iso){ return EXTRA[iso] || {}; }
  function _xSum(iso){
    const x=_xOf(iso);
    return { c3:_n(x.shipC3)+_n(x.htrC3), c4:_n(x.shipC4)+_n(x.htrC4) };
  }

  /* ══ TÍNH TOÀN BỘ — thuần tính, không đụng DOM ══════════════════════ */
  function calc(){
    const sapDay=_sapDay();
    const stock=_stock(sapDay);
    const list=_lots(), tanks=_tankLots(list);
    const days=_days(sapDay);
    const R={ sapDay:sapDay, stock:stock, lots:list, tanks:tanks, days:[],
              sold:{ D:_pair(), E:_pair() }, todo:{ D:_pair(), E:_pair() },
              plan:{ D:_pair(), E:_pair() }, other:_pair(), left:{ D:_pair(), E:_pair() },
              planMT:0, loadMT:0, estMT:0, unsureMT:0, unsure:[], nPlan:0, nDone:0,
              over:[], ok:false, why:'' };
    if(!sapDay || !stock.has) R.why='no-sap';
    days.forEach(d=>{
      const rows=d.mod?_dayRows(d.mod,d.iso):[];
      const G=_groups(rows, d.mod);
      const x=_xSum(d.iso);
      const day={ iso:d.iso, kind:d.kind, planMT:G.planMT, loadMT:G.loadMT,
                  nPlan:G.nPlan, nDone:G.nDone, unsureMT:G.unsureMT, rows:[],
                  extra:_xOf(d.iso), extraKg:x };
      Object.keys(G.g).sort().forEach(key=>{
        const it=G.g[key];
        const p=_pick(it.ratio, list, tanks);
        const kg=it.planMT*1000, kgL=it.loadMT*1000;
        const w3=(p.w3==null)?null:p.w3;
        const c3=(w3==null)?null:kg*w3,   c4=(w3==null)?null:kg-c3;
        const lc3=(w3==null)?null:kgL*w3, lc4=(w3==null)?null:kgL-lc3;
        day.rows.push(Object.assign({}, it, { pick:p, c3:c3, c4:c4, lc3:lc3, lc4:lc4 }));
        if(w3!=null){
          const L=it.dir;
          R.plan[L].c3+=c3;  R.plan[L].c4+=c4;
          R.sold[L].c3+=lc3; R.sold[L].c4+=lc4;
          R.todo[L].c3+=(c3-lc3); R.todo[L].c4+=(c4-lc4);
        }
        if(p.src==='est') R.estMT+=it.planMT;
      });
      /* tàu + heater: KHÔNG phải hàng bán qua trạm cân, nhưng vẫn rút đúng
         lô D, nên nó là một khoản trừ RIÊNG — không trộn vào "còn phải bán" */
      R.other.c3+=x.c3; R.other.c4+=x.c4;
      R.planMT+=G.planMT; R.loadMT+=G.loadMT; R.nPlan+=G.nPlan; R.nDone+=G.nDone;
      R.unsureMT+=G.unsureMT;
      G.unsure.forEach(u=>{ if(R.unsure.length<12) R.unsure.push(Object.assign({iso:d.iso},u)); });
      R.days.push(day);
    });
    if(stock.has){
      LETTERS.forEach(L=>{
        R.left[L].c3=stock[L].c3-R.plan[L].c3-(L==='D'?R.other.c3:0);
        R.left[L].c4=stock[L].c4-R.plan[L].c4-(L==='D'?R.other.c4:0);
      });
      LETTERS.forEach(L=>{
        ['c3','c4'].forEach(k=>{
          if(R.left[L][k] < -0.5)
            R.over.push({ let_:L, mat:k.toUpperCase(), kg:-R.left[L][k] });
        });
      });
      R.ok=true;
    }
    _last=R;
    return R;
  }

  /* ══ DẢI SỐ TRÊN THANH TIÊU ĐỀ ═════════════════════════════════════
     v4.122 — XẾP NGANG, KHÔNG XẾP DỌC. Bản trước dựng mỗi lô thành một
     cột 5 dòng ⇒ thanh tiêu đề cao gần gấp đôi và ăn mất chỗ của mấy thẻ
     bên dưới trên màn hình laptop. Nay mỗi lô là một BẢNG NẰM NGANG:
        hàng = cấu tử (C3 / C4) · cột = từng bước tính
        D · DOMESTIC │ STOCK │ − SOLD │ − TO SELL │ − VESSEL+HTR │ = LEFT
     Cao đúng 3 dòng, đọc từ trái sang phải, hai lô đứng cạnh nhau.
     ⭐ VẪN KHÔNG GỘP C3+C4 thành một số LPG: bán lố hay xảy ra ở ĐÚNG MỘT
     cấu tử (tổng còn dương mà C4 đã âm), gộp lại là giấu mất. */
  const _STEPS=[
    { k:'stock', lbl:R=>'STOCK '+_dmy(R.sapDay), get:(R,L)=>R.stock[L],  cls:'st' },
    { k:'sold',  lbl:()=>'&minus; SOLD',         get:(R,L)=>R.sold[L],   cls:'' },
    { k:'todo',  lbl:()=>'&minus; TO SELL',      get:(R,L)=>R.todo[L],   cls:'' },
    { k:'other', lbl:()=>'&minus; VES/HTR',      get:(R,L)=>R.other,     cls:'x', dOnly:true },
    { k:'left',  lbl:()=>'= LEFT',               get:(R,L)=>R.left[L],   cls:'lf', neg:true }
  ];
  function _val(v, neg, cls){
    const c=[cls||'']; if(neg && v!=null && isFinite(v) && v<-0.5) c.push('neg');
    return '<td class="'+c.join(' ').trim()+'">'+_T(v)+'</td>';
  }
  function _blkLet(L, R, big){
    const bad=R.over.some(o=>o.let_===L);
    let hd='<tr class="hd"><th class="c"><b>'+L+'</b> · '+LET_NM[L].toUpperCase()+'</th>';
    let r3='<tr class="m3"><th class="c">C3</th>';
    let r4='<tr class="m4"><th class="c">C4</th>';
    _STEPS.forEach(st=>{
      const off=(st.dOnly && L!=='D');
      hd+='<th class="'+st.cls+'">'+st.lbl(R)+'</th>';
      if(off){
        r3+='<td class="'+st.cls+' dash">—</td>';
        r4+='<td class="'+st.cls+' dash">—</td>';
      }else{
        const p=st.get(R,L);
        r3+=_val(p.c3, st.neg, st.cls);
        r4+=_val(p.c4, st.neg, st.cls);
      }
    });
    return '<div class="fc-b b-'+L+(bad?' bad':'')+(big?' big':'')+'">'
      + '<table class="fc-m">'+hd+'</tr>'+r3+'</tr>'+r4+'</tr></table></div>';
  }

  function render(){
    const bar=_el('fcstBar');
    const R=calc();
    if(bar && !R.ok){
      bar.className='fc-bar off';
      bar.innerHTML='<span class="fc-off">📉 <b>Stock forecast unavailable</b> — the SAP tab has no '
        + 'End Stock for the cavern and the tanks yet. Paste a ZMMFR022 export under '
        + '<b>LPG Sales ▸ SAP</b> and the figures appear here.</span>';
      _paint(); renderFull();
      return;
    }
    if(bar){
      const dayTxt=R.days.length ? R.days.map(d=>_dmy(d.iso)).join(' + ')
                                 : 'no plan after '+_dmy(R.sapDay);
      /* ⭐ v4.123 — NÓI RÕ ĐANG DỰ ĐOÁN TỒN CỦA NGÀY NÀO. Chỉ có con số mà
         không có mốc thời gian thì người xem không biết "còn lại" là còn
         lại SAU KHI bán những ngày nào. */
      let h='<span class="fc-cap" title="Customs-cleared stock of '+_dmy(R.sapDay)+' (batch D and E '
        + 'only — batch P and X run down FEED OL1 and are never sold over the weighbridge), minus '
        + 'every plan dated after it: '+dayTxt+'.">'
        + '<b>📉 STOCK FORECAST</b>'
        + '<i>SAP ' + _dmy(R.sapDay) + '</i>'
        + '<u>' + (R.days.length ? ('→ left after ' + R.days.map(d=>_dmy(d.iso)).join(' + '))
                                 : '→ no plan to subtract') + '</u>'
        + '</span>';
      h+=_blkLet('D', R);
      h+=_blkLet('E', R);
      if(R.over.length)
        h+='<span class="fc-warn bad" title="Loading the plan as it stands would draw product that SAP '
          + 'does not hold as customs-cleared on that batch.">⚠ OVERSOLD — '
          + R.over.map(o=>o.let_+'·'+o.mat+' short '+_T(o.kg)+' T').join(' · ')+'</span>';
      /* v4.123 — BỎ chip "unclassified → D". Đơn không ghi Export thì ĐÚNG LÀ
         hàng nội địa, tức là lô D — đó là luật chứ không phải phỏng đoán, nên
         không có gì để cảnh báo. Chỗ đó nhường cho phần tiêu đề + mốc ngày. */
      if(R.estMT>0.05)
        h+='<span class="fc-warn est" title="No mixed lot matches that sale ratio yet, so the C3/C4 split '
          + 'of those orders is assumed to equal the sale ratio. The figure firms up once the lot is '
          + 'mixed.">≈ '+_T(R.estMT*1000)+' T estimated</span>';
      h+='<button class="fc-more" onclick="FCST.toggle(event)" title="Show how every figure is built, '
        + 'type the vessel / heater estimates, and pick the lot used for each sale ratio">▾</button>';
      bar.className='fc-bar'+(R.over.length?' bad':'');
      bar.innerHTML=h;
    }
    _paint();
    renderFull();
  }

  /* ══ BẢNG CHI TIẾT ─ mở ra khi bấm vào dải số ═══════════════════════
     Chỗ DUY NHẤT nói được: con số này lấy %wt của LOT NÀO, đơn nào rơi vào
     lô D, đơn nào lô E, và cho phép sửa. Không có nó thì dải số là hộp đen. */
  const SRC_LBL={ user:'picked', tank:'in the tank', hist:'earlier lot',
                  est:'estimated', pure:'pure grade', none:'unknown' };
  function _srcChip(p){
    let tip='';
    if(p.src==='tank') tip='Lot '+p.lot+' is the lot on the '+p.tank+' card right now, at '
      +p.vol.toFixed(1)+' %vol C3 — '+p.gap.toFixed(1)+' points from the sale ratio.';
    else if(p.src==='hist') tip='No tank currently holds this ratio. Lot '+p.lot+' ('+p.tank+', '
      +_dmy(p.date||'')+') was mixed at '+p.vol.toFixed(1)+' %vol C3, so its %wt is used. The engineer '
      +'normally mixes this ratio again before the trucks arrive.';
    else if(p.src==='user') tip='Lot '+p.lot+' was chosen by hand'+(p.by?(' by '+p.by):'')
      +' for this sale ratio. Press ⟳ to go back to automatic.';
    else if(p.src==='est') tip='No lot at this ratio anywhere in the Tank Log, so the %wt split is '
      +'ASSUMED to equal the sale ratio. It is a placeholder until the lot is mixed.';
    else if(p.src==='pure') tip='A pure grade goes out as one component only — no tank %wt involved.';
    return '<span class="fc-src s-'+p.src+'" title="'+_esc(tip)+'">'+_esc(SRC_LBL[p.src]||p.src)+'</span>';
  }
  function _lotSel(ratio, p, list){
    if(ratio==='Pure C3'||ratio==='Pure C4') return '<span class="fc-dim">—</span>';
    const cur=(p.src==='user')?p.lot:'';
    let h='<select class="fc-sel" onchange="FCST.setLot(\''+_esc(ratio)+'\',this.value)" '
      + 'title="Pick the lot whose %wt is used to split this sale ratio into C3 and C4">'
      + '<option value=""'+(cur?'':' selected')+'>Automatic'
      + (p.lot&&!cur?(' · '+_esc(p.lot)):'')+'</option>';
    list.forEach(x=>{
      h+='<option value="'+_esc(x.lot)+'"'+(x.lot===cur?' selected':'')+'>'
        + _esc(x.lot)+' · '+_esc(x.tank)+' · '+x.vol.toFixed(1)+' %vol · '
        + (x.w3*100).toFixed(2)+' %wt</option>';
    });
    h+='</select>';
    if(cur) h+='<button class="fc-mini" onclick="FCST.setLot(\''+_esc(ratio)+'\',\'\')" '
      + 'title="Drop the manual choice and let the software pick again">⟳</button>';
    return h;
  }
  function _xInputs(iso, pfx){
    const x=_xOf(iso);
    let h='<div class="fc-x"><span class="t">Not on the Sale Plan but still leaves <b>batch D</b> — '
      + 'type your estimate (kg):</span>';
    XF.forEach(f=>{
      h+='<label><span>'+XF_LBL[f]+'</span>'
        + '<input type="text" inputmode="decimal" autocomplete="off" id="fcx-'+pfx+'-'+iso+'-'+f+'" '
        + 'value="'+_esc(x[f]==null?'':x[f])+'" placeholder="kg" '
        + 'onchange="FCST.setExtra(\''+iso+'\',\''+f+'\',this.value)"></label>';
    });
    const s=_xSum(iso);
    h+='<span class="sum">= '+_T(s.c3)+' T C3 · '+_T(s.c4)+' T C4</span>';
    if(x.by) h+='<span class="by">typed by '+_esc(x.by)+'</span>';
    return h+'</div>';
  }
  /* ⚠ ĐANG GÕ thì KHÔNG được dựng lại khối chứa ô nhập — dựng lại là ô bị
     huỷ và mất con trỏ, đúng họ lỗi đã vá ở v4.114. Lượt vẽ nền 30 s hay
     một lượt đẩy Firebase rơi trúng lúc gõ là dính ngay. */
  function _typing(){
    try{
      const a=document.activeElement;
      return !!(a && a.id && String(a.id).indexOf('fcx-')===0);
    }catch(_){ return false; }
  }
  /* Thân bảng dùng CHUNG cho tấm thả xuống (pfx 'p') và bảng đầy đủ nằm
     trong tab SAP (pfx 'f'). Hai chỗ vẽ cùng một hàm nên không thể nói
     khác nhau; pfx chỉ để id ô nhập không đụng nhau. */
  function _bodyHtml(R, pfx){
    const S=R.stock;
    /* ⭐ v4.122 — BA CON SỐ QUAN TRỌNG NHẤT LÊN ĐẦU, CHỮ TO: tồn đầu ·
       từng khoản trừ · còn lại. Bảng bên dưới là phần chứng minh; ai chỉ
       cần con số thì đọc đúng dải này là xong. Dùng LẠI đúng component của
       thanh SCALE CONSOLE nên hai chỗ không thể nói khác nhau. */
    let h='<div class="fc-keys">'+_blkLet('D',R,1)+_blkLet('E',R,1)+'</div>';
    h+='<div class="fc-rule"><b>How the figure is built.</b> Only <b>batch D (domestic)</b> and '
      + '<b>batch E (export)</b> count — batch P and X run down FEED OL1 and are never sold over the '
      + 'weighbridge, so they are left out. SAP is keyed in at the end of the day, so the latest SAP '
      + 'figures are the stock <b>before</b> everything planned after that date: the software subtracts '
      + '<b>every plan dated after '+_dmy(R.sapDay)+'</b>. An order that says <b>export</b> anywhere in '
      + 'its Type, Note or customer name comes off <b>E</b>; <b>everything else is domestic and comes '
      + 'off D</b>.</div>';
    h+='<table class="fc-tbl"><thead><tr><th>SAP '+_dmy(R.sapDay)+'</th>'
      + '<th class="n">D · C3</th><th class="n">D · C4</th>'
      + '<th class="n">E · C3</th><th class="n">E · C4</th></tr></thead><tbody>';
    SLOCS.forEach(sl=>{
      const p=S.per[sl];
      h+='<tr class="fc-sap"><td>'+SLOC_NM[sl]+' <i>SLoc '+sl+'</i>'
        + (p.has?'':' <span class="fc-miss">no row that day</span>')+'</td>'
        + '<td class="n">'+_T(p.D.c3)+'</td><td class="n">'+_T(p.D.c4)+'</td>'
        + '<td class="n">'+_T(p.E.c3)+'</td><td class="n">'+_T(p.E.c4)+'</td></tr>';
    });
    h+='<tr class="fc-tot"><td>Customs-cleared stock · batch D + E</td>'
      + '<td class="n b">'+_T(S.D.c3)+'</td><td class="n b">'+_T(S.D.c4)+'</td>'
      + '<td class="n b">'+_T(S.E.c3)+'</td><td class="n b">'+_T(S.E.c4)+'</td></tr>';
    if((S.excl.c3+S.excl.c4)>0.5){
      const lets=Object.keys(S.exclLet).sort().map(L=>L+' '+_T(S.exclLet[L].c3+S.exclLet[L].c4)+' T');
      h+='<tr class="fc-excl"><td colspan="5">Left out on purpose — batch '+_esc(lets.join(' · '))
        + ': Petchem / Export Petchem run down FEED OL1, they are not sold over the weighbridge. '
        + 'That is why this total is smaller than the SAP tab total.</td></tr>';
    }
    h+='</tbody></table>';
    if(!R.days.length)
      h+='<div class="fc-empty">No plan is dated after '+_dmy(R.sapDay)+' — nothing to subtract.</div>';
    R.days.forEach(d=>{
      const ttl=(d.kind==='today')?'Today Plan':(d.kind==='tomorrow'?'Tomorrow Plan':'Estimates only');
      h+='<table class="fc-tbl"><thead><tr>'
        + '<th>'+ttl+' · '+_dmy(d.iso)+' <i>'+d.nPlan+' order'+(d.nPlan===1?'':'s')+' · '
        +   d.planMT.toLocaleString('en-US',{maximumFractionDigits:3})+' T</i></th>'
        + '<th>Batch</th><th>%wt source</th><th>Lot used</th>'
        + '<th class="n">Plan T</th><th class="n">C3</th><th class="n">C4</th></tr></thead><tbody>';
      d.rows.forEach(r=>{
        const p=r.pick;
        h+='<tr'+(p.src==='est'?' class="fc-est"':'')+'>'
          + '<td class="fc-rt"><b>'+_esc(r.ratio)+'</b> <i>'+r.n+' order'+(r.n===1?'':'s')
          +   (r.done?(' · '+r.done+' loaded'):'')+'</i></td>'
          + '<td><span class="fc-let l-'+r.dir+'" title="'+LET_NM[r.dir]+' — comes off batch '+r.dir
          +   '">'+r.dir+' · '+LET_NM[r.dir]+'</span></td>'
          + '<td>'+_srcChip(p)+(p.w3==null?'':' <span class="fc-w3">'+(p.w3*100).toFixed(2)+' %wt C3</span>')+'</td>'
          + '<td class="fc-lotc">'+_lotSel(r.ratio,p,R.lots)+'</td>'
          + '<td class="n">'+r.planMT.toLocaleString('en-US',{maximumFractionDigits:3})+'</td>'
          + '<td class="n">'+_T(r.c3)+'</td><td class="n">'+_T(r.c4)+'</td></tr>';
      });
      if(!d.rows.length)
        h+='<tr><td colspan="7" class="fc-empty">No order on this date.</td></tr>';
      h+='<tr class="fc-xrow"><td colspan="7">'+_xInputs(d.iso,pfx)+'</td></tr>';
      h+='</tbody></table>';
    });
    const line=(lbl,D,E,cls)=>'<tr'+(cls?(' class="'+cls+'"'):'')+'><td>'+lbl+'</td>'
      + '<td class="n'+(D.c3<-0.5?' neg':'')+'">'+_T(D.c3)+'</td>'
      + '<td class="n'+(D.c4<-0.5?' neg':'')+'">'+_T(D.c4)+'</td>'
      + '<td class="n'+(E.c3<-0.5?' neg':'')+'">'+_T(E.c3)+'</td>'
      + '<td class="n'+(E.c4<-0.5?' neg':'')+'">'+_T(E.c4)+'</td></tr>';
    h+='<table class="fc-tbl fc-sum"><thead><tr><th></th><th class="n">D · C3</th>'
      + '<th class="n">D · C4</th><th class="n">E · C3</th><th class="n">E · C4</th></tr></thead><tbody>'
      + line('<b>Stock on '+_dmy(R.sapDay)+'</b> · customs-cleared, batch D + E', S.D, S.E, 'fc-key')
      + line('− already sold (plan quantity of loaded orders)', R.sold.D, R.sold.E)
      + line('− still to sell', R.todo.D, R.todo.E)
      + line('− vessel + heater estimate (batch D only)', R.other, _pair())
      + line('<b>= coming off the plan</b> · sold + to sell + vessel/heater',
             { c3:R.sold.D.c3+R.todo.D.c3+R.other.c3, c4:R.sold.D.c4+R.todo.D.c4+R.other.c4 },
             { c3:R.sold.E.c3+R.todo.E.c3,            c4:R.sold.E.c4+R.todo.E.c4 }, 'fc-key')
      + line('<b>= LEFT after the whole plan</b>', R.left.D, R.left.E,
             'fc-tot fc-key'+(R.over.length?' bad':''))
      + '</tbody></table>';
    if(R.over.length)
      h+='<div class="fc-rule bad"><b>⚠ The plan sells more than SAP holds as customs-cleared on '
        + R.over.map(o=>o.let_+' · '+o.mat).join(', ')+'.</b> '
        + 'The warehouse also stores goods that have NOT cleared customs, and they look identical in the '
        + 'tank. Loading the plan as it stands risks pumping uncleared product onto a truck. Check the '
        + 'plan, the customs paperwork, or paste a fresher SAP export before loading.</div>';
    if(R.estMT>0.05)
      h+='<div class="fc-rule est"><b>≈ '+_T(R.estMT*1000)+' T is estimated.</b> Those sale ratios have '
        + 'no lot anywhere in the Tank Log, so their C3/C4 split is assumed to equal the sale ratio. '
        + 'That is normal the night before: the engineer mixes the special lot later. Pick the lot by '
        + 'hand above if you already know which one it will be.</div>';
    return h;
  }
  function _paint(){
    const box=_el('fcstPanel'); if(!box) return;
    if(!_open || !_last || !_last.ok){ box.innerHTML=''; box.style.display='none'; return; }
    if(_typing()) return;
    box.innerHTML='<div class="fc-ph"><b>📉 Stock forecast — batch D and E against the plan</b>'
      + '<button class="fc-mini" onclick="FCST.toggle(0)">✕ Close</button></div>'
      + '<div class="fc-pb">'+_bodyHtml(_last,'p')+'</div>';
    box.style.display='';
    _pos();
  }
  /* ══ v4.120.1 — BẢNG ĐẦY ĐỦ NẰM TRONG TAB SAP ══════════════════════
     Thay hẳn bảng "SAP STOCK SUMMARY (ZMMFR022)" cũ: bảng đó chỉ cộng
     Init/GR/GI/Trs/End của hai bồn, không trả lời được câu hỏi thật là
     "còn bán được bao nhiêu". Chỗ này rộng nên in được TOÀN BỘ phép tính,
     kể cả ô nhập tàu / heater. */
  function renderFull(){
    const box=_el('fcstFull'); if(!box) return;
    /* Bấm Hide là THÔI VẼ, không chỉ ẩn đi: lượt vẽ nền 30 s vẫn chạy suốt
       cả phiên, dựng một bảng không ai nhìn là công toi. */
    try{
      const w=_el('spAnalysisWrap');
      if(w && w.classList && w.classList.contains('collapsed')) return;
    }catch(_){}
    const R=_last||calc();
    if(!R.ok){
      box.innerHTML='<div class="fc-empty">No SAP End Stock for the cavern and the tanks yet — '
        + 'paste a ZMMFR022 export below and the whole calculation appears here.</div>';
      return;
    }
    if(_typing()) return;
    box.innerHTML=_bodyHtml(R,'f');
    const sc=_el('fcstFullScope');
    if(sc) sc.textContent='SAP '+_dmy(R.sapDay)+' · '
      + (R.days.length?('minus '+R.days.map(d=>_dmy(d.iso)).join(' + ')):'no plan to subtract');
  }

  /* Tấm thả xuống dùng position:fixed rồi tự đặt toạ độ theo dải số — cùng
     cách với tấm cảnh báo 🔔 của KNQ, để không bị overflow của thanh tiêu đề
     cắt mất và không đẩy phần bảng bên dưới tụt xuống. */
  function _pos(){
    const box=_el('fcstPanel'), bar=_el('fcstBar');
    if(!box||!bar||!bar.getBoundingClientRect) return;
    try{
      const r=bar.getBoundingClientRect();
      box.style.top=Math.round(r.bottom+6)+'px';
      box.style.left=Math.max(8,Math.round(r.left))+'px';
    }catch(_){}
  }
  function toggle(v){
    try{ if(v && v.stopPropagation) v.stopPropagation(); }catch(_){}
    _open=(v===0||v===false)?false:!_open;
    _paint(); _bindDoc();
  }
  function _bindDoc(){
    if(_panelBound) return;
    if(typeof document==='undefined' || !document.addEventListener) return;
    _panelBound=true;
    document.addEventListener('mousedown',e=>{
      if(!_open) return;
      const box=_el('fcstPanel'), bar=_el('fcstBar');
      if(box && box.contains && box.contains(e.target)) return;
      if(bar && bar.contains && bar.contains(e.target)) return;
      toggle(0);
    });
    document.addEventListener('keydown',e=>{ if(_open && e.key==='Escape') toggle(0); });
    if(window.addEventListener) window.addEventListener('resize',_pos);
  }

  /* ══ HAI THỨ ĐƯỢC GHI FIREBASE ═════════════════════════════════════
     ① lot người dùng chốt cho một tỉ lệ — theo TỈ LỆ, không theo ngày:
        một tỉ lệ bán luôn lấy từ đúng một mẻ, đổi mẻ thì chọn lại.
     ② tàu / heater tạm tính — theo NGÀY, vì mỗi ngày một con số.
     Ghi ở một máy thì mọi máy tính cùng con số. */
  function _ref(){ if(!_fb) _fb=firebase.database(); return _fb; }
  function _push(path, val, ok){
    if(typeof firebase==='undefined'){ _say('⚠ Offline — kept on this machine only','warn'); return; }
    try{
      const pay={}; pay[path]=val;
      _ref().ref().update(pay).catch(e=>{
        console.warn('[FCST] push',e);
        _say('⚠ Could not save to the server — it applies on this machine only','warn');
      });
      if(ok) _say(ok,'ok');
    }catch(e){ console.warn('[FCST] push',e); }
  }
  function setLot(ratio, lot){
    ratio=String(ratio||''); if(!ratio) return;
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const v=String(lot||'').trim();
    if(v) MAP[ratio]={ lot:v, by:_who(), ts:Date.now() };
    else   delete MAP[ratio];
    _push(FB_MAP+'/'+ratio.replace(/[.#$/\[\]]/g,'_'), v?MAP[ratio]:null,
          v?('Sale ratio '+ratio+' now uses lot '+v):('Sale ratio '+ratio+' is back to automatic'));
    render();
  }
  function setExtra(iso, field, val){
    iso=String(iso||''); 
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso) || XF.indexOf(field)<0) return;
    if(!_canWrite()){ _say('⛔ Your account has no write permission','er'); return; }
    const n=_num(val);
    const e=Object.assign({}, EXTRA[iso]||{});
    if(n==null || n===0) delete e[field]; else e[field]=Math.round(n);
    const any=XF.some(f=>e[f]!=null);
    if(any){ e.by=_who(); e.ts=Date.now(); EXTRA[iso]=e; }
    else delete EXTRA[iso];
    _push(FB_EXTRA+'/'+iso, any?e:null,
          XF_LBL[field]+' for '+_dmy(iso)+(n==null||n===0?' cleared':(' set to '+Math.round(n)+' kg')));
    render();
  }
  function _attach(){
    if(_bound || typeof firebase==='undefined') return;
    _bound=true;
    try{
      _ref().ref(FB_MAP).on('value',s=>{
        const v=s.val()||{};
        Object.keys(MAP).forEach(k=>{ delete MAP[k]; });
        Object.keys(v).forEach(k=>{ if(v[k] && v[k].lot) MAP[k]=v[k]; });
        schedule();
      }, err=>console.warn('[FCST] map listen',err));
    }catch(e){ console.warn('[FCST] attach map',e); }
    try{
      _ref().ref(FB_EXTRA).on('value',s=>{
        const v=s.val()||{};
        Object.keys(EXTRA).forEach(k=>{ delete EXTRA[k]; });
        Object.keys(v).forEach(k=>{ if(v[k]) EXTRA[k]=v[k]; });
        schedule();
      }, err=>console.warn('[FCST] extra listen',err));
    }catch(e){ console.warn('[FCST] attach extra',e); }
  }

  /* Gộp lượt vẽ: mọi đường (SAP dán về, plan sửa, tank đổi lot, xe cân xong)
     đều gọi schedule(), một lượt vẽ cho cả cụm thay đổi. */
  function schedule(){
    if(_renT) return;
    _renT=setTimeout(()=>{ _renT=null; try{ render(); }catch(e){ console.warn('[FCST] render',e); } },250);
  }
  function init(){
    _attach();
    schedule();
    /* Lưới an toàn: có đường thay đổi không gọi được vào đây (dán SAP ở máy
       khác, TL Data đẩy về…). 30 s một lượt là đủ, và rẻ — toàn bộ phép tính
       chạy trên RAM, không đọc Firebase. */
    try{ setInterval(()=>{ try{ if(!document.hidden) render(); }catch(_){} }, 30000); }catch(_){}
  }

  return { init, render, renderFull, schedule, calc, toggle, setLot, setExtra,
           /* hook kiểm thử — không dùng trong app */
           _state:{ MAP, EXTRA, ratio:_ratio, target:_target, pick:_pick, lots:_lots,
                    tankLots:_tankLots, dir:_dir, rowDir:_rowDir,
                    sapDay:_sapDay, stock:_stock, days:_days, groups:_groups, dayRows:_dayRows,
                    xSum:_xSum, last:()=>_last, open:()=>_open, VOL_TOL, SLOCS, LETTERS,
                    pinToday:d=>{ _pinToday=d||''; }, today:_today } };
})();
window.FCST = FCST;
