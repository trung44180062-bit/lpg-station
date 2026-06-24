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
  /* manual-filled columns of each sheet (1-based Excel col → code).
     codes resolve against _agg(): v=VLGC, gP/gX/gD/gE=GR by batch,
     oP/oX/oT=OL1 P/X/total, h=Heater.
     Propane (C3, 83 cols) keeps the full set; Butane (C4, 58 cols) has only
     Domestic/Export batches → no PETCHEM/EX-PETCHEM, no OL1, no Heater.
     C4 manual cols: 8 VLGC Get-in · 12 GR D · 13 GR E (1-based Excel col). */
  const FILL_C3 = {10:'v',14:'gP',15:'gX',16:'gD',17:'gE',35:'oP',37:'oP',38:'oX',40:'oX',41:'oT',45:'h'};
  const FILL_C4 = {8:'v',12:'gD',13:'gE'};
  function _manTon(prod,col,A){
    const map = prod==='c4' ? FILL_C4 : FILL_C3;
    const code=map[col]; if(!code) return null;
    const m={v:A.vlgc[prod],gP:A.gr.P[prod],gX:A.gr.X[prod],gD:A.gr.D[prod],gE:A.gr.E[prod],
             oP:A.ol1.P,oX:A.ol1.X,oT:(A.ol1.PX||A.ol1.X+A.ol1.P),h:A.heater[prod]};
    return _ton(m[code]||0);
  }

  let ROWS = [];
  let RID_MAP = Object.create(null);
  let _fbRef = null, _suppressEcho = 0, _attached = false;
  let _file = null;   /* chosen WMS SAP .xlsx File */
  let _editRid = null; /* rid of the manual entry being edited inline in Preview */
  let _pvProd = 'c3';  /* active product tab in the Preview pane (c3|c4) */

  function _genRid(){ return Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4); }
  function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _today(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _yesterday(){ const d=new Date(); d.setDate(d.getDate()-1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function _curDate(){ const el=document.getElementById('cavDate'); return (el&&el.value)||_yesterday(); }
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
    if(!n){ toast('Enter at least one non-zero qty','er'); return 0; }
    render();
    toast('\u2713 '+KIND_LBL[kind]+' \u00b7 '+n+' entr'+(n>1?'ies':'y')+' added','ok');
    return n;
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
    const date=_curDate();
    const A=_agg(date);
    const grTot = ['D','E','P','X'].reduce((s,b)=>s+A.gr[b].c3+A.gr[b].c4,0);
    if(stats) stats.innerHTML='VLGC <b>'+_fmt(A.vlgc.c3+A.vlgc.c4)+'</b> \u00b7 GR <b>'+_fmt(grTot)
      +'</b> \u00b7 Heater <b>'+_fmt(A.heater.c3+A.heater.c4)+'</b> \u00b7 OL1 <b>'+_fmt(A.ol1.PX||A.ol1.X+A.ol1.P)+'</b> kg';
    if(!tbody) return;
    const day = ROWS.filter(r=>r.date===date).sort((a,b)=>(b._ts||0)-(a._ts||0));
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
  const PRICE_KEYS = ['pP','pXP','pD1','pD21','pD22','pE1','pD1c4','pD21c4','pD22c4','pE1c4'];
  const PRICE_IN = { pP:'cavPriceP', pXP:'cavPriceXP', pD1:'cavPriceD1', pD21:'cavPriceD21', pD22:'cavPriceD22', pE1:'cavPriceE1',
                     pD1c4:'cavPriceD1c4', pD21c4:'cavPriceD21c4', pD22c4:'cavPriceD22c4', pE1c4:'cavPriceE1c4' };
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
      hint.textContent = has ? ('Prices saved for '+date) : 'No prices entered for '+date+' — blank fields use the most recent prior day'; }
  }
  function savePrices(){
    const date=_curDate();
    const rec={ _ts:Date.now(), by:(typeof CURRENT_USER!=='undefined'&&CURRENT_USER.name)||'?' };
    let any=false;
    PRICE_KEYS.forEach(k=>{ const el=document.getElementById(PRICE_IN[k]); const v=el?String(el.value).trim():''; if(v!==''){ rec[k]=_n(v); any=true; } });
    if(!any){ toast('Enter at least one price','er'); return false; }
    PRICES[date]=Object.assign({}, PRICES[date], rec);
    if(_priceRef){ _priceRef.child(date).update(rec).catch(e=>console.warn('[CAV] price save',e)); }
    try{ logAudit('cav:price', date, 'price', JSON.stringify(rec), '', 'update'); }catch(_){}
    toast('💾 Prices saved · '+date,'ok'); preview(); return true;
  }

  /* Build every Propane (C3) fill row with REAL values + status.
     status: man|app|sap (filled, value present) · wait (manual not yet
     entered, legitimately may be 0) · miss (source has no data for the day)
     · warn (cross-check mismatch). Values in TON. */
  function _fill(date, prod){
    prod = (prod==='c4') ? 'c4' : 'c3';
    const M = (prod==='c4') ? 'C4' : 'C3';   /* SAP material label */
    const PL = (prod==='c4') ? 'C4' : 'C3';  /* display label */
    const A=_agg(date), tl=_srcTL(date), wg=_srcWG(date), ws=_srcWS(date),
          sp=_srcSAP(date), vl=_srcVLOG(date);
    const T=_ton;
    const sapHas = !!(sp.slocs['1100']||sp.slocs['2100']||sp.slocs['2101']);
    const tlMiss = tl.n===0;
    function manRow(col,label,kg,xnote){ return {col,label,group:'MANUAL',src:'man',ton:T(kg),status:(kg>0?'man':'wait'),note:xnote||''}; }
    function appRow(col,label,kg,note,missCond){ return {col,label,group:'APP',src:'app',ton:T(kg),status:(missCond?'miss':(kg>0?'app':'wait')),note:note||''}; }
    function sapRow(col,label,kg,note){ return {col,label,group:'SAP',src:'sap',ton:(sapHas?T(kg):null),status:(sapHas?'sap':'miss'),note:note||''}; }
    const g=A.gr, o=A.ol1;
    let rows, prices, vesselCol;
    if(prod==='c4'){
      /* Butane sheet (58 cols): Domestic/Export only — no PETCHEM/EX-PETCHEM,
         no OL1, no Heater. Col numbers = 0-based ledger index (xl col = +1). */
      rows=[
        manRow(7,  'VLGC Get-in (보세창고 입고)', A.vlgc.c4),
        manRow(8,  'VLGC Get-out (출고)',          A.vlgcout.c4, 'user input'),
        manRow(11, 'Bonded Get-out D',             g.D.c4, 'GR · so khớp SAP'),
        manRow(12, 'Bonded Get-out E',             g.E.c4, 'GR · so khớp SAP'),
        appRow(24, 'Domestic Pure C4 (1100 GI)',   tl.pure.c4, 'TL Data · LPG type = pure', tlMiss),
        appRow(27, 'Domestic 2100 (TK-3501)',      tl.dom['2100'].c4, 'TL net · xe Domestic từ TK-3501', tlMiss),
        appRow(28, 'Domestic 2101 (TK-3502)',      tl.dom['2101'].c4, 'TL net · xe Domestic từ TK-3502', tlMiss),
        appRow(31, 'Export 1100 Cavern (vessel)',  vl.exp.c4, 'Vessel Log · type Export', false),
        appRow(33, 'Export 2100 (TK-3501)',        tl.exp['2100'].c4, 'TL net · xe Export từ TK-3501', tlMiss),
        appRow(34, 'Export 2101 (TK-3502)',        tl.exp['2101'].c4, 'TL net · xe Export từ TK-3502', tlMiss),
        sapRow(37, 'SAP Batch Stock Domestic 1100',sp.E('1100','D','C4'), 'ZMMFR022 · 1100|D'),
        sapRow(39, 'SAP Batch Stock Domestic 2100',sp.E('2100','D','C4'), 'ZMMFR022 · 2100|D'),
        sapRow(41, 'SAP Batch Stock Domestic 2101',sp.E('2101','D','C4'), 'ZMMFR022 · 2101|D'),
        sapRow(44, 'SAP Batch Stock Export 1100',  sp.E('1100','E','C4'), 'ZMMFR022 · 1100|E'),
        sapRow(46, 'SAP Stock Export 2100',        sp.E('2100','E','C4'), 'ZMMFR022 · 2100|E'),
        sapRow(47, 'SAP Stock Export 2101',        sp.E('2101','E','C4'), 'ZMMFR022 · 2101|E')
      ];
      vesselCol=31;
      prices=[
        {col:38, label:'Price Domestic 1100', f:_priceFor(date,'pD1c4')},
        {col:40, label:'Price Domestic 2100', f:_priceFor(date,'pD21c4')},
        {col:42, label:'Price Domestic 2101', f:_priceFor(date,'pD22c4')},
        {col:45, label:'Price Export 1100',   f:_priceFor(date,'pE1c4')}
      ];
    } else {
      rows=[
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
      vesselCol=52;
      prices=[
        {col:59, label:'Price PETCHEM (1100)',  f:_priceFor(date,'pP')},
        {col:61, label:'Price EX-PETCHEM (1100)',f:_priceFor(date,'pXP')},
        {col:63, label:'Price Domestic 1100',    f:_priceFor(date,'pD1')},
        {col:65, label:'Price Domestic 2100',    f:_priceFor(date,'pD21')},
        {col:67, label:'Price Domestic 2101',    f:_priceFor(date,'pD22')},
        {col:70, label:'Price Export 1100',      f:_priceFor(date,'pE1')}
      ];
    }
    const vc = (prod==='c4') ? vl.exp.c4 : vl.exp.c3;
    const vrow=rows.find(r=>r.col===vesselCol);
    if(vrow){
      if(vl.exp.qty>0 && vc===0){ vrow.status='warn'; vrow.note='Vessel có qty='+vl.exp.qty.toLocaleString()+' nhưng thiếu tách '+PL+' — kiểm tra Vessel data'; }
      if(vl.n===0){ vrow.note='Không có chuyến vessel ngày này (Export 1100 = 0)'; }
    }

    /* ---------- cross-checks ---------- */
    const checks=[]; const tol=0.001;
    if(prod==='c3'){
      if(sp.slocs['B100']){
        const man=T(A.heater.c3), sap=T(sp.b100.c3), d=Math.abs(man-sap);
        checks.push({ ok:d<=tol, label:'Heater C3 (manual) ↔ SAP B100 GI',
          detail:'manual='+man.toFixed(3)+'t · SAP='+sap.toFixed(3)+'t · Δ='+(man-sap).toFixed(3)+'t'});
      } else if(A.heater.c3>0){
        checks.push({ ok:null, label:'Heater C3 ↔ SAP B100 GI', detail:'SAP chưa có dòng B100 cho ngày này (không đối chiếu được)'});
      }
    }
    if(sapHas){
      const batches = (prod==='c4') ? [['D',g.D.c4],['E',g.E.c4]]
                                    : [['P',g.P.c3],['X',g.X.c3],['D',g.D.c3],['E',g.E.c3]];
      batches.forEach(pair=>{
        const b=pair[0], man=T(pair[1]), sap=T(Math.abs(sp.GR('1100',b,M)));
        if(man>0||sap>0){ const d=Math.abs(man-sap);
          checks.push({ ok:d<=tol, label:'GR '+b+' '+PL+' (manual) ↔ SAP GR 1100|'+b,
            detail:'manual='+man.toFixed(3)+'t · SAP='+sap.toFixed(3)+'t · Δ='+(man-sap).toFixed(3)+'t'}); }
      });
    }
    if(wg.n>0 && tl.n>0){
      const tlDom=tl.dom['2100'][prod]+tl.dom['2101'][prod], tlExp=tl.exp['2100'][prod]+tl.exp['2101'][prod];
      const wgDom=wg.dom[prod], wgExp=wg.exp[prod];
      const dD=Math.abs(T(wgDom)-T(tlDom)), dE=Math.abs(T(wgExp)-T(tlExp));
      checks.push({ ok:dD<=tol, label:'Domestic '+PL+': WMS GI ↔ TL net',
        detail:'WMS GI='+T(wgDom).toFixed(3)+'t · TL='+T(tlDom).toFixed(3)+'t · Δ='+(T(wgDom)-T(tlDom)).toFixed(3)+'t'});
      checks.push({ ok:dE<=tol, label:'Export '+PL+': WMS GI ↔ TL net',
        detail:'WMS GI='+T(wgExp).toFixed(3)+'t · TL='+T(tlExp).toFixed(3)+'t · Δ='+(T(wgExp)-T(tlExp)).toFixed(3)+'t'});
    }
    return { prod, rows, checks, prices, tl, wg, ws, sp, vl, sapHas, tlMiss };
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
    const F3=_fill(date,'c3'), F4=_fill(date,'c4');
    const prod = (_pvProd==='c4') ? 'c4' : 'c3';
    const F = (prod==='c4') ? F4 : F3;
    const stTip={man:'Filled · manual entry',app:'Filled · from TL/WMS/Vessel',sap:'Filled · SAP import',
                 wait:'Waiting · not entered yet (may legitimately be 0)',
                 miss:'Missing · source has no data for this day',
                 warn:'Mismatch · cross-check differs'};

    const man0=_agg(date);
    const aggSum=(man0.ol1.PX||man0.ol1.X+man0.ol1.P)+man0.heater.c3+man0.heater.c4
      +['D','E','P','X'].reduce((s,b)=>s+man0.gr[b].c3+man0.gr[b].c4,0)+man0.vlgc.c3+man0.vlgc.c4;
    const missing=[];
    if(!F3.sapHas) missing.push('SAP (ZMMFR022) has no data for this day → SAP Batch Stock columns (C3 & C4) are empty');
    if(F3.tlMiss)  missing.push('TL Data has no GI rows for this day → Domestic/Export (C3 & C4) are empty');
    if(aggSum===0) missing.push('No MANUAL input (VLGC / GR / Heater / OL1) for this day');
    if(F3.tl.unc.length) missing.push(F3.tl.unc.length+' TL row(s) could not be classified Domestic/Export — see Classification');
    const warn3=F3.checks.filter(c=>c.ok===false).length;
    const warn4=F4.checks.filter(c=>c.ok===false).length;
    if(warn3) missing.push(warn3+' C3 cross-check(s) MISMATCH — see Cross-checks');
    if(warn4) missing.push(warn4+' C4 cross-check(s) MISMATCH — see Cross-checks');
    const pm3=(F3.prices||[]).filter(p=>p.f.val==null).length;
    const pm4=(F4.prices||[]).filter(p=>p.f.val==null).length;
    if(pm3) missing.push(pm3+' C3 price column(s) missing — enter in SAP Prices, or a prior day is needed');
    if(pm4) missing.push(pm4+' C4 price column(s) missing — enter in SAP Prices, or a prior day is needed');
    const ready=missing.length===0;

    /* ---------- top bar: C3/C4 tabs + readiness chip + source chips ---------- */
    let html='';
    html+='<div class="cav-pv-top">';
    html+='<div class="cav-seg">'
      +'<button class="'+(prod==='c3'?'on':'')+'" onclick="cavPvTab(\'c3\')">C3 Propane</button>'
      +'<button class="'+(prod==='c4'?'on':'')+'" onclick="cavPvTab(\'c4\')">C4 Butane</button>'
      +'</div>';
    html+='<div class="cav-rd '+(ready?'ok':'bad')+'" onclick="cavToggleMiss()" title="Click to show/hide details">'
      +(ready?('✅ Ready · '+date):('⛔ '+missing.length+' issue'+(missing.length>1?'s':'')+' · '+date+' ▾'))+'</div>';
    const chip=(ok,txt)=>'<span class="cav-chip'+(ok?' has':'')+'">'+(ok?'●':'○')+' '+txt+'</span>';
    html+='<div class="cav-chips">'
      +chip(F3.tl.n>0,'TL '+F3.tl.n)+chip(F3.wg.n>0,'WMS GI '+F3.wg.n)+chip(F3.ws.n>0,'WMS ST '+F3.ws.n)
      +chip(F3.sapHas,'SAP '+(Object.keys(F3.sp.slocs).filter(Boolean).join('/')||'—'))+chip(F3.vl.n>0,'Vessel '+F3.vl.n)
      +'</div></div>';
    html+='<ul class="cav-miss" id="cavMiss" style="display:'+(ready?'none':'block')+'">'
      +missing.map(m=>'<li>'+_esc(m)+'</li>').join('')+'</ul>';

    /* ---------- 4 source-group columns for the active product (ton) ---------- */
    function grp(cls,title,src){
      const rows=F.rows.filter(r=>r.src===src);
      let g='<div class="cav-grp '+cls+'"><div class="cav-grp-hd"><span>'+title+'</span>'
        +(src==='man'?'<span class="ed" onclick="cavOpenMgr(\'day\')">✎ Edit inputs</span>':'')+'</div>';
      if(!rows.length) g+='<div class="cav-pv-row"><span class="lab" style="color:var(--ink-3)">— none —</span></div>';
      rows.forEach(m=>{
        const val=m.ton==null?'—':m.ton.toFixed(3);
        const editable=(src==='man');
        const tt=(stTip[m.status]||m.status)+(m.note?(' — '+m.note):'');
        g+='<div class="cav-pv-row s-'+m.status+(editable?' editable':'')+'" title="'+_esc(tt)+'"'
          +(editable?' onclick="cavOpenMgr(\'day\')"':'')+'>'
          +'<span class="cav-dot"></span>'
          +'<span class="lab">'+_esc(m.label)+'</span>'
          +'<span class="val s-'+m.status+'">'+val+'</span></div>';
      });
      g+='</div>'; return g;
    }
    function pricesCard(){
      if(!(F.prices && F.prices.length)) return '';
      let g='<div class="cav-grp cav-grp-price"><div class="cav-grp-hd"><span>PRICES ($/ton)</span>'
        +'<span class="ed" onclick="cavOpenModal(\'price\')">✎ Edit</span></div>';
      F.prices.forEach(p=>{
        const v=p.f.val==null?'—':p.f.val.toLocaleString('en-US');
        const st=p.f.val==null?'miss':(p.f.prev?'warn':'man');
        const tt=p.f.val==null?'No prior price available':(p.f.prev?('Using prior day · '+p.f.src):'Entered today');
        g+='<div class="cav-pv-row s-'+st+'" title="'+_esc(tt)+'"><span class="cav-dot"></span>'
          +'<span class="lab">'+_esc(p.label)+'</span><span class="val s-'+st+'">'+v+'</span></div>';
      });
      g+='</div>'; return g;
    }
    /* ---------- summary row: cross-checks + classification (always visible, on top) ---------- */
    html+='<div class="cav-sum">';
    /* cross-checks */
    const badC=F.checks.filter(c=>c.ok===false).length;
    html+='<div class="cav-grp" style="flex:1;min-width:280px"><div class="cav-grp-hd" style="background:'+(F.checks.length?(badC?'#b1271b':'#0a7d33'):'#64748b')+'">'
      +'<span>🔎 Cross-checks · '+prod.toUpperCase()+'</span>'
      +'<span style="font-size:11px;font-weight:600">'+(F.checks.length?(F.checks.length+(badC?(' · '+badC+' mismatch'):' · all match')):'none')+'</span></div>';
    if(F.checks.length){
      html+='<table class="cav-tbl"><tbody>';
      F.checks.forEach(c=>{
        const mk=c.ok===true?'<span style="color:#0a7d33">✔ match</span>'
          :c.ok===false?'<span style="color:#d62839">✘ mismatch</span>':'<span style="color:#b45309">… n/a</span>';
        html+='<tr><td style="width:84px">'+mk+'</td><td>'+_esc(c.label)+'</td><td style="color:var(--ink-3);font-size:11px">'+_esc(c.detail)+'</td></tr>';
      });
      html+='</tbody></table>';
    } else { html+='<div class="cav-pv-row"><span class="lab" style="color:var(--ink-3)">No cross-checks available for this day.</span></div>'; }
    html+='</div>';
    /* classification */
    const tdv=Object.entries(F3.tl.trades).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    const tyv=Object.entries(F3.tl.types).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    const wcv=Object.entries(F3.wg.codes).map(kv=>_esc(kv[0])+':'+kv[1]).join(' · ')||'(none)';
    html+='<div class="cav-grp" style="flex:1;min-width:280px"><div class="cav-grp-hd" style="background:'+(F3.tl.unc.length?'#b1271b':'#475569')+'">'
      +'<span>🏷️ Classification (Domestic/Export)</span>'
      +'<span style="font-size:11px;font-weight:600">'+(F3.tl.unc.length?(F3.tl.unc.length+' unclassified'):'OK')+'</span></div>';
    html+='<div style="padding:9px 13px;font-size:11px;color:var(--ink-2);line-height:1.7">'
      +'TL · Trade: '+tdv+'<br>TL · LPG Type: '+tyv+'<br>WMS GI · InternalCode: '+wcv;
    if(F3.tl.unc.length){
      html+='<div style="margin-top:6px;color:#b1271b">⚠ '+F3.tl.unc.length+' TL row(s) with unclear Domestic/Export or missing tank:</div>';
      html+='<ul style="margin:2px 0;padding-left:18px">'+F3.tl.unc.slice(0,8).map(u=>
        '<li>'+_esc(u.k)+' · tank='+_esc(u.tank)+' · trade='+_esc(u.trade||'—')+' · type='+_esc(u.type||'—')+' · C3='+u.c3.toLocaleString()+'kg · C4='+u.c4.toLocaleString()+'kg</li>').join('')
        +(F3.tl.unc.length>8?'<li>… and '+(F3.tl.unc.length-8)+' more</li>':'')+'</ul>';
    }
    html+='</div></div>';
    html+='</div>';

    /* ---------- 4 source-group columns for the active product (ton) ---------- */
    html+='<div class="cav-pv-cols">'
      +grp('cav-grp-man','MANUAL','man')
      +grp('cav-grp-app','APP · TL / WMS / Vessel','app')
      +grp('cav-grp-sap','SAP import','sap')
      +pricesCard()
      +'</div>';

    box.innerHTML=html;
    if(!_file) toast(ready?'Data ready · choose a file to export':'See the status panel below','');
    else toast(ready?'Data ready · safe to export':'Data incomplete — see details','');
    return { c3:F3, c4:F4 };
  }

  /* Export the filled .xlsx. Cell-write (JSZip) writes ONLY value columns
     and pre-creates IF-guarded formulas on future rows (auto-hide until the
     day's inputs exist) — see MODULE-MAP §4. Gated on the readiness verdict. */
  function exportReport(){
    if(!_file){ toast('Choose the WMS SAP .xlsx file first','er'); return; }
    const F=preview();
    const bad=function(f){ return f.rows.some(r=>r.status==='miss') || f.checks.some(c=>c.ok===false); };
    if(bad(F.c3) || bad(F.c4) || F.c3.tl.unc.length>0){ toast('Not exported: data missing/mismatched — see Preview','er'); return; }
    toast('Data ready. Cell-write .xlsx (JSZip) is the next step.','');
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
  /* per-day map: 1-based Excel col -> value (ton for stock, $/ton for prices),
     from _fill() so MANUAL + APP + SAP + price columns are all filled. */
  function _ledgerVals(dt, prod){
    const F=_fill(dt, prod); const map={};
    F.rows.forEach(r=>{ if(r.ton!=null) map[r.col+1]=r.ton; });
    if(F.prices) F.prices.forEach(p=>{ if(p.f.val!=null) map[p.col+1]=p.f.val; });
    return map;
  }
  function viewTable(mode){
    const prod=(document.getElementById('cavLedProd')||{}).value||'c3';
    let from,to;
    if(mode==='month'){
      const m=(document.getElementById('cavMonth')||{}).value; if(!m){ toast('Pick a month','er'); return; }
      const y=+m.split('-')[0], mo=+m.split('-')[1];
      from=m+'-01'; to=m+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0');
    } else if(mode==='day'){
      const d=(document.getElementById('cavDay')||{}).value || _yesterday();
      from=d; to=d;
    } else {
      from=(document.getElementById('cavFrom')||{}).value; to=(document.getElementById('cavTo')||{}).value;
      if(!from||!to){ toast('Pick From and To','er'); return; }
    }
    const days=_dateRange(from,to);
    const box=document.getElementById('cavLedger'); if(!box) return;
    if(!days.length){ box.innerHTML='<div class="cav-empty">Invalid range.</div>'; return; }
    const spec=CAV_LEDGER[prod]; if(!spec){ box.innerHTML='<div class="cav-empty">No layout for '+prod+'.</div>'; return; }
    const N=spec.ncol;
    const tot=new Array(N+1).fill(0);
    let body='<tbody>';
    days.forEach(dt=>{
      const map=_ledgerVals(dt, prod);
      const hasData=Object.keys(map).length>0;
      let tr='<tr'+(hasData?'':' style="opacity:.45"')+'><td class="cav-led-date">'+dt+'</td>';
      for(let col=2; col<=N; col++){
        const ton=map[col];
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
      +days.length+' day(s) \u00b7 MANUAL/APP/SAP/price columns filled from data in RAM (formula columns left blank).</div>';
  }

  function init(){
    const y=_yesterday();
    const dt=document.getElementById('cavDate'); if(dt && !dt.value) dt.value=y;
    const day=document.getElementById('cavDay'); if(day && !day.value) day.value=y;
    const mo=document.getElementById('cavMonth'); if(mo && !mo.value) mo.value=y.slice(0,7);
    _attach(); _attachPrice(); render(); try{ _fillPriceInputs(); }catch(_){}
  }

  /* Called when the Cavern tab is opened: default to yesterday and auto-build
     the preview + on-screen table from the SAP/WMS/TL data already in RAM. */
  function showDefaults(){
    const y=_yesterday();
    const dt=document.getElementById('cavDate'); if(dt && !dt.value) dt.value=y;
    const day=document.getElementById('cavDay'); if(day && !day.value) day.value=(dt&&dt.value)||y;
    const mo=document.getElementById('cavMonth'); if(mo && !mo.value) mo.value=((dt&&dt.value)||y).slice(0,7);
    try{ preview(); }catch(_){}
    try{ viewTable('day'); }catch(_){}
  }

  function setPrevProd(p){ _pvProd=(p==='c4')?'c4':'c3'; preview(); }
  function refreshPrices(){ try{ _fillPriceInputs(); }catch(_){} }

  /* ====== ENTRIES MANAGER (history across all dates) ====== */
  function setQty(rid,val){
    const e=RID_MAP[rid]; if(!e) return;
    const v=parseFloat(String(val).replace(/,/g,''));
    if(isNaN(v)||v<0){ toast('Invalid value','er'); renderMgr(); return; }
    e.qty=v; e._ts=Date.now(); _setRow(rid,e);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).update({ qty:v, _ts:e._ts })
      .catch(er=>console.warn('[CAV] setQty',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:edit', rid, e.kind, e.date+' qty='+v, '', 'update'); }catch(_){}
    render(); try{ preview(); }catch(_){}
  }
  function mgrDelete(rid){
    const e=RID_MAP[rid]; if(!e) return;
    if(!confirm('Delete '+(KIND_LBL[e.kind]||e.kind)+' '+(e.prod||'').toUpperCase()+' '+(BATCH_LBL[e.batch]||e.batch||'')+' '+e.qty+'kg ('+e.date+')?')) return;
    _removeRow(rid);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(null)
      .catch(er=>console.warn('[CAV] del',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:del', rid, e.kind, e.date, '', 'delete'); }catch(_){}
    render(); renderMgr(); try{ preview(); }catch(_){}
    toast('🗑 Deleted','ok');
  }
  /* mode: 'in' = delete entries within From–To (keep the rest);
     'keep' = keep From–To only (delete everything outside);
     'all'  = delete every entry. */
  function deleteRange(mode){
    const from=(document.getElementById('cavMgrFrom')||{}).value||'';
    const to  =(document.getElementById('cavMgrTo')||{}).value||'';
    if((mode==='in'||mode==='keep') && !from && !to){ toast('Set a From and/or To date first','er'); return; }
    const victims=[];
    ROWS.forEach(r=>{ if(!r||!r._rid) return; const d=r.date||''; let hit=false;
      if(mode==='all') hit=true;
      else if(mode==='in')   hit=((!from||d>=from)&&(!to||d<=to));
      else if(mode==='keep') hit=((from&&d<from)||(to&&d>to));
      if(hit) victims.push(r._rid);
    });
    if(!victims.length){ toast('No entries match','er'); return; }
    const rng=(from||'…')+' → '+(to||'…');
    const label = mode==='all' ? ('ALL '+victims.length+' entries')
                : mode==='in'  ? (victims.length+' entries in '+rng)
                :                (victims.length+' entries OUTSIDE '+rng+' (keeping '+rng+')');
    if(!confirm('Delete '+label+'?\nThis cannot be undone.')) return;
    _suppressEcho++;
    victims.forEach(rid=>{ _removeRow(rid); if(_fbRef) _fbRef.child(rid).set(null).catch(er=>console.warn('[CAV] bulkdel',er)); });
    setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },800);
    try{ logAudit('cav:bulkdel', 'range', mode, rng+' ('+victims.length+')', '', 'delete'); }catch(_){}
    render(); renderMgr(); try{ preview(); }catch(_){}
    toast('🗑 Deleted '+victims.length+' entries','ok');
  }
  function _mgrHTML(){
    const from=(document.getElementById('cavMgrFrom')||{}).value||'';
    const to  =(document.getElementById('cavMgrTo')||{}).value||'';
    let rows=ROWS.filter(r=>r&&r._rid);
    if(from) rows=rows.filter(r=>(r.date||'')>=from);
    if(to)   rows=rows.filter(r=>(r.date||'')<=to);
    rows=rows.sort((a,b)=> (a.date<b.date?1:a.date>b.date?-1:(b._ts||0)-(a._ts||0)));
    let h='<div style="font-size:11px;color:var(--ink-3);margin-bottom:8px">'+rows.length+' entr'+(rows.length===1?'y':'ies')
      +((from||to)?(' · '+(from||'…')+' → '+(to||'…')):' · all dates')+' · qty in kg · change a value then click away to save</div>';
    if(!rows.length) return h+'<div class="cav-empty">No entries.</div>';
    h+='<table class="cav-tbl"><thead><tr><th>Date</th><th>Type</th><th>Prod</th><th>Batch</th><th>Qty (kg)</th><th>Note</th><th></th></tr></thead><tbody>';
    rows.forEach(e=>{
      const rid=String(e._rid||'').replace(/'/g,"\\'");
      h+='<tr><td style="white-space:nowrap">'+_esc(e.date||'')+'</td>'
        +'<td><span class="cav-badge '+(KIND_CLS[e.kind]||'')+'">'+_esc(KIND_LBL[e.kind]||e.kind)+'</span></td>'
        +'<td class="'+(e.prod==='c4'?'cav-c4':'cav-c3')+'">'+_esc(String(e.prod||'').toUpperCase())+'</td>'
        +'<td>'+_esc(BATCH_LBL[e.batch]||e.batch||'—')+'</td>'
        +'<td><input type="number" step="any" value="'+_esc(e.qty)+'" style="width:110px;padding:3px 6px;text-align:right;border:1px solid var(--line);border-radius:5px" onchange="CAV.setQty(\''+rid+'\',this.value)"></td>'
        +'<td style="color:var(--ink-3);font-size:11px">'+_esc(e.note||'')+'</td>'
        +'<td><button class="cav-del" onclick="CAV.mgrDelete(\''+rid+'\')" title="Delete">✕</button></td></tr>';
    });
    h+='</tbody></table>'; return h;
  }
  function renderMgr(){ const b=document.getElementById('cavMgrBody'); if(b) b.innerHTML=_mgrHTML(); }

  /* ====== IMPORT: OL1 EX-PETCHEM (X) usage from the C3-usage Excel ======
     list = [{date:'YYYY-MM-DD', kg:Number, src:'...'}]. Upsert: any existing
     OL1·C3·X entry on those dates is replaced by the imported value. */
  function _silentRemove(rid){
    if(!RID_MAP[rid]) return;
    _removeRow(rid);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(null)
      .catch(er=>console.warn('[CAV] import rm',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },500)); }
  }
  /* create a versioned OL1·C3·X entry (only called when data actually changes) */
  function _pushX(date,kg,src,ver){
    const rid=_genRid();
    const entry={ _rid:rid, date:date, kind:'ol1', prod:'c3', batch:'X', qty:kg,
      note:String(src||''), _ts:Date.now(), _ver:ver||1,
      by:(typeof CURRENT_USER!=='undefined' && CURRENT_USER.name) || 'import' };
    _setRow(rid, entry);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(entry)
      .catch(er=>console.warn('[CAV] importX push',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },500)); }
    try{ logAudit('cav:importX', rid, 'ol1', date+' qty='+kg+' v'+entry._ver, '', 'create'); }catch(_){}
  }
  /* Version-aware import: only changed days are written to Firebase (with an
     incremented _ver). Unchanged days are left exactly as in RAM (no write).
     list = [{date,kg,src}] (already filtered to the chosen month[s]). */
  function importXUsage(list){
    if(!list || !list.length){ toast('No rows to import','er'); return null; }
    const tol=0.001;
    let created=0, updated=0, unchanged=0, removed=0;
    list.forEach(e=>{
      const ex=ROWS.filter(r=>r && r.kind==='ol1' && r.prod==='c3' && r.batch==='X' && r.date===e.date);
      if(e.kg>0){
        if(!ex.length){ _pushX(e.date, e.kg, e.src, 1); created++; return; }
        const keep=ex[0];
        /* consolidate any duplicate X entries for the day */
        for(let i=1;i<ex.length;i++) _silentRemove(ex[i]._rid);
        if(ex.length===1 && Math.abs((parseFloat(keep.qty)||0)-e.kg)<=tol && String(keep.note||'')===String(e.src||'')){ unchanged++; return; }
        keep.qty=e.kg; keep.note=e.src; keep._ts=Date.now(); keep._ver=(parseInt(keep._ver,10)||1)+1;
        _setRow(keep._rid, keep);
        if(_fbRef){ _suppressEcho++; _fbRef.child(keep._rid).update({ qty:keep.qty, note:keep.note, _ts:keep._ts, _ver:keep._ver })
          .catch(er=>console.warn('[CAV] importX upd',er))
          .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },500)); }
        try{ logAudit('cav:importX', keep._rid, 'ol1', e.date+' qty='+e.kg+' v'+keep._ver, '', 'update'); }catch(_){}
        updated++;
      } else {
        /* value is 0 / blank → remove any existing X for the day */
        ex.forEach(r=>{ _silentRemove(r._rid); removed++; });
      }
    });
    render(); try{ preview(); }catch(_){} try{ renderMgr(); }catch(_){}
    toast('📥 X import · '+created+' new · '+updated+' updated · '+unchanged+' unchanged'+(removed?(' · '+removed+' removed'):''),'ok');
    return { created, updated, unchanged, removed };
  }

  /* ---- edit / delete used by the "Stored X" viewer ---- */
  function editXQty(rid,val){
    const e=RID_MAP[rid]; if(!e) return false;
    if(e.kind!=='ol1'||e.prod!=='c3'||e.batch!=='X') return false;
    const v=parseFloat(String(val).replace(/,/g,''));
    if(isNaN(v)||v<0){ toast('Invalid value','er'); return false; }
    e.qty=v; e._ts=Date.now(); e._ver=(parseInt(e._ver,10)||1)+1;
    e.by=(typeof CURRENT_USER!=='undefined' && CURRENT_USER.name) || 'edit';
    _setRow(rid,e);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).update({ qty:v, _ts:e._ts, _ver:e._ver, by:e.by })
      .catch(er=>console.warn('[CAV] editXQty',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:editX', rid, 'ol1', e.date+' qty='+v+' v'+e._ver, '', 'update'); }catch(_){}
    render(); try{ preview(); }catch(_){}
    return true;
  }
  function deleteX(rid){
    const e=RID_MAP[rid]; if(!e) return false;
    _removeRow(rid);
    if(_fbRef){ _suppressEcho++; _fbRef.child(rid).set(null)
      .catch(er=>console.warn('[CAV] deleteX',er))
      .finally(()=>setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },400)); }
    try{ logAudit('cav:delX', rid, 'ol1', (e.date||''), '', 'delete'); }catch(_){}
    render(); try{ preview(); }catch(_){}
    return true;
  }
  function deleteAllX(){
    const victims=ROWS.filter(r=>r&&r._rid&&r.kind==='ol1'&&r.prod==='c3'&&r.batch==='X').map(r=>r._rid);
    if(!victims.length){ toast('No X data to delete','er'); return 0; }
    _suppressEcho++;
    victims.forEach(rid=>{ _removeRow(rid); if(_fbRef) _fbRef.child(rid).set(null).catch(er=>console.warn('[CAV] deleteAllX',er)); });
    setTimeout(()=>{ _suppressEcho=Math.max(0,_suppressEcho-1); },800);
    try{ logAudit('cav:delAllX', '_bulk_', 'ol1', victims.length+' X rows', '', 'delete'); }catch(_){}
    render(); try{ preview(); }catch(_){}
    toast('🗑 Deleted '+victims.length+' X day(s)','ok');
    return victims.length;
  }

  return { init, render, add, deleteRow, delEntry, editEntry, cancelEdit, saveEntry, savePrices, fileChosen, preview, exportReport, viewTable, setPrevProd, refreshPrices, setQty, mgrDelete, deleteRange, renderMgr, showDefaults, importXUsage, editXQty, deleteX, deleteAllX, get ROWS(){ return ROWS; } };
})();
window.CAV = CAV;

