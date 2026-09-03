/* ============================================================
 * (globals)  —  helpers.js
 * ------------------------------------------------------------
 * NGUỒN (V4-54): lpg-station-v4_54_0-cavern-collapsible-sections.html
 *   dòng 8803–8878   (~76 dòng)
 * Global xuất ra : window.(globals)
 * Phase tách     : P2
 * Phụ thuộc      : —
 * Khởi tạo (boot): (thuần, hoisted – không init)
 * ------------------------------------------------------------
 * MÔ TẢ: Hàm thuần toàn cục: isTempOid (8808), multi-DO (_mdNormDO/isMultiDO/splitDOs/dosOverlap/doMatch 8825–8856), cùng các tiện ích rải rác: isoToday/isoLabel/parseDate, escapeHtml, toast, cavToggle (8782).
 *
 * API công khai (điền/đối chiếu khi tách):
 *   isTempOid(), isMultiDO(), splitDOs(), dosOverlap(), doMatch(), escapeHtml(), toast(), isoToday()...
 * ------------------------------------------------------------
 * CÁCH TÁCH (khi tới phase này):
 *   1) Mở V4-54, copy nguyên khối module (globals) từ dòng 8803 đến 8878.
 *   2) Dán xuống DƯỚI dòng này. GIỮ NGUYÊN tên global (window.(globals)).
 *   3) node --check helpers.js   → phải PASS (không lỗi cú pháp).
 *   4) Mở index.html trên trình duyệt → kiểm tra chức năng hoạt động.
 *   5) Cập nhật docs/PLAN-TACH-MODULE.md: đánh dấu [x] module này.
 * ============================================================ */

/* TODO[P2]: dán thân module (globals) (V4-54 dòng 8803–8878) vào đây. */

/* Recognise a temporary-DO identifier (the _oid / DO column value for an order
   that has no real DO yet). Accepts BOTH:
     • legacy  : TMP-YYYYMMDD-NNN   (pre-existing data in Firebase)
     • new     : ABC + YYMMDD + seq (3-letter customer prefix, e.g. KNH26060201)
   A real DO is 7+ pure digits, which never matches either branch. */
function isTempOid(v){
  v = String(v||'').trim().toUpperCase();        // case-insensitive: hand-typed temp DOs may be lower/mixed case
  if(!v) return false;
  if(/^TMP-\d{8}-\d{3}$/.test(v)) return true;   // legacy
  return /^[A-Z]{3}\d{7,}$/.test(v);             // new: 3 letters + yymmdd(6) + seq(1+)
}

/* ============================================================
   MULTI-DO HELPERS — ported from V406 (p12.x multi-DO port)
   A "multi-DO" load = one truck (plate) carrying several DOs in a
   single visit. V406 represents the merged order as ONE plan/station
   row whose doNum holds space-separated real DOs, plus:
     _multiDO:true  and  _linkedRows:[{doNum,customer,qty,type,note}…]
   These helpers are PURE and GLOBAL (function-declaration hoisted).
   Self-contained — no dependency on the module-scoped normDO().
   ============================================================ */
/* internal: normalise a single DO token (strip spaces/commas + leading zeros) */
function _mdNormDO(d){ return String(d==null?'':d).replace(/[,\s]/g,'').replace(/^0+/,'').trim(); }

/* true when a DO string contains 2+ real (7-digit) DOs, e.g. "86511943 86511919" */
function isMultiDO(doStr){
  return String(doStr==null?'':doStr).trim().split(/\s+/)
    .filter(function(d){ return /^\d{7,}$/.test(d); }).length > 1;
}

/* split a combined DO string (space / slash / comma separated) into an array
   of normalised real DOs. Non-DO tokens (temp / "after loading") are dropped. */
function splitDOs(doStr){
  return String(doStr==null?'':doStr).trim().split(/[\s\/,]+/)
    .map(_mdNormDO).filter(function(d){ return /^\d{7,}$/.test(d); });
}

/* do two DO strings share at least one DO? */
function dosOverlap(a, b){
  var sa = {}; splitDOs(a).forEach(function(d){ sa[d] = 1; });
  return splitDOs(b).some(function(d){ return sa[d]; });
}

/* exact match (single DO) or overlap (multi-DO) */
function doMatch(a, b){
  var sa = _mdNormDO(a), sb = _mdNormDO(b);
  if(!sa || !sb) return false;
  if(sa === sb) return true;
  return dosOverlap(a, b);
}

/* normalise a raw DO cell → space-separated real DOs. If no real DO is found
   (temp DO like ABC2606031 / "after loading" / empty) the value is kept as-is. */
