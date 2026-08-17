/* ============================================================
 * KNQ — knq.js   (v4.93a) ·  XNK KHO NGOẠI QUAN (bonded warehouse)
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
 * v4.93a — 20 cột, đã bỏ Giờ khai báo · Giờ HQ phản hồi · Số PXK/PNK ·
 * Ngày nộp · Ngày nhận · PXKT/PNKT (quản lý bên Excel) để bảng lọt màn hình.
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
  const COLS      = 20;            /* số cột của bảng chính (dùng cho colspan) */

  /* ── RAM ─────────────────────────────────────────────────── */
  const GI  = {};                  /* id → dòng GET IN  (1 chuyến tàu)      */
  const GO  = {};                  /* id → dòng GET OUT (1 mã batch)        */
  const USE = {};                  /* 'YYYY-MM-DD' → {p,x,xp,note} — KG     */
  const SAPB= { C3:{}, C4:{} };    /* mat → mã batch → {endKg,date}         */

  let _loaded=false, _allLoaded=false, _initDone=false;
  let _dirty={}, _fb=null, _seq=0;
  let _month='', _useMonth='', _sapAsOf='';
  let _olUnit='T';                 /* đơn vị gõ ở modal OL1: 'T' hay 'kg'   */
  let _imp=null;                   /* bảng thô vừa đọc từ file Excel        */
  const _open={};                  /* giId → false nếu đang gập             */

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
  /* ngày có hiệu lực của 1 dòng get-out (ưu tiên ngày xuất kho thật) */
  function _outDate(r){ return r.date||r.regDate||''; }
  function _sortKey(r){ return (_outDate(r)||'9999-12-31')+'|'+String(r.decl||'')+'|'+String(r._id||''); }
  function _nextYm(ym){
    let y=+String(ym).slice(0,4), m=+String(ym).slice(5,7);
    if(!y||!m) return '';
    m++; if(m>12){ m=1; y++; }
    return y+'-'+String(m).padStart(2,'0');
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
  /* ô "Tồn đầu kỳ" gõ tay.
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
  /* lượng dùng KG của ngày d cho loại L.
     mode 'act'  = CHỈ số gõ tay — dùng cho "Thực còn", tuyệt đối không lấy
                   plan, vì con số này sẽ bị đóng băng khi Chốt kỳ.
     mode 'proj' = số gõ tay, thiếu thì plan X, thiếu nữa thì bình quân. */
  function _useOf(d,L,mode,avg){
    const u=USE[d], k=(L==='P')?'p':'x';
    if(L!=='P'&&L!=='X') return 0;
    if(u){ const a=_num(u[k]); if(a!=null) return a; }
    if(mode!=='proj') return 0;
    if(L==='X' && u){ const p=_num(u.xp); if(p!=null) return p; }
    return avg||0;
  }
  /* bình quân AVG_DAYS ngày gần nhất CÓ GÕ SỐ (kg/ngày) */
  function _avgRate(L){
    const k=(L==='P')?'p':'x';
    const t=_today();
    const ds=Object.keys(USE).filter(d=>d<=t && _num(USE[d][k])!=null).sort().slice(-AVG_DAYS);
    if(!ds.length) return 0;
    return ds.reduce((a,d)=>a+_n(USE[d][k]),0)/ds.length;
  }

  function recalc(){
    const gis=Object.values(GI), gos=Object.values(GO);
    const T=_today();
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
      r.amount = (_num(r.price)!=null && r.qtyN!=null) ? _num(r.price)*r.qtyN/1000 : null;
      r.sapNow = _sapOf(r);                     /* số SAP cùng mã (đối chiếu) */
      r.mat    = r.mat || (GI[r.giId]?GI[r.giId].mat:'C3');
      r.warn=''; r.eta=''; r.etaDays=null; r.zeroDate=''; r.projected=false;
      r.remainKg=null; r.usedKg=null; r.balKg=null;
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
      if(bal<-0.5) g.warn='Xuất vượt lượng nhập '+_K(-bal)+' kg';
    });

    /* ── D / E : lấy thẳng tồn SAP theo mã batch ── */
    gos.forEach(r=>{
      if(r.letter==='P'||r.letter==='X') return;
      const s=_num(r.sapT);
      r.remainKg = (s!=null) ? s : (r.baseKg!=null?r.baseKg:null);
      if(s==null && r.batch) r.warn='Chưa cập nhật từ SAP';
    });

    /* ── P / X : FIFO trong KỲ đang xem, theo bảng FEED OL1 ──────────
       Bộ dữ liệu trừ lùi = MỌI batch chưa tick ✔ Xong, bất kể vào kho từ
       tháng nào. Xuất phát từ TỒN ĐẦU KỲ, chỉ trừ các ngày OL1 THUỘC KỲ này
       (số của kỳ trước đã nằm trong tồn đầu kỳ rồi — trừ lại là đếm đôi).
       • lượt 1 "thực": chỉ ngày trong kỳ và ≤ hôm nay        → Thực còn
       • lượt 2 "chiếu": chạy tiếp sang các kỳ sau bằng plan  → Dự kiến hết */
    MATS.forEach(mat=>{
      ['P','X'].forEach(L=>{
        const rows=gos.filter(r=>r.mat===mat && r.letter===L && !r.hqDone && r.baseKg!=null)
          .sort((a,b)=>{ const ka=_sortKey(a), kb=_sortKey(b); return ka<kb?-1:(ka>kb?1:0); });
        if(!rows.length) return;
        const avg=_avgRate(L);
        const eligible=(r,d)=>{ const out=_outDate(r); return !(out && out>d); };

        /* ---- lượt 1: THỰC CÒN ---- */
        const p1=rows.map(r=>({ r, left:r.baseKg }));
        const end1=(M9<T?M9:T);
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
            if(last && !last.r.warn) last.r.warn='Ngày '+_dmy(d)+' dùng vượt tồn '+_K(need)+' kg';
          }
        }
        p1.forEach(it=>{ it.r.remainKg=Math.max(0,it.left); });

        /* ---- lượt 2: CHIẾU TỚI TƯƠNG LAI (không ghi vào Thực còn) ---- */
        const p2=rows.map(r=>({ r, left:r.baseKg }));
        const stop=_addDays(T,HORIZON);
        for(let d=M0; d && d<=stop; d=_addDays(d,1)){
          const future=(d>T);
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
          if(r._z2 && r._z2>T){ r.zeroDate=r._z2; r.projected=true; }
        });
        rows.forEach(r=>{ delete r._z2; });
      });
    });

    /* ── đã dùng · % · trạng thái · dự kiến hết ── */
    gos.forEach(r=>{
      if(r.remainKg==null) r.remainKg=r.baseKg;
      r.usedKg=(r.baseKg==null||r.remainKg==null)?null:Math.max(0,r.baseKg-r.remainKg);
      r.pct=(r.baseKg>0&&r.usedKg!=null)?Math.min(1,r.usedKg/r.baseKg):0;
      if(r.hqDone)                    r.st='done';
      else if(!(r.remainKg>0.5))      r.st='zero';
      else if(!(r.usedKg>0.5))        r.st='wait';
      else                            r.st='using';
      if(r.st!=='done' && r.st!=='zero' && r.zeroDate && r.projected){
        r.eta=r.zeroDate; r.etaDays=_dayDiff(r.zeroDate,T);
      }
    });

    /* ── trạng thái của chuyến ── */
    gis.forEach(g=>{
      const ch=childrenOf(g._id);
      g.remainKg=ch.reduce((a,r)=>a+(r.remainKg||0),0);
      g.baseKg  =ch.reduce((a,r)=>a+(r.baseKg||0),0);
      if(g.hqDone) g.st='done';
      else if(ch.length && ch.every(r=>r.st==='zero'||r.st==='done')) g.st='zero';
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
    _dirty[path]=val; _btn();
  }
  /* Firebase update() KHÔNG cho map chứa đồng thời 'a/b' (object) và 'a/b/c' */
  function _markField(base,field,val){
    const par=_dirty[base];
    if(par && typeof par==='object') par[field]=val;
    else _dirty[base+'/'+field]=val;
    _btn();
  }
  /* op là map lồng — KHÔNG được nhét key 'op/2026-08' vào object, Firebase
     cấm dấu / trong key của payload; phải tạo object con. */
  function _markOp(id,M,val){
    const base='go/'+id, par=_dirty[base];
    if(par && typeof par==='object'){ par.op=par.op||{}; par.op[M]=val; }
    else _dirty[base+'/op/'+M]=val;
    _btn();
  }
  function _btn(){
    const b=document.getElementById('knq-save');
    if(b){ const n=Object.keys(_dirty).length; b.textContent=n?('💾 Lưu ('+n+')'):'💾 Lưu'; b.classList.toggle('hot',!!n); }
  }
  /* v4.93a — bỏ giờ khai báo / giờ HQ phản hồi / số PXK-PNK / ngày nộp /
     ngày nhận / PXKT-PNKT: quản lý bên Excel, bỏ đi để bảng gọn trong 1 màn hình */
  const GI_FIELDS=['mat','no','owner','vendor','vessel','regDate','decl','date',
                   'price','qtyKg','note','hqDone','hqDate','st'];
  const GO_FIELDS=['giId','mat','no','time','regDate','decl','date','batch','letter',
                   'sapKg','op','sapT','sapDate','price','qtyKg',
                   'note','hqDone','hqDate','st'];
  function _strip(r,F){ const o={}; F.forEach(k=>{ if(r[k]!==undefined) o[k]=r[k]; }); return o; }

  function _load(){
    const jobs=[];
    jobs.push(_ref().child('gi').orderByChild('st').equalTo('open').once('value')
      .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ GI[k]=Object.assign({_id:k},v[k]); }); })
      .catch(e=>console.warn('[KNQ] gi',e)));
    jobs.push(_ref().child('go').orderByChild('st').equalTo('open').once('value')
      .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ GO[k]=Object.assign({_id:k},v[k]); }); })
      .catch(e=>console.warn('[KNQ] go',e)));
    jobs.push(_ref().child('use').orderByKey().startAt(_addDays(_today(),-120)).once('value')
      .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ USE[k]=v[k]; }); })
      .catch(e=>console.warn('[KNQ] use',e)));
    return Promise.all(jobs);
  }
  function loadOld(){
    if(_allLoaded){ _say('Đã tải đầy đủ rồi',''); return; }
    _say('📂 Đang tải dữ liệu đã đóng hồ sơ…','');
    Promise.all([
      _ref().child('gi').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ if(!GI[k]) GI[k]=Object.assign({_id:k},v[k]); }); }),
      _ref().child('go').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ if(!GO[k]) GO[k]=Object.assign({_id:k},v[k]); }); }),
      _ref().child('use').once('value')
        .then(s=>{ const v=s.val()||{}; Object.keys(v).forEach(k=>{ USE[k]=v[k]; }); })
    ]).then(()=>{ _allLoaded=true; render(); _say('📂 Đã tải toàn bộ lịch sử','ok'); })
      .catch(e=>{ console.warn('[KNQ] loadOld',e); _say('❌ Lỗi tải dữ liệu cũ','er'); });
  }
  function save(){
    if(!_canWrite()){ _say('⛔ Tài khoản không có quyền ghi','er'); return; }
    recalc();
    [[GI,'gi'],[GO,'go']].forEach(([BAG,key])=>{
      Object.values(BAG).forEach(r=>{
        const st=r.hqDone?'done':'open';
        if(r._svSt===st) return;
        _markField(key+'/'+r._id,'st',st);
        r._prevSt=r._svSt; r._svSt=st;
      });
    });
    const map=_dirty; _dirty={};
    if(!Object.keys(map).length){ _say('Không có gì để lưu',''); return; }
    _ref().update(map)
      .then(()=>{ _say('✅ Đã lưu '+Object.keys(map).length+' trường','ok'); _btn(); render(); })
      .catch(e=>{
        console.warn('[KNQ] save',e);
        [GI,GO].forEach(BAG=>Object.values(BAG).forEach(r=>{
          if(r._prevSt!==undefined){ r._svSt=r._prevSt; delete r._prevSt; } }));
        Object.assign(_dirty,map); _btn(); _say('❌ Lưu lỗi: '+e.message,'er');
      });
  }

  /* ============================================================
     ⬇ CẬP NHẬT D/E TỪ SAP  —  khớp theo MÃ BATCH người dùng gõ
  ============================================================ */
  function pullSap(){
    if(typeof SP==='undefined' || !SP.batch1100){ _say('❌ Tab SAP chưa sẵn sàng','er'); return; }
    const res=SP.batch1100();
    if(!res.rows.length){
      _say('❌ Tab SAP chưa có dòng SLoc 1100 nào đã tách mã batch'+
           (res.legacy?(' ('+res.legacy+' dòng còn ở dạng gộp cũ — dán lại SAP)'):''),'er');
      return;
    }
    MATS.forEach(m=>{ Object.keys(SAPB[m]).forEach(k=>delete SAPB[m][k]); });
    _sapAsOf='';
    res.rows.forEach(r=>{
      const B=SAPB[r.mat]; if(!B) return;
      const cur=B[r.batch];
      if(!cur || r.date>=cur.date) B[r.batch]={ date:r.date, endKg:Math.round(r.end) };
      if(r.date>_sapAsOf) _sapAsOf=r.date;
    });

    let hit=0, miss=0, px=0;
    Object.values(GO).forEach(r=>{
      if(!r.batch) return;
      const b=SAPB[r.mat]?SAPB[r.mat][String(r.batch).trim().toUpperCase()]:null;
      if(!b){ miss++; return; }
      if(r.letter==='P'||r.letter==='X'){ px++; return; }  /* P/X trừ theo OL1, không đè */
      r.sapT=b.endKg; r.sapDate=b.date;
      _markField('go/'+r._id,'sapT',b.endKg);
      _markField('go/'+r._id,'sapDate',b.date);
      hit++;
    });
    render();
    _say('⬇ Cập nhật '+hit+' batch D/E từ SAP (đến '+_dmy(_sapAsOf)+')'+
         (px?(' · '+px+' batch P/X giữ nguyên, trừ theo FEED OL1'):'')+
         (miss?(' · '+miss+' mã không thấy trong SAP'):'')+' — nhớ 💾 Lưu','ok');
  }
  /* chép số SAP sang cột "Tồn kho theo SAP" của 1 dòng get-out */
  function copySap(id){
    const r=GO[id]; if(!r) return;
    const v=_sapOf(r);
    if(v==null){ _say('⚠ Không thấy mã batch này trong dữ liệu SAP đã lấy về','warn'); return; }
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
    const g=GI[giId]; if(!g){ _say('⚠ Chưa có dòng Get In','warn'); return; }
    const ch=childrenOf(giId), last=ch[ch.length-1];
    const id=_newId('O');
    GO[id]={ _id:id, giId:giId, mat:g.mat, time:(last?last.time:'1st time'),
      regDate:(last?last.regDate:''), decl:'', date:(last?last.date:''),
      batch:'', letter:'', sapKg:'', price:(last?last.price:g.price)||'', qtyKg:'',
      note:'', st:'open' };
    _mark('go/'+id,_strip(GO[id],GO_FIELDS));
    _open[giId]=true;
    render();
    setTimeout(()=>{ const el=document.querySelector('[data-f="'+id+'|decl"]'); if(el) el.focus(); },40);
  }
  function cloneGo(id){
    const s=GO[id]; if(!s) return;
    const nid=_newId('O');
    GO[nid]={ _id:nid, giId:s.giId, mat:s.mat, time:s.time, regDate:s.regDate, decl:'',
      date:s.date, batch:'', letter:'', sapKg:'',
      price:s.price, qtyKg:'', note:'', st:'open' };
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
    if(field==='qtyKg'||field==='price'||field==='sapKg'||field==='sapT'){ const v=_num(val); r[field]=(v==null?'':v); }
    else if(field==='batch'){
      const code=String(val||'').trim().toUpperCase();
      if(code){
        const dup=Object.values(GO).find(o=>o._id!==id && o.mat===r.mat && String(o.batch||'').toUpperCase()===code);
        if(dup){ _say('⚠ Mã batch '+code+' đã có ở dòng khác — mỗi get out chỉ 1 mã batch duy nhất','warn'); }
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
    if(!confirm('Xoá chuyến "'+(g.vessel||g.decl||'chưa đặt tên')+'"'+
                (ch.length?(' và '+ch.length+' dòng get out của nó'):'')+'?')) return;
    ch.forEach(r=>{ delete GO[r._id]; delete _dirty['go/'+r._id];
      _ref().child('go/'+r._id).remove().catch(e=>console.warn('[KNQ] del go',e)); });
    delete GI[id]; delete _dirty['gi/'+id]; delete _open[id];
    _ref().child('gi/'+id).remove().catch(e=>console.warn('[KNQ] del gi',e));
    render();
  }
  function delGo(id){
    const r=GO[id]; if(!r) return;
    if(!confirm('Xoá dòng get out "'+(r.batch||r.decl||'chưa đặt tên')+'"?')) return;
    delete GO[id]; delete _dirty['go/'+id];
    _ref().child('go/'+id).remove().catch(e=>console.warn('[KNQ] del go',e));
    render();
  }
  function toggleDone(kind,id,el){
    const BAG=(kind==='gi')?GI:GO, r=BAG[id]; if(!r) return;
    const on=!!(el&&el.checked);
    if(on && kind==='go' && r.remainKg>0.5 &&
       !confirm('Batch '+(r.batch||r.decl)+' còn '+_K(r.remainKg)+' kg mà vẫn xác nhận ĐÃ XONG?\n\n'+
                'Sau khi Lưu, dòng này sẽ không được tải về lúc mở tab nữa.')){
      el.checked=false; return;
    }
    r.hqDone=on; r.hqDate=on?(r.hqDate||_today()):'';
    _markField(kind+'/'+id,'hqDone',r.hqDone);
    _markField(kind+'/'+id,'hqDate',r.hqDate);
    if(kind==='gi' && on){
      childrenOf(id).forEach(c=>{ if(!c.hqDone){ c.hqDone=true; c.hqDate=c.hqDate||_today();
        _markField('go/'+c._id,'hqDone',true); _markField('go/'+c._id,'hqDate',c.hqDate); } });
    }
    render();
  }
  function toggleGroup(id){ _open[id]=(_open[id]===false); render(); }
  /* đổi KỲ trừ lùi — bảng batch không đổi, chỉ đổi dữ liệu OL1 đem đi trừ */
  function onMonth(){ const e=document.getElementById('knq-month'); if(!e) return;
    _month=e.value||_ym(_today());
    _useMonth=_month;
    const u=document.getElementById('knq-use-month'); if(u) u.value=_useMonth;
    render(); }

  /* ============================================================
     📌 CHỐT KỲ — kết thúc tháng, mở kỳ mới
     Thực còn cuối kỳ này ⇒ TỒN ĐẦU KỲ của kỳ sau (ghi vào op[kỳ sau]).
     Batch đã tick ✔ Xong KHÔNG được chuyển sang — đúng ý "tick cho nó biến
     mất khỏi bộ dữ liệu trừ lùi".
  ============================================================ */
  function closeMonth(){
    if(!_canWrite()){ _say('⛔ Tài khoản không có quyền ghi','er'); return; }
    const M=_month||_ym(_today()), N=_nextYm(M);
    if(!N){ _say('❌ Chưa chọn kỳ','er'); return; }
    const S=recalc();
    const carry=S.gos.filter(r=>!r.hqDone && _ym(_outDate(r))<=M);
    const zero =carry.filter(r=>!(r.remainKg>0.5));
    const done =S.gos.filter(r=>r.hqDone).length;
    if(!confirm('📌 CHỐT KỲ '+M+'  →  MỞ KỲ '+N+'\n\n'+
      '• '+carry.length+' batch chuyển sang kỳ mới, tồn đầu kỳ = thực còn cuối kỳ '+M+'\n'+
      '• '+done+' batch đã tick ✔ Xong — KHÔNG chuyển sang nữa\n'+
      (zero.length?('\n⚠ '+zero.length+' batch đã về 0 mà CHƯA tick ✔ Xong.\n'+
        '   Nên tick trước khi chốt, nếu không nó vẫn nằm trong bộ trừ lùi kỳ sau.\n'):'')+
      '\nTiếp tục?')) return;
    carry.forEach(r=>{
      const v=Math.max(0,r.remainKg||0);
      r.op=r.op||{}; r.op[N]=v; _markOp(r._id,N,v);
    });
    _month=N; _useMonth=N;
    const e=document.getElementById('knq-month'); if(e) e.value=N;
    const u=document.getElementById('knq-use-month'); if(u) u.value=N;
    render();
    _say('📌 Đã chốt kỳ '+M+' · '+carry.length+' batch mở kỳ '+N+
         (zero.length?(' · '+zero.length+' batch về 0 chưa tick ✔'):'')+' — nhớ 💾 Lưu','ok');
  }

  /* ============================================================
     ⛽ FEED OL1 — modal, KHÔNG hiện ngoài trang
  ============================================================ */
  function openOl1(){
    const m=document.getElementById('knq-ol1'); if(!m) return;
    if(!_useMonth) _useMonth=_month||_ym(_today());
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

  function setUse(date,field,val){
    const u=USE[date]||{}; const v=_num(val);
    u[field]=(v==null?'':Math.round(v*_f()*1000)/1000);
    USE[date]=u; _mark('use/'+date,u);
    _renderUse();
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
    if(USE[d]){ _say('Ngày '+_dmy(d)+' đã có','warn'); return; }
    USE[d]={ p:'', x:'', xp:'', note:'' }; _mark('use/'+d,USE[d]);
    _useMonth=_ym(d); const m=document.getElementById('knq-use-month'); if(m) m.value=_useMonth;
    _renderUse();
  }
  function fillUseMonth(){
    if(!_useMonth) _useMonth=_ym(_today());
    const y=+_useMonth.slice(0,4), mo=+_useMonth.slice(5,7), last=new Date(y,mo,0).getDate();
    let n=0;
    for(let d=1;d<=last;d++){
      const k=_useMonth+'-'+String(d).padStart(2,'0');
      if(!USE[k]){ USE[k]={p:'',x:'',xp:'',note:''}; _mark('use/'+k,USE[k]); n++; }
    }
    _renderUse(); _say('📅 Thêm '+n+' ngày trống cho tháng '+_useMonth,'ok');
  }
  function delUseRow(date){
    if(!confirm('Xoá dòng ngày '+_dmy(date)+'?')) return;
    delete USE[date]; delete _dirty['use/'+date];
    _ref().child('use/'+date).remove().catch(e=>console.warn('[KNQ] del use',e));
    _renderUse();
  }
  function onUseMonth(){ const e=document.getElementById('knq-use-month'); if(!e) return;
    _useMonth=e.value||''; _renderUse(); }

  /* ============================================================
     📥 IMPORT PLAN X TỪ EXCEL
     Đọc file → cho người dùng chọn CỘT NGÀY và CỘT PLAN X → áp dụng.
  ============================================================ */
  function pickFile(){ const f=document.getElementById('knq-file'); if(f){ f.value=''; f.click(); } }
  function fileChosen(input){
    const f=input&&input.files&&input.files[0]; if(!f) return;
    if(typeof XLSX==='undefined'){ _say('❌ Thư viện XLSX chưa nạp','er'); return; }
    const rd=new FileReader();
    rd.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
        const sh=wb.Sheets[wb.SheetNames[0]];
        const aoa=XLSX.utils.sheet_to_json(sh,{header:1,raw:true,defval:null});
        _imp=_prepImp(aoa,f.name);
        _renderImp();
        _say('📥 Đã đọc '+f.name+' — chọn cột rồi bấm ÁP DỤNG','ok');
      }catch(err){ console.warn('[KNQ] import',err); _say('❌ Không đọc được file: '+err.message,'er'); }
    };
    rd.readAsArrayBuffer(f);
  }
  /* chuẩn hoá bảng thô: tìm dòng tiêu đề, đoán cột ngày + cột plan X */
  function _prepImp(aoa,fname){
    const rows=(aoa||[]).filter(r=>r&&r.some(c=>c!=null&&String(c).trim()!==''));
    if(!rows.length) throw new Error('file rỗng');
    let hdr=0, best=-1;
    rows.slice(0,10).forEach((r,i)=>{
      const s=r.filter(c=>typeof c==='string'&&String(c).trim()).length;
      if(s>best){ best=s; hdr=i; }
    });
    const head=(rows[hdr]||[]).map((c,i)=>String(c==null?('Cột '+(i+1)):c).trim()||('Cột '+(i+1)));
    const body=rows.slice(hdr+1);
    const nc=Math.max(head.length,...body.map(r=>r.length));
    while(head.length<nc) head.push('Cột '+(head.length+1));
    /* cột ngày = cột parse được nhiều ngày nhất */
    let dCol=-1, dBest=0;
    for(let c=0;c<nc;c++){
      let k=0; body.forEach(r=>{ if(_toIso(r[c])) k++; });
      if(k>dBest){ dBest=k; dCol=c; }
    }
    /* cột plan X — CHẤM ĐIỂM, không lấy cột đầu tiên khớp mờ.
       Bẫy đã dính: "Total P+X" cũng chứa chữ x nên từng bị chọn nhầm. */
    let xCol=-1, xBest=0;
    for(let c=0;c<nc;c++){
      if(c===dCol) continue;
      if(!body.some(r=>_num(r[c])!=null)) continue;
      const h=head[c].toLowerCase().trim().replace(/\s+/g,' ');
      let s=1;
      if(/total|tổng|sum|p\s*\+\s*x/.test(h))   s=0.5;      /* cột tổng → hạ điểm */
      if(/export\s*petchem/.test(h))            s=6;
      if(/(^|[^a-z])x([^a-z]|$)/.test(h))       s=Math.max(s,7);
      if(/plan/.test(h))                        s=Math.max(s,8);
      if(/plan/.test(h)&&/x/.test(h))           s=10;
      if(h==='x'||h==='plan x'||h==='x plan')   s=12;
      if(s>xBest){ xBest=s; xCol=c; }
    }
    return { name:fname, head, body, dCol, xCol, unit:'T' };
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
  function impSet(field,val){ if(!_imp) return; _imp[field]=(field==='unit')?val:(+val); _renderImp(); }
  function impCancel(){ _imp=null; _renderImp(); }
  function impApply(){
    if(!_imp){ return; }
    const { body, dCol, xCol, unit }=_imp;
    if(dCol<0||xCol<0){ _say('⚠ Chọn cả cột Ngày và cột Plan X','warn'); return; }
    const f=(unit==='kg')?1:1000;
    let n=0, skip=0, dup=0;
    const done={};
    body.forEach(r=>{
      const d=_toIso(r[dCol]); const v=_num(r[xCol]);
      if(!d||v==null){ skip++; return; }
      /* file thường có 1 dòng TỔNG mang lại ngày đã có → giữ dòng ĐẦU, bỏ dòng sau */
      if(done[d]){ dup++; return; }
      done[d]=1;
      const u=USE[d]||{p:'',x:'',xp:'',note:''};
      u.xp=Math.round(v*f*1000)/1000;
      USE[d]=u; _mark('use/'+d,u); n++;
    });
    _imp=null; _renderImp(); _renderUse(); render();
    _say('📥 Đã nạp plan X cho '+n+' ngày'+
         (skip?(' · bỏ qua '+skip+' dòng không có ngày/số'):'')+
         (dup?(' · bỏ qua '+dup+' dòng trùng ngày (dòng tổng?)'):'')+' — nhớ 💾 Lưu','ok');
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
    if(r.st==='done') return '<span class="knq-b done">✅ Đã xong</span>';
    if(r.st==='zero') return '<span class="knq-b zero">🔴 HẾT — khai HQ</span>';
    if(r.st==='wait') return '<span class="knq-b wait">⏳ Chưa bơm</span>';
    return '<span class="knq-b using">🟢 Đang bơm</span>';
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
  function render(){
    if(!document.getElementById('rpt-pg-knq')) return;
    const k=_focusKey();
    const S=recalc();
    MATS.forEach(m=>_renderMat(m));
    _renderBar(S);
    _btn();
    _refocus(k);
  }

  function _renderBar(S){
    const c={using:0,wait:0,zero:0,done:0,soon:0};
    let left=0, base=0;
    S.gos.forEach(r=>{
      if(c[r.st]!==undefined) c[r.st]++;
      if(r.st!=='done'){ left+=r.remainKg||0; base+=r.baseKg||0; }
      if(r.st==='using'&&r.etaDays!=null&&r.etaDays<=WARN_DAYS) c.soon++;
    });
    const el=document.getElementById('knq-stats');
    if(el) el.innerHTML=
      '<span class="knq-chip using"><b>'+c.using+'</b> đang bơm</span>'+
      '<span class="knq-chip wait"><b>'+c.wait+'</b> chưa bơm</span>'+
      (c.soon?'<span class="knq-chip soon"><b>'+c.soon+'</b> sắp hết</span>':'')+
      '<span class="knq-chip zero"><b>'+c.zero+'</b> hết · khai HQ</span>'+
      (c.done?'<span class="knq-chip done"><b>'+c.done+'</b> đã xong</span>':'')+
      '<span class="knq-chip tot">Thực còn <b>'+_K(left)+'</b> / '+_K(base)+' kg</span>'+
      (_sapAsOf?('<span class="knq-chip sap">SAP đến <b>'+_dmy(_sapAsOf)+'</b></span>'):'');
    const b=document.getElementById('knq-close');
    if(b) b.title='Kết thúc kỳ '+(_month||'—')+': thực còn cuối kỳ trở thành tồn đầu kỳ của kỳ sau. '+
      'Batch đã tick ✔ Xong không chuyển sang.';
  }

  function _renderMat(mat){
    const tb=document.getElementById('knq-body-'+mat.toLowerCase()); if(!tb) return;
    const gis=visibleGi(mat);
    if(!gis.length){
      tb.innerHTML='<tr><td colspan="'+COLS+'" class="knq-empty">Chưa có chuyến '+mat+
        ' nào — bấm <b>➕ Get In '+mat+'</b> để khai chuyến tàu. '+
        'Hàng vào kho từ tháng trước cũng khai ở đây, app không lọc theo tháng.</td></tr>';
      return;
    }
    let h='', tQty=0,tBase=0,tUsed=0,tLeft=0,nGo=0;
    gis.forEach(g=>{
      const open=(_open[g._id]!==false);
      const ch=childrenOf(g._id);
      tQty+=g.qtyN||0;
      h+=_giRow(g,ch.length,open);
      if(open) ch.forEach((r,i)=>{
        nGo++; tBase+=r.baseKg||0; tUsed+=r.usedKg||0; tLeft+=r.remainKg||0;
        h+=_goRow(r,i+1);
      });
    });
    h+='<tr class="knq-tot"><td colspan="10">TỔNG '+mat+' — '+gis.length+' chuyến · '+nGo+
       ' get out đang trừ lùi · kỳ '+(_month||'—')+'</td>'+
       '<td class="n">'+_K(tBase)+'</td><td class="n">'+_K(tUsed)+'</td>'+
       '<td class="n">'+_K(tLeft)+'</td>'+
       '<td class="n">'+(tBase>0?((tUsed/tBase*100).toFixed(1)+'%'):'')+'</td>'+
       '<td colspan="2"></td><td class="n">'+_K(tQty)+'</td>'+
       '<td colspan="3"></td></tr>';
    tb.innerHTML=h;
  }

  /* ── DÒNG GET IN — 1 chuyến tàu ── */
  function _giRow(g,nCh,open){
    const id=g._id;
    return '<tr class="knq-gi knq-'+(g.st||'wait')+'">'+
      '<td class="c"><input type="checkbox" class="knq-ck"'+(g.hqDone?' checked':'')+
        ' title="Đóng hồ sơ cả chuyến (tick luôn mọi get out)"'+
        ' onchange="KNQ.toggleDone(\'gi\',\''+id+'\',this)"></td>'+
      '<td class="c">'+_inp('gi',id,'no',g.no,'','mono c','VVIII',44)+'</td>'+
      '<td class="c"><span class="knq-b gin" onclick="KNQ.toggleGroup(\''+id+'\')" '+
        'title="Gập/mở các dòng get out">'+(open?'▼':'▶')+' GET IN</span>'+
        '<div class="sm">'+nCh+' get out</div></td>'+
      '<td>'+_inp('gi',id,'vendor',g.vendor,'','','nhà cung cấp',88)+'</td>'+
      '<td>'+_inp('gi',id,'vessel',g.vessel,'','b','tên tàu / chuyến',130)+'</td>'+
      '<td>'+_inp('gi',id,'regDate',g.regDate,'date')+'</td>'+
      '<td>'+_inp('gi',id,'decl',g.decl,'','mono','tờ khai nhập',110)+'</td>'+
      '<td>'+_inp('gi',id,'date',g.date,'date')+'</td>'+
      '<td class="c"><select class="knq-sel nar" onchange="KNQ.setGi(\''+id+'\',\'mat\',this.value)">'+
        _op(MATS,g.mat)+'</select></td>'+
      '<td class="c knq-dim">—</td>'+
      '<td class="n knq-dim">—</td><td class="n knq-dim">—</td>'+
      '<td class="n b">'+_K(g.remainKg||0)+'<div class="sm">tổng batch còn</div></td>'+
      '<td class="n knq-dim">—</td><td class="n knq-dim">—</td>'+
      '<td class="n">'+_inp('gi',id,'price',g.price,'','n','đơn giá',64)+'</td>'+
      '<td class="n">'+_inp('gi',id,'qtyKg',g.qtyKg,'','n','kg nhập',88)+
        (g.qtyN!=null?('<div class="sm">'+_T(g.qtyN)+' T</div>'):'')+'</td>'+
      '<td class="n">'+_K(g.amount)+'</td>'+
      '<td class="n b">'+_K(g.balKg)+'<div class="sm">chưa xuất</div></td>'+
      '<td>'+_inp('gi',id,'note',g.note,'','','ghi chú',110)+
        (g.warn?('<div class="knq-warn">⚠ '+_esc(g.warn)+'</div>'):'')+
        '<div class="knq-acts">'+
        '<button class="knq-mini go" title="Thêm 1 dòng GET OUT (1 mã batch) cho chuyến này"'+
          ' onclick="KNQ.addGo(\''+id+'\')">➕ Get Out</button>'+
        '<button class="knq-x" title="Xoá cả chuyến" onclick="KNQ.delGi(\''+id+'\')">✕</button></div></td>'+
    '</tr>';
  }

  /* ── DÒNG GET OUT — 1 mã batch duy nhất ── */
  function _goRow(r,i){
    const id=r._id;
    const soon=(r.st==='using'&&r.etaDays!=null&&r.etaDays<=WARN_DAYS);
    const sapHint=(r.sapNow!=null)
      ? ('<div class="knq-hintline" title="Tồn của mã batch này trong dữ liệu SAP đã lấy về">SAP '+_K(r.sapNow)+
         ' <button class="knq-mini" title="Chép số SAP sang ô bên" onclick="KNQ.copySap(\''+id+'\')">⇐</button></div>')
      : (r.batch?'<div class="knq-hintline dim">SAP: không thấy mã</div>':'');
    /* nguồn của tồn đầu kỳ: chốt kỳ trước, hay số khai ban đầu */
    const opHint=(r._opFrom==='khai')
      ? '<div class="knq-hintline dim" title="Chưa chốt kỳ nào — đang lấy đúng số bạn khai ban đầu">= số khai</div>'
      : (r._opFrom?('<div class="knq-hintline dim" title="Tồn đầu kỳ mang sang từ lần chốt kỳ '+r._opFrom+'">đk '+r._opFrom+'</div>')
        :(_ym(_outDate(r))===_month?'<div class="knq-hintline dim">ra kho trong kỳ</div>':''));
    const px=(r.letter==='P'||r.letter==='X');
    return '<tr class="knq-go knq-'+r.st+(soon?' knq-soon':'')+'">'+
      '<td class="c"><input type="checkbox" class="knq-ck"'+(r.hqDone?' checked':'')+
        ' title="Đã khai Hải quan hoàn thành xuất kho — sau khi Lưu sẽ không tải về nữa"'+
        ' onchange="KNQ.toggleDone(\'go\',\''+id+'\',this)"></td>'+
      '<td class="c sm">'+i+'</td>'+
      '<td>'+_stTxt(r)+'</td>'+
      '<td>'+_inp('go',id,'time',r.time,'','','1st time',80)+'</td>'+
      '<td class="knq-dim sm">↳ get out</td>'+
      '<td>'+_inp('go',id,'regDate',r.regDate,'date')+'</td>'+
      '<td>'+_inp('go',id,'decl',r.decl,'','mono','tờ khai xuất',110)+'</td>'+
      '<td>'+_inp('go',id,'date',r.date,'date')+'</td>'+
      '<td>'+_inp('go',id,'batch',r.batch,'','mono','260804X001',96)+'</td>'+
      '<td class="c"><select class="knq-sel" onchange="KNQ.setGo(\''+id+'\',\'letter\',this.value)">'+
        _op(TYPES.map(t=>({v:t,l:t+' '+LETTER_NAME[t]})),r.letter,'—')+'</select></td>'+
      '<td class="n"><input class="knq-in n" data-o="'+id+'" inputmode="decimal" placeholder="kg"'+
        ' style="min-width:88px" value="'+_esc(r.baseKg==null?'':r.baseKg)+'"'+
        ' title="Tồn đầu kỳ '+(_month||'')+' — gõ tay lượng tồn đang có của batch này"'+
        ' onchange="KNQ.setOp(\''+id+'\',this.value)">'+opHint+sapHint+'</td>'+
      '<td class="n">'+_K(r.usedKg)+(px?'<div class="sm">theo OL1 kỳ '+(_month||'')+'</div>':'')+'</td>'+
      '<td class="n b">'+_K(r.remainKg)+
        (r.zeroDate&&!r.projected?('<div class="sm">hết '+_dmy(r.zeroDate)+'</div>'):'')+'</td>'+
      '<td class="n">'+(r.baseKg>0?((r.pct*100).toFixed(1)+'%'):'')+
        '<div class="knq-pbar"><i style="width:'+((r.pct||0)*100).toFixed(1)+'%"></i></div></td>'+
      '<td class="n'+(soon?' knq-hot':'')+'">'+(r.eta?(_dmy(r.eta)+'<div class="sm">'+r.etaDays+' ngày</div>'):'')+'</td>'+
      '<td class="n">'+_inp('go',id,'price',r.price,'','n','đơn giá',64)+'</td>'+
      '<td class="n">'+_inp('go',id,'qtyKg',r.qtyKg,'','n','kg xuất',88)+
        (r.qtyN!=null?('<div class="sm">'+_T(r.qtyN)+' T</div>'):'')+'</td>'+
      '<td class="n">'+_K(r.amount)+'</td>'+
      '<td class="n">'+_K(r.balKg)+'</td>'+
      '<td>'+_inp('go',id,'note',r.note,'','','ghi chú',110)+
        (r.warn?('<div class="knq-warn">⚠ '+_esc(r.warn)+'</div>'):'')+
        '<div class="knq-acts">'+
        '<button class="knq-mini" title="Nhân bản dòng get out" onclick="KNQ.cloneGo(\''+id+'\')">⧉</button>'+
        '<button class="knq-x" title="Xoá dòng get out" onclick="KNQ.delGo(\''+id+'\')">✕</button></div></td>'+
    '</tr>';
  }

  /* ── BẢNG FEED OL1 trong modal ── */
  function _renderUse(){
    const tb=document.getElementById('knq-use-body'); if(!tb) return;
    const _fk=_focusKey();
    if(!_useMonth){ _useMonth=_ym(_today()); const m=document.getElementById('knq-use-month'); if(m) m.value=_useMonth; }
    const T=_today();
    const days=Object.keys(USE).filter(d=>_ym(d)===_useMonth).sort();
    const uh=document.getElementById('knq-use-unit-h');
    if(uh) uh.textContent=(_olUnit==='kg'?'kg':'Tấn');
    if(!days.length){
      tb.innerHTML='<tr><td colspan="7" class="knq-empty">Tháng '+_useMonth+
        ' chưa có ngày nào — bấm <b>📅 Tạo cả tháng</b> hoặc <b>📥 Import plan X</b>.</td></tr>';
      _renderImp(); return;
    }
    let sp=0,sx=0,st=0;
    tb.innerHTML=days.map(d=>{
      const u=USE[d]||{}, p=_num(u.p), x=_num(u.x), xp=_num(u.xp);
      const xe=(x!=null)?x:xp;                       /* X có hiệu lực */
      const act=(d<=T&&(p!=null||x!=null));
      const tot=(p!=null||xe!=null)?((p||0)+(xe||0)):null;
      if(p!=null) sp+=p; if(xe!=null) sx+=xe; if(tot!=null) st+=tot;
      return '<tr'+(d===T?' class="knq-todayrow"':'')+'>'+
        '<td class="c">'+_dmy(d)+'</td>'+
        '<td class="n b">'+_disp(tot)+'</td>'+
        '<td><input class="knq-in n" data-u="'+d+'|p" inputmode="decimal" value="'+_disp(p)+'"'+
          ' onkeydown="KNQ.useKey(event,\''+d+'\',\'p\')" onchange="KNQ.setUse(\''+d+'\',\'p\',this.value)"></td>'+
        '<td><input class="knq-in n" data-u="'+d+'|x" inputmode="decimal" value="'+_disp(x)+'"'+
          ' onkeydown="KNQ.useKey(event,\''+d+'\',\'x\')" onchange="KNQ.setUse(\''+d+'\',\'x\',this.value)"'+
          (xp!=null&&x==null?(' placeholder="'+_disp(xp)+'"'):'')+'></td>'+
        '<td class="n knq-plan">'+(xp!=null?_disp(xp):'')+'</td>'+
        '<td class="c">'+(act?'<span class="knq-b using">Actual</span>'
                             :'<span class="knq-b wait">Plan</span>')+'</td>'+
        '<td><input class="knq-in" value="'+_esc(u.note||'')+'" onchange="KNQ.setUseNote(\''+d+'\',this.value)">'+
          '<button class="knq-x" onclick="KNQ.delUseRow(\''+d+'\')">✕</button></td></tr>';
    }).join('')+
      '<tr class="knq-tot"><td class="c">TỔNG '+_useMonth+'</td>'+
      '<td class="n">'+_disp(st)+'</td><td class="n">'+_disp(sp)+'</td>'+
      '<td class="n">'+_disp(sx)+'</td><td colspan="3"></td></tr>';
    _renderImp();
    _refocus(_fk);
  }

  /* ── khay chọn cột sau khi đọc file Excel ── */
  function _renderImp(){
    const box=document.getElementById('knq-imp'); if(!box) return;
    if(!_imp){ box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    const opts=_imp.head.map((h,i)=>({v:i,l:(i+1)+'. '+h}));
    box.innerHTML=
      '<div class="knq-hint"><b>📥 '+_esc(_imp.name)+'</b> — '+_imp.body.length+
      ' dòng. Chọn cột <b>Ngày</b> và cột <b>Plan X</b> rồi bấm ÁP DỤNG. '+
      'Plan X chỉ ghi vào cột <i>Plan X</i>; số dùng thực tế P và X vẫn gõ tay.</div>'+
      '<div class="knq-frow">'+
        '<label>Cột ngày</label><select onchange="KNQ.impSet(\'dCol\',this.value)">'+_op(opts,_imp.dCol)+'</select>'+
        '<label>Cột plan X</label><select onchange="KNQ.impSet(\'xCol\',this.value)">'+_op(opts,_imp.xCol)+'</select>'+
        '<label>Đơn vị</label><select onchange="KNQ.impSet(\'unit\',this.value)">'+
          _op([{v:'T',l:'Tấn'},{v:'kg',l:'kg'}],_imp.unit)+'</select>'+
        '<button class="knq-btn primary" onclick="KNQ.impApply()">✔ ÁP DỤNG</button>'+
        '<button class="knq-btn" onclick="KNQ.impCancel()">Huỷ</button>'+
      '</div>';
  }

  /* ============================================================
     EXPORT — 1 sheet cho C3, 1 cho C4, 1 cho FEED OL1
  ============================================================ */
  function exportXlsx(){
    if(typeof XLSX==='undefined'){ _say('❌ Thư viện XLSX chưa nạp','er'); return; }
    recalc();
    const ST={using:'Đang bơm',wait:'Chưa bơm',zero:'Hết — cần khai HQ',done:'Đã xong'};
    const H=['STT','Loại dòng','Nhà cung cấp / Lần xuất','Tên tàu','Ngày tờ khai','Số tờ khai',
             'Ngày nhập/xuất','SAP - Lô','Loại lô',
             'Tồn đầu kỳ (kg)','Đã dùng trong kỳ (kg)','Thực còn trong KNQ (kg)','% đã bơm','Dự kiến hết',
             'Đơn giá','Trọng lượng (kg)','Thành tiền','Còn lại của chuyến (kg)',
             'Trạng thái','Đã xong','Ghi chú'];
    const wb=XLSX.utils.book_new();
    MATS.forEach(mat=>{
      const rows=[];
      visibleGi(mat).forEach(g=>{
        rows.push([g.no||'','GET IN',g.vendor||'',g.vessel||'',_dmy(g.regDate),g.decl||'',
          _dmy(g.date),'','','','',g.remainKg||0,'','',
          _num(g.price),g.qtyN,g.amount,g.balKg,ST[g.st]||'',g.hqDone?'x':'',g.note||'']);
        childrenOf(g._id).forEach((r,i)=>{
          rows.push([i+1,'GET OUT',r.time||'',g.vessel||'',_dmy(r.regDate),r.decl||'',
            _dmy(r.date),r.batch||'',LETTER_NAME[r.letter]||r.letter||'',
            r.baseKg,r.usedKg,r.remainKg,r.pct||0,_dmy(r.eta),
            _num(r.price),r.qtyN,r.amount,r.balKg,ST[r.st]||'',r.hqDone?'x':'',r.note||'']);
        });
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([H].concat(rows)),mat+' '+MAT_NAME[mat]);
    });
    const use=Object.keys(USE).sort().map(d=>{
      const u=USE[d]||{}, p=_num(u.p), x=_num(u.x), xp=_num(u.xp), xe=(x!=null)?x:xp;
      return [d,((p||0)+(xe||0))/1000,(p==null?null:p/1000),(x==null?null:x/1000),
              (xp==null?null:xp/1000),(d<=_today()&&(p!=null||x!=null))?'Actual':'Plan',u.note||''];
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(
      [['Date','Total P+X (T)','P (T)','X (T)','Plan X (T)','Remark','Ghi chú']].concat(use)),'Feed OL1');
    XLSX.writeFile(wb,'XNK_KhoNgoaiQuan_'+(_month||_ym(_today()))+'.xlsx');
    _say('📤 Đã xuất Excel','ok');
  }

  /* ============================================================
     LIFECYCLE
  ============================================================ */
  function init(){
    if(_initDone) return; _initDone=true;
    _month=_ym(_today()); _useMonth=_month;
    const m=document.getElementById('knq-month'); if(m) m.value=_month;
    const u=document.getElementById('knq-use-month'); if(u) u.value=_useMonth;
  }
  function onTabEnter(){
    init();
    if(_loaded){ render(); return; }
    _loaded=true;
    MATS.forEach(mt=>{ const tb=document.getElementById('knq-body-'+mt.toLowerCase());
      if(tb) tb.innerHTML='<tr><td colspan="'+COLS+'" class="knq-empty">Đang tải…</td></tr>'; });
    _load().then(()=>{
      Object.values(GI).forEach(r=>{ r._svSt=r.st||'open'; });
      Object.values(GO).forEach(r=>{ r._svSt=r.st||'open'; });
      render();
    }).catch(e=>{ console.warn('[KNQ] load',e); render(); _say('❌ Lỗi tải dữ liệu KNQ','er'); });
  }

  return {
    init, onTabEnter, render, recalc, save, loadOld, exportXlsx,
    pullSap, copySap,
    addGi, addGo, cloneGo, setGi, setGo, delGi, delGo, toggleDone, toggleGroup,
    onMonth, closeMonth, setOp, childrenOf, visibleGi,
    openOl1, closeOl1, onOl1Unit, setUse, setUseNote, useKey,
    addUseRow, fillUseMonth, delUseRow, onUseMonth,
    pickFile, fileChosen, impSet, impApply, impCancel,
    _state:{ GI, GO, USE, SAPB, sapAsOf:()=>_sapAsOf, imp:()=>_imp,
             month:()=>_month, setMonth:m=>{ _month=m; _useMonth=m; } }
  };
})();
window.KNQ = KNQ;