/* ===== Cavern UI helpers (modal + preview tabs) — global ===== */
function cavOpenModal(kind){
  var modal=document.getElementById('cavModal'); if(!modal) return;
  modal.querySelectorAll('.cav-pane').forEach(function(p){ p.classList.remove('on'); });
  var pane=document.getElementById('cavPane-'+kind); if(pane) pane.classList.add('on');
  var titles={vlgc:'VLGC — In / Out',gr:'GR Bonded → 1100',heater:'Heater (B100 · batch D)',
              ol1:'OL1 Supply (1100 GI · C3)',price:'SAP Prices ($/ton)'};
  var t=document.getElementById('cavModalTitle'); if(t) t.textContent=titles[kind]||'Add entry';
  var sv=document.getElementById('cavModalSave');
  if(sv){ sv.setAttribute('data-kind',kind); sv.textContent=(kind==='price'?'Save prices':'Add'); }
  if(kind==='price'){ try{ window.CAV&&CAV.refreshPrices&&CAV.refreshPrices(); }catch(_){} }
  modal.classList.add('on');
  setTimeout(function(){ var first=pane&&pane.querySelector('input,select'); if(first) first.focus(); },40);
}
function cavCloseModal(){ var m=document.getElementById('cavModal'); if(m) m.classList.remove('on'); }
function cavModalSave(){
  var sv=document.getElementById('cavModalSave'); var kind=sv?sv.getAttribute('data-kind'):'';
  var ok=false;
  try{ ok=(kind==='price') ? CAV.savePrices() : (CAV.add(kind)>0); }catch(e){ console.warn('[CAV] modal save',e); }
  if(ok) cavCloseModal();
}
function cavPvTab(p){ try{ CAV.setPrevProd(p); }catch(_){} }
function cavToggleMiss(){ var el=document.getElementById('cavMiss'); if(el) el.style.display=(el.style.display==='none'?'block':'none'); }
/* Entries manager (history across all dates) */
function cavOpenMgr(scope){
  var m=document.getElementById('cavMgrModal'); if(!m) return;
  var f=document.getElementById('cavMgrFrom'), t=document.getElementById('cavMgrTo');
  if(scope==='day'){ var d=document.getElementById('cavDate'); var v=(d&&d.value)||''; if(f)f.value=v; if(t)t.value=v; }
  else { if(f)f.value=''; if(t)t.value=''; }
  m.classList.add('on');
  try{ CAV.renderMgr(); }catch(_){}
}
function cavCloseMgr(){ var m=document.getElementById('cavMgrModal'); if(m) m.classList.remove('on'); }
function cavMgrRefresh(){ try{ CAV.renderMgr(); }catch(_){} }
function cavMgrDel(mode){ try{ CAV.deleteRange(mode); }catch(_){} }
function cavOpenEntries(){ cavOpenMgr('day'); }
document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ cavCloseModal(); cavCloseMgr(); cavCloseImport(); cavCloseXTable(); } });