function cleanDO(raw){
  if(!raw) return '';
  var s = String(raw).replace(/[\n\r,;\/\\]+/g,' ').trim().replace(/\s+/g,' ');
  var dos = s.match(/\b\d{7,}\b/g);
  if(!dos || !dos.length) return s.trim();
  return dos.map(function(d){ return d.replace(/^0+/,'') || d; }).join(' ');
}

/* product type label for a merged multi-DO row: unique derived types joined
   with " + " (e.g. "C3 + C4"). Uses V4's existing _pfDeriveType. */
function deriveProductTypeMulti(linkedRows){
  if(!linkedRows || linkedRows.length <= 1) return '';
  var dt = (typeof _pfDeriveType === 'function') ? _pfDeriveType : function(t){ return t || ''; };
  var types = linkedRows.map(function(r){ return dt(r.type || ''); }).filter(Boolean);
  var uniq = []; types.forEach(function(t){ if(uniq.indexOf(t) < 0) uniq.push(t); });
  if(!uniq.length) return '';
  return uniq.length === 1 ? uniq[0] : uniq.join(' + ');
}


/* ============================================================
   SUB-TAB DEFINITIONS  (unchanged — # is hard key)
   ============================================================ */


/* ============================================================
   TRADE — MỘT NGUỒN DUY NHẤT CHO CÂU HỎI "XUẤT KHẨU HAY NỘI ĐỊA"
   ------------------------------------------------------------
   ⚠ v4.125 — VÁ LỖI ĐẾM NHẦM KHỐI LƯỢNG DOMESTIC.

   Luật ĐÚNG đã có sẵn ngay từ lúc DÁN Sale Plan: scale.js khi đẩy dòng
   trạm sang TL Data đọc TÊN KHÁCH của dòng kế hoạch
        isExport = /export/i.test(customer)
   rồi ghi cột `trade` = 'Export' / 'Domestic' (+ ' (Pure)'). Mọi báo cáo
   phía sau (Daily Stock của cav.js, mthr.js, inv.js) đọc CỘT `trade` đó
   nên chúng đúng.

   Riêng FCST (dải DỰ BÁO TỒN KHO) đọc DÒNG KẾ HOẠCH — xe chưa cân nên
   dòng kế hoạch CHƯA CÓ cột `trade` — vì vậy nó tự dò lại bằng bộ từ khoá
   riêng. Bộ đó khớp CHUỖI CON "EX", nên khách NỘI ĐỊA có chữ EX trong tên
   (PETIMEX, PETROLIMEX, mọi công ty ...IMEX) bị đẩy sang cột EXPORT ⇒ khối
   lượng domestic sai, và sai theo hướng NGUY HIỂM: tưởng lô D còn nhiều
   hàng hơn thực tế.

   Từ nay CHỈ CÓ MỘT CHỖ quyết định hướng bán — TRADE dưới đây:
     ① cột `trade` đã chốt (dòng TL Data)  — đã chốt thì tin tuyệt đối
     ② TÊN KHÁCH  ← đúng luật lúc dán Sale Plan, đây là NGUỒN CHÍNH
     ③ cột Type (hợp đồng)   ④ cột Note    — chỉ khi ①② không nói gì
     ⑤ không ai nói gì ⇒ NỘI ĐỊA (D). Đó là LUẬT, không phải phỏng đoán.

   ⭐ KHỚP NGUYÊN CHỮ, KHÔNG KHỚP CHUỖI CON. Chuỗi được chuẩn hoá (hoa hoá,
   mọi ký tự không phải chữ/số biến thành khoảng trắng) rồi mới dò từ khoá
   có khoảng trắng hai bên, nên "PETIMEX" không bao giờ ra EXPORT nữa.
   ============================================================ */
