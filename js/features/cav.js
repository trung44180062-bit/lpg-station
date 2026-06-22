/* ============================================================
 * CAV  —  cav.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 25059–25760   (~702 dòng)
 * Global xuất ra : window.CAV
 * Phase tách     : P5B
 * Phụ thuộc      : tl, wg, ws, sp, vlog, JSZip
 * Khởi tạo (boot): CAV.init() = P4 boot
 * ------------------------------------------------------------
 * MÔ TẢ: Cavern Daily / SAP-WMS readiness: KIND_LBL/KIND_CLS/BATCH_LBL, CAV_LEDGER (header model), FILL_C3 (bản đồ cột), PRICE_IN. Xem HANDOFF + MODULE-MAP §4.
 *
 * API công khai (điền/đối chiếu khi tách):
 *   CAV.init(), CAV.render(), CAV.preview(), CAV.exportReport(), CAV.savePrices(), CAV.add(kind)
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module CAV từ dòng 25059 đến 25760.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.CAV).
 *   3) node --check cav.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P5B]: dán thân module CAV (V4-54 dòng 25059–25760) vào đây. */

/* ===== BÓC TỪ V4-54 dòng 25059–25760 ===== */
const CAV = (function(){
  'use strict';
  const FB_PATH  = 'cavern_in';
  const KIND_LBL = { vlgc:'VLGC IN', vlgcout:'VLGC OUT', gr:'GR 통관', heater:'HEATER', ol1:'OL1 SUPPLY' };
  const KIND_CLS = { vlgc:'cav-b-vlgc', vlgcout:'cav-b-vlgc', gr:'cav-b-gr', heater:'cav-b-heater', ol1:'cav-b-ol1' };
  const BATCH_LBL= { PX:'X+P', X:'X', P:'P', D:'D', E:'E' };
  const CAV_LEDGER = {"c3": {"ncol": 83, "hdr": [[{"t": "프로판(Propane)", "c": 1, "r": 2}, {"t": "Initial Stock", "c": 7, "r": 1}, {"t": "Total", "c": 1, "r": 2}, {"t": "VLGC", "c": 3, "r": 1}, {"t": "Bonded Ware House (보세창고)", "c": 7, "r": 1}, {"t": "입고 (Get in Clearance)", "c": 15, "r": 1}, {"t": "출하 (Get out Clearance)", "c": 24, "r": 1}, {"t": "SAP End Batch Stock", "c": 17, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "Total C3 Batch Stock (SAP)", "c": 4, "r": 2}, {"t": "", "c": 1, "r": 1}, {"t": "미통관 재고 +  C3 Batch Stock", "c": 2, "r": 2}], [{"t": "PETCHEM", "c": 1, "r": 1}, {"t": "EX-PETCHEM", "c": 1, "r": 1}, {"t": "Domestic", "c": 4, "r": 1}, {"t": "Export", "c": 1, "r": 1}, {"t": "보세창고 미 입고 물량", "c": 3, "r": 1}, {"t": "Get in", "c": 1, "r": 1}, {"t": "Get out", "c": 5, "r": 1}, {"t": "Ramain Sotck", "c": 1, "r": 1}, {"t": "PETCHEM", "c": 3, "r": 1}, {"t": "EX-PETCHEM", "c": 3, "r": 1}, {"t": "Domestic", "c": 6, "r": 1}, {"t": "Export", "c": 2, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "DH 이체량", "c": 7, "r": 1}, {"t": "Domestic", "c": 11, "r": 1}, {"t": "LPG Export", "c": 5, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "PETCHEM", "c": 2, "r": 1}, {"t": "EX-PETCHEM", "c": 2, "r": 1}, {"t": "Domestic", "c": 7, "r": 1}, {"t": "Export", "c": 5, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}], [{"t": "저장위치", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "입고(Get in)", "c": 1, "r": 1}, {"t": "출고(Get out)", "c": 1, "r": 1}, {"t": "재고(Stock)", "c": 1, "r": 1}, {"t": "Cavern", "c": 1, "r": 1}, {"t": "*P*", "c": 1, "r": 1}, {"t": "*EX-P*", "c": 1, "r": 1}, {"t": "*D*", "c": 1, "r": 1}, {"t": "*E*", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "미통관 재고", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "PETCHEM", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "EX-PETCHEM", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "Actual Cavern Discharge Qty", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "Actual Domestic", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "Actual Export", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "Cavern+Ball Tank", "c": 1, "r": 1}], [{"t": "항목", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "통관이체", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "통관이체", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "TK. Export", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Ball Tank", "c": 1, "r": 1}, {"t": "Ship", "c": 1, "r": 1}, {"t": "Pure C3", "c": 1, "r": 1}, {"t": "Heater", "c": 1, "r": 1}, {"t": "*Batch* Trs", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Ship", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Price($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}]]}, "c4": {"ncol": 58, "hdr": [[{"t": "부탄(Butane)", "c": 1, "r": 2}, {"t": "Initial Stock", "c": 5, "r": 1}, {"t": "Total", "c": 1, "r": 2}, {"t": "VLGC", "c": 3, "r": 1}, {"t": "Bonded Ware House (보세창고)", "c": 5, "r": 1}, {"t": "입고 (Get in Clearance)", "c": 7, "r": 1}, {"t": "출하 (Get out Clearance)", "c": 15, "r": 1}, {"t": "SAP Batch Stock", "c": 13, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "Total C4 Batch Stock (SAP)", "c": 4, "r": 2}, {"t": "", "c": 1, "r": 1}, {"t": "미통관 재고 +  C4 Batch Stock", "c": 2, "r": 2}], [{"t": "Domestic", "c": 4, "r": 1}, {"t": "Export", "c": 1, "r": 1}, {"t": "보세창고 미 입고 물량", "c": 3, "r": 1}, {"t": "Get in", "c": 1, "r": 1}, {"t": "Get out", "c": 3, "r": 1}, {"t": "Ramain Sotck", "c": 1, "r": 1}, {"t": "Domestic", "c": 5, "r": 1}, {"t": "Export", "c": 1, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "Domestic", "c": 9, "r": 1}, {"t": "Export", "c": 5, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "Domestic", "c": 7, "r": 1}, {"t": "Export", "c": 5, "r": 1}, {"t": "Total", "c": 1, "r": 3}, {"t": "", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}], [{"t": "저장위치", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "입고(Get in)", "c": 1, "r": 1}, {"t": "출고(Get out)", "c": 1, "r": 1}, {"t": "재고(Stock)", "c": 1, "r": 1}, {"t": "Cavern", "c": 1, "r": 1}, {"t": "*D*", "c": 1, "r": 1}, {"t": "*E*", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "미통관 재고", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 3, "r": 1}, {"t": "total", "c": 1, "r": 2}, {"t": "Cavern Discharge Quantity", "c": 1, "r": 2}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 2}, {"t": "Actual Domestic Sales Qty", "c": 1, "r": 2}, {"t": "1100(Cavern)", "c": 2, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "Actual Export Sales Qty", "c": 1, "r": 2}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "2100(TK-3501)", "c": 1, "r": 1}, {"t": "2101(TK-3502)", "c": 1, "r": 1}, {"t": "total", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "1100(Cavern)", "c": 1, "r": 1}, {"t": "Cavern+Ball Tank", "c": 1, "r": 1}], [{"t": "항목", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "통관이체", "c": 1, "r": 1}, {"t": "TK. Export", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Ball Tank", "c": 1, "r": 1}, {"t": "Ship", "c": 1, "r": 1}, {"t": "Pure C4", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "Ship", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "단가($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "단가($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "단가($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "단가($/톤)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}, {"t": "(ton)", "c": 1, "r": 1}]]}};
  /* manual-filled columns of the Propane sheet (1-based Excel col → code).
     codes resolve against _agg(): v=VLGC, gP/gX/gD/gE=GR by batch,
     oP/oX/oT=OL1 P/X/total, h=Heater. C4(butane) layout pending → no fill yet. */
  const FILL_C3 = {10:'v',14:'gP',15:'gX',16:'gD',17:'gE',35:'oP',37:'oP',38:'oX',40:'oX',41:'oT',45:'h'};
  function _manTon(prod,col,A){
    const code=FILL_C3[col]; if(!code) return null;
    const m={v:A.vlgc[prod],gP:A.gr.P[prod],gX:A.gr.X[prod],gD:A.gr.D[prod],gE:A.gr.E[prod],
             oP:A.ol1.P,oX:A.ol1.X,oT:(A.ol1.PX||A.ol1.X+A.ol1.P),h:A.heater[prod]};
    return _ton(m[code]||0);
  }

  let ROWS = [];
  let RID_MAP = Object.create(null);
  let _fbRef = null, _suppressEcho = 0, _attached = false;
  let _file = null;   /* chosen WMS SAP .xlsx File */
  let _editRid = null; /* rid of the manual entry being edited inline in Preview */

  function _genRid(){ return Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4); }
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _today(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _curDate(){ const el=document.getElementById('cavDate'); return (el&&el.value)||_today(); }
  function _fmt(n){ const v=parseFloat(n); return isNaN(v)?'':v.toLocaleString('en-US',{maximumFractionDigits:1}); }
  function _ton(kg){ const v=parseFloat(kg)||0; return v/1000; }
  function _num(id){ const el=document.getElementById(id); const v=el?parseFloat(el.value):NaN; return isNaN(v)?0:v; }
  function _clr(ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }

  function _setRow(rid, e){ e=Object.assign({}, e||{}); e._rid=rid;
    if(RID_MAP[rid]){ const i=ROWS.findIndex(r=>r._rid===rid); if(i>=0) ROWS[i]=e; else ROWS.push(e); }
    else ROWS.push(e); RID_MAP[rid]=e; }
  function _removeRow(rid){ if(!RID_MAP[rid]) return false; delete RID_MAP[rid];
    const i=ROWS.findIndex(r=>r._rid===rid); if(i>=0) ROWS.splice(i,1); return true; }

  function _attach(){
    if(_attached) return;
    if(typeof firebase==='undefined' || !firebase.database){ console.warn('[CAV] firebase not loaded'); return; }
    _fbRef = firebase.database().ref(FB_PATH);
    _fbRef.on('child_added',   s=>{ if(_suppressEcho>0) return; const v=s.val(); if(v&&typeof v==='object'){ _setRow(s.key,v); render(); } }, e=>console.warn('[CAV] add',e));
    _fbRef.on('child_changed', s=>{ if(_suppressEcho>0) return; const v=s.val(); if(v&&typeof v==='object'){ _setRow(s.key,v); render(); } }, e=>console.warn('[CAV] chg',e));
    _fbRef.on('child_removed', s=>{ if(_suppressEcho>0) return; _removeRow(s.key); render(); }, e=>console.warn('[CAV] rm',e));
    _attached = true;
    console.log('[CAV] OK · listening to /'+FB_PATH);
  }

  function _pushOne(date, kind, prod, batch, qty, note){
    const rid = _genRid();
    const entry = { _rid:rid, date, kind, prod, batch, qty:qty,
                    note:String(note||'').trim(), _ts:Date.now(),
                    by:(typeof CURRENT_USER!=='undefined' && CURRENT_USER.name) || '?' };
    _setRow(rid, entry);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(entry)
      .catch(e=>console.warn('[CAV] push',e))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:add', rid, kind, date+' '+prod+' '+(batch||'')+' '+qty, '', 'create'); }catch(_){}
    return rid;
  }

  /* Add one or more entries from a card. Pushes one Firebase child per
     non-zero figure (C3/C4, and the 3 OL1 figures). */
  function add(kind){
    const date = _curDate();
    let n = 0;
    if(kind==='vlgc'){
      const c3=_num('cavVlgcC3'), c4=_num('cavVlgcC4'),
            o3=_num('cavVlgcOutC3'), o4=_num('cavVlgcOutC4'),
            note=(document.getElementById('cavVlgcNote')||{}).value;
      if(c3){ _pushOne(date,'vlgc','c3',null,c3,note); n++; }
      if(c4){ _pushOne(date,'vlgc','c4',null,c4,note); n++; }
      if(o3){ _pushOne(date,'vlgcout','c3',null,o3,note); n++; }
      if(o4){ _pushOne(date,'vlgcout','c4',null,o4,note); n++; }
      _clr(['cavVlgcC3','cavVlgcC4','cavVlgcOutC3','cavVlgcOutC4','cavVlgcNote']);
    } else if(kind==='gr'){
      const b=(document.getElementById('cavGrBatch')||{}).value||'D';
      const c3=_num('cavGrC3'), c4=_num('cavGrC4'), note=(document.getElementById('cavGrNote')||{}).value;
      if(c3){ _pushOne(date,'gr','c3',b,c3,note); n++; }
      if(c4){ _pushOne(date,'gr','c4',b,c4,note); n++; }
      _clr(['cavGrC3','cavGrC4','cavGrNote']);
    } else if(kind==='heater'){
      const c3=_num('cavHeaterC3'), c4=_num('cavHeaterC4'), note=(document.getElementById('cavHeaterNote')||{}).value;
      if(c3){ _pushOne(date,'heater','c3','D',c3,note); n++; }
      if(c4){ _pushOne(date,'heater','c4','D',c4,note); n++; }
      _clr(['cavHeaterC3','cavHeaterC4','cavHeaterNote']);
    } else if(kind==='ol1'){
      const tot=_num('cavOl1Tot'), x=_num('cavOl1X'), p=_num('cavOl1P'), note=(document.getElementById('cavOl1Note')||{}).value;
      if(tot){ _pushOne(date,'ol1','c3','PX',tot,note); n++; }
      if(x){   _pushOne(date,'ol1','c3','X', x,  note); n++; }
      if(p){   _pushOne(date,'ol1','c3','P', p,  note); n++; }
      _clr(['cavOl1Tot','cavOl1X','cavOl1P','cavOl1Note']);
    }
    if(!n){ toast('Enter at least one non-zero qty','er'); return; }
    render();
    toast('\u2713 '+KIND_LBL[kind]+' \u00b7 '+n+' entr'+(n>1?'ies':'y')+' added','ok');
  }

  function deleteRow(rid){
    const e=RID_MAP[rid]; if(!e) return;
    if(!confirm('Delete '+KIND_LBL[e.kind]+' '+(e.prod||'').toUpperCase()+' '+(BATCH_LBL[e.batch]||e.batch||'')+' '+e.qty+'kg ('+e.date+')?')) return;
    _removeRow(rid);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(null)
      .catch(er=>console.warn('[CAV] del',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:del', rid, e.kind, e.date, '', 'delete'); }catch(_){}
    render(); toast('\ud83d\uddd1 Deleted','ok');
  }

  /* ---- daily aggregation (RAM) for a given date ---- */
  function _agg(date){
    const A = { vlgc:{c3:0,c4:0}, vlgcout:{c3:0,c4:0}, heater:{c3:0,c4:0},
                gr:{ D:{c3:0,c4:0},E:{c3:0,c4:0},P:{c3:0,c4:0},X:{c3:0,c4:0} },
                ol1:{ PX:0, X:0, P:0 } };
    ROWS.filter(r=>r.date===date).forEach(r=>{
      const q=parseFloat(r.qty)||0;
      if(r.kind==='vlgc')        A.vlgc[r.prod]+=q;
      else if(r.kind==='vlgcout') A.vlgcout[r.prod]+=q;
      else if(r.kind==='heater') A.heater[r.prod]+=q;
      else if(r.kind==='gr' && A.gr[r.batch]) A.gr[r.batch][r.prod]+=q;
      else if(r.kind==='ol1' && A.ol1[r.batch]!=null) A.ol1[r.batch]+=q;
    });
    return A;
  }

  function render(){
    const badge=document.getElementById('engBadgeCavern');
    const tbody=document.getElementById('cavTbody');
    const empty=document.getElementById('cavEmpty');
    const stats=document.getElementById('cavStats');
    if(badge) badge.textContent = ROWS.length;
    try{ _fillPriceInputs(); }catch(_){}
    if(!tbody) return;
    const date=_curDate();
    const day = ROWS.filter(r=>r.date===date).sort((a,b)=>(b._ts||0)-(a._ts||0));
    const A=_agg(date);
    const grTot = ['D','E','P','X'].reduce((s,b)=>s+A.gr[b].c3+A.gr[b].c4,0);
    if(stats) stats.innerHTML='VLGC <b>'+_fmt(A.vlgc.c3+A.vlgc.c4)+'</b> \u00b7 GR <b>'+_fmt(grTot)
      +'</b> \u00b7 Heater <b>'+_fmt(A.heater.c3+A.heater.c4)+'</b> \u00b7 OL1 <b>'+_fmt(A.ol1.PX||A.ol1.X+A.ol1.P)+'</b> kg';
    if(!day.length){ if(empty) empty.style.display=''; tbody.innerHTML=''; return; }
    if(empty) empty.style.display='none';
    tbody.innerHTML = day.map((e,i)=>{
      const t=new Date(e._ts||0); const hh=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
      const rid=String(e._rid||'').replace(/'/g,"\\'");
      const pc = e.prod==='c4' ? 'cav-c4' : 'cav-c3';
      return '<tr>'
        +'<td><button class="cav-del" onclick="CAV.deleteRow(\''+rid+'\')" title="Delete">\u2715</button></td>'
        +'<td style="color:var(--ink-3)">'+(i+1)+'</td>'
        +'<td>'+hh+'</td>'
        +'<td><span class="cav-badge '+(KIND_CLS[e.kind]||'')+'">'+(KIND_LBL[e.kind]||e.kind)+'</span></td>'
        +'<td class="'+pc+'">'+String(e.prod||'').toUpperCase()+'</td>'
        +'<td>'+_esc(BATCH_LBL[e.batch]||e.batch||'\u2014')+'</td>'
        +'<td class="num">'+_fmt(e.qty)+'</td>'
        +'<td>'+_esc(e.note||'')+'</td>'
        +'<td style="color:var(--ink-3)">'+_esc(e.by||'')+'</td>'
        +'</tr>';
    }).join('');
  }

  /* ====== SAP WMS report fill ====== */
  function fileChosen(){
    const inp=document.getElementById('cavFile');
    _file = inp && inp.files && inp.files[0] || null;
    const nm=document.getElementById('cavFileName');
    if(nm) nm.textContent = _file ? _file.name : 'No file chosen';
    if(_file) toast('File selected \u00b7 click Preview','ok');
  }

  /* ============================================================
     SAP-WMS DATA READINESS LAYER  (v4.55.0)
     Pull every source for the selected date, compute each ledger
     column, and flag what is missing / mismatched BEFORE export.
     Sources: CAV manual (_agg) · TL.ROWS · WG.ROWS · WS.ROWS ·
     SP.ROWS · VLOG.ROWS.  Classification (Domestic/Export/Pure) is
     centralised in _dir()/_isPure() so it is easy to confirm/adjust
     — see V4-54_MODULE-MAP.md §4 "CAV data wiring".
     ============================================================ */
  function _n(x){ const v=parseFloat(String(x==null?'':x).replace(/,/g,'')); return isNaN(v)?0:v; }
  function _anyISO(s){
    if(s==null||s==='') return '';
    let t=String(s).trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/,'').trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10);
    let m=t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){ let d=m[1],mo=m[2],y=m[3]; if(y.length===2)y='20'+y; return y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0'); }
    m=t.match(/^(\d{4})(\d{2})(\d{2})$/); if(m) return m[1]+'-'+m[2]+'-'+m[3];
    const num=parseFloat(t);
    if(isFinite(num)&&num>40000&&num<60000){ const dt=new Date((num-25569)*86400000); return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
    return '';
  }
  /* direction code from a free-text field -> 'E' (export) | 'D' (domestic) | '' */
  function _dir(s){
    const t=String(s||'').toUpperCase().trim(); if(!t) return '';
    if(/EX|EXPORT|수출|XK|XUAT/.test(t)) return 'E';
    if(/DOM|DOMESTIC|내수|NOIDIA|\bND\b/.test(t)) return 'D';
    if(t==='E') return 'E'; if(t==='D') return 'D';
    return '';
  }
  function _tlDir(r){ return _dir(r.trade) || _dir(r.dest) || _dir(r.type); }
  function _isPure(r){
    if(/pure|순수|thuan|thuần/i.test(String(r.type||''))) return true;
    const c3=_n(r.c3Kg), c4=_n(r.c4Kg);
    return (c3>0&&c4===0)||(c4>0&&c3===0);
  }
  function _sloc(tank){ const s=String(tank||'').toUpperCase().replace(/\s/g,''); if(s.includes('3501'))return '2100'; if(s.includes('3502'))return '2101'; if(s.includes('1100')||s.includes('CAV'))return '1100'; return ''; }

  /* ---- TL Data by GI date -> tank x direction x material (kg) ---- */
  function _srcTL(date){
    const rows=(typeof TL!=='undefined'&&TL.ROWS)?TL.ROWS:{};
    const o={ n:0, dom:{'2100':{c3:0,c4:0},'2101':{c3:0,c4:0}}, exp:{'2100':{c3:0,c4:0},'2101':{c3:0,c4:0}},
              pure:{c3:0,c4:0}, unc:[], trades:{}, types:{} };
    Object.values(rows).forEach(r=>{
      if(!r||r.disabled) return;
      if(_anyISO(r.giDate)!==date) return;
      o.n++;
      const tr=String(r.trade||'').trim(); if(tr) o.trades[tr]=(o.trades[tr]||0)+1;
      const ty=String(r.type||'').trim(); if(ty) o.types[ty]=(o.types[ty]||0)+1;
      let c3=_n(r.c3Kg), c4=_n(r.c4Kg);
      if(!c3&&!c4){ const q=_n(r.lpgQty); c3=q/2; c4=q/2; }
      const sl=_sloc(r.ltank), dir=_tlDir(r);
      if(_isPure(r) && (sl===''||sl==='1100')){ o.pure.c3+=c3; o.pure.c4+=c4; return; }
      if(sl==='2100'||sl==='2101'){
        if(dir==='D'){ o.dom[sl].c3+=c3; o.dom[sl].c4+=c4; }
        else if(dir==='E'){ o.exp[sl].c3+=c3; o.exp[sl].c4+=c4; }
        else o.unc.push({k:(r.doNo||r.cust||'?'), tank:r.ltank||'', trade:tr, type:ty, c3, c4});
      } else {
        o.unc.push({k:(r.doNo||r.cust||'?'), tank:r.ltank||'(none)', trade:tr, type:ty, c3, c4});
      }
    });
    return o;
  }
  /* ---- WMS GI by arrival/GI date -> direction (shipToId code) — cross-check ---- */
  function _srcWG(date){
    const rows=(typeof WG!=='undefined'&&WG.ROWS)?WG.ROWS:{};
    const o={ n:0, dom:{c3:0,c4:0}, exp:{c3:0,c4:0}, pick:0, codes:{}, unc:0 };
    Object.values(rows).forEach(w=>{
      if(!w) return;
      const iso=_anyISO(w.arrival||w._wmsDate||w.transDate||'');
      if(iso!==date) return;
      o.n++;
      const c3=_n(w.propane), c4=_n(w.butane); o.pick+=_n(w.pickKg);
      const code=String(w.shipToId||'').trim(); if(code) o.codes[code]=(o.codes[code]||0)+1;
      const dir=_dir(code)||_dir(w.txType);
      if(dir==='D'){ o.dom.c3+=c3; o.dom.c4+=c4; }
      else if(dir==='E'){ o.exp.c3+=c3; o.exp.c4+=c4; }
      else o.unc++;
    });
    return o;
  }
  /* ---- WMS ST by date -> NET transfer into each tank (from-cavern minus back) ---- */
  function _srcWS(date){
    const rows=(typeof WS!=='undefined'&&WS.ROWS)?WS.ROWS:{};
    const net={'2100':{c3:0,c4:0},'2101':{c3:0,c4:0}}; let n=0;
    Object.values(rows).forEach(r=>{
      if(!r) return;
      if((_anyISO(r.transDate)||_anyISO(r.erpDate))!==date) return;
      const mat=r.matLabel; if(mat!=='C3'&&mat!=='C4') return;
      const kg=_n(r.kg); if(!kg) return;
      const k=mat==='C3'?'c3':'c4';
      const from=String(r.fromLoc||'').trim(), to=String(r.toLoc||'').trim();
      if(from==='1100'&&(to==='2100'||to==='2101')){ net[to][k]+=kg; n++; }
      else if((from==='2100'||from==='2101')&&to==='1100'){ net[from][k]-=kg; n++; }
    });
    return { net, n };
  }
  /* ---- SAP ZMMFR022 by date -> end/gr/gi/init keyed sloc|batch|mat (kg) ---- */
  function _srcSAP(date){
    const rows=(typeof SP!=='undefined'&&SP.ROWS)?SP.ROWS:{};
    const end={},gr={},gi={},init={}; const slocs={}; let n=0; const b100={c3:0,c4:0};
    const key=(sl,b,m)=>sl+'|'+b+'|'+m;
    Object.values(rows).forEach(r=>{
      if(!r||r.date!==date) return; n++;
      const sl=String(r.sloc||''), b=String(r.batch||''), m=String(r.mat||''); slocs[sl]=1;
      end [key(sl,b,m)]=(end [key(sl,b,m)]||0)+_n(r.end);
      gr  [key(sl,b,m)]=(gr  [key(sl,b,m)]||0)+_n(r.gr);
      gi  [key(sl,b,m)]=(gi  [key(sl,b,m)]||0)+_n(r.gi);
      init[key(sl,b,m)]=(init[key(sl,b,m)]||0)+_n(r.init);
      if(sl==='B100'){ if(m==='C3')b100.c3+=Math.abs(_n(r.gi)); else if(m==='C4')b100.c4+=Math.abs(_n(r.gi)); }
    });
    function E(sl,b,m){ return end[key(sl,b,m)]||0; }
    function GR(sl,b,m){ return gr[key(sl,b,m)]||0; }
    return { n, end, gr, gi, init, b100, slocs, E, GR };
  }
  /* ---- Vessel Log by date -> export/domestic qty & C3 (user-typed type) ---- */
  function _srcVLOG(date){
    const rows=(typeof VLOG!=='undefined'&&VLOG.ROWS)?VLOG.ROWS:{};
    const o={ n:0, exp:{qty:0,c3:0,c4:0}, dom:{qty:0,c3:0,c4:0}, rows:[] };
    Object.values(rows).forEach(e=>{
      if(!e) return;
      if(_anyISO(e.date)!==date) return;
      o.n++;
      const dir=_dir(e.type);
      const qty=_n(e.qty!=null?e.qty:e.cTotal);
      const c3=_n(e.c3!=null?e.c3:(e.cC3!=null?e.cC3:0));
      const c4=_n(e.c4!=null?e.c4:(e.cC4!=null?e.cC4:0));
      const t=dir==='E'?o.exp:o.dom; t.qty+=qty; t.c3+=c3; t.c4+=c4;
      o.rows.push({ship:e.ship||'', type:e.type||'', dir, qty, c3});
    });
    return o;
  }

  /* ====== SAP PRICES ($/ton) — one record per date, prev-day fallback ======
     User input (see fill-map comments). If a price is blank for the day, the
     most-recent prior day's value is used. Stored at Firebase /cavern_price. */
  const FB_PRICE = 'cavern_price';
  const PRICE_KEYS = ['pP','pXP','pD1','pD21','pD22','pE1'];
  const PRICE_IN = { pP:'cavPriceP', pXP:'cavPriceXP', pD1:'cavPriceD1', pD21:'cavPriceD21', pD22:'cavPriceD22', pE1:'cavPriceE1' };
  let PRICES = Object.create(null), _priceRef = null;
  function _attachPrice(){
    if(_priceRef || typeof firebase==='undefined' || !firebase.database) return;
    _priceRef = firebase.database().ref(FB_PRICE);
    _priceRef.on('value', s=>{ const v=s.val(); PRICES = (v&&typeof v==='object')?v:Object.create(null); _fillPriceInputs(); },
                 e=>console.warn('[CAV] price',e));
  }
  /* value for (date,key): explicit record for the date, else most-recent prior date */
  function _priceFor(date, key){
    const rec=PRICES[date];
    if(rec && rec[key]!=null && rec[key]!=='') return { val:_n(rec[key]), prev:false, src:date };
    let best=null;
    Object.keys(PRICES).forEach(d=>{ if(d<date){ const r=PRICES[d]; if(r && r[key]!=null && r[key]!=='' && (best===null||d>best)) best=d; } });
    if(best!==null) return { val:_n(PRICES[best][key]), prev:true, src:best };
    return { val:null, prev:false, src:null };
  }
  function _fillPriceInputs(){
    const date=_curDate(); const rec=PRICES[date]||{};
    PRICE_KEYS.forEach(k=>{ const el=document.getElementById(PRICE_IN[k]); if(!el) return;
      el.value = (rec[k]!=null && rec[k]!=='') ? rec[k] : '';
      const f=_priceFor(date,k);
      el.placeholder = (f.val!=null && f.prev) ? ('↩ '+f.val+' ('+f.src+')') : (f.val!=null ? String(f.val) : '$/t');
    });
    const hint=document.getElementById('cavPriceHint');
    if(hint){ const has=PRICES[date]&&PRICE_KEYS.some(k=>PRICES[date][k]!=null&&PRICES[date][k]!=='');
      hint.textContent = has ? ('Đã lưu giá cho '+date) : 'Chưa nhập giá ngày '+date+' — ô trống lấy giá ngày gần nhất trước đó'; }
  }
  function savePrices(){
    const date=_curDate();
    const rec={ _ts:Date.now(), by:(typeof CURRENT_USER!=='undefined'&&CURRENT_USER.name)||'?' };
    let any=false;
    PRICE_KEYS.forEach(k=>{ const el=document.getElementById(PRICE_IN[k]); const v=el?String(el.value).trim():''; if(v!==''){ rec[k]=_n(v); any=true; } });
    if(!any){ toast('Nhập ít nhất 1 giá','er'); return; }
    PRICES[date]=Object.assign({}, PRICES[date], rec);
    if(_priceRef){ _priceRef.child(date).update(rec).catch(e=>console.warn('[CAV] price save',e)); }
    try{ logAudit('cav:price', date, 'price', JSON.stringify(rec), '', 'update'); }catch(_){}
    toast('💾 Đã lưu giá '+date,'ok'); preview();
  }

  /* Build every Propane (C3) fill row with REAL values + status.
     status: man|app|sap (filled, value present) · wait (manual not yet
     entered, legitimately may be 0) · miss (source has no data for the day)
     · warn (cross-check mismatch). Values in TON. */
  function _fill(date){
    const A=_agg(date), tl=_srcTL(date), wg=_srcWG(date), ws=_srcWS(date),
          sp=_srcSAP(date), vl=_srcVLOG(date);
    const T=_ton;
    const sapHas = !!(sp.slocs['1100']||sp.slocs['2100']||sp.slocs['2101']);
    const tlMiss = tl.n===0;
    function manRow(col,label,kg,xnote){ return {col,label,group:'MANUAL',src:'man',ton:T(kg),status:(kg>0?'man':'wait'),note:xnote||''}; }
    function appRow(col,label,kg,note,missCond){ return {col,label,group:'APP',src:'app',ton:T(kg),status:(missCond?'miss':(kg>0?'app':'wait')),note:note||''}; }
    function sapRow(col,label,kg,note){ return {col,label,group:'SAP',src:'sap',ton:(sapHas?T(kg):null),status:(sapHas?'sap':'miss'),note:note||''}; }
    const g=A.gr, o=A.ol1;
    const rows=[
      manRow(9,  'VLGC Get-in (보세창고 입고)', A.vlgc.c3),
      manRow(10, 'VLGC Get-out (출고)',          A.vlgcout.c3, 'user input'),
      manRow(13, 'Bonded Get-out P (통관)',     g.P.c3, 'GR · so khớp SAP'),
      manRow(14, 'Bonded Get-out EX-P/X',        g.X.c3, 'GR · so khớp SAP'),
      manRow(15, 'Bonded Get-out D',             g.D.c3, 'GR · so khớp SAP'),
      manRow(16, 'Bonded Get-out E',             g.E.c3, 'GR · so khớp SAP'),
      manRow(34, 'OL1 DH 이체 PETCHEM (P)',      o.P),
      manRow(37, 'OL1 DH 이체 EX-PETCHEM (X)',   o.X),
      manRow(40, 'OL1 total (X+P)',              (o.PX||o.X+o.P)),
      manRow(44, 'Domestic Heater (B100 GI)',    A.heater.c3, 'so khớp SAP B100 GI'),
      appRow(43, 'Domestic Pure C3 (1100 GI)',   tl.pure.c3, 'TL Data · LPG type = pure', tlMiss),
      appRow(48, 'Domestic 2100 (TK-3501)',      tl.dom['2100'].c3, 'TL net · xe Domestic từ TK-3501', tlMiss),
      appRow(49, 'Domestic 2101 (TK-3502)',      tl.dom['2101'].c3, 'TL net · xe Domestic từ TK-3502', tlMiss),
      appRow(52, 'Export 1100 Cavern (vessel)',  vl.exp.c3, 'Vessel Log · type Export', false),
      appRow(54, 'Export 2100 (TK-3501)',        tl.exp['2100'].c3, 'TL net · xe Export từ TK-3501', tlMiss),
      appRow(55, 'Export 2101 (TK-3502)',        tl.exp['2101'].c3, 'TL net · xe Export từ TK-3502', tlMiss),
      sapRow(58, 'SAP End Batch Stock PETCHEM',      sp.E('1100','P','C3'), 'ZMMFR022 · 1100|P'),
      sapRow(60, 'SAP End Batch Stock EX-PETCHEM',   sp.E('1100','X','C3'), 'ZMMFR022 · 1100|X'),
      sapRow(62, 'SAP End Batch Stock Domestic 1100',sp.E('1100','D','C3'), 'ZMMFR022 · 1100|D'),
      sapRow(64, 'SAP End Batch Stock Domestic 2100',sp.E('2100','D','C3'), 'ZMMFR022 · 2100|D'),
      sapRow(66, 'SAP End Batch Stock Domestic 2101',sp.E('2101','D','C3'), 'ZMMFR022 · 2101|D'),
      sapRow(69, 'SAP End Batch Stock Export 1100',  sp.E('1100','E','C3'), 'ZMMFR022 · 1100|E'),
      sapRow(73, 'SAP Stock Export 2100',            sp.E('2100','E','C3'), 'ZMMFR022 · 2100|E'),
      sapRow(74, 'SAP Stock Export 2101',            sp.E('2101','E','C3'), 'ZMMFR022 · 2101|E')
    ];
    const vrow=rows.find(r=>r.col===52);
    if(vl.exp.qty>0 && vl.exp.c3===0){ vrow.status='warn'; vrow.note='Vessel có qty='+vl.exp.qty.toLocaleString()+' nhưng thiếu tách C3 — kiểm tra Vessel data'; }
    if(vl.n===0){ vrow.note='Không có chuyến vessel ngày này (Export 1100 = 0)'; }

    /* ---------- cross-checks ---------- */
    const checks=[]; const tol=0.001;
    if(sp.slocs['B100']){
      const man=T(A.heater.c3), sap=T(sp.b100.c3), d=Math.abs(man-sap);
      checks.push({ ok:d<=tol, label:'Heater C3 (manual) ↔ SAP B100 GI',
        detail:'manual='+man.toFixed(3)+'t · SAP='+sap.toFixed(3)+'t · Δ='+(man-sap).toFixed(3)+'t'});
    } else if(A.heater.c3>0){
      checks.push({ ok:null, label:'Heater C3 ↔ SAP B100 GI', detail:'SAP chưa có dòng B100 cho ngày này (không đối chiếu được)'});
    }
    if(sapHas){
      [['P',g.P.c3],['X',g.X.c3],['D',g.D.c3],['E',g.E.c3]].forEach(pair=>{
        const b=pair[0], man=T(pair[1]), sap=T(Math.abs(sp.GR('1100',b,'C3')));
        if(man>0||sap>0){ const d=Math.abs(man-sap);
          checks.push({ ok:d<=tol, label:'GR '+b+' C3 (manual) ↔ SAP GR 1100|'+b,
            detail:'manual='+man.toFixed(3)+'t · SAP='+sap.toFixed(3)+'t · Δ='+(man-sap).toFixed(3)+'t'}); }
      });
    }
    if(wg.n>0 && tl.n>0){
      const tlDom=tl.dom['2100'].c3+tl.dom['2101'].c3, tlExp=tl.exp['2100'].c3+tl.exp['2101'].c3;
      const dD=Math.abs(T(wg.dom.c3)-T(tlDom)), dE=Math.abs(T(wg.exp.c3)-T(tlExp));
      checks.push({ ok:dD<=tol, label:'Domestic C3: WMS GI ↔ TL net',
        detail:'WMS GI='+T(wg.dom.c3).toFixed(3)+'t · TL='+T(tlDom).toFixed(3)+'t · Δ='+(T(wg.dom.c3)-T(tlDom)).toFixed(3)+'t'});
      checks.push({ ok:dE<=tol, label:'Export C3: WMS GI ↔ TL net',
        detail:'WMS GI='+T(wg.exp.c3).toFixed(3)+'t · TL='+T(tlExp).toFixed(3)+'t · Δ='+(T(wg.exp.c3)-T(tlExp)).toFixed(3)+'t'});
    }
    const prices=[
      {col:59, label:'Price PETCHEM (1100)',  f:_priceFor(date,'pP')},
      {col:61, label:'Price EX-PETCHEM (1100)',f:_priceFor(date,'pXP')},
      {col:63, label:'Price Domestic 1100',    f:_priceFor(date,'pD1')},
      {col:65, label:'Price Domestic 2100',    f:_priceFor(date,'pD21')},
      {col:67, label:'Price Domestic 2101',    f:_priceFor(date,'pD22')},
      {col:70, label:'Price Export 1100',      f:_priceFor(date,'pE1')}
    ];
    return { rows, checks, prices, tl, wg, ws, sp, vl, sapHas, tlMiss };
  }

  /* ---- edit / delete a manual entry straight from the Preview table ---- */
  function delEntry(rid){ const had=!!RID_MAP[rid]; deleteRow(rid); if(had && !RID_MAP[rid]) preview(); }
  function editEntry(rid){ _editRid=rid; preview(); setTimeout(()=>{ const el=document.getElementById('cavEditInp'); if(el){ el.focus(); el.select(); } },30); }
  function cancelEdit(){ _editRid=null; preview(); }
  function saveEntry(rid){
    const e=RID_MAP[rid]; if(!e){ _editRid=null; return preview(); }
    const el=document.getElementById('cavEditInp');
    const v=el?parseFloat(String(el.value).replace(/,/g,'')):NaN;
    if(isNaN(v)||v<0){ toast('Giá trị không hợp lệ','er'); return; }
    e.qty=v; e._ts=Date.now(); _setRow(rid,e);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).update({ qty:v, _ts:e._ts })
      .catch(er=>console.warn('[CAV] edit',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:edit', rid, e.kind, e.date+' qty='+v, '', 'update'); }catch(_){}
    _editRid=null; render(); preview(); toast('✔ Đã cập nhật','ok');
  }

  function preview(){
    const date=_curDate();
    const box=document.getElementById('cavPreview'); if(!box) return;
    const F=_fill(date);
    const stCls={man:'#0a7d33',app:'#0a7d33',sap:'#0a7d33',wait:'#6b8299',miss:'#d62839',warn:'#b45309'};
    const stLbl={man:'✔ đã điền',app:'✔ đã điền',sap:'✔ đã điền',wait:'… chờ nhập',miss:'⛔ thiếu',warn:'⚠ lệch'};
    const srcCls={man:'cav-src-man',app:'cav-src-app',sap:'cav-src-sap'};
    const srcLbl={man:'MANUAL',app:'APP (TL/WMS/Vessel)',sap:'SAP import'};

    const man0=_agg(date);
    const aggSum=(man0.ol1.PX||man0.ol1.X+man0.ol1.P)+man0.heater.c3+man0.heater.c4
      +['D','E','P','X'].reduce((s,b)=>s+man0.gr[b].c3+man0.gr[b].c4,0)+man0.vlgc.c3+man0.vlgc.c4;
    const missing=[];
    if(!F.sapHas) missing.push('SAP (ZMMFR022) chưa có dữ liệu ngày này → các cột End Batch Stock 58–74 trống');
    if(F.tlMiss)  missing.push('TL Data chưa có dòng GI ngày này → Domestic/Export 43/48/49/54/55 trống');
    if(aggSum===0) missing.push('Chưa nhập MANUAL (OL1 / GR / Heater / VLGC) cho ngày này');
    if(F.tl.unc.length) missing.push(F.tl.unc.length+' dòng TL chưa phân loại được Domestic/Export (xem "Phân loại" bên dưới)');
    const warnChecks=F.checks.filter(c=>c.ok===false).length;
    if(warnChecks) missing.push(warnChecks+' đối chiếu chéo bị LỆCH (xem "Đối chiếu" bên dưới)');
    const priceMiss=(F.prices||[]).filter(p=>p.f.val==null).length;
    if(priceMiss) missing.push(priceMiss+' cột giá ($/ton) chưa có (nhập ở thẻ SAP PRICES hoặc cần giá ngày trước)');
    const ready=missing.length===0;

    let html='';
    html+='<div style="padding:10px 12px;border-radius:8px;margin-bottom:10px;font-weight:600;'
      +(ready?'background:#e7f6ec;color:#0a7d33;border:1px solid #0a7d33"'
             :'background:#fdecea;color:#b1271b;border:1px solid #d62839"')+'>'
      +(ready?'✅ ĐỦ DỮ LIỆU để xuất báo cáo ngày <b>'+date+'</b>'
             :'⛔ CHƯA SẴN SÀNG — ngày <b>'+date+'</b> còn '+missing.length+' vấn đề')+'</div>';
    if(!ready){
      html+='<ul style="margin:0 0 10px;padding-left:18px;font-size:12px;color:var(--ink-2)">'
        +missing.map(m=>'<li style="margin:2px 0">'+_esc(m)+'</li>').join('')+'</ul>';
    }

    function chip(ok,txt){ return '<span style="display:inline-block;margin:2px 5px 2px 0;padding:2px 8px;border-radius:10px;font-size:11px;'
      +(ok?'background:#e7f6ec;color:#0a7d33':'background:#f1f3f6;color:#8a97a6')+'">'+(ok?'●':'○')+' '+txt+'</span>'; }
    html+='<div style="margin-bottom:10px">'
      + chip(F.tl.n>0, 'TL Data '+F.tl.n+' dòng')
      + chip(F.wg.n>0, 'WMS GI '+F.wg.n)
      + chip(F.ws.n>0, 'WMS ST '+F.ws.n)
      + chip(F.sapHas, 'SAP '+(Object.keys(F.sp.slocs).filter(Boolean).join('/')||'—'))
      + chip(F.vl.n>0, 'Vessel '+F.vl.n)
      +'</div>';

    /* ---- editable MANUAL entries for the day — fix wrong inputs right here ---- */
    const _day=ROWS.filter(r=>r.date===date).sort((a,b)=>(b._ts||0)-(a._ts||0));
    html+='<div style="margin:4px 0 6px;font-weight:600;font-size:12px">📝 Dữ liệu nhập tay ngày <b>'+date+'</b> — sửa/xóa tại đây '
      +'<span style="font-weight:400;color:var(--ink-3)">('+_day.length+' dòng · kg)</span></div>';
    if(!_day.length){
      html+='<div style="font-size:11px;color:var(--ink-3);margin-bottom:8px">Chưa có dữ liệu nhập tay cho ngày này.</div>';
    } else {
      html+='<table class="cav-tbl"><thead><tr><th>Loại</th><th>Prod</th><th>Batch</th><th>Qty (kg)</th><th>Note</th><th>Sửa</th></tr></thead><tbody>';
      _day.forEach(e=>{
        const rid=String(e._rid||'').replace(/'/g,"\\'");
        const editing=(_editRid===e._rid);
        const qtyCell=editing
          ? '<input id="cavEditInp" type="number" step="any" value="'+_esc(e.qty)+'" style="width:92px;padding:2px 4px;text-align:right" '
            +'onkeydown="if(event.key===\'Enter\')CAV.saveEntry(\''+rid+'\');if(event.key===\'Escape\')CAV.cancelEdit()">'
          : '<span class="num">'+_fmt(e.qty)+'</span>';
        const actions=editing
          ? '<button class="cav-add" style="padding:1px 7px;background:#0a7d33" onclick="CAV.saveEntry(\''+rid+'\')">✔ Lưu</button> '
            +'<button class="cav-add" style="padding:1px 7px;background:#6b8299" onclick="CAV.cancelEdit()">✕</button>'
          : '<button class="cav-add" style="padding:1px 7px" onclick="CAV.editEntry(\''+rid+'\')" title="Sửa">✎</button> '
            +'<button class="cav-del" onclick="CAV.delEntry(\''+rid+'\')" title="Xóa">✕</button>';
        html+='<tr'+(editing?' style="background:#fff8ea"':'')+'>'
          +'<td><span class="cav-badge '+(KIND_CLS[e.kind]||'')+'">'+_esc(KIND_LBL[e.kind]||e.kind)+'</span></td>'
          +'<td class="'+(e.prod==='c4'?'cav-c4':'cav-c3')+'">'+_esc(String(e.prod||'').toUpperCase())+'</td>'
          +'<td>'+_esc(BATCH_LBL[e.batch]||e.batch||'—')+'</td>'
          +'<td class="num">'+qtyCell+'</td>'
          +'<td style="color:var(--ink-3);font-size:11px">'+_esc(e.note||'')+'</td>'
          +'<td style="white-space:nowrap">'+actions+'</td></tr>';
      });
      html+='</tbody></table>';
    }

    html+='<div style="font-size:12px;color:var(--ink-3);margin:10px 0 4px">Sheet <b>Propane (C3)</b> · chỉ các cột dưới được GHI (cột công thức/derived giữ nguyên) · đơn vị <b>ton</b>:</div>';
    html+='<table class="cav-tbl"><thead><tr><th>Col</th><th>Cột báo cáo</th><th>Nguồn</th><th>Giá trị (ton)</th><th>Trạng thái</th><th>Ghi chú / cách lấy</th></tr></thead><tbody>';
    F.rows.forEach(m=>{
      const val=m.ton==null?'<span style="color:#d62839">—</span>':m.ton.toFixed(3);
      html+='<tr><td style="font-family:monospace">'+m.col+'</td><td>'+_esc(m.label)+'</td>'
        +'<td class="'+(srcCls[m.src]||'')+'">'+(srcLbl[m.src]||m.src)+'</td>'
        +'<td class="num">'+val+'</td>'
        +'<td style="color:'+(stCls[m.status]||'#6b8299')+';font-weight:600;font-size:11px">'+(stLbl[m.status]||m.status)+'</td>'
        +'<td style="color:var(--ink-3);font-size:11px">'+_esc(m.note||'')+'</td></tr>';
    });
    html+='</tbody></table>';

    if(F.checks.length){
      html+='<div style="margin-top:12px;font-weight:600;font-size:12px">🔎 Đối chiếu chéo</div>';
      html+='<table class="cav-tbl"><tbody>';
      F.checks.forEach(c=>{
        const mk=c.ok===true?'<span style="color:#0a7d33">✔ khớp</span>'
          :c.ok===false?'<span style="color:#d62839">✘ lệch</span>'
          :'<span style="color:#b45309">… n/a</span>';
        html+='<tr><td style="width:60px">'+mk+'</td><td>'+_esc(c.label)+'</td><td style="color:var(--ink-3);font-size:11px">'+_esc(c.detail)+'</td></tr>';
      });
      html+='</tbody></table>';
    }

    if(F.prices && F.prices.length){
      html+='<div style="margin-top:12px;font-weight:600;font-size:12px">💲 Giá ($/ton) <span style="font-weight:400;color:var(--ink-3)">— nhập ở thẻ SAP PRICES; trống = lấy ngày trước</span></div>';
      html+='<table class="cav-tbl"><thead><tr><th>Col</th><th>Khoản</th><th>Giá ($/t)</th><th>Nguồn</th></tr></thead><tbody>';
      F.prices.forEach(p=>{
        const v=p.f.val==null?'<span style="color:#d62839">— thiếu</span>':p.f.val.toLocaleString('en-US');
        const col=p.f.val==null?'#d62839':(p.f.prev?'#b45309':'#0a7d33');
        const src=p.f.val==null?'chưa có giá nào trước đó':(p.f.prev?('↩ giá ngày '+p.f.src):'nhập tay hôm nay');
        html+='<tr><td style="font-family:monospace">'+p.col+'</td><td>'+_esc(p.label)+'</td>'
          +'<td class="num" style="color:'+col+'">'+v+'</td>'
          +'<td style="font-size:11px;color:'+col+'">'+_esc(src)+'</td></tr>';
      });
      html+='</tbody></table>';
    }

    const tdv=Object.entries(F.tl.trades).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    const tyv=Object.entries(F.tl.types).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    const wcv=Object.entries(F.wg.codes).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    html+='<div style="margin-top:12px;font-weight:600;font-size:12px">🏷️ Phân loại (kiểm tra mapping Domestic/Export)</div>';
    html+='<div style="font-size:11px;color:var(--ink-2);line-height:1.6">'
      +'TL · Trade: '+tdv+'<br>TL · LPG Type: '+tyv+'<br>WMS GI · InternalCode: '+wcv;
    if(F.tl.unc.length){
      html+='<div style="margin-top:6px;color:#b1271b">⚠ '+F.tl.unc.length+' dòng TL chưa rõ Domestic/Export hoặc thiếu Tank:</div>';
      html+='<ul style="margin:2px 0;padding-left:18px">'+F.tl.unc.slice(0,12).map(u=>
        '<li>'+_esc(u.k)+' · tank='+_esc(u.tank)+' · trade='+_esc(u.trade||'—')+' · type='+_esc(u.type||'—')+' · C3='+u.c3.toLocaleString()+'kg</li>').join('')
        +(F.tl.unc.length>12?'<li>… và '+(F.tl.unc.length-12)+' dòng nữa</li>':'')+'</ul>';
    }
    html+='</div>';
    html+='<div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Butane (C4): bảng phân loại đã sẵn sàng; phần điền cột C4 bật ở bước sau. Cột giá ($/ton) lấy từ user input, nếu trống dùng giá ngày trước.</div>';

    box.innerHTML=html;
    if(!_file) toast(ready?'Đã đủ dữ liệu · chọn file để xuất':'Xem trạng thái dữ liệu bên dưới','');
    else toast(ready?'Đã đủ dữ liệu · sẵn sàng xuất':'Còn thiếu dữ liệu — xem chi tiết','');
    return F;
  }

  /* Export the filled .xlsx. Cell-write (JSZip) writes ONLY value columns
     and pre-creates IF-guarded formulas on future rows (auto-hide until the
     day's inputs exist) — see MODULE-MAP §4. Gated on the readiness verdict. */
  function exportReport(){
    if(!_file){ toast('Chọn file WMS SAP .xlsx trước','er'); return; }
    const F=preview();
    const bad=F.rows.some(r=>r.status==='miss') || F.checks.some(c=>c.ok===false) || F.tl.unc.length>0;
    if(bad){ toast('Chưa xuất: dữ liệu còn thiếu/lệch — xem bảng Preview','er'); return; }
    toast('Đã đủ dữ liệu. Ghi cell .xlsx (JSZip) là bước kế tiếp.','');
  }

  function _dateRange(a,b){
    const out=[]; let d=new Date(a+'T00:00:00'); const e=new Date(b+'T00:00:00');
    if(isNaN(d)||isNaN(e)||d>e) return out;
    let g=0; while(d<=e && g<400){ out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); d.setDate(d.getDate()+1); g++; }
    return out;
  }

  /* On-screen render of the SAP-WMS ledger — EXACT layout of the Cavern
     Excel file (4-tier grouped header + every column). MANUAL columns show
     live ton values; APP/SAP/formula columns are blank until wired.
     (group / filter / sort to be added later.) */
  function _hdrHTML(spec){
    return '<thead>'+spec.hdr.map(row=>'<tr>'+row.map(c=>
      '<th colspan="'+c.c+'" rowspan="'+c.r+'">'+_esc(c.t)+'</th>').join('')+'</tr>').join('')+'</thead>';
  }
  function viewTable(mode){
    const prod=(document.getElementById('cavLedProd')||{}).value||'c3';
    let from,to;
    if(mode==='month'){
      const m=(document.getElementById('cavMonth')||{}).value; if(!m){ toast('Pick a month','er'); return; }
      const y=+m.split('-')[0], mo=+m.split('-')[1];
      from=m+'-01'; to=m+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0');
    } else {
      from=(document.getElementById('cavFrom')||{}).value; to=(document.getElementById('cavTo')||{}).value;
      if(!from||!to){ toast('Pick From and To','er'); return; }
    }
    const days=_dateRange(from,to);
    const box=document.getElementById('cavLedger'); if(!box) return;
    if(!days.length){ box.innerHTML='<div class="cav-empty">Invalid range.</div>'; return; }
    const spec=CAV_LEDGER[prod]; if(!spec){ box.innerHTML='<div class="cav-empty">No layout for '+prod+'.</div>'; return; }
    const N=spec.ncol, isC3=(prod==='c3');
    const tot=new Array(N+1).fill(0); let tot_n=0;
    let body='<tbody>';
    days.forEach(dt=>{
      const A=_agg(dt);
      const nday=ROWS.filter(r=>r.date===dt&&r.prod===prod).length; tot_n+=nday;
      let tr='<tr'+(nday?'':' style="opacity:.45"')+'><td class="cav-led-date">'+dt+'</td>';
      for(let col=2; col<=N; col++){
        const ton=isC3?_manTon(prod,col,A):null;
        if(ton!=null && ton!==0){ tot[col]+=ton; tr+='<td class="num">'+ton.toFixed(3)+'</td>'; }
        else tr+='<td></td>';
      }
      body+=tr+'</tr>';
    });
    body+='</tbody>';
    let foot='<tfoot><tr class="cav-led-tot"><td>TOTAL</td>';
    for(let col=2; col<=N; col++){ foot+= tot[col] ? '<td class="num">'+tot[col].toFixed(3)+'</td>' : '<td></td>'; }
    foot+='</tr></tfoot>';
    box.innerHTML='<div style="overflow:auto;max-height:60vh"><table class="cav-led">'+_hdrHTML(spec)+body+foot+'</table></div>'
      +'<div style="font-size:11px;color:var(--ink-3);margin-top:6px">'+prod.toUpperCase()+' \u00b7 '+from+' \u2192 '+to+' \u00b7 '
      +days.length+' days \u00b7 ton \u00b7 layout identical to the WMS SAP file \u00b7 MANUAL columns filled (APP/SAP/formula columns join after wiring).</div>';
  }

  function init(){
    const dt=document.getElementById('cavDate'); if(dt && !dt.value) dt.value=_today();
    const mo=document.getElementById('cavMonth'); if(mo && !mo.value) mo.value=_today().slice(0,7);
    _attach(); _attachPrice(); render(); try{ _fillPriceInputs(); }catch(_){}
  }

  return { init, render, add, deleteRow, delEntry, editEntry, cancelEdit, saveEntry, savePrices, fileChosen, preview, exportReport, viewTable, get ROWS(){ return ROWS; } };
})();
window.CAV = CAV;


/* Engineer sub-tab switcher */
function engSwitchTab(sub){
  document.querySelectorAll('#page-engineer .stab').forEach(b=>{
    b.classList.toggle('on', b.dataset.engSub === sub);
  });
  document.querySelectorAll('#page-engineer .eng-pg').forEach(p=>{
    p.classList.toggle('on', p.id === 'eng-pg-'+sub);
  });
  if(sub === 'tkmix') ENG.render();
  else if(sub === 'mixcal'){ try{ MC.refresh(); }catch(_){} }
  else if(sub === 'shipcal'){ try{ VMIX.refresh(); }catch(_){} }
  else if(sub === 'shiplog'){ try{ VLOG.render(); }catch(_){} }
}

/* Paste-anywhere shortcut: when Engineer/Tank Log is active and user pastes,
   auto-route into ENG.pasteText (matches V406 paste-from-anywhere UX) */
document.addEventListener('paste', e=>{
  /* Only when Engineer page is active AND Tank Log sub-pane is on AND no input is focused */
  const engPg = document.getElementById('page-engineer');
  if(!engPg || !engPg.classList.contains('on')) return;
  const tkPg = document.getElementById('eng-pg-tkmix');
  if(!tkPg || !tkPg.classList.contains('on')) return;
  const ae = document.activeElement;
  if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if(!text.trim()) return;
  e.preventDefault();
  ENG.pasteText(text);
});


/* ============================================================
   MODULE INIT — DEFERRED TO STAGED SCHEDULER AT END OF FILE
   ────────────────────────────────────────────────────────────
   Original synchronous block (SC/TP/TMR/WG/WS/TL/SP/CT/PP/SCALE/
   ENG/MC + buildFleetSubs + switchFleetTab + navGo) used to run
   here and froze the UI 5–7s on cold start. It has been moved
   to a staged scheduler at the bottom of this file (see
   `bootApp` IIFE) which spreads work across phases so the UI
   paints immediately.
   ============================================================ */


/* ============================================================
   MODULE STAFF — Name · Role · Phone · Email (CRUD, FB-synced)
   FB path: /staff/{rid} = {name, role, phone, email}
   Role is a plain text field — operators or admins set it via
   Firebase directly OR by typing in this page.
   ============================================================ */