/* ====== OL1 EX-PETCHEM (X) usage — PASTE flow ======
   Source = "C3 usage for export production" sheet "일자별 C3사용량".
   X value column = J = 관세유예 C3사용량 (생산 실적 기준)  [actual]
   Fallback       = H = 관세유예 C3사용량 (생산 계획으로 추정) [plan]
   Rule: per day use J if it has a value, else H. MT → kg (×1000).

   IMPORTANT (v4.56.1 fix): columns are mapped by the KOREAN HEADER TEXT, not by
   position. The sheet hides column D and L–P, and Excel may drop hidden columns
   from the clipboard, which shifted a position-based parser onto column K
   (6월 재고). Mapping by header (관세유예 + 실적/계획) is immune to hidden columns,
   so the user MUST include the header row (the row containing "관세유예") in the
   copy. Year comes from the Cavern date. */
var _cavParsedX = [];
function cavTogglePasteX(show){
  var box=document.getElementById('cavOl1PasteBox'); if(!box) return;
  var on=(typeof show==='boolean')?show:(box.style.display==='none'||!box.style.display);
  box.style.display=on?'flex':'none';
  if(on){ var ta=document.getElementById('cavOl1PasteData'); if(ta) setTimeout(function(){ ta.focus(); },30); }
}
function _cavNum(v){ return parseFloat(String(v==null?'':v).replace(/,/g,'').trim()); }
/* quote-aware TSV parser (multi-line header cells from Excel are double-quoted) */
function _cavTSV(text){
  var rows=[], row=[], f='', q=false;
  var s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(var i=0;i<s.length;i++){
    var ch=s[i];
    if(q){ if(ch==='"'){ if(s[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=ch; }
    else { if(ch==='"')q=true; else if(ch==='\t'){ row.push(f); f=''; } else if(ch==='\n'){ row.push(f); rows.push(row); row=[]; f=''; } else f+=ch; }
  }
  if(f.length||row.length){ row.push(f); rows.push(row); }
  return rows;
}
/* Parse pasted TSV → { list:[{date,kg,src}] } or { error:'NO_HEADER' }.
   Columns located by header text; data months/days by the mapped header columns
   (월 / 일자), falling back to numeric-pair detection if those headers are absent. */
function cavParseXText(text, yr){
  var rows=_cavTSV(text);
  var jCol=-1, hCol=-1, moCol=-1, dayCol=-1;
  for(var r=0;r<rows.length;r++){
    var c=rows[r]||[];
    for(var k=0;k<c.length;k++){
      var t=String(c[k]||'').replace(/\s+/g,' ').trim();
      if(!t) continue;
      if(t.indexOf('관세유예')>-1){
        if(t.indexOf('실적')>-1){ if(jCol<0) jCol=k; }
        else if(t.indexOf('계획')>-1 || t.indexOf('추정')>-1){ if(hCol<0) hCol=k; }
      }
      if(t==='월' && moCol<0) moCol=k;
      if((t==='일자'||t==='일') && dayCol<0) dayCol=k;
    }
    if(jCol>-1 && hCol>-1 && moCol>-1 && dayCol>-1) break;
  }
  if(jCol<0 && hCol<0) return { error:'NO_HEADER' };
  var out=[];
  rows.forEach(function(c){
    if(!c) return;
    var mo, day;
    if(moCol>-1 && dayCol>-1){ mo=_cavNum(c[moCol]); day=_cavNum(c[dayCol]); }
    if(!(Number.isInteger(mo)&&mo>=1&&mo<=12&&Number.isInteger(day)&&day>=1&&day<=31)){
      mo=undefined; day=undefined;
      for(var i=1;i<c.length;i++){
        var m2=_cavNum(c[i-1]), d2=_cavNum(c[i]);
        if(Number.isInteger(m2)&&m2>=1&&m2<=12&&Number.isInteger(d2)&&d2>=1&&d2<=31){ mo=m2; day=d2; break; }
      }
      if(mo===undefined) return;
    }
    var J=(jCol>-1)?_cavNum(c[jCol]):NaN;
    var H=(hCol>-1)?_cavNum(c[hCol]):NaN;
    var val=null, src='';
    if(!isNaN(J)){ val=J; src='Paste · actual (J)'; }
    else if(!isNaN(H)){ val=H; src='Paste · plan (H)'; }
    if(val==null) return;
    var date=yr+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    out.push({ date:date, kg:Math.round(val*1000*1000)/1000, src:src });  /* MT → kg */
  });
  return { list:out };
}
function cavPasteParseX(){
  var ta=document.getElementById('cavOl1PasteData'); var txt=ta?ta.value:'';
  if(!txt.trim()){ alert('Hãy dán dữ liệu (kèm dòng tiêu đề) từ file C3-usage trước.'); return; }
  var dEl=document.getElementById('cavDate');
  var yr=(dEl && dEl.value) ? dEl.value.slice(0,4) : String(new Date().getFullYear());
  var res=cavParseXText(txt, yr);
  if(res && res.error==='NO_HEADER'){
    alert('Không tìm thấy cột "관세유예 C3사용량".\n\nVì cột D và L–P trong Excel đang bị ẨN nên không thể dò theo vị trí. Hãy bôi đen KÈM cả DÒNG TIÊU ĐỀ (dòng có chữ 관세유예 — tức cột H và J) rồi copy & dán lại.');
    return;
  }
  var list=(res && res.list) || [];
  if(!list.length){ alert('Không tìm thấy dòng X hợp lệ. Hãy copy kèm dòng tiêu đề và các dòng ngày (cột 월, 일자, và H/J).'); return; }
  _cavParsedX=list;
  cavShowMonthPicker(list);
}
/* Build the month checklist and open the picker modal. */
function cavShowMonthPicker(list){
  var byM={};
  list.forEach(function(e){ var m=e.date.slice(0,7); if(!byM[m]) byM[m]={n:0,a:0,p:0}; byM[m].n++; if(e.src.indexOf('actual')>-1) byM[m].a++; else byM[m].p++; });
  var months=Object.keys(byM).sort();
  var box=document.getElementById('cavImportMonths');
  if(box){ box.innerHTML=months.map(function(m){ var s=byM[m];
    return '<label class="cav-row" style="gap:8px;cursor:pointer"><input type="checkbox" class="cavImpM" value="'+m+'" checked style="flex:none;width:auto"> '
      +'<b style="flex:none">'+m+'</b> <span style="color:var(--ink-3);font-size:12px">'+s.n+' day(s) · '+s.a+' actual / '+s.p+' plan</span></label>';
  }).join(''); }
  var md=document.getElementById('cavImportModal'); if(md) md.classList.add('on');
}
function cavCloseImport(){ var m=document.getElementById('cavImportModal'); if(m) m.classList.remove('on'); }
function cavDoImportX(){
  var checked={}; document.querySelectorAll('.cavImpM:checked').forEach(function(c){ checked[c.value]=1; });
  var sel=_cavParsedX.filter(function(e){ return checked[e.date.slice(0,7)]; });
  if(!sel.length){ alert('Select at least one month.'); return; }
  try{ CAV.importXUsage(sel); }catch(e){ console.warn(e); alert('Import failed: '+e.message); }
  cavCloseImport();
  var ta=document.getElementById('cavOl1PasteData'); if(ta) ta.value='';
  cavTogglePasteX(false);
}

/* ====== View stored X usage (no file/paste needed) ======
   Reads the OL1·C3·X entries already in memory and shows the period they cover
   plus the most-recent update timestamp, then a per-day detail table. */
function _cavFmtKg(n){ return (Math.round((+n||0)*1000)/1000).toLocaleString('en-US'); }
function cavViewXTable(){ var m=document.getElementById('cavXTableModal'); if(!m) return; cavRenderXTable(); m.classList.add('on'); }
function cavCloseXTable(){ var m=document.getElementById('cavXTableModal'); if(m) m.classList.remove('on'); }
function cavRenderXTable(){
  var all=(window.CAV && CAV.ROWS) ? CAV.ROWS : [];
  var rows=all.filter(function(r){ return r && r.kind==='ol1' && r.prod==='c3' && r.batch==='X'; });
  var meta=document.getElementById('cavXTableMeta'), body=document.getElementById('cavXTableBody');
  if(!rows.length){ if(meta) meta.innerHTML='<i>Chưa có dữ liệu X — dùng 📋 Paste để nạp.</i>'; if(body) body.innerHTML=''; return; }
  rows.sort(function(a,b){ return (a.date<b.date?-1:a.date>b.date?1:0); });
  var minD=rows[0].date, maxD=rows[rows.length-1].date;
  var latest=0, totKg=0, mset={};
  rows.forEach(function(r){ var t=parseInt(r._ts,10)||0; if(t>latest) latest=t; totKg+=(parseFloat(r.qty)||0); mset[r.date.slice(0,7)]=1; });
  var months=Object.keys(mset).sort().join(', ');
  if(meta){ meta.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">'
    +'<div>Period: <b>'+minD+'</b> → <b>'+maxD+'</b> · '+rows.length+' day(s) · months: <b>'+months+'</b>'
    +'<br>Total X: <b>'+_cavFmtKg(totKg)+'</b> kg ('+_cavFmtKg(totKg/1000)+' MT) · Last updated: <b>'+(latest?new Date(latest).toLocaleString():'—')+'</b>'
    +'<br><span style="font-size:11px;color:var(--ink-3)">Sửa trực tiếp ô X (kg) rồi click ra ngoài để lưu (MT đổi theo). ✕ = xóa ngày đó.</span></div>'
    +'<button class="cav-btn cav-btn-danger" style="flex:none" onclick="cavDeleteAllX()">🗑 Xóa tất cả</button>'
    +'</div>'; }
  var h='<table class="cav-tbl"><thead><tr><th>Date</th><th style="text-align:right">X (kg)</th><th style="text-align:right">X (MT)</th><th>Source</th><th style="text-align:center">Ver</th><th>Updated</th><th style="text-align:center">🗑</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var rid=String(r._rid||'').replace(/'/g,"\\'");
    var kg=parseFloat(r.qty)||0, note=String(r.note||'');
    var src=note.indexOf('actual')>-1?'J · actual':note.indexOf('plan')>-1?'H · plan':(note||'manual');
    var ts=parseInt(r._ts,10)||0;
    h+='<tr><td style="white-space:nowrap">'+r.date+'</td>'
      +'<td style="text-align:right"><input type="number" step="any" value="'+kg+'" onchange="cavEditX(\''+rid+'\',this.value)" style="width:120px;padding:3px 6px;text-align:right;border:1px solid var(--line);border-radius:5px"></td>'
      +'<td style="text-align:right">'+_cavFmtKg(kg/1000)+'</td>'
      +'<td style="color:var(--ink-3);font-size:11px">'+src+'</td>'
      +'<td style="text-align:center">'+(parseInt(r._ver,10)||1)+'</td>'
      +'<td style="color:var(--ink-3);font-size:11px;white-space:nowrap">'+(ts?new Date(ts).toLocaleString():'—')+'</td>'
      +'<td style="text-align:center"><button class="cav-del" onclick="cavDeleteX(\''+rid+'\')" title="Xóa ngày này">✕</button></td></tr>';
  });
  h+='</tbody></table>';
  if(body) body.innerHTML=h;
}
/* edit / delete handlers for the Stored X viewer */
function cavEditX(rid,val){ try{ CAV.editXQty(rid,val); }catch(e){ console.warn(e); } cavRenderXTable(); }
function cavDeleteX(rid){
  var e=((window.CAV && CAV.ROWS) ? CAV.ROWS : []).filter(function(r){ return r && r._rid===rid; })[0];
  if(e && !confirm('Xóa ngày '+e.date+' (X = '+_cavFmtKg(e.qty)+' kg)?')) return;
  try{ CAV.deleteX(rid); }catch(er){ console.warn(er); }
  cavRenderXTable();
}
function cavDeleteAllX(){
  var rows=((window.CAV && CAV.ROWS) ? CAV.ROWS : []).filter(function(r){ return r && r.kind==='ol1' && r.prod==='c3' && r.batch==='X'; });
  if(!rows.length){ alert('Chưa có dữ liệu X để xóa.'); return; }
  if(!confirm('Xóa TOÀN BỘ '+rows.length+' ngày dữ liệu X (EX-PETCHEM) đã lưu?\nKhông thể hoàn tác.')) return;
  try{ CAV.deleteAllX(); }catch(e){ console.warn(e); }
  cavRenderXTable();
}


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