var TRADE = (function(){
  'use strict';
  /* từ khoá ĐÃ KÈM khoảng trắng hai bên — chỉ khớp khi đứng riêng một chữ */
  var EXP = [' EXPORT ', ' EXPORTS ', ' XK ', ' XUAT KHAU ', ' XUẤT KHẨU ', '수출'];
  var DOM = [' DOMESTIC ', ' DOM ', ' ND ', ' NOI DIA ', ' NỘI ĐỊA ', '내수'];

  /* ' ABC DEF ' — hoa hoá, bỏ dấu câu, kẹp khoảng trắng hai đầu */
  function _norm(s){
    return ' ' + String(s == null ? '' : s).toUpperCase()
      .replace(/[^0-9A-ZÀ-ỹ가-힯]+/g, ' ')
      .replace(/\s+/g, ' ').trim() + ' ';
  }
  function _hit(list, t){
    for(var i = 0; i < list.length; i++){ if(t.indexOf(list[i]) >= 0) return true; }
    return false;
  }
  /* 'E' | 'D' | '' — '' nghĩa là ô này KHÔNG nói gì về hướng bán */
  function dirOfText(s){
    var t = _norm(s);
    if(t === ' ') return '';
    if(_hit(EXP, t)) return 'E';
    if(_hit(DOM, t)) return 'D';
    if(t === ' E ') return 'E';
    if(t === ' D ') return 'D';
    return '';
  }
  function isExportName(s){ return dirOfText(s) === 'E'; }

  /* nhãn ghi vào cột `trade` của TL Data — giữ nguyên định dạng cũ */
  function label(cust, contract){
    /* v4.67 — không nhận ASCII "thuan": trùng địa danh "Binh Thuan"/"Ninh Thuan" */
    var pure = /pure|thuần/i.test(String(contract || ''));
    return (isExportName(cust) ? 'Export' : 'Domestic') + (pure ? ' (Pure)' : '');
  }

  /* { dir, src, sure } cho MỘT DÒNG — dùng chung cho dòng kế hoạch lẫn TL */
  function dirOfRow(r){
    if(!r) return { dir:'D', src:'', sure:false };
    var tr = String(r.trade == null ? '' : r.trade).trim();
    if(tr) return { dir: (/^EXPORT/i.test(tr) ? 'E' : 'D'), src:'trade', sure:true };
    var name = (r.customer != null && String(r.customer).trim()) ? r.customer
             : ((r.custFull != null && String(r.custFull).trim()) ? r.custFull : r.cust);
    var d = dirOfText(name);
    if(d) return { dir:d, src:'customer', sure:true };
    d = dirOfText(r.type); if(d) return { dir:d, src:'type', sure:true };
    d = dirOfText(r.note); if(d) return { dir:d, src:'note', sure:true };
    d = dirOfText(r.dest); if(d) return { dir:d, src:'dest', sure:true };
    return { dir:'D', src:'default', sure:false };
  }

  return { dirOfText:dirOfText, dirOfRow:dirOfRow, isExportName:isExportName,
           label:label, EXP:EXP, DOM:DOM };
})();

/* ============================================================
 * TWAVG — tra khối lượng XE RỖNG trung bình (bảng Fleet ▸ TW AVG)
 * ------------------------------------------------------------
 * v4.127 — NGUỒN DUY NHẤT cho mọi chỗ cần TW AVG (thẻ trạm cân, phiếu PTT,
 * phiếu PTT sớm). Trước đây mỗi module tự dò một kiểu:
 *   · scale.js "GW AVG ref" đọc nhầm trường `plate` — bảng TW AVG lưu ở
 *     trường `truck` nên ô tham chiếu này LUÔN TRỐNG;
 *   · các chỗ còn lại chỉ khớp BIỂN ĐẦU XE, gặp dòng đầu tiên là lấy. Một
 *     đầu kéo đổi rơ-moóc thì khối lượng rỗng lệch tới hơn 2.500 kg
 *     (51M-68852: 20.690 kg với 51R-23389, 23.400 kg với 50RM-17285) ⇒ số
 *     tham chiếu sai gần 3 tấn tuỳ dòng nào nằm trước.
 * THỨ TỰ TRA: khớp ĐÚNG CẶP đầu xe + rơ-moóc → khớp đầu xe với dòng có
 * rơ-moóc trống → khớp đầu xe bất kỳ. Không có thì trả null.
 * ============================================================ */
window.TWAVG = (function(){
  'use strict';
  function key(v){ return String(v == null ? '' : v).toUpperCase().replace(/[^0-9A-Z]/g,''); }
  function rowsOf(){
    try{ return (typeof DATA !== 'undefined' && DATA.twavg) ? DATA.twavg : {}; }
    catch(_){ return {}; }
  }
  /* Trả về DÒNG khớp nhất, hoặc null. */
  function findRow(plate, rmooc){
    var pk = key(plate); if(!pk) return null;
    var rk = key(rmooc);
    var d = rowsOf(), rid, r, tk;
    var exact = null, blank = null, any = null;
    for(rid in d){
      r = d[rid]; if(!r) continue;
      tk = key(r.truck || r.plate);
      if(tk !== pk) continue;
      var mk = key(r.rmooc);
      if(rk && mk === rk){ exact = r; break; }
      if(!mk && !blank) blank = r;
      if(!any) any = r;
    }
    return exact || (rk ? (blank || any) : (blank || any));
  }
  /* Trả về số kg, hoặc null khi chưa có dữ liệu. */
  function find(plate, rmooc){
    var r = findRow(plate, rmooc);
    if(!r) return null;
    var n = parseFloat(r.avgWt);
    return (isFinite(n) && n > 0) ? n : null;
  }
  return { find:find, findRow:findRow, key:key };
})();
